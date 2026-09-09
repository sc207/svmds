-- ============================================================
-- 009_reminder_seen.sql
-- "Opening announcement" daily-seen state. NOT an event copy —
-- the announcement content is always derived live from the
-- canonical pooja / meeting / session / event / annual-event /
-- visit rows (server/services/reminders.js). This table only
-- records "user U already saw reminder K on working-date D", so
-- the full-screen announcement shows at most once per user per
-- day per activity.
--
-- reminder_key is a stable per-occurrence string, e.g.
--   pooja:PJA-012:PSN-uuid   meeting:MTG-004   session:VOL-002
--   event:EVN-003:2026-10-20   annual:ANE-002:2026   visit:VIS-009
-- seen_on is the app's working-date (app_settings.working_date),
-- never the server wall clock, so it matches every other "today"
-- in the app.
--
-- The composite UNIQUE is the race barrier: a double-click, two
-- tabs, or a retry can't write two "seen" rows. The route does
-- INSERT ... WHERE NOT EXISTS on top.
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_seen (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  reminder_key TEXT NOT NULL,
  seen_on      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_reminder_seen ON reminder_seen(user_id, reminder_key, seen_on);
CREATE INDEX IF NOT EXISTS idx_reminder_seen_user_day ON reminder_seen(user_id, seen_on);
