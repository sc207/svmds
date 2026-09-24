-- Annual Temple Events — the mandir's yearly tithi / fixed-date observances,
-- shown on the Universal Calendar and announced from 3 days before.
-- Same shape as the portal's annual_events (so its export imports as-is).
-- TITHI rows store Amanta coordinates (masa / paksha / tithi); the Gregorian
-- date is computed per year (public/js/panchang.js, shared with the server).
-- FIXED_DATE rows store month/day. overrides_json is an admin-pinned
-- { "<year>": "YYYY-MM-DD" } map that wins over the calculation.

CREATE TABLE IF NOT EXISTS annual_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE,
  name           TEXT NOT NULL,
  name_gu        TEXT NOT NULL DEFAULT '',
  name_hi        TEXT NOT NULL DEFAULT '',
  activity       TEXT NOT NULL DEFAULT '',
  activity_gu    TEXT NOT NULL DEFAULT '',
  activity_hi    TEXT NOT NULL DEFAULT '',
  type           TEXT NOT NULL DEFAULT 'TITHI' CHECK (type IN ('TITHI','FIXED_DATE')),
  masa           TEXT NOT NULL DEFAULT '',
  paksha         TEXT NOT NULL DEFAULT '' CHECK (paksha IN ('', 'shukla', 'krishna')),
  tithi          INTEGER NOT NULL DEFAULT 0,
  fixed_month    INTEGER NOT NULL DEFAULT 0,
  fixed_day      INTEGER NOT NULL DEFAULT 0,
  overrides_json TEXT NOT NULL DEFAULT '{}',
  description    TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  active         INTEGER NOT NULL DEFAULT 1,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_annual_events_active ON annual_events(active, is_deleted);

-- "User U already saw announcement K on day D" — so the opening announcement
-- shows at most once per user per day, on every device. Not a copy of any
-- event: announcements are derived live from annual_events.
-- reminder_key is per occurrence, e.g. annual:ANE-002:2027. seen_on is IST.
CREATE TABLE IF NOT EXISTS reminder_seen (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  reminder_key TEXT NOT NULL,
  seen_on      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reminder_seen ON reminder_seen(user_id, reminder_key, seen_on);
