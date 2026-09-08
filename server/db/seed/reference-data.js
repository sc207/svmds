/* Opt-in reference-data seed (`npm run seed`) — NOT run on boot.
   Trimmed to the minimum the temple actually wants pre-loaded:
     - donation_categories (the fixed 80G / in-kind catalog)
     - the 3 samaj committees, leaderless (assign a leader from the UI)
     - 3 management teams (VIP Guest / Parking / Prasad), leaderless
   No pooja types, no event types, no members / leaders / sessions / donations. */
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
     ON CONFLICT(name) DO UPDATE SET next_value = MAX(counters.next_value, excluded.next_value)`,
    [name, prefix, pad, next]
  );
}

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

const COMMITTEES = [
  ['CMT-001', 'General Temple Committee', 'General Committee', 'Overall governance of the temple construction — approvals, budgets and coordination between samaj committees.', '#6B1F2A', 0, ''],
  ['CMT-002', 'Rabari Samaj Committee', 'Rabari Samaj', 'Rabari samaj contribution drives and shram-daan rosters.', '#C96A20', 0, ''],
  ['CMT-003', 'Marvadi Samaj Committee', 'Marvadi Samaj', 'Festival celebrations, prasad sponsorship and marble / gold work funding.', '#7A3B62', 0, ''],
];

const TEAMS = [
  ['MGMT-001', 'VIP Guest Management', 'Welcoming and assisting VIP guests during darshan and events.', '#6B1F2A'],
  ['MGMT-002', 'Parking Management', 'Vehicle routing, parking lot allocation and crowd traffic control.', '#3B5C8A'],
  ['MGMT-003', 'Prasad Management', 'Prasad preparation, packing and orderly distribution at Bhojan Shala.', '#4C8B5A'],
];

/* Temple annual Tithi & important events (spec). TITHI rows carry Amanta
   coordinates; the Gregorian date is computed per year. */
const ANNUAL_EVENTS = [
  // code, name(en), name_gu, activity(en), activity_gu, type, masa, paksha, tithi, fixedM, fixedD
  ['ANE-001', 'Gujarati New Year (Bestu Varas)', 'બેસતું વર્ષ',
   "Mataji's Gadi", 'માતાજીની ગાદી', 'TITHI', 'Kartik', 'shukla', 1, 0, 0],
  ['ANE-002', 'Maha Sud Bij', 'મહા સુદ બીજ',
   "Mataji's Dhaja", 'માતાજીની ધજા', 'TITHI', 'Magha', 'shukla', 2, 0, 0],
  ['ANE-003', 'Chaitra Sud Punam', 'ચૈત્ર સુદ પૂનમ',
   "Mataji's Ramel", 'માતાજીની રમેલ', 'TITHI', 'Chaitra', 'shukla', 15, 0, 0],
  ['ANE-004', 'Jeth Sud Trij', 'જેઠ સુદ ત્રીજ',
   'Bhagwan Shri Kamshibapa Sthapana Divas', 'ભગવાન શ્રી કમશીબાપાનો સ્થાપના દિવસ',
   'TITHI', 'Jyeshtha', 'shukla', 3, 0, 0],
  ['ANE-005', 'Dussehra', 'દશેરા',
   "Mataji's Gadi", 'માતાજીની ગાદી', 'TITHI', 'Ashwin', 'shukla', 10, 0, 0],
  ['ANE-006', 'Dhanteras', 'ધનતેરસ',
   'Bhagwan Shri Kamshibapa Birthday', 'ભગવાન શ્રી કમશીબાપાનો જન્મદિવસ',
   'TITHI', 'Ashwin', 'krishna', 13, 0, 0],
  ['ANE-007', 'P.P. Bhuvaji Shri Sureshbapa Birthday', 'પ.પૂ. ભુવાજી શ્રી સુરેશબાપાનો જન્મદિવસ',
   'Birthday', 'જન્મદિવસ', 'FIXED_DATE', '', '', 0, 9, 27],
];

async function seedReferenceData() {
  for (const [code, name, kind, icon, description] of DONATION_CATEGORIES)
    await upsert('donation_categories', code, { name, kind, icon, description });

  for (const [code, name, samaj, purpose, color, size, notes] of COMMITTEES) {
    const exists = await queryOne('SELECT id FROM committees WHERE code = ?', [code]);
    if (!exists) {
      await run(
        `INSERT INTO committees (code, name, samaj, purpose, color, expected_size, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [code, name, samaj, purpose, color, size, notes]
      );
    }
  }

  for (const [code, name, description, color] of TEAMS) {
    const exists = await queryOne('SELECT id FROM teams WHERE code = ?', [code]);
    if (!exists) {
      const r = await run(
        `INSERT INTO teams (code, name, description, color) VALUES (?, ?, ?, ?)`,
        [code, name, description, color]
      );
      await run('INSERT INTO public_pages (team_id, enabled) VALUES (?, 0) ON CONFLICT(team_id) DO NOTHING', [r.lastInsertRowid]);
    }
  }

  for (const [code, name, name_gu, activity, activity_gu, type, masa, paksha, tithi, fm, fd] of ANNUAL_EVENTS) {
    const exists = await queryOne('SELECT id FROM annual_events WHERE code = ?', [code]);
    if (!exists) {
      await run(
        `INSERT INTO annual_events
           (code, name, name_gu, activity, activity_gu, type, masa, paksha, tithi, fixed_month, fixed_day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, name, name_gu, activity, activity_gu, type, masa, paksha, tithi, fm, fd]
      );
    } else {
      // keep the canonical temple names in sync (masa/tithi/overrides/active untouched)
      await run(
        `UPDATE annual_events SET name = ?, name_gu = ?, activity = ?, activity_gu = ?, updated_at = datetime('now') WHERE code = ?`,
        [name, name_gu, activity, activity_gu, code]
      );
    }
  }

  // push the counters past the codes we just inserted
  await ensureCounter('donation_category', 'DCT', 3, 11);
  await ensureCounter('committee', 'CMT', 3, 4);
  await ensureCounter('team', 'MGMT', 3, 4);
  await ensureCounter('annual_event', 'ANE', 3, 8);

  console.log('  ✓ reference data (donation categories, 3 committees, 3 teams, 7 annual events)');
}

module.exports = { seedReferenceData };
