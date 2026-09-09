/* Devotees — the shared person registry every module's member picker points at.
   Mounted behind authRequired + attachScope. Reads: any signed-in user.
   Writes: any signed-in user (matches the client, where leaders add devotees);
   hard delete is admin tier. Dedupe is by mobile. (BACKEND_PLAN.md §10.4) */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { digits } = require('../services/people');
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

/* POST /   { name, mobile, city?, state?, samaj?, status?, notes? }
   Dedupe by mobile; when no mobile, dedupe by lower(name)+lower(city). */
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const mobile = digits(req.body.mobile || req.body.phone);
    const city = String(req.body.city || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (mobile && mobile.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });

    const dedupe = async () => {
      if (mobile) {
        return queryOne('SELECT * FROM devotees WHERE mobile = ? AND is_deleted = 0', [mobile]);
      }
      if (name && city) {
        return queryOne(
          `SELECT * FROM devotees WHERE lower(trim(name)) = lower(trim(?))
             AND lower(trim(city)) = lower(trim(?)) AND is_deleted = 0`, [name, city]);
      }
      return null;
    };

    const dup = await dedupe();
    if (dup) {
      const row = await findByIdOrCode(dup.id);
      return res.status(200).json({ ...mapDevotee(row), _deduped: true });
    }

    const code = await nextCode('devotee');
    let newId;
    try {
      const r = await run(
        `INSERT INTO devotees (code, name, mobile, city, state, samaj, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, name, mobile, city, req.body.state || 'Gujarat',
         req.body.samaj || '', normStatus(req.body.status), req.body.notes || '']
      );
      newId = r.lastInsertRowid;
    } catch (e) {
      // lost a race against a UNIQUE index added by repair.js — reselect + return
      const again = await dedupe();
      if (again) {
        const row = await findByIdOrCode(again.id);
        return res.status(200).json({ ...mapDevotee(row), _deduped: true });
      }
      throw e;
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Devotees',
      action: 'CREATE', entityType: 'devotee', entityId: code, details: { name } });

    const row = await findByIdOrCode(newId);
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
      const m = digits(req.body.mobile ?? req.body.phone);
      if (m && m.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });
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

/* DELETE /:id  — soft delete (admin tier).
   Refuses with 409 + the live links when the person is still in use anywhere,
   unless ?force=1 (then the links are left dangling for repair.js to reconcile). */
router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await findByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Devotee not found' });

    const force = req.query.force === '1' || req.query.force === 'true';
    if (!force) {
      let links = [];
      try {
        links = await queryAll('SELECT link_type, ref_id FROM v_person_links WHERE devotee_id = ? LIMIT 20', [row.id]);
      } catch (_) { links = []; }   // view absent on an un-migrated DB → allow
      if (links.length) {
        return res.status(409).json({
          error: 'This devotee is still linked elsewhere. Remove those links first, or delete with ?force=1.',
          links,
        });
      }
    }

    await run(`UPDATE devotees SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Devotees',
      action: 'DELETE', entityType: 'devotee', entityId: row.code, details: { force } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
