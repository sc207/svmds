/* Accounts & Access — the `users` + `user_roles` API behind the frontend
   "Accounts & Access" page. Mounted behind authRequired + attachScope.
   All writes are admin-tier; privileged-role changes are superadmin-only
   (services/authz.js). (BACKEND_PLAN.md §9) */
const express = require('express');
const { queryOne, run } = require('../db/connection');
const { requireRole, ROLE_PAGES, pagesForUser } = require('../middleware/authz');
const { assertCanGrant, assertCanTouchUser, assertSingleSuperadmin, assertRootOwnerSafe, isRootOwner } = require('../services/authz');
const { getUser, listUsers } = require('../services/userStore');
const { logAudit } = require('../services/audit');
const { ensureDevotee } = require('../services/people');
const { mapUser } = require('../utils/mappers');

const router = express.Router();
const VALID_ROLES = Object.keys(ROLE_PAGES);

const adminTier = requireRole('superadmin', 'admin');

function dto(row) {
  const u = mapUser(row);
  u.pages = pagesForUser(row);
  u.rootOwner = isRootOwner(row);   // the immovable ADMIN_EMAIL account
  return u;
}

/* GET /  — everyone signed in may read the roster (matches the client). */
router.get('/', async (req, res, next) => {
  try {
    const rows = await listUsers();
    res.json(rows.map(dto));
  } catch (e) { next(e); }
});

/* GET /:id */
router.get('/:id', async (req, res, next) => {
  try {
    const u = await getUser(parseInt(req.params.id, 10));
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(dto(u));
  } catch (e) { next(e); }
});

/* POST /  — create an account.
   body: { email, roles?[],
           devoteeId?  — link an existing person (id or code), OR
           name?/firstName?/lastName?, mobile?, city?, state?, samaj? — a new one }
   Every account is a person: an existing devotee is linked as-is, otherwise the
   shared devotee row is created (or reused by mobile). users.devotee_id is set. */
router.post('/', adminTier, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    // an explicitly-picked existing devotee wins — no duplicate is ever created
    let linkedDev = null;
    if (req.body.devoteeId != null && String(req.body.devoteeId).trim()) {
      linkedDev = await queryOne(
        'SELECT * FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
        [parseInt(req.body.devoteeId, 10) || -1, String(req.body.devoteeId)]
      );
      if (!linkedDev) return res.status(400).json({ error: 'That devotee no longer exists' });
      const taken = await queryOne('SELECT id FROM users WHERE devotee_id = ? AND is_deleted = 0', [linkedDev.id]);
      if (taken) return res.status(409).json({ error: 'That devotee already has a login account' });
    }

    const name = linkedDev
      ? linkedDev.name
      : String(req.body.name || `${req.body.firstName || ''} ${req.body.lastName || ''}`).trim();
    const mobile = linkedDev ? (linkedDev.mobile || '') : (req.body.mobile || '');
    const city = linkedDev ? (linkedDev.city || '') : (req.body.city || '');
    const roles = [...new Set(req.body.roles || [])];
    for (const r of roles) {
      if (!VALID_ROLES.includes(r)) return res.status(400).json({ error: `Unknown role: ${r}` });
      assertCanGrant(req.user, r);
      await assertSingleSuperadmin(r, null);   // a brand-new account can never be superadmin
    }

    const existing = await queryOne('SELECT id, is_deleted FROM users WHERE lower(email) = ?', [email]);
    if (existing && !existing.is_deleted) return res.status(409).json({ error: 'That email already has an account' });

    let userId;
    if (existing) {
      await run(`UPDATE users SET is_deleted = 0, active = 1, name = ?, mobile = ?, city = ?, updated_at = datetime('now') WHERE id = ?`,
        [name, mobile, city, existing.id]);
      userId = existing.id;
      await run('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    } else {
      const r = await run('INSERT INTO users (email, name, mobile, city, active) VALUES (?, ?, ?, ?, 1)',
        [email, name, mobile, city]);
      userId = r.lastInsertRowid;
    }
    for (const role of roles) {
      await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [userId, role]);
    }

    // link the person: the picked devotee, else create-or-reuse one by mobile
    const devoteeId = linkedDev ? linkedDev.id : await ensureDevotee({
      name, firstName: req.body.firstName, lastName: req.body.lastName,
      mobile, city, state: req.body.state, samaj: req.body.samaj,
    });
    if (devoteeId) await run('UPDATE users SET devotee_id = ? WHERE id = ?', [devoteeId, userId]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Access',
      action: 'CREATE', entityType: 'user', entityId: userId, details: { email, roles } });

    const u = await getUser(userId);
    res.status(201).json(dto(u));
  } catch (e) { next(e); }
});

/* PATCH /:id  — profile fields + active flag (not roles; use the roles routes). */
router.patch('/:id', adminTier, async (req, res, next) => {
  try {
    const u = await getUser(parseInt(req.params.id, 10));
    if (!u) return res.status(404).json({ error: 'User not found' });
    assertCanTouchUser(req.user, u);
    if (req.body.active === false) assertRootOwnerSafe(u, 'disable');

    const sets = [];
    const args = [];
    for (const f of ['name', 'mobile', 'city']) {
      if (typeof req.body[f] === 'string') { sets.push(`${f} = ?`); args.push(req.body[f]); }
    }
    if (typeof req.body.active === 'boolean') { sets.push('active = ?'); args.push(req.body.active ? 1 : 0); }
    if (!sets.length) return res.json(dto(u));

    sets.push(`updated_at = datetime('now')`);
    args.push(u.id);
    await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args);

    // disabling a user immediately kills their live sessions (ChallanPro gap)
    if (req.body.active === false) {
      await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [u.id]);
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Access',
      action: 'UPDATE', entityType: 'user', entityId: u.id, details: req.body });

    res.json(dto(await getUser(u.id)));
  } catch (e) { next(e); }
});

/* POST /:id/roles  { role }  — grant */
router.post('/:id/roles', adminTier, async (req, res, next) => {
  try {
    const role = String(req.body.role || '');
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });
    assertCanGrant(req.user, role);

    const u = await getUser(parseInt(req.params.id, 10));
    if (!u) return res.status(404).json({ error: 'User not found' });
    assertCanTouchUser(req.user, u);          // an admin cannot alter an admin/superadmin account
    await assertSingleSuperadmin(role, u.id);

    if (!u.roles.includes(role)) {
      await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [u.id, role]);
      await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Access',
        action: 'GRANT', entityType: 'user', entityId: u.id, details: { role } });
    }
    res.json(dto(await getUser(u.id)));
  } catch (e) { next(e); }
});

/* DELETE /:id/roles/:role  — revoke */
router.delete('/:id/roles/:role', adminTier, async (req, res, next) => {
  try {
    const role = req.params.role;
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });
    assertCanGrant(req.user, role);

    const u = await getUser(parseInt(req.params.id, 10));
    if (!u) return res.status(404).json({ error: 'User not found' });
    assertCanTouchUser(req.user, u);          // an admin cannot alter an admin/superadmin account
    if (role === 'superadmin') assertRootOwnerSafe(u, 'revoke-superadmin');

    await run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', [u.id, role]);
    // losing a scoped role can change what they may see — revoke live sessions so they re-auth
    await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [u.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Access',
      action: 'REVOKE', entityType: 'user', entityId: u.id, details: { role } });

    res.json(dto(await getUser(u.id)));
  } catch (e) { next(e); }
});

/* DELETE /:id  — soft-delete the account + kill its sessions. */
router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const u = await getUser(parseInt(req.params.id, 10));
    if (!u) return res.status(404).json({ error: 'User not found' });
    assertCanTouchUser(req.user, u);
    assertRootOwnerSafe(u, 'delete');
    if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

    await run(`UPDATE users SET is_deleted = 1, active = 0, updated_at = datetime('now') WHERE id = ?`, [u.id]);
    await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [u.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Access',
      action: 'DELETE', entityType: 'user', entityId: u.id, details: { email: u.email } });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
