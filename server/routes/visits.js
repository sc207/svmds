/* Bappa / Bhuvaji padhramani register. Reads + writes: superadmin/admin only
   (matches ROLE_PAGES) — explicit decision, reversed from an earlier attempt
   to give it to management_lead. The escort on a visit can be EITHER a
   Management team OR one or more individual Devotees picked from the
   central registry (migration 020, visit_escort_devotees roster — mirrors
   meeting_members/session_members, not a single FK) — mutually exclusive
   per visit, picked via escortMode ('team' | 'individual'). That's a fact
   about one field, not a reason to hand Committee/Management broad Visits
   access. No scoped role currently owns the actual padhramani-scheduling
   responsibility — revisit only if that ownership is genuinely confirmed.
   Delete: admin tier (same as everything else here).
   Links to a devotee by mobile when one exists. */
const express = require('express');
const crypto = require('crypto');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { ensureDevotee, digits } = require('../services/people');
const shared = require('../services/sharedTables');
const { mapVisit } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');
router.use(adminTier);
const PURPOSE = ['home_inauguration', 'shop_opening', 'wedding_blessing', 'health_blessing', 'business_puja', 'festival_padhramani', 'other'];
const STATUS = ['requested', 'scheduled', 'confirmed', 'completed', 'cancelled'];

/* current requester identity + escort team from JOINs. Individual escorts
   (the visit_escort_devotees roster) are attached separately — see
   withEscortDevotees / withEscortDevoteesMany — since a roster can't come
   back as columns on a single visits row. tm.code is selected (not just
   tm.name) so the frontend <select> can match by the SAME code
   resolveTeam() accepts, instead of the raw numeric FK id it can't match
   against Management module team codes. */
const VISIT_SELECT = `SELECT v.*, dv.code AS devotee_code, dv.name AS dev_name, dv.mobile AS dev_mobile,
  dv.city AS dev_city, dv.state AS dev_state, tm.code AS escort_team_code, tm.name AS escort_team_name
  FROM visits v
  LEFT JOIN devotees dv ON dv.id = v.devotee_id
  LEFT JOIN teams tm ON tm.id = v.escort_team_id`;

const byIdOrCode = v => queryOne(`${VISIT_SELECT} WHERE (v.id = ? OR v.code = ?) AND v.is_deleted = 0`, [v, v]);

/* resolve an escortTeamId (numeric id or MGMT-### code) to teams.id, else null */
async function resolveTeam(v) {
  if (v == null || String(v).trim() === '') return null;
  const t = await queryOne('SELECT id FROM teams WHERE (id = ? OR code = ?) AND is_deleted = 0',
    [parseInt(v, 10) || -1, String(v)]);
  return t ? t.id : null;
}

/* Full devotee details (not just the bare code shared.getRoster returns) for
   every individual escort on ONE visit — used by GET /:id, POST, PATCH. */
async function escortDevoteesOf(visitId) {
  return queryAll(
    `SELECT d.id, d.code, d.name, d.mobile, d.city FROM visit_escort_devotees l
     JOIN devotees d ON d.id = l.devotee_id WHERE l.visit_id = ? AND d.is_deleted = 0 ORDER BY d.name`,
    [visitId]);
}
/* Same, batched for GET / (list) — one query instead of one per row. */
async function escortDevoteesByVisit(visitIds) {
  const map = {};
  if (!visitIds.length) return map;
  const qs = visitIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT l.visit_id AS vid, d.id, d.code, d.name, d.mobile, d.city FROM visit_escort_devotees l
     JOIN devotees d ON d.id = l.devotee_id WHERE l.visit_id IN (${qs}) AND d.is_deleted = 0 ORDER BY d.name`,
    visitIds);
  for (const r of rows) (map[r.vid] || (map[r.vid] = [])).push({ id: r.id, code: r.code, name: r.name, mobile: r.mobile, city: r.city });
  return map;
}
function withEscort(row, devotees) {
  return Object.assign(mapVisit(row), {
    escortMode: (devotees && devotees.length) ? 'individual' : 'team',
    escortDevotees: devotees || [],
  });
}

router.get('/', async (req, res, next) => {
  try {
    const where = ['v.is_deleted = 0'];
    const args = [];
    if (req.query.status) { where.push('v.status = ?'); args.push(req.query.status); }
    if (req.query.from) { where.push('v.date >= ?'); args.push(req.query.from); }
    if (req.query.to) { where.push('v.date <= ?'); args.push(req.query.to); }
    if (req.query.q) {
      where.push('(v.devotee_name LIKE ? OR dv.name LIKE ? OR v.mobile LIKE ? OR v.city LIKE ? OR v.code LIKE ?)');
      const like = `%${req.query.q}%`;
      args.push(like, like, like, like, like);
    }
    const rows = await queryAll(`${VISIT_SELECT} WHERE ${where.join(' AND ')} ORDER BY v.date DESC, v.time`, args);
    const escortMap = await escortDevoteesByVisit(rows.map(r => r.id));
    res.json(rows.map(r => withEscort(r, escortMap[r.id])));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Visit not found' });
    res.json(withEscort(row, await escortDevoteesOf(row.id)));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.devoteeName || '').trim();
    if (!name) return res.status(400).json({ error: 'devoteeName is required' });
    if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    if (b.purpose !== undefined && !PURPOSE.includes(b.purpose)) return res.status(400).json({ error: 'bad purpose' });
    if (b.status !== undefined && !STATUS.includes(b.status)) return res.status(400).json({ error: 'bad status' });
    const purpose = b.purpose || 'other';
    const status = b.status || 'requested';
    const mobile = digits(b.mobile);
    if (mobile && mobile.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });
    const city = String(b.city || '').trim();

    // a padhramani is for a person → link to the shared devotee row, but only
    // when the person is identifiable (explicit id, a 10-digit mobile, or a
    // name + city). A bare name alone stays unlinked (still stored on the visit).
    let devoteeId = null;
    if (b.devoteeId != null && String(b.devoteeId).trim()) {
      const d = await queryOne('SELECT id FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
        [parseInt(b.devoteeId, 10) || -1, String(b.devoteeId)]);
      if (!d) return res.status(400).json({ error: 'That devotee no longer exists' });
      devoteeId = d.id;
    } else if ((mobile && mobile.length === 10) || city) {
      devoteeId = await ensureDevotee({ name, mobile, city, state: b.state });
    }
    // escort is EITHER a Management team OR one-or-more individual Devotees,
    // never both — escortMode decides which side of the request body is
    // honored (escortDevoteeIds is an array; escort_devotee ids/codes it holds
    // go through shared.setRoster, same as meeting_members/session_members).
    const escortMode = b.escortMode === 'individual' ? 'individual' : 'team';
    const escortTeamId = escortMode === 'team' ? await resolveTeam(b.escortTeamId) : null;
    const id = crypto.randomUUID();
    const code = await nextCode('visit');
    await run(
      `INSERT INTO visits (id, code, devotee_name, devotee_id, mobile, purpose, address, city, state, date, time, escort_team, escort_team_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, devoteeId, mobile, purpose, b.address || '', city, b.state || 'Gujarat',
       b.date, b.time || '', escortMode === 'team' ? (b.escortTeam || '') : '', escortTeamId, status, b.notes || '']
    );
    if (escortMode === 'individual' && Array.isArray(b.escortDevoteeIds) && b.escortDevoteeIds.length) {
      await shared.setRoster('visit-escort', id, b.escortDevoteeIds);
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Visits',
      action: 'CREATE', entityType: 'visit', entityId: code, details: { name, purpose } });
    const row = await byIdOrCode(id);
    res.status(201).json(withEscort(row, await escortDevoteesOf(row.id)));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Visit not found' });
    const b = req.body || {};
    const sets = [], args = [];
    for (const [k, col] of Object.entries({
      devoteeName: 'devotee_name', address: 'address', city: 'city', state: 'state',
      time: 'time', escortTeam: 'escort_team', notes: 'notes',
    })) {
      if (typeof b[k] === 'string') { sets.push(`${col} = ?`); args.push(b[k]); }
    }
    if (b.mobile !== undefined) {
      const m = digits(b.mobile);
      if (m && m.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });
      sets.push('mobile = ?'); args.push(m);
    }
    // re-resolve the devotee link when the identifying fields change and the
    // visit isn't already tied to a devotee the user picked explicitly
    if ((b.devoteeName !== undefined || b.mobile !== undefined || b.city !== undefined)) {
      const nm = b.devoteeName !== undefined ? String(b.devoteeName).trim() : row.devotee_name;
      const mob = b.mobile !== undefined ? digits(b.mobile) : row.mobile;
      const cty = b.city !== undefined ? String(b.city).trim() : row.city;
      if ((mob && mob.length === 10) || cty) {
        const devId = await ensureDevotee({ name: nm, mobile: mob, city: cty, state: b.state || row.state });
        if (devId && devId !== row.devotee_id) { sets.push('devotee_id = ?'); args.push(devId); }
      }
    }
    if (b.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'bad date' });
      sets.push('date = ?'); args.push(b.date);
    }
    if (b.purpose !== undefined) {
      if (!PURPOSE.includes(b.purpose)) return res.status(400).json({ error: 'bad purpose' });
      sets.push('purpose = ?'); args.push(b.purpose);
    }
    if (b.status !== undefined) {
      if (!STATUS.includes(b.status)) return res.status(400).json({ error: 'bad status' });
      sets.push('status = ?'); args.push(b.status);
    }
    let escortRosterUpdate = null;   // deferred until after the UPDATE below
    if (b.escortMode !== undefined) {
      if (b.escortMode === 'individual') {
        sets.push('escort_team_id = ?'); args.push(null);
        sets.push('escort_team = ?'); args.push('');
        escortRosterUpdate = Array.isArray(b.escortDevoteeIds) ? b.escortDevoteeIds : [];
      } else {
        sets.push('escort_team_id = ?'); args.push(await resolveTeam(b.escortTeamId));
        escortRosterUpdate = [];   // switching to team mode clears any individual roster
      }
    }
    if (!sets.length && escortRosterUpdate === null) return res.json(withEscort(row, await escortDevoteesOf(row.id)));
    if (sets.length) {
      sets.push(`updated_at = datetime('now')`);
      args.push(row.id);
      await run(`UPDATE visits SET ${sets.join(', ')} WHERE id = ?`, args);
    }
    if (escortRosterUpdate !== null) await shared.setRoster('visit-escort', row.id, escortRosterUpdate);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Visits',
      action: 'UPDATE', entityType: 'visit', entityId: row.code });
    const fresh = await byIdOrCode(row.id);
    res.json(withEscort(fresh, await escortDevoteesOf(fresh.id)));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Visit not found' });
    await run(`UPDATE visits SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Visits',
      action: 'DELETE', entityType: 'visit', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
