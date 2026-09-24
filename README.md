# Shri Vihat Meldi Dham — Sanand

Phase 1: sevarthi registration and contribution tracking for the
**Murti Pran Pratishtha Mahotsav**.

## Running it

```bash
npm install
cp .env.example .env            # ADMIN_EMAIL, JWT_SECRET, GOOGLE_CLIENT_ID
TEMPLE_DB=data/dev.db npm run seed       # the Mahotsav seva list (idempotent)
TEMPLE_DB=data/dev.db npm run seed:demo  # optional: ten of everything
TEMPLE_DB=data/dev.db npm start          # http://localhost:3000 → Google sign-in
```

`TEMPLE_DB` keeps local work on a local file even when `.env` carries the
production `TURSO_*` values. Sign-in is Google only: `ADMIN_EMAIL` is made the
super admin on every boot, and every other person is added by email in
**Accounts & Access**. There is no password and no self-signup.

## Deploying (Render + Turso)

`render.yaml` deploys `main` automatically: `npm install`, then
`node server/index.js`, which runs the migrations and invariant repairs and
never deletes anything. Production needs `JWT_SECRET`, `ADMIN_EMAIL`,
`GOOGLE_CLIENT_ID`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`ALLOWED_ORIGINS` and `TZ=Asia/Kolkata`. `/health` shows the database and
row counts.

Moving the live database from the old portal to Phase 1 is a one-time,
manual step. See the header of `server/db/wipe.js`: it backs up every table,
keeps the accounts, drops the rest, and creates the Phase 1 schema.

## What's in Phase 1

| Section | What it does |
|---|---|
| Dashboard | Live totals + four quick-add buttons (Sevarthi, Payment, Samaj, Devotee Category) |
| Mahotsav | Three categories → poojas → day-wise patla seating + FIFO sevarthi ledger |
| Payment Received | Record cash, day-wise and month-wise views |
| Devotee | Permanent register with 360° profile |
| Padhramni | Bappa / Bhuvaji home & shop visits |
| Universal Calendar | Poojas, padhramni, donations and payments on one grid |
| Donation | Separate from seva, with extensible categories |
| Invitation | Printable invitation card per pooja |
| Settings | Temple identity + the managed lists |
| Accounts & Access | Users and the full audit trail |

## How seats are counted

Each pooja says whether its patla count is **per day** or **the total**:

- **per day** — the count applies to each day, so Bhagvat Saptah with
  100 patla over 6 days seats 600. People come each day.
- **whole** — the count is the total for the entire event. One sevarthi
  holds that patla for every day. The Maha Yagna tiers work this way:
  there is **one** Mukhya Patlo, not one per day.

A `whole` pooja keeps a single pooled slot but still shows across its
full date range on the calendar.

## Maha Yagna patla tiers (4–8 Feb 2027)

| Patla | Count | Amount each |
|---|---:|---:|
| Mukhya Patlo | 1 | ₹51,00,000 |
| Dhaja Mate No Patlo | 1 | not decided |
| Anya Mukhya Patla | 7 | ₹21,00,000 |
| Yagna Patla — ₹11,00,000 | 16 | ₹11,00,000 |
| Yagna Patla — ₹5,51,000 | no limit | ₹5,51,000 |
| Yagna Patla — ₹1,00,000 | no limit | ₹1,00,000 |
| Yagna Patla — ₹51,000 | no limit | ₹51,000 |
| Yagna Patla — ₹31,000 | no limit | ₹31,000 |
| Yagna Patla — ₹11,000 | no limit | ₹11,000 |
| Navchandi Yagna — Sanand Nij Mandir | not decided | not decided |

The fixed-count tiers come to **₹3,74,00,000**. The open tiers have no
target because the number of sevarthi is not capped.

## Bhagvat Saptah — Katha (2–7 Feb 2027)

| Item | Count | Amount |
|---|---:|---:|
| Pothi Yatra | no limit | ₹1,51,000 |
| Pothi ni Aarti | no limit | ₹21,000 |
| Tulsi Vivah | not decided | not decided |
| Shree Krishna Janmotsav | not decided | not decided |
| Shree Ram Pragatya | not decided | not decided |
| Shree Goverdhan Pooja | not decided | not decided |
| Rukmani Vivah | not decided | not decided |
| Sudama Charitra | not decided | not decided |

Each of these happens on **one day** of the saptah, and which day is not
decided — so they are undated and stay off the calendar until you press
**Set dates**. That is the difference from a yagna patla, which is held
for all five days and so carries the full range.

"no limit" and "not decided" both store as no cap; the ones that are
merely undecided say so in their note, so the distinction is not lost.

## Poojas without a date yet

A pooja can be opened for sevarthi **before its date is fixed**. The 17
Mandir ni Pooja rituals are seeded this way — 1 seat each, no date, no
amount, because none of that is decided yet and guessing would put wrong
entries on the calendar.

An undated pooja has one slot showing **Date TBA**. It takes bookings
normally. It is skipped by the Universal Calendar until a date exists.
When the trust decides, open the pooja and press **Set dates** — the
undated slot becomes day one, so sevarthi already booked carry over, and
the remaining days are created with the same seat count.

Amounts are ₹0 for now; set one per pooja and it becomes the suggested
contribution on the Add Sevarthi form. A sevarthi can always give more.

## How the money and seats work

**A seat is held the moment a booking is created**, not when it is paid.
The capacity check, the booking insert and the seat-count increment all run
inside one SQLite transaction, so two operators saving at the same instant
can never take the same last patla.

Booking status is **derived from the ledger**, never set by hand:

| status | meaning |
|---|---|
| `pending` | booked, nothing received yet |
| `partially_paid` | part of the committed amount received |
| `paid` | committed amount met (overpayment is fine and stays `paid`) |
| `cancelled` | seat released back to that day's pool |

A seat can be funded by the devotee, by Bhuvaji Suresh Bapa covering the
shortfall, or both. The plan sits on the booking (`bhuvaji_planned_amount`);
who actually paid sits on each payment row (`payer_type`).

All collections are **cash**.

## Language — English / ગુજરાતી

Two separate mechanisms, because they solve different problems:

**The app's own wording** (`public/js/lang.js`) is a hand-written table.
Tap **EN / ગુ** in the top bar and the whole interface switches instantly,
offline. A temple's vocabulary is exact — સેવાર્થી, પ્રાણ પ્રતિષ્ઠા, પાટલા —
and a general translator gets these wrong, so they are not machine
translated. Devotee names, pooja names and amounts are never translated.

**Free text you type** (notes, address, purpose) is kept exactly as typed.

## Data model

```
lookups            samaj / devotee_category / donation_category  (one table, `type` column)
devotees           the permanent register  (mobile = identity key, prevents duplicates)
pooja_events       a yagna / pooja / katha  + coordinator_devotee_id (reserved for Phase 2)
pooja_slots        one row per day, with its patla count and booked_count
sevarthi_bookings  a devotee's seat on a day
payments           append-only cash ledger (FIFO by created_at)
donations          separate offerings
visits             padhramni
users / user_roles / sessions   Google sign-in accounts (carried over from the portal)
audit_log          who did what, when — the signed-in account, never a typed name
settings           temple identity
```

Every create, update, delete, cancel, payment, sign-in and account change
writes an `audit_log` row with the signed-in account and an IST timestamp.

## Phase 2 seam

Management Apps and Committee / Samaj are deferred. Two things are already
in place so they attach without a rewrite:

- `pooja_events.coordinator_devotee_id` — nullable, unused today.
- the generic `lookups` table — a new managed list needs no new table.

## Layout

## The look

`public/css/styles.css` is the mandir's portal stylesheet — the maroon
mandala sidebar, the parchment welcome banner with its diyas, the Cinzel
headings, the stat cards, tables, pill buttons and modals. Only its Google
Fonts `@import` was swapped for the self-hosted copy in `public/fonts/`.
`public/css/app-extras.css` holds the Phase 1 pieces (patla chips, progress
bars, the sevarthi ledger, the EN/ગુ switch, line-icon sizing). Icons are
SVG from `public/assets/icons.svg`, not emoji.

## Backup

Production data lives in Turso: `turso db shell <db> .dump > backup.sql`.
`npm run reset` and the one-time wipe also write a JSON dump of every table
to `data/` before they change anything.
