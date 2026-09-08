-- ============================================================
-- 006_devotee_leaders.sql
-- A committee / team leader is a devotee, and does NOT need a login account.
-- leader_id / lead_id (→ users) stay for scoping when the leader also has an
-- account; leader_devotee_id / lead_devotee_id record the person either way.
-- ============================================================
ALTER TABLE committees ADD COLUMN leader_devotee_id INTEGER REFERENCES devotees(id);
ALTER TABLE teams      ADD COLUMN lead_devotee_id   INTEGER REFERENCES devotees(id);

CREATE INDEX IF NOT EXISTS idx_committees_leader_dev ON committees(leader_devotee_id);
CREATE INDEX IF NOT EXISTS idx_teams_lead_dev        ON teams(lead_devotee_id);
