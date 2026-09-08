-- ============================================================
-- 004_annual_events.sql
-- Temple annual Tithi & important-events master list.
-- TITHI rows store Amanta calendar coordinates (masa / paksha / tithi) and the
-- Gregorian date is computed per selected year (server: services/panchang.js,
-- browser: js/panchang.js). FIXED_DATE rows store month/day. overrides_json is
-- an admin-pinned { "<year>": "YYYY-MM-DD" } map that wins over the calculation.
-- ============================================================
CREATE TABLE IF NOT EXISTS annual_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE,
  name           TEXT NOT NULL,                 -- canonical English
  name_gu        TEXT NOT NULL DEFAULT '',
  name_hi        TEXT NOT NULL DEFAULT '',
  activity       TEXT NOT NULL DEFAULT '',      -- canonical English
  activity_gu    TEXT NOT NULL DEFAULT '',
  activity_hi    TEXT NOT NULL DEFAULT '',
  type           TEXT NOT NULL DEFAULT 'TITHI'
                   CHECK (type IN ('TITHI','FIXED_DATE')),
  -- TITHI coordinates (Amanta)
  masa           TEXT NOT NULL DEFAULT '',      -- Chaitra..Phalguna
  paksha         TEXT NOT NULL DEFAULT ''       -- 'shukla' | 'krishna'
                   CHECK (paksha IN ('', 'shukla', 'krishna')),
  tithi          INTEGER NOT NULL DEFAULT 0,    -- 1..15
  -- FIXED_DATE coordinates
  fixed_month    INTEGER NOT NULL DEFAULT 0,    -- 1..12
  fixed_day      INTEGER NOT NULL DEFAULT 0,    -- 1..31
  overrides_json TEXT NOT NULL DEFAULT '{}',
  description    TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  active         INTEGER NOT NULL DEFAULT 1,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_annual_events_active ON annual_events(active, is_deleted);

-- link a pooja back to the annual event it was created from (nullable, additive)
ALTER TABLE poojas ADD COLUMN annual_event_id INTEGER REFERENCES annual_events(id);
