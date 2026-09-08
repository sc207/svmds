/* API-backed Accounts & Access panel. When the backend is reachable this
   overrides renderAccess() from access.js with a live view of /api/users +
   /api/sessions, and gives superadmin / admin the controls to add, edit,
   disable and delete accounts and to terminate sessions.
   Falls back to the seed-data renderer (access.js) when offline. */
(function () {
  if (typeof window === 'undefined') return;

  var ROLES = ['superadmin', 'admin', 'management_lead', 'pooja_coordinator',
               'committee_leader', 'event_incharge', 'accountant'];
  var ROLE_LABEL = {
    superadmin: 'Super Admin', admin: 'Administrator', management_lead: 'Management Lead',
    pooja_coordinator: 'Pooja Coordinator', committee_leader: 'Committee Leader',
    event_incharge: 'Event In-charge', accountant: 'Temple Accountant',
  };
  var PRIVILEGED = { superadmin: 1, admin: 1 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function me() { return (window.API && window.API.session) || {}; }
  function iAmSuper() { var s = me(); return !!(s.user && (s.user.roles || []).indexOf('superadmin') !== -1); }

  var USERS = [];
  var SESSIONS = [];

  async function load() {
    USERS = await window.API.get('/users');
    try { SESSIONS = await window.API.get('/sessions'); } catch (e) { SESSIONS = []; }
  }

  function draw() {
    var root = document.getElementById('accessRoot');
    if (!root) return;
    var canWrite = true; // server enforces; button visibility is a hint only
    var superOnly = iAmSuper();

    var total = USERS.length;
    var admins = USERS.filter(function (u) { return (u.roles || []).indexOf('superadmin') !== -1; }).length;
    var disabled = USERS.filter(function (u) { return !u.active; }).length;

    root.innerHTML =
      '<div class="flex justify-between items-center mg-page-head">' +
        '<div><h1 class="banner-title mg-page-title">🛡️ Accounts &amp; Access</h1>' +
        '<p class="mg-page-sub">Every authorised Google account, its roles, and live device sessions</p></div>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
          '<button class="btn btn-primary mg-btn-xs" onclick="accAddAccount()">+ Add account</button>' +
          '<button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="accRevokeAllSessions()">Terminate all other sessions</button>' +
        '</div>' +
      '</div>' +

      '<div class="stats-grid">' +
        kpi('Authorised Accounts', total, 'Google accounts with access', '🛡️') +
        kpi('Super Admins', admins, 'Full authority', '👑') +
        kpi('Disabled', disabled, 'Cannot sign in', '⛔') +
        kpi('Active Sessions', SESSIONS.length, 'Signed-in devices', '📱') +
      '</div>' +

      '<div class="card mg-mt"><div class="card-header flex justify-between items-center">' +
        '<div class="card-title">Accounts <span class="mg-muted-xs">(' + total + ')</span></div></div>' +
        '<div class="card-body" style="padding:0"><div class="mg-table-scroll"><table class="custom-table acc-table">' +
        '<thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        USERS.map(function (u) {
          var priv = (u.roles || []).some(function (r) { return PRIVILEGED[r]; });
          var lockRow = priv && !superOnly;
          var actions;
          if (u.rootOwner) {
            actions = '<span class="badge badge-maroon">🔒 ' + esc(T('acc_owner', 'Primary owner')) + '</span>' +
                      ' <span class="mg-muted-xs">' + esc(T('acc_owner_note', 'protected — cannot be disabled or removed')) + '</span>';
          } else if (lockRow) {
            actions = '<span class="mg-muted-xs">superadmin only</span>';
          } else {
            actions =
              '<button class="btn btn-outline mg-btn-xs" onclick="accEditRoles(\'' + u.id + '\')">Roles</button> ' +
              '<button class="btn btn-outline mg-btn-xs" onclick="accToggleActive(\'' + u.id + '\')">' + (u.active ? 'Disable' : 'Enable') + '</button> ' +
              '<button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="accDeleteAccount(\'' + u.id + '\')">Delete</button>';
          }
          return '<tr>' +
            '<td><div class="mg-name-cell"><span class="mg-avatar">' + esc((u.name || u.email || '?')[0].toUpperCase()) + '</span>' +
              '<div><strong>' + esc(u.name || '—') + '</strong><div class="mg-muted-xs">' + esc(u.id) + (u.googleLinked ? ' · linked' : '') + '</div></div></div></td>' +
            '<td class="acc-wrap">' + esc(u.email) + '</td>' +
            '<td>' + (u.roles || []).map(function (r) { return '<span class="badge badge-maroon">' + esc(ROLE_LABEL[r] || r) + '</span>'; }).join(' ') + '</td>' +
            '<td>' + (u.active ? '<span class="badge badge-confirmed">Active</span>' : '<span class="badge badge-cancelled">Disabled</span>') + '</td>' +
            '<td style="white-space:nowrap">' + actions + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div></div>' +

      '<div class="card mg-mt"><div class="card-header"><div class="card-title">Active sessions <span class="mg-muted-xs">(' + SESSIONS.length + ')</span></div></div>' +
        '<div class="card-body" style="padding:0"><div class="mg-table-scroll"><table class="custom-table acc-table acc-table-sm">' +
        '<thead><tr><th>User</th><th>Device</th><th>IP</th><th>Last seen</th><th></th></tr></thead><tbody>' +
        (SESSIONS.length ? SESSIONS.map(function (s) {
          return '<tr>' +
            '<td>' + esc(s.userEmail) + (s.current ? ' <span class="badge badge-confirmed">this device</span>' : '') + '</td>' +
            '<td class="acc-wrap mg-muted-xs">' + esc((s.userAgent || '—').slice(0, 60)) + '</td>' +
            '<td class="mg-muted-xs">' + esc(s.ip || '—') + '</td>' +
            '<td class="mg-muted-xs">' + esc(s.lastSeen || '—') + '</td>' +
            '<td>' + (s.current ? '' : '<button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="accRevokeSession(\'' + s.id + '\')">Revoke</button>') + '</td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="5" class="mg-muted-xs" style="padding:1rem">No other active sessions.</td></tr>') +
        '</tbody></table></div></div></div>';
  }

  function kpi(label, value, meta, icon) {
    if (typeof kpiCard === 'function') return kpiCard(label, value, meta, icon);
    return '<div class="stat-card"><div class="stat-label">' + esc(label) + '</div><div class="stat-value">' + esc(value) + '</div><div class="mg-muted-xs">' + esc(meta) + '</div></div>';
  }

  async function refresh() { try { await load(); draw(); } catch (e) { toast('Load failed: ' + e.message); } }

  /* ---------- actions ---------- */
  function roleCheckboxes(current) {
    var superOnly = iAmSuper();
    return ROLES.map(function (r) {
      var disabled = PRIVILEGED[r] && !superOnly ? ' disabled' : '';
      var checked = (current || []).indexOf(r) !== -1 ? ' checked' : '';
      return '<label style="display:flex;gap:.5rem;align-items:center;margin:.3rem 0">' +
        '<input type="checkbox" value="' + r + '"' + checked + disabled + '> ' + esc(ROLE_LABEL[r] || r) +
        (disabled ? ' <span class="mg-muted-xs">(superadmin only)</span>' : '') + '</label>';
    }).join('');
  }
  function pickedRoles(form) {
    return Array.prototype.slice.call(form.querySelectorAll('input[type=checkbox]:checked')).map(function (c) { return c.value; });
  }

  window.accAddAccount = function () {
    if (typeof openSheet !== 'function') { toast('UI not ready'); return; }
    openSheet({
      title: 'Add account',
      body: '<form id="accAddForm">' +
        '<div class="form-group"><label class="form-label">Google email *</label><input class="form-input" name="email" type="email" placeholder="person@gmail.com" required></div>' +
        '<div class="form-group"><label class="form-label">Name</label><input class="form-input" name="name"></div>' +
        '<div class="form-group"><label class="form-label">Mobile</label><input class="form-input" name="mobile" maxlength="10"></div>' +
        '<div class="form-group"><label class="form-label">Roles</label>' + roleCheckboxes([]) + '</div></form>',
      footer: '<button class="btn btn-outline" onclick="closeSheet()">Cancel</button>' +
              '<button class="btn btn-primary" onclick="accSubmitAdd()">Create</button>',
    });
  };
  window.accSubmitAdd = async function () {
    var f = document.getElementById('accAddForm'); if (!f) return;
    var body = { email: f.email.value.trim(), name: f.name.value.trim(), mobile: f.mobile.value.trim(), roles: pickedRoles(f) };
    if (!body.email) { toast('Email required'); return; }
    try { await window.API.post('/users', body); if (typeof closeSheet === 'function') closeSheet(); toast('Account created'); await refresh(); }
    catch (e) { toast(e.message); }
  };

  window.accEditRoles = function (id) {
    var u = USERS.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    openSheet({
      title: 'Roles — ' + esc(u.name || u.email),
      body: '<form id="accRolesForm">' + roleCheckboxes(u.roles) + '</form>',
      footer: '<button class="btn btn-outline" onclick="closeSheet()">Cancel</button>' +
              '<button class="btn btn-primary" onclick="accSubmitRoles(\'' + id + '\')">Save</button>',
    });
  };
  window.accSubmitRoles = async function (id) {
    var u = USERS.filter(function (x) { return x.id === id; })[0];
    var f = document.getElementById('accRolesForm'); if (!u || !f) return;
    var want = pickedRoles(f), have = u.roles || [];
    try {
      for (var i = 0; i < want.length; i++) if (have.indexOf(want[i]) === -1) await window.API.post('/users/' + id + '/roles', { role: want[i] });
      for (var k = 0; k < have.length; k++) if (want.indexOf(have[k]) === -1) await window.API.del('/users/' + id + '/roles/' + have[k]);
      if (typeof closeSheet === 'function') closeSheet();
      toast('Roles updated'); await refresh();
    } catch (e) { toast(e.message); }
  };

  window.accToggleActive = async function (id) {
    var u = USERS.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    try {
      await window.API.patch('/users/' + id, { active: !u.active });
      toast(u.active ? 'Account disabled' : 'Account enabled');
      await refresh();
    } catch (e) { toast(e.message); }
  };

  window.accDeleteAccount = function (id) {
    var u = USERS.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    var go = async function () {
      try { await window.API.del('/users/' + id); toast('Account deleted'); }
      catch (e) { toast(e.message); }
      if (typeof closeConfirm === 'function') closeConfirm();
      await refresh();
    };
    if (typeof openConfirm === 'function') {
      openConfirm({ title: 'Delete account', body: 'Permanently remove <strong>' + esc(u.email) + '</strong> and end its sessions?', danger: true, confirmLabel: 'Delete', onConfirm: go });
    } else if (window.confirm('Delete ' + u.email + '?')) go();
  };

  window.accRevokeSession = async function (sid) {
    try { await window.API.del('/sessions/' + sid); toast('Session revoked'); await refresh(); }
    catch (e) { toast(e.message); }
  };
  window.accRevokeAllSessions = function () {
    var go = async function () {
      try { await window.API.del('/sessions/all'); toast('All other sessions terminated'); }
      catch (e) { toast(e.message); }
      if (typeof closeConfirm === 'function') closeConfirm();
      await refresh();
    };
    if (typeof openConfirm === 'function') {
      openConfirm({ title: 'Terminate sessions', body: 'Sign out every other device and person. Your current session stays active.', danger: true, confirmLabel: 'Terminate all', onConfirm: go });
    } else if (window.confirm('Terminate all other sessions?')) go();
  };

  /* ---------- install ---------- */
  var seedRender = window.renderAccess;
  window.renderAccess = function () {
    if (!window.API || !window.API.online) { if (typeof seedRender === 'function') return seedRender(); return; }
    var root = document.getElementById('accessRoot');
    if (root && !USERS.length) root.innerHTML = '<div class="mg-muted-xs" style="padding:1rem">Loading accounts…</div>';
    refresh();
  };
})();
