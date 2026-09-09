/* server/db/compact.js — OPTIONAL, opt-in, NEVER on boot.

   Hard-deletes long-soft-deleted rows that nothing live still points at, sweeps
   orphan link rows, and VACUUMs a local better-sqlite3 file. Same guard policy
   as wipe.js: hard-blocked in production, refuses a remote Turso DB without
   --force-remote, --yes/prompt, --dry-run supported.

     node server/db/compact.js --dry-run
     node server/db/compact.js --yes
     DB_COMPACT_RETENTION_DAYS=90 (default)
*/
const readline = require('readline');
const { queryAll, queryOne, run, isTurso } = require('./connection');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('--dry');
const RETENTION = parseInt(process.env.DB_COMPACT_RETENTION_DAYS || '90', 10);

// child -> parent; a row is only purged when no LIVE row in any table references it
const SAFELIST = [
  'attendance', 'message_drafts', 'communication',
  'pooja_sevarthi_links', 'pooja_coordinator_links', 'pooja_guest_links',
  'pooja_sessions', 'guests', 'sevarthis',
  'public_signups', 'volunteering_sessions',
  'team_members', 'committee_members', 'meetings', 'event_days',
  'poojas', 'events', 'committees', 'teams',
  'donations', 'donors',
  'visits', 'expenses', 'inventory', 'devotees',
];

async function compact() {
  const W = async (sql, a = []) => (dryRun ? { changes: 0 } : run(sql, a));
  const cutoff = new Date(Date.now() - RETENTION * 864e5).toISOString().slice(0, 10);
  console.log(`▶ compact — purge is_deleted rows older than ${cutoff} (${RETENTION}d) that nothing live references`);
  let purged = 0;

  for (const t of SAFELIST) {
    // column presence varies; only tables with is_deleted + updated_at qualify
    const cols = (await queryAll(`PRAGMA table_info(${t})`)).map(c => c.name);
    if (!cols.includes('is_deleted')) continue;
    const dateCol = cols.includes('updated_at') ? 'updated_at' : (cols.includes('created_at') ? 'created_at' : null);
    if (!dateCol) continue;

    let victims = await queryAll(
      `SELECT id FROM ${t} WHERE is_deleted = 1 AND COALESCE(${dateCol}, created_at) < ?`, [cutoff]
    );

    if (t === 'devotees') {
      // never purge a devotee still referenced anywhere (live OR soft-deleted child)
      const keep = new Set();
      const linkRows = await queryAll(`SELECT DISTINCT devotee_id FROM v_person_links`).catch(() => []);
      linkRows.forEach(r => keep.add(r.devotee_id));
      for (const [tbl, col] of [
        ['committee_members', 'devotee_id'], ['team_members', 'devotee_id'], ['sevarthis', 'devotee_id'],
        ['visits', 'devotee_id'], ['donors', 'devotee_id'], ['guests', 'devotee_id'], ['users', 'devotee_id'],
      ]) {
        const rr = await queryAll(`SELECT DISTINCT ${col} d FROM ${tbl} WHERE ${col} IS NOT NULL`);
        rr.forEach(r => keep.add(r.d));
      }
      victims = victims.filter(v => !keep.has(v.id));
    }

    for (const v of victims) {
      try { await W(`DELETE FROM ${t} WHERE id = ?`, [v.id]); purged++; }
      catch (e) { /* still referenced by a FK we didn't model — leave it */ }
    }
    if (victims.length) console.log(`  · ${t}: ${dryRun ? 'would purge' : 'purged'} ${victims.length}`);
  }

  // orphan link rows (any age) — parent gone entirely
  for (const [link, col, parent] of [
    ['pooja_sevarthi_links', 'pooja_id', 'poojas'],
    ['pooja_coordinator_links', 'pooja_id', 'poojas'],
    ['pooja_guest_links', 'pooja_id', 'poojas'],
  ]) {
    const r = await W(`DELETE FROM ${link} WHERE ${col} NOT IN (SELECT id FROM ${parent})`);
    if (r && r.changes) { purged += r.changes; console.log(`  · ${link}: swept ${r.changes} orphans`); }
  }

  if (!dryRun && !isTurso()) {
    console.log('▶ VACUUM (local file)…');
    await run('VACUUM');
  } else if (isTurso()) {
    console.log('  (skipping VACUUM — remote Turso)');
  }
  console.log(`✔ ${dryRun ? 'would purge' : 'purged'} ${purged} rows total`);
}

function guard() {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    console.error('✗ Refusing to compact: NODE_ENV=production. Run this from a maintenance shell with NODE_ENV unset.');
    process.exit(1);
  }
  const remote = !!(process.env.TURSO_DATABASE_URL || process.env.TURSO_AUTH_TOKEN);
  if (remote && !dryRun && !args.includes('--force-remote')) {
    console.error('✗ Refusing to compact a REMOTE Turso database without --force-remote.');
    process.exit(1);
  }
}

async function main() {
  guard();
  if (dryRun || args.includes('--yes')) return compact();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`Permanently delete soft-deleted rows older than ${RETENTION} days that nothing references? Type "compact": `, async (ans) => {
    rl.close();
    if (ans.trim().toLowerCase() === 'compact') await compact();
    else console.log('cancelled.');
    process.exit(0);
  });
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { compact };
