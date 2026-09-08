/* Server-side authorization — replaces the client persona guard.
   ROLE_PAGES mirrors js/people.js ROLE_META so the two never drift.
   (BACKEND_PLAN.md §5.2) */
const { queryAll } = require('../db/connection');

const ROLE_PAGES = {
  superadmin:        ['*'],
  admin:             ['*'],
  management_lead:   ['dashboard', 'management'],
  pooja_coordinator: ['dashboard', 'puja'],
  committee_leader:  ['dashboard', 'committees'],
  event_incharge:    ['dashboard', 'events', 'calendar'],
  accountant:        ['dashboard', 'donations', 'expenses', 'reports'],
};

// Only a superadmin may grant/revoke these, disable such an account, or impersonate.
const PRIVILEGED_ROLES = ['superadmin', 'admin'];

function pagesForUser(user) {
  const roles = (user && user.roles) || [];
  if (roles.includes('superadmin') || roles.includes('admin')) return ['*'];
  const set = new Set();
  roles.forEach(r => (ROLE_PAGES[r] || []).forEach(p => set.add(p)));
  return [...set];
}

function isSuperadmin(user) { return !!user && (user.roles || []).includes('superadmin'); }
function isAdminTier(user) {
  const r = (user && user.roles) || [];
  return r.includes('superadmin') || r.includes('admin');
}

/** Gate a route on holding at least one of the given roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    const held = (req.user && req.user.roles) || [];
    if (held.some(r => roles.includes(r))) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

const requireSuperadmin = (req, res, next) =>
  isSuperadmin(req.user) ? next() : res.status(403).json({ error: 'Superadmin only' });

/**
 * attachScope — resolves the caller's owned-entity ids once per request so
 * per-resource routers can filter without re-querying. Admin tier => wildcard.
 */
async function attachScope(req, res, next) {
  try {
    const user = req.user || {};
    const roles = user.roles || [];
    const scope = {
      isSuperadmin: isSuperadmin(user),
      isAdmin: isAdminTier(user),
      roles,
      teamIds: [],
      committeeIds: [],
      poojaIds: [],
      eventIds: [],
    };

    if (!scope.isAdmin && user.id) {
      if (roles.includes('management_lead')) {
        scope.teamIds = (await queryAll(
          'SELECT id FROM teams WHERE lead_id = ? AND is_deleted = 0', [user.id]
        )).map(r => r.id);
      }
      if (roles.includes('committee_leader')) {
        scope.committeeIds = (await queryAll(
          'SELECT id FROM committees WHERE leader_id = ? AND is_deleted = 0', [user.id]
        )).map(r => r.id);
      }
      if (roles.includes('pooja_coordinator')) {
        scope.poojaIds = (await queryAll(
          'SELECT pooja_id AS id FROM pooja_coordinator_links WHERE user_id = ?', [user.id]
        )).map(r => r.id);
      }
      if (roles.includes('event_incharge')) {
        scope.eventIds = (await queryAll(
          'SELECT id FROM events WHERE in_charge_id = ? AND is_deleted = 0', [user.id]
        )).map(r => r.id);
      }
    }

    req.scope = scope;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = {
  ROLE_PAGES, PRIVILEGED_ROLES,
  pagesForUser, isSuperadmin, isAdminTier,
  requireRole, requireSuperadmin, attachScope,
};
