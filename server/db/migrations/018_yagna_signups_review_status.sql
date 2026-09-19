-- Widen yagna_sevarthi_signups.status to support a real Phase-1 review
-- workflow (see MAHA_YAGNA_PLAN.md) -- staff need to track "we're calling
-- this person" separately from "we've finished reviewing them," without any
-- of this implying Phase 2 conversion. 'converted' stays in the CHECK for
-- forward-compatibility with the (not-yet-built) Phase 2 approval step, but
-- the admin UI no longer offers it as a pickable Phase-1 action.
-- SQLite can't ALTER a CHECK constraint in place -- rebuild (safe: 0 live
-- rows as of this migration).
CREATE TABLE yagna_sevarthi_signups_new (
  id                     TEXT PRIMARY KEY,
  code                   TEXT UNIQUE,
  first_name             TEXT NOT NULL,
  last_name              TEXT NOT NULL DEFAULT '',
  samaj_name             TEXT NOT NULL,
  city                   TEXT NOT NULL DEFAULT '',
  state                  TEXT NOT NULL DEFAULT 'Gujarat',
  mobile                 TEXT NOT NULL,
  expected_contribution  REAL NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN
                           ('submitted','under_review','contacted','needs_follow_up','reviewed','converted','rejected')),
  category               TEXT,
  assigned_pooja_id      TEXT REFERENCES poojas(id),
  notes                  TEXT NOT NULL DEFAULT '',
  submitted_ip           TEXT NOT NULL DEFAULT '',
  is_deleted             INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT
);

INSERT INTO yagna_sevarthi_signups_new
  SELECT id, code, first_name, last_name, samaj_name, city, state, mobile,
         expected_contribution, status, category, assigned_pooja_id, notes,
         submitted_ip, is_deleted, created_at, updated_at
  FROM yagna_sevarthi_signups;

DROP TABLE yagna_sevarthi_signups;
ALTER TABLE yagna_sevarthi_signups_new RENAME TO yagna_sevarthi_signups;

CREATE INDEX IF NOT EXISTS idx_yagna_signups_mobile ON yagna_sevarthi_signups(mobile);
CREATE INDEX IF NOT EXISTS idx_yagna_signups_samaj_name ON yagna_sevarthi_signups(samaj_name);
CREATE INDEX IF NOT EXISTS idx_yagna_signups_status ON yagna_sevarthi_signups(status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_yagna_signups_identity
  ON yagna_sevarthi_signups (lower(trim(first_name)), lower(trim(last_name)), mobile)
  WHERE is_deleted = 0;
