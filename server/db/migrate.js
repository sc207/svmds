/* Numbered forward-only migration runner (BACKEND_PLAN.md §3.1).
   Applies every db/migrations/NNN_*.sql not yet in schema_migrations, each in a
   transaction, failing LOUD on error (unlike the reference safeAlter[] approach).

   Usage:
     node server/db/migrate.js            # migrate only
     node server/db/migrate.js --seed     # migrate + idempotent reference data
     node server/db/migrate.js --seed --demo   # + demo data (empty tables only)
*/
const fs = require('fs');
const path = require('path');
const { run, queryAll } = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function splitStatements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')          // strip line comments
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

async function runMigrations() {
  await run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const done = new Set((await queryAll('SELECT version FROM schema_migrations')).map(r => r.version));
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.*\.sql$/.test(f)).sort()
    : [];

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await run('BEGIN');
    try {
      for (const stmt of splitStatements(sql)) await run(stmt);
      await run('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      await run('COMMIT');
      console.log('  ✓ migrated', file);
      applied++;
    } catch (e) {
      await run('ROLLBACK');
      console.error('  ✗ FAILED', file, '-', e.message);
      throw e;
    }
  }
  if (!applied) console.log('  (no pending migrations)');
  return applied;
}

async function main() {
  console.log('▶ running migrations…');
  await runMigrations();

  if (process.argv.includes('--seed')) {
    console.log('▶ seeding reference data…');
    await require('./seed/reference-data').seedReferenceData();
  }
  if (process.argv.includes('--demo')) {
    console.log('▶ seeding demo data…');
    await require('./seed/demo-data').seedDemoData();
  }
  console.log('✔ done');
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { runMigrations };
