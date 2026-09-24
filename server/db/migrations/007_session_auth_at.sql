-- When the person behind a session last proved who they are with Google —
-- at sign-in, and again whenever a risky action asks them to confirm
-- (POST /api/auth/reconfirm). Risky actions refuse a session whose auth_at is
-- older than 15 minutes (middleware/auth.js needsFreshAuth). NULL on sessions
-- that existed before this column: they fall back to created_at. UTC, like
-- the rest of the sessions table.
ALTER TABLE sessions ADD COLUMN auth_at TEXT;
