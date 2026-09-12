/* Platform seed — the bare minimum a clean install needs to run.
   Idempotent, runs on EVERY boot. No demo / reference content:
     - app_settings defaults (working-date clock, language, temple identity)
     - counters for services/entityCode.js, all starting at 1
   Reference catalogs (pooja types, donation categories, event types, sample
   committees) are NOT seeded here — run `npm run seed` for those. */
const { run } = require('../connection');

async function ensureSetting(key, value) {
  await run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`,
    [key, value]
  );
}

async function ensureCounter(name, prefix, pad, next) {
  await run(
    `INSERT INTO counters (name, prefix, pad, next_value) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO NOTHING`,
    [name, prefix, pad, next]
  );
}

const COUNTERS = [
  ['devotee', 'DEV', 3], ['team', 'MGMT', 3], ['team_member', 'MEM', 4],
  ['volunteering', 'VOL', 3], ['public_signup', 'PUB', 3],
  ['committee', 'CMT', 3], ['committee_member', 'CMM', 3], ['meeting', 'MTG', 3],
  ['message_draft', 'MSG', 3],
  ['pooja', 'PJA', 3], ['pooja_session', 'PSN', 3], ['pooja_type', 'PTY', 3],
  ['sevarthi', 'SEV', 3], ['guest', 'GST', 3],
  ['donation', 'DON', 3], ['donor', 'DNR', 3], ['donation_category', 'DCT', 3],
  ['event', 'EVN', 3], ['event_type', 'EVT', 3],
  ['visit', 'VIS', 3], ['expense', 'EXP', 3], ['inventory', 'INV', 3],
  ['annual_event', 'ANE', 3],
  ['dhaja_campaign', 'DHC', 3], ['dhaja_pooja', 'DHJ', 3],
];

async function seedPlatform() {
  // working_date/working_time are NOT seeded: settingsStore.getSettings()
  // always returns the real current IST time unless working_date_pinned='1'
  // (set only via PUT /settings/working-date), so there is nothing to
  // default here — seeding one would freeze "today" on the deploy date.
  await ensureSetting('default_language', 'gu');
  await ensureSetting('temple_identity', JSON.stringify({
    name: 'Shri Vihat Meldi Mata Mandir',
    loc: 'Sanand, Gujarat, India',
    founder: 'Bhagwan Bhuvaji Karamshi Bapa',
    head: 'Bhuvaji Suresh Bapa',
    email: '', phone: '',
  }));

  for (const [name, prefix, pad] of COUNTERS) await ensureCounter(name, prefix, pad, 1);

  console.log('  ✓ platform settings + counters');
}

module.exports = { seedPlatform };
