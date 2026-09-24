/* Authorization — which pages an account may open, and how much it may do.

   Accounts keep the portal's seven roles (user_roles). Phase 1 maps them
   onto two things:

   1. PAGES — ROLE_PAGES below, mirrored by the frontend (public/js/ui.js
      ROLE_PAGES). Keep the two in sync. Accounts, Settings and Import are
      admin-tier only; every other Phase 1 page is the daily job and is
      open to every role.

   2. RANK — the Phase 1 permission ladder (middleware/roles.js needs()):
        operator < accountant < admin < superadmin
      superadmin → superadmin, admin → admin, accountant → accountant,
      and the four scoped portal roles (management_lead, pooja_coordinator,
      committee_leader, event_incharge) → operator: their modules do not
      exist in Phase 1, so they do the daily counter work.

   An account with NO role gets no pages and a 403 on every data route,
   naming what to do (ask an administrator) — it is almost always an
   account added without its role ticked. */

const DAILY = ['dashboard', 'mahotsav', 'payments', 'devotees', 'visits', 'calendar', 'donations', 'invitation'];

const ROLE_PAGES = {
  superadmin:        ['*'],
  admin:             ['*'],
  accountant:        DAILY,
  management_lead:   DAILY,
  pooja_coordinator: DAILY,
  committee_leader:  DAILY,
  event_incharge:    DAILY,
};

const RANK = { none: -1, operator: 0, accountant: 1, admin: 2, superadmin: 3 };

// Only a superadmin may grant/revoke these, disable such an account, or impersonate.
const PRIVILEGED_ROLES = ['superadmin', 'admin'];

function pagesForUser(user) {
  const roles = (user && user.roles) || [];
  if (roles.includes('superadmin') || roles.includes('admin')) return ['*'];
  const set = new Set();
  roles.forEach((r) => (ROLE_PAGES[r] || []).forEach((p) => set.add(p)));
  return [...set];
}

/** The account's Phase 1 rank name: superadmin | admin | accountant | operator | none. */
function rankOf(user) {
  const roles = (user && user.roles) || [];
  if (roles.includes('superadmin')) return 'superadmin';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('accountant')) return 'accountant';
  if (roles.some((r) => ROLE_PAGES[r])) return 'operator';
  return 'none';
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
    if (held.some((r) => roles.includes(r))) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

const requireSuperadmin = (req, res, next) =>
  (isSuperadmin(req.user) ? next() : res.status(403).json({ error: 'Superadmin only' }));

/** Every Phase 1 data route needs an account that holds some role. */
function requireAnyRole(req, res, next) {
  if (rankOf(req.user) !== 'none') return next();
  return res.status(403).json({
    error: 'Your account has no role yet, so there is nothing it can open. ' +
           'Ask an administrator to give it a role in Accounts & Access.',
  });
}

module.exports = {
  ROLE_PAGES, RANK, PRIVILEGED_ROLES,
  pagesForUser, rankOf, isSuperadmin, isAdminTier,
  requireRole, requireSuperadmin, requireAnyRole,
};
