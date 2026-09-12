-- ============================================================
-- 014_drop_dead_columns.sql
-- Schema-only cleanup: drop columns that no code path writes any more.
--
--   devotees.samaj          - deprecated: samaj is a committee_members
--                              link now (see samaj-equals-committee), not a
--                              devotees property. Every write path that used
--                              to fill this column (POST/PATCH /devotees,
--                              the shared ensureDevotee() helper used by
--                              committees/teams/users/donors/sevarthis/
--                              dhaja routes, and db/repair.js's dedupe merge)
--                              was updated in the same change to stop
--                              referencing it before this migration runs.
--   users.totp_secret /
--   users.totp_enabled       - 2FA was never implemented (003 already said
--                              so); grepped clean, no route reads or writes
--                              these.
--
-- NOTE: committees.created_date / teams.created_date were considered for
-- this cleanup and REJECTED — routes/committees.js and routes/teams.js
-- POST / still actively write `date('now')` into them on every create
-- (they only read NULL on the 3 seed rows, which bypass that route). They
-- stay.
--
-- No data is lost: every dropped column is already blank on every row of
-- the live export this migration was audited against (svmds.db,
-- 2026-09-12). Requires SQLite/libSQL >= 3.35 (DROP COLUMN) - already
-- relied on by Turso prod. Runner limits (server/db/migrate.js
-- splitStatements): every ';' ends a statement, single-statement DDL only.
-- ============================================================

ALTER TABLE devotees DROP COLUMN samaj;

ALTER TABLE users DROP COLUMN totp_secret;

ALTER TABLE users DROP COLUMN totp_enabled;
