-- ============================================================
-- 015_devotee_category.sql
-- Adds a persisted classification to devotees: Normal / VIP / Guest /
-- Gurudev-Bhuvaji. A real attribute of the person (like `status`), NOT a
-- group-membership relationship — contrast with `samaj` (dropped in 014):
-- samaj was committee_members membership in disguise, derivable via
-- devotees.js devoteeSamajLabel(). Category has no corresponding
-- relationship table to derive from, so a plain CHECK-constrained column
-- is the correct model, exactly like `status`.
--
-- Internal values: normal | vip | guest | gurudev_bhuvaji (the slash
-- compound "Gurudev/Bhuvaji" folded to one snake_case token; display text
-- is "Gurudev/Bhuvaji"). Default 'normal' fills every existing row — no
-- backfill/dedup pass needed, this is a brand-new column.
--
-- Runner limits (server/db/migrate.js splitStatements): every ';' ends a
-- statement, single-statement DDL only.
-- ============================================================

ALTER TABLE devotees ADD COLUMN category TEXT NOT NULL DEFAULT 'normal'
  CHECK (category IN ('normal','vip','guest','gurudev_bhuvaji'));
