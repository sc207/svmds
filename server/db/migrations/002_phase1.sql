-- Phase 1 — Murti Pran Pratishtha Mahotsav: sevarthi registration and
-- contribution tracking. This is the FINAL shape of the Sanand app's schema
-- (its db.js migrations 1–5 folded in), timestamps in IST.
--
-- BOOKING STATE MACHINE — every capacity and money question resolves here:
--   A seat is HELD the moment a booking row is created, not when it is paid.
--   pooja_slots.booked_count increments inside the same transaction as the
--   insert (db.tx), so a seat can never be sold twice.
--     pending        nothing received yet (paid = 0)
--     partially_paid 0 < received < committed
--     paid           received >= committed (overpayment stays 'paid')
--     cancelled      seat released back to the slot (booked_count--)
--   `received` is NEVER stored: it is always SUM(payments.amount).

-- One generic table for every managed list: samaj | devotee_category | donation_category
CREATE TABLE IF NOT EXISTS lookups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,
  value      TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  UNIQUE (type, value)
);

-- The permanent register. Mobile is the identity / dedup key (no UNIQUE index — see CLAUDE.md).
CREATE TABLE IF NOT EXISTS devotees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name   TEXT NOT NULL,
  mobile      TEXT,
  city        TEXT,
  state       TEXT DEFAULT 'Gujarat',
  mul_vatan   TEXT,
  samaj_id    INTEGER REFERENCES lookups(id),
  category_id INTEGER REFERENCES lookups(id),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','+330 minutes'))
);
CREATE INDEX IF NOT EXISTS idx_devotees_mobile ON devotees(mobile);
CREATE INDEX IF NOT EXISTS idx_devotees_name   ON devotees(full_name);

-- A yagna / pooja / katha. category: maha_yagna | mandir_pooja | bhagvat_katha.
-- capacity_mode: not_decided | limited | unlimited (only 'limited' puts a number on a slot).
-- seating_mode: per_day (count applies each day) | whole (one pooled slot for the event).
-- NULL dates = not fixed yet; the pooja still takes sevarthi.
CREATE TABLE IF NOT EXISTS pooja_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  category       TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  seats_per_day  INTEGER,
  fixed_capacity INTEGER NOT NULL DEFAULT 1,
  amount         REAL NOT NULL DEFAULT 0,
  target_amount  REAL NOT NULL DEFAULT 0,
  start_date     TEXT,
  end_date       TEXT,
  coordinator_devotee_id INTEGER REFERENCES devotees(id),   -- Phase 2 seam, unused
  status         TEXT NOT NULL DEFAULT 'open',              -- open | closed
  created_at     TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  seating_mode   TEXT NOT NULL DEFAULT 'per_day',
  capacity_mode  TEXT NOT NULL DEFAULT 'not_decided'
);

-- One row per calendar day of a pooja. slot_date NULL = not fixed; capacity NULL = no cap.
CREATE TABLE IF NOT EXISTS pooja_slots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pooja_id     INTEGER NOT NULL REFERENCES pooja_events(id) ON DELETE CASCADE,
  slot_date    TEXT,
  capacity     INTEGER,
  booked_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  UNIQUE (pooja_id, slot_date)
);
CREATE INDEX IF NOT EXISTS idx_slots_date ON pooja_slots(slot_date);

CREATE TABLE IF NOT EXISTS sevarthi_bookings (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id                INTEGER NOT NULL REFERENCES pooja_slots(id),
  devotee_id             INTEGER NOT NULL REFERENCES devotees(id),
  amount_committed       REAL NOT NULL DEFAULT 0,
  bhuvaji_planned_amount REAL NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'pending',
  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  cancelled_at           TEXT,
  is_gift                INTEGER NOT NULL DEFAULT 0,
  CHECK (status IN ('pending','partially_paid','paid','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_slot    ON sevarthi_bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_devotee ON sevarthi_bookings(devotee_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON sevarthi_bookings(status);

-- Append-only cash ledger, read FIFO by created_at. payer_type: devotee | bhuvaji.
CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id   INTEGER NOT NULL REFERENCES sevarthi_bookings(id),
  amount       REAL NOT NULL,
  payer_type   TEXT NOT NULL DEFAULT 'devotee',
  payment_date TEXT NOT NULL,
  receipt_no   TEXT,
  notes        TEXT,
  recorded_by  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  CHECK (payer_type IN ('devotee','bhuvaji'))
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_date    ON payments(payment_date);

CREATE TABLE IF NOT EXISTS donations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  devotee_id    INTEGER REFERENCES devotees(id),
  donor_name    TEXT NOT NULL,
  mobile        TEXT,
  category_id   INTEGER REFERENCES lookups(id),
  amount        REAL NOT NULL DEFAULT 0,
  in_kind_item  TEXT,
  donation_date TEXT NOT NULL,
  receipt_no    TEXT,
  notes         TEXT,
  recorded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','+330 minutes'))
);
CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(donation_date);

-- Padhramni. mobile/city here are an OVERRIDE of the devotee's own (normally NULL).
CREATE TABLE IF NOT EXISTS visits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  devotee_id   INTEGER REFERENCES devotees(id),
  devotee_name TEXT NOT NULL,
  mobile       TEXT,
  purpose      TEXT,
  address      TEXT,
  city         TEXT,
  visit_date   TEXT NOT NULL,
  visit_time   TEXT,
  status       TEXT NOT NULL DEFAULT 'requested',   -- requested | confirmed | completed | cancelled
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','+330 minutes'))
);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);

CREATE TABLE IF NOT EXISTS visit_escorts (
  visit_id   INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  devotee_id INTEGER NOT NULL REFERENCES devotees(id),
  PRIMARY KEY (visit_id, devotee_id)
);

-- Who did what, when. user_id / user_email come from the signed-in Google
-- session; user_name is what the trail shows.
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  user_email TEXT,
  user_name  TEXT NOT NULL DEFAULT 'Unknown',
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  summary    TEXT,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Receipt numbers are issued, not typed: one counter per series per year ('P-2027', 'D-2027').
CREATE TABLE IF NOT EXISTS receipt_counters (
  series  TEXT PRIMARY KEY,
  next_no INTEGER NOT NULL
);
