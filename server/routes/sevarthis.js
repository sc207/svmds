/* Sevarthi registry (devotees who sponsor & run a pooja). Read-only list + get
   here; sevarthis are created by linking them to a pooja (routes/poojas.js
   POST /:id/sevarthis). Patch/soft-delete the record itself here. */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { logAudit } = require('../services/audit');
const { ensureDevotee, digits } = require('../services/people');
const { mapSevarthi } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

/* current person identity comes from the JOINed devotees row — mappers.personIdentity() */
const SEV_SELECT = `SELECT s.*, dv.code AS devotee_code, dv.name AS dev_name,
  dv.mobile AS dev_mobile, dv.city AS dev_city, dv.state AS dev_state
  FROM sevarthis s LEFT JOIN devotees dv ON dv.id = s.devotee_id`;

router.get('/', async (req, res, next) => {
  try {
    const where = ['s.is_deleted = 0'];
    const args = [];
    if (req.query.q) {
      where.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR s.mobile LIKE ? OR s.code LIKE ?)');
      const like = `%${req.query.q}%`;
      args.push(like, like, like, like);
    }
    if (req.query.status) { where.push('s.status = ?'); args.push(req.query.status); }
    const rows = await queryAll(`${SEV_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.first_name`, args);
    res.json(rows.map(mapSevarthi));
  } catch (e) { next(e); }
});

const byIdOrCode = v =>
  queryOne(`${SEV_SELECT} WHERE (s.id = ? OR s.code = ?) AND s.is_deleted = 0`, [parseInt(v, 10) || -1, v]);

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
    let newMobile;
    if (req.body.mobile !== undefined) {
      const m = digits(req.body.mobile);
      if (m && m.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });
      sets.push('mobile = ?'); args.push(m);
      newMobile = m;
    }
    if (req.body.status !== undefined) {
      sets.push('status = ?'); args.push(String(req.body.status).toLowerCase() === 'inactive' ? 'inactive' : 'active');
    }
    if (!sets.length) return res.json(mapSevarthi(row));

    // the devotee is the source of truth — a new 10-digit mobile that resolves to
    // a different devotee repoints the link; otherwise backfill blanks on it.
    if (row.devotee_id) {
      if (newMobile && newMobile.length === 10) {
        const other = await queryOne('SELECT id FROM devotees WHERE mobile = ? AND is_deleted = 0', [newMobile]);
        // only repoint if that devotee isn't already the person behind another sevarthi
        if (other && other.id !== row.devotee_id) {
          const taken = await queryOne('SELECT id FROM sevarthis WHERE devotee_id = ? AND is_deleted = 0 AND id != ?', [other.id, row.id]);
          if (!taken) { sets.push('devotee_id = ?'); args.push(other.id); }
        }
      }
      const nm = `${req.body.firstName != null ? req.body.firstName : row.first_name} ${req.body.lastName != null ? req.body.lastName : row.last_name}`.trim();
      const ds = [], da = [];
      if (nm) { ds.push(`name = CASE WHEN name IN ('', '(unnamed)') THEN ? ELSE name END`); da.push(nm); }
      if (newMobile) { ds.push(`mobile = CASE WHEN mobile = '' THEN ? ELSE mobile END`); da.push(newMobile); }
      if (typeof req.body.city === 'string' && req.body.city.trim()) { ds.push(`city = CASE WHEN city = '' THEN ? ELSE city END`); da.push(req.body.city.trim()); }
      if (ds.length) { da.push(row.devotee_id); await run(`UPDATE devotees SET ${ds.join(', ')} WHERE id = ?`, da); }
    } else {
      // no link yet — create/reuse one now so this person joins the registry
      const devId = await ensureDevotee({
        firstName: req.body.firstName != null ? req.body.firstName : row.first_name,
        lastName: req.body.lastName != null ? req.body.lastName : row.last_name,
        mobile: newMobile != null ? newMobile : row.mobile,
        city: req.body.city != null ? req.body.city : row.city,
        state: req.body.state != null ? req.body.state : row.state,
      });
      if (devId) { sets.push('devotee_id = ?'); args.push(devId); }
    }

    args.push(row.id);
    try {
      await run(`UPDATE sevarthis SET ${sets.join(', ')} WHERE id = ?`, args);
    } catch (e) {
      // a UNIQUE index (mobile / devotee) rejected the edit — another sevarthi
      // already represents this person / number. Report it rather than 500.
      return res.status(409).json({ error: 'Another sevarthi record already has that mobile / devotee' });
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'UPDATE', entityType: 'sevarthi', entityId: row.code });
    res.json(mapSevarthi(await queryOne(`${SEV_SELECT} WHERE s.id = ?`, [row.id])));
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
