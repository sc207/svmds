/* Bappa / Bhuvaji padhramani register. Any session reads + writes; delete is
   admin tier. Links to a devotee by mobile when one exists. */
const express = require('express');
const crypto = require('crypto');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { ensureDevotee, digits } = require('../services/people');
const { mapVisit } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');
const PURPOSE = ['home_inauguration', 'shop_opening', 'wedding_blessing', 'health_blessing', 'business_puja', 'festival_padhramani', 'other'];
const STATUS = ['requested', 'scheduled', 'confirmed', 'completed', 'cancelled'];

/* current requester identity from the JOINed devotees row; escort team name from teams */
const VISIT_SELECT = `SELECT v.*, dv.code AS devotee_code, dv.name AS dev_name, dv.mobile AS dev_mobile,
  dv.city AS dev_city, dv.state AS dev_state, tm.name AS escort_team_name
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
    res.json(rows.map(mapVisit));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Visit not found' });
    res.json(mapVisit(row));
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
    const escortTeamId = await resolveTeam(b.escortTeamId);
    const id = crypto.randomUUID();
    const code = await nextCode('visit');
    await run(
      `INSERT INTO visits (id, code, devotee_name, devotee_id, mobile, purpose, address, city, state, date, time, escort_team, escort_team_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, devoteeId, mobile, purpose, b.address || '', city, b.state || 'Gujarat',
       b.date, b.time || '', b.escortTeam || '', escortTeamId, status, b.notes || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Visits',
      action: 'CREATE', entityType: 'visit', entityId: code, details: { name, purpose } });
    res.status(201).json(mapVisit(await byIdOrCode(id)));
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
    if (b.escortTeamId !== undefined) {
      sets.push('escort_team_id = ?'); args.push(await resolveTeam(b.escortTeamId));
    }
    if (!sets.length) return res.json(mapVisit(row));
    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE visits SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Visits',
      action: 'UPDATE', entityType: 'visit', entityId: row.code });
    res.json(mapVisit(await byIdOrCode(row.id)));
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
