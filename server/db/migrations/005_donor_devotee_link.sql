-- ============================================================
-- 005_donor_devotee_link.sql
-- An individual donor is a person too — link them to the shared devotees
-- registry (deduped by mobile) exactly like committee members, team members,
-- sevarthis and visits already are. Organizations / trusts stay unlinked.
-- ============================================================
ALTER TABLE donors ADD COLUMN devotee_id INTEGER REFERENCES devotees(id);

CREATE INDEX IF NOT EXISTS idx_donors_devotee ON donors(devotee_id);
