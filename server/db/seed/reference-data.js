/* Idempotent reference-data seed — safe to run on every boot (BACKEND_PLAN.md §3.4).
   Catalogs (pooja_types / donation_categories / event_types) are upserted on `code`;
   committees are inserted only if absent; `counters` rows back services/entityCode.js. */
const { run, queryOne } = require('../connection');

async function upsert(table, code, cols) {
  const keys = Object.keys(cols);
  await run(
    `INSERT INTO ${table} (code, ${keys.join(', ')})
       VALUES (?, ${keys.map(() => '?').join(', ')})
     ON CONFLICT(code) DO UPDATE SET ${keys.map(k => `${k} = excluded.${k}`).join(', ')}`,
    [code, ...keys.map(k => cols[k])]
  );
}

async function ensureCounter(name, prefix, pad, next) {
  await run(
    `INSERT INTO counters (name, prefix, pad, next_value) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO NOTHING`,
    [name, prefix, pad, next]
  );
}

const POOJA_TYPES = [
  ['PTY-001', 'Vihat Meldi Mata Vishesh Havan', 'Special Havan', 'Principal havan invoking Maa Vihat Meldi with 108 aahutis.', 60, 'Ghee, samidha, black sesame, kumkum, coconut', '🔥'],
  ['PTY-002', 'Maha Aarti & Deepotsav', 'Daily Ritual', 'Grand aarti with rows of lit diyas across the mandap.', 30, 'Ghee diyas, cotton wicks, camphor, flowers', '🪔'],
  ['PTY-003', 'Rudrabhishek Seva', 'Abhishek', 'Abhishek of the shivling with panchamrit and mantras.', 45, 'Milk, curd, honey, ghee, sugar, bilva leaves', '💧'],
  ['PTY-004', 'Navgraha Shanti Pooja', 'Shanti Pooja', 'Propitiation of the nine planets for peace and relief.', 90, 'Nine grains, nine cloths, ghee, havan samagri', '🪐'],
  ['PTY-005', 'Chandi Path & Archana', 'Path', 'Recitation of Durga Saptashati with archana.', 120, 'Red flowers, chunri, kumkum, coconut, ghee lamp', '📿'],
  ['PTY-006', 'Shat Chandi Mahayagna', 'Special Yagna', 'Hundred-fold Chandi recitation with mahayagna.', 180, 'Large havan kund, ghee, dry fruits, 100 chunris', '🕉️'],
  ['PTY-007', 'Gau Seva & Grass Donation', 'Seva', 'Feeding and honouring the temple cows.', 15, 'Green fodder, jaggery, wheat flour balls', '🐄'],
  ['PTY-008', 'Annadan Mahaprasad Seva', 'Prasad', 'Community meal offered as prasad to all devotees.', 60, 'Rice, dal, ghee, vegetables, sweets', '🍲'],
  ['PTY-009', 'Vihat Maa Moorti Sthapan Pooja', 'Sthapana', 'Consecration & installation of the Maa Vihat idol.', 150, 'Panchratna, navdhanya, kalash, chunri, gold thread', '🛕'],
  ['PTY-010', 'Kalash Sthapana', 'Sthapana', 'Establishment of the sacred kalash to begin an anushthan.', 45, 'Copper kalash, mango leaves, coconut, raw rice, thread', '⚱️'],
  ['PTY-011', 'Prana Pratishtha', 'Sthapana', 'Rite of infusing divine life-force into the deity.', 120, 'Netravali, madhuparka, panchamrit, new vastra', '✨'],
  ['PTY-012', 'Yagna / Havan', 'Havan', 'General fire ceremony with sankalp and purnahuti.', 75, 'Havan samagri, ghee, samidha, coconut', '🔥'],
  ['PTY-013', 'Abhishek Seva', 'Abhishek', 'Ceremonial bathing of Maa with sacred substances.', 40, 'Milk, panchamrit, gangajal, rose water, chandan', '💧'],
  ['PTY-014', 'Annakut Darshan', 'Utsav', 'Mountain of food offered and displayed before Maa.', 90, '56 bhog items, sweets, farsan, fruits', '🍛'],
  ['PTY-015', 'Mata Chowki / Dayro', 'Utsav', 'Devotional night of bhajan, garba and dayro.', 240, 'Sound system, harmonium, prasad, chunri', '🎶'],
  ['PTY-016', 'Dhwaja Aarohan', 'Utsav', 'Hoisting of the sacred flag atop the shikhar.', 30, 'Silk dhwaja, kalash, coconut, garland', '🚩'],
];

const DONATION_CATEGORIES = [
  ['DCT-001', 'General Donation', 'cash', '🪙', 'Unrestricted offering to the mandir.'],
  ['DCT-002', 'Temple Renovation', 'cash', '🏗️', 'Towards construction & restoration work.'],
  ['DCT-003', 'Annadan / Bhojan Seva', 'cash', '🍲', 'Community meal / prasad fund.'],
  ['DCT-004', 'Pooja / Seva Booking', 'cash', '🪔', 'Sponsored pooja or seva.'],
  ['DCT-005', 'Gau Daan (Cow)', 'kind', '🐄', 'Donation of a cow to the temple gaushala.'],
  ['DCT-006', 'Suvarna Daan (Gold)', 'kind', '🥇', 'Gold ornaments, paghadi, chhatra, kalash.'],
  ['DCT-007', 'Rajat Daan (Silver)', 'kind', '🪙', 'Silver articles and utensils.'],
  ['DCT-008', 'Ratna / Jewellery', 'kind', '💍', 'Diamond & precious-stone jewellery.'],
  ['DCT-009', 'Anna Daan (Grain)', 'kind', '🌾', 'Rice, wheat, ghee, pulses for the bhandar.'],
  ['DCT-010', 'Construction Material', 'kind', '🧱', 'Cement, marble, steel, timber.'],
];

const EVENT_TYPES = [
  ['EVT-001', 'Meldi Mata Poonam Dayro', 'Mahotsav', '🌕', 'Full-moon night of bhajan, dayro and Annakut mahaprasad.'],
  ['EVT-002', 'Sharad Purnima Seva', 'Seva', '🥛', 'Kheer mahaprasad distribution and special aarti.'],
  ['EVT-003', 'Navratri Mahotsav', 'Utsav', '🪭', 'Nine nights of garba, chandi path havan and daily maha aarti.'],
  ['EVT-004', 'Annakut Mahotsav', 'Utsav', '🍛', '56-bhog annakut darshan the day after Diwali.'],
  ['EVT-005', 'Patotsav (Foundation Day)', 'Utsav', '🛕', 'Temple foundation / prana-pratishtha anniversary.'],
  ['EVT-006', 'Dhwaja Aarohan', 'Vidhi', '🚩', 'Hoisting of the sacred flag on the shikhar.'],
  ['EVT-007', 'Lok Dayro / Santvani', 'Cultural', '🎤', 'Folk devotional programme with invited kalakars.'],
  ['EVT-008', 'Shobha Yatra', 'Yatra', '🛺', 'Procession of the deity through the town.'],
  ['EVT-009', 'Diwali Chopda Pujan', 'Vidhi', '🪔', 'Account-book worship on Diwali with the vyapari mandal.'],
  ['EVT-010', 'Holi Dhuleti Utsav', 'Utsav', '🎨', 'Holika dahan and community dhuleti.'],
];

const COMMITTEES = [
  ['CMT-001', 'General Temple Committee', 'General Committee', 'Overall governance of the temple construction — approvals, budgets and coordination between samaj committees.', '#6B1F2A', 25, '2026-06-01', 'Meets on the first Sunday of every month.'],
  ['CMT-002', 'Rabari Samaj Committee', 'Rabari Samaj', 'Rabari samaj contribution drives, shram-daan rosters and stone/timber procurement for the shikhar.', '#C96A20', 45, '2026-06-05', 'Largest samaj group; handles village-wise collection.'],
  ['CMT-003', 'Marvadi Samaj Committee', 'Marvadi Samaj', 'Festival celebrations, prasad sponsorship and marble / gold work funding.', '#7A3B62', 32, '2026-06-08', ''],
];

async function seedReferenceData() {
  for (const [code, name, category, description, dur, offerings, icon] of POOJA_TYPES)
    await upsert('pooja_types', code, {
      name, category, description, default_duration_min: dur, suggested_offerings: offerings, icon,
    });

  for (const [code, name, kind, icon, description] of DONATION_CATEGORIES)
    await upsert('donation_categories', code, { name, kind, icon, description });

  for (const [code, name, category, icon, description] of EVENT_TYPES)
    await upsert('event_types', code, { name, category, icon, description });

  for (const [code, name, samaj, purpose, color, size, cdate, notes] of COMMITTEES) {
    const exists = await queryOne('SELECT id FROM committees WHERE code = ?', [code]);
    if (!exists) {
      await run(
        `INSERT INTO committees (code, name, samaj, purpose, color, expected_size, created_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, name, samaj, purpose, color, size, cdate, notes]
      );
    }
  }

  // app_settings defaults (only if unset)
  await run(`INSERT INTO app_settings (key, value) VALUES ('working_date', '2026-09-06') ON CONFLICT(key) DO NOTHING`);
  await run(`INSERT INTO app_settings (key, value) VALUES ('working_time', '18:30') ON CONFLICT(key) DO NOTHING`);
  await run(`INSERT INTO app_settings (key, value) VALUES ('default_language', 'gu') ON CONFLICT(key) DO NOTHING`);
  await run(`INSERT INTO app_settings (key, value) VALUES ('temple_identity', ?) ON CONFLICT(key) DO NOTHING`,
    [JSON.stringify({
      name: 'Shri Vihat Meldi Mata Mandir', loc: 'Sanand, Gujarat, India',
      founder: 'Bhagwan Bhuvaji Karamshi Bapa', head: 'Bhuvaji Suresh Bapa',
      email: '', phone: '',
    })]);

  // entity-code counters (services/entityCode.js). next_value already past the seeded codes.
  const counters = [
    ['devotee', 'DEV', 3, 1],
    ['team', 'MGMT', 3, 1],
    ['team_member', 'MEM', 4, 1],
    ['volunteering', 'VOL', 3, 1],
    ['public_signup', 'PUB', 3, 1],
    ['committee', 'CMT', 3, 4],
    ['committee_member', 'CMM', 3, 1],
    ['meeting', 'MTG', 3, 1],
    ['message_draft', 'MSG', 3, 1],
    ['pooja', 'PJA', 3, 1],
    ['pooja_session', 'PSN', 3, 1],
    ['pooja_type', 'PTY', 3, 17],
    ['sevarthi', 'SEV', 3, 1],
    ['guest', 'GST', 3, 1],
    ['donation', 'DON', 3, 1],
    ['donor', 'DNR', 3, 1],
    ['donation_category', 'DCT', 3, 11],
    ['event', 'EVN', 3, 1],
    ['event_type', 'EVT', 3, 11],
    ['visit', 'VIS', 3, 1],
    ['expense', 'EXP', 3, 1],
    ['inventory', 'INV', 3, 1],
  ];
  for (const [name, prefix, pad, next] of counters) await ensureCounter(name, prefix, pad, next);

  console.log('  ✓ reference data (catalogs, committees, settings, counters)');
}

module.exports = { seedReferenceData };
