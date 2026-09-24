-- Accounts & access — carried over from the portal (Google Sign-In).
-- IF NOT EXISTS throughout: on the production database these three tables
-- survive the Phase 1 reset (server/db/wipe.js) with their rows, so this
-- migration must be a no-op there and create them only on a fresh database.
-- users.devotee_id is kept for shape compatibility with the surviving table
-- and is unused in Phase 1 (no FK: the devotee register is a different table now).

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  devotee_id   INTEGER,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  mobile       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  active       INTEGER NOT NULL DEFAULT 1,
  google_sub   TEXT,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id),
  role    TEXT NOT NULL CHECK (role IN
            ('superadmin','admin','management_lead','pooja_coordinator',
             'committee_leader','event_incharge','accountant')),
  PRIMARY KEY (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

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
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
