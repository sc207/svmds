-- ============================================================
-- 002_admin_role.sql
-- Add the second-tier 'admin' role. SQLite can't ALTER a CHECK
-- constraint, so rebuild user_roles with the widened enum.
-- user_roles is a leaf table (nothing references it) and rows are
-- copied across, so this is safe with FKs on and inside a txn.
-- ============================================================
CREATE TABLE user_roles_new (
  user_id INTEGER NOT NULL REFERENCES users(id),
  -- 'admin' = full read + full module CRUD; only 'superadmin' may grant/revoke
  -- admin|superadmin, impersonate, or import/wipe the database.
  role    TEXT NOT NULL CHECK (role IN
            ('superadmin','admin','management_lead','pooja_coordinator',
             'committee_leader','event_incharge','accountant')),
  PRIMARY KEY (user_id, role)
);

INSERT INTO user_roles_new (user_id, role) SELECT user_id, role FROM user_roles;

DROP TABLE user_roles;

ALTER TABLE user_roles_new RENAME TO user_roles;

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
