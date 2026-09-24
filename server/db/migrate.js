/* Numbered, forward-only migrations + the boot-time invariant repairs.

   Applies every db/migrations/NNN_*.sql not yet recorded in
   `p1_migrations`, each in one transaction, failing LOUD. The tracking
   table is deliberately NOT the portal's old `schema_migrations`: that
   one lists 001..020 of a different schema, and sharing it would make
   this runner skip our 001/002 against a database that never had them.

   NEVER edit a shipped migration — add the next number.

   Usage:  node server/db/migrate.js      (npm run migrate)
*/
const fs = require('fs');
const path = require('path');
const db = require('./index');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function splitStatements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The portal's old schema (sk before Phase 1) has a `devotees` table with
    no `full_name`. Booting Phase 1 on it would half-work and corrupt both,
    so refuse and say why. Production was moved to Phase 1 on 2026-09-24 by
    a one-time cutover (git history: server/db/cutover.js, server/db/wipe.js),
    so a database in this state is a stale copy. */
async function assertNotLegacySchema() {
  const t = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='devotees'`);
  if (!t) return;
  const cols = (await db.all(`PRAGMA table_info(devotees)`)).map((c) => c.name);
  if (!cols.includes('full_name')) {
    const e = new Error(
      'This database still holds the OLD portal schema (devotees has no full_name), so\n' +
      'Phase 1 will not run on it. It is a stale copy — point TEMPLE_DB / TURSO_* at the\n' +
      'Phase 1 database. (The one-time cutover tool is in git history: server/db/wipe.js.)');
    e.legacy = true;
    throw e;
  }
}

async function runMigrations() {
  await assertNotLegacySchema();
  await db.run(`CREATE TABLE IF NOT EXISTS p1_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const done = new Set((await db.all('SELECT version FROM p1_migrations')).map((r) => r.version));
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => (parseInt(a, 10) - parseInt(b, 10)) || a.localeCompare(b));

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const stmts = splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    try {
      await db.tx(async () => {
        for (const s of stmts) await db.run(s);
        await db.run('INSERT INTO p1_migrations (version) VALUES (?)', file);
      });
      console.log('  ✓ migrated', file);
      applied++;
    } catch (e) {
      console.error('  ✗ FAILED', file, '-', e.message);
      throw e;
    }
  }
  if (!applied) console.log('  (no pending migrations)');
  return applied;
}

/* Invariant repairs and first-run defaults, every boot — ported from the
   Sanand app's db.js. All idempotent. */
async function bootRepairs() {
  /* A pooja whose slots carry a number IS capped, whatever its label says.
     Catches rows written by a direct INSERT (the seed scripts). */
  const cap = await db.run(`
    UPDATE pooja_events SET capacity_mode = 'limited'
     WHERE capacity_mode <> 'limited' AND fixed_capacity = 1 AND seats_per_day IS NOT NULL`);
  if (cap.changes > 0) console.log(`[db] capacity_mode repaired on ${cap.changes} pooja(s) with a real patla limit`);

  /* is_gift = 1  =>  bhuvaji_planned_amount = amount_committed
                  AND no payment on the booking has payer_type 'devotee' */
  const giftShare = await db.run(`
    UPDATE sevarthi_bookings SET bhuvaji_planned_amount = amount_committed
     WHERE is_gift = 1 AND IFNULL(bhuvaji_planned_amount, 0) <> amount_committed`);
  if (giftShare.changes > 0) console.log(`[db] gift share re-set to the full contribution on ${giftShare.changes} booking(s)`);
  const giftPaid = await db.run(`
    UPDATE sevarthi_bookings SET is_gift = 0
     WHERE is_gift = 1 AND EXISTS (
       SELECT 1 FROM payments WHERE booking_id = sevarthi_bookings.id AND payer_type = 'devotee')`);
  if (giftPaid.changes > 0) console.log(`[db] ${giftPaid.changes} booking(s) un-gifted: the sevarthi had paid into them`);

  const defaults = [
    ['devotee_category', 'Normal', 1],
    ['devotee_category', 'VIP', 2],
    ['devotee_category', 'Guest', 3],
    ['devotee_category', 'Gurudev / Bhuvaji', 4],
    ['donation_category', 'General Donation', 1],
    ['donation_category', 'Annadan', 2],
    ['donation_category', 'Construction', 3],
  ];
  for (const [type, value, order] of defaults) {
    await db.run(`INSERT OR IGNORE INTO lookups (type, value, sort_order) VALUES (?, ?, ?)`, type, value, order);
  }
  const settings = [
    ['temple_name', 'શ્રી વિહત મેલડી ધામ'],
    ['temple_name_en', 'Shri Vihat Meldi Dham'],
    ['temple_location', 'Sanand, Gujarat'],
    ['trust_head', 'Bhuvaji Shri Suresh Bapa'],
    ['mahotsav_name', 'Murti Pran Pratishtha Mahotsav'],
  ];
  for (const [k, v] of settings) await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, k, v);
}

async function main() {
  console.log(`▶ migrating ${db.where()}…`);
  await runMigrations();
  await bootRepairs();
  console.log('✔ done');
  await db.close();
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message || err); process.exit(1); });
}

module.exports = { runMigrations, bootRepairs, assertNotLegacySchema };
