/* Hard reset — empties every domain table but KEEPS the schema, migration
   history and platform settings (app_settings). Counters go back to 1. Users
   and sessions are cleared, then ADMIN_EMAIL is re-bootstrapped as superadmin.
   Reference catalogs are NOT restored — run `npm run seed` afterwards if you
   want the sample pooja types / donation categories / event types back.

   Usage:  npm run wipe            (asks for confirmation)
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

async function main() {
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
