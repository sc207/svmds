/* Murti Pran Pratishtha Mahotsav — the three pooja categories, the
   poojas inside them, and the per-day seating (patla) slots. */
const express = require('express');
const db = require('../db');
const roles = require('../middleware/roles');
const { slotWhen } = require('../util/dates');
const { log } = require('../middleware/audit');

const router = express.Router();

/** A refusal thrown from inside db.tx() — rolls the transaction back and
    reaches the client as { error } with this status (middleware/error.js). */
const refuse = (status, message) => Object.assign(new Error(message), { status });

/* `icon` is a sprite id — the frontend renders it as
   <svg><use href="/assets/icons.svg#<icon>"></use></svg>. No emoji. */
const CATEGORIES = {
  maha_yagna:    { key: 'maha_yagna',    label: 'Maha Yagna',             icon: 'flame' },
  mandir_pooja:  { key: 'mandir_pooja',  label: 'Mandir ni Pooja',        icon: 'diya' },
  bhagvat_katha: { key: 'bhagvat_katha', label: 'Bhagvat Saptah — Katha', icon: 'book' },
};

/* Registration capacity. Only 'limited' puts a number on the slots and
   so only 'limited' can ever block a registration — see 002_phase1.sql. */
const CAPACITY_MODES = ['not_decided', 'limited', 'unlimited'];

/** Read the capacity mode off a request, tolerating older payloads that
    only knew the fixed_capacity boolean. */
function readCapacityMode(b, fallback) {
  const m = String(b.capacity_mode || '').trim();
  if (CAPACITY_MODES.includes(m)) return m;
  if (fallback) return fallback;
  return (b.fixed_capacity === false || b.fixed_capacity === 0) ? 'not_decided' : 'limited';
}

/* Live totals for poojas: seats, bookings and money — for MANY poojas in
   three grouped queries (run side by side), not two queries per pooja. On
   Turso every query is a network hop, and the seva list is ~35 poojas, so
   per-pooja stats were ~70 requests for one screen. A single pooja goes
   through the same code, so there is one way these figures are computed.

   Outstanding and excess are summed PER BOOKING, never netted across the
   pooja: one sevarthi giving extra does not settle another's shortfall,
   and a global subtraction would quietly hide both. `received` stays
   every rupee actually taken in (cancelled bookings included — that cash
   is in hand and its refund is settled by hand), while `covered` counts
   only what sits against a live booking. */
async function statsFor(poojaIds) {
  const ids = [...new Set(poojaIds.map(Number))];
  const out = new Map();
  if (!ids.length) return out;
  const IN = ids.map(() => '?').join(',');
  const [seats, money, received] = await Promise.all([
    db.all(`
      SELECT pooja_id,
             IFNULL(SUM(capacity), 0)     AS total_seats,
             IFNULL(SUM(booked_count), 0) AS booked_seats,
             SUM(CASE WHEN capacity IS NULL THEN 1 ELSE 0 END) AS open_days,
             COUNT(*) AS day_count
        FROM pooja_slots WHERE pooja_id IN (${IN}) GROUP BY pooja_id
    `, ...ids),
    db.all(`
      SELECT ps.pooja_id,
             IFNULL(SUM(b.amount_committed), 0)                        AS committed,
             IFNULL(SUM(IFNULL(pd.paid, 0)), 0)                        AS covered,
             IFNULL(SUM(IFNULL(pd.devotee, 0)), 0)                     AS devotee_paid,
             IFNULL(SUM(IFNULL(pd.bappa, 0)), 0)                       AS bappa_paid,
             IFNULL(SUM(CASE WHEN b.amount_committed > IFNULL(pd.paid, 0)
                             THEN b.amount_committed - IFNULL(pd.paid, 0) ELSE 0 END), 0) AS outstanding,
             IFNULL(SUM(CASE WHEN IFNULL(pd.paid, 0) > b.amount_committed
                             THEN IFNULL(pd.paid, 0) - b.amount_committed ELSE 0 END), 0) AS excess
        FROM sevarthi_bookings b
        JOIN pooja_slots ps ON ps.id = b.slot_id
        LEFT JOIN (SELECT booking_id,
                          SUM(amount)                                                  AS paid,
                          SUM(CASE WHEN payer_type = 'bhuvaji' THEN amount ELSE 0 END) AS bappa,
                          SUM(CASE WHEN payer_type = 'bhuvaji' THEN 0 ELSE amount END) AS devotee
                     FROM payments GROUP BY booking_id) pd ON pd.booking_id = b.id
       WHERE ps.pooja_id IN (${IN}) AND b.status <> 'cancelled'
       GROUP BY ps.pooja_id
    `, ...ids),
    db.all(`
      SELECT ps2.pooja_id, IFNULL(SUM(p.amount), 0) AS received
        FROM payments p
        JOIN sevarthi_bookings b2 ON b2.id = p.booking_id
        JOIN pooja_slots ps2 ON ps2.id = b2.slot_id
       WHERE ps2.pooja_id IN (${IN}) GROUP BY ps2.pooja_id
    `, ...ids),
  ]);
  const by = (rows) => new Map(rows.map((r) => [r.pooja_id, r]));
  const S = by(seats), M = by(money), R = by(received);
  const ZERO = { committed: 0, covered: 0, devotee_paid: 0, bappa_paid: 0, outstanding: 0, excess: 0 };
  for (const id of ids) {
    /* A pooja with no rows gets exactly what the ungrouped aggregates
       returned for it: SUM → 0 via IFNULL, the CASE sum → NULL, COUNT → 0. */
    const st = S.get(id) || { total_seats: 0, booked_seats: 0, open_days: null, day_count: 0 };
    const mo = M.get(id) || ZERO;
    const unlimited = st.open_days > 0;
    out.set(id, {
      total_seats: unlimited ? null : st.total_seats,
      booked_seats: st.booked_seats,
      seats_left: unlimited ? null : Math.max(0, st.total_seats - st.booked_seats),
      day_count: st.day_count,
      is_full: !unlimited && st.total_seats > 0 && st.booked_seats >= st.total_seats,
      committed: mo.committed,
      received: (R.get(id) || { received: 0 }).received,
      covered: mo.covered,
      devotee_paid: mo.devotee_paid,
      bappa_paid: mo.bappa_paid,
      outstanding: mo.outstanding,
      excess: mo.excess,
    });
  }
  return out;
}

/** Live totals for one pooja. */
async function poojaStats(poojaId) {
  return (await statsFor([poojaId])).get(Number(poojaId));
}

function decorate(row, stats) {
  const st = { ...stats };
  /* A 'whole' pooja has one pooled slot, so the slot count is not the
     number of days it runs — that comes from its own date range. */
  if (row.seating_mode === 'whole' && row.start_date && row.end_date) {
    st.day_count = datesBetween(row.start_date, row.end_date).length;
  }
  return { ...row, ...st, category_label: (CATEGORIES[row.category] || {}).label };
}

async function withStats(row) {
  return decorate(row, await poojaStats(row.id));
}

/** Many rows, one batched stats read. Order is kept. */
async function allWithStats(rows) {
  const stats = await statsFor(rows.map((r) => r.id));
  return rows.map((r) => decorate(r, stats.get(Number(r.id))));
}

/** Category-level progress bars for the Mahotsav landing screen. */
router.get('/categories', async (req, res) => {
  const everyPooja = await allWithStats(await db.all(`SELECT * FROM pooja_events ORDER BY id`));
  const out = Object.values(CATEGORIES).map((c) => {
    const poojas = everyPooja.filter((p) => p.category === c.key);
    const agg = poojas.reduce((a, p) => ({
      total_seats: p.total_seats === null ? a.total_seats : a.total_seats + p.total_seats,
      booked_seats: a.booked_seats + p.booked_seats,
      target: a.target + (p.target_amount || 0),
      received: a.received + p.received,
      committed: a.committed + p.committed,
      covered: a.covered + p.covered,
      devotee_paid: a.devotee_paid + p.devotee_paid,
      bappa_paid: a.bappa_paid + p.bappa_paid,
      outstanding: a.outstanding + p.outstanding,
      excess: a.excess + p.excess,
      unlimited: a.unlimited || p.total_seats === null,
    }), {
      total_seats: 0, booked_seats: 0, target: 0, received: 0, committed: 0,
      covered: 0, devotee_paid: 0, bappa_paid: 0, outstanding: 0, excess: 0, unlimited: false,
    });

    return {
      ...c,
      pooja_count: poojas.length,
      total_seats: agg.unlimited ? null : agg.total_seats,
      booked_seats: agg.booked_seats,
      seats_left: agg.unlimited ? null : Math.max(0, agg.total_seats - agg.booked_seats),
      target_amount: agg.target,
      committed: agg.committed,
      received: agg.received,
      covered: agg.covered,
      devotee_paid: agg.devotee_paid,
      bappa_paid: agg.bappa_paid,
      outstanding: agg.outstanding,
      excess: agg.excess,
      /* How many poojas in this category are still waiting on a decision —
         what lets the category card say "3 not decided" instead of
         implying the whole category is deliberately uncapped. */
      not_decided_count: poojas.filter((p) => p.capacity_mode === 'not_decided').length,
    };
  });
  res.json(out);
});

router.get('/', async (req, res) => {
  const { category } = req.query;
  const rows = category
    ? await db.all(`SELECT * FROM pooja_events WHERE category = ? ORDER BY start_date, name`, category)
    : await db.all(`SELECT * FROM pooja_events ORDER BY category, start_date, name`);
  res.json(await allWithStats(rows));
});

router.get('/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM pooja_events WHERE id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Pooja not found' });

  /* Slots, ledger and stats are independent reads — fetched side by side. */
  const [slotRows, ledger, full] = await Promise.all([
    db.all(`SELECT * FROM pooja_slots WHERE pooja_id = ? ORDER BY slot_date`, row.id),
    // FIFO ledger for this pooja — entries in the order they arrived.
    db.all(`
    SELECT b.id AS booking_id, b.status, b.amount_committed, b.bhuvaji_planned_amount,
           b.created_at, ps.slot_date, d.full_name, d.mobile, d.city,
           s.value AS samaj,
           (SELECT IFNULL(SUM(amount),0) FROM payments WHERE booking_id = b.id) AS amount_paid,
           (SELECT IFNULL(SUM(amount),0) FROM payments
             WHERE booking_id = b.id AND payer_type = 'bhuvaji')  AS bappa_paid,
           (SELECT IFNULL(SUM(amount),0) FROM payments
             WHERE booking_id = b.id AND payer_type <> 'bhuvaji') AS devotee_paid
      FROM sevarthi_bookings b
      JOIN pooja_slots ps ON ps.id = b.slot_id
      JOIN devotees   d  ON d.id  = b.devotee_id
      LEFT JOIN lookups s ON s.id = d.samaj_id
     WHERE ps.pooja_id = ?
     ORDER BY b.created_at ASC, b.id ASC
  `, row.id),
    withStats(row),
  ]);
  const slots = slotRows.map((s) => ({
    ...s,
    seats_left: s.capacity === null ? null : Math.max(0, s.capacity - s.booked_count),
    is_full: s.capacity !== null && s.booked_count >= s.capacity,
  }));

  res.json({ ...full, slots, ledger });
});

function datesBetween(start, end) {
  const out = [];
  const d = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (d <= last) {
    out.push(d.toLocaleDateString('en-CA'));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

router.post('/', roles.needs('admin', 'Adding a seva'), async (req, res) => {
  const b = req.body;
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Pooja name is required' });
  if (!CATEGORIES[b.category]) return res.status(400).json({ error: 'Pick a valid category' });

  /* Dates are optional. A pooja with no date still takes sevarthi — it
     gets one undated slot, and real day-slots are built once the trust
     fixes the date (PUT /poojas/:id/dates). */
  const dated = !!(b.start_date && b.end_date);
  if ((b.start_date && !b.end_date) || (!b.start_date && b.end_date)) {
    return res.status(400).json({ error: 'Give both a start and an end date, or leave both blank' });
  }
  if (dated && b.end_date < b.start_date) {
    return res.status(400).json({ error: 'End date cannot be before start date' });
  }

  /* Only a 'limited' pooja carries a number. The other two modes both
     leave capacity NULL — they differ in wording, not in behaviour. */
  const capacityMode = readCapacityMode(b);
  const seatsPerDay = capacityMode === 'limited' ? Number(b.seats_per_day || 0) : null;
  if (capacityMode === 'limited' && (!seatsPerDay || seatsPerDay < 1)) {
    return res.status(400).json({ error: 'Patla count is required when the seats are limited' });
  }
  const fixed = capacityMode === 'limited' ? 1 : 0;
  const mode = b.seating_mode === 'whole' ? 'whole' : 'per_day';

  const SLOT = `INSERT INTO pooja_slots (pooja_id, slot_date, capacity) VALUES (?, ?, ?)`;
  const id = await db.tx(async () => {
    const info = await db.run(`
      INSERT INTO pooja_events (category, name, description, seats_per_day, fixed_capacity,
                                capacity_mode, seating_mode, amount, target_amount,
                                start_date, end_date, coordinator_devotee_id)
      VALUES (@category, @name, @description, @seats_per_day, @fixed_capacity,
              @capacity_mode, @seating_mode, @amount, @target_amount,
              @start_date, @end_date, @coordinator_devotee_id)
    `, {
      category: b.category,
      name,
      description: (b.description || '').trim() || null,
      seats_per_day: seatsPerDay,
      fixed_capacity: fixed,
      capacity_mode: capacityMode,
      seating_mode: mode,
      amount: Number(b.amount || 0),
      target_amount: Number(b.target_amount || 0),
      start_date: dated ? b.start_date : null,
      end_date: dated ? b.end_date : null,
      coordinator_devotee_id: b.coordinator_devotee_id || null,
    });
    const poojaId = Number(info.lastInsertRowid);
    if (!dated) {
      await db.run(SLOT, poojaId, null, seatsPerDay);          // date to be announced
    } else if (mode === 'whole') {
      await db.run(SLOT, poojaId, b.start_date, seatsPerDay);  // one patla for the whole event
    } else {
      for (const date of datesBetween(b.start_date, b.end_date)) await db.run(SLOT, poojaId, date, seatsPerDay);
    }
    await log(req, {
      action: 'create', entity: 'pooja', entityId: poojaId,
      summary: `Created ${CATEGORIES[b.category].label}: ${name}` + (dated ? '' : ' (date not fixed yet)'),
      details: { name, category: b.category, seats_per_day: seatsPerDay, amount: b.amount, dated },
    });
    return poojaId;
  });
  res.status(201).json(await db.get(`SELECT * FROM pooja_events WHERE id = ?`, id));
});

/** Set the dates on a pooja that had none, or MOVE a pooja that is
    already dated — the trust changes its mind, and re-dating used to be
    impossible once a date existed.

    Days are re-dated BY POSITION: old day one becomes new day one, and
    so on. That is what "the event moved" means to the temple, and
    because bookings hang off the slot id (not the date) every sevarthi
    travels with their day automatically. An undated placeholder slot
    sorts first, so it becomes day one exactly as it did before.

    Shortening a range that still has people booked on the days being
    dropped is refused, naming those days, rather than silently
    stranding or deleting their bookings.

    The slot read and the booked check happen INSIDE the transaction, so
    a sevarthi booked a moment earlier on a day being dropped is seen. */
router.put('/:id/dates', roles.needs('admin', 'Changing a seva\'s dates'), async (req, res) => {
  const { start_date, end_date } = req.body;
  if (!start_date || !end_date) return res.status(400).json({ error: 'Give both a start and an end date' });
  if (end_date < start_date) return res.status(400).json({ error: 'End date cannot be before start date' });
  const dates = datesBetween(start_date, end_date);

  const p = await db.tx(async () => {
    const p = await db.get(`SELECT * FROM pooja_events WHERE id = ?`, req.params.id);
    if (!p) throw refuse(404, 'Pooja not found');
    const slotCapacity = p.capacity_mode === 'limited' ? p.seats_per_day : null;

    /* Undated placeholder first, then by date — the positional order the
       re-dating maps onto the new range. */
    const slots = await db.all(`
      SELECT * FROM pooja_slots WHERE pooja_id = ?
       ORDER BY (slot_date IS NULL) DESC, slot_date
    `, p.id);

    /* A 'whole' pooja pools everything into one slot, so it only ever
       needs the start date; per_day keeps one slot per calendar day. */
    const keep = p.seating_mode === 'whole' ? 1 : dates.length;

    const dropped = slots.slice(keep);
    const booked = dropped.filter((s) => s.booked_count > 0);
    if (booked.length) {
      throw refuse(409,
        `${booked.map((s) => s.slot_date || 'the undated day').join(', ')} still ` +
        `${booked.length === 1 ? 'has' : 'have'} sevarthi booked. Move or cancel them first, ` +
        `or keep the pooja long enough to include ${booked.length === 1 ? 'that day' : 'those days'}.`);
    }

    await db.run(`UPDATE pooja_events SET start_date=?, end_date=?, updated_at=datetime('now','+330 minutes')
                 WHERE id=?`, start_date, end_date, p.id);

    /* Clear the dates before reassigning them: shifting a range by a day
       would otherwise collide with UNIQUE (pooja_id, slot_date) halfway
       through. Several NULLs never conflict in a SQLite unique index. */
    for (const s of slots) await db.run(`UPDATE pooja_slots SET slot_date = NULL WHERE id = ?`, s.id);

    for (const s of dropped) await db.run(`DELETE FROM pooja_slots WHERE id = ?`, s.id);

    const kept = slots.slice(0, keep);
    for (let i = 0; i < kept.length; i++) {
      await db.run(`UPDATE pooja_slots SET slot_date = ? WHERE id = ?`, dates[i], kept[i].id);
    }

    // days the pooja gained
    for (let i = slots.length; i < keep; i++) {
      await db.run(`INSERT INTO pooja_slots (pooja_id, slot_date, capacity) VALUES (?, ?, ?)`,
        p.id, dates[i], slotCapacity);
    }
    return p;
  });

  const moved = p.start_date && p.start_date !== start_date;
  await log(req, {
    action: 'update', entity: 'pooja', entityId: p.id,
    summary: moved
      ? `Moved ${p.name} from ${p.start_date}–${p.end_date} to ${start_date}–${end_date}`
      : `Dates set for ${p.name}: ${start_date} to ${end_date}`,
    details: { from: { start: p.start_date, end: p.end_date }, to: { start: start_date, end: end_date } },
  });
  res.json(await withStats(await db.get(`SELECT * FROM pooja_events WHERE id = ?`, p.id)));
});

/** Clear the dates again — back to "not decided yet". Bookings survive:
    every slot is pooled back into the single undated placeholder, which
    is the state a pooja starts in before the trust fixes a day. */
router.put('/:id/dates/clear', roles.needs('admin', 'Clearing a seva\'s dates'), async (req, res) => {
  const p = await db.tx(async () => {
    const p = await db.get(`SELECT * FROM pooja_events WHERE id = ?`, req.params.id);
    if (!p) throw refuse(404, 'Pooja not found');

    const slots = await db.all(`SELECT * FROM pooja_slots WHERE pooja_id = ? ORDER BY slot_date`, p.id);
    const withBookings = slots.filter((s) => s.booked_count > 0);
    if (withBookings.length > 1) {
      throw refuse(409, 'Sevarthi are booked on more than one day, so those days cannot be merged back into ' +
                        'one undated slot. Move them onto a single day first.');
    }

    const keeper = withBookings[0] || slots[0];
    await db.run(`UPDATE pooja_events SET start_date=NULL, end_date=NULL,
                       updated_at=datetime('now','+330 minutes') WHERE id=?`, p.id);
    for (const s of slots) {
      if (s.id !== keeper.id) await db.run(`DELETE FROM pooja_slots WHERE id = ?`, s.id);
    }
    if (keeper) await db.run(`UPDATE pooja_slots SET slot_date = NULL WHERE id = ?`, keeper.id);
    return p;
  });

  await log(req, {
    action: 'update', entity: 'pooja', entityId: p.id,
    summary: `Dates cleared for ${p.name} — back to "date not decided"`,
  });
  res.json(await withStats(await db.get(`SELECT * FROM pooja_events WHERE id = ?`, p.id)));
});

/** Adjust one day's patla count (e.g. more mats arrived). Never below what is booked. */
router.put('/slots/:slotId', roles.needs('admin', 'Changing a day\'s seats'), async (req, res) => {
  const raw = req.body.capacity;
  const capacity = raw === null || raw === '' ? null : Number(raw);
  /* Checked against booked_count inside the transaction, so a booking
     that lands meanwhile cannot end up above the new capacity. */
  const slot = await db.tx(async () => {
    const slot = await db.get(`SELECT * FROM pooja_slots WHERE id = ?`, req.params.slotId);
    if (!slot) throw refuse(404, 'Slot not found');
    if (capacity !== null && capacity < slot.booked_count) {
      throw refuse(400, `${slot.booked_count} sevarthi already booked on this day — capacity cannot be lower than that.`);
    }
    await db.run(`UPDATE pooja_slots SET capacity = ? WHERE id = ?`, capacity, slot.id);
    return slot;
  });
  await log(req, {
    action: 'update', entity: 'pooja_slot', entityId: slot.id,
    summary: `Seats for ${slotWhen(slot.slot_date)} set to ${capacity === null ? 'unlimited' : capacity}`,
  });
  res.json(await db.get(`SELECT * FROM pooja_slots WHERE id = ?`, slot.id));
});

router.put('/:id', roles.needs('admin', 'Editing a seva'), async (req, res) => {
  const row = await db.get(`SELECT * FROM pooja_events WHERE id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Pooja not found' });
  const b = req.body;

  /* Registration capacity can be decided (or changed) long after the
     pooja was created — that is the normal path for a pooja opened
     while the trust was still thinking about it. Applying the mode
     rewrites every slot's capacity together with the event row, in one
     transaction, so the enforced number and the declared mode can never
     disagree. Lowering a limit below what is already booked is refused,
     exactly as PUT /slots/:slotId refuses it for a single day. */
  if (b.capacity_mode !== undefined) {
    const nextMode = readCapacityMode(b, null);
    if (!CAPACITY_MODES.includes(nextMode)) {
      return res.status(400).json({ error: 'Pick a valid registration capacity' });
    }
    let nextSeats = null;
    if (nextMode === 'limited') {
      nextSeats = Number(b.seats_per_day ?? row.seats_per_day ?? 0);
      if (!nextSeats || nextSeats < 1) {
        return res.status(400).json({ error: 'Enter the maximum number of registrations' });
      }
    }
    /* Only touch the slots when the capacity decision itself changed.
       The edit form posts the current mode back on every save, and a
       blind rewrite would flatten a single day's hand-adjusted patla
       count (PUT /slots/:slotId) just because someone fixed a typo in
       the pooja's name. */
    const changed = nextMode !== row.capacity_mode ||
                    (nextMode === 'limited' && nextSeats !== row.seats_per_day);
    if (changed) {
      /* The peak is re-read inside the transaction so a booking made a
         moment ago is counted before the limit is lowered. */
      await db.tx(async () => {
        if (nextMode === 'limited') {
          const peak = (await db.get(
            `SELECT IFNULL(MAX(booked_count), 0) AS n FROM pooja_slots WHERE pooja_id = ?`, row.id)).n;
          if (nextSeats < peak) {
            throw refuse(400, `${peak} sevarthi are already booked — the limit cannot be lower than that.`);
          }
        }
        await db.run(`UPDATE pooja_events SET capacity_mode=?, fixed_capacity=?, seats_per_day=?,
                           updated_at=datetime('now','+330 minutes') WHERE id=?`,
          nextMode, nextMode === 'limited' ? 1 : 0, nextSeats, row.id);
        await db.run(`UPDATE pooja_slots SET capacity = ? WHERE pooja_id = ?`, nextSeats, row.id);
      });
      await log(req, {
        action: 'update', entity: 'pooja', entityId: row.id,
        summary: `Registration capacity for ${row.name} set to ` +
          (nextMode === 'limited' ? `${nextSeats}` : nextMode === 'unlimited' ? 'unlimited' : 'not decided yet'),
        details: { from: row.capacity_mode, to: nextMode, seats_per_day: nextSeats },
      });
    }
  }

  /* Seating mode rebuilds the slots themselves — one pooled patla for
     the whole event, or one row per day — so it is only safe while
     nobody is seated. With bookings in place the operator is told to
     move them first rather than having the app guess which day each
     sevarthi belongs on. */
  if (req.body.seating_mode && req.body.seating_mode !== row.seating_mode) {
    const nextSeating = req.body.seating_mode === 'whole' ? 'whole' : 'per_day';
    const SLOT = `INSERT INTO pooja_slots (pooja_id, slot_date, capacity) VALUES (?, ?, ?)`;
    await db.tx(async () => {
      /* Re-read inside the transaction: the slots are about to be deleted,
         so a booking landing between check and rebuild would be orphaned. */
      const cur = await db.get(`SELECT * FROM pooja_events WHERE id = ?`, row.id);
      const seated = (await db.get(
        `SELECT IFNULL(SUM(booked_count), 0) AS n FROM pooja_slots WHERE pooja_id = ?`, row.id)).n;
      if (seated > 0) {
        throw refuse(409, `${seated} sevarthi are already seated, so the seating style cannot be changed. ` +
                          'Move or cancel them first.');
      }
      const capacity = cur.capacity_mode === 'limited' ? cur.seats_per_day : null;
      await db.run(`UPDATE pooja_events SET seating_mode=?, updated_at=datetime('now','+330 minutes')
                   WHERE id=?`, nextSeating, row.id);
      await db.run(`DELETE FROM pooja_slots WHERE pooja_id = ?`, row.id);
      if (!cur.start_date) await db.run(SLOT, row.id, null, capacity);
      else if (nextSeating === 'whole') await db.run(SLOT, row.id, cur.start_date, capacity);
      else for (const d of datesBetween(cur.start_date, cur.end_date)) await db.run(SLOT, row.id, d, capacity);
    });
    await log(req, {
      action: 'update', entity: 'pooja', entityId: row.id,
      summary: `${row.name} seating changed to ${nextSeating === 'whole' ? 'one patla for the whole event' : 'per day'}`,
    });
  }

  await db.run(`
    UPDATE pooja_events SET name=@name, description=@description, amount=@amount,
           target_amount=@target_amount, status=@status, coordinator_devotee_id=@coordinator_devotee_id,
           updated_at=datetime('now','+330 minutes')
     WHERE id=@id
  `, {
    id: row.id,
    name: String(b.name || row.name).trim(),
    description: (b.description ?? row.description) || null,
    amount: Number(b.amount ?? row.amount),
    target_amount: Number(b.target_amount ?? row.target_amount),
    status: b.status || row.status,
    coordinator_devotee_id: b.coordinator_devotee_id ?? row.coordinator_devotee_id,
  });
  await log(req, { action: 'update', entity: 'pooja', entityId: row.id, summary: `Updated pooja ${row.name}` });
  res.json(await withStats(await db.get(`SELECT * FROM pooja_events WHERE id = ?`, row.id)));
});

/** Remove a pooja added by mistake. Only while nothing is booked
    against it — a seva with sevarthi on it is history, not a typo, and
    deleting it would take their payments with it. Close it instead. */
router.delete('/:id', roles.needs('admin', 'Deleting a seva'), async (req, res) => {
  /* The booking count is read inside the transaction that deletes, so a
     sevarthi booked a moment ago can never be deleted along with it.
     Slots are deleted explicitly — no reliance on ON DELETE CASCADE. */
  const row = await db.tx(async () => {
    const row = await db.get(`SELECT * FROM pooja_events WHERE id = ?`, req.params.id);
    if (!row) throw refuse(404, 'Pooja not found');

    const bookings = (await db.get(`
      SELECT COUNT(*) AS n FROM sevarthi_bookings b
        JOIN pooja_slots ps ON ps.id = b.slot_id WHERE ps.pooja_id = ?
    `, row.id)).n;
    if (bookings > 0) {
      throw refuse(409, `${bookings} sevarthi ${bookings === 1 ? 'is' : 'are'} recorded against this seva, so it ` +
                        'cannot be deleted. Close it instead — it stops taking new sevarthi and keeps the history.');
    }
    await db.run(`DELETE FROM pooja_slots WHERE pooja_id = ?`, row.id);
    await db.run(`DELETE FROM pooja_events WHERE id = ?`, row.id);
    return row;
  });
  await log(req, {
    action: 'delete', entity: 'pooja', entityId: row.id,
    summary: `Deleted ${CATEGORIES[row.category] ? CATEGORIES[row.category].label : 'pooja'}: ${row.name}`,
    details: row,
  });
  res.json({ ok: true });
});

module.exports = { router, CATEGORIES, poojaStats, withStats };
