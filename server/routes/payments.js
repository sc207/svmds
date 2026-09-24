/* Payment Received — the money ledger.

   Payments are append-only. A booking's paid total is always the sum of
   its payment rows, so "pending → paid" is derived, never hand-set.
   Money given back is a row of its own (kind 'refund', negative amount,
   R- receipt — see util/refunds.js), so that sum is always the net. */
const express = require('express');
const db = require('../db');
const roles = require('../middleware/roles');
const { log } = require('../middleware/audit');
const { refreshStatus } = require('./bookings');
const { todayLocal, monthLocal, slotWhen } = require('../util/dates');
const { readPaymentEntries, insertPaymentRows, actingUser } = require('../util/payment-entries');
const receipts = require('../util/receipts');
const { refundable, assertNotOverRefunded } = require('../util/refunds');

const router = express.Router();

const PAYMENT_SELECT = `
  SELECT p.*, b.amount_committed, b.status AS booking_status,
         d.full_name, d.mobile, d.city, s.value AS samaj, c.value AS devotee_category,
         pe.name AS pooja_name, pe.category, ps.slot_date
    FROM payments p
    JOIN sevarthi_bookings b ON b.id = p.booking_id
    JOIN pooja_slots  ps ON ps.id = b.slot_id
    JOIN pooja_events pe ON pe.id = ps.pooja_id
    JOIN devotees     d  ON d.id  = b.devotee_id
    LEFT JOIN lookups s ON s.id = d.samaj_id
    LEFT JOIN lookups c ON c.id = d.category_id
`;

/* Filters: ?date=YYYY-MM-DD (day view) | ?month=YYYY-MM | ?from=&to= | ?search= */
router.get('/', async (req, res) => {
  const { date, month, from, to, search, payer_type } = req.query;
  const where = [];
  const params = {};
  if (date) { where.push(`p.payment_date = @date`); params.date = date; }
  if (month) { where.push(`substr(p.payment_date, 1, 7) = @month`); params.month = month; }
  if (from) { where.push(`p.payment_date >= @from`); params.from = from; }
  if (to) { where.push(`p.payment_date <= @to`); params.to = to; }
  if (payer_type) { where.push(`p.payer_type = @payer_type`); params.payer_type = payer_type; }
  if (search) {
    where.push(`(d.full_name LIKE @q OR d.mobile LIKE @q OR s.value LIKE @q OR c.value LIKE @q
                 OR pe.name LIKE @q OR p.receipt_no LIKE @q)`);
    params.q = `%${String(search).trim()}%`;
  }
  const sql = PAYMENT_SELECT + (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC LIMIT 1000`;
  const rows = await db.all(sql, params);

  const totals = rows.reduce((a, r) => {
    a.total += r.amount;
    if (r.payer_type === 'bhuvaji') a.bhuvaji += r.amount; else a.devotee += r.amount;
    return a;
  }, { total: 0, devotee: 0, bhuvaji: 0, count: rows.length });

  res.json({ payments: rows, totals });
});

/** Day-by-day roll-up for the Payment Received screen. */
router.get('/by-day', async (req, res) => {
  const month = req.query.month || monthLocal();
  res.json(await db.all(`
    SELECT payment_date,
           COUNT(*) AS entries,
           IFNULL(SUM(amount), 0) AS total,
           IFNULL(-SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END), 0) AS refunded,
           IFNULL(SUM(CASE WHEN payer_type='bhuvaji' THEN amount ELSE 0 END), 0) AS bhuvaji_total
      FROM payments
     WHERE substr(payment_date, 1, 7) = ?
     GROUP BY payment_date
     ORDER BY payment_date DESC
  `, month));
});

/** Sevarthi with money still outstanding — what the Payment screen searches. */
router.get('/outstanding', async (req, res) => {
  const search = String(req.query.search || '').trim();
  const params = {};
  let filter = '';
  if (search) {
    filter = ` AND (d.full_name LIKE @q OR d.mobile LIKE @q OR s.value LIKE @q
                    OR c.value LIKE @q OR pe.name LIKE @q)`;
    params.q = `%${search}%`;
  }
  res.json(await db.all(`
    SELECT b.id AS booking_id, b.amount_committed, b.bhuvaji_planned_amount, b.status,
           d.id AS devotee_id, d.full_name, d.mobile, d.city,
           s.value AS samaj, c.value AS devotee_category,
           pe.name AS pooja_name, pe.category, ps.slot_date,
           (SELECT IFNULL(SUM(amount),0) FROM payments WHERE booking_id = b.id) AS amount_paid,
           (SELECT IFNULL(SUM(amount),0) FROM payments
             WHERE booking_id = b.id AND payer_type = 'bhuvaji')  AS bappa_paid,
           (SELECT IFNULL(SUM(amount),0) FROM payments
             WHERE booking_id = b.id AND payer_type <> 'bhuvaji') AS devotee_paid
      FROM sevarthi_bookings b
      JOIN pooja_slots  ps ON ps.id = b.slot_id
      JOIN pooja_events pe ON pe.id = ps.pooja_id
      JOIN devotees     d  ON d.id  = b.devotee_id
      LEFT JOIN lookups s ON s.id = d.samaj_id
      LEFT JOIN lookups c ON c.id = d.category_id
     WHERE b.status IN ('pending','partially_paid') ${filter}
     ORDER BY b.created_at ASC, b.id ASC
     LIMIT 200
  `, params));
});

/** Record cash against a booking.
 *
 *  One handover at the counter is often split — the sevarthi pays part
 *  and Bapa covers the rest — and that is two ledger rows, because
 *  `payer_type` lives on the row and the two totals must never be
 *  merged. Sending them as two requests left the booking half-recorded
 *  when the second failed, so both forms are accepted here and written
 *  inside one transaction:
 *
 *    single: { amount, payer_type }
 *    split:  { devotee_amount, bhuvaji_amount }
 *
 *  Each row stays separately correctable through PUT /payments/:id, and
 *  each is audited on its own, so the trail reads the same whether the
 *  money arrived in one visit or two.
 */
router.post('/', async (req, res) => {
  const b = req.body;
  const parsed = readPaymentEntries(b);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const entries = parsed.entries;

  /* Both rows land or neither does — a split that wrote only the
     devotee's half would understate what the trust actually holds.
     The booking is read INSIDE the tx, so a cancel or a gift flag that
     lands a moment earlier is seen, not raced. */
  let booking;
  let ids;
  let updated;
  try {
    ({ booking, ids, updated } = await db.tx(async () => {
      const bk = await db.get(`SELECT * FROM sevarthi_bookings WHERE id = ?`, b.booking_id);
      if (!bk) throw Object.assign(new Error('Booking not found'), { status: 404 });
      if (bk.status === 'cancelled') throw Object.assign(new Error('This booking is cancelled'), { status: 400 });
      if (!entries.length) {
        throw Object.assign(new Error('Enter an amount for the devotee, for Bapa, or both'), { status: 400 });
      }
      /* A gift from Bapa is the whole seva, so nothing is ever collected
         from the sevarthi against it. This is the check that actually
         holds the promise: the booking routes can refuse to *flag* a gift
         over money already taken, but without this one the money could
         simply arrive afterwards and the flag would be a lie. Named here
         rather than silently converting the payer, because which of the
         two the operator meant is not ours to guess. */
      if (bk.is_gift && entries.some((e) => e.payer_type === 'devotee')) {
        throw Object.assign(new Error(
          'This seva is a gift from Bhuvaji Suresh Bapa, so nothing is collected from the sevarthi. ' +
          "Record it as Bapa's, or clear the gift on Edit Sevarthi first."), { status: 400 });
      }
      const newIds = await insertPaymentRows(bk.id, entries, b, actingUser(req));
      return { booking: bk, ids: newIds, updated: await refreshStatus(bk.id) };
    }));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const rows = [];
  for (const id of ids) rows.push(await db.get(PAYMENT_SELECT + ` WHERE p.id = ?`, id));

  for (const row of rows) {
    await log(req, {
      action: 'payment', entity: 'payment', entityId: row.id,
      summary: `₹${row.amount} cash received from ` +
               `${row.payer_type === 'bhuvaji' ? 'Bapa (on behalf of ' + row.full_name + ')' : row.full_name}` +
               `${rows.length > 1 ? ' [split payment]' : ''}` +
               ` — ${row.pooja_name} ${slotWhen(row.slot_date)} [${updated.status}]`,
      details: { amount: row.amount, payer_type: row.payer_type, booking_id: booking.id,
                 split: rows.length > 1 },
    });
  }

  // `payment` is kept for callers that expect a single row.
  res.status(201).json({ payment: rows[0], payments: rows, booking_status: updated.status });
});

/** Correct a payment entry. The ledger is append-only in spirit — the
    booking's total is always the sum of its rows and is never hand-set
    — but an operator who typed 1000 for 10000, or picked yesterday by
    mistake, has to be able to fix it. Every change is audited with the
    before/after, and the booking status is recomputed from the ledger
    afterwards exactly as it is for a new payment. */
/** Give money back from a booking.
 *  { booking_id, amount, refund_to: 'devotee' | 'bhuvaji', refund_date?, reason? }
 *
 *  Offered wherever money received ends up above what is owed — Change
 *  Seva to a cheaper one, a lowered contribution, a cancellation — as the
 *  other answer to "keep it as excess". Capped (inside the transaction) at
 *  the excess on a live booking, everything held on a cancelled one, and
 *  what that payer has put in. Recording one is part of the counter job,
 *  like taking a payment; removing one is kept for the accountant, like
 *  removing a payment. */
router.post('/refund', async (req, res) => {
  const b = req.body || {};
  const amount = Math.round(Number(b.amount || 0) * 100) / 100;
  const to = b.refund_to === 'bhuvaji' ? 'bhuvaji' : 'devotee';
  const date = b.refund_date || todayLocal();
  if (!(amount > 0)) return res.status(400).json({ error: 'Enter the amount being given back' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Give the refund date as YYYY-MM-DD' });

  let out;
  try {
    out = await db.tx(async () => {
      const bk = await db.get(`SELECT * FROM sevarthi_bookings WHERE id = ?`, b.booking_id);
      if (!bk) throw Object.assign(new Error('Booking not found'), { status: 404 });
      const r = await refundable(bk);
      const cap = to === 'bhuvaji' ? r.bhuvaji : r.devotee;
      if (r.total <= 0) {
        throw Object.assign(new Error(bk.status === 'cancelled'
          ? 'Nothing is held on this booking to give back.'
          : 'Nothing has been received above the contribution, so there is nothing to give back. ' +
            'Lower the contribution or change the seva first if that is what changed.'), { status: 400 });
      }
      if (amount > cap) {
        throw Object.assign(new Error(`At most ₹${cap.toLocaleString('en-IN')} can be given back to ` +
          `${to === 'bhuvaji' ? 'Bapa' : 'the sevarthi'} — ` +
          (bk.status === 'cancelled' ? 'that is what they have paid in.' : 'that is the excess over the contribution.')),
          { status: 400 });
      }
      const receipt = await receipts.next('R', date);
      const info = await db.run(`
        INSERT INTO payments (booking_id, amount, payer_type, payment_date, receipt_no, notes, recorded_by, kind)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'refund')`,
        bk.id, -amount, to, date, receipt, String(b.reason || '').trim() || null, actingUser(req));
      const updated = await refreshStatus(bk.id);
      return { id: Number(info.lastInsertRowid), receipt, updated };
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  const row = await db.get(PAYMENT_SELECT + ` WHERE p.id = ?`, out.id);
  await log(req, {
    action: 'refund', entity: 'booking', entityId: row.booking_id,
    summary: `₹${amount} given back to ${to === 'bhuvaji' ? 'Bapa' : row.full_name} — ${row.pooja_name} ` +
             `(${out.receipt})` + (row.notes ? ` — ${row.notes}` : ''),
    details: { payment_id: out.id, amount, refund_to: to, refund_date: date, receipt_no: out.receipt },
  });
  res.status(201).json({ refund: row, booking_status: out.updated ? out.updated.status : null });
});

router.put('/:id', roles.needs('accountant', 'Correcting a payment'), async (req, res) => {
  const p = await db.get(`SELECT * FROM payments WHERE id = ?`, req.params.id);
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  if (p.kind === 'refund') {
    return res.status(400).json({ error: 'A refund is not corrected in place — remove it and record the right one.' });
  }
  const b = req.body;

  const amount = Number(b.amount ?? p.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'Enter an amount greater than zero' });

  /* The same gift rule as a new payment, and it has to be here too: a
     correction can change who paid, and re-labelling Bapa's money as
     the sevarthi's is the other way a gift could quietly stop being
     one. */
  const payerNow = (b.payer_type ?? p.payer_type) === 'bhuvaji' ? 'bhuvaji' : 'devotee';
  let updated;
  try {
    updated = await db.tx(async () => {
      const onBooking = await db.get(`SELECT is_gift FROM sevarthi_bookings WHERE id = ?`, p.booking_id);
      if (onBooking && onBooking.is_gift && payerNow === 'devotee') {
        throw Object.assign(new Error(
          'This seva is a gift from Bhuvaji Suresh Bapa, so nothing is collected from the sevarthi. ' +
          "Leave this entry as Bapa's, or clear the gift on Edit Sevarthi first."), { status: 400 });
      }
      await db.run(`
        UPDATE payments SET amount=@amount, payer_type=@payer_type, payment_date=@payment_date,
               receipt_no=@receipt_no, notes=@notes
         WHERE id=@id
      `, {
        id: p.id,
        amount,
        payer_type: payerNow,
        payment_date: b.payment_date || p.payment_date,
        receipt_no: ((b.receipt_no ?? p.receipt_no) || '').trim() || null,
        notes: ((b.notes ?? p.notes) || '').trim() || null,
      });
      await assertNotOverRefunded(p.booking_id);
      return refreshStatus(p.booking_id);
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const row = await db.get(PAYMENT_SELECT + ` WHERE p.id = ?`, p.id);
  await log(req, {
    action: 'update', entity: 'payment', entityId: p.id,
    summary: `Corrected payment for ${row.full_name}` +
             (p.amount !== amount ? ` (₹${p.amount} → ₹${amount})` : '') +
             ` [${updated ? updated.status : 'cancelled'}]`,
    details: { before: p, after: row },
  });
  res.json({ payment: row, booking_status: updated ? updated.status : null });
});

router.delete('/:id', roles.needs('accountant', 'Removing a payment'), async (req, res) => {
  const p = await db.get(`SELECT * FROM payments WHERE id = ?`, req.params.id);
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  const isRefund = p.kind === 'refund';
  let updated;
  try {
    updated = await db.tx(async () => {
      await db.run(`DELETE FROM payments WHERE id = ?`, p.id);
      await assertNotOverRefunded(p.booking_id);
      return refreshStatus(p.booking_id);
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  await log(req, {
    action: 'delete', entity: 'payment', entityId: p.id,
    summary: isRefund
      ? `Removed refund entry of ₹${-p.amount} (${p.receipt_no || 'no receipt'}, booking #${p.booking_id}) — now ${updated.status}`
      : `Removed payment entry of ₹${p.amount} (booking #${p.booking_id}) — now ${updated.status}`,
    details: p,
  });
  res.json({ ok: true, booking_status: updated.status });
});

module.exports = router;
