/* Account-management guardrails (BACKEND_PLAN.md §5.2a).
   The two-tier rule: `admin` does everything, EXCEPT touching privileged
   accounts or granting/revoking privileged roles — those are superadmin-only.
   Throws { status, message } which the error handler turns into a JSON response. */
const { PRIVILEGED_ROLES } = require('../middleware/authz');

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

/** Can `actor` grant or revoke `role` on someone? */
function assertCanGrant(actor, role) {
  if (!isAdminTier(actor)) throw httpError(403, 'Forbidden');
  if (PRIVILEGED_ROLES.includes(role) && !isSuper(actor)) {
    throw httpError(403, 'Only a superadmin can grant or revoke admin / superadmin');
  }
}

/** Can `actor` edit / disable `targetUser` (row with roles[])? */
function assertCanTouchUser(actor, targetUser) {
  if (!isAdminTier(actor)) throw httpError(403, 'Forbidden');
  const targetRoles = targetUser.roles || [];
  const targetIsPrivileged = targetRoles.some(r => PRIVILEGED_ROLES.includes(r));
  if (targetIsPrivileged && !isSuper(actor)) {
    throw httpError(403, 'Only a superadmin can modify an admin / superadmin account');
  }
  if (targetRoles.includes('superadmin') && actor.id !== targetUser.id) {
    // even a superadmin cannot disable another superadmin via this API
    throw httpError(403, 'A superadmin account cannot be modified here');
  }
}

module.exports = { assertCanGrant, assertCanTouchUser, httpError };
