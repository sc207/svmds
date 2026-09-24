/* ============================================================
   TEMPORARY — the one-time Phase 1 cutover, run from server boot.
   Remove this file (and its call in server/index.js, and drop the
   p1_legacy_backup table) in the follow-up "back to a normal boot"
   commit once production is confirmed on Phase 1.

   It does something ONLY while the database still holds the old
   portal schema (devotees without full_name). After it has run once
   that is never true again, so every later boot/restart/redeploy of
   this same code is a no-op — it can never wipe Phase 1 data.

   Steps (same as `node server/db/wipe.js --legacy`):
     1. BACKUP into the database itself — Render's disk is wiped on
        every deploy, so a file backup there would be lost. Every row
        of every old table goes into p1_legacy_backup (one row per
        table, JSON). Nothing is dropped unless that succeeded.
     2. Keep users / user_roles / sessions WITH their rows (the Google
        accounts); clear users.devotee_id (it pointed into the old
        register).
     3. Drop every other old table, view and trigger.
     4. Phase 1 migrations + repairs, then the real seva and samaj
        lists (seed.js seedLists) — no demo data.
   ============================================================ */
const db = require('./index');

const KEEP = ['users', 'user_roles', 'sessions', 'p1_legacy_backup'];

async function isLegacy() {
  const t = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='devotees'`);
  if (!t) return false;
  const cols = (await db.all(`PRAGMA table_info(devotees)`)).map((c) => c.name);
  return !cols.includes('full_name');
}

async function cutoverIfLegacy() {
  if (!(await isLegacy())) return false;
  console.log('▶ Phase 1 cutover: old portal schema found — backing up, keeping accounts, resetting');

  const objects = await db.all(
    `SELECT type, name FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'`);
  const tables = objects.filter((o) => o.type === 'table' && o.name !== 'p1_legacy_backup').map((o) => o.name);

  /* 1. backup */
  await db.run(`CREATE TABLE IF NOT EXISTS p1_legacy_backup (
    table_name TEXT PRIMARY KEY, row_count INTEGER NOT NULL, rows_json TEXT NOT NULL,
    taken_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  let total = 0;
  for (const t of tables) {
    const rows = await db.all(`SELECT * FROM "${t}"`);
    total += rows.length;
    await db.run(`INSERT OR REPLACE INTO p1_legacy_backup (table_name, row_count, rows_json) VALUES (?, ?, ?)`,
      t, rows.length, JSON.stringify(rows));
  }
  const saved = await db.get(`SELECT COUNT(*) AS n, IFNULL(SUM(row_count), 0) AS r FROM p1_legacy_backup`);
  if (saved.n < tables.length || saved.r < total) throw new Error('Cutover backup incomplete — nothing was dropped');
  console.log(`  ✓ backup: ${tables.length} tables, ${total} rows → p1_legacy_backup`);

  /* 2. keep the accounts */
  if (tables.includes('users')) {
    const cols = (await db.all(`PRAGMA table_info(users)`)).map((c) => c.name);
    if (cols.includes('devotee_id')) await db.run(`UPDATE users SET devotee_id = NULL`);
  }

  /* 3. drop the rest (views/triggers first; retry for FK order) */
  for (const o of objects.filter((x) => x.type === 'trigger')) await db.run(`DROP TRIGGER IF EXISTS "${o.name}"`);
  for (const o of objects.filter((x) => x.type === 'view')) await db.run(`DROP VIEW IF EXISTS "${o.name}"`);
  let pending = tables.filter((t) => !KEEP.includes(t));
  const dropped = pending.length;
  for (let pass = 0; pending.length && pass < 20; pass++) {
    const failed = [];
    for (const t of pending) {
      try { await db.run(`DROP TABLE IF EXISTS "${t}"`); } catch (e) { failed.push(t); }
    }
    pending = failed;
  }
  if (pending.length) throw new Error('Cutover could not drop: ' + pending.join(', '));
  console.log(`  ✓ dropped ${dropped} old tables; kept users, user_roles, sessions`);

  /* 4. Phase 1 schema + the real lists */
  const { runMigrations, bootRepairs } = require('./migrate');
  await runMigrations();
  await bootRepairs();
  await require('./seed/seed').seedLists();
  const n = await db.get(`SELECT COUNT(*) AS n FROM users WHERE is_deleted = 0`);
  console.log(`✔ Phase 1 cutover done — ${n.n} account(s) carried over, seva list seeded`);
  return true;
}

module.exports = { cutoverIfLegacy, isLegacy };
