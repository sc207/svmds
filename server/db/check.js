/* Database integrity check — READ-ONLY. Never writes, never repairs.

     node server/db/check.js              the database config points at
     TEMPLE_DB=<path> node server/db/check.js

   Reports every rule the app depends on (CLAUDE.md), each as a count of rows
   that break it with a few examples. Exit code 0 = all hold, 1 = something
   is wrong (a bug to trace to the route that wrote it), 2 = could not run.
   Safe against production: every statement is a SELECT. Money is compared
   in whole paise, so float noise (0.1 + 0.2) is not reported as drift. */
const fs = require('fs');
const path = require('path');
const db = require('./index');

const P = (col) => `CAST(ROUND(${col} * 100) AS INTEGER)`;       // rupees → paise
const checks = [];
const check = (group, name, sql, ...args) => checks.push({ group, name, sql, args, level: 'error' });
const warn = (group, name, sql, ...args) => checks.push({ group, name, sql, args, level: 'warn' });

/* ---------------- seats ---------------- */
check('seats', 'booked_count equals the live bookings on each slot', `
  SELECT ps.id, ps.pooja_id, ps.slot_date, ps.booked_count,
         (SELECT COUNT(*) FROM sevarthi_bookings b WHERE b.slot_id = ps.id AND b.status <> 'cancelled') AS live
    FROM pooja_slots ps
   WHERE ps.booked_count <> (SELECT COUNT(*) FROM sevarthi_bookings b WHERE b.slot_id = ps.id AND b.status <> 'cancelled')`);
check('seats', 'no slot is over its capacity', `
  SELECT id, pooja_id, slot_date, capacity, booked_count FROM pooja_slots
   WHERE capacity IS NOT NULL AND booked_count > capacity`);
check('seats', "capacity_mode 'limited' ⇔ fixed_capacity = 1 AND seats_per_day set", `
  SELECT id, name, capacity_mode, fixed_capacity, seats_per_day FROM pooja_events
   WHERE (capacity_mode = 'limited') <> (fixed_capacity = 1 AND seats_per_day IS NOT NULL)`);
check('seats', 'only a limited pooja puts a number on its slots', `
  SELECT pe.id, pe.name, pe.capacity_mode, ps.id AS slot_id, ps.capacity FROM pooja_slots ps
    JOIN pooja_events pe ON pe.id = ps.pooja_id
   WHERE (pe.capacity_mode = 'limited') <> (ps.capacity IS NOT NULL)`);
check('seats', "capacity_mode / seating_mode / status are known values", `
  SELECT id, name, capacity_mode, seating_mode, status FROM pooja_events
   WHERE capacity_mode NOT IN ('not_decided','limited','unlimited')
      OR seating_mode NOT IN ('per_day','whole') OR status NOT IN ('open','closed')`);
check('seats', 'dates: both set or both blank, start ≤ end', `
  SELECT id, name, start_date, end_date FROM pooja_events
   WHERE (start_date IS NULL) <> (end_date IS NULL) OR start_date > end_date`);
check('seats', "a 'whole' pooja has exactly one (pooled) slot", `
  SELECT pe.id, pe.name, COUNT(ps.id) AS slots FROM pooja_events pe
    LEFT JOIN pooja_slots ps ON ps.pooja_id = pe.id
   WHERE pe.seating_mode = 'whole' GROUP BY pe.id HAVING COUNT(ps.id) <> 1`);
check('seats', 'an undated pooja has exactly one undated slot', `
  SELECT pe.id, pe.name, COUNT(ps.id) AS slots, SUM(ps.slot_date IS NOT NULL) AS dated FROM pooja_events pe
    LEFT JOIN pooja_slots ps ON ps.pooja_id = pe.id
   WHERE pe.start_date IS NULL GROUP BY pe.id HAVING COUNT(ps.id) <> 1 OR SUM(ps.slot_date IS NOT NULL) > 0`);
check('seats', "a dated per-day pooja has one slot per day, all inside its range", `
  SELECT pe.id, pe.name, pe.start_date, pe.end_date, COUNT(ps.id) AS slots,
         CAST(julianday(pe.end_date) - julianday(pe.start_date) AS INTEGER) + 1 AS days,
         SUM(ps.slot_date IS NULL OR ps.slot_date < pe.start_date OR ps.slot_date > pe.end_date) AS outside
    FROM pooja_events pe LEFT JOIN pooja_slots ps ON ps.pooja_id = pe.id
   WHERE pe.seating_mode = 'per_day' AND pe.start_date IS NOT NULL
   GROUP BY pe.id
  HAVING COUNT(ps.id) <> CAST(julianday(pe.end_date) - julianday(pe.start_date) AS INTEGER) + 1 OR outside > 0`);

/* ---------------- money ---------------- */
const NET = (payer) => `(SELECT IFNULL(SUM(${P('p.amount')}), 0) FROM payments p WHERE p.booking_id = b.id${payer ? ` AND p.payer_type = '${payer}'` : ''})`;
check('money', 'booking status is what the ledger says (paise-exact)', `
  SELECT b.id, b.status, b.amount_committed, ${NET()} / 100.0 AS paid FROM sevarthi_bookings b
   WHERE b.status <> 'cancelled' AND b.status <> CASE
           WHEN ${NET()} <= 0 THEN 'pending'
           WHEN ${NET()} < ${P('b.amount_committed')} THEN 'partially_paid'
           ELSE 'paid' END`);
check('money', "booking status is a known value; cancelled rows have cancelled_at", `
  SELECT id, status, cancelled_at FROM sevarthi_bookings
   WHERE status NOT IN ('pending','partially_paid','paid','cancelled') OR (status = 'cancelled' AND cancelled_at IS NULL)`);
check('money', "gift ⇒ Bapa's planned share = the whole contribution", `
  SELECT id, amount_committed, bhuvaji_planned_amount FROM sevarthi_bookings
   WHERE is_gift = 1 AND ${P('IFNULL(bhuvaji_planned_amount,0)')} <> ${P('amount_committed')}`);
check('money', 'gift ⇒ no payment from the sevarthi', `
  SELECT b.id FROM sevarthi_bookings b WHERE b.is_gift = 1 AND EXISTS
    (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.payer_type = 'devotee' AND p.kind = 'payment')`);
check('money', "Bapa's planned share never exceeds the contribution; nothing negative", `
  SELECT id, amount_committed, bhuvaji_planned_amount FROM sevarthi_bookings
   WHERE bhuvaji_planned_amount > amount_committed OR amount_committed < 0 OR bhuvaji_planned_amount < 0`);
check('money', "a payment is positive, a refund negative", `
  SELECT id, booking_id, kind, amount FROM payments
   WHERE (kind = 'payment' AND amount <= 0) OR (kind = 'refund' AND amount >= 0) OR kind NOT IN ('payment','refund')`);
check('money', 'no payer is refunded more than they paid', `
  SELECT b.id, ${NET('devotee')} / 100.0 AS devotee_net, ${NET('bhuvaji')} / 100.0 AS bapa_net FROM sevarthi_bookings b
   WHERE ${NET('devotee')} < 0 OR ${NET('bhuvaji')} < 0`);
check('money', 'a live booking with a refund still holds at least its contribution', `
  SELECT b.id, b.amount_committed, ${NET()} / 100.0 AS net FROM sevarthi_bookings b
   WHERE b.status <> 'cancelled' AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.kind = 'refund')
     AND ${NET()} < ${P('b.amount_committed')}`);
warn('money', 'amounts are whole paise (no float residue stored)', `
  SELECT 'payment' AS t, id, amount FROM payments WHERE ABS(amount * 100 - ROUND(amount * 100)) > 1e-6
  UNION ALL SELECT 'booking', id, amount_committed FROM sevarthi_bookings WHERE ABS(amount_committed * 100 - ROUND(amount_committed * 100)) > 1e-6
  UNION ALL SELECT 'donation', id, amount FROM donations WHERE ABS(amount * 100 - ROUND(amount * 100)) > 1e-6`);
check('money', "payer_type is 'devotee' or 'bhuvaji'", `SELECT id, payer_type FROM payments WHERE payer_type NOT IN ('devotee','bhuvaji')`);
check('money', 'donation amounts are not negative', `SELECT id, amount FROM donations WHERE amount < 0`);

/* ---------------- receipts ---------------- */
check('receipts', 'receipt numbers are unique (payments, refunds and donations)', `
  SELECT receipt_no, COUNT(*) AS n FROM (
    SELECT receipt_no FROM payments WHERE receipt_no IS NOT NULL AND TRIM(receipt_no) <> ''
    UNION ALL SELECT receipt_no FROM donations WHERE receipt_no IS NOT NULL AND TRIM(receipt_no) <> '')
   GROUP BY receipt_no HAVING COUNT(*) > 1`);
check('receipts', 'every payment, refund and donation has a receipt number', `
  SELECT 'payment' AS t, id FROM payments WHERE receipt_no IS NULL OR TRIM(receipt_no) = ''
  UNION ALL SELECT 'donation', id FROM donations WHERE receipt_no IS NULL OR TRIM(receipt_no) = ''`);
check('receipts', 'an issued number matches its kind and its entry’s year (P- payment, R- refund, D- donation)', `
  SELECT 'payment' AS t, id, kind, receipt_no, payment_date AS d FROM payments
   WHERE receipt_no GLOB '[PRD]-[0-9][0-9][0-9][0-9]-*'
     AND (substr(receipt_no, 1, 1) <> CASE kind WHEN 'refund' THEN 'R' ELSE 'P' END
          OR substr(receipt_no, 3, 4) <> substr(payment_date, 1, 4))
  UNION ALL
  SELECT 'donation', id, NULL, receipt_no, donation_date FROM donations
   WHERE receipt_no GLOB '[PRD]-[0-9][0-9][0-9][0-9]-*'
     AND (substr(receipt_no, 1, 1) <> 'D' OR substr(receipt_no, 3, 4) <> substr(donation_date, 1, 4))`);
check('receipts', 'each series counter is ahead of the highest number issued', `
  WITH issued AS (
    SELECT substr(receipt_no, 1, 6) AS series, MAX(CAST(substr(receipt_no, 8) AS INTEGER)) AS hi FROM (
      SELECT receipt_no FROM payments UNION ALL SELECT receipt_no FROM donations)
     WHERE receipt_no GLOB '[PRD]-[0-9][0-9][0-9][0-9]-[0-9]*' AND substr(receipt_no, 8) NOT GLOB '*[^0-9]*'
     GROUP BY 1)
  SELECT i.series, i.hi, rc.next_no FROM issued i LEFT JOIN receipt_counters rc ON rc.series = i.series
   WHERE rc.next_no IS NULL OR rc.next_no <= i.hi`);

/* ---------------- references (no orphans) ---------------- */
check('orphans', 'bookings point at a slot and a devotee that exist', `
  SELECT b.id, b.slot_id, b.devotee_id FROM sevarthi_bookings b
   WHERE NOT EXISTS (SELECT 1 FROM pooja_slots ps WHERE ps.id = b.slot_id)
      OR NOT EXISTS (SELECT 1 FROM devotees d WHERE d.id = b.devotee_id)`);
check('orphans', 'payments point at a booking that exists', `
  SELECT p.id, p.booking_id FROM payments p WHERE NOT EXISTS (SELECT 1 FROM sevarthi_bookings b WHERE b.id = p.booking_id)`);
check('orphans', 'slots point at a pooja that exists', `
  SELECT ps.id, ps.pooja_id FROM pooja_slots ps WHERE NOT EXISTS (SELECT 1 FROM pooja_events pe WHERE pe.id = ps.pooja_id)`);
check('orphans', 'padhramni escorts point at a visit and a devotee that exist', `
  SELECT ve.visit_id, ve.devotee_id FROM visit_escorts ve
   WHERE NOT EXISTS (SELECT 1 FROM visits v WHERE v.id = ve.visit_id)
      OR NOT EXISTS (SELECT 1 FROM devotees d WHERE d.id = ve.devotee_id)`);
check('orphans', 'devotee / donation / visit links resolve', `
  SELECT 'devotee.samaj' AS link, d.id FROM devotees d WHERE d.samaj_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookups l WHERE l.id = d.samaj_id AND l.type = 'samaj')
  UNION ALL SELECT 'devotee.category', d.id FROM devotees d WHERE d.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookups l WHERE l.id = d.category_id AND l.type = 'devotee_category')
  UNION ALL SELECT 'donation.devotee', dn.id FROM donations dn WHERE dn.devotee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devotees d WHERE d.id = dn.devotee_id)
  UNION ALL SELECT 'donation.category', dn.id FROM donations dn WHERE dn.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lookups l WHERE l.id = dn.category_id AND l.type = 'donation_category')
  UNION ALL SELECT 'visit.devotee', v.id FROM visits v WHERE v.devotee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devotees d WHERE d.id = v.devotee_id)
  UNION ALL SELECT 'pooja.coordinator', pe.id FROM pooja_events pe WHERE pe.coordinator_devotee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devotees d WHERE d.id = pe.coordinator_devotee_id)`);
warn('orphans', 'devotees tagged with a samaj / category that was since removed from the list', `
  SELECT d.id, d.full_name, l.type, l.value FROM devotees d JOIN lookups l ON l.id IN (d.samaj_id, d.category_id) WHERE l.active = 0`);

/* ---------------- dates ---------------- */
const DATE_OK = (c) => `(${c} IS NULL OR (${c} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${c}) = ${c}))`;
check('dates', 'every stored date is a real YYYY-MM-DD day', `
  SELECT 'payment' AS t, id, payment_date AS d FROM payments WHERE NOT ${DATE_OK('payment_date')} OR payment_date IS NULL
  UNION ALL SELECT 'donation', id, donation_date FROM donations WHERE NOT ${DATE_OK('donation_date')} OR donation_date IS NULL
  UNION ALL SELECT 'visit', id, visit_date FROM visits WHERE NOT ${DATE_OK('visit_date')} OR visit_date IS NULL
  UNION ALL SELECT 'slot', id, slot_date FROM pooja_slots WHERE NOT ${DATE_OK('slot_date')}
  UNION ALL SELECT 'pooja.start', id, start_date FROM pooja_events WHERE NOT ${DATE_OK('start_date')}
  UNION ALL SELECT 'pooja.end', id, end_date FROM pooja_events WHERE NOT ${DATE_OK('end_date')}`);
check('dates', "padhramni status is a known value", `
  SELECT id, status FROM visits WHERE status NOT IN ('requested','confirmed','completed','cancelled')`);

/* ---------------- lists, people, annual events ---------------- */
check('lists', 'lookup types are the three the app knows', `
  SELECT id, type, value FROM lookups WHERE type NOT IN ('samaj','devotee_category','donation_category')`);
warn('people', 'devotees sharing one mobile number (the dedup key)', `
  SELECT REPLACE(REPLACE(REPLACE(mobile, ' ', ''), '-', ''), '+91', '') AS m, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
    FROM devotees WHERE mobile IS NOT NULL AND TRIM(mobile) <> ''
   GROUP BY m HAVING COUNT(*) > 1`);
check('accounts', 'never more than one super admin', `
  SELECT COUNT(*) AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id
   WHERE ur.role = 'superadmin' AND u.is_deleted = 0 HAVING COUNT(*) > 1`);
warn('accounts', 'a super admin exists (the server creates ADMIN_EMAIL at boot)', `
  SELECT COUNT(*) AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id
   WHERE ur.role = 'superadmin' AND u.is_deleted = 0 HAVING COUNT(*) = 0`);
check('accounts', 'sessions and roles belong to an account', `
  SELECT 'session' AS t, s.id FROM sessions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)
  UNION ALL SELECT 'role', ur.user_id FROM user_roles ur WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id)
  UNION ALL SELECT 'reminder_seen', r.id FROM reminder_seen r WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id)`);
check('annual', 'reminder keys are annual:<code>:<year>', `
  SELECT id, reminder_key FROM reminder_seen WHERE reminder_key NOT GLOB 'annual:*:[0-9][0-9][0-9][0-9]'`);
check('annual', 'pinned dates are {"YYYY": "YYYY-MM-DD"} inside their own year', `
  SELECT ae.id, ae.code, j.key, j.value FROM annual_events ae, json_each(ae.overrides_json) j
   WHERE j.key <> 'once' AND (j.key NOT GLOB '[0-9][0-9][0-9][0-9]' OR substr(j.value, 1, 4) <> j.key OR date(j.value) IS NOT j.value)`);

/* The annual events must be exactly the rows migration 004 loaded (only
   overrides_json / updated_at may change — pinning). Compared by loading
   004 into an in-memory database with 003's shape. */
async function annualAgainstExport() {
  const dir = path.join(__dirname, 'migrations');
  const f003 = fs.readdirSync(dir).find((f) => /^003_/.test(f));
  const f004 = fs.readdirSync(dir).find((f) => /^004_/.test(f));
  if (!f003 || !f004) return { rows: [{ problem: 'migrations 003/004 not found' }] };
  const { createClient } = require('@libsql/client');
  const mem = createClient({ url: ':memory:' });
  const strip = (s) => s.replace(/--[^\n]*/g, '');
  await mem.executeMultiple(strip(fs.readFileSync(path.join(dir, f003), 'utf8')));
  await mem.executeMultiple(strip(fs.readFileSync(path.join(dir, f004), 'utf8')));
  const want = (await mem.execute('SELECT * FROM annual_events ORDER BY code')).rows;
  mem.close();
  const have = await db.all('SELECT * FROM annual_events ORDER BY code');
  const FIELDS = ['code', 'name', 'name_gu', 'name_hi', 'activity', 'activity_gu', 'activity_hi', 'type', 'masa', 'paksha',
    'tithi', 'fixed_month', 'fixed_day', 'description', 'notes', 'active', 'is_deleted'];
  const out = [];
  if (have.length !== want.length) out.push({ problem: `${have.length} rows, the export has ${want.length}` });
  for (const w of want) {
    const h = have.find((x) => x.code === w.code);
    if (!h) { out.push({ code: w.code, problem: 'missing' }); continue; }
    for (const k of FIELDS) if (String(h[k]) !== String(w[k])) out.push({ code: w.code, field: k, have: h[k], export: w[k] });
  }
  for (const h of have) if (!want.find((w) => w.code === h.code)) out.push({ code: h.code, problem: 'not in the export' });
  return { rows: out };
}

async function main() {
  await db.init();
  console.log(`▶ integrity check — ${db.where()} (read-only)\n`);
  const t = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='sevarthi_bookings'`);
  if (!t) { console.error('Not a Phase 1 database (no sevarthi_bookings table).'); process.exit(2); }
  let errors = 0, warnings = 0, group = '';
  const show = (c, rows) => {
    if (c.group !== group) { group = c.group; console.log(`${group}`); }
    const bad = rows.length;
    const mark = !bad ? '✓' : c.level === 'warn' ? '!' : '✗';
    console.log(`  ${mark} ${c.name}${bad ? `  — ${bad} row${bad === 1 ? '' : 's'}` : ''}`);
    for (const r of rows.slice(0, 5)) console.log('      ' + JSON.stringify(r));
    if (bad) { if (c.level === 'warn') warnings++; else errors++; }
  };
  for (const c of checks) {
    let rows;
    try { rows = await db.all(c.sql, ...c.args); } catch (e) { rows = [{ could_not_run: e.message }]; }
    show(c, rows);
  }
  show({ group: 'annual', name: 'annual events are exactly the exported rows (only pinned dates may differ)', level: 'error' },
    (await annualAgainstExport()).rows);
  console.log(`\n${errors ? `✗ ${errors} rule${errors === 1 ? '' : 's'} broken` : '✓ every rule holds'}` +
    (warnings ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''));
  await db.close();
  process.exit(errors ? 1 : 0);
}

main().catch(async (e) => { console.error('✗', e.message); await db.close(); process.exit(2); });
