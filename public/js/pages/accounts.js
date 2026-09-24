/* Accounts & Access — who can sign in, what they can open, their live
   sessions, and the audit trail.

   Accounts are the portal's: an administrator registers a person's Google
   address and ticks their roles; that person then signs in with Google
   (no password, no self-signup). The server enforces every rule shown
   here (routes/users.js + services/authz.js) — this page only avoids
   offering what would be refused:
     - an admin cannot grant/revoke admin or super admin, or change such
       an account; only the super admin can
     - there is exactly one super admin (the ADMIN_EMAIL owner), and that
       account cannot be disabled, deleted or demoted
     - disabling or deleting an account ends its sessions at once */
(function (global) {
  'use strict';
  const { esc, attr, icon, debounce, openSheet, closeSheet, readForm,
          clearFieldErrors, showFieldError, toast } = UI;

  /* The portal's seven roles, and what each means in Phase 1
     (server: middleware/authz.js). */
  const ROLES = [
    ['admin',             'Administrator',     'Everything, including accounts, settings, import and the seva list'],
    ['accountant',        'Accountant',        'The daily job, plus correcting or removing recorded money'],
    ['pooja_coordinator', 'Pooja coordinator', 'The daily job: sevarthi, payments, devotees, padhramni, donations'],
    ['management_lead',   'Management lead',   'The daily job'],
    ['committee_leader',  'Committee leader',  'The daily job'],
    ['event_incharge',    'Event in-charge',   'The daily job'],
    ['superadmin',        'Super admin',       'The owner account — only one exists'],
  ];
  const LABEL = Object.fromEntries(ROLES.map(([k, l]) => [k, l]));
  const PRIVILEGED = ['superadmin', 'admin'];

  const me = () => API.currentUser();
  const isSuper = () => (me().roles || []).includes('superadmin');

  /** May the signed-in account change this one at all? (assertCanTouchUser) */
  function canTouch(u) {
    if (!u) return true;
    const priv = (u.roles || []).some((r) => PRIVILEGED.includes(r));
    if (u.roles.includes('superadmin') && u.id !== me().id) return false;
    return !priv || isSuper();
  }
  /** May the signed-in account grant/revoke this role? (assertCanGrant) */
  const canGrant = (role) => (!PRIVILEGED.includes(role) || isSuper()) && role !== 'superadmin';

  async function render(host) {
    const [users, sessions, audit] = await Promise.all([
      API.users(), API.sessions(), API.audit({ limit: 200 }),
    ]);
    const active = users.filter((u) => u.active);
    const byUser = {};
    sessions.forEach((s) => { (byUser[s.userId] = byUser[s.userId] || []).push(s); });

    host.innerHTML = `
      <div class="flex justify-between items-center mg-page-head">
        <div>
          <h1 class="banner-title mg-page-title">Accounts &amp; Access</h1>
          <p class="mg-page-sub">Who can sign in with Google, what they can do, and everything they have done</p>
        </div>
        <button class="btn btn-primary mg-btn-xs" data-add>${icon('plus', 'ico-sm')} Account</button>
      </div>

      <div class="stats-grid">
        ${fig('Accounts', active.length, `${users.length - active.length} disabled`, 'users')}
        ${fig('Administrators', users.filter((u) => u.active && u.roles.some((r) => PRIVILEGED.includes(r))).length, 'admin + super admin', 'shield')}
        ${fig('Signed in now', sessions.length, 'live sessions', 'user-check')}
        ${fig('No role yet', active.filter((u) => !u.roles.length).length, 'cannot open anything', 'alert')}
      </div>

      <div class="card">
        <div class="card-header"><h2>Accounts</h2>
          <span class="small muted">Sign-in is by Google account — add the person's Gmail / Google address</span></div>
        <div class="card-body" style="padding:0"><div class="list">
          ${users.map((u) => `
            <button class="row-item" data-user="${attr(u.id)}">
              <span class="user-chip" style="width:32px;height:32px;font-size:.8rem">
                ${esc((u.name || u.email || '?').charAt(0).toUpperCase())}</span>
              <div class="row-main">
                <div class="row-title">${esc(u.name || u.email)}
                  ${u.rootOwner ? '<span class="badge badge-gold">Owner</span>' : ''}
                  ${u.active ? '' : '<span class="badge badge-cancelled">Disabled</span>'}
                  ${u.id === me().id ? '<span class="badge badge-ok">You</span>' : ''}</div>
                <div class="row-sub">${esc(u.email)}${u.mobile ? ' · ' + esc(u.mobile) : ''}</div>
                <div class="row-sub">${u.roles.length
                  ? u.roles.map((r) => `<span class="badge">${esc(LABEL[r] || r)}</span>`).join(' ')
                  : '<span class="badge badge-warn">No role — cannot open anything</span>'}
                  ${u.googleLinked ? '' : '<span class="small muted"> · has not signed in yet</span>'}
                  ${(byUser[u.id] || []).length ? `<span class="small muted"> · ${byUser[u.id].length} live session${byUser[u.id].length === 1 ? '' : 's'}</span>` : ''}</div>
              </div>
              ${icon('chevron-right', 'ico-sm')}
            </button>`).join('')}
        </div></div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Live sessions</h2>
          <span class="small muted">Signed-in devices — end one to sign that device out</span></div>
        <div class="card-body" style="padding:0" id="sessionList"></div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Audit Trail</h2>
          <span class="small muted">latest ${esc(audit.length)}</span></div>
        <div class="card-body">
          <div class="search-bar" style="margin-bottom:.6rem">${icon('search')}
            <input class="form-input" id="auditSearch" placeholder="Filter by name" autocomplete="off"></div>
          <div id="auditList"></div>
        </div>
      </div>`;

    paintSessions(sessions, users);
    paintAudit(audit);

    host.querySelector('[data-add]').addEventListener('click', () => accountForm());
    host.querySelectorAll('[data-user]').forEach((b) =>
      b.addEventListener('click', () => {
        const u = users.find((x) => String(x.id) === b.getAttribute('data-user'));
        accountForm(u, byUser[u.id] || []);
      }));
    host.querySelector('#auditSearch').addEventListener('input', debounce(async (e) => {
      const list = document.getElementById('auditList');
      list.innerHTML = UI.loading(2);
      try { paintAudit(await API.audit({ user: e.target.value.trim(), limit: 200 })); }
      catch (err) { list.innerHTML = UI.errorState(err.message); }
    }, 280));
  }

  /* Same tile as every other figure strip (dashboard.js kpi). */
  const fig = (title, value, sub, ic) => `
    <div class="stat-card">
      <div class="stat-card-info">
        <span class="stat-card-title">${esc(title)}</span>
        <span class="stat-card-value">${esc(value)}</span>
        <span class="mg-muted-xs">${esc(sub)}</span>
      </div>
      <div class="stat-card-icon-wrapper">${icon(ic)}</div>
    </div>`;

  function device(ua) {
    const s = String(ua || '');
    const os = /iPhone|iPad/.test(s) ? 'iPhone / iPad' : /Android/.test(s) ? 'Android'
      : /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : 'Device';
    const br = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox'
      : /Safari\//.test(s) ? 'Safari' : 'browser';
    return `${os} · ${br}`;
  }

  function paintSessions(sessions, users) {
    const list = document.getElementById('sessionList');
    const email = (id) => (users.find((u) => u.id === id) || {}).email || '';
    list.innerHTML = sessions.length ? `<div class="list">${sessions.map((s) => `
      <div class="row-item" style="cursor:default">
        <div class="row-main">
          <div class="row-title" style="font-weight:500">${esc(s.userEmail || email(s.userId))}
            ${s.current ? '<span class="badge badge-ok">This device</span>' : ''}
            ${s.impersonatedBy ? '<span class="badge badge-warn">Viewing as</span>' : ''}</div>
          <div class="row-sub">${esc(device(s.userAgent))} · last seen
            <span title="${attr(s.lastSeen)} UTC">${esc(UI.ago(utcToLocal(s.lastSeen)))}</span></div>
        </div>
        ${s.current ? '' : `<button class="btn btn-outline mg-btn-xs" data-end="${attr(s.id)}">End</button>`}
      </div>`).join('')}</div>`
      : UI.empty('Nobody is signed in', 'Sessions appear here while someone is signed in.', 'user-check');
    list.querySelectorAll('[data-end]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await API.del('/sessions/' + encodeURIComponent(b.getAttribute('data-end'))); toast('Session ended', 'ok'); refreshPage(); }
      catch (err) { b.disabled = false; toast(err.message, 'err'); }
    }));
  }

  /* sessions.last_seen is stamped datetime('now') — UTC, the portal's
     convention. UI.ago reads a local timestamp, so shift it. */
  function utcToLocal(ts) {
    if (!ts) return ts;
    const d = new Date(String(ts).replace(' ', 'T') + 'Z');
    if (isNaN(d)) return ts;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /* The trail is the longest list in the app, so it pages. */
  let auditRows = [];
  let auditPage = 1;

  function paintAudit(rows) {
    const list = document.getElementById('auditList');
    if (!list) return;
    if (rows) { auditRows = rows; auditPage = 1; }
    const ACTION = {
      create: 'badge-ok', update: 'badge-info', delete: 'badge-danger',
      cancel: 'badge-warn', payment: 'badge-gold', login: 'badge-ok', grant: 'badge-info', revoke: 'badge-warn',
    };
    const pg = UI.paginate(auditRows, auditPage);
    list.innerHTML = auditRows.length ? `<div class="list">${pg.slice.map((a) => `
      <div class="row-item" style="cursor:default;align-items:flex-start">
        <span class="badge ${ACTION[a.action] || ''}">${esc(a.action)}</span>
        <div class="row-main">
          <div class="row-title" style="font-weight:500;white-space:normal">${esc(a.summary)}</div>
          <div class="row-sub">${esc(a.user_name)}${a.user_email && a.user_email !== a.user_name ? ' · ' + esc(a.user_email) : ''} ·
            <span title="${attr(a.created_at)}">${esc(UI.ago(a.created_at))}</span></div>
        </div>
      </div>`).join('')}</div>${UI.pager(pg, 'entries')}`
      : UI.empty('Nothing logged yet', 'Every sign-in, add, edit and delete will appear here.', 'history');
    UI.bindPager(list, (d) => { auditPage = pg.page + d; paintAudit(null); });
  }

  function accountForm(existing, sessions) {
    const u = existing || { roles: [] };
    const editable = canTouch(existing);
    const roleBox = ([key, label, what]) => {
      const held = u.roles.includes(key);
      const allowed = editable && canGrant(key) && !(key === 'superadmin');
      if (key === 'superadmin' && !held) return '';
      return `<label class="small" style="display:flex;gap:.5rem;align-items:flex-start;font-weight:500;margin:.35rem 0">
        <input type="checkbox" name="role_${attr(key)}" ${held ? 'checked' : ''} ${allowed ? '' : 'disabled'}
               style="width:auto;min-height:0;margin-top:.2rem">
        <span>${esc(label)}<br><span class="muted" style="font-weight:400">${esc(what)}</span></span></label>`;
    };
    openSheet({
      title: u.id ? 'Account' : 'Add Account',
      body: `
        ${u.id ? UI.contextCard({
          title: u.name || u.email,
          badge: u.rootOwner ? ' <span class="badge badge-gold">Owner</span>' : '',
          sub: u.email,
          rows: [['Signed in with Google', u.googleLinked ? 'Yes' : 'Not yet'],
                 ['Live sessions', String((sessions || []).length)]],
        }) : ''}
        ${editable ? '' : '<p class="small" style="margin:.5rem 0"><strong>Only the super admin can change an administrator account.</strong></p>'}
        <form id="acctForm" novalidate>
          ${u.id ? '' : `<div class="form-group"><label class="form-label req" for="f_email">Google email</label>
            <input class="form-input" id="f_email" name="email" type="email" autocomplete="off"
                   placeholder="name@gmail.com">
            <div class="form-hint">The address they sign in to Google with. No password is ever set.</div></div>`}
          <div class="form-row">
            <div class="form-group"><label class="form-label" for="f_name">Name</label>
              <input class="form-input" id="f_name" name="name" value="${attr(u.name || '')}" autocomplete="off" ${editable ? '' : 'disabled'}></div>
            <div class="form-group"><label class="form-label" for="f_mobile">Mobile</label>
              <input class="form-input" id="f_mobile" name="mobile" value="${attr(u.mobile || '')}" inputmode="tel" ${editable ? '' : 'disabled'}></div>
          </div>
          <div class="form-group"><label class="form-label">Roles</label>
            ${ROLES.map(roleBox).join('')}
            <div class="form-hint">An account with no role can sign in but cannot open anything.</div></div>
          ${u.id && editable && !u.rootOwner && u.id !== me().id ? `<label class="small" style="display:flex;align-items:center;gap:.45rem;font-weight:500">
            <input type="checkbox" name="active" ${u.active ? 'checked' : ''} style="width:auto;min-height:0">
            Active — untick to block sign-in (ends their sessions now)</label>` : ''}
        </form>`,
      footer: `<button class="btn btn-outline" data-sheet-close>Close</button>
        ${u.id && editable && !u.rootOwner && u.id !== me().id ? '<button class="btn btn-danger" id="acctDelete">Delete</button>' : ''}
        ${editable ? `<button class="btn btn-primary" id="acctSave">${u.id ? 'Save changes' : 'Add Account'}</button>` : ''}`,
      onMount(sheet) {
        sheet.querySelector('[data-sheet-close]').addEventListener('click', closeSheet);
        const del = sheet.querySelector('#acctDelete');
        if (del) del.addEventListener('click', () => UI.confirmSheet({
          title: 'Delete account',
          message: `${u.email} will no longer be able to sign in, and any open session ends now. Their past entries stay in the audit trail.`,
          confirmLabel: 'Delete account', danger: true,
          onConfirm: async () => { await API.del('/users/' + u.id); toast('Account deleted', 'ok'); refreshPage(); },
        }));
        const save = sheet.querySelector('#acctSave');
        if (!save) return;
        const form = document.getElementById('acctForm');
        UI.bindEnterFlow(form, () => save.click());
        save.addEventListener('click', async (e) => {
          clearFieldErrors(form);
          const data = readForm(form);
          const want = ROLES.map(([k]) => k).filter((k) => {
            const el = form.querySelector(`[name="role_${k}"]`);
            return el && el.checked;
          });
          if (!u.id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) {
            return showFieldError(form, 'email', 'Enter the Google address they sign in with');
          }
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            if (!u.id) {
              await API.post('/users', { email: data.email, name: data.name, mobile: data.mobile, roles: want });
            } else {
              await API.patch('/users/' + u.id, {
                name: data.name || '', mobile: data.mobile || '',
                ...(form.querySelector('[name="active"]') ? { active: !!form.querySelector('[name="active"]').checked } : {}),
              });
              for (const r of want.filter((r) => !u.roles.includes(r) && canGrant(r))) {
                await API.post(`/users/${u.id}/roles`, { role: r });
              }
              for (const r of u.roles.filter((r) => !want.includes(r) && canGrant(r))) {
                await API.del(`/users/${u.id}/roles/${encodeURIComponent(r)}`);
              }
            }
            closeSheet(); toast(u.id ? 'Account updated' : 'Account added — they can now sign in with Google', 'ok');
            if (u.id === me().id) await API.loadMe();
            refreshPage();
          } catch (err) {
            btn.disabled = false;
            toast(err.message, 'err');
          }
        });
      },
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.accounts = { render };
})(window);
