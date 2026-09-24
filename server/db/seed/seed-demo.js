/* Ten of everything, to work with.

     npm run seed:demo        (TEMPLE_DB=<path> for a throwaway database)

   Small on purpose. `seed-dummy.js` exists to cover every booking state
   at once and makes a few hundred rows doing it, which is right for
   checking money logic and wrong for looking at a screen.

   So this makes ten devotees, ten seats, ten payments, ten donations
   and ten padhramni — few enough to check by eye, and chosen so the
   states worth seeing are all present exactly once:

     pending · partly paid · covered · overpaid · cancelled
     Bapa covering part · a gift from Bapa
     a dated seva and an undated one
     a devotee with no mobile, and one with no seva at all

   Devotees are idempotent — run it twice and you still have ten,
   because they are matched on the mobile number (and by name for the
   one person who has none). The seats, donations and padhramni are
   not: this is demo data, and a second run on top of a first is a
   thing to do after `npm run reset`, not instead of it.
*/
const db = require('../index');
const { runMigrations, bootRepairs } = require('../migrate');
const { todayLocal } = require('../../util/dates');
const receipts = require('../../util/receipts');
const { refreshStatus } = require('../../routes/bookings');

const BY = 'Demo seed';

async function lookup(type, value) {
  const row = await db.get(`SELECT id FROM lookups WHERE type = ? AND value = ? AND active = 1`, type, value);
  return row ? row.id : null;
}
const samaj = (v) => lookup('samaj', v);
const cat = (v) => lookup('devotee_category', v);

/* Ten people, with the shapes the register has to cope with: a missing
   mobile, a mul vatan that differs from the city, and a spread of
   samaj so the filters have something to bite on. */
const PEOPLE = [
  ['Rasikbhai Patel',    '9825110001', 'Ahmedabad',   'Patel Samaj',     'VIP',    'Sanand'],
  ['Devshi Rabari',      '9825110002', 'Viramgam',    'Rabari Samaj',    'Normal', 'Viramgam'],
  ['Bhachiben Rabari',   '9825110003', 'Sanand',      'Rabari Samaj',    'Normal', null],
  ['Mohanlal Marvadi',   '9825110004', 'Rajkot',      'Marvadi Samaj',   'Normal', null],
  ['Sunita Marvadi',     null,         'Rajkot',      'Marvadi Samaj',   'Normal', null],
  ['Hansaben Patel',     '9825110006', 'Vadodara',    'Patel Samaj',     'Normal', 'Sanand'],
  ['Bharatsinh Thakor',  '9825110007', 'Gandhinagar', 'Thakor Samaj',    'Normal', null],
  ['Ramesh Prajapati',   '9825110008', 'Sanand',      'Prajapati Samaj', 'Normal', 'Sanand'],
  ['Kanjibhai Rabari',   '9825110009', 'Viramgam',    'Rabari Samaj',    'Guest',  null],
  ['Ashaben Marvadi',    '9825110010', 'Rajkot',      'Marvadi Samaj',   'Normal', null],
];

async function upsertDevotee(p) {
  const [full_name, mobile, city, s, c, mul_vatan] = p;
  /* The mobile is the register's identity key, so that is what a
     re-run matches on. The one person without a number is matched by
     name instead — otherwise a second run quietly added an eleventh. */
  const found = mobile
    ? await db.get(`SELECT id FROM devotees WHERE mobile = ?`, mobile)
    : await db.get(`SELECT id FROM devotees WHERE full_name = ? AND mobile IS NULL`, full_name);
  if (found) return found.id;
  return Number((await db.run(`
    INSERT INTO devotees (full_name, mobile, city, state, mul_vatan, samaj_id, category_id)
    VALUES (@full_name, @mobile, @city, 'Gujarat', @mul_vatan, @samaj_id, @category_id)
  `, { full_name, mobile, city, mul_vatan, samaj_id: await samaj(s), category_id: await cat(c) })).lastInsertRowid);
}

const day = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

async function main() {
  await runMigrations();
  await bootRepairs();

  /* Seats are taken on whatever the seed list actually holds, so this
     keeps working if the trust renames or re-prices a seva. */
  const slots = await db.all(`
    SELECT ps.id, ps.slot_date, pe.name, pe.amount, pe.category
      FROM pooja_slots ps JOIN pooja_events pe ON pe.id = ps.pooja_id
     WHERE pe.status <> 'closed'
     ORDER BY (ps.slot_date IS NULL), pe.id, ps.id
  `);
  if (!slots.length) {
    console.log('\n  No seva to book against. Run `npm run seed` first.\n');
    await db.close();
    process.exit(1);
  }
  const undated = slots.filter((s) => !s.slot_date);

  /* Spread the seats across all three Mahotsav categories, one after
     the other, so every category screen and the payments category
     filter have something on them. */
  const byCat = {};
  slots.forEach((s) => { (byCat[s.category] = byCat[s.category] || []).push(s); });
  const cats = Object.keys(byCat);
  const pick = (i) => {
    const list = byCat[cats[i % cats.length]];
    return list[Math.floor(i / cats.length) % list.length];
  };

  /* One seat per state worth seeing. `gift` is Bapa giving the whole
     seva; `bapa` is Bapa covering part of one — different things. */
  const SEATS = [
    { who: 0, slot: pick(0), amount: 21000,  pay: 0,                       label: 'pending' },
    { who: 1, slot: pick(1), amount: 21000,  pay: 5000,                    label: 'partly paid' },
    { who: 2, slot: pick(2), amount: 11000,  pay: 11000,                   label: 'covered' },
    { who: 3, slot: pick(3), amount: 11000,  pay: 15000,                   label: 'overpaid' },
    { who: 4, slot: pick(4), amount: 31000,  pay: 21000, bapa: 10000,      label: 'Bapa covering part' },
    { who: 5, slot: pick(5), amount: 51000,  pay: 51000, gift: true,       label: 'a gift from Bapa' },
    { who: 6, slot: pick(6), amount: 11000,  pay: 2000,                    label: 'partly paid' },
    { who: 7, slot: undated[0] || pick(7), amount: 21000, pay: 0,          label: 'pending, date not fixed' },
    { who: 8, slot: pick(8), amount: 11000,  pay: 11000,                   label: 'covered' },
    { who: 2, slot: pick(9), amount: 5000,   pay: 5000,  cancel: true,     label: 'cancelled after paying' },
  ];

  /* ----------------------------------------------------------------
     EVERYTHING BELOW IS ONE TRANSACTION. As separate transactions a
     crash between them once left ten devotees and ten seva with no
     donations and no padhramni — which looks seeded and is not — and
     seats are NOT idempotent, so the obvious re-run silently doubles
     them. As one, a failure rolls the lot back.
     ---------------------------------------------------------------- */
  let seats = 0, paid = 0, dons = 0, vis = 0;
  await db.tx(async () => {
    const devotees = [];
    for (const p of PEOPLE) devotees.push(await upsertDevotee(p));
    console.log(`  ${devotees.length} devotees`);

    for (const s of SEATS) {
      const bapaShare = s.gift ? s.amount : (s.bapa || 0);
      const id = Number((await db.run(`
        INSERT INTO sevarthi_bookings (slot_id, devotee_id, amount_committed, bhuvaji_planned_amount, is_gift, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `, s.slot.id, devotees[s.who], s.amount, bapaShare, s.gift ? 1 : 0)).lastInsertRowid);
      await db.run(`UPDATE pooja_slots SET booked_count = booked_count + 1 WHERE id = ?`, s.slot.id);
      seats++;

      if (s.pay > 0) {
        /* A gift is Bapa's end to end; a shared contribution is two rows,
           because payer_type lives on the row. */
        const rows = s.gift ? [[s.pay, 'bhuvaji']]
          : s.bapa ? [[s.pay - s.bapa, 'devotee'], [s.bapa, 'bhuvaji']]
          : [[s.pay, 'devotee']];
        for (const [amount, payer] of rows) {
          if (amount <= 0) continue;
          await db.run(`
            INSERT INTO payments (booking_id, amount, payer_type, payment_date, receipt_no, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `, id, amount, payer, todayLocal(), await receipts.next('P', todayLocal()), BY);
          paid++;
        }
      }

      if (s.cancel) {
        await db.run(`UPDATE sevarthi_bookings SET status = 'cancelled',
                       cancelled_at = datetime('now','+330 minutes') WHERE id = ?`, id);
        await db.run(`UPDATE pooja_slots SET booked_count = MAX(0, booked_count - 1) WHERE id = ?`, s.slot.id);
      }
    }
    console.log(`  ${seats} seats, ${paid} payments`);

    /* Status is derived from the ledger and never written by hand. */
    for (const b of await db.all(`SELECT id FROM sevarthi_bookings WHERE status <> 'cancelled'`)) {
      await refreshStatus(b.id);
    }

    /* Ten donations, including one in kind. */
    const donCat = await db.all(`SELECT id, value FROM lookups WHERE type = 'donation_category' AND active = 1`);
    for (let i = 0; i < 10; i++) {
      const d = devotees[i % devotees.length];
      const p = PEOPLE[i % PEOPLE.length];
      const inKind = i === 7;
      await db.run(`
        INSERT INTO donations (devotee_id, donor_name, mobile, category_id, amount, in_kind_item,
                               donation_date, receipt_no, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, d, p[0], p[1], donCat.length ? donCat[i % donCat.length].id : null,
         inKind ? 0 : (i + 1) * 1100, inKind ? '51 kg ghee' : null,
         todayLocal(), await receipts.next('D', todayLocal()), BY);
      dons++;
    }
    console.log(`  ${dons} donations`);

    /* Ten padhramni spread around today, so "Today", "In N days" and an
       overdue one all appear. */
    const VISIT = [
      [-6, 'completed'], [-2, 'completed'], [-1, 'confirmed'], [0, 'confirmed'],
      [1, 'requested'], [3, 'requested'], [6, 'confirmed'], [12, 'requested'],
      [25, 'requested'], [40, 'requested'],
    ];
    for (let i = 0; i < VISIT.length; i++) {
      const [offset, status] = VISIT[i];
      await db.run(`
        INSERT INTO visits (devotee_id, devotee_name, visit_date, visit_time, address, purpose, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, devotees[i % devotees.length], PEOPLE[i % PEOPLE.length][0],
         day(offset), i % 2 ? '10:30' : '17:00',
         i % 3 === 0 ? null : `${10 + i}, Temple Road`,
         ['Griha shanti', 'Padhramni before Mahotsav', 'Vastu pooja at the shop',
          'New house', 'Family requested a visit'][i % 5],
         status, i === 4 ? 'Ring the day before' : null);
      vis++;
    }
    console.log(`  ${vis} padhramni`);
  });

  /* Report what is actually in there, not what was meant to be. */
  const n = async (t) => (await db.get(`SELECT COUNT(*) n FROM ${t}`)).n;
  const got = {
    devotees: await n('devotees'),
    seva: await n('sevarthi_bookings'),
    donations: await n('donations'),
    padhramni: await n('visits'),
  };
  const short = Object.entries(got).filter(([, v]) => v < 10);
  if (short.length) {
    console.log('\n  NOT ten of everything — ' + short.map(([k, v]) => `${k}: ${v}`).join(', ') +
                '\n  Run the clean-start sequence again.\n');
  } else {
    console.log('\n  Ten of everything. Seva, samaj and the categories were left as they were.\n');
  }
  await db.close();
}

main().catch(async (e) => { console.error(e.message || e); await db.close(); process.exit(1); });
