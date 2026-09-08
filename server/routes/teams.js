/* Management module — volunteer teams + members + volunteering sessions +
   attendance + public volunteering page + public signups + communication +
   drafts. Scope: admin tier sees all; a management_lead sees only teams where
   lead_id = them (req.scope.teamIds). Create / delete / lead assignment are
   admin tier; a lead manages their own team. Badges are a pure client render —
   no API. (BACKEND_PLAN.md §2 Management) */
const express = require('express');
const crypto = require('crypto');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole, isAdminTier } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const shared = require('../services/sharedTables');
const {
  mapTeam, mapTeamMember, mapVolunteeringSession, mapPublicPage,
} = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

const teamByIdOrCode = v =>
  queryOne('SELECT * FROM teams WHERE (id = ? OR code = ?) AND is_deleted = 0', [parseInt(v, 10) || -1, v]);

async function hydrate(row) {
  if (!row) return null;
  const [members, sessRows, ppRow, communication, drafts, pending] = await Promise.all([
    queryAll('SELECT * FROM team_members WHERE team_id = ? AND is_deleted = 0 ORDER BY first_name', [row.id]),
    queryAll('SELECT * FROM volunteering_sessions WHERE team_id = ? AND is_deleted = 0 ORDER BY date DESC', [row.id]),
    queryOne('SELECT * FROM public_pages WHERE team_id = ?', [row.id]),
    shared.getCommunication('team', row.id),
    shared.listDrafts('team', row.id),
    queryOne('SELECT COUNT(*) AS n FROM public_signups WHERE team_id = ? AND status = ? AND is_deleted = 0', [row.id, 'pending']),
  ]);
  const sessions = [];
  for (const s of sessRows) sessions.push(mapVolunteeringSession(s, await shared.getAttendance('volunteering', s.id)));
  return mapTeam(row, {
    members: members.map(mapTeamMember),
    sessions,
    publicPage: mapPublicPage(ppRow),
    communication,
    drafts,
    pendingSignups: pending ? pending.n : 0,
  });
}

function leadCanManage(req, row) {
  if (isAdminTier(req.user)) return true;
  return (req.user.roles || []).includes('management_lead') && (req.scope.teamIds || []).includes(row.id);
}

/* ---------- list / get ---------- */
router.get('/', async (req, res, next) => {
  try {
    let rows;
    if (!isAdminTier(req.user) && (req.user.roles || []).includes('management_lead')) {
      const ids = req.scope.teamIds || [];
      if (!ids.length) return res.json([]);
      rows = await queryAll(`SELECT * FROM teams WHERE is_deleted = 0 AND id IN (${ids.map(() => '?').join(',')}) ORDER BY name`, ids);
    } else {
      rows = await queryAll('SELECT * FROM teams WHERE is_deleted = 0 ORDER BY name');
    }
    const out = [];
    for (const r of rows) out.push(await hydrate(r));
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!isAdminTier(req.user) && (req.user.roles || []).includes('management_lead')
        && !(req.scope.teamIds || []).includes(row.id)) {
      return res.status(403).json({ error: 'Not your team' });
    }
    res.json(await hydrate(row));
  } catch (e) { next(e); }
});

/* ---------- create / patch / delete ---------- */
router.post('/', adminTier, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const code = await nextCode('team');
    const r = await run(
      `INSERT INTO teams (code, name, description, color, expected_team_size, notes, created_date)
       VALUES (?, ?, ?, ?, ?, ?, date('now'))`,
      [code, name, req.body.description || '', req.body.color || '#6B1F2A',
       parseInt(req.body.expectedTeamSize, 10) || 0, req.body.notes || '']
    );
    await run('INSERT INTO public_pages (team_id, enabled) VALUES (?, 0)', [r.lastInsertRowid]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'CREATE', entityType: 'team', entityId: code, details: { name } });
    res.status(201).json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [r.lastInsertRowid])));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const map = { name: 'name', description: 'description', color: 'color', notes: 'notes' };
    const sets = [], args = [];
    for (const [k, col] of Object.entries(map)) {
      if (typeof req.body[k] === 'string') { sets.push(`${col} = ?`); args.push(req.body[k]); }
    }
    if (req.body.expectedTeamSize !== undefined) { sets.push('expected_team_size = ?'); args.push(parseInt(req.body.expectedTeamSize, 10) || 0); }
    if (req.body.status === 'active' || req.body.status === 'inactive') { sets.push('status = ?'); args.push(req.body.status); }
    if (!sets.length) return res.json(await hydrate(row));
    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'UPDATE', entityType: 'team', entityId: row.code });
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    await run(`UPDATE teams SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'DELETE', entityType: 'team', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- lead assignment (admin tier) ---------- */
router.post('/:id/lead', adminTier, async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    const uid = parseInt(req.body.userId, 10);
    const u = uid ? await queryOne('SELECT * FROM users WHERE id = ? AND is_deleted = 0', [uid]) : null;
    if (!u) return res.status(400).json({ error: 'Unknown userId' });
    const prev = row.lead_id;
    await run(`UPDATE teams SET lead_id = ?, updated_at = datetime('now') WHERE id = ?`, [uid, row.id]);
    const has = await queryOne('SELECT 1 AS x FROM user_roles WHERE user_id = ? AND role = ?', [uid, 'management_lead']);
    if (!has) await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [uid, 'management_lead']);
    if (prev && prev !== uid) {
      const still = await queryOne('SELECT 1 AS x FROM teams WHERE lead_id = ? AND is_deleted = 0 LIMIT 1', [prev]);
      if (!still) await run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', [prev, 'management_lead']);
      await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [prev]);
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'GRANT', entityType: 'management_lead', entityId: String(uid), scopeId: row.code });
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* ---------- members ---------- */
router.post('/:id/members', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body || {};
    const first = String(b.firstName || '').trim();
    const mobile = String(b.mobile || '').trim();
    if (!first) return res.status(400).json({ error: 'firstName is required' });
    if (mobile && !/^[0-9]{10}$/.test(mobile)) return res.status(400).json({ error: 'mobile must be 10 digits' });
    if (mobile) {
      const dup = await queryOne('SELECT id FROM team_members WHERE team_id = ? AND mobile = ? AND is_deleted = 0', [row.id, mobile]);
      if (dup) return res.status(409).json({ error: 'Already a member of this team' });
    }
    let devoteeId = null;
    if (mobile) {
      const dev = await queryOne('SELECT id FROM devotees WHERE mobile = ? AND is_deleted = 0', [mobile]);
      devoteeId = dev ? dev.id : null;
    }
    const code = await nextCode('team_member');
    await run(
      `INSERT INTO team_members (code, team_id, devotee_id, first_name, last_name, mobile, city, state, role, status, notes, joined_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, date('now'))`,
      [code, row.id, devoteeId, first, b.lastName || '', mobile, b.city || '', b.state || 'Gujarat', b.role || 'Volunteer', b.notes || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'CREATE', entityType: 'team_member', entityId: code, scopeId: row.code });
    res.status(201).json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.patch('/:id/members/:mid', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const m = await queryOne('SELECT * FROM team_members WHERE (id = ? OR code = ?) AND team_id = ? AND is_deleted = 0',
      [parseInt(req.params.mid, 10) || -1, req.params.mid, row.id]);
    if (!m) return res.status(404).json({ error: 'Member not found' });
    const map = { firstName: 'first_name', lastName: 'last_name', city: 'city', state: 'state', role: 'role', notes: 'notes' };
    const sets = [], args = [];
    for (const [k, col] of Object.entries(map)) {
      if (typeof req.body[k] === 'string') { sets.push(`${col} = ?`); args.push(req.body[k]); }
    }
    if (req.body.status === 'active' || req.body.status === 'inactive') { sets.push('status = ?'); args.push(req.body.status); }
    if (sets.length) {
      sets.push(`updated_at = datetime('now')`);
      args.push(m.id);
      await run(`UPDATE team_members SET ${sets.join(', ')} WHERE id = ?`, args);
    }
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id/members/:mid', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await run(`UPDATE team_members SET is_deleted = 1, updated_at = datetime('now') WHERE (id = ? OR code = ?) AND team_id = ?`,
      [parseInt(req.params.mid, 10) || -1, req.params.mid, row.id]);
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* ---------- volunteering sessions ---------- */
router.post('/:id/sessions', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body || {};
    if (!b.title || !b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
      return res.status(400).json({ error: 'title and date (YYYY-MM-DD) are required' });
    }
    const id = crypto.randomUUID();
    const code = await nextCode('volunteering');
    await run(
      `INSERT INTO volunteering_sessions (id, code, team_id, title, date, start_time, end_time, location, member_ids_json, notes, completed, public_open)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, code, row.id, b.title, b.date, b.startTime || '', b.endTime || '', b.location || '',
       JSON.stringify(b.memberIds || []), b.notes || '', b.publicOpen ? 1 : 0]
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'CREATE', entityType: 'volunteering_session', entityId: code, scopeId: row.code });
    res.status(201).json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.patch('/:id/sessions/:sid', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const s = await queryOne('SELECT * FROM volunteering_sessions WHERE (id = ? OR code = ?) AND team_id = ? AND is_deleted = 0',
      [req.params.sid, req.params.sid, row.id]);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const b = req.body || {};
    const sets = [], args = [];
    for (const [k, col] of Object.entries({ title: 'title', startTime: 'start_time', endTime: 'end_time', location: 'location', notes: 'notes' })) {
      if (typeof b[k] === 'string') { sets.push(`${col} = ?`); args.push(b[k]); }
    }
    if (b.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'bad date' });
      sets.push('date = ?'); args.push(b.date);
    }
    if (b.memberIds !== undefined) { sets.push('member_ids_json = ?'); args.push(JSON.stringify(b.memberIds || [])); }
    if (b.completed !== undefined) { sets.push('completed = ?'); args.push(b.completed ? 1 : 0); }
    if (b.publicOpen !== undefined) { sets.push('public_open = ?'); args.push(b.publicOpen ? 1 : 0); }
    if (sets.length) {
      sets.push(`updated_at = datetime('now')`);
      args.push(s.id);
      await run(`UPDATE volunteering_sessions SET ${sets.join(', ')} WHERE id = ?`, args);
    }
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id/sessions/:sid', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await run('UPDATE volunteering_sessions SET is_deleted = 1 WHERE (id = ? OR code = ?) AND team_id = ?',
      [req.params.sid, req.params.sid, row.id]);
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.put('/:id/sessions/:sid/attendance', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const s = await queryOne('SELECT * FROM volunteering_sessions WHERE (id = ? OR code = ?) AND team_id = ? AND is_deleted = 0',
      [req.params.sid, req.params.sid, row.id]);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    await shared.setAttendance('volunteering', s.id, req.body.entries || []);
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* ---------- communication + drafts ---------- */
router.put('/:id/communication', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await shared.setCommunication('team', row.id, req.body || {});
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.post('/:id/drafts', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await shared.addDraft('team', row.id, req.body || {});
    res.status(201).json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.patch('/:id/drafts/:did', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    if (!await shared.updateDraft(req.params.did, req.body || {})) return res.status(404).json({ error: 'Draft not found' });
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id/drafts/:did', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await shared.deleteDraft(req.params.did);
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* ---------- public page config ---------- */
router.put('/:id/public-page', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body || {};
    await run(
      `INSERT INTO public_pages (team_id, enabled, intro, contact, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(team_id) DO UPDATE SET
         enabled = excluded.enabled, intro = excluded.intro,
         contact = excluded.contact, updated_at = excluded.updated_at`,
      [row.id, b.enabled ? 1 : 0, b.intro || '', b.contact || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'UPDATE', entityType: 'public_page', entityId: row.code, details: { enabled: !!b.enabled } });
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* ---------- public signups (review queue) ---------- */
router.get('/:id/signups', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const { mapSignup } = require('../utils/mappers');
    const rows = await queryAll(
      `SELECT * FROM public_signups WHERE team_id = ? AND is_deleted = 0
       ${req.query.status ? 'AND status = ?' : ''} ORDER BY submitted_at DESC`,
      req.query.status ? [row.id, req.query.status] : [row.id]
    );
    res.json(rows.map(mapSignup));
  } catch (e) { next(e); }
});

router.post('/:id/signups/:sid/approve', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const su = await queryOne('SELECT * FROM public_signups WHERE (id = ? OR code = ?) AND team_id = ? AND is_deleted = 0',
      [req.params.sid, req.params.sid, row.id]);
    if (!su) return res.status(404).json({ error: 'Signup not found' });
    if (su.status === 'approved') return res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));

    // create the team member (dedupe by mobile) and attach to the session
    let member = su.mobile
      ? await queryOne('SELECT * FROM team_members WHERE team_id = ? AND mobile = ? AND is_deleted = 0', [row.id, su.mobile])
      : null;
    if (!member) {
      const [first, ...rest] = String(su.name || '').trim().split(/\s+/);
      let devoteeId = null;
      if (su.mobile) {
        const dev = await queryOne('SELECT id FROM devotees WHERE mobile = ? AND is_deleted = 0', [su.mobile]);
        devoteeId = dev ? dev.id : null;
      }
      const code = await nextCode('team_member');
      const r = await run(
        `INSERT INTO team_members (code, team_id, devotee_id, first_name, last_name, mobile, city, state, role, status, joined_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Gujarat', 'Volunteer', 'active', date('now'))`,
        [code, row.id, devoteeId, first || su.name, rest.join(' '), su.mobile, su.city || '']
      );
      member = await queryOne('SELECT * FROM team_members WHERE id = ?', [r.lastInsertRowid]);
    }
    const sess = await queryOne('SELECT * FROM volunteering_sessions WHERE id = ? AND is_deleted = 0', [su.session_id]);
    if (sess) {
      let ids = [];
      try { ids = JSON.parse(sess.member_ids_json || '[]'); } catch (_) {}
      if (!ids.includes(member.id)) {
        ids.push(member.id);
        await run('UPDATE volunteering_sessions SET member_ids_json = ? WHERE id = ?', [JSON.stringify(ids), sess.id]);
      }
    }
    await run('UPDATE public_signups SET status = ? WHERE id = ?', ['approved', su.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'APPROVE', entityType: 'public_signup', entityId: su.code, scopeId: row.code });
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.post('/:id/signups/:sid/decline', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await run('UPDATE public_signups SET status = ? WHERE (id = ? OR code = ?) AND team_id = ?',
      ['declined', req.params.sid, req.params.sid, row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'DECLINE', entityType: 'public_signup', entityId: req.params.sid, scopeId: row.code });
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

module.exports = router;
