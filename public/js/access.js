/* ============================================================
   ACCOUNTS & ACCESS  +  REPORTS  +  SETTINGS  +  Teams redirect
   Renders #accessRoot / #reportsRoot / #settingsRoot / #teamsRedirectRoot.
   Reads the shared ACCOUNTS registry (people.js) and live
   module data so every page shows real, linked numbers.
   ============================================================ */

if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
  window.onLanguageChange = function () {};
}

/* ------------------------------------------------------------
   ACCOUNTS & ACCESS  (was "Security & Audit")
   ------------------------------------------------------------ */
function accRoleList() { return (typeof accountRoles === 'function') ? accountRoles() : []; }

/* Fixed role model — Role → pages it may open → dashboard it sees.
   Rendered only inside Accounts & Access, which is already a superadmin/
   admin-only page (accGuard → canOpenPage('admin')). Shared by the seed
   renderer here and the API renderer in access-api.js. */
var ACC_DASH_NOTE = {
  superadmin:        'Full cockpit — KPIs, every module tile, “needs attention”, today across the temple, activity feed',
  admin:             'Full cockpit — KPIs, every module tile, “needs attention”, today across the temple, activity feed',
  management_lead:   'Scoped mini-dashboard — only the team(s) assigned to this lead',
  pooja_coordinator: 'Scoped mini-dashboard — only the pooja(s) assigned to this coordinator',
  committee_leader:  'Scoped mini-dashboard — only the committee(s) this leader runs',
  event_incharge:    'Full cockpit for now — a scoped “my events” view is not built yet',
  accountant:        'Full cockpit for now — a scoped “my ledger” view is not built yet'
};
var ACC_CAL_NOTE = {
  admin:             'All categories — poojas, meetings, events, annual, pledges, visits',
  management_lead:   'Poojas, events and annual Tithi events only',
  pooja_coordinator: 'Poojas, events and annual Tithi events only',
  committee_leader:  'Poojas, events and annual Tithi events only',
  event_incharge:    'Poojas, events and annual Tithi events only',
  accountant:        'Poojas, events and annual Tithi events only'
};
function accRoleReferenceCard() {
  var roles = accRoleList();
  if (!roles.length && typeof ROLE_META !== 'undefined') roles = Object.keys(ROLE_META);
  roles = roles.filter(function (r) { return r !== 'superadmin'; });   // one owner — not shown here
  var navCount = document.querySelectorAll('.sidebar-nav .nav-item[data-page]').length || 14;
  var rows = roles.map(function (r) {
    var pages = (typeof rolePages === 'function' ? rolePages(r) : []) || [];
    var pagesTxt = (pages[0] === '*')
      ? esc(window.t('acc_everything', 'everything')) + ' (' + navCount + ' ' + esc(window.t('acc_ref_pages', 'pages')) + ')'
      : esc(pages.join(', '));
    var dash = esc(window.t('acc_ref_dash_' + r, ACC_DASH_NOTE[r] || '—'));
    var cal = esc(window.t('acc_ref_cal_' + r, ACC_CAL_NOTE[r] || '—'));
    return '<tr>' +
      '<th scope="row"><span class="badge badge-maroon">' + roleIcon(r) + ' ' + esc(roleLabel(r)) + '</span></th>' +
      '<td>' + pagesTxt + '</td>' +
      '<td>' + dash + '</td>' +
      '<td>' + cal + '</td></tr>';
  }).join('');
  return '<div class="card mg-mt">' +
    '<div class="card-header"><div class="card-title">' + esc(window.t('acc_ref_title', 'Roles & access reference')) + '</div></div>' +
    '<div class="card-body"><p class="mg-page-sub" style="margin-top:0">' +
      esc(window.t('acc_ref_sub', 'The fixed role model. Only superadmin and admin see this.')) + '</p>' +
      '<div class="mg-table-scroll"><table class="acc-ref-table acc-ref-table-4">' +
      '<colgroup><col class="acc-ref-c1"><col class="acc-ref-c2"><col class="acc-ref-c3"><col class="acc-ref-c4"></colgroup>' +
      '<thead><tr>' +
        '<th>' + esc(window.t('acc_ref_role', 'Role')) + '</th>' +
        '<th>' + esc(window.t('acc_ref_open', 'Pages it may open')) + '</th>' +
        '<th>' + esc(window.t('acc_ref_dash', 'Dashboard it sees')) + '</th>' +
        '<th>' + esc(window.t('acc_ref_cal', 'In the calendar')) + '</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div></div>';
}
window.accRoleReferenceCard = accRoleReferenceCard;

/** Build the flat rows the export service serialises. */
function accAccountsExport() {
  const accts = (typeof ACCOUNTS !== 'undefined') ? ACCOUNTS : [];
  return {
    filename: 'accounts-access',
    title: window.t('acc_title', 'Accounts & Access'),
    subtitle: window.t('acc_sub', 'Every authorized account and what it can open'),
    columns: ['Account ID', 'Name', 'Mobile', 'City', 'Roles', 'Can open'],
    rows: accts.map(a => [
      a.id, a.name, a.mobile || '', a.city || '',
      a.roles.map(r => roleLabel(r)).join(' / '),
      (accountPages(a.id)[0] === '*') ? 'Everything' : accountPages(a.id).join(', ')
    ]),
    meta: [accRoleList().length + ' roles defined']
  };
}
function accAuditExport() {
  const list = (typeof mergedActivity === 'function') ? mergedActivity(300) : [];
  return {
    filename: 'audit-trail',
    title: window.t('acc_audit', 'Audit Trail'),
    subtitle: window.t('acc_audit_meta', 'Activity merged from every module'),
    columns: ['Module', 'Action', 'Reference', 'When'],
    rows: list.map(x => [x.tag, x.text, x.ref || '', x.when])
  };
}
if (typeof registerExport === 'function') {
  registerExport('acc-accounts', accAccountsExport);
  registerExport('acc-audit', accAuditExport);
}

/** Don't even build the markup for a page the active persona can't open —
    keeps another login's data out of the DOM. */
function accGuard(root, page) {
  if (typeof canOpenPage === 'function' && !canOpenPage(page)) { root.innerHTML = ''; return false; }
  return true;
}

function renderAccess() {
  const root = document.getElementById('accessRoot');
  if (!root || !accGuard(root, 'admin')) return;
  const sum = (typeof accessSummary === 'function') ? accessSummary() : { total: 0, byRole: {} };
  const accounts = (typeof ACCOUNTS !== 'undefined') ? ACCOUNTS : [];
  const roles = accRoleList();
  const admins = (typeof accountsWithRole === 'function') ? accountsWithRole('superadmin').length : 0;
  const leaders = accounts.filter(a => a.roles.some(r => /lead|coordinator|incharge/.test(r))).length;
  const bar = k => (typeof exportBar === 'function') ? exportBar(k) : '';

  root.innerHTML = `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">🛡️ ${window.t('acc_title', 'Accounts & Access')}</h1>
      <p class="mg-page-sub">${window.t('acc_sub', 'Every authorized account, what it can open, and a live audit trail')}</p>
    </div>
    ${bar('acc-accounts')}
  </div>

  <div class="stats-grid">
    ${kpiCard(window.t('acc_kpi_total', 'Authorized Accounts'), sum.total, window.t('acc_kpi_total_meta', 'Across all roles'), '🛡️')}
    ${kpiCard(window.t('acc_kpi_admin', 'Super Admins'), admins, window.t('acc_kpi_admin_meta', 'Full platform access'), '👑')}
    ${kpiCard(window.t('acc_kpi_leaders', 'Leaders & Coordinators'), leaders, window.t('acc_kpi_leaders_meta', 'Scoped to their area'), '🧑‍💼')}
    ${kpiCard(window.t('acc_kpi_roles', 'Access Roles'), roles.length, window.t('acc_kpi_roles_meta', 'Defined role types'), '🗝️')}
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">${window.t('acc_by_role', 'Access by role')}</div></div>
    <div class="card-body"><div class="acc-role-grid">
      ${roles.map(r => {
        const list = accountsWithRole(r);
        const pages = (typeof rolePages === 'function' ? rolePages(r) : []);
        return `<div class="acc-role-card">
          <div class="acc-role-top"><span class="acc-role-ico">${roleIcon(r)}</span>
            <div><strong>${esc(roleLabel(r))}</strong><span class="mg-muted-xs">${list.length} ${window.t('acc_account_ct', 'account(s)')}</span></div></div>
          <div class="mg-muted-xs">${window.t('acc_can_open', 'Can open')}: ${pages[0] === '*' ? window.t('acc_everything', 'everything') : esc(pages.join(', '))}</div>
          <div class="acc-role-people">${list.map(a => `<span class="mg-chip" style="--c:var(--primary-maroon)">${esc(a.name)}</span>`).join('') || `<span class="mg-muted-xs">—</span>`}</div>
        </div>`;
      }).join('')}
    </div></div>
  </div>

  ${typeof accRoleReferenceCard === 'function' ? accRoleReferenceCard() : ''}

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">${window.t('acc_accounts', 'Accounts')} <span class="mg-muted-xs">(${accounts.length})</span></div>
      ${bar('acc-accounts')}
    </div>
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll"><table class="custom-table acc-table">
        <thead><tr><th>${window.t('name')}</th><th>${window.t('mobile')}</th><th>${window.t('city')}</th><th>${window.t('acc_roles', 'Roles')}</th><th>${window.t('acc_can_open', 'Can open')}</th><th>${window.t('actions')}</th></tr></thead>
        <tbody>${accounts.map(a => {
          const pages = accountPages(a.id);
          return `<tr>
            <td><div class="mg-name-cell"><span class="mg-avatar">${esc((a.name[0] || '?').toUpperCase())}</span><div><strong>${esc(a.name)}</strong><div class="mg-muted-xs">${esc(a.id)}</div></div></div></td>
            <td>${esc(a.mobile || '—')}</td>
            <td>${esc(tData(a.city) || '—')}</td>
            <td>${a.roles.map(r => `<span class="badge badge-maroon">${roleIcon(r)} ${esc(roleLabel(r))}</span>`).join('')}</td>
            <td class="acc-wrap mg-muted-xs">${pages[0] === '*' ? window.t('acc_everything', 'Everything') : esc(pages.join(', '))}</td>
            <td><button class="btn btn-outline mg-btn-xs" onclick="signInAs('${a.id}')">${window.t('acc_signin', 'Sign in as')}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">${window.t('acc_audit', 'Audit Trail')} <span class="mg-muted-xs">(${window.t('acc_audit_meta', 'live, merged from every module')})</span></div>
      ${bar('acc-audit')}
    </div>
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll"><table class="custom-table acc-table acc-table-sm">
        <thead><tr><th>${window.t('acc_module', 'Module')}</th><th>${window.t('acc_action', 'Action')}</th><th>${window.t('acc_when', 'When')}</th></tr></thead>
        <tbody>${(typeof mergedActivity === 'function' ? mergedActivity(25) : []).map(x => `
          <tr><td><span class="badge badge-maroon">${esc(x.tag)}</span></td>
          <td class="acc-wrap">${esc(x.text)}${x.ref ? `<div class="mg-muted-xs">${esc(x.ref)}</div>` : ''}</td>
          <td class="mg-muted-xs">${esc(x.when)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
  </div>`;
}

function signInAs(id) {
  const a = (typeof accountById === 'function') ? accountById(id) : null;
  if (!a || typeof changeRoleScope !== 'function') return;
  const sel = document.getElementById('roleScopeSelect');
  // superadmin and the second-tier admin both get the full unscoped view
  if (a.roles.indexOf('superadmin') !== -1 || a.roles.indexOf('admin') !== -1) {
    if (sel) sel.value = 'admin'; changeRoleScope('admin'); return;
  }
  const r = a.roles[0];
  const map = { committee_leader: 'cmt:', pooja_coordinator: 'coord:', management_lead: 'lead:' };
  if (map[r]) { const v = map[r] + id; if (sel) sel.value = v; changeRoleScope(v); }
  else if (r === 'accountant') { if (sel) sel.value = 'accountant'; changeRoleScope('accountant'); }
  else { if (sel) sel.value = 'admin'; changeRoleScope('admin'); }
}

function exportAccountsCSV() {   /* back-compat shim */
  if (typeof runExport === 'function') runExport('acc-accounts', 'csv');
}

/* ------------------------------------------------------------
   REPORTS
   ------------------------------------------------------------ */
function renderReports() {
  const root = document.getElementById('reportsRoot');
  if (!root || !accGuard(root, 'reports')) return;
  const mk = (typeof MG !== 'undefined' && MG.today ? MG.today : '2026-09-06').slice(0, 7);

  let donCash = 0, donKind = 0, donCount = 0;
  if (typeof DON !== 'undefined') DON.donations.forEach(x => {
    if ((x.date || '').indexOf(mk) !== 0) return;
    donCount++;
    if (typeof donationIsKind === 'function' && donationIsKind(x)) donKind += Number(x.valuation) || 0;
    else donCash += Number(x.amount) || 0;
  });
  const expTotal = (typeof state !== 'undefined' && Array.isArray(state.expenses))
    ? state.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) : 0;
  const poojaCount = (typeof POOJA !== 'undefined') ? POOJA.poojas.length : 0;
  const cmtRate = (function () {
    if (typeof CMT === 'undefined') return 0;
    const r = CMT.committees.map(c => cmtMonthStats(c.id, mk).rate).filter(x => x > 0);
    return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : 0;
  })();
  const evCount = (typeof EV !== 'undefined') ? EV.events.length : 0;
  const visCount = (typeof VISITS !== 'undefined') ? VISITS.list.length : 0;
  const devCount = (typeof state !== 'undefined' && Array.isArray(state.devotees)) ? state.devotees.length : 0;

  const card = (title, value, sub) => `<div class="stat-card">
    <div class="stat-card-info"><span class="stat-card-title">${esc(title)}</span>
      <span class="stat-card-value">${esc(value)}</span>
      <span class="mg-muted-xs">${esc(sub || '')}</span></div>
  </div>`;
  const bar = k => (typeof exportBar === 'function') ? exportBar(k) : '';

  /* keep the month summary export fresh */
  const summaryRows = [
    ['Donations — cash (month)', '₹' + donCash.toLocaleString('en-IN'), donCount + ' records'],
    ['Donations — in-kind value (month)', '₹' + donKind.toLocaleString('en-IN'), 'Estimated'],
    ['Expenses (total)', '₹' + expTotal.toLocaleString('en-IN'), (state.expenses || []).length + ' vouchers'],
    ['Registered devotees', String(devCount), ''],
    ['Poojas', String(poojaCount), 'types: ' + (typeof POOJA !== 'undefined' ? POOJA.poojaTypes.length : 0)],
    ['Committee attendance', cmtRate + '%', 'avg this month'],
    ['Events', String(evCount), ''],
    ['Bhuvaji visits', String(visCount), '']
  ];
  if (typeof registerExport === 'function') {
    registerExport('rep-summary', () => ({
      filename: 'temple-report-' + mk,
      title: window.t('rep_title', 'Temple Operations Report'),
      subtitle: 'Month ' + mk,
      columns: ['Metric', 'Value', 'Detail'],
      rows: summaryRows
    }));
  }

  const modCard = (title, value, sub, key) => `<div class="card"><div class="card-body">
    <div class="rep-mod-head"><div>
      <div class="stat-card-title">${esc(title)}</div>
      <div class="stat-card-value">${esc(value)}</div>
      <div class="mg-muted-xs">${esc(sub || '')}</div>
    </div></div>
    ${key ? bar(key) : ''}
  </div></div>`;

  root.innerHTML = `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">📊 ${window.t('rep_title', 'Reports & Analytics')}</h1>
      <p class="mg-page-sub">${window.t('rep_sub', 'Figures pulled live from every module for the current month')}</p>
    </div>
    ${bar('rep-summary')}
  </div>
  <div class="stats-grid">
    ${card(window.t('rep_don', 'Donations (cash, month)'), '₹' + donCash.toLocaleString('en-IN'), donCount + ' ' + window.t('cal_item', 'records'))}
    ${card(window.t('rep_donkind', 'In-kind Value (month)'), '₹' + donKind.toLocaleString('en-IN'), window.t('don_kpi_kind_meta', 'Estimated'))}
    ${card(window.t('rep_exp', 'Expenses (total)'), '₹' + expTotal.toLocaleString('en-IN'), (state.expenses || []).length + ' ' + window.t('dash_vouchers', 'vouchers'))}
    ${card(window.t('rep_dev', 'Registered Devotees'), devCount.toLocaleString('en-IN'), '')}
  </div>

  <div class="section-title mg-mt"><span>${window.t('rep_downloads', 'Downloadable registers')}</span></div>
  <div class="rep-mod-grid">
    ${modCard(window.t('rep_don', 'Donations register'), poojaCount >= 0 ? (typeof DON !== 'undefined' ? DON.donations.length : 0) : 0, window.t('don_records', 'record(s)'), 'mod-donations')}
    ${modCard(window.t('rep_pooja', 'Poojas'), poojaCount, window.t('pj_kpi_types', 'types') + ': ' + (typeof POOJA !== 'undefined' ? POOJA.poojaTypes.length : 0), 'mod-pooja')}
    ${modCard(window.t('rep_cmt', 'Committees'), (typeof CMT !== 'undefined' ? CMT.committees.length : 0), cmtRate + '% ' + window.t('cmt_kpi_attendance_meta', 'avg this month'), 'mod-committee')}
    ${modCard(window.t('rep_ev', 'Events'), evCount, '', 'mod-events')}
    ${modCard(window.t('nav_management_s', 'Management teams'), (typeof MG !== 'undefined' ? MG.managements.length : 0), '', 'mod-management')}
    ${modCard(window.t('acc_audit', 'Audit trail'), (typeof mergedActivity === 'function' ? mergedActivity(999).length : 0), window.t('acc_audit_meta', 'merged from every module'), 'acc-audit')}
  </div>`;
}
function exportAllActivityCSV() {   /* back-compat shim */
  if (typeof runExport === 'function') runExport('acc-audit', 'csv');
}

/* ------------------------------------------------------------
   SETTINGS
   ------------------------------------------------------------ */
function renderSettings() {
  const root = document.getElementById('settingsRoot');
  if (!root || !accGuard(root, 'settings')) return;
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem('svmmm_temple') || '{}'); } catch (e) {}
  const lang = (typeof currentLang === 'function') ? currentLang() : 'en';
  const nowDate = (typeof MG !== 'undefined' && MG.today) ? MG.today : '2026-09-06';
  const nowTime = (typeof MG !== 'undefined' && MG.nowTime) ? MG.nowTime : '18:30';
  let clkOverridden = false;
  try { clkOverridden = !!localStorage.getItem('svmmm_clock'); } catch (e) {}

  root.innerHTML = `
  <div class="mg-page-head"><div>
    <h1 class="banner-title mg-page-title">⚙️ ${window.t('set_title', 'Platform Settings')}</h1>
    <p class="mg-page-sub">${window.t('set_sub', 'Temple identity and language')}</p>
  </div></div>
  <div class="dashboard-2col">
    <div class="card"><div class="card-body">
      <h3 class="mg-pane-title">${window.t('set_identity', 'Temple Identity')}</h3>
      <form onsubmit="saveTempleSettings(event)">
        <div class="form-group"><label class="form-label">${window.t('set_name', 'Temple Name')}</label>
          <input class="form-input" id="setTplName" value="${esc(cfg.name || 'Shri Vihat Meldi Mata Mandir')}"></div>
        <div class="form-group"><label class="form-label">${window.t('set_loc', 'Location')}</label>
          <input class="form-input" id="setTplLoc" value="${esc(cfg.loc || 'Sanand, Gujarat, India')}"></div>

        <div class="form-group">
          <label class="form-label">${window.t('set_founder', 'Temple Founder / મંદિર સ્થાપક')}</label>
          <input class="form-input" id="setTplFounder" value="${esc(cfg.founder || 'Bhagwan Bhuvaji Karamshi Bapa')}">
          <span class="mg-muted-xs" style="font-family:'Noto Serif Gujarati',serif;">${esc(cfg.founderGu || 'ભગવાન ભૂવાજી કરમશી બાપા')}</span>
        </div>
        <div class="form-group">
          <label class="form-label">${window.t('set_head', 'Temple Head / મંદિર પ્રમુખ')}</label>
          <input class="form-input" id="setTplHead" value="${esc(cfg.head || 'Bhuvaji Suresh Bapa')}">
          <span class="mg-muted-xs" style="font-family:'Noto Serif Gujarati',serif;">${esc(cfg.headGu || 'ભૂવાજી સુરેશ બાપા')}</span>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label">${window.t('set_email', 'Contact Email')}</label>
            <input class="form-input" id="setTplEmail" value="${esc(cfg.email || 'contact@vihatmeldimandir.org')}"></div>
          <div class="form-group"><label class="form-label">${window.t('set_phone', 'Contact Phone')}</label>
            <input class="form-input" id="setTplPhone" value="${esc(cfg.phone || '02717 000000')}"></div>
        </div>
        <button class="btn btn-primary" type="submit">${window.t('save')}</button>
      </form>
    </div></div>
    <div class="card"><div class="card-body">
      <h3 class="mg-pane-title">${window.t('set_platform', 'Platform')}</h3>
      <div class="form-group"><label class="form-label">${window.t('set_lang', 'Default Language')}</label>
        <select class="form-select" onchange="setLanguage(this.value)">
          <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
          <option value="hi" ${lang === 'hi' ? 'selected' : ''}>हिन्दी</option>
          <option value="gu" ${lang === 'gu' ? 'selected' : ''}>ગુજરાતી</option>
        </select></div>

      <div class="mg-note-box mg-mt-sm">${window.t('set_accounts_hint', 'Manage who can access the platform in the')} <a href="#" onclick="switchPage('admin');return false;"><strong>${window.t('acc_title', 'Accounts & Access')}</strong></a> ${window.t('set_page', 'page')}.</div>
    </div></div>
  </div>`;
}

/** Apply the date/time from the Settings form to the shared demo clock and
    recompute every module. Persisted so a reload keeps the same view. */
function applyWorkingDate() {
  const d = (document.getElementById('setClkDate') || {}).value || '';
  const t = (document.getElementById('setClkTime') || {}).value || '18:30';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    if (typeof showToast === 'function') showToast(window.t('set_clock_bad', 'Pick a valid date.'));
    return;
  }
  if (typeof MG !== 'undefined') { MG.today = d; MG.nowTime = /^\d{2}:\d{2}$/.test(t) ? t : MG.nowTime; }
  try { localStorage.setItem('svmmm_clock', JSON.stringify({ date: d, time: (typeof MG !== 'undefined' ? MG.nowTime : t) })); } catch (e) {}
  ['renderManagement', 'renderPooja', 'renderDonations', 'renderCommittee', 'renderEvents',
   'renderVisits', 'renderDevotees', 'renderUnifiedCalendar', 'renderDashboard'].forEach(fn => {
    if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) {} }
  });
  renderSettings();
  if (typeof showToast === 'function') showToast(window.t('set_clock_done', 'Working date set to') + ' ' + d);
}

function resetWorkingDate() {
  try { localStorage.removeItem('svmmm_clock'); } catch (e) {}
  location.reload();
}
function saveTempleSettings(e) {
  e.preventDefault();
  let prev = {};
  try { prev = JSON.parse(localStorage.getItem('svmmm_temple') || '{}'); } catch (err) {}
  const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const cfg = Object.assign({}, prev, {
    name: g('setTplName'),
    loc: g('setTplLoc'),
    founder: g('setTplFounder'),
    head: g('setTplHead'),
    email: g('setTplEmail'),
    phone: g('setTplPhone')
  });
  try { localStorage.setItem('svmmm_temple', JSON.stringify(cfg)); } catch (err) {}
  if (typeof showToast === 'function') showToast(window.t('set_saved', 'Temple information saved.'));
  if (window.API && window.API.online) {
    window.API.put('/settings/identity', cfg).catch(function () {});
  }
}

/* ------------------------------------------------------------
   STAFF & TEAMS  → now the Management module
   ------------------------------------------------------------ */
function renderTeamsRedirect() {
  const root = document.getElementById('teamsRedirectRoot');
  if (!root) return;
  root.innerHTML = `
  <div class="card" style="text-align:center; padding:2.5rem 1.5rem;">
    <div style="font-size:2.2rem">👷 → 🗂️</div>
    <h2 class="mg-pane-title mg-mt-sm">${window.t('teams_moved', 'Staff & volunteer teams are now the Management module')}</h2>
    <p class="mg-page-sub" style="max-width:520px;margin:0.5rem auto 1rem">${window.t('teams_moved_sub', 'Volunteer teams, lead assignment, volunteering schedules, attendance and badges all live in Management Apps.')}</p>
    <button class="btn btn-primary" onclick="switchPage('management')">${window.t('teams_open', 'Open Management Apps')} →</button>
  </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const has = id => document.getElementById(id);
  if (has('accessRoot')) renderAccess();
  if (has('reportsRoot')) renderReports();
  if (has('settingsRoot')) renderSettings();
  if (has('teamsRedirectRoot')) renderTeamsRedirect();
  if (typeof onLanguageChange === 'function') onLanguageChange(() => {
    if (has('accessRoot')) renderAccess();
    if (has('reportsRoot')) renderReports();
    if (has('settingsRoot')) renderSettings();
    if (has('teamsRedirectRoot')) renderTeamsRedirect();
  });
});
