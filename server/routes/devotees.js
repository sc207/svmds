/* Devotees — the shared person registry every module's member picker points at.
   Mounted behind authRequired + attachScope. Reads: any signed-in user.
   Writes: any signed-in user (matches the client, where leaders add devotees);
   hard delete is admin tier. Dedupe is by mobile. (BACKEND_PLAN.md §10.4) */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { mapDevotee } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

const LIST_SQL = `
  SELECT d.*,
         (SELECT COUNT(*) FROM visits v WHERE v.devotee_id = d.id AND v.is_deleted = 0) AS visit_count
  FROM devotees d
  WHERE d.is_deleted = 0`;

/* GET /            ?q=<search>&samaj=<>&status=active|inactive&limit=&offset= */
router.get('/', async (req, res, next) => {
  try {
    const where = [];
    const args = [];
    if (req.query.q) {
      where.push('(d.name LIKE ? OR d.mobile LIKE ? OR d.city LIKE ? OR d.code LIKE ?)');
      const like = `%${req.query.q}%`;
      args.push(like, like, like, like);
    }
    if (req.query.samaj) { where.push('d.samaj = ?'); args.push(req.query.samaj); }
    if (req.query.status) { where.push('d.status = ?'); args.push(req.query.status); }

    let sql = LIST_SQL + (where.length ? ' AND ' + where.join(' AND ') : '') + ' ORDER BY d.name';
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
    const offset = parseInt(req.query.offset, 10) || 0;
    sql += ' LIMIT ? OFFSET ?';
    args.push(limit, offset);

    const rows = await queryAll(sql, args);
    res.json(rows.map(mapDevotee));
  } catch (e) { next(e); }
});

async function findByIdOrCode(idOrCode) {
  const rows = await queryAll(
    LIST_SQL + ' AND (d.id = ? OR d.code = ?) LIMIT 1',
    [parseInt(idOrCode, 10) || -1, idOrCode]
  );
  return rows[0] || null;
}

/* GET /:id  (numeric id or code) */
router.get('/:id', async (req, res, next) => {
  try {
    const row = await findByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Devotee not found' });
    res.json(mapDevotee(row));
  } catch (e) { next(e); }
});

function normStatus(s) {
  return String(s || '').toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

/* POST /   { name, mobile, city?, state?, samaj?, status?, notes? }  — dedupe by mobile */
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const mobile = String(req.body.mobile || req.body.phone || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (mobile && !/^[0-9]{10}$/.test(mobile)) return res.status(400).json({ error: 'mobile must be 10 digits' });

    if (mobile) {
      const dup = await queryOne('SELECT * FROM devotees WHERE mobile = ? AND is_deleted = 0', [mobile]);
      if (dup) {
        const row = await findByIdOrCode(dup.id);
        return res.status(200).json({ ...mapDevotee(row), _deduped: true });
      }
    }

    const code = await nextCode('devotee');
    const r = await run(
      `INSERT INTO devotees (code, name, mobile, city, state, samaj, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, name, mobile, req.body.city || '', req.body.state || 'Gujarat',
       req.body.samaj || '', normStatus(req.body.status), req.body.notes || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Devotees',
      action: 'CREATE', entityType: 'devotee', entityId: code, details: { name } });

    const row = await findByIdOrCode(r.lastInsertRowid);
    res.status(201).json(mapDevotee(row));
  } catch (e) { next(e); }
});

/* PATCH /:id */
router.patch('/:id', async (req, res, next) => {
  try {
    const row = await findByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Devotee not found' });

    const sets = [];
    const args = [];
    for (const f of ['name', 'city', 'state', 'samaj', 'notes']) {
      if (typeof req.body[f] === 'string') { sets.push(`${f} = ?`); args.push(req.body[f]); }
    }
    if (req.body.mobile !== undefined || req.body.phone !== undefined) {
      const m = String(req.body.mobile ?? req.body.phone ?? '').trim();
      if (m && !/^[0-9]{10}$/.test(m)) return res.status(400).json({ error: 'mobile must be 10 digits' });
      if (m && m !== row.mobile) {
        const dup = await queryOne('SELECT id FROM devotees WHERE mobile = ? AND is_deleted = 0 AND id != ?', [m, row.id]);
        if (dup) return res.status(409).json({ error: 'Another devotee already has that mobile' });
      }
      sets.push('mobile = ?'); args.push(m);
    }
    if (req.body.status !== undefined) { sets.push('status = ?'); args.push(normStatus(req.body.status)); }
    if (!sets.length) return res.json(mapDevotee(row));

    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE devotees SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Devotees',
      action: 'UPDATE', entityType: 'devotee', entityId: row.code, details: req.body });

    res.json(mapDevotee(await findByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

/* DELETE /:id  — soft delete (admin tier) */
router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await findByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Devotee not found' });
    await run(`UPDATE devotees SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Devotees',
      action: 'DELETE', entityType: 'devotee', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
