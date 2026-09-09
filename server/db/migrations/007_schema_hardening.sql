-- ============================================================
-- 007_schema_hardening.sql
-- Additive: person-link columns the app was missing, fast-join
-- plain indexes, and reporting / integrity views.
--
-- NO UNIQUE indexes here. server/db/repair.js creates the partial
-- UNIQUE indexes AFTER it has merged existing duplicates, because a
-- CREATE UNIQUE INDEX on already-dirty data aborts the whole file.
--
-- Runner limits (server/db/migrate.js splitStatements): every ';'
-- ends a statement and every '--' to end-of-line is stripped, so:
-- no CREATE TRIGGER, no ';' inside a string literal, no '--' inside
-- a string literal. Single-statement DDL + CREATE VIEW only.
-- ============================================================

-- ---------- new person-link columns (bare ADD COLUMN, mirrors 005 / 006) ----------
ALTER TABLE guests ADD COLUMN devotee_id INTEGER REFERENCES devotees(id);
ALTER TABLE events ADD COLUMN in_charge_devotee_id INTEGER REFERENCES devotees(id);

-- ---------- rebuild pooja_coordinator_links so an account-less devotee can coordinate ----------
-- Old: (pooja_id, user_id NOT NULL) PRIMARY KEY. New: user_id nullable, devotee_id
-- added, composite PK dropped (uniqueness restored by repair.js as two partial
-- UNIQUE indexes). Leaf table -> DROP is FK-safe, same as 002's user_roles rebuild.
CREATE TABLE pooja_coordinator_links_new (
  pooja_id   TEXT NOT NULL REFERENCES poojas(id),
  user_id    INTEGER REFERENCES users(id),
  devotee_id INTEGER REFERENCES devotees(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO pooja_coordinator_links_new (pooja_id, user_id, devotee_id)
  SELECT l.pooja_id, l.user_id, u.devotee_id
  FROM pooja_coordinator_links l
  LEFT JOIN users u ON u.id = l.user_id;

DROP TABLE pooja_coordinator_links;

ALTER TABLE pooja_coordinator_links_new RENAME TO pooja_coordinator_links;

-- ---------- plain (non-unique) indexes: safe even with duplicate data ----------
CREATE INDEX IF NOT EXISTS idx_pcoord_pooja          ON pooja_coordinator_links(pooja_id);
CREATE INDEX IF NOT EXISTS idx_pcoord_user           ON pooja_coordinator_links(user_id);
CREATE INDEX IF NOT EXISTS idx_pcoord_devotee        ON pooja_coordinator_links(devotee_id);
CREATE INDEX IF NOT EXISTS idx_guests_devotee        ON guests(devotee_id);
CREATE INDEX IF NOT EXISTS idx_events_incharge_dev   ON events(in_charge_devotee_id);
CREATE INDEX IF NOT EXISTS idx_sevarthis_devotee     ON sevarthis(devotee_id);
CREATE INDEX IF NOT EXISTS idx_visits_devotee        ON visits(devotee_id);
CREATE INDEX IF NOT EXISTS idx_committee_members_dev ON committee_members(devotee_id);
CREATE INDEX IF NOT EXISTS idx_team_members_dev      ON team_members(devotee_id);
CREATE INDEX IF NOT EXISTS idx_users_devotee         ON users(devotee_id);
CREATE INDEX IF NOT EXISTS idx_devotees_mobile       ON devotees(mobile);
CREATE INDEX IF NOT EXISTS idx_donors_mobile         ON donors(mobile);
CREATE INDEX IF NOT EXISTS idx_sevarthis_mobile      ON sevarthis(mobile);
CREATE INDEX IF NOT EXISTS idx_donations_receipt     ON donations(receipt_no);

-- ---------- reporting / integrity views (one statement each, no inner ';') ----------
CREATE VIEW IF NOT EXISTS v_donation_effective_amount AS
  SELECT d.id AS donation_id,
         CASE WHEN d.amount > 0 THEN d.amount ELSE d.valuation END AS effective_amount
  FROM donations d
  WHERE d.is_deleted = 0;

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
         FROM pooja_coordinator_links WHERE devotee_id IS NOT NULL;

CREATE VIEW IF NOT EXISTS v_devotee_dupes AS
  SELECT d.id AS devotee_id, d.code, d.name, d.mobile, d.city,
         CASE WHEN d.mobile <> '' THEN 'mobile:' || d.mobile
              ELSE 'namecity:' || lower(trim(d.name)) || '|' || lower(trim(d.city)) END AS dupe_key
  FROM devotees d
  WHERE d.is_deleted = 0;

CREATE VIEW IF NOT EXISTS v_monthly_finance AS
  SELECT m.month AS month,
         COALESCE(dn.received, 0) AS donations_received,
         COALESCE(dn.pledged, 0)  AS donations_pledged,
         COALESCE(ex.paid, 0)     AS expenses_paid,
         COALESCE(ex.pending, 0)  AS expenses_pending
  FROM (SELECT DISTINCT substr(date, 1, 7) AS month FROM donations WHERE is_deleted = 0
        UNION SELECT DISTINCT substr(date, 1, 7) FROM expenses WHERE is_deleted = 0) m
  LEFT JOIN (SELECT substr(date, 1, 7) AS month,
                    SUM(CASE WHEN status = 'received' THEN (CASE WHEN amount > 0 THEN amount ELSE valuation END) ELSE 0 END) AS received,
                    SUM(CASE WHEN status = 'pledged'  THEN (CASE WHEN amount > 0 THEN amount ELSE valuation END) ELSE 0 END) AS pledged
             FROM donations WHERE is_deleted = 0 GROUP BY substr(date, 1, 7)) dn ON dn.month = m.month
  LEFT JOIN (SELECT substr(date, 1, 7) AS month,
                    SUM(CASE WHEN status = 'Paid'    THEN amount ELSE 0 END) AS paid,
                    SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END) AS pending
             FROM expenses WHERE is_deleted = 0 GROUP BY substr(date, 1, 7)) ex ON ex.month = m.month;

CREATE VIEW IF NOT EXISTS v_upcoming_poojas AS
  SELECT p.id AS pooja_id, p.code, p.name, p.status,
         s.id AS session_id, s.date, s.start_time, s.venue
  FROM poojas p JOIN pooja_sessions s ON s.pooja_id = p.id
  WHERE p.is_deleted = 0 AND s.is_deleted = 0 AND s.date >= date('now');

CREATE VIEW IF NOT EXISTS v_upcoming_events AS
  SELECT e.id AS event_id, e.code, e.name, e.status,
         d.id AS day_id, d.date, d.start_time
  FROM events e JOIN event_days d ON d.event_id = e.id
  WHERE e.is_deleted = 0 AND d.is_deleted = 0 AND d.date >= date('now');
