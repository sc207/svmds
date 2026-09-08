/* Device / session management. Mounted behind authRequired.
   Listing + revoking any session is admin-tier; revoking your OWN is always allowed. */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole, isAdminTier } = require('../middleware/authz');
const { logAudit } = require('../services/audit');
const { mapSession } = require('../utils/mappers');

const router = express.Router();

/* GET /  — active sessions. Admin tier sees all; anyone sees their own. */
router.get('/', async (req, res, next) => {
  try {
    const rows = isAdminTier(req.user)
      ? await queryAll('SELECT * FROM sessions WHERE revoked = 0 ORDER BY last_seen DESC')
      : await queryAll('SELECT * FROM sessions WHERE revoked = 0 AND user_id = ? ORDER BY last_seen DESC', [req.user.id]);
    res.json(rows.map(r => mapSession(r, req.user.jti)));
  } catch (e) { next(e); }
});

/* DELETE /others  — revoke all of the caller's OTHER sessions. */
router.delete('/others', async (req, res, next) => {
  try {
    await run('UPDATE sessions SET revoked = 1 WHERE revoked = 0 AND user_id = ? AND id != ?',
      [req.user.id, req.user.jti || '']);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Auth',
      action: 'REVOKE', entityType: 'session', entityId: 'others' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* DELETE /all  — admin tier: revoke every session except the caller's. */
router.delete('/all', requireRole('superadmin', 'admin'), async (req, res, next) => {
  try {
    await run('UPDATE sessions SET revoked = 1 WHERE revoked = 0 AND id != ?', [req.user.jti || '']);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Auth',
      action: 'REVOKE', entityType: 'session', entityId: 'all' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* DELETE /:id  — revoke one. Own session always; others need admin tier. */
router.delete('/:id', async (req, res, next) => {
  try {
    const s = await queryOne('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    if (s.user_id !== req.user.id && !isAdminTier(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await run('UPDATE sessions SET revoked = 1 WHERE id = ?', [req.params.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Auth',
      action: 'REVOKE', entityType: 'session', entityId: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
