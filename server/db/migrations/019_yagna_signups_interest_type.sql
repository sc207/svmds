-- Generalize the Maha Yagna Sevarthi Registration intake without renaming
-- anything: a registrant's INTEREST (not a confirmed assignment) can now be
-- Maha Yagna, Pooja & Seva, Dhaja Pooja, or left unassigned for staff to
-- decide later. Public page/admin module names, table name, and routes are
-- all deliberately unchanged (user-confirmed) -- this is a scope widening,
-- not a rename/refactor. See MAHA_YAGNA_PLAN.md.
--
-- Every existing row came through the Yagna-only form, so the default
-- 'yagna' is not a guess -- it's the true, only value that could exist
-- before this migration. assigned_pooja_id/category are untouched and stay
-- reserved for a later phase; interest_type must never be conflated with
-- either.
ALTER TABLE yagna_sevarthi_signups
  ADD COLUMN interest_type TEXT NOT NULL DEFAULT 'yagna'
    CHECK (interest_type IN ('yagna', 'pooja_seva', 'dhaja_pooja', 'unassigned'));

CREATE INDEX IF NOT EXISTS idx_yagna_signups_interest_type ON yagna_sevarthi_signups(interest_type);
