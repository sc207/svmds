-- ============================================================
-- 003_google_auth.sql
-- Google Sign-In replaces the passwordless TOTP / email-OTP model.
-- Record the Google account subject id on the user row so a returning
-- sign-in can be matched by a stable id, not just the email.
-- The totp_secret / totp_enabled columns from 001 are now dead
-- (never read, never written) — left in place; a later migration may drop them.
-- ============================================================
ALTER TABLE users ADD COLUMN google_sub TEXT;

CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
