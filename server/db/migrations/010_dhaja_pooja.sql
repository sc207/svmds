-- ============================================================
-- 010_dhaja_pooja.sql
-- Dhaja Pooja: campaigns (the February 108 + one occasion per
-- special temple day) and the sponsorship register. A sponsorship
-- is a canonical devotee -> a cash `donations` row (category
-- DCT-011 "Dhaja Pooja Seva") linked back here via donation_id.
-- Additive only.
--
-- Runner limits (server/db/migrate.js splitStatements): every ';'
-- ends a statement and every '--' to end-of-line is stripped, so:
-- no CREATE TRIGGER, no ';' inside a string literal, no '--' inside
-- a string literal. Single-statement DDL + CREATE VIEW only.
-- New dhaja_* tables are empty on every environment, so the partial
-- UNIQUE index below cannot abort the file.
-- ============================================================

CREATE TABLE IF NOT EXISTS dhaja_campaigns (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE,
  name            TEXT NOT NULL,
  name_gu         TEXT NOT NULL DEFAULT '',
  target_count    INTEGER NOT NULL DEFAULT 0,
  start_date      TEXT,
  end_date        TEXT,
  annual_event_id INTEGER REFERENCES annual_events(id),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes           TEXT NOT NULL DEFAULT '',
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS dhaja_poojas (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE,
  campaign_id     TEXT REFERENCES dhaja_campaigns(id),
  seq_no          INTEGER,
  devotee_id      INTEGER REFERENCES devotees(id),
  sponsor_name    TEXT NOT NULL DEFAULT '',
  sponsor_mobile  TEXT NOT NULL DEFAULT '',
  annual_event_id INTEGER REFERENCES annual_events(id),
  scheduled_date  TEXT,
  performed_date  TEXT,
  pledge_amount   REAL NOT NULL DEFAULT 0,
  donation_id     TEXT REFERENCES donations(id),
  status          TEXT NOT NULL DEFAULT 'sponsored' CHECK (status IN ('reserved','sponsored','performed','cancelled')),
  notes           TEXT NOT NULL DEFAULT '',
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dhaja_seq ON dhaja_poojas(campaign_id, seq_no) WHERE seq_no IS NOT NULL AND is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_dhaja_campaign         ON dhaja_poojas(campaign_id);
CREATE INDEX IF NOT EXISTS idx_dhaja_devotee          ON dhaja_poojas(devotee_id);
CREATE INDEX IF NOT EXISTS idx_dhaja_donation         ON dhaja_poojas(donation_id);
CREATE INDEX IF NOT EXISTS idx_dhaja_sched            ON dhaja_poojas(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_dhaja_annual           ON dhaja_poojas(annual_event_id);
CREATE INDEX IF NOT EXISTS idx_dhaja_campaigns_annual ON dhaja_campaigns(annual_event_id);

CREATE VIEW IF NOT EXISTS v_cal_dhaja AS
  SELECT COALESCE(dp.performed_date, dp.scheduled_date) AS date,
         '' AS time,
         'dhaja' AS type,
         dp.code AS scope_id,
         COALESCE(NULLIF(dp.sponsor_name, ''), 'Dhaja Pooja') AS title,
         '#B8860B' AS color,
         '' AS label,
         '' AS venue
  FROM dhaja_poojas dp
  WHERE dp.is_deleted = 0
    AND dp.status <> 'cancelled'
    AND COALESCE(dp.performed_date, dp.scheduled_date) IS NOT NULL;

-- v_person_links is the generic "where is this devotee used" query behind
-- DELETE /devotees/:id's 409 guard. CREATE VIEW IF NOT EXISTS will not replace
-- an existing view, so drop and re-create it: the whole 007 body restated plus
-- one dhaja_sponsor branch.
DROP VIEW IF EXISTS v_person_links;

CREATE VIEW IF NOT EXISTS v_person_links AS
       SELECT devotee_id AS devotee_id, 'user' AS link_type, CAST(id AS TEXT) AS ref_id
         FROM users WHERE devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT devotee_id, 'committee_member', CAST(id AS TEXT)
         FROM committee_members WHERE devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT devotee_id, 'team_member', CAST(id AS TEXT)
         FROM team_members WHERE devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT devotee_id, 'sevarthi', CAST(id AS TEXT)
         FROM sevarthis WHERE devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT devotee_id, 'donor', CAST(id AS TEXT)
         FROM donors WHERE devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT devotee_id, 'visit', CAST(id AS TEXT)
         FROM visits WHERE devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT devotee_id, 'guest', CAST(id AS TEXT)
         FROM guests WHERE devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT leader_devotee_id, 'committee_leader', CAST(id AS TEXT)
         FROM committees WHERE leader_devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT lead_devotee_id, 'team_lead', CAST(id AS TEXT)
         FROM teams WHERE lead_devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT in_charge_devotee_id, 'event_incharge', CAST(id AS TEXT)
         FROM events WHERE in_charge_devotee_id IS NOT NULL AND is_deleted = 0
  UNION ALL SELECT devotee_id, 'pooja_coordinator', CAST(pooja_id AS TEXT)
         FROM pooja_coordinator_links WHERE devotee_id IS NOT NULL
  UNION ALL SELECT devotee_id, 'dhaja_sponsor', CAST(id AS TEXT)
         FROM dhaja_poojas WHERE devotee_id IS NOT NULL AND is_deleted = 0;
