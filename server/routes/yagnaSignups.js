/* Maha Yagna sevarthi signups — admin-only (temple-wide PII collected from
   the public form, no coordinator role fits — see MAHA_YAGNA_PLAN.md). The
   enable/window toggle lives in routes/settings.js (PUT /yagna-registration);
   this router is just the submissions register: list, review status/notes,
   soft-delete. Reads: any session. Writes: admin tier. */
const express = require('express');
const { queryAll, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { logAudit } = require('../services/audit');
const { mapYagnaSignup } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

const YAGNA_SELECT = `SELECT y.* FROM yagna_sevarthi_signups y WHERE y.is_deleted = 0`;

async function signupById(id) {
  const rows = await queryAll(YAGNA_SELECT + ' AND (y.id = ? OR y.code = ?)', [id, id]);
  return rows[0] || null;
}

router.get('/', adminTier, async (req, res, next) => {
  try {
    const rows = await queryAll(YAGNA_SELECT + ' ORDER BY y.created_at DESC');
    res.json(rows.map(mapYagnaSignup));
  } catch (e) { next(e); }
});

/* PATCH /:id  { status?, notes?, category?, assignedPoojaId? } */
router.patch('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await signupById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Registration not found' });
    const b = req.body || {};
    const sets = [], args = [];

    if (b.status !== undefined) {
      if (!['submitted', 'reviewed', 'converted', 'rejected'].includes(b.status)) {
        return res.status(400).json({ error: 'bad status' });
      }
      sets.push('status = ?'); args.push(b.status);
    }
    if (typeof b.notes === 'string') { sets.push('notes = ?'); args.push(b.notes.trim()); }
    if (typeof b.category === 'string') { sets.push('category = ?'); args.push(b.category.trim() || null); }
    if (b.assignedPoojaId !== undefined) { sets.push('assigned_pooja_id = ?'); args.push(b.assignedPoojaId || null); }

    if (!sets.length) return res.json(mapYagnaSignup(row));
    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE yagna_sevarthi_signups SET ${sets.join(', ')} WHERE id = ?`, args);

    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Maha Yagna Sevarthi',
      action: 'UPDATE', entityType: 'yagna_signup', entityId: row.code, details: b });
    res.json(mapYagnaSignup(await signupById(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await signupById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Registration not found' });
    await run(`UPDATE yagna_sevarthi_signups SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Maha Yagna Sevarthi',
      action: 'DELETE', entityType: 'yagna_signup', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
