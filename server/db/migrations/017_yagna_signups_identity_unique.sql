-- No duplicate Maha Yagna registrations: same first name + last name +
-- mobile number (case/whitespace-insensitive) can only exist once among
-- live rows. Enforced at the DB layer, not just app-level pre-checks, so
-- concurrent identical submits can never both succeed (FEATURE_INTEGRATION.md
-- — "the DB is the final safety layer"). See MAHA_YAGNA_PLAN.md.
CREATE UNIQUE INDEX IF NOT EXISTS ux_yagna_signups_identity
  ON yagna_sevarthi_signups (lower(trim(first_name)), lower(trim(last_name)), mobile)
  WHERE is_deleted = 0;
