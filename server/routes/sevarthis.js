/* Sevarthi registry (devotees who sponsor & run a pooja). Read-only list + get
   here; sevarthis are created by linking them to a pooja (routes/poojas.js
   POST /:id/sevarthis). Patch/soft-delete the record itself here. */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { logAudit } = require('../services/audit');
const { mapSevarthi } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

router.get('/', async (req, res, next) => {
  try {
    const where = ['is_deleted = 0'];
    const args = [];
    if (req.query.q) {
      where.push('(first_name LIKE ? OR last_name LIKE ? OR mobile LIKE ? OR code LIKE ?)');
      const like = `%${req.query.q}%`;
      args.push(like, like, like, like);
    }
    if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
    const rows = await queryAll(`SELECT * FROM sevarthis WHERE ${where.join(' AND ')} ORDER BY first_name`, args);
    res.json(rows.map(mapSevarthi));
  } catch (e) { next(e); }
});

const byIdOrCode = v =>
  queryOne('SELECT * FROM sevarthis WHERE (id = ? OR code = ?) AND is_deleted = 0', [parseInt(v, 10) || -1, v]);

router.get('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Sevarthi not found' });
    res.json(mapSevarthi(row));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Sevarthi not found' });
    const map = { firstName: 'first_name', lastName: 'last_name', city: 'city', state: 'state', committee: 'committee', notes: 'notes' };
    const sets = [], args = [];
    for (const [k, col] of Object.entries(map)) {
      if (typeof req.body[k] === 'string') { sets.push(`${col} = ?`); args.push(req.body[k]); }
    }
    if (req.body.mobile !== undefined) {
      const m = String(req.body.mobile || '').trim();
      if (m && !/^[0-9]{10}$/.test(m)) return res.status(400).json({ error: 'mobile must be 10 digits' });
      sets.push('mobile = ?'); args.push(m);
    }
    if (req.body.status !== undefined) {
      sets.push('status = ?'); args.push(String(req.body.status).toLowerCase() === 'inactive' ? 'inactive' : 'active');
    }
    if (!sets.length) return res.json(mapSevarthi(row));
    args.push(row.id);
    await run(`UPDATE sevarthis SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'UPDATE', entityType: 'sevarthi', entityId: row.code });
    res.json(mapSevarthi(await queryOne('SELECT * FROM sevarthis WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Sevarthi not found' });
    await run('DELETE FROM pooja_sevarthi_links WHERE sevarthi_id = ?', [row.id]);
    await run('UPDATE sevarthis SET is_deleted = 1 WHERE id = ?', [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'DELETE', entityType: 'sevarthi', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
