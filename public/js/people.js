/* ============================================================
   ACCOUNTS & AUTHORIZATION — the single source of truth for
   "who has an account and what can they open".
   Loaded right after i18n.js. Every module's leader / coordinator
   / in-charge picker and the topbar role selector are generated
   from this list, and the Accounts & Access page reports on it.
   ------------------------------------------------------------
   role keys:
     superadmin          - full platform + manages Admin/Super Admin accounts,
                           impersonation, backup import / wipe
     admin               - sees & does everything superadmin does EXCEPT the
                           four privileged operations above (a second tier)
     management_lead     - runs one or more Management teams
     pooja_coordinator   - runs one or more Poojas
     committee_leader    - runs one or more Samaj committees
     event_incharge      - runs temple events
     accountant          - donations, expenses, reports
   ============================================================ */

(function () {
  if (typeof window !== 'undefined' && typeof window.t !== 'function') {
    window.t = function (k, f) { return f != null ? f : k; };
  }

  var ROLE_META = {
    superadmin:        { icon: '🛡️', pages: ['*'] },
    admin:             { icon: '🛡️', pages: ['*'] },
    management_lead:   { icon: '🗂️', pages: ['dashboard', 'management'] },
    pooja_coordinator: { icon: '🪔', pages: ['dashboard', 'puja'] },
    committee_leader:  { icon: '🏛️', pages: ['dashboard', 'committees'] },
    event_incharge:    { icon: '📅', pages: ['dashboard', 'events', 'calendar'] },
    accountant:        { icon: '💰', pages: ['dashboard', 'donations', 'expenses', 'reports'] }
  };

  /* Seeded from the people already referenced across the modules
     (same DEV-### ids the modules use, so everything cross-links). */
  var ACCOUNTS = [
    { id: 'DEV-001', name: 'Administrator', mobile: '', city: '', roles: ['superadmin'] }
  ];

  function accountById(id) { return ACCOUNTS.find(function (a) { return a.id === id; }); }
  function accountsWithRole(role) { return ACCOUNTS.filter(function (a) { return a.roles.indexOf(role) !== -1; }); }
  function accountName(id) { var a = accountById(id); return a ? a.name : id; }
  function accountRoles() { return Object.keys(ROLE_META); }
  function roleLabel(role) { return window.t('role_' + role, role.replace(/_/g, ' ')); }
  function roleIcon(role) { return (ROLE_META[role] || {}).icon || '👤'; }
  function rolePages(role) { return (ROLE_META[role] || {}).pages || []; }

  /** Pages this account may open (union of its roles). */
  function accountPages(id) {
    var a = accountById(id);
    if (!a) return [];
    if (a.roles.indexOf('superadmin') !== -1 || a.roles.indexOf('admin') !== -1) return ['*'];
    var set = {};
    a.roles.forEach(function (r) { rolePages(r).forEach(function (p) { set[p] = true; }); });
    return Object.keys(set);
  }

  /** { total, active, byRole: {role: count} } */
  function accessSummary() {
    var byRole = {};
    accountRoles().forEach(function (r) { byRole[r] = accountsWithRole(r).length; });
    return { total: ACCOUNTS.length, byRole: byRole };
  }

  /** Merge every module's activity log into one recent-first list. */
  function mergedActivity(limit) {
    var out = [];
    var push = function (arr, tag, keyId, keyName) {
      if (!Array.isArray(arr)) return;
      arr.forEach(function (a) {
        out.push({ tag: tag, text: a.text, when: a.when, scopeId: a[keyId] || null,
          ref: keyName ? (keyName(a[keyId]) || '') : '' });
      });
    };
    if (typeof MG !== 'undefined') push(MG.activity, 'Management', 'managementId', function (id) { return (typeof mgmtById === 'function' && mgmtById(id) || {}).name; });
    if (typeof POOJA !== 'undefined') push(POOJA.activity, 'Pooja', 'poojaId', function (id) { return (typeof poojaById === 'function' && poojaById(id) || {}).name; });
    if (typeof CMT !== 'undefined') push(CMT.activity, 'Committee', 'committeeId', function (id) { return (typeof cmtById === 'function' && cmtById(id) || {}).name; });
    if (typeof EV !== 'undefined') push(EV.activity, 'Event', 'eventId', function (id) { return (typeof eventById === 'function' && eventById(id) || {}).name; });
    // stable-ish ordering: "Just now" first, then keep insertion order
    out.sort(function (a, b) {
      var rank = function (w) { return /just now/i.test(w) ? 0 : /today/i.test(w) ? 1 : 2; };
      return rank(a.when) - rank(b.when);
    });
    return limit ? out.slice(0, limit) : out;
  }

  window.ACCOUNTS = ACCOUNTS;
  window.ROLE_META = ROLE_META;
  window.accountById = accountById;
  window.accountsWithRole = accountsWithRole;
  window.accountName = accountName;
  window.accountRoles = accountRoles;
  window.roleLabel = roleLabel;
  window.roleIcon = roleIcon;
  window.rolePages = rolePages;
  window.accountPages = accountPages;
  window.accessSummary = accessSummary;
  window.mergedActivity = mergedActivity;
})();
