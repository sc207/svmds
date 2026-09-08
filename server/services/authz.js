/* Account-management guardrails (BACKEND_PLAN.md §5.2a).
   The two-tier rule: `admin` does everything, EXCEPT touching privileged
   accounts or granting/revoking privileged roles — those are superadmin-only.
   On top of that the PRIMARY OWNER account (config.adminEmail — the address wired
   into Google auth / Turso / Render and re-bootstrapped as superadmin on every
   boot) can never be disabled, deleted, or stripped of superadmin by anyone.
   Throws { status, message } which the error handler turns into a JSON response. */
const { PRIVILEGED_ROLES } = require('../middleware/authz');
const config = require('../config');

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function isSuper(actor) { return (actor.roles || []).includes('superadmin'); }
function isAdminTier(actor) {
  const r = actor.roles || [];
  return r.includes('superadmin') || r.includes('admin');
}

/** The one immovable owner account, keyed on ADMIN_EMAIL. */
function isRootOwner(user) {
  return !!config.adminEmail &&
    String((user && user.email) || '').toLowerCase().trim() === config.adminEmail;
}

/** Block a destructive change to the primary owner, whoever is calling. */
function assertRootOwnerSafe(targetUser, action) {
  if (!isRootOwner(targetUser)) return;
  const what = action === 'delete' ? 'deleted'
    : action === 'disable' ? 'disabled'
    : 'stripped of the superadmin role';
  throw httpError(403, `The primary owner account (${targetUser.email}) is protected and cannot be ${what}.`);
}

/** Can `actor` grant or revoke `role` on someone? */
function assertCanGrant(actor, role) {
  if (isRootOwner(actor)) return;                    // the primary owner may manage anyone
  if (!isAdminTier(actor)) throw httpError(403, 'Forbidden');
  if (PRIVILEGED_ROLES.includes(role) && !isSuper(actor)) {
    throw httpError(403, 'Only a superadmin can grant or revoke admin / superadmin');
  }
}

/** There is exactly ONE superadmin — the bootstrapped primary owner. Once it
    exists, the `superadmin` role can never be granted to anyone else, by anyone
    (not an admin, not even the existing superadmin). Grant `admin` instead. */
async function assertSingleSuperadmin(role, targetUserId) {
  if (role !== 'superadmin') return;
  const { queryOne } = require('../db/connection');
  const row = await queryOne(
    `SELECT ur.user_id FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
     WHERE ur.role = 'superadmin' AND u.is_deleted = 0
     LIMIT 1`
  );
  if (row && row.user_id !== targetUserId) {
    throw httpError(409, 'Only one superadmin is allowed (the primary owner account). Grant the "admin" role instead.');
  }
}

/** Can `actor` edit / disable `targetUser` (row with roles[])? */
function assertCanTouchUser(actor, targetUser) {
  // The primary owner (ADMIN_EMAIL) may manage any account — including cleaning
  // up a stray second superadmin. assertRootOwnerSafe still protects the owner
  // row itself from being disabled / deleted by anyone.
  if (isRootOwner(actor)) return;
  if (!isAdminTier(actor)) throw httpError(403, 'Forbidden');
  const targetRoles = targetUser.roles || [];
  const targetIsPrivileged = targetRoles.some(r => PRIVILEGED_ROLES.includes(r));
  if (targetIsPrivileged && !isSuper(actor)) {
    throw httpError(403, 'Only a superadmin can modify an admin / superadmin account');
  }
  if (targetRoles.includes('superadmin') && actor.id !== targetUser.id) {
    // a non-owner superadmin still cannot touch another superadmin
    throw httpError(403, 'A superadmin account cannot be modified here');
  }
}

module.exports = {
  assertCanGrant, assertCanTouchUser, assertSingleSuperadmin,
  isRootOwner, assertRootOwnerSafe, httpError,
};
