/* Dashboard, Universal Calendar, Settings, Audit log.
   (Accounts are routes/users.js + sessions.js, from the portal.) */
const express = require('express');
const db = require('../db');
const roles = require('../middleware/roles');
const { log } = require('../middleware/audit');
const { CATEGORIES } = require('./poojas');
const { todayLocal, monthLocal } = require('../util/dates');
const { occurrencesIn } = require('../util/annual');

const router = express.Router();

/* ---------- Dashboard ---------- */
router.get('/dashboard', async (req, res) => {
  const today = todayLocal();
  const month = today.slice(0, 7);

  const one = (sql, ...p) => db.get(sql, ...p);
  const n = (sql, ...p) => one(sql, ...p).then((r) => r.n);

  /* Every figure below is independent, so they are read in parallel: on
     Turso each query is a network hop, and one after another the dashboard
     was ~30 hops (~1.5s) before it could draw. The SQL is unchanged. */
  const [devotees, sevarthi, received, coverage, receivedToday, receivedMonth, bhuvajiCovered,
         pending, pendingOnly, partial, registeredToday, donationsTotal, upcomingVisits] = await Promise.all([
    n(`SELECT COUNT(*) AS n FROM devotees`),
    n(`SELECT COUNT(*) AS n FROM sevarthi_bookings WHERE status <> 'cancelled'`),
    n(`SELECT IFNULL(SUM(amount),0) AS n FROM payments`),
    /* Per booking, then summed — never committed-minus-received across the
       whole Mahotsav. Netting globally lets one sevarthi's excess cancel
       another's shortfall, which under-reports what is still to collect. */
    one(`
    SELECT IFNULL(SUM(b.amount_committed), 0)                        AS committed,
           IFNULL(SUM(IFNULL(pd.paid, 0)), 0)                        AS covered,
           IFNULL(SUM(IFNULL(pd.devotee, 0)), 0)                     AS devotee_paid,
           IFNULL(SUM(IFNULL(pd.bappa, 0)), 0)                       AS bappa_paid,
           IFNULL(SUM(CASE WHEN b.amount_committed > IFNULL(pd.paid, 0)
                           THEN b.amount_committed - IFNULL(pd.paid, 0) ELSE 0 END), 0) AS outstanding,
           IFNULL(SUM(CASE WHEN IFNULL(pd.paid, 0) > b.amount_committed
                           THEN IFNULL(pd.paid, 0) - b.amount_committed ELSE 0 END), 0) AS excess,
           IFNULL(SUM(CASE WHEN IFNULL(pd.bappa, 0) > 0 THEN 1 ELSE 0 END), 0)          AS bappa_supported
      FROM sevarthi_bookings b
      LEFT JOIN (SELECT booking_id,
                        SUM(amount)                                                  AS paid,
                        SUM(CASE WHEN payer_type = 'bhuvaji' THEN amount ELSE 0 END) AS bappa,
                        SUM(CASE WHEN payer_type = 'bhuvaji' THEN 0 ELSE amount END) AS devotee
                   FROM payments GROUP BY booking_id) pd ON pd.booking_id = b.id
     WHERE b.status <> 'cancelled'
  `),
    n(`SELECT IFNULL(SUM(amount),0) AS n FROM payments WHERE payment_date = ?`, today),
    n(`SELECT IFNULL(SUM(amount),0) AS n FROM payments WHERE substr(payment_date,1,7) = ?`, month),
    n(`SELECT IFNULL(SUM(amount),0) AS n FROM payments WHERE payer_type='bhuvaji'`),
    n(`SELECT COUNT(*) AS n FROM sevarthi_bookings WHERE status IN ('pending','partially_paid')`),
    n(`SELECT COUNT(*) AS n FROM sevarthi_bookings WHERE status = 'pending'`),
    n(`SELECT COUNT(*) AS n FROM sevarthi_bookings WHERE status = 'partially_paid'`),
    n(`SELECT COUNT(*) AS n FROM sevarthi_bookings
      WHERE substr(created_at, 1, 10) = ? AND status <> 'cancelled'`, today),
    n(`SELECT IFNULL(SUM(amount),0) AS n FROM donations`),
    n(`SELECT COUNT(*) AS n FROM visits WHERE visit_date >= ? AND status <> 'cancelled'`, today),
  ]);
  const committed = coverage.committed;

  const categoryRow = async (c) => {
    const [r, money, got, cov] = await Promise.all([db.get(`
      SELECT IFNULL(SUM(ps.capacity),0) AS seats,
             IFNULL(SUM(ps.booked_count),0) AS booked,
             SUM(CASE WHEN ps.capacity IS NULL THEN 1 ELSE 0 END) AS open_days
        FROM pooja_slots ps JOIN pooja_events pe ON pe.id = ps.pooja_id
       WHERE pe.category = ?
    `, c.key), db.get(`
      SELECT IFNULL(SUM(pe.target_amount),0) AS target,
             SUM(CASE WHEN pe.capacity_mode = 'not_decided' THEN 1 ELSE 0 END) AS not_decided
        FROM pooja_events pe WHERE pe.category = ?
    `, c.key), db.get(`
      SELECT IFNULL(SUM(p.amount),0) AS n FROM payments p
        JOIN sevarthi_bookings b ON b.id = p.booking_id
        JOIN pooja_slots ps ON ps.id = b.slot_id
        JOIN pooja_events pe ON pe.id = ps.pooja_id
       WHERE pe.category = ?
    `, c.key).then((x) => x.n),
    /* Same per-booking coverage shape as the headline figures — the
       category rows must add up to them, so they are computed the
       same way rather than re-derived from the payments total. */
    db.get(`
      SELECT COUNT(*)                                                  AS registered,
             IFNULL(SUM(b.amount_committed), 0)                        AS committed,
             IFNULL(SUM(IFNULL(pd.paid, 0)), 0)                        AS covered,
             IFNULL(SUM(IFNULL(pd.bappa, 0)), 0)                       AS bappa_paid,
             IFNULL(SUM(CASE WHEN b.amount_committed > IFNULL(pd.paid, 0)
                             THEN b.amount_committed - IFNULL(pd.paid, 0) ELSE 0 END), 0) AS outstanding,
             IFNULL(SUM(CASE WHEN IFNULL(pd.paid, 0) > b.amount_committed
                             THEN IFNULL(pd.paid, 0) - b.amount_committed ELSE 0 END), 0) AS excess
        FROM sevarthi_bookings b
        JOIN pooja_slots  ps ON ps.id = b.slot_id
        JOIN pooja_events pe ON pe.id = ps.pooja_id
        LEFT JOIN (SELECT booking_id,
                          SUM(amount)                                                  AS paid,
                          SUM(CASE WHEN payer_type = 'bhuvaji' THEN amount ELSE 0 END) AS bappa
                     FROM payments GROUP BY booking_id) pd ON pd.booking_id = b.id
       WHERE pe.category = ? AND b.status <> 'cancelled'
    `, c.key)]);
    return {
      ...c,
      seats: r.open_days > 0 ? null : r.seats,
      booked: r.booked,
      seats_left: r.open_days > 0 ? null : Math.max(0, r.seats - r.booked),
      target: money.target,
      received: got,
      not_decided: money.not_decided,
      registered: cov.registered,
      committed: cov.committed,
      covered: cov.covered,
      bappa_paid: cov.bappa_paid,
      outstanding: cov.outstanding,
      excess: cov.excess,
    };
  };

  const [categories, todaySlots, recentActivity] = await Promise.all([
    Promise.all(Object.values(CATEGORIES).map(categoryRow)),
    db.all(`
    SELECT pe.name AS pooja_name, pe.category, ps.slot_date, ps.capacity, ps.booked_count
      FROM pooja_slots ps JOIN pooja_events pe ON pe.id = ps.pooja_id
     WHERE ps.slot_date = ? ORDER BY pe.name
  `, today),
    db.all(
    /* The daily work only — sign-ins and account changes carry people's
       email addresses and belong to Accounts & Access (admin-tier). */
    `SELECT * FROM audit_log WHERE entity NOT IN ('session', 'account', 'auth', 'access')
      ORDER BY id DESC LIMIT 12`),
  ]);

  res.json({
    today,
    stats: {
      devotees, sevarthi, committed, received, receivedToday, receivedMonth,
      bhuvajiCovered, pending, donationsTotal, upcomingVisits,
      /* Coverage figures are per-booking sums (see the query above), so
         `outstanding` here is genuinely what is left to collect. */
      covered: coverage.covered,
      devoteeCollected: coverage.devotee_paid,
      bappaSupport: coverage.bappa_paid,
      outstanding: coverage.outstanding,
      excess: coverage.excess,
      bappaSupported: coverage.bappa_supported,
      pendingOnly, partial, registeredToday,
    },
    categories,
    todaySlots,
    recentActivity,
  });
});

/* ---------- Universal Calendar ---------- */
router.get('/calendar', async (req, res) => {
  const month = req.query.month || monthLocal();
  const entries = [];

  /* The five reads are independent — fetched in parallel, then turned into
     entries in the same order as before (the final sort is stable). */
  const [perDay, whole, visits, donations, payments, annual] = await Promise.all([
    db.all(`
    SELECT ps.slot_date, ps.capacity, ps.booked_count, pe.name, pe.category, pe.id AS pooja_id
      FROM pooja_slots ps JOIN pooja_events pe ON pe.id = ps.pooja_id
     WHERE substr(ps.slot_date,1,7) = ? AND pe.seating_mode = 'per_day'
  `, month),
    db.all(`
    SELECT pe.id, pe.name, pe.category, pe.start_date, pe.end_date,
           (SELECT IFNULL(SUM(capacity),0) FROM pooja_slots WHERE pooja_id = pe.id)     AS capacity,
           (SELECT IFNULL(SUM(booked_count),0) FROM pooja_slots WHERE pooja_id = pe.id) AS booked,
           (SELECT COUNT(*) FROM pooja_slots WHERE pooja_id = pe.id AND capacity IS NULL) AS open_seat
      FROM pooja_events pe
     WHERE pe.seating_mode = 'whole' AND pe.start_date IS NOT NULL
       AND substr(pe.start_date,1,7) <= ? AND substr(pe.end_date,1,7) >= ?
  `, month, month),
    db.all(`SELECT * FROM visits WHERE substr(visit_date,1,7) = ?`, month),
    db.all(`
    SELECT dn.*, l.value AS category FROM donations dn
      LEFT JOIN lookups l ON l.id = dn.category_id
     WHERE substr(dn.donation_date,1,7) = ?
  `, month),
    db.all(`
    SELECT p.payment_date, COUNT(*) AS n, SUM(p.amount) AS total
      FROM payments p WHERE substr(p.payment_date,1,7) = ? GROUP BY p.payment_date
  `, month),
    occurrencesIn([Number(month.slice(0, 4))]),
  ]);

  /* per_day poojas put one entry on each day that has a slot. */
  perDay.forEach((r) => {
    entries.push({
      date: r.slot_date, type: 'pooja', category: r.category, ref_id: r.pooja_id,
      title: r.name,
      sub: r.capacity === null
        ? `${r.booked_count} sevarthi`
        : `${r.booked_count}/${r.capacity} patla booked`,
    });
  });

  /* A 'whole' pooja has a single pooled slot but runs across its whole
     date range, so it is drawn from the event's own dates. */
  whole.forEach((p) => {
    const d = new Date(p.start_date + 'T00:00:00');
    const last = new Date(p.end_date + 'T00:00:00');
    while (d <= last) {
      const iso = d.toLocaleDateString('en-CA');
      if (iso.slice(0, 7) === month) {
        entries.push({
          date: iso, type: 'pooja', category: p.category, ref_id: p.id,
          title: p.name,
          sub: p.open_seat ? `${p.booked} sevarthi` : `${p.booked}/${p.capacity} patla booked`,
        });
      }
      d.setDate(d.getDate() + 1);
    }
  });

  visits.forEach((v) => {
    entries.push({
      date: v.visit_date, type: 'visit', ref_id: v.id,
      title: `Padhramni — ${v.devotee_name}`,
      sub: [v.visit_time, v.city, v.status].filter(Boolean).join(' · '),
    });
  });

  donations.forEach((d) => {
    entries.push({
      date: d.donation_date, type: 'donation', ref_id: d.id,
      title: `Donation — ${d.donor_name}`,
      sub: (d.amount ? `₹${d.amount.toLocaleString('en-IN')}` : d.in_kind_item) +
           (d.category ? ` · ${d.category}` : ''),
    });
  });

  payments.forEach((p) => {
    entries.push({
      date: p.payment_date, type: 'payment',
      title: `${p.n} payment${p.n > 1 ? 's' : ''} received`,
      sub: `₹${Number(p.total).toLocaleString('en-IN')}`,
    });
  });

  /* Annual temple events — tithi dates resolved for this year (util/annual). */
  annual.filter((o) => o.date.slice(0, 7) === month).forEach((o) => {
    entries.push({
      date: o.date, type: 'annual', ref_id: o.id,
      title: o.name, title_gu: o.name_gu,
      sub: o.activity, sub_gu: o.activity_gu,
      source: o.source, year: o.year,
    });
  });

  entries.sort((a, b) => a.date.localeCompare(b.date));
  res.json({ month, entries });
});

/* ---------- Settings ---------- */
router.get('/settings', async (req, res) => {
  const rows = await db.all(`SELECT * FROM settings`);
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

router.put('/settings', roles.needs('admin', 'Changing the temple settings'), async (req, res) => {
  const entries = Object.entries(req.body || {});
  await db.tx(async () => {
    for (const [k, v] of entries) {
      await db.run(`INSERT INTO settings (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, String(v ?? ''));
    }
  });
  await log(req, { action: 'update', entity: 'settings', summary: `Updated settings (${entries.map(e => e[0]).join(', ')})` });
  res.json({ ok: true });
});

/* ---------- Audit log ---------- */
/* One record's change history (entity + entity_id — the ledger on every
   sevarthi row) is part of the daily job. The whole trail is the
   Accounts & Access page, which is admin-tier. */
router.get('/audit', async (req, res) => {
  const { entity, entity_id, user, limit } = req.query;
  if (!(entity && entity_id) && !roles.atLeast(req, 'admin')) {
    return res.status(403).json({ error: 'The full audit trail is kept for an administrator.' });
  }
  const where = [];
  const params = {};
  if (entity) { where.push(`entity = @entity`); params.entity = entity; }
  if (entity_id) { where.push(`entity_id = @entity_id`); params.entity_id = entity_id; }
  if (user) { where.push(`user_name LIKE @user`); params.user = `%${user}%`; }
  res.json(await db.all(
    `SELECT * FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY id DESC LIMIT ${Math.min(Number(limit) || 200, 1000)}`, params));
});

module.exports = router;
