/* Events / festivals — event_types catalog + events + multi-day event_days.
   Scope: admin tier sees all; an event_incharge sees only events where
   in_charge_id = them (req.scope.eventIds). Catalog + create + delete +
   in-charge assignment are admin tier; an in-charge may edit their own event. */
const express = require('express');
const crypto = require('crypto');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole, isAdminTier } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { mapEventType, mapEvent } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');
const STATUS = ['planning', 'confirmed', 'ongoing', 'completed', 'cancelled'];

/* ===== catalog ===== */
router.get('/types', async (req, res, next) => {
  try {
    const rows = await queryAll('SELECT * FROM event_types WHERE is_deleted = 0 ORDER BY id');
    res.json(rows.map(mapEventType));
  } catch (e) { next(e); }
});

router.post('/types', adminTier, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const code = await nextCode('event_type');
    const r = await run(
      'INSERT INTO event_types (code, name, category, icon, description) VALUES (?, ?, ?, ?, ?)',
      [code, name, req.body.category || '', req.body.icon || '', req.body.description || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Events',
      action: 'CREATE', entityType: 'event_type', entityId: code });
    res.status(201).json(mapEventType(await queryOne('SELECT * FROM event_types WHERE id = ?', [r.lastInsertRowid])));
  } catch (e) { next(e); }
});

router.delete('/types/:id', adminTier, async (req, res, next) => {
  try {
    const row = await queryOne('SELECT * FROM event_types WHERE (id = ? OR code = ?) AND is_deleted = 0',
      [parseInt(req.params.id, 10) || -1, req.params.id]);
    if (!row) return res.status(404).json({ error: 'Type not found' });
    const inUse = await queryOne('SELECT 1 AS x FROM events WHERE type_id = ? AND is_deleted = 0 LIMIT 1', [row.id]);
    if (inUse) return res.status(409).json({ error: 'An event is using this type' });
    await run('UPDATE event_types SET is_deleted = 1 WHERE id = ?', [row.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ===== events ===== */
const eventByIdOrCode = v =>
  queryOne(`SELECT e.*, et.code AS type_code FROM events e LEFT JOIN event_types et ON et.id = e.type_id
            WHERE (e.id = ? OR e.code = ?) AND e.is_deleted = 0`, [v, v]);

async function withDays(row) {
  if (!row) return null;
  const days = await queryAll('SELECT * FROM event_days WHERE event_id = ? AND is_deleted = 0 ORDER BY date', [row.id]);
  return mapEvent(row, days);
}

function inChargeCanManage(req, row) {
  if (isAdminTier(req.user)) return true;
  return (req.user.roles || []).includes('event_incharge') && (req.scope.eventIds || []).includes(row.id);
}

router.get('/', async (req, res, next) => {
  try {
    const where = [];
    const args = [];
    if (!isAdminTier(req.user) && (req.user.roles || []).includes('event_incharge')) {
      const ids = req.scope.eventIds || [];
      if (!ids.length) return res.json([]);
      where.push(`e.id IN (${ids.map(() => '?').join(',')})`);
      args.push(...ids);
    }
    if (req.query.status) { where.push('e.status = ?'); args.push(req.query.status); }
    const sql = `SELECT e.*, et.code AS type_code FROM events e LEFT JOIN event_types et ON et.id = e.type_id
                 WHERE e.is_deleted = 0 ${where.length ? 'AND ' + where.join(' AND ') : ''}
                 ORDER BY e.created_at DESC`;
    const rows = await queryAll(sql, args);
    const out = [];
    for (const r of rows) out.push(await withDays(r));
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await eventByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found' });
    if (!isAdminTier(req.user) && (req.user.roles || []).includes('event_incharge')
        && !(req.scope.eventIds || []).includes(row.id)) {
      return res.status(403).json({ error: 'Not your event' });
    }
    res.json(await withDays(row));
  } catch (e) { next(e); }
});

router.post('/', adminTier, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    let typeId = null;
    if (b.typeId) {
      const t = await queryOne('SELECT id FROM event_types WHERE (code = ? OR id = ?) AND is_deleted = 0', [b.typeId, parseInt(b.typeId, 10) || -1]);
      if (!t) return res.status(400).json({ error: 'Unknown typeId' });
      typeId = t.id;
    }
    const days = Array.isArray(b.days) ? b.days : [];
    for (const d of days) if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return res.status(400).json({ error: 'each day needs a date (YYYY-MM-DD)' });

    const id = crypto.randomUUID();
    const code = await nextCode('event');
    await run(
      `INSERT INTO events (id, code, type_id, name, venue, expected_footfall, budget, status, color, notes, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'))`,
      [id, code, typeId, name, b.venue || '', parseInt(b.expectedFootfall, 10) || 0, Number(b.budget || 0),
       STATUS.includes(b.status) ? b.status : 'planning', b.color || '#C96A20', b.notes || '']
    );
    for (const d of days) {
      await run('INSERT INTO event_days (event_id, date, start_time, end_time) VALUES (?, ?, ?, ?)',
        [id, d.date, d.startTime || '', d.endTime || '']);
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Events',
      action: 'CREATE', entityType: 'event', entityId: code, details: { name } });
    res.status(201).json(await withDays(await eventByIdOrCode(id)));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await eventByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found' });
    if (!inChargeCanManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body || {};
    const sets = [], args = [];
    for (const [k, col] of Object.entries({ name: 'name', venue: 'venue', color: 'color', notes: 'notes' })) {
      if (typeof b[k] === 'string') { sets.push(`${col} = ?`); args.push(b[k]); }
    }
    if (b.expectedFootfall !== undefined) { sets.push('expected_footfall = ?'); args.push(parseInt(b.expectedFootfall, 10) || 0); }
    if (b.budget !== undefined) { sets.push('budget = ?'); args.push(Number(b.budget || 0)); }
    if (b.status !== undefined) {
      if (!STATUS.includes(b.status)) return res.status(400).json({ error: 'bad status' });
      sets.push('status = ?'); args.push(b.status);
    }
    if (sets.length) {
      sets.push(`updated_at = datetime('now')`);
      args.push(row.id);
      await run(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`, args);
    }
    // full replace of days when provided
    if (Array.isArray(b.days)) {
      for (const d of b.days) if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return res.status(400).json({ error: 'bad day date' });
      await run('UPDATE event_days SET is_deleted = 1 WHERE event_id = ?', [row.id]);
      for (const d of b.days) {
        await run('INSERT INTO event_days (event_id, date, start_time, end_time) VALUES (?, ?, ?, ?)',
          [row.id, d.date, d.startTime || '', d.endTime || '']);
      }
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Events',
      action: 'UPDATE', entityType: 'event', entityId: row.code });
    res.json(await withDays(await eventByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await eventByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found' });
    await run(`UPDATE events SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await run('UPDATE event_days SET is_deleted = 1 WHERE event_id = ?', [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Events',
      action: 'DELETE', entityType: 'event', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* in-charge assignment (admin tier) */
router.post('/:id/incharge', adminTier, async (req, res, next) => {
  try {
    const row = await eventByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Event not found' });
    const uid = parseInt(req.body.userId, 10);
    const u = uid ? await queryOne('SELECT * FROM users WHERE id = ? AND is_deleted = 0', [uid]) : null;
    if (!u) return res.status(400).json({ error: 'Unknown userId' });
    const prev = row.in_charge_id;
    await run(`UPDATE events SET in_charge_id = ?, updated_at = datetime('now') WHERE id = ?`, [uid, row.id]);
    const has = await queryOne('SELECT 1 AS x FROM user_roles WHERE user_id = ? AND role = ?', [uid, 'event_incharge']);
    if (!has) await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [uid, 'event_incharge']);
    if (prev && prev !== uid) {
      const still = await queryOne('SELECT 1 AS x FROM events WHERE in_charge_id = ? AND is_deleted = 0 LIMIT 1', [prev]);
      if (!still) await run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', [prev, 'event_incharge']);
      await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [prev]);
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Events',
      action: 'GRANT', entityType: 'event_incharge', entityId: String(uid), scopeId: row.code });
    res.json(await withDays(await eventByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

module.exports = router;
