/* Temple inventory. Any session reads + writes; delete is admin tier.
   `stock` / `min_stock` are free text (e.g. "40 kg"); status is set explicitly. */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { mapInventory } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');
const STATUS = ['In Stock', 'Low Stock', 'Out of Stock'];
const byIdOrCode = v => queryOne('SELECT * FROM inventory WHERE (id = ? OR code = ?) AND is_deleted = 0', [parseInt(v, 10) || -1, v]);

router.get('/', async (req, res, next) => {
  try {
    const where = ['is_deleted = 0'];
    const args = [];
    if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
    if (req.query.category) { where.push('category = ?'); args.push(req.query.category); }
    if (req.query.q) { where.push('item LIKE ?'); args.push(`%${req.query.q}%`); }
    const rows = await queryAll(`SELECT * FROM inventory WHERE ${where.join(' AND ')} ORDER BY item`, args);
    res.json(rows.map(mapInventory));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const item = String(b.item || '').trim();
    if (!item) return res.status(400).json({ error: 'item is required' });
    const code = await nextCode('inventory');
    const r = await run(
      'INSERT INTO inventory (code, item, category, stock, min_stock, status) VALUES (?, ?, ?, ?, ?, ?)',
      [code, item, b.category || '', b.stock || '', b.minStock || '', STATUS.includes(b.status) ? b.status : 'In Stock']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Inventory',
      action: 'CREATE', entityType: 'inventory', entityId: code, details: { item } });
    res.status(201).json(mapInventory(await queryOne('SELECT * FROM inventory WHERE id = ?', [r.lastInsertRowid])));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Item not found' });
    const b = req.body || {};
    const sets = [], args = [];
    for (const [k, col] of Object.entries({ item: 'item', category: 'category', stock: 'stock', minStock: 'min_stock' })) {
      if (typeof b[k] === 'string') { sets.push(`${col} = ?`); args.push(b[k]); }
    }
    if (b.status !== undefined) {
      if (!STATUS.includes(b.status)) return res.status(400).json({ error: 'bad status' });
      sets.push('status = ?'); args.push(b.status);
    }
    if (!sets.length) return res.json(mapInventory(row));
    args.push(row.id);
    await run(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Inventory',
      action: 'UPDATE', entityType: 'inventory', entityId: row.code });
    res.json(mapInventory(await queryOne('SELECT * FROM inventory WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Item not found' });
    await run('UPDATE inventory SET is_deleted = 1 WHERE id = ?', [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Inventory',
      action: 'DELETE', entityType: 'inventory', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
