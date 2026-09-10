/* Helpers for the tables shared by the Committee and Management modules:
   attendance (context 'meeting' | 'volunteering'), communication
   (context 'committee' | 'team'), message_drafts (same). Keeps the two
   route files from duplicating this logic. */
const { queryAll, queryOne, run } = require('../db/connection');
const { nextCode } = require('./entityCode');
const { mapCommunication, mapDraft, mapAttendance } = require('../utils/mappers');

/* ---------- attendance ---------- */
async function getAttendance(contextType, contextId) {
  const rows = await queryAll(
    'SELECT * FROM attendance WHERE context_type = ? AND context_id = ?',
    [contextType, String(contextId)]
  );
  return rows.map(mapAttendance);
}

/** entries: [{ memberId, status:'present'|'absent' }] — upsert each. */
async function setAttendance(contextType, contextId, entries) {
  for (const e of (entries || [])) {
    const status = e.status === 'present' ? 'present' : 'absent';
    await run(
      `INSERT INTO attendance (context_type, context_id, member_id, status, marked_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(context_type, context_id, member_id)
       DO UPDATE SET status = excluded.status, marked_at = excluded.marked_at`,
      [contextType, String(contextId), parseInt(e.memberId, 10), status]
    );
  }
  return getAttendance(contextType, contextId);
}

/* ---------- communication ---------- */
async function getCommunication(contextType, contextId) {
  const row = await queryOne(
    'SELECT * FROM communication WHERE context_type = ? AND context_id = ?',
    [contextType, contextId]
  );
  return mapCommunication(row);
}

async function setCommunication(contextType, contextId, b) {
  await run(
    `INSERT INTO communication (context_type, context_id, group_name, group_link, broadcast_name, broadcast_link, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(context_type, context_id) DO UPDATE SET
       group_name = excluded.group_name, group_link = excluded.group_link,
       broadcast_name = excluded.broadcast_name, broadcast_link = excluded.broadcast_link,
       updated_at = excluded.updated_at`,
    [contextType, contextId, b.groupName || '', b.groupLink || '', b.broadcastName || '', b.broadcastLink || '']
  );
  return getCommunication(contextType, contextId);
}

/* ---------- drafts ---------- */
async function listDrafts(contextType, contextId) {
  const rows = await queryAll(
    'SELECT * FROM message_drafts WHERE context_type = ? AND context_id = ? AND is_deleted = 0 ORDER BY updated_at DESC',
    [contextType, contextId]
  );
  return rows.map(mapDraft);
}

async function addDraft(contextType, contextId, b) {
  const code = await nextCode('message_draft');
  await run(
    `INSERT INTO message_drafts (code, context_type, context_id, title, message, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [code, contextType, contextId, b.title || '', b.message || '']
  );
  return listDrafts(contextType, contextId);
}

async function updateDraft(draftIdOrCode, b) {
  const row = await queryOne('SELECT * FROM message_drafts WHERE (id = ? OR code = ?) AND is_deleted = 0',
    [parseInt(draftIdOrCode, 10) || -1, draftIdOrCode]);
  if (!row) return null;
  await run(
    `UPDATE message_drafts SET title = ?, message = ?, updated_at = datetime('now') WHERE id = ?`,
    [b.title !== undefined ? b.title : row.title, b.message !== undefined ? b.message : row.message, row.id]
  );
  return listDrafts(row.context_type, row.context_id);
}

async function deleteDraft(draftIdOrCode) {
  const row = await queryOne('SELECT * FROM message_drafts WHERE (id = ? OR code = ?) AND is_deleted = 0',
    [parseInt(draftIdOrCode, 10) || -1, draftIdOrCode]);
  if (!row) return null;
  await run('UPDATE message_drafts SET is_deleted = 1 WHERE id = ?', [row.id]);
  return listDrafts(row.context_type, row.context_id);
}

/* ---------- roster link tables (013) ----------
   kind: 'meeting' (→ meeting_members / committee_members) | 'session'
   (→ session_members / team_members). Replaces member_ids_json.
   Works in CODE space (CMM-### / MEM-####) to match mapCommitteeMember /
   mapTeamMember `.id`; the link tables store the numeric member id. */
const ROSTER = {
  meeting: { table: 'meeting_members', ctx: 'meeting_id', mem: 'committee_member_id', memTable: 'committee_members' },
  session: { table: 'session_members', ctx: 'session_id', mem: 'team_member_id', memTable: 'team_members' },
};
async function getRoster(kind, contextId) {
  const r = ROSTER[kind]; if (!r) return [];
  const rows = await queryAll(
    `SELECT m.code AS code, m.id AS id FROM ${r.table} l JOIN ${r.memTable} m ON m.id = l.${r.mem}
     WHERE l.${r.ctx} = ? AND m.is_deleted = 0 ORDER BY m.id`, [String(contextId)]);
  return rows.map(x => x.code || String(x.id));
}
/** Replace the roster with the VALID subset of `memberIds` (numeric id OR
    code); returns the codes kept. */
async function setRoster(kind, contextId, memberIds) {
  const r = ROSTER[kind]; if (!r) return [];
  const want = [...new Set((memberIds || []).map(x => String(x).trim()).filter(Boolean))];
  const valid = [];
  await run(`DELETE FROM ${r.table} WHERE ${r.ctx} = ?`, [String(contextId)]);
  for (const key of want) {
    const m = await queryOne(
      `SELECT id, code FROM ${r.memTable} WHERE (id = ? OR code = ?) AND is_deleted = 0`,
      [parseInt(key, 10) || -1, key]);
    if (!m) continue;
    await run(`INSERT OR IGNORE INTO ${r.table} (${r.ctx}, ${r.mem}) VALUES (?, ?)`, [String(contextId), m.id]);
    valid.push(m.code || String(m.id));
  }
  return valid;
}
/** Drop a member from every roster of its kind (member removal / devotee delete). */
async function dropMemberFromRosters(kind, memberIdOrCode) {
  const r = ROSTER[kind]; if (!r || memberIdOrCode == null) return;
  const m = await queryOne(`SELECT id FROM ${r.memTable} WHERE id = ? OR code = ?`,
    [parseInt(memberIdOrCode, 10) || -1, String(memberIdOrCode)]);
  if (m) await run(`DELETE FROM ${r.table} WHERE ${r.mem} = ?`, [m.id]);
}

module.exports = {
  getAttendance, setAttendance,
  getCommunication, setCommunication,
  listDrafts, addDraft, updateDraft, deleteDraft,
  getRoster, setRoster, dropMemberFromRosters,
};
