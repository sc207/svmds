/* Pooja-type master catalog (36-slot). Reads: any session. Writes: admin tier. */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { mapPoojaType } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');
const CAP = 36;

router.get('/', async (req, res, next) => {
  try {
    const rows = await queryAll('SELECT * FROM pooja_types WHERE is_deleted = 0 ORDER BY id');
    res.json(rows.map(mapPoojaType));
  } catch (e) { next(e); }
});

const byIdOrCode = v =>
  queryOne('SELECT * FROM pooja_types WHERE (id = ? OR code = ?) AND is_deleted = 0', [parseInt(v, 10) || -1, v]);

router.post('/', adminTier, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const count = (await queryOne('SELECT COUNT(*) AS n FROM pooja_types WHERE is_deleted = 0')).n;
    if (count >= CAP) return res.status(409).json({ error: `Catalog is full (${CAP})` });
    const dup = await queryOne('SELECT 1 AS x FROM pooja_types WHERE name = ? AND is_deleted = 0', [name]);
    if (dup) return res.status(409).json({ error: 'A type with that name already exists' });

    const code = await nextCode('pooja_type');
    const r = await run(
      `INSERT INTO pooja_types (code, name, category, description, default_duration_min, suggested_offerings, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, name, req.body.category || '', req.body.description || '',
       parseInt(req.body.defaultDurationMin, 10) || 60, req.body.suggestedOfferings || '', req.body.icon || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'CREATE', entityType: 'pooja_type', entityId: code, details: { name } });
    res.status(201).json(mapPoojaType(await queryOne('SELECT * FROM pooja_types WHERE id = ?', [r.lastInsertRowid])));
  } catch (e) { next(e); }
});

router.patch('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Type not found' });
    const map = {
      name: 'name', category: 'category', description: 'description',
      suggestedOfferings: 'suggested_offerings', icon: 'icon',
    };
    const sets = [], args = [];
    for (const [k, col] of Object.entries(map)) {
      if (typeof req.body[k] === 'string') { sets.push(`${col} = ?`); args.push(req.body[k]); }
    }
    if (req.body.defaultDurationMin !== undefined) {
      sets.push('default_duration_min = ?'); args.push(parseInt(req.body.defaultDurationMin, 10) || 60);
    }
    if (!sets.length) return res.json(mapPoojaType(row));
    args.push(row.id);
    await run(`UPDATE pooja_types SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'UPDATE', entityType: 'pooja_type', entityId: row.code });
    res.json(mapPoojaType(await queryOne('SELECT * FROM pooja_types WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Type not found' });
    const inUse = await queryOne('SELECT 1 AS x FROM poojas WHERE type_id = ? AND is_deleted = 0 LIMIT 1', [row.id]);
    if (inUse) return res.status(409).json({ error: 'A pooja is using this type' });
    await run('UPDATE pooja_types SET is_deleted = 1 WHERE id = ?', [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'DELETE', entityType: 'pooja_type', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
