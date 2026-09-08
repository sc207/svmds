/* Demo data — runs only with `--demo`, and only into an EMPTY target table
   (BACKEND_PLAN.md §3.4). Populated in Phase 4 as each module's routes land;
   the arrays here mirror the seeds in js/*.js. */
const { queryOne } = require('../connection');

async function isEmpty(table) {
  const r = await queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE is_deleted = 0`);
  return !r || Number(r.n) === 0;
}

async function seedDemoData() {
  // TODO (Phase 4): devotees, users+roles, team_members, sevarthis, guests,
  // donors, donations, poojas+sessions+links, meetings, events+days, visits —
  // each guarded by `if (await isEmpty('<table>')) { … }`.
  console.log('  (demo-data: no seed sets wired yet — added per module in Phase 4)');
}

module.exports = { seedDemoData, isEmpty };
