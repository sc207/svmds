/* Donor registry (individual / organization / trust). Dedupe by mobile.
   Reads + writes: any session; soft delete: admin tier. */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { ensureDevotee, digits } = require('../services/people');
const { mapDonor } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');
const TYPES = ['individual', 'organization', 'trust'];

router.get('/', async (req, res, next) => {
  try {
    const where = ['is_deleted = 0'];
    const args = [];
    if (req.query.q) {
      where.push('(first_name LIKE ? OR last_name LIKE ? OR org_name LIKE ? OR mobile LIKE ? OR code LIKE ?)');
      const like = `%${req.query.q}%`;
      args.push(like, like, like, like, like);
    }
    if (req.query.type) { where.push('type = ?'); args.push(req.query.type); }
    const rows = await queryAll(
      `SELECT * FROM donors WHERE ${where.join(' AND ')} ORDER BY COALESCE(NULLIF(org_name,''), first_name)`, args);
    res.json(rows.map(mapDonor));
  } catch (e) { next(e); }
});

async function byIdOrCode(v) {
  return queryOne('SELECT * FROM donors WHERE (id = ? OR code = ?) AND is_deleted = 0', [parseInt(v, 10) || -1, v]);
}

router.get('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Donor not found' });
    res.json(mapDonor(row));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const type = TYPES.includes(req.body.type) ? req.body.type : 'individual';
    const mobile = digits(req.body.mobile);
    const orgName = String(req.body.orgName || '').trim();
    const firstName = String(req.body.firstName || '').trim();
    const pan = String(req.body.pan || '').trim();
    if (type === 'individual' && !firstName) return res.status(400).json({ error: 'firstName is required for an individual' });
    if (type !== 'individual' && !orgName) return res.status(400).json({ error: 'orgName is required for an organization / trust' });
    if (mobile && mobile.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });

    // dedupe: individual by mobile or by an explicit devotee link; org/trust by
    // lower(org_name) [+ pan when given]. Always a 200 {_deduped:true}.
    if (mobile) {
      const dup = await queryOne('SELECT * FROM donors WHERE mobile = ? AND is_deleted = 0', [mobile]);
      if (dup) return res.status(200).json({ ...mapDonor(dup), _deduped: true });
    }
    if (type === 'individual' && req.body.devoteeId != null && String(req.body.devoteeId).trim()) {
      const d = await queryOne('SELECT id FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
        [parseInt(req.body.devoteeId, 10) || -1, String(req.body.devoteeId)]);
      if (d) {
        const dup = await queryOne('SELECT * FROM donors WHERE devotee_id = ? AND is_deleted = 0', [d.id]);
        if (dup) return res.status(200).json({ ...mapDonor(dup), _deduped: true });
      }
    }
    if (type !== 'individual' && orgName) {
      const dup = pan
        ? await queryOne(`SELECT * FROM donors WHERE lower(org_name) = lower(?) AND pan = ? AND is_deleted = 0`, [orgName, pan])
        : await queryOne(`SELECT * FROM donors WHERE lower(org_name) = lower(?) AND is_deleted = 0`, [orgName]);
      if (dup) return res.status(200).json({ ...mapDonor(dup), _deduped: true });
    }

    // an individual donor is a person → use the picked devotee, else create-or-reuse
    let devoteeId = null;
    if (type === 'individual') {
      if (req.body.devoteeId != null && String(req.body.devoteeId).trim()) {
        const d = await queryOne('SELECT id FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
          [parseInt(req.body.devoteeId, 10) || -1, String(req.body.devoteeId)]);
        if (!d) return res.status(400).json({ error: 'That devotee no longer exists' });
        devoteeId = d.id;
      } else {
        devoteeId = await ensureDevotee({
          firstName, lastName: req.body.lastName, mobile,
          city: req.body.city, state: req.body.state, samaj: req.body.committee,
        });
      }
    }

    const code = await nextCode('donor');
    const r = await run(
      `INSERT INTO donors (code, type, first_name, last_name, org_name, contact_person, mobile, city, state, committee, pan, notes, devotee_id, added_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'))`,
      [code, type, firstName, req.body.lastName || '', orgName, req.body.contactPerson || '',
       mobile, req.body.city || '', req.body.state || 'Gujarat', req.body.committee || '',
       req.body.pan || '', req.body.notes || '', devoteeId]
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'CREATE', entityType: 'donor', entityId: code });
    res.status(201).json(mapDonor(await queryOne('SELECT * FROM donors WHERE id = ?', [r.lastInsertRowid])));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Donor not found' });
    const map = {
      firstName: 'first_name', lastName: 'last_name', orgName: 'org_name',
      contactPerson: 'contact_person', city: 'city', state: 'state',
      committee: 'committee', pan: 'pan', notes: 'notes',
    };
    const sets = [], args = [];
    for (const [k, col] of Object.entries(map)) {
      if (typeof req.body[k] === 'string') { sets.push(`${col} = ?`); args.push(req.body[k]); }
    }
    if (req.body.type !== undefined) {
      if (!TYPES.includes(req.body.type)) return res.status(400).json({ error: 'bad type' });
      sets.push('type = ?'); args.push(req.body.type);
    }
    if (req.body.mobile !== undefined) {
      const m = digits(req.body.mobile);
      if (m && m.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });
      if (m && m !== row.mobile) {
        const dup = await queryOne('SELECT id FROM donors WHERE mobile = ? AND is_deleted = 0 AND id != ?', [m, row.id]);
        if (dup) return res.status(409).json({ error: 'Another donor already has that mobile' });
      }
      sets.push('mobile = ?'); args.push(m);
    }
    if (!sets.length) return res.json(mapDonor(row));

    // for an individual, keep the shared devotee row in step with a name/mobile edit
    const finalType = req.body.type !== undefined ? req.body.type : row.type;
    if (finalType === 'individual'
        && (req.body.firstName !== undefined || req.body.lastName !== undefined || req.body.mobile !== undefined
            || req.body.city !== undefined || req.body.state !== undefined)) {
      const devId = await ensureDevotee({
        firstName: req.body.firstName !== undefined ? req.body.firstName : row.first_name,
        lastName: req.body.lastName !== undefined ? req.body.lastName : row.last_name,
        mobile: req.body.mobile !== undefined ? digits(req.body.mobile) : row.mobile,
        city: req.body.city !== undefined ? req.body.city : row.city,
        state: req.body.state !== undefined ? req.body.state : row.state,
        samaj: req.body.committee !== undefined ? req.body.committee : row.committee,
      });
      if (devId && devId !== row.devotee_id) { sets.push('devotee_id = ?'); args.push(devId); }
    }

    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE donors SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'UPDATE', entityType: 'donor', entityId: row.code });
    res.json(mapDonor(await queryOne('SELECT * FROM donors WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Donor not found' });
    const inUse = await queryOne('SELECT 1 AS x FROM donations WHERE donor_id = ? AND is_deleted = 0 LIMIT 1', [row.id]);
    if (inUse) return res.status(409).json({ error: 'Donor has donations on record' });
    await run(`UPDATE donors SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'DELETE', entityType: 'donor', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
