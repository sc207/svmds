/* Server-side authorization — replaces the client persona guard.
   ROLE_PAGES mirrors js/people.js ROLE_META so the two never drift.
   (BACKEND_PLAN.md §5.2) */
const { queryAll, queryOne } = require('../db/connection');

// Every role can open the Unified Calendar; it self-restricts its categories
// for non-admins on the client (public/js/calendar.js).
const ROLE_PAGES = {
  superadmin:        ['*'],
  admin:             ['*'],
  management_lead:   ['dashboard', 'management', 'calendar'],
  pooja_coordinator: ['dashboard', 'puja', 'calendar'],
  committee_leader:  ['dashboard', 'committees', 'calendar'],
  event_incharge:    ['dashboard', 'events', 'calendar'],
  accountant:        ['dashboard', 'donations', 'expenses', 'reports', 'calendar'],
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
      // resolve the caller's devotee once, and match owned entities by EITHER the
      // account (lead_id / leader_id / user_id / in_charge_id) OR the devotee
      // link (lead_devotee_id / leader_devotee_id / …). A leader assigned only by
      // devotee id — before their account existed — is still scoped correctly.
      const me = await queryOne('SELECT devotee_id FROM users WHERE id = ?', [user.id]);
      const devId = (me && me.devotee_id) || -1;   // -1 never matches a real id
      const ids = rows => [...new Set(rows.map(r => r.id))];

      if (roles.includes('management_lead')) {
        scope.teamIds = ids(await queryAll(
          'SELECT id FROM teams WHERE is_deleted = 0 AND (lead_id = ? OR lead_devotee_id = ?)',
          [user.id, devId]));
      }
      if (roles.includes('committee_leader')) {
        scope.committeeIds = ids(await queryAll(
          'SELECT id FROM committees WHERE is_deleted = 0 AND (leader_id = ? OR leader_devotee_id = ?)',
          [user.id, devId]));
      }
      if (roles.includes('pooja_coordinator')) {
        scope.poojaIds = ids(await queryAll(
          'SELECT pooja_id AS id FROM pooja_coordinator_links WHERE user_id = ? OR devotee_id = ?',
          [user.id, devId]));
      }
      if (roles.includes('event_incharge')) {
        scope.eventIds = ids(await queryAll(
          'SELECT id FROM events WHERE is_deleted = 0 AND (in_charge_id = ? OR in_charge_devotee_id = ?)',
          [user.id, devId]));
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
