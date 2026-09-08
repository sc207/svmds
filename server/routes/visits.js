/* Bappa / Bhuvaji padhramani register. Any session reads + writes; delete is
   admin tier. Links to a devotee by mobile when one exists. */
const express = require('express');
const crypto = require('crypto');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { mapVisit } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');
const PURPOSE = ['home_inauguration', 'shop_opening', 'wedding_blessing', 'health_blessing', 'business_puja', 'festival_padhramani', 'other'];
const STATUS = ['requested', 'scheduled', 'confirmed', 'completed', 'cancelled'];

const byIdOrCode = v => queryOne('SELECT * FROM visits WHERE (id = ? OR code = ?) AND is_deleted = 0', [v, v]);

router.get('/', async (req, res, next) => {
  try {
    const where = ['is_deleted = 0'];
    const args = [];
    if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
    if (req.query.from) { where.push('date >= ?'); args.push(req.query.from); }
    if (req.query.to) { where.push('date <= ?'); args.push(req.query.to); }
    if (req.query.q) {
      where.push('(devotee_name LIKE ? OR mobile LIKE ? OR city LIKE ? OR code LIKE ?)');
      const like = `%${req.query.q}%`;
      args.push(like, like, like, like);
    }
    const rows = await queryAll(`SELECT * FROM visits WHERE ${where.join(' AND ')} ORDER BY date DESC, time`, args);
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
    const mobile = String(b.mobile || '').trim();

    let devoteeId = null;
    if (mobile) {
      const dev = await queryOne('SELECT id FROM devotees WHERE mobile = ? AND is_deleted = 0', [mobile]);
      devoteeId = dev ? dev.id : null;
    }
    const id = crypto.randomUUID();
    const code = await nextCode('visit');
    await run(
      `INSERT INTO visits (id, code, devotee_name, devotee_id, mobile, purpose, address, city, state, date, time, escort_team, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, devoteeId, mobile, purpose, b.address || '', b.city || '', b.state || 'Gujarat',
       b.date, b.time || '', b.escortTeam || '', status, b.notes || '']
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
    if (b.mobile !== undefined) { sets.push('mobile = ?'); args.push(String(b.mobile || '').trim()); }
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
