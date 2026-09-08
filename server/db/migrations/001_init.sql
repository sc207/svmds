-- ============================================================
-- 001_init.sql  —  Shri Vihat Meldi Mata Mandir (SVMMMS)
-- Conventions: BACKEND_PLAN.md §2.1
--   registries/catalogs -> INTEGER PK AUTOINCREMENT + code TEXT UNIQUE
--   transactions/events  -> TEXT PK (uuid) + code TEXT UNIQUE
--   is_deleted 0/1 on every table; deletes are UPDATE ... SET is_deleted = 1
--   money REAL, booleans INTEGER 0/1, dates/times TEXT ISO
--   every status/kind/type/purpose column has a CHECK (col IN (...))
-- ============================================================
PRAGMA foreign_keys = ON;

-- ---------- platform ----------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS counters (
  name       TEXT PRIMARY KEY,
  prefix     TEXT NOT NULL,
  pad        INTEGER NOT NULL DEFAULT 3,
  next_value INTEGER NOT NULL DEFAULT 1
);

-- ---------- identity / auth --------------------------------
CREATE TABLE IF NOT EXISTS devotees (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,
  name       TEXT NOT NULL,
  mobile     TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT 'Gujarat',
  samaj      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes      TEXT NOT NULL DEFAULT '',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  devotee_id   INTEGER REFERENCES devotees(id),
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  mobile       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  active       INTEGER NOT NULL DEFAULT 1,
  totp_secret  TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id),
  role    TEXT NOT NULL CHECK (role IN
            ('superadmin','management_lead','pooja_coordinator',
             'committee_leader','event_incharge','accountant')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  user_email      TEXT NOT NULL DEFAULT '',
  user_agent      TEXT NOT NULL DEFAULT '',
  ip              TEXT NOT NULL DEFAULT '',
  impersonated_by INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen       TEXT NOT NULL DEFAULT (datetime('now')),
  revoked         INTEGER NOT NULL DEFAULT 0
);

-- ---------- Management module ------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT UNIQUE,
  name               TEXT NOT NULL,
  lead_id            INTEGER REFERENCES users(id),
  description        TEXT NOT NULL DEFAULT '',
  color              TEXT NOT NULL DEFAULT '#6B1F2A',
  expected_team_size INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes              TEXT NOT NULL DEFAULT '',
  created_date       TEXT,
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);

CREATE TABLE IF NOT EXISTS team_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  devotee_id  INTEGER REFERENCES devotees(id),
  first_name  TEXT NOT NULL DEFAULT '',
  last_name   TEXT NOT NULL DEFAULT '',
  mobile      TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL DEFAULT 'Gujarat',
  role        TEXT NOT NULL DEFAULT 'Volunteer',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes       TEXT NOT NULL DEFAULT '',
  joined_date TEXT,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS volunteering_sessions (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE,
  team_id         INTEGER NOT NULL REFERENCES teams(id),
  title           TEXT NOT NULL,
  date            TEXT NOT NULL,
  start_time      TEXT NOT NULL DEFAULT '',
  end_time        TEXT NOT NULL DEFAULT '',
  location        TEXT NOT NULL DEFAULT '',
  member_ids_json TEXT NOT NULL DEFAULT '[]',
  notes           TEXT NOT NULL DEFAULT '',
  completed       INTEGER NOT NULL DEFAULT 0,
  public_open     INTEGER NOT NULL DEFAULT 0,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS public_pages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id    INTEGER NOT NULL UNIQUE REFERENCES teams(id),
  enabled    INTEGER NOT NULL DEFAULT 0,
  intro      TEXT NOT NULL DEFAULT '',
  contact    TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS public_signups (
  id           TEXT PRIMARY KEY,
  code         TEXT UNIQUE,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  session_id   TEXT NOT NULL REFERENCES volunteering_sessions(id),
  name         TEXT NOT NULL,
  mobile       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  is_deleted   INTEGER NOT NULL DEFAULT 0
);

-- ---------- Committee / Samaj module ----------------------
CREATE TABLE IF NOT EXISTS committees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT UNIQUE,
  name          TEXT NOT NULL,
  leader_id     INTEGER REFERENCES users(id),
  samaj         TEXT NOT NULL DEFAULT '',
  purpose       TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#6B1F2A',
  expected_size INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes         TEXT NOT NULL DEFAULT '',
  created_date  TEXT,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS committee_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT UNIQUE,
  committee_id INTEGER NOT NULL REFERENCES committees(id),
  devotee_id   INTEGER REFERENCES devotees(id),
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT NOT NULL DEFAULT '',
  mobile       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  state        TEXT NOT NULL DEFAULT 'Gujarat',
  role         TEXT NOT NULL DEFAULT 'Member',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes        TEXT NOT NULL DEFAULT '',
  joined_date  TEXT,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS meetings (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE,
  committee_id    INTEGER NOT NULL REFERENCES committees(id),
  title           TEXT NOT NULL,
  date            TEXT NOT NULL,
  start_time      TEXT NOT NULL DEFAULT '',
  end_time        TEXT NOT NULL DEFAULT '',
  venue           TEXT NOT NULL DEFAULT '',
  agenda          TEXT NOT NULL DEFAULT '',
  member_ids_json TEXT NOT NULL DEFAULT '[]',
  notes           TEXT NOT NULL DEFAULT '',
  completed       INTEGER NOT NULL DEFAULT 0,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

-- ---------- shared: attendance / comms / drafts ----------
CREATE TABLE IF NOT EXISTS attendance (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  context_type TEXT NOT NULL CHECK (context_type IN ('volunteering','meeting')),
  context_id   TEXT NOT NULL,
  member_id    INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('present','absent')),
  marked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (context_type, context_id, member_id)
);

CREATE TABLE IF NOT EXISTS communication (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  context_type   TEXT NOT NULL CHECK (context_type IN ('team','committee')),
  context_id     INTEGER NOT NULL,
  group_name     TEXT NOT NULL DEFAULT '',
  group_link     TEXT NOT NULL DEFAULT '',
  broadcast_name TEXT NOT NULL DEFAULT '',
  broadcast_link TEXT NOT NULL DEFAULT '',
  updated_at     TEXT,
  UNIQUE (context_type, context_id)
);

CREATE TABLE IF NOT EXISTS message_drafts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT UNIQUE,
  context_type TEXT NOT NULL CHECK (context_type IN ('team','committee')),
  context_id   INTEGER NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL DEFAULT '',
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Pooja module ---------------------------------
CREATE TABLE IF NOT EXISTS pooja_types (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  code                 TEXT UNIQUE,
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  default_duration_min INTEGER NOT NULL DEFAULT 60,
  suggested_offerings  TEXT NOT NULL DEFAULT '',
  icon                 TEXT NOT NULL DEFAULT '',
  is_deleted           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS poojas (
  id                    TEXT PRIMARY KEY,
  code                  TEXT UNIQUE,
  type_id               INTEGER REFERENCES pooja_types(id),
  name                  TEXT NOT NULL,
  schedule_mode         TEXT NOT NULL DEFAULT 'single' CHECK (schedule_mode IN ('single','multi')),
  default_venue         TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'planned'
                          CHECK (status IN ('planned','today','completed','done','extended','cancelled')),
  color                 TEXT NOT NULL DEFAULT '#6B1F2A',
  estimated_seva_amount REAL NOT NULL DEFAULT 0,
  notes                 TEXT NOT NULL DEFAULT '',
  custom_json           TEXT NOT NULL DEFAULT '[]',
  invitation_json       TEXT NOT NULL DEFAULT '{}',
  extended_until        TEXT,
  completed_on          TEXT,
  created_date          TEXT,
  is_deleted            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT
);

CREATE TABLE IF NOT EXISTS pooja_sessions (
  id         TEXT PRIMARY KEY,
  pooja_id   TEXT NOT NULL REFERENCES poojas(id),
  label      TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time   TEXT NOT NULL DEFAULT '',
  venue      TEXT NOT NULL DEFAULT '',
  is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sevarthis (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,
  devotee_id INTEGER REFERENCES devotees(id),
  first_name TEXT NOT NULL DEFAULT '',
  last_name  TEXT NOT NULL DEFAULT '',
  mobile     TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT 'Gujarat',
  committee  TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes      TEXT NOT NULL DEFAULT '',
  added_date TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name  TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT '',
  mobile     TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT 'Gujarat',
  notes      TEXT NOT NULL DEFAULT '',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pooja_sevarthi_links (
  pooja_id    TEXT NOT NULL REFERENCES poojas(id),
  sevarthi_id INTEGER NOT NULL REFERENCES sevarthis(id),
  PRIMARY KEY (pooja_id, sevarthi_id)
);

CREATE TABLE IF NOT EXISTS pooja_coordinator_links (
  pooja_id TEXT NOT NULL REFERENCES poojas(id),
  user_id  INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (pooja_id, user_id)
);

CREATE TABLE IF NOT EXISTS pooja_guest_links (
  pooja_id TEXT NOT NULL REFERENCES poojas(id),
  guest_id INTEGER NOT NULL REFERENCES guests(id),
  PRIMARY KEY (pooja_id, guest_id)
);

-- ---------- Donations module ----------------------------
CREATE TABLE IF NOT EXISTS donation_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('cash','kind')),
  icon        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS donors (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE,
  type           TEXT NOT NULL DEFAULT 'individual'
                   CHECK (type IN ('individual','organization','trust')),
  first_name     TEXT NOT NULL DEFAULT '',
  last_name      TEXT NOT NULL DEFAULT '',
  org_name       TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  mobile         TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL DEFAULT '',
  state          TEXT NOT NULL DEFAULT 'Gujarat',
  committee      TEXT NOT NULL DEFAULT '',
  pan            TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  added_date     TEXT,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT
);

CREATE TABLE IF NOT EXISTS donations (
  id                 TEXT PRIMARY KEY,
  code               TEXT UNIQUE,
  receipt_no         TEXT,
  cert_no            TEXT,
  donor_id           INTEGER NOT NULL REFERENCES donors(id),
  category_id        INTEGER NOT NULL REFERENCES donation_categories(id),
  mode               TEXT NOT NULL DEFAULT 'Cash',
  amount             REAL NOT NULL DEFAULT 0,
  item               TEXT NOT NULL DEFAULT '',
  qty                TEXT NOT NULL DEFAULT '',
  valuation          REAL NOT NULL DEFAULT 0,
  date               TEXT NOT NULL,
  purpose            TEXT NOT NULL DEFAULT '',
  committee          TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','pledged')),
  certificate_issued INTEGER NOT NULL DEFAULT 0,
  notes              TEXT NOT NULL DEFAULT '',
  recorded_by        TEXT NOT NULL DEFAULT '',
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);

-- ---------- Events module -------------------------------
CREATE TABLE IF NOT EXISTS event_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id                TEXT PRIMARY KEY,
  code              TEXT UNIQUE,
  type_id           INTEGER REFERENCES event_types(id),
  name              TEXT NOT NULL,
  venue             TEXT NOT NULL DEFAULT '',
  in_charge_id      INTEGER REFERENCES users(id),
  expected_footfall INTEGER NOT NULL DEFAULT 0,
  budget            REAL NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'planning'
                      CHECK (status IN ('planning','confirmed','ongoing','completed','cancelled')),
  color             TEXT NOT NULL DEFAULT '#C96A20',
  notes             TEXT NOT NULL DEFAULT '',
  created_date      TEXT,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT
);

CREATE TABLE IF NOT EXISTS event_days (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   TEXT NOT NULL REFERENCES events(id),
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time   TEXT NOT NULL DEFAULT '',
  is_deleted INTEGER NOT NULL DEFAULT 0
);

-- ---------- Visits (padhramani) -------------------------
CREATE TABLE IF NOT EXISTS visits (
  id           TEXT PRIMARY KEY,
  code         TEXT UNIQUE,
  devotee_name TEXT NOT NULL,
  devotee_id   INTEGER REFERENCES devotees(id),
  mobile       TEXT NOT NULL DEFAULT '',
  purpose      TEXT NOT NULL DEFAULT 'other'
                 CHECK (purpose IN ('home_inauguration','shop_opening','wedding_blessing',
                                    'health_blessing','business_puja','festival_padhramani','other')),
  address      TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  state        TEXT NOT NULL DEFAULT 'Gujarat',
  date         TEXT NOT NULL,
  time         TEXT NOT NULL DEFAULT '',
  escort_team  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'requested'
                 CHECK (status IN ('requested','scheduled','confirmed','completed','cancelled')),
  notes        TEXT NOT NULL DEFAULT '',
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);

-- ---------- core registers (app.js state) ---------------
CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT '',
  amount     REAL NOT NULL DEFAULT 0,
  date       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Paid','Pending')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,
  item       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT '',
  stock      TEXT NOT NULL DEFAULT '',
  min_stock  TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'In Stock'
               CHECK (status IN ('In Stock','Low Stock','Out of Stock')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- universal audit log ------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER,
  user_email   TEXT NOT NULL DEFAULT '',
  module       TEXT NOT NULL DEFAULT '',
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL DEFAULT '',
  entity_id    TEXT NOT NULL DEFAULT '',
  scope_id     TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- indexes ------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_role   ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_sessions_user     ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_lead        ON teams(lead_id);
CREATE INDEX IF NOT EXISTS idx_committees_leader ON committees(leader_id);
CREATE INDEX IF NOT EXISTS idx_events_incharge   ON events(in_charge_id);
CREATE INDEX IF NOT EXISTS idx_pcoord_user       ON pooja_coordinator_links(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_cmt_members_cmt   ON committee_members(committee_id);
CREATE INDEX IF NOT EXISTS idx_vsessions_team    ON volunteering_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_vsessions_date    ON volunteering_sessions(date);
CREATE INDEX IF NOT EXISTS idx_meetings_cmt      ON meetings(committee_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date     ON meetings(date);
CREATE INDEX IF NOT EXISTS idx_psessions_pooja   ON pooja_sessions(pooja_id);
CREATE INDEX IF NOT EXISTS idx_psessions_date    ON pooja_sessions(date);
CREATE INDEX IF NOT EXISTS idx_event_days_event  ON event_days(event_id);
CREATE INDEX IF NOT EXISTS idx_event_days_date   ON event_days(date);
CREATE INDEX IF NOT EXISTS idx_visits_date       ON visits(date);
CREATE INDEX IF NOT EXISTS idx_visits_status     ON visits(status);
CREATE INDEX IF NOT EXISTS idx_donations_date    ON donations(date);
CREATE INDEX IF NOT EXISTS idx_donations_status  ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_donor   ON donations(donor_id);
CREATE INDEX IF NOT EXISTS idx_attendance_ctx    ON attendance(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_audit_module_time ON audit_logs(module, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_scope       ON audit_logs(scope_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON audit_logs(entity_type, entity_id);

-- ---------- calendar VIEWs (server-authoritative aggregation) ----
CREATE VIEW IF NOT EXISTS v_cal_pooja AS
  SELECT s.date, s.start_time AS time, 'pooja' AS type, p.id AS scope_id,
         p.name AS title, p.color, s.label, s.venue
  FROM pooja_sessions s JOIN poojas p ON p.id = s.pooja_id
  WHERE s.is_deleted = 0 AND p.is_deleted = 0;

CREATE VIEW IF NOT EXISTS v_cal_meeting AS
  SELECT m.date, m.start_time AS time, 'committee' AS type, c.code AS scope_id,
         m.title, c.color, '' AS label, m.venue
  FROM meetings m JOIN committees c ON c.id = m.committee_id
  WHERE m.is_deleted = 0 AND c.is_deleted = 0;

CREATE VIEW IF NOT EXISTS v_cal_event AS
  SELECT d.date, d.start_time AS time, 'event' AS type, e.id AS scope_id,
         e.name AS title, e.color, '' AS label, e.venue
  FROM event_days d JOIN events e ON e.id = d.event_id
  WHERE d.is_deleted = 0 AND e.is_deleted = 0;

CREATE VIEW IF NOT EXISTS v_cal_visit AS
  SELECT date, time, 'visit' AS type, id AS scope_id,
         devotee_name AS title, '#4C8B5A' AS color, '' AS label, address AS venue
  FROM visits WHERE is_deleted = 0;

CREATE VIEW IF NOT EXISTS v_cal_pledge AS
  SELECT date, '' AS time, 'donation' AS type, id AS scope_id,
         purpose AS title, '#C9A24A' AS color, '' AS label, '' AS venue
  FROM donations WHERE is_deleted = 0 AND status = 'pledged';
