/* ONE-TIME LEGACY RESET — the portal database → Phase 1.

   What it does, in order:
     1. BACKUP: writes every row of every table to
        data/backup-before-phase1-<timestamp>.json (on the machine running
        the script, whether the database is local or Turso). Nothing is
        dropped unless that file was written.
     2. Keeps exactly three tables WITH their rows — users, user_roles,
        sessions — so every Google account and its roles survive.
        users.devotee_id is cleared (it pointed into the old register).
     3. Drops every other table, view and trigger (the old devotees,
        donations, poojas, committees, teams, audit_logs, … and the old
        schema_migrations).
     4. Runs the Phase 1 migrations on the now-empty database.

   It cannot be undone except from the backup file. It refuses to run
   without --yes, and refuses a Turso database without --turso as well,
   so it can never be run against production by accident.

     node server/db/wipe.js --legacy --yes                 local file
     node server/db/wipe.js --legacy --yes --turso         the TURSO_* database

   Never put this in render.yaml's build or start command. */
const fs = require('fs');
const path = require('path');
const db = require('./index');
const { runMigrations, bootRepairs } = require('./migrate');

const KEEP = ['users', 'user_roles', 'sessions'];
const argv = process.argv.slice(2);

async function main() {
  if (!argv.includes('--legacy') || !argv.includes('--yes')) {
    console.error('Refusing: this drops every table except users/user_roles/sessions.\n' +
      'Re-run with --legacy --yes (and --turso for the Turso database). Read the header first.');
    process.exit(2);
  }
  await db.init();
  if (db.isTurso() && !argv.includes('--turso')) {
    console.error('Refusing: TURSO_* is set, so this would reset the PRODUCTION database.\n' +
      'If that is really what you mean, add --turso.');
    process.exit(2);
  }
  console.log(`▶ target: ${db.where()}`);

  const objects = await db.all(
    `SELECT type, name FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'`);
  const tables = objects.filter((o) => o.type === 'table').map((o) => o.name);

  /* 1. backup */
  const backup = { takenAt: new Date().toString(), target: db.where(), tables: {} };
  for (const t of tables) backup.tables[t] = await db.all(`SELECT * FROM "${t}"`);
  const dir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toLocaleString('sv').replace(/[: ]/g, '-');
  const file = path.join(dir, `backup-before-phase1-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(backup));
  const total = Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0);
  console.log(`  ✓ backup: ${tables.length} tables, ${total} rows → ${file}`);

  /* 2. keep the accounts; detach them from the old register */
  if (tables.includes('users')) {
    const cols = (await db.all(`PRAGMA table_info(users)`)).map((c) => c.name);
    if (cols.includes('devotee_id')) await db.run(`UPDATE users SET devotee_id = NULL`);
  }

  /* 3. drop the rest — views/triggers first, then tables, retrying so
        foreign-key order sorts itself out */
  for (const o of objects.filter((x) => x.type === 'trigger')) await db.run(`DROP TRIGGER IF EXISTS "${o.name}"`);
  for (const o of objects.filter((x) => x.type === 'view')) await db.run(`DROP VIEW IF EXISTS "${o.name}"`);
  let pending = tables.filter((t) => !KEEP.includes(t));
  for (let pass = 0; pending.length && pass < 20; pass++) {
    const failed = [];
    for (const t of pending) {
      try { await db.run(`DROP TABLE IF EXISTS "${t}"`); } catch (e) { failed.push(t); }
    }
    pending = failed;
  }
  if (pending.length) throw new Error('Could not drop: ' + pending.join(', '));
  console.log(`  ✓ dropped ${tables.filter((t) => !KEEP.includes(t)).length} tables; kept ${KEEP.filter((t) => tables.includes(t)).join(', ') || 'none'}`);

  /* 4. Phase 1 schema */
  await runMigrations();
  await bootRepairs();
  const users = await db.get(`SELECT COUNT(*) AS n FROM users WHERE is_deleted = 0`);
  console.log(`✔ Phase 1 database ready — ${users ? users.n : 0} account(s) carried over.`);
  await db.close();
}

main().catch(async (e) => { console.error('✗', e.message); await db.close(); process.exit(1); });
