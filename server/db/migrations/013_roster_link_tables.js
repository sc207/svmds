/* ============================================================
   013_roster_link_tables.js  —  imperative, deterministic, STRICT

   Part 2 of the canonical-person refactor. Replaces the opaque
   `member_ids_json` roster arrays with real link tables, and makes
   `attendance.member_id` self-describing.

     A. CREATE meeting_members(meeting_id, committee_member_id) and
        session_members(session_id, team_member_id) + indexes.
     B. backfill both from the existing member_ids_json arrays, dropping
        any id that no longer exists in the target member table.
     C. ALTER attendance ADD COLUMN member_type; backfill from context_type
        ('meeting' -> 'committee_member', 'volunteering' -> 'team_member').

   The member_ids_json columns are KEPT for one release as a read
   fallback; the routes now write both. FAIL-HARD: a throw aborts the
   migration. Idempotent (CREATE IF NOT EXISTS / INSERT OR IGNORE /
   WHERE-guarded). No repairDatabase() call.
   ============================================================ */
async function hasColumn(queryAll, table, col) {
  const rows = await queryAll(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === col);
}
async function tableExists(queryOne, name) {
  return !!(await queryOne(`SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]));
}

module.exports.up = async function up({ queryAll, queryOne, run }) {
  /* ---- A: link tables ---- */
  await run(`CREATE TABLE IF NOT EXISTS meeting_members (
    meeting_id          TEXT NOT NULL REFERENCES meetings(id),
    committee_member_id INTEGER NOT NULL REFERENCES committee_members(id),
    PRIMARY KEY (meeting_id, committee_member_id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS session_members (
    session_id     TEXT NOT NULL REFERENCES volunteering_sessions(id),
    team_member_id INTEGER NOT NULL REFERENCES team_members(id),
    PRIMARY KEY (session_id, team_member_id)
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_meeting_members_member ON meeting_members(committee_member_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_session_members_member ON session_members(team_member_id)`);

  if (!(await tableExists(queryOne, 'meeting_members')) || !(await tableExists(queryOne, 'session_members'))) {
    throw new Error('013: roster link tables did not persist after CREATE.');
  }

  /* ---- B: backfill from member_ids_json (validated) ---- */
  const backfill = async (srcTable, srcIdCol, linkTable, ctxCol, memCol, memTable) => {
    const rows = await queryAll(`SELECT ${srcIdCol} AS cid, member_ids_json AS j FROM ${srcTable}`);
    for (const r of rows) {
      let ids;
      try { ids = JSON.parse(r.j || '[]'); } catch (_) { ids = []; }
      const want = [...new Set((ids || []).map((x) => String(x).trim()).filter(Boolean))];
      for (const key of want) {
        const m = await queryOne(
          `SELECT id FROM ${memTable} WHERE (id = ? OR code = ?) AND is_deleted = 0`,
          [parseInt(key, 10) || -1, key]);
        if (m) await run(`INSERT OR IGNORE INTO ${linkTable} (${ctxCol}, ${memCol}) VALUES (?, ?)`, [String(r.cid), m.id]);
      }
    }
  };
  await backfill('meetings', 'id', 'meeting_members', 'meeting_id', 'committee_member_id', 'committee_members');
  await backfill('volunteering_sessions', 'id', 'session_members', 'session_id', 'team_member_id', 'team_members');

  /* ---- C: attendance discriminator ---- */
  if (!(await hasColumn(queryAll, 'attendance', 'member_type'))) {
    await run(`ALTER TABLE attendance ADD COLUMN member_type TEXT NOT NULL DEFAULT ''`);
  }
  await run(
    `UPDATE attendance SET member_type =
       CASE context_type WHEN 'meeting' THEN 'committee_member'
                         WHEN 'volunteering' THEN 'team_member'
                         ELSE member_type END
     WHERE COALESCE(member_type, '') = ''`
  );

  const mm = await queryOne(`SELECT COUNT(*) AS n FROM meeting_members`);
  const sm = await queryOne(`SELECT COUNT(*) AS n FROM session_members`);
  console.log(`  · 013 roster-link-tables: meeting_members ${mm.n}, session_members ${sm.n}, attendance.member_type backfilled`);
};
