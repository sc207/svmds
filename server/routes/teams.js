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
const { ensureDevotee, addAsMember, digits } = require('../services/people');
const { nextColorFor } = require('../services/palette');
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
    const color = req.body.color || await nextColorFor('teams');   // auto-cycled, no picker
    const r = await run(
      `INSERT INTO teams (code, name, description, color, expected_team_size, notes, created_date)
       VALUES (?, ?, ?, ?, ?, ?, date('now'))`,
      [code, name, req.body.description || '', color,
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
    const sess = await queryAll('SELECT id FROM volunteering_sessions WHERE team_id = ?', [row.id]);
    await run(`UPDATE teams SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await run(`UPDATE team_members SET is_deleted = 1, updated_at = datetime('now') WHERE team_id = ? AND is_deleted = 0`, [row.id]);
    await run(`UPDATE volunteering_sessions SET is_deleted = 1 WHERE team_id = ? AND is_deleted = 0`, [row.id]);
    for (const s of sess) await run(`DELETE FROM attendance WHERE context_type = 'volunteering' AND context_id = ?`, [String(s.id)]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'DELETE', entityType: 'team', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- lead assignment (admin tier) ----------
   body: { userId } — an account holder, OR { devoteeId } — no login account */
router.post('/:id/lead', adminTier, async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });

    let u = null, devId = null;
    if (req.body.userId != null && String(req.body.userId).trim()) {
      u = await queryOne('SELECT * FROM users WHERE id = ? AND is_deleted = 0', [parseInt(req.body.userId, 10) || -1]);
      if (!u) return res.status(400).json({ error: 'Unknown userId' });
      devId = u.devotee_id;
    } else if (req.body.devoteeId != null && String(req.body.devoteeId).trim()) {
      const d = await queryOne('SELECT * FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
        [parseInt(req.body.devoteeId, 10) || -1, String(req.body.devoteeId)]);
      if (!d) return res.status(400).json({ error: 'Unknown devoteeId' });
      devId = d.id;
      u = await queryOne('SELECT * FROM users WHERE devotee_id = ? AND is_deleted = 0', [d.id]);
    } else {
      return res.status(400).json({ error: 'userId or devoteeId is required' });
    }

    const uid = u ? u.id : null;
    if (!devId && u) {
      devId = await ensureDevotee({ name: u.name || String(u.email || '').split('@')[0], mobile: u.mobile, city: u.city });
      if (devId) await run('UPDATE users SET devotee_id = ? WHERE id = ?', [devId, uid]);
    }

    const prev = row.lead_id;
    await run(`UPDATE teams SET lead_id = ?, lead_devotee_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [uid, devId, row.id]);
    if (uid) {
      const has = await queryOne('SELECT 1 AS x FROM user_roles WHERE user_id = ? AND role = ?', [uid, 'management_lead']);
      if (!has) await run(`INSERT INTO user_roles (user_id, role) SELECT ?, ? WHERE NOT EXISTS
                           (SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?)`, [uid, 'management_lead', uid, 'management_lead']);
    }
    if (prev && prev !== uid) {
      const still = await queryOne('SELECT 1 AS x FROM teams WHERE lead_id = ? AND is_deleted = 0 LIMIT 1', [prev]);
      if (!still) await run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', [prev, 'management_lead']);
      await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [prev]);
    }
    if (devId) await addAsMember({ kind: 'team', entityId: row.id, devoteeId: devId, role: 'Lead' });

    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
      action: 'GRANT', entityType: 'management_lead', entityId: String(uid || 'dev:' + devId), scopeId: row.code });
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
    const mobile = digits(b.mobile);
    if (mobile && mobile.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });

    let devoteeId = null;
    if (b.devoteeId != null && String(b.devoteeId).trim()) {
      const dev = await queryOne('SELECT id FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
        [parseInt(b.devoteeId, 10) || -1, String(b.devoteeId)]);
      if (!dev) return res.status(400).json({ error: 'That devotee no longer exists' });
      devoteeId = dev.id;
    } else {
      const first = String(b.firstName || '').trim();
      if (!first && !b.name && !mobile) return res.status(400).json({ error: 'devoteeId or firstName is required' });
      devoteeId = await ensureDevotee({
        firstName: first, lastName: b.lastName, name: b.name, mobile,
        city: b.city, state: b.state, samaj: b.samaj,
      });
    }

    const prior = await queryOne(
      'SELECT id, is_deleted FROM team_members WHERE team_id = ? AND devotee_id = ? ORDER BY is_deleted ASC LIMIT 1',
      [row.id, devoteeId]);
    if (prior && !prior.is_deleted) return res.status(409).json({ error: 'Already a member of this team' });
    if (prior && prior.is_deleted) {
      await run(`UPDATE team_members SET is_deleted = 0, role = ?, status = 'active', updated_at = datetime('now') WHERE id = ?`,
        [b.role || 'Volunteer', prior.id]);
      return res.status(200).json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
    }
    if (mobile) {
      const dupM = await queryOne('SELECT id FROM team_members WHERE team_id = ? AND mobile = ? AND is_deleted = 0', [row.id, mobile]);
      if (dupM) return res.status(409).json({ error: 'Already a member of this team' });
    }

    const dev = await queryOne('SELECT * FROM devotees WHERE id = ?', [devoteeId]);
    const parts = String((dev && dev.name) || b.firstName || '').trim().split(/\s+/);
    const first = parts.shift() || (b.firstName || '');
    try {
      const code = await nextCode('team_member');
      await run(
        `INSERT INTO team_members (code, team_id, devotee_id, first_name, last_name, mobile, city, state, role, status, notes, joined_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, date('now'))`,
        [code, row.id, devoteeId, first, parts.join(' ') || (b.lastName || ''),
         (dev && dev.mobile) || mobile, (dev && dev.city) || b.city || '',
         (dev && dev.state) || b.state || 'Gujarat', b.role || 'Volunteer', b.notes || '']
      );
      await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Management',
        action: 'CREATE', entityType: 'team_member', entityId: code, scopeId: row.code });
    } catch (e) {
      // lost a concurrent race against ux_team_members_td — the pair now exists
      const now = await queryOne('SELECT id FROM team_members WHERE team_id = ? AND devotee_id = ? AND is_deleted = 0', [row.id, devoteeId]);
      if (!now) throw e;
    }
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
    let newMobile;
    if (req.body.mobile !== undefined) {
      const mob = digits(req.body.mobile);
      if (mob && mob.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });
      sets.push('mobile = ?'); args.push(mob);
      newMobile = mob;
    }
    if (req.body.status === 'active' || req.body.status === 'inactive') { sets.push('status = ?'); args.push(req.body.status); }
    if (sets.length) {
      sets.push(`updated_at = datetime('now')`);
      args.push(m.id);
      await run(`UPDATE team_members SET ${sets.join(', ')} WHERE id = ?`, args);
    }

    if (m.devotee_id) {
      if (newMobile && newMobile.length === 10) {
        const other = await queryOne('SELECT id FROM devotees WHERE mobile = ? AND is_deleted = 0', [newMobile]);
        if (other && other.id !== m.devotee_id) {
          await run('UPDATE team_members SET devotee_id = ? WHERE id = ?', [other.id, m.id]);
        }
      }
      const ds = [], da = [];
      if (typeof req.body.firstName === 'string' || typeof req.body.lastName === 'string') {
        const nm = `${req.body.firstName != null ? req.body.firstName : m.first_name} ${req.body.lastName != null ? req.body.lastName : m.last_name}`.trim();
        if (nm) { ds.push(`name = CASE WHEN name IN ('', '(unnamed)') THEN ? ELSE name END`); da.push(nm); }
      }
      if (newMobile) { ds.push(`mobile = CASE WHEN mobile = '' THEN ? ELSE mobile END`); da.push(newMobile); }
      if (typeof req.body.city === 'string' && req.body.city.trim()) { ds.push(`city = CASE WHEN city = '' THEN ? ELSE city END`); da.push(req.body.city.trim()); }
      if (ds.length) { da.push(m.devotee_id); await run(`UPDATE devotees SET ${ds.join(', ')} WHERE id = ?`, da); }
    }
    res.json(await hydrate(await queryOne('SELECT * FROM teams WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id/members/:mid', async (req, res, next) => {
  try {
    const row = await teamByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Team not found' });
    if (!leadCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const m = await queryOne('SELECT id FROM team_members WHERE (id = ? OR code = ?) AND team_id = ?',
      [parseInt(req.params.mid, 10) || -1, req.params.mid, row.id]);
    if (m) {
      await run(`UPDATE team_members SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [m.id]);
      const sess = await queryAll('SELECT id, member_ids_json FROM volunteering_sessions WHERE team_id = ?', [row.id]);
      for (const s of sess) {
        let ids; try { ids = JSON.parse(s.member_ids_json || '[]'); } catch (_) { ids = []; }
        const kept = ids.filter(x => String(x) !== String(m.id));
        if (kept.length !== ids.length) await run('UPDATE volunteering_sessions SET member_ids_json = ? WHERE id = ?', [JSON.stringify(kept), s.id]);
        await run(`DELETE FROM attendance WHERE context_type = 'volunteering' AND context_id = ? AND member_id = ?`, [String(s.id), m.id]);
      }
    }
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
    const s = await queryOne('SELECT id FROM volunteering_sessions WHERE (id = ? OR code = ?) AND team_id = ?', [req.params.sid, req.params.sid, row.id]);
    if (s) {
      await run('UPDATE volunteering_sessions SET is_deleted = 1 WHERE id = ?', [s.id]);
      await run(`DELETE FROM attendance WHERE context_type = 'volunteering' AND context_id = ?`, [String(s.id)]);
    }
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

    // one person = one devotee: resolve first, then dedupe the roster on
    // (team_id, devotee_id) — reactivate a soft-deleted row rather than insert.
    const [first, ...rest] = String(su.name || '').trim().split(/\s+/);
    const devoteeId = await ensureDevotee({
      firstName: first, lastName: rest.join(' '), name: su.name, mobile: su.mobile, city: su.city,
    });
    let member = devoteeId
      ? await queryOne('SELECT * FROM team_members WHERE team_id = ? AND devotee_id = ? ORDER BY is_deleted ASC LIMIT 1', [row.id, devoteeId])
      : null;
    if (!member && su.mobile) {
      member = await queryOne('SELECT * FROM team_members WHERE team_id = ? AND mobile = ? AND is_deleted = 0', [row.id, su.mobile]);
    }
    if (member && member.is_deleted) {
      await run(`UPDATE team_members SET is_deleted = 0, status = 'active', updated_at = datetime('now') WHERE id = ?`, [member.id]);
      member = await queryOne('SELECT * FROM team_members WHERE id = ?', [member.id]);
    }
    if (!member) {
      try {
        const code = await nextCode('team_member');
        const r = await run(
          `INSERT INTO team_members (code, team_id, devotee_id, first_name, last_name, mobile, city, state, role, status, joined_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Gujarat', 'Volunteer', 'active', date('now'))`,
          [code, row.id, devoteeId, first || su.name, rest.join(' '), su.mobile, su.city || '']
        );
        member = await queryOne('SELECT * FROM team_members WHERE id = ?', [r.lastInsertRowid]);
      } catch (e) {
        member = await queryOne('SELECT * FROM team_members WHERE team_id = ? AND devotee_id = ? ORDER BY is_deleted ASC LIMIT 1', [row.id, devoteeId]);
        if (!member) throw e;
        if (member.is_deleted) {
          await run(`UPDATE team_members SET is_deleted = 0, status = 'active', updated_at = datetime('now') WHERE id = ?`, [member.id]);
          member = await queryOne('SELECT * FROM team_members WHERE id = ?', [member.id]);
        }
      }
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
