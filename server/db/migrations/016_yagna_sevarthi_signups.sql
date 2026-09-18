-- Public Maha Yagna sevarthi registration — a fully separate staging table.
-- Deliberately NOT devotees/sevarthis/committees (see MAHA_YAGNA_PLAN.md):
-- samaj_name is exactly what the person typed, free text, no FK to
-- committees and no automatic committee creation. Staff review and
-- normalise these values manually before a future phase copies approved
-- rows into the canonical devotees/committee_members/sevarthis tables.
CREATE TABLE IF NOT EXISTS yagna_sevarthi_signups (
  id                     TEXT PRIMARY KEY,
  code                   TEXT UNIQUE,
  first_name             TEXT NOT NULL,
  last_name              TEXT NOT NULL DEFAULT '',
  samaj_name             TEXT NOT NULL,
  city                   TEXT NOT NULL DEFAULT '',
  state                  TEXT NOT NULL DEFAULT 'Gujarat',
  mobile                 TEXT NOT NULL,
  expected_contribution  REAL NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','converted','rejected')),
  category               TEXT,
  assigned_pooja_id      TEXT REFERENCES poojas(id),
  notes                  TEXT NOT NULL DEFAULT '',
  submitted_ip           TEXT NOT NULL DEFAULT '',
  is_deleted             INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_yagna_signups_mobile ON yagna_sevarthi_signups(mobile);

CREATE INDEX IF NOT EXISTS idx_yagna_signups_samaj_name ON yagna_sevarthi_signups(samaj_name);

CREATE INDEX IF NOT EXISTS idx_yagna_signups_status ON yagna_sevarthi_signups(status);
