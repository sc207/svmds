-- A padhramani's escort can now be EITHER a Management team (existing
-- escort_team_id/escort_team) OR one or more individual Devotees picked
-- from the central registry -- the two decided-but-not-yet-built options
-- from the access-matrix memory note on Visits' escort model, extended to
-- allow MULTIPLE individual escorts per visit (a padhramani often needs
-- more than one person, unlike a single team pick).
--
-- Individual escorts are a roster, not a single FK column: this mirrors
-- the meeting_members / session_members link-table pattern (migration 013)
-- rather than reinventing it. escort_team_id and this roster are mutually
-- exclusive per visit (enforced in server/routes/visits.js, not a DB
-- constraint -- SQLite can't easily express "team XOR roster" across two
-- separate tables). No backfill needed: every existing visit keeps its
-- team-only escort untouched.
CREATE TABLE IF NOT EXISTS visit_escort_devotees (
  visit_id   TEXT NOT NULL REFERENCES visits(id),
  devotee_id INTEGER NOT NULL REFERENCES devotees(id),
  PRIMARY KEY (visit_id, devotee_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_escort_devotees_devotee ON visit_escort_devotees(devotee_id);
