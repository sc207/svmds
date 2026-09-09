/* Committee / Samaj governance — committees + members + meetings + attendance
   + communication + drafts. Scope: admin tier sees all; a committee_leader sees
   only committees where leader_id = them (req.scope.committeeIds). Create /
   delete / leader assignment are admin tier; a leader may manage their own
   committee's members, meetings, attendance, communication, drafts.
   (BACKEND_PLAN.md §5 Committee) */
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
  mapCommittee, mapCommitteeMember, mapMeeting,
} = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

async function committeeByIdOrCode(v) {
  return queryOne('SELECT * FROM committees WHERE (id = ? OR code = ?) AND is_deleted = 0',
    [parseInt(v, 10) || -1, v]);
}

async function hydrate(row) {
  if (!row) return null;
  const [members, meetingRows, communication, drafts] = await Promise.all([
    queryAll('SELECT * FROM committee_members WHERE committee_id = ? AND is_deleted = 0 ORDER BY first_name', [row.id]),
    queryAll('SELECT * FROM meetings WHERE committee_id = ? AND is_deleted = 0 ORDER BY date DESC', [row.id]),
    shared.getCommunication('committee', row.id),
    shared.listDrafts('committee', row.id),
  ]);
  const meetings = [];
  for (const m of meetingRows) {
    meetings.push(mapMeeting(m, await shared.getAttendance('meeting', m.id)));
  }
  return mapCommittee(row, { members: members.map(mapCommitteeMember), meetings, communication, drafts });
}

function leaderCanManage(req, row) {
  if (isAdminTier(req.user)) return true;
  return (req.user.roles || []).includes('committee_leader')
    && (req.scope.committeeIds || []).includes(row.id);
}

/* ---------- list / get ---------- */
router.get('/', async (req, res, next) => {
  try {
    let rows;
    if (!isAdminTier(req.user) && (req.user.roles || []).includes('committee_leader')) {
      const ids = req.scope.committeeIds || [];
      if (!ids.length) return res.json([]);
      rows = await queryAll(
        `SELECT * FROM committees WHERE is_deleted = 0 AND id IN (${ids.map(() => '?').join(',')}) ORDER BY name`, ids);
    } else {
      rows = await queryAll('SELECT * FROM committees WHERE is_deleted = 0 ORDER BY name');
    }
    const out = [];
    for (const r of rows) out.push(await hydrate(r));
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!isAdminTier(req.user) && (req.user.roles || []).includes('committee_leader')
        && !(req.scope.committeeIds || []).includes(row.id)) {
      return res.status(403).json({ error: 'Not your committee' });
    }
    res.json(await hydrate(row));
  } catch (e) { next(e); }
});

/* ---------- create / patch / delete ---------- */
router.post('/', adminTier, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const code = await nextCode('committee');
    const color = req.body.color || await nextColorFor('committees');   // auto-cycled, no picker
    const r = await run(
      `INSERT INTO committees (code, name, samaj, purpose, color, expected_size, notes, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))`,
      [code, name, req.body.samaj || '', req.body.purpose || '', color,
       parseInt(req.body.expectedSize, 10) || 0, req.body.notes || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Committee',
      action: 'CREATE', entityType: 'committee', entityId: code, details: { name } });
    res.status(201).json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [r.lastInsertRowid])));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const map = { name: 'name', samaj: 'samaj', purpose: 'purpose', color: 'color', notes: 'notes' };
    const sets = [], args = [];
    for (const [k, col] of Object.entries(map)) {
      if (typeof req.body[k] === 'string') { sets.push(`${col} = ?`); args.push(req.body[k]); }
    }
    if (req.body.expectedSize !== undefined) { sets.push('expected_size = ?'); args.push(parseInt(req.body.expectedSize, 10) || 0); }
    if (req.body.status === 'active' || req.body.status === 'inactive') { sets.push('status = ?'); args.push(req.body.status); }
    if (!sets.length) return res.json(await hydrate(row));
    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE committees SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Committee',
      action: 'UPDATE', entityType: 'committee', entityId: row.code });
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    await run(`UPDATE committees SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Committee',
      action: 'DELETE', entityType: 'committee', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- leader assignment (admin tier) ----------
   body: { userId }  — an account holder, OR
          { devoteeId } — a devotee with NO login account (id or code) */
router.post('/:id/leader', adminTier, async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });

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
      u = await queryOne('SELECT * FROM users WHERE devotee_id = ? AND is_deleted = 0', [d.id]);  // may be null
    } else {
      return res.status(400).json({ error: 'userId or devoteeId is required' });
    }

    const uid = u ? u.id : null;
    if (!devId && u) {
      devId = await ensureDevotee({ name: u.name || String(u.email || '').split('@')[0], mobile: u.mobile, city: u.city });
      if (devId) await run('UPDATE users SET devotee_id = ? WHERE id = ?', [devId, uid]);
    }

    const prevLeader = row.leader_id;
    await run(`UPDATE committees SET leader_id = ?, leader_devotee_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [uid, devId, row.id]);

    if (uid) {
      const has = await queryOne('SELECT 1 AS x FROM user_roles WHERE user_id = ? AND role = ?', [uid, 'committee_leader']);
      if (!has) await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [uid, 'committee_leader']);
    }
    if (prevLeader && prevLeader !== uid) {
      const stillLeads = await queryOne('SELECT 1 AS x FROM committees WHERE leader_id = ? AND is_deleted = 0 LIMIT 1', [prevLeader]);
      if (!stillLeads) await run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', [prevLeader, 'committee_leader']);
      await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [prevLeader]);
    }
    if (devId) await addAsMember({ kind: 'committee', entityId: row.id, devoteeId: devId, role: 'Leader' });

    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Committee',
      action: 'GRANT', entityType: 'committee_leader', entityId: String(uid || 'dev:' + devId), scopeId: row.code });
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* ---------- members (add-or-reuse by mobile, link devotee) ---------- */
router.post('/:id/members', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body || {};
    const mobile = digits(b.mobile);
    if (mobile && mobile.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });

    // resolve the person to ONE devotee: an explicit devoteeId wins; else
    // create-or-reuse from the name / mobile.
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
        city: b.city, state: b.state, samaj: b.samaj || row.samaj,
      });
    }

    // one row per (committee, person): 409 if already active, reactivate if removed
    const prior = await queryOne(
      'SELECT id, is_deleted FROM committee_members WHERE committee_id = ? AND devotee_id = ? ORDER BY is_deleted ASC LIMIT 1',
      [row.id, devoteeId]);
    if (prior && !prior.is_deleted) return res.status(409).json({ error: 'Already a member of this committee' });
    if (prior && prior.is_deleted) {
      await run(`UPDATE committee_members SET is_deleted = 0, role = ?, status = 'active', updated_at = datetime('now') WHERE id = ?`,
        [b.role || 'Member', prior.id]);
      return res.status(200).json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
    }
    if (mobile) {
      const dupM = await queryOne('SELECT id FROM committee_members WHERE committee_id = ? AND mobile = ? AND is_deleted = 0', [row.id, mobile]);
      if (dupM) return res.status(409).json({ error: 'Already a member of this committee' });
    }

    const dev = await queryOne('SELECT * FROM devotees WHERE id = ?', [devoteeId]);
    const parts = String((dev && dev.name) || b.firstName || '').trim().split(/\s+/);
    const first = parts.shift() || (b.firstName || '');
    const code = await nextCode('committee_member');
    await run(
      `INSERT INTO committee_members (code, committee_id, devotee_id, first_name, last_name, mobile, city, state, role, status, notes, joined_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, date('now'))`,
      [code, row.id, devoteeId, first, parts.join(' ') || (b.lastName || ''),
       (dev && dev.mobile) || mobile, (dev && dev.city) || b.city || '',
       (dev && dev.state) || b.state || 'Gujarat', b.role || 'Member', b.notes || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Committee',
      action: 'CREATE', entityType: 'committee_member', entityId: code, scopeId: row.code });
    res.status(201).json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.patch('/:id/members/:mid', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const m = await queryOne('SELECT * FROM committee_members WHERE (id = ? OR code = ?) AND committee_id = ? AND is_deleted = 0',
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
      await run(`UPDATE committee_members SET ${sets.join(', ')} WHERE id = ?`, args);
    }

    // keep the person identity in step: a new 10-digit mobile that resolves to a
    // different devotee repoints the row; otherwise backfill blanks on the linked
    // devotee from the edited fields.
    if (m.devotee_id) {
      if (newMobile && newMobile.length === 10) {
        const other = await queryOne('SELECT id FROM devotees WHERE mobile = ? AND is_deleted = 0', [newMobile]);
        if (other && other.id !== m.devotee_id) {
          await run('UPDATE committee_members SET devotee_id = ? WHERE id = ?', [other.id, m.id]);
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
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id/members/:mid', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await run(`UPDATE committee_members SET is_deleted = 1, updated_at = datetime('now') WHERE (id = ? OR code = ?) AND committee_id = ?`,
      [parseInt(req.params.mid, 10) || -1, req.params.mid, row.id]);
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* ---------- meetings ---------- */
router.post('/:id/meetings', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body || {};
    if (!b.title || !b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
      return res.status(400).json({ error: 'title and date (YYYY-MM-DD) are required' });
    }
    const id = crypto.randomUUID();
    const code = await nextCode('meeting');
    await run(
      `INSERT INTO meetings (id, code, committee_id, title, date, start_time, end_time, venue, agenda, member_ids_json, notes, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, code, row.id, b.title, b.date, b.startTime || '', b.endTime || '', b.venue || '',
       b.agenda || '', JSON.stringify(b.memberIds || []), b.notes || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Committee',
      action: 'CREATE', entityType: 'meeting', entityId: code, scopeId: row.code });
    res.status(201).json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.patch('/:id/meetings/:mid', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const mt = await queryOne('SELECT * FROM meetings WHERE (id = ? OR code = ?) AND committee_id = ? AND is_deleted = 0',
      [req.params.mid, req.params.mid, row.id]);
    if (!mt) return res.status(404).json({ error: 'Meeting not found' });
    const b = req.body || {};
    const sets = [], args = [];
    for (const [k, col] of Object.entries({ title: 'title', startTime: 'start_time', endTime: 'end_time', venue: 'venue', agenda: 'agenda', notes: 'notes' })) {
      if (typeof b[k] === 'string') { sets.push(`${col} = ?`); args.push(b[k]); }
    }
    if (b.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'bad date' });
      sets.push('date = ?'); args.push(b.date);
    }
    if (b.memberIds !== undefined) { sets.push('member_ids_json = ?'); args.push(JSON.stringify(b.memberIds || [])); }
    if (b.completed !== undefined) { sets.push('completed = ?'); args.push(b.completed ? 1 : 0); }
    if (sets.length) {
      sets.push(`updated_at = datetime('now')`);
      args.push(mt.id);
      await run(`UPDATE meetings SET ${sets.join(', ')} WHERE id = ?`, args);
    }
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id/meetings/:mid', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await run('UPDATE meetings SET is_deleted = 1 WHERE (id = ? OR code = ?) AND committee_id = ?',
      [req.params.mid, req.params.mid, row.id]);
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* PUT /:id/meetings/:mid/attendance  { entries:[{memberId,status}] } */
router.put('/:id/meetings/:mid/attendance', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const mt = await queryOne('SELECT * FROM meetings WHERE (id = ? OR code = ?) AND committee_id = ? AND is_deleted = 0',
      [req.params.mid, req.params.mid, row.id]);
    if (!mt) return res.status(404).json({ error: 'Meeting not found' });
    await shared.setAttendance('meeting', mt.id, req.body.entries || []);
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

/* ---------- communication + drafts ---------- */
router.put('/:id/communication', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await shared.setCommunication('committee', row.id, req.body || {});
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.post('/:id/drafts', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await shared.addDraft('committee', row.id, req.body || {});
    res.status(201).json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.patch('/:id/drafts/:did', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const out = await shared.updateDraft(req.params.did, req.body || {});
    if (!out) return res.status(404).json({ error: 'Draft not found' });
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id/drafts/:did', async (req, res, next) => {
  try {
    const row = await committeeByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Committee not found' });
    if (!leaderCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await shared.deleteDraft(req.params.did);
    res.json(await hydrate(await queryOne('SELECT * FROM committees WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

module.exports = router;
