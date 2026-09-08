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
const { run, runBatch, queryAll } = require('./connection');

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
    const stmts = splitStatements(sql).map(s => ({ sql: s, args: [] }));
    stmts.push({ sql: 'INSERT INTO schema_migrations (version) VALUES (?)', args: [file] });
    try {
      // atomic all-or-nothing — libsql .batch() over HTTP, or a real txn on better-sqlite3
      await runBatch(stmts);
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

async function main() {
  console.log('▶ running migrations…');
  await runMigrations();

  console.log('▶ seeding platform (settings + counters)…');
  await require('./seed/platform').seedPlatform();

  if (process.argv.includes('--seed')) {
    console.log('▶ seeding reference data (catalogs + sample committees)…');
    await require('./seed/reference-data').seedReferenceData();
  }
  console.log('✔ done');
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { runMigrations };
