/* CLI for server/db/repair.js.

     node server/db/repair.cli --dry-run      report only, zero writes
     node server/db/repair-cli.js             apply (local DB)
     node server/db/repair-cli.js --yes --force-remote   apply against Turso

   Unlike wipe.js there is NO NODE_ENV=production hard block — the whole point is
   to clean prod. repair.js only soft-deletes + repoints, never hard-deletes. But
   a real run against a REMOTE Turso database still needs both --yes and
   --force-remote so it can't happen by accident. --dry-run needs neither. */
const readline = require('readline');
const { repairDatabase } = require('./repair');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('--dry');
const remote = !!(process.env.TURSO_DATABASE_URL || process.env.TURSO_AUTH_TOKEN);

async function go() {
  if (remote && !dryRun) {
    console.log('\n*** operating on the REMOTE Turso database ***\n');
  }
  const summary = await repairDatabase({ dryRun });
  console.log('\n' + JSON.stringify(summary, null, 2));
  const drift = summary.devoteesMerged + summary.rosterRowsMerged + summary.usersDevoteeBackfilled
    + summary.leadersLinkedForward + summary.leadersLinkedReverse + summary.guestsBackfilled
    + summary.donorsBackfilled + summary.coordinatorDevoteeBackfilled;
  if (dryRun) {
    console.log(`\n${drift === 0 ? '✔ no drift' : '⚠ ' + drift + ' rows would change'}` +
      (summary.indexesSkipped.length ? `  ·  ${summary.indexesSkipped.length} index(es) blocked` : ''));
  } else {
    console.log(`\n✔ repair applied  ·  ${drift} rows changed  ·  ${summary.indexesCreated.length} index(es) present`);
  }
  process.exit(0);
}

function guarded() {
  if (dryRun) return go();
  if (remote && !args.includes('--force-remote')) {
    console.error('✗ Refusing a real repair on a REMOTE database without --force-remote.');
    console.error('  Try:  node server/db/repair-cli.js --dry-run     (safe, read-only)');
    console.error('  Or :  node server/db/repair-cli.js --yes --force-remote');
    process.exit(1);
  }
  if (args.includes('--yes')) return go();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Apply data repair (merge duplicates, backfill links, add UNIQUE indexes)? Type "repair": ', (ans) => {
    rl.close();
    if (ans.trim().toLowerCase() === 'repair') return go();
    console.log('cancelled.');
    process.exit(0);
  });
}

guarded();
