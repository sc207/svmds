/* Hard reset — empties every domain table but KEEPS the schema, migration
   history and platform settings (app_settings). Counters go back to 1. Users
   and sessions are cleared, then ADMIN_EMAIL is re-bootstrapped as superadmin.
   Reference catalogs are NOT restored — run `npm run seed` afterwards if you
   want the sample pooja types / donation categories / event types back.

   ── SAFETY POLICY (do not weaken) ────────────────────────────────────────
   This script is NEVER part of a deploy or app boot. render.yaml runs only
   `npm install` + `node server/index.js`; server/index.js boot runs only
   migrations + idempotent seeds + ensureAdminUser — none of which delete
   rows. wipe.js is a LOCAL-DEV convenience only:
     • Hard-blocked when NODE_ENV=production (Render always sets this) — no
       override exists.
     • Otherwise still refuses to touch a remote Turso DB (TURSO_* set)
       unless --force-remote is passed.
   It never drops tables/views and never deletes Turso database files.

   Usage (local dev, local data/svmds.db only):
     npm run wipe            (asks for confirmation)
     npm run wipe -- --yes   (no prompt)
*/
const readline = require('readline');
const { run, queryAll } = require('./connection');
const config = require('../config');

// child → parent order so foreign keys never block a delete
const TABLES = [
  'attendance', 'communication', 'message_drafts',
  'pooja_sevarthi_links', 'pooja_coordinator_links', 'pooja_guest_links',
  'pooja_sessions', 'guests', 'sevarthis',
  'public_signups', 'public_pages', 'volunteering_sessions', 'team_members',
  'committee_members', 'meetings', 'event_days',
  'poojas', 'events', 'committees', 'teams',
  'donations', 'donors',
  'visits', 'expenses', 'inventory', 'devotees',
  'pooja_types', 'donation_categories', 'event_types',
  'audit_logs', 'sessions', 'user_roles', 'users',
];

async function wipe() {
  console.log('▶ wiping domain data (keeping schema + app_settings)…');
  await run('PRAGMA foreign_keys = OFF');
  for (const t of TABLES) {
    try { await run(`DELETE FROM ${t}`); } catch (e) { console.warn(`  · skip ${t}: ${e.message}`); }
  }
  try { await run(`DELETE FROM sqlite_sequence`); } catch (e) {}
  await run('UPDATE counters SET next_value = 1');
  await run('PRAGMA foreign_keys = ON');
  console.log(`  ✓ cleared ${TABLES.length} tables, reset counters`);

  await require('./seed/platform').seedPlatform();
  await require('../services/bootstrap').ensureAdminUser();

  const [{ n: users }] = await queryAll('SELECT COUNT(*) AS n FROM users');
  console.log(`✔ done — database is clean (${users} user: ${config.adminEmail || 'no ADMIN_EMAIL set'})`);
}

/* Guardrails so this can never erase real data on a deploy or a prod shell. */
function guard() {
  // 1. Absolute block in production — no flag can override this.
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    console.error(
      '✗ Refusing to wipe: NODE_ENV=production.\n' +
      '  This script is a local-dev convenience only. It is never run on a\n' +
      '  deploy and must never touch the production database.'
    );
    process.exit(1);
  }
  // 2. Outside production, still refuse a REMOTE (Turso) DB without --force-remote.
  const remote = !!(process.env.TURSO_DATABASE_URL || process.env.TURSO_AUTH_TOKEN);
  if (remote && !process.argv.includes('--force-remote')) {
    console.error(
      '✗ Refusing to wipe: TURSO_DATABASE_URL is set, so this would erase a REMOTE\n' +
      '  database. To wipe only a local data/svmds.db, unset TURSO_* first.\n' +
      '  (A remote wipe would need: node server/db/wipe.js --yes --force-remote,\n' +
      '   and is still blocked entirely when NODE_ENV=production.)'
    );
    process.exit(1);
  }
}

async function main() {
  guard();
  if (process.argv.includes('--yes')) return wipe();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('This ERASES all devotees, donations, poojas, committees, teams, events, visits,\nexpenses, inventory, accounts and sessions. Type "wipe" to continue: ', async (ans) => {
    rl.close();
    if (ans.trim().toLowerCase() === 'wipe') await wipe();
    else console.log('cancelled.');
  });
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { wipe };
