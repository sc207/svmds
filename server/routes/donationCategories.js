/* Donation categories catalog (cash vs in-kind). Reads: any session.
   Writes: admin tier. (BACKEND_PLAN.md §4.4) */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { mapDonationCategory } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

router.get('/', async (req, res, next) => {
  try {
    const rows = await queryAll('SELECT * FROM donation_categories WHERE is_deleted = 0 ORDER BY id');
    res.json(rows.map(mapDonationCategory));
  } catch (e) { next(e); }
});

async function byIdOrCode(v) {
  return queryOne('SELECT * FROM donation_categories WHERE (id = ? OR code = ?) AND is_deleted = 0',
    [parseInt(v, 10) || -1, v]);
}

router.post('/', adminTier, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const kind = String(req.body.kind || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!['cash', 'kind'].includes(kind)) return res.status(400).json({ error: "kind must be 'cash' or 'kind'" });

    const code = await nextCode('donation_category');
    const r = await run(
      'INSERT INTO donation_categories (code, name, kind, icon, description) VALUES (?, ?, ?, ?, ?)',
      [code, name, kind, req.body.icon || '', req.body.description || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'CREATE', entityType: 'donation_category', entityId: code, details: { name, kind } });
    res.status(201).json(mapDonationCategory(await queryOne('SELECT * FROM donation_categories WHERE id = ?', [r.lastInsertRowid])));
  } catch (e) { next(e); }
});

router.patch('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Category not found' });
    const sets = [], args = [];
    for (const f of ['name', 'icon', 'description']) {
      if (typeof req.body[f] === 'string') { sets.push(`${f} = ?`); args.push(req.body[f]); }
    }
    if (req.body.kind !== undefined) {
      if (!['cash', 'kind'].includes(req.body.kind)) return res.status(400).json({ error: "kind must be 'cash' or 'kind'" });
      sets.push('kind = ?'); args.push(req.body.kind);
    }
    if (!sets.length) return res.json(mapDonationCategory(row));
    args.push(row.id);
    await run(`UPDATE donation_categories SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'UPDATE', entityType: 'donation_category', entityId: row.code });
    res.json(mapDonationCategory(await queryOne('SELECT * FROM donation_categories WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Category not found' });
    const inUse = await queryOne('SELECT 1 AS x FROM donations WHERE category_id = ? AND is_deleted = 0 LIMIT 1', [row.id]);
    if (inUse) return res.status(409).json({ error: 'Category is in use by a donation' });
    await run('UPDATE donation_categories SET is_deleted = 1 WHERE id = ?', [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'DELETE', entityType: 'donation_category', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
