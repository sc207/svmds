/* Put the app back to a clean starting point.

     npm run reset             clear the data, keep the lists as they are
     npm run reset -- --lists  also put the lists back to the seeded set
     … --turso                 required as well when TURSO_* is set, i.e.
                               to reset the PRODUCTION database

   Use TEMPLE_DB=<path> to point it at a throwaway local database.

   WHAT IT CLEARS — everything the trust enters day to day:
     devotees · sevarthi bookings · payments · donations · padhramni
     (and their escorts) · the Phase 1 entries in the audit log · the
     receipt counters

   WHAT IT KEEPS — the reference data the app is configured with:
     the seva list (pooja_events / pooja_slots)
     the managed lists (samaj, devotee categories, donation categories)
     the settings
     the accounts — users, user_roles, sessions, and the audit rows about
     them (sign-ins, grants). An account is a person, not test data.

   `--lists` additionally puts the seva and managed lists back to exactly
   what the seed creates, which is what you want after a run of tests
   (one database had picked up 66 seva called "Redate Test 1790017245629").
   Anything the trust added deliberately through the UI goes with them,
   so it is a flag and not the default.

   Two things it does that are easy to forget by hand, and wrong to
   leave out:
     - `pooja_slots.booked_count` is reset to 0. It is a running count,
       so deleting the bookings without it leaves every day claiming to
       be full and the booking transaction turning people away.
     - the receipt counters go back to zero, so a fresh run starts at
       P-<year>-0001.

   It writes a JSON backup of every table first, every time, to
   data/backup-before-reset-<stamp>.json, and says where it put it.
*/
const fs = require('fs');
const path = require('path');
const db = require('./index');
const { runMigrations, bootRepairs } = require('./migrate');

const argv = process.argv.slice(2);
/* `--seva` still works: it was the first name for this. */
const LISTS_TOO = argv.includes('--lists') || argv.includes('--seva');

/* Cleared in this order: children before the rows they point at. */
const CLEAR = [
  ['visit_escorts', 'padhramni escorts'],
  ['visits', 'padhramni'],
  ['payments', 'payments'],
  ['sevarthi_bookings', 'sevarthi bookings'],
  ['donations', 'donations'],
  ['devotees', 'devotees'],
  ['receipt_counters', 'receipt counters'],
];
/* The account trail (sign-in, grant, revoke …) is about people, not the
   register, so it stays with the accounts. */
const ACCOUNT_ENTITIES = ['account', 'session', 'auth', 'access'];

const KEEP = [
  ['pooja_events', 'seva'],
  ['pooja_slots', 'seva days'],
  ['lookups', 'samaj / categories'],
  ['users', 'accounts'],
  ['settings', 'settings'],
];

async function count(t) {
  try { return (await db.get(`SELECT COUNT(*) n FROM ${t}`)).n; } catch (e) { return null; }
}
async function report(title) {
  console.log(`\n  ${title}:`);
  for (const [t, label] of [...CLEAR, ['audit_log', 'audit entries'], ...KEEP]) {
    const n = await count(t);
    if (n !== null) console.log(`    ${String(n).padStart(6)}  ${label}`);
  }
}

/* ---- backup first, always ---------------------------------- */
async function backup() {
  const tables = (await db.all(
    `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' AND name NOT LIKE '_litestream%'`))
    .map((r) => r.name);
  const out = { takenAt: new Date().toString(), target: db.where(), tables: {} };
  for (const t of tables) out.tables[t] = await db.all(`SELECT * FROM "${t}"`);
  const dir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toLocaleString('sv').replace(/[: ]/g, '-').slice(0, 19);
  const file = path.join(dir, `backup-before-reset-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  return file;
}

/* The keepers are read out of the seed and the boot defaults rather than
   repeated here, so the two cannot drift. */
function keepers() {
  const src = fs.readFileSync(path.join(__dirname, 'seed', 'seed.js'), 'utf8');
  /* Match a whole quoted string, each quote style on its own, rather
     than "anything between two quote characters": one of these names is
     "Samaran's Main Kalash Pooja", written in double quotes because it
     contains an apostrophe. A combined [^'"] class stops dead at that
     apostrophe and every name after it comes out as punctuation — which
     is how the first run of this deleted fifteen real poojas as junk. */
  const quoted = (block) => [...block.matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((x) => (x[1] !== undefined ? x[1] : x[2]))
    .filter((v) => v && v.trim() && !/^[,\s]+$/.test(v));

  const seva = new Set([
    ...[...src.matchAll(/\{\s*name:\s*'([^']+)'/g)].map((m) => m[1]),
    ...(() => {
      const m = src.match(/const MANDIR_POOJAS = \[([\s\S]*?)\n\];/);
      return m ? quoted(m[1]) : [];
    })(),
  ]);

  const lists = {
    samaj: (() => {
      const m = src.match(/const SAMAJ = \[([^\]]*)\]/);
      return m ? quoted(m[1]) : [];
    })(),
    devotee_category: [], donation_category: [],
  };
  const bootSrc = fs.readFileSync(path.join(__dirname, 'migrate.js'), 'utf8');
  const dm = bootSrc.match(/const defaults = \[([\s\S]*?)\n\s*\];/);
  if (dm) {
    [...dm[1].matchAll(/\[\s*'(\w+)'\s*,\s*'([^']*)'/g)].forEach(([, type, value]) => {
      if (lists[type]) lists[type].push(value);
    });
  }
  return { seva, lists };
}

async function main() {
  await db.init();
  if (db.isTurso() && !argv.includes('--turso')) {
    console.error('Refusing: TURSO_* is set, so this would reset the PRODUCTION database.\n' +
      'Point it at a local file with TEMPLE_DB=<path>, or add --turso if that is really what you mean.');
    await db.close();
    process.exit(2);
  }
  console.log(`\n  Target: ${db.where()}`);
  await runMigrations();
  await bootRepairs();

  const k = LISTS_TOO ? keepers() : null;
  if (k && (!k.seva.size || !k.lists.samaj.length)) {
    throw new Error('Could not read the seeded lists out of seed.js — refusing to prune anything.');
  }

  await report('Before');
  console.log(`\n  Backup: ${await backup()}`);

  let removedSeva = 0;
  let removedLookups = 0;
  await db.tx(async () => {
    for (const [t] of CLEAR) await db.run(`DELETE FROM ${t}`);
    await db.run(`DELETE FROM audit_log WHERE entity NOT IN (${ACCOUNT_ENTITIES.map(() => '?').join(',')})`,
      ...ACCOUNT_ENTITIES);

    if (LISTS_TOO) {
      const all = await db.all(`SELECT id, name FROM pooja_events`);
      const kill = all.filter((p) => !k.seva.has(p.name)).map((p) => p.id);
      if (kill.length) {
        const list = kill.join(',');
        await db.run(`DELETE FROM pooja_slots WHERE pooja_id IN (${list})`);
        await db.run(`DELETE FROM pooja_events WHERE id IN (${list})`);
        removedSeva = kill.length;
      }
      for (const type of Object.keys(k.lists)) {
        if (!k.lists[type].length) continue;           // never empty a list we failed to read
        const rows = await db.all(`SELECT id, value FROM lookups WHERE type = ?`, type);
        const drop = rows.filter((r) => !k.lists[type].includes(r.value)).map((r) => r.id);
        if (!drop.length) continue;
        /* The devotees and donations pointing at these are already gone —
           this runs after the clear — so nothing is left dangling. */
        await db.run(`DELETE FROM lookups WHERE id IN (${drop.join(',')})`);
        removedLookups += drop.length;
      }
    }

    /* A running count, not a derived one — see the note at the top. */
    await db.run(`UPDATE pooja_slots SET booked_count = 0`);
  });

  await report('After');
  if (LISTS_TOO) {
    console.log(`\n  Removed ${removedSeva} seva and ${removedLookups} samaj/category the seed did not create.` +
                ((removedSeva || removedLookups)
                  ? '\n  Run `npm run seed` to put back anything real that went with them.' : ''));
  } else {
    console.log('\n  The lists were left alone. Add --lists to put them back to the seeded set.');
  }
  console.log('  Accounts were left alone — an account is a person, not test data.');
  console.log('  Next:  npm run seed:demo   (ten of everything, to work with)\n');
  await db.close();
}

main().catch(async (e) => { console.error('✗', e.message || e); await db.close(); process.exit(1); });
