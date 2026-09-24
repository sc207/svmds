/* Accounts & Access — the `users` + `user_roles` API, carried over from the
   portal. There is no password and no self-signup: an administrator registers
   a Google address here, gives it roles, and that person signs in with Google.
   All writes are admin-tier; admin/superadmin changes are superadmin-only
   (services/authz.js), and the ADMIN_EMAIL owner account can never be
   disabled, deleted or demoted. */
const express = require('express');
const { queryOne, run } = require('../db/connection');
const { requireRole, ROLE_PAGES, pagesForUser, rankOf } = require('../middleware/authz');
const { assertCanGrant, assertCanTouchUser, assertSingleSuperadmin, assertRootOwnerSafe, isRootOwner } = require('../services/authz');
const { getUser, listUsers } = require('../services/userStore');
const { logAudit } = require('../services/audit');
const { mapUser } = require('../utils/mappers');
const { needsFreshAuth } = require('../middleware/auth');
/* Changing who has access is one of the risky actions (middleware/auth.js). */
const fresh = needsFreshAuth('Changing accounts and access');
/* Editing a name or mobile is not; disabling an account is. */
const freshIfDisabling = (req, res, next) => (req.body && req.body.active === false ? fresh(req, res, next) : next());

const router = express.Router();
const VALID_ROLES = Object.keys(ROLE_PAGES);
/* "abc" as an id is simply no such account (NaN reached the driver as a 500). */
const idOf = (v) => (/^\d+$/.test(String(v)) ? Number(v) : -1);
const adminTier = requireRole('superadmin', 'admin');

const who = (req) => ({ userId: req.user.id, userEmail: req.user.email, userName: req.user.name });

function dto(row) {
  const u = mapUser(row);
  u.pages = pagesForUser(row);
  u.rank = rankOf(row);
  u.rootOwner = isRootOwner(row);
  return u;
}

async function grant(userId, role) {
  await run(`INSERT INTO user_roles (user_id, role) SELECT ?, ? WHERE NOT EXISTS
             (SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?)`, [userId, role, userId, role]);
}

/* GET /  — the full roster (PII). Admin-tier only. */
router.get('/', adminTier, async (req, res, next) => {
  try { res.json((await listUsers()).map(dto)); } catch (e) { next(e); }
});

/* GET /directory — names only, for anyone signed in. Before /:id. */
router.get('/directory', async (req, res, next) => {
  try {
    const rows = await listUsers();
    res.json(rows.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name || '', roles: u.roles || [] })));
  } catch (e) { next(e); }
});

router.get('/:id', adminTier, async (req, res, next) => {
  try {
    const u = await getUser(idOf(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(dto(u));
  } catch (e) { next(e); }
});

/* POST /  { email, name?, mobile?, city?, roles?[] } */
router.post('/', adminTier, fresh, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid Google email address is required' });
    }
    const name = String(req.body.name || '').trim() || email.split('@')[0];
    const mobile = String(req.body.mobile || '').trim();
    const city = String(req.body.city || '').trim();
    const roles = [...new Set(req.body.roles || [])];
    for (const r of roles) {
      if (!VALID_ROLES.includes(r)) return res.status(400).json({ error: `Unknown role: ${r}` });
      assertCanGrant(req.user, r);
      await assertSingleSuperadmin(r, null);
    }

    const existing = await queryOne('SELECT id, is_deleted FROM users WHERE lower(email) = ?', [email]);
    if (existing && !existing.is_deleted) return res.status(409).json({ error: 'That email already has an account' });

    let userId;
    if (existing) {                                  // revive a deleted account
      await run(`UPDATE users SET is_deleted = 0, active = 1, name = ?, mobile = ?, city = ?, updated_at = datetime('now') WHERE id = ?`,
        [name, mobile, city, existing.id]);
      userId = existing.id;
      await run('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    } else {
      try {
        userId = (await run('INSERT INTO users (email, name, mobile, city, active) VALUES (?, ?, ?, ?, 1)',
          [email, name, mobile, city])).lastInsertRowid;
      } catch (e) {
        const won = await queryOne('SELECT id FROM users WHERE lower(email) = ?', [email]);
        if (won) return res.status(409).json({ error: 'That email already has an account' });
        throw e;
      }
    }
    for (const role of roles) await grant(userId, role);

    await logAudit({ ...who(req), module: 'Access', action: 'CREATE', entityType: 'account',
      entityId: userId, details: { email, roles } });
    res.status(201).json(dto(await getUser(userId)));
  } catch (e) { next(e); }
});

/* PATCH /:id  { name?, mobile?, city?, active? } — not roles. */
router.patch('/:id', adminTier, freshIfDisabling, async (req, res, next) => {
  try {
    const u = await getUser(idOf(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found' });
    assertCanTouchUser(req.user, u);
    if (req.body.active === false) {
      assertRootOwnerSafe(u, 'disable');
      if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    const sets = [];
    const args = [];
    for (const f of ['name', 'mobile', 'city']) {
      if (typeof req.body[f] === 'string') { sets.push(`${f} = ?`); args.push(req.body[f].trim()); }
    }
    if (typeof req.body.active === 'boolean') { sets.push('active = ?'); args.push(req.body.active ? 1 : 0); }
    if (!sets.length) return res.json(dto(u));

    sets.push(`updated_at = datetime('now')`);
    args.push(u.id);
    await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args);
    if (req.body.active === false) {
      await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [u.id]);
    }
    await logAudit({ ...who(req), module: 'Access', action: 'UPDATE', entityType: 'account',
      entityId: u.id, details: { email: u.email, ...req.body } });
    res.json(dto(await getUser(u.id)));
  } catch (e) { next(e); }
});

/* POST /:id/roles  { role } — grant */
router.post('/:id/roles', adminTier, fresh, async (req, res, next) => {
  try {
    const role = String(req.body.role || '');
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });
    assertCanGrant(req.user, role);
    const u = await getUser(idOf(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found' });
    assertCanTouchUser(req.user, u);
    await assertSingleSuperadmin(role, u.id);
    if (!u.roles.includes(role)) {
      await grant(u.id, role);
      await logAudit({ ...who(req), module: 'Access', action: 'GRANT', entityType: 'account',
        entityId: u.id, details: { email: u.email, role } });
    }
    res.json(dto(await getUser(u.id)));
  } catch (e) { next(e); }
});

/* DELETE /:id/roles/:role — revoke */
router.delete('/:id/roles/:role', adminTier, fresh, async (req, res, next) => {
  try {
    const role = req.params.role;
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });
    assertCanGrant(req.user, role);
    const u = await getUser(idOf(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found' });
    assertCanTouchUser(req.user, u);
    if (role === 'superadmin') assertRootOwnerSafe(u, 'revoke-superadmin');

    await run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', [u.id, role]);
    await logAudit({ ...who(req), module: 'Access', action: 'REVOKE', entityType: 'account',
      entityId: u.id, details: { email: u.email, role } });
    res.json(dto(await getUser(u.id)));
  } catch (e) { next(e); }
});

/* DELETE /:id — soft-delete the account + kill its sessions. */
router.delete('/:id', adminTier, fresh, async (req, res, next) => {
  try {
    const u = await getUser(idOf(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found' });
    assertCanTouchUser(req.user, u);
    assertRootOwnerSafe(u, 'delete');
    if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

    await run('DELETE FROM user_roles WHERE user_id = ?', [u.id]);
    await run(`UPDATE users SET is_deleted = 1, active = 0, updated_at = datetime('now') WHERE id = ?`, [u.id]);
    await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [u.id]);
    await logAudit({ ...who(req), module: 'Access', action: 'DELETE', entityType: 'account',
      entityId: u.id, details: { email: u.email } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
