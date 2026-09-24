/* Turning a request body into payment ledger rows.
   ------------------------------------------------------------
   Money reaches the ledger from two directions — `POST /api/payments`
   for a collection, and `POST /api/bookings` when the sevarthi pays at
   the counter as they register — and both accept the same two shapes:

     single: { amount, payer_type }
     split:  { devotee_amount, bhuvaji_amount }

   A split is always two rows, never one merged row, because
   `payer_type` lives on the row and the devotee and Bapa totals must
   stay separable. This lives here, rather than in either route, so the
   two can never drift on what a valid payment is.

   `insertPaymentRows` deliberately does NOT open its own transaction:
   the booking route has to write the seat, the capacity increment and
   the payment inside one, and wrapping again would nest. Callers wrap.
*/
const db = require('../db');
const { todayLocal, dayOf } = require('./dates');
const receipts = require('./receipts');
const { MAX } = require('./money');

/** @returns {{ entries: Array<{amount:number,payer_type:string}> }|{ error: string }} */
function readPaymentEntries(b) {
  if (!b) return { entries: [] };
  const isSplit = b.devotee_amount !== undefined || b.bhuvaji_amount !== undefined;

  if (!isSplit) {
    if (b.amount !== undefined && b.amount !== null && b.amount !== '' && !Number.isFinite(Number(b.amount))) {
      return { error: 'Enter the amount as a number' };          // "abc" must not vanish as "nothing offered"
    }
    const amount = Math.round(Number(b.amount || 0) * 100) / 100;
    if (!amount) return { entries: [] };          // nothing offered is not an error
    if (!(amount > 0)) return { error: 'Enter an amount greater than zero' };
    if (amount > MAX) return { error: 'That amount is larger than any seva — check it' };
    return { entries: [{ amount, payer_type: b.payer_type === 'bhuvaji' ? 'bhuvaji' : 'devotee' }] };
  }

  const bad = (v) => v !== undefined && v !== null && v !== '' && !Number.isFinite(Number(v));
  if (bad(b.devotee_amount) || bad(b.bhuvaji_amount)) return { error: 'Enter the amount as a number' };
  const fromDevotee = Math.round(Number(b.devotee_amount || 0) * 100) / 100;
  const fromBapa = Math.round(Number(b.bhuvaji_amount || 0) * 100) / 100;
  if (fromDevotee < 0 || fromBapa < 0) return { error: 'An amount cannot be negative' };
  if (fromDevotee > MAX || fromBapa > MAX) return { error: 'That amount is larger than any seva — check it' };
  if (!fromDevotee && !fromBapa) return { entries: [] };

  // A zero side is simply left out — never written as a ₹0 ledger row.
  const entries = [];
  if (fromDevotee > 0) entries.push({ amount: fromDevotee, payer_type: 'devotee' });
  if (fromBapa > 0) entries.push({ amount: fromBapa, payer_type: 'bhuvaji' });
  return { entries };
}

const INSERT = `
  INSERT INTO payments (booking_id, amount, payer_type, payment_date, receipt_no, notes, recorded_by)
  VALUES (@booking_id, @amount, @payer_type, @payment_date, @receipt_no, @notes, @recorded_by)`;

/** Write the rows. Call inside the caller's db.tx(). Resolves to the new ids. */
async function insertPaymentRows(bookingId, entries, b, recordedBy) {
  const date = dayOf(b && b.payment_date, 'Payment date', todayLocal());
  const supplied = ((b && b.receipt_no) || '').trim();
  const common = {
    booking_id: bookingId,
    payment_date: date,
    notes: ((b && b.notes) || '').trim() || null,
    recorded_by: recordedBy || 'Unknown',
  };
  /* A split is two rows and therefore two receipts: they are two
     separate entries in the ledger, each correctable on its own, and
     one number across both would leave the second uncorrectable on
     paper. A number typed by hand goes on the first row and the rest
     are issued, because that is the one the operator has in front of
     them. */
  const ids = [];
  for (const [i, e] of entries.entries()) {
    const info = await db.run(INSERT, {
      ...common, ...e,
      receipt_no: (i === 0 && supplied) ? supplied : await receipts.next('P', date),
    });
    ids.push(Number(info.lastInsertRowid));
  }
  return ids;
}

/** Who recorded it: the signed-in account (req.user), never a header. */
const actingUser = (req) => require('../middleware/audit').userOf(req);

module.exports = { readPaymentEntries, insertPaymentRows, actingUser };
