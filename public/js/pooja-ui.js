/* ============================================================
   POOJA APP — RENDER & INTERACTION LAYER
   Depends on pooja.js (POOJA store + helpers) and reuses
   management.js / management-ui.js / management-forms.js globals
   (esc, jsq, fmtDate, fmtTime, MONTHS, kpiCard, emptyState,
    openSheet, openConfirm, downloadCSV, copyText).
   ============================================================ */

/* Localise a pooja / pooja-type name for display (data entry stays English).
   Falls back to the raw string when no translation exists. */
function pjLoc(s) {
  return (typeof tData === 'function') ? tData(s == null ? '' : s) : (s == null ? '' : s);
}

/* ------------------------------------------------------------
   ROOT ROUTER
   ------------------------------------------------------------ */
function renderPooja() {
  const root = document.getElementById('poojaRoot');
  if (!root) return;

  if (POOJA.view === 'workspace' && POOJA.activePoojaId && canOpenPooja(POOJA.activePoojaId)) {
    root.innerHTML = viewPoojaWorkspace();
  } else {
    POOJA.view = 'directory';
    root.innerHTML = viewPoojaDirectory();
  }
  applyPoojaRoleChrome();
}

function openPooja(id) {
  if (!canOpenPooja(id)) { pjToast('Access denied — this Pooja is not assigned to you.'); return; }
  POOJA.activePoojaId = id;
  POOJA.view = 'workspace';
  POOJA.activeTab = 'overview';
  POOJA.activeSevarthiId = null;
  renderPooja();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToPoojaDirectory() {
  POOJA.view = 'directory';
  POOJA.activePoojaId = null;
  POOJA.activeSevarthiId = null;
  renderPooja();
}

function setPoojaTab(tab) {
  POOJA.activeTab = tab;
  POOJA.activeSevarthiId = null;
  renderPooja();
}

function openSevarthiProfile(id) { POOJA.activeSevarthiId = id; renderPooja(); }
function closeSevarthiProfile()  { POOJA.activeSevarthiId = null; renderPooja(); }

/* ------------------------------------------------------------
   ROLE CHROME — restricts the shell for a Coordinator
   ------------------------------------------------------------ */
const POOJA_ALLOWED_PAGES = ['puja', 'dashboard', 'calendar'];

function applyPoojaRoleChrome() {
  const coord = POOJA.session.role === 'coordinator';

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    el.style.display = (coord && POOJA_ALLOWED_PAGES.indexOf(page) === -1) ? 'none' : '';
  });
  document.querySelectorAll('.mobile-nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    el.style.display = (coord && POOJA_ALLOWED_PAGES.indexOf(page) === -1) ? 'none' : '';
  });
  document.querySelectorAll('[data-admin-only]').forEach(el => { el.style.display = coord ? 'none' : ''; });
  document.querySelectorAll('.nav-group-title').forEach(g => { g.style.display = coord ? 'none' : ''; });

  const banner = document.getElementById('poojaScopeBanner');
  if (banner) {
    banner.style.display = coord ? 'flex' : 'none';
    if (coord) {
      const mine = visiblePoojas().map(p => p.name).join(', ') || 'no poojas assigned yet';
      banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span><strong>Pooja Coordinator access.</strong> You can only open: ${esc(mine)}</span>`;
    }
  }
}

/**
 * Switch the Pooja session context.
 * @param {'admin'|'coordinator'} role
 * @param {string|null} coordId  coordinator id when role === 'coordinator'
 * @param {boolean} announce     toast + jump to the Pooja page (default true)
 */
function setPoojaSession(role, coordId, announce) {
  const speak = announce !== false;

  if (role === 'admin') {
    POOJA.session = { role:'admin', userId:'DEV-001', userName:'Administrator' };
    if (speak) pjToast('Context switched to: Super Admin (Full Platform)');
  } else {
    const c = coordinatorById(coordId) || coordinatorPool()[0] || { id: coordId || '', name: 'Pooja Coordinator' };
    POOJA.session = { role:'coordinator', userId:c.id, userName:c.name };
    if (speak) pjToast(`Context switched to: ${c.name} (Pooja Coordinator)`);
  }

  const nameEl = document.getElementById('topbarUserName');
  if (nameEl) nameEl.textContent = POOJA.session.userName;

  POOJA.view = 'directory';
  POOJA.activePoojaId = null;
  POOJA.activeSevarthiId = null;
  renderPooja();
  if (typeof renderDashboard === 'function') renderDashboard();

  if (speak && typeof switchPage === 'function') switchPage('puja');
}

/** Populate the topbar role selector with one entry per coordinator that owns >=1 pooja. */
function populateCoordRoleOptions() {
  const grp = document.getElementById('roleCoordGroup');
  if (!grp) return;
  grp.innerHTML = coordinatorPool().map(c => {
    const owns = poojasOfCoordinator(c.id);
    if (!owns.length) return '';
    return `<option value="coord:${c.id}">${esc(c.name)} — ${esc(owns.map(p => p.name).join(', '))}</option>`;
  }).join('');
}

/* ------------------------------------------------------------
   VIEW: DIRECTORY
   ------------------------------------------------------------ */
function setPoojaDirView(m) {
  POOJA.dirView = (m === 'table') ? 'table' : 'cards';
  renderPooja();
}

/* Directory order — by the pooja's earliest session date. Undated poojas sink
   to the bottom; ties broken by id so the order is stable. */
function pjSortKey(p) { return (firstSession(p) || {}).date || '9999-99-99'; }
function pjDirSorted(list) {
  const dir = POOJA.dirSort === 'date-desc' ? -1 : 1;
  return list.slice().sort((a, b) =>
    dir * (pjSortKey(a).localeCompare(pjSortKey(b)) || String(a.id).localeCompare(String(b.id))));
}
function togglePjDirSort() {
  POOJA.dirSort = POOJA.dirSort === 'date-asc' ? 'date-desc' : 'date-asc';
  renderPooja();
}
function pjSortArrow() { return POOJA.dirSort === 'date-desc' ? '▼' : '▲'; }

function poojaDirTableWrap(list) {
  return `
  <div class="mg-table-scroll">
    <table class="custom-table">
      <thead>
        <tr>
          <th>${window.t('pj_col_pooja', 'Pooja')}</th>
          <th>${window.t('pj_type', 'Type')}</th>
          <th class="pj-sortable" onclick="togglePjDirSort()" title="${window.t('pj_sort_date', 'Sort by date')}">${window.t('pj_schedule', 'Schedule')} <span class="pj-sort-ar">${pjSortArrow()}</span></th>
          <th>${window.t('venue', 'Venue')}</th>
          <th>${window.t('pj_sevarthi', 'Sevarthi')}</th>
          <th>${window.t('pj_coordinator', 'Coordinator')}</th>
          <th>${window.t('status', 'Status')}</th>
          <th>${window.t('pj_actions', 'Actions')}</th>
        </tr>
      </thead>
      <tbody id="pjDirectoryBody">${poojaDirectoryRows(pjDirSorted(list))}</tbody>
    </table>
  </div>`;
}

function viewPoojaDirectory() {
  const list = visiblePoojas();
  const admin = isPoojaAdmin();
  const heading = admin ? window.t('pj_title') : window.t('pj_my_title');
  const sub = admin ? window.t('pj_sub_admin') : window.t('pj_sub_coord');
  const mode = POOJA.dirView === 'table' ? 'table' : 'cards';

  const nowKey = pjToday() + ' ' + pjNow();
  const upcoming = list.filter(p => poojaSessions(p).some(s => (s.date + ' ' + s.endTime) >= nowKey)).length;
  const sevCount = admin ? POOJA.sevarthis.length
    : POOJA.sevarthis.filter(s => list.some(p => (p.sevarthiIds || []).indexOf(s.id) !== -1)).length;
  const guestCount = admin ? POOJA.people.length
    : new Set(list.reduce((a, p) => a.concat(p.guestIds || []), [])).size;

  const flow = admin ? `
  <div class="pj-flow">
    <div class="pj-flow-step"><span class="pj-flow-n">1</span><div class="pj-flow-tx">
      <strong>${window.t('pj_flow_1_t', 'Set up ritual types')}</strong>
      <span>${window.t('pj_flow_1_d', 'Reusable templates in the Catalog — name, samagri, duration. No dates.')}</span></div></div>
    <div class="pj-flow-step"><span class="pj-flow-n">2</span><div class="pj-flow-tx">
      <strong>${window.t('pj_flow_2_t', 'Schedule a Pooja / Seva')}</strong>
      <span>${window.t('pj_flow_2_d', 'Pick a type, set the date(s), venue, sevarthi and guests.')}</span></div></div>
    <div class="pj-flow-step"><span class="pj-flow-n">3</span><div class="pj-flow-tx">
      <strong>${window.t('pj_flow_3_t', 'Open a Pooja')}</strong>
      <span>${window.t('pj_flow_3_d', 'Manage sevarthi, print invitations, track the calendar.')}</span></div></div>
  </div>` : '';

  const listBlock = list.length === 0 ? emptyState('No Pooja scheduled',
      admin ? 'Click “Schedule Pooja / Seva” above to create your first one.'
            : 'No Pooja has been assigned to your account yet. Please contact the temple administrator.') : `
  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center pj-list-head">
      <div class="card-title">${window.t('pj_scheduled', 'Scheduled Poojas & Sevas')} <span class="mg-muted-xs">(${list.length})</span></div>
      <div class="flex gap-2 items-center pj-list-tools">
        ${admin ? `<input class="form-input mg-inline-search" id="pjDirSearch" placeholder="Search pooja, type or sevarthi..." oninput="filterPoojaDirectory()">` : ''}
        <button type="button" class="btn btn-outline mg-btn-xs" onclick="togglePjDirSort()" title="${window.t('pj_sort_date', 'Sort by date')}">
          🗓️ ${window.t('date', 'Date')} ${pjSortArrow()}</button>
        <div class="pj-viewtoggle" role="group" aria-label="View">
          <button type="button" class="${mode === 'cards' ? 'is-on' : ''}" onclick="setPoojaDirView('cards')">▦ ${window.t('pj_view_cards', 'Cards')}</button>
          <button type="button" class="${mode === 'table' ? 'is-on' : ''}" onclick="setPoojaDirView('table')">≣ ${window.t('pj_view_table', 'Table')}</button>
        </div>
      </div>
    </div>
    <div class="card-body" style="padding:${mode === 'table' ? '0' : '1.1rem'};">
      <div id="pjDirList">${mode === 'table' ? poojaDirTableWrap(list) : `<div class="mg-card-grid">${pjDirSorted(list).map(poojaCard).join('')}</div>`}</div>
    </div>
  </div>`;

  const setup = admin ? `
  <details class="pj-setup" open>
    <summary>⚙️ ${window.t('pj_setup', 'Setup — ritual type catalog & people')}</summary>
    <div class="pj-setup-body">
      <div class="card">
        <div class="card-header flex justify-between items-center">
          <div>
            <div class="card-title">${window.t('pj_type_catalog')} <span class="mg-muted-xs">(${typeCatalogCount()} / 36)</span></div>
            <span class="mg-muted-xs">${window.t('pj_catalog_hint', 'Reusable ritual definitions. You pick one of these when you schedule a Pooja.')}</span>
          </div>
          <button class="btn btn-primary mg-btn-xs" onclick="openAddPoojaType()">+ ${window.t('pj_add_type_btn', 'Add Ritual Type')}</button>
        </div>
        <div class="card-body"><div class="pj-type-grid">${poojaTypeCards()}</div></div>
      </div>

      <div class="card mg-mt">
        <div class="card-header flex justify-between items-center">
          <div>
            <div class="card-title">${window.t('pj_people_registry', 'Guests')} <span class="mg-muted-xs">(${POOJA.people.length})</span></div>
            <span class="mg-muted-xs">${window.t('pj_guests_hint', 'Priests & special guests you can attach to any Pooja.')}</span>
          </div>
          <button class="btn btn-primary mg-btn-xs" onclick="openAddGuest('directory')">+ ${window.t('pj_add_guest', 'Add Guest')}</button>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="mg-table-scroll">
            <table class="custom-table pj-reg-table">
              <thead><tr><th>Name</th><th>Role</th><th>Mobile</th><th>City / State</th><th>In Poojas</th><th>Actions</th></tr></thead>
              <tbody>${guestRegistryRows()}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </details>` : '';

  return `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">🪔 ${heading}</h1>
      <p class="mg-page-sub">${sub}</p>
    </div>
    <div class="flex gap-2">
      ${admin ? `
        ${typeof exportBar === 'function' ? exportBar('mod-pooja') : ''}
        <button class="btn btn-primary" onclick="openAddPooja()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ${window.t('pj_schedule_btn', 'Schedule Pooja / Seva')}
        </button>` : ''}
    </div>
  </div>

  ${flow}

  <div class="stats-grid">
    ${kpiCard(window.t('pj_kpi_total'), list.length, admin ? 'Scheduled on the platform' : 'Assigned to you', '🪔')}
    ${kpiCard(window.t('pj_kpi_upcoming'), upcoming, 'With a session still to come', '🗓️')}
    ${kpiCard(window.t('pj_kpi_sevarthis'), sevCount, 'Devotees sponsoring seva', '🙏')}
    ${admin
      ? kpiCard(window.t('pj_kpi_types'), typeCatalogCount() + ' / 36', 'Catalog templates', '📜')
      : kpiCard(window.t('pj_guests_pandits', 'Guests'), guestCount, 'Across your poojas', '🧑‍🎓')}
  </div>

  ${listBlock}
  ${typeof annualEventsSection === 'function' ? annualEventsSection() : ''}
  ${setup}
  `;
}

function guestRegistryRows() {
  if (!POOJA.people.length) return `<tr><td colspan="6" class="mg-empty-cell">No guests on record yet.</td></tr>`;
  return POOJA.people.map(x => {
    const used = POOJA.poojas.filter(p => (p.guestIds || []).indexOf(x.id) !== -1).length;
    return `
    <tr>
      <td>
        <div class="mg-name-cell">
          <span class="mg-avatar">${esc((x.firstName[0] || '') + (x.lastName[0] || ''))}</span>
          <div><strong>${esc(personName(x))}</strong>${x.notes ? `<div class="mg-muted-xs">${esc(x.notes)}</div>` : ''}</div>
        </div>
      </td>
      <td><span class="badge badge-maroon">${esc(x.role || 'Guest')}</span></td>
      <td>${x.mobile ? esc(x.mobile) : '—'}</td>
      <td>${esc([x.city, x.state].filter(Boolean).join(', ') || '—')}</td>
      <td>${used || '—'}</td>
      <td>
        <div class="flex gap-1">
          ${x.mobile ? `<a class="btn btn-outline mg-btn-xs" href="tel:${esc(x.mobile)}">📞</a>
          <a class="btn btn-outline mg-btn-xs" href="https://wa.me/91${esc(x.mobile)}" target="_blank" rel="noopener">💬</a>` : ''}
          <button class="btn btn-outline mg-btn-xs" onclick="openEditGuest('${x.id}','directory')">Edit</button>
          <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeleteGuest('${x.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function poojaTypeCards() {
  return POOJA.poojaTypes.map(t => {
    const used = POOJA.poojas.filter(p => p.typeId === t.id).length;
    return `
    <div class="pj-type-card">
      <div class="pj-type-top">
        <span class="pj-type-icon">${esc(t.icon || '🪔')}</span>
        <div class="pj-type-head">
          <strong>${esc(pjLoc(t.name))}</strong>
          <span class="mg-muted-xs">${esc(tData(t.category) || 'Pooja')}${t.defaultDurationMin ? ' · ~' + t.defaultDurationMin + ' min' : ''}</span>
        </div>
      </div>
      ${t.description ? `<p class="pj-type-desc">${esc(t.description)}</p>` : ''}
      ${t.suggestedOfferings ? `<p class="pj-type-offer"><span>Samagri:</span> ${esc(t.suggestedOfferings)}</p>` : ''}
      <div class="pj-type-foot">
        <span class="mg-muted-xs">${used ? used + ' pooja(s)' : 'Not used yet'}</span>
        <span class="flex gap-1">
          <button class="btn btn-outline mg-btn-xs" onclick="openEditPoojaType('${t.id}')">Edit</button>
          <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeletePoojaType('${t.id}')">Delete</button>
        </span>
      </div>
    </div>`;
  }).join('');
}

function poojaCard(p) {
  const t = typeById(p.typeId);
  const st = poojaStatus(p);
  const sess = poojaSessions(p);
  const sevs = sevarthisOf(p);
  const guests = (typeof peopleOf === 'function') ? peopleOf(p) : [];
  const venues = Array.from(new Set(sess.map(s => pjLoc(s.venue)).filter(Boolean)));
  const nx = nextSession(p);
  const dtg = nx ? Math.max(0, Math.round((new Date(nx.date) - new Date(pjToday())) / 86400000)) : null;
  const seva = p.estimatedSevaAmount ? '₹' + Number(p.estimatedSevaAmount).toLocaleString('en-IN') : '—';
  const dtgText = dtg == null ? '' : (dtg === 0 ? ' · today' : ' · in ' + dtg + ' day' + (dtg > 1 ? 's' : ''));
  return `
  <div class="mg-card" style="--mg-color:${p.color}">
    <div class="mg-card-stripe"></div>
    <div class="mg-card-top">
      <div class="mg-card-avatar" style="background:${p.color}">${esc(t ? t.icon : '🪔')}</div>
      <div class="mg-card-heading">
        <h3>${esc(pjLoc(p.name))}</h3>
        <span class="badge ${POOJA_STATUS_BADGE[st]}">${POOJA_STATUS_DOT[st]} ${poojaStatusLabel(st)}</span>
      </div>
    </div>
    <p class="mg-card-desc">${esc(t ? pjLoc(t.name) : 'Custom pooja')} · ${p.scheduleMode === 'multi' ? sess.length + ' sessions' : 'Single event'}</p>
    <div class="mg-card-meta">
      <div><span>Schedule</span><strong>${dateRangeText(p)}</strong></div>
      <div><span>Venue</span><strong>${esc(venues[0] || pjLoc(p.defaultVenue) || '—')}</strong></div>
      <div><span>Sevarthi</span><strong>${sevs.length ? esc(sevs.map(s => s.firstName).join(', ')) : '—'}</strong></div>
      <div><span>Guests</span><strong>${guests.length || '—'}</strong></div>
      <div><span>Coordinator</span><strong>${esc(coordinatorNames(p) || '—')}</strong></div>
      <div><span>Est. Seva</span><strong>${seva}</strong></div>
    </div>
    <div class="mg-card-next">
      ${sess.length
        ? `${POOJA_STATUS_DOT[st]} Next: <strong>${esc(pjLoc((nx || {}).label || p.name))}</strong> · ${fmtDate((nx || {}).date)}, ${fmtTime((nx || {}).startTime)}${dtgText}`
        : 'No session scheduled yet — use Edit Pooja to add a date'}
    </div>
    <button class="btn btn-primary w-full mg-open-btn" onclick="openPooja('${p.id}')">Open Pooja →</button>
  </div>`;
}

function poojaDirectoryRows(list) {
  if (!list.length) return `<tr><td colspan="8" class="mg-empty-cell">No poojas found.</td></tr>`;
  return list.map(p => {
    const t = typeById(p.typeId);
    const st = poojaStatus(p);
    const sess = poojaSessions(p);
    const venues = Array.from(new Set(sess.map(s => pjLoc(s.venue)).filter(Boolean)));
    return `
    <tr>
      <td>
        <div class="mg-name-cell">
          <span class="mg-dot" style="background:${p.color}"></span>
          <div><strong>${esc(pjLoc(p.name))}</strong><div class="mg-muted-xs">${esc(p.id)}</div></div>
        </div>
      </td>
      <td>${esc(t ? pjLoc(t.name) : '—')}</td>
      <td>${dateRangeText(p)}${p.scheduleMode === 'multi' ? `<div class="mg-muted-xs">${sess.length} sessions</div>` : ''}</td>
      <td>${esc(venues.join(', ') || pjLoc(p.defaultVenue) || '—')}</td>
      <td>${sevarthisOf(p).length || '—'}</td>
      <td>${esc(coordinatorNames(p))}</td>
      <td><span class="badge ${POOJA_STATUS_BADGE[st]}">${POOJA_STATUS_DOT[st]} ${poojaStatusLabel(st)}</span></td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-outline mg-btn-xs" onclick="openPooja('${p.id}')">Open</button>
          <button class="btn btn-outline mg-btn-xs" onclick="openEditPooja('${p.id}')">Edit</button>
          <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeletePooja('${p.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterPoojaDirectory() {
  const q = (document.getElementById('pjDirSearch')?.value || '').toLowerCase();
  const list = visiblePoojas().filter(p => {
    const t = typeById(p.typeId);
    const sevText = sevarthisOf(p).map(s => s.firstName + ' ' + s.lastName).join(' ').toLowerCase();
    return p.name.toLowerCase().includes(q)
      || (t && t.name.toLowerCase().includes(q))
      || p.id.toLowerCase().includes(q)
      || sevText.includes(q)
      || coordinatorNames(p).toLowerCase().includes(q);
  });
  const body = document.getElementById('pjDirectoryBody');
  if (body) { body.innerHTML = poojaDirectoryRows(pjDirSorted(list)); return; }
  const host = document.getElementById('pjDirList');
  if (host) host.innerHTML = `<div class="mg-card-grid">${pjDirSorted(list).map(poojaCard).join('')}</div>`;
}

/* ------------------------------------------------------------
   VIEW: WORKSPACE SHELL
   ------------------------------------------------------------ */
const POOJA_TABS = [
  { id:'overview',   label:'Overview',   icon:'🏠' },
  { id:'sevarthi',   label:'Sevarthi',   icon:'👥' },
  { id:'invitation', label:'Invitation', icon:'🎴' },
  { id:'calendar',   label:'Calendar',   icon:'🗓️' },
  { id:'settings',   label:'Settings',   icon:'⚙️' },
  { id:'activity',   label:'Activity',   icon:'🕒', adminOnly:true }
];

function viewPoojaWorkspace() {
  const p = poojaById(POOJA.activePoojaId);
  if (!p) { POOJA.view = 'directory'; return viewPoojaDirectory(); }

  const t = typeById(p.typeId);
  const st = poojaStatus(p);
  const tabs = POOJA_TABS.filter(x => !x.adminOnly || isPoojaAdmin());

  let body = '';
  if (POOJA.activeSevarthiId) body = paneSevarthiProfile(p);
  else switch (POOJA.activeTab) {
    case 'sevarthi':   body = panePoojaSevarthi(p); break;
    case 'invitation': body = panePoojaInvitation(p); break;
    case 'calendar':   body = panePoojaCalendar(p); break;
    case 'settings':   body = panePoojaSettings(p); break;
    case 'activity':   body = panePoojaActivity(p); break;
    default:           body = panePoojaOverview(p);
  }

  return `
  <div class="mg-ws" style="--mg-color:${p.color}">
    <button class="btn btn-outline mg-back" onclick="backToPoojaDirectory()">← ${isPoojaAdmin() ? window.t('pj_all_poojas') : window.t('pj_my_title')}</button>

    <div class="mg-ws-header">
      <div class="mg-ws-id" style="background:${p.color}">${esc(t ? t.icon : '🪔')}</div>
      <div class="mg-ws-titles">
        <h1>${esc(pjLoc(p.name))}</h1>
        <div class="mg-ws-sub">
          ${esc(t ? pjLoc(t.name) : 'Custom pooja')}
          <span class="mg-sep">•</span> ${dateRangeText(p)}${p.scheduleMode === 'multi' ? ` (${poojaSessions(p).length} ${window.t('pj_sessions_word')})` : ''}
          <span class="mg-sep">•</span> <span class="badge ${POOJA_STATUS_BADGE[st]}">${POOJA_STATUS_DOT[st]} ${poojaStatusLabel(st)}</span>
        </div>
      </div>
      <div class="mg-ws-actions">
        <button class="btn btn-outline" onclick="openAddSevarthi('${p.id}')">+ ${window.t('pj_add_sevarthi')}</button>
        <button class="btn btn-primary" onclick="openEditPooja('${p.id}')">${window.t('pj_edit_pooja')}</button>
      </div>
    </div>

    <div class="mg-tabs">
      ${tabs.map(x => `
        <button class="mg-tab ${POOJA.activeTab === x.id && !POOJA.activeSevarthiId ? 'active' : ''}" onclick="setPoojaTab('${x.id}')">
          <span>${x.icon}</span> ${window.t('pj_tab_' + x.id, x.label)}
        </button>`).join('')}
    </div>

    <div class="mg-pane">${body}</div>
  </div>`;
}

/* ------------------------------------------------------------
   PANE: OVERVIEW
   ------------------------------------------------------------ */
function panePoojaOverview(p) {
  const t = typeById(p.typeId);
  const st = poojaStatus(p);
  const sess = poojaSessions(p);
  const sevs = sevarthisOf(p);
  const people = peopleOf(p);
  const nx = nextSession(p);
  const daysToGo = nx ? Math.max(0, Math.round((new Date(nx.date) - new Date(pjToday())) / 86400000)) : '—';
  const done = isPoojaComplete(p);
  const cancelled = st === 'cancelled';

  const statusActions = cancelled
    ? `<button class="btn btn-primary" onclick="reopenPooja('${p.id}')">Reopen Pooja</button>`
    : done
      ? `<button class="btn btn-outline" onclick="reopenPooja('${p.id}')">Reopen</button>
         <button class="btn btn-outline" onclick="markPoojaExtended('${p.id}')">Mark Extended</button>`
      : st === 'extended'
        ? `<button class="btn btn-primary" onclick="markPoojaDone('${p.id}')">✓ Mark Completed</button>
           <button class="btn btn-outline" onclick="reopenPooja('${p.id}')">Reopen</button>`
        : `<button class="btn btn-primary" onclick="markPoojaDone('${p.id}')">✓ Mark Completed</button>
           <button class="btn btn-outline" onclick="markPoojaExtended('${p.id}')">Mark Extended</button>
           <button class="btn btn-outline mg-btn-danger" onclick="cancelPooja('${p.id}')">Cancel Pooja</button>`;

  return `
  <div class="card pj-status-card">
    <div class="pj-status-main">
      <span class="pj-status-badge badge ${POOJA_STATUS_BADGE[st]}">${POOJA_STATUS_DOT[st]} ${poojaStatusLabel(st)}</span>
      <div class="pj-status-text">
        <strong>${esc(poojaStatusHint(p))}</strong>
        <span class="mg-muted-xs">${window.t('pj_today_is')} ${fmtDate(pjToday())} — ${window.t('pj_status_auto_note')}</span>
      </div>
    </div>
    <div class="pj-status-actions">${statusActions}</div>
  </div>

  <div class="stats-grid mg-mt">
    ${kpiCard('Schedule', p.scheduleMode === 'multi' ? `${sess.length} sessions` : 'Single event', dateRangeText(p), '🗓️')}
    ${kpiCard('Next Session', nx ? fmtDate(nx.date).replace(/ \d{4}$/, '') : '—', nx ? `${fmtTime(nx.startTime)} · ${esc(pjLoc(nx.label || p.name))}` : 'Nothing upcoming', '⏭️')}
    ${kpiCard('Days To Go', daysToGo, nx ? esc(pjLoc(nx.venue || p.defaultVenue) || '') : '', '📅')}
    ${kpiCard('People', `${sevs.length} sevarthi`, `${people.length} guest`, '🙏')}
  </div>

  <div class="dashboard-2col mg-mt">
    <div class="card">
      <div class="card-header flex justify-between items-center">
        <div class="card-title">Pooja Details</div>
        <button class="btn btn-outline mg-btn-xs" onclick="openEditPooja('${p.id}')">Edit</button>
      </div>
      <div class="card-body">
        <div class="mg-profile-grid">
          <div><span>Type</span><strong>${esc(t ? `${t.icon || ''} ${t.name}` : 'Custom')}</strong></div>
          <div><span>Schedule</span><strong>${p.scheduleMode === 'multi' ? 'Multi-session' : 'Single event'}</strong></div>
          <div><span>Default Venue</span><strong>${esc(pjLoc(p.defaultVenue) || '—')}</strong></div>
          <div><span>Est. Seva Contribution</span><strong>${p.estimatedSevaAmount ? '₹' + Number(p.estimatedSevaAmount).toLocaleString('en-IN') : '—'}</strong></div>
        </div>
        ${p.notes ? `<div class="mg-note-box mg-mt-sm"><strong>Notes:</strong> ${esc(p.notes)}</div>` : ''}
        ${p.custom && p.custom.length ? `
          <div class="mg-note-box mg-mt-sm">
            ${p.custom.map(c => `<div><strong>${esc(c.label)}:</strong> ${esc(c.value)}</div>`).join('')}
          </div>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">Recent Activity</div></div>
      <div class="card-body">
        <div class="summary-list">
          ${activityOfPooja(p.id).slice(0, 6).map(a => `
            <div class="summary-item">
              <div><strong>${esc(a.text)}</strong></div>
              <span class="mg-muted-xs">${esc(a.when)}</span>
            </div>`).join('') || '<div class="mg-pad-note">No activity recorded.</div>'}
        </div>
      </div>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">Session Schedule</div>
      <button class="btn btn-outline mg-btn-xs" onclick="openEditPooja('${p.id}')">Manage Sessions</button>
    </div>
    <div class="card-body" style="padding:0;">
      ${sess.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <thead><tr><th>#</th><th>Session</th><th>Date</th><th>Time</th><th>Venue</th><th>Status</th></tr></thead>
        <tbody>${sess.map((s, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${esc(s.label || 'Session ' + (i + 1))}</strong></td>
            <td>${fmtDateLong(s.date)}</td>
            <td>${fmtTime(s.startTime)} – ${fmtTime(s.endTime)}</td>
            <td>${esc(pjLoc(s.venue || p.defaultVenue) || '—')}</td>
            <td>${sessionIsPast(s) ? '<span class="badge badge-maroon">Done</span>' : (s.date === pjToday() ? '<span class="badge badge-confirmed">Today</span>' : '<span class="badge badge-pending">Upcoming</span>')}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="mg-pad-note">No sessions yet. Use “Edit Pooja” to add a date and time.</div>`}
    </div>
  </div>

  <div class="dashboard-2col mg-mt">
    <div class="card">
      <div class="card-header flex justify-between items-center">
        <div class="card-title">Sevarthi(s)</div>
        <button class="btn btn-outline mg-btn-xs" onclick="openAddSevarthi('${p.id}')">+ Add</button>
      </div>
      <div class="card-body">
        ${sevs.length ? `<div class="summary-list">${sevs.map(s => `
          <div class="summary-item">
            <div><strong>${esc(s.firstName + ' ' + s.lastName)}</strong>
              <div class="mg-muted-xs">${esc(s.mobile)} · ${esc(s.city || '—')} · ${esc(s.committee || '—')}</div></div>
            <button class="btn btn-outline mg-btn-xs" onclick="openSevarthiProfile('${s.id}')">View</button>
          </div>`).join('')}</div>` : '<div class="mg-pad-note">No sevarthi recorded yet.</div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-header flex justify-between items-center">
        <div class="card-title">Guests</div>
        <button class="btn btn-outline mg-btn-xs" onclick="openEditPooja('${p.id}')">Manage</button>
      </div>
      <div class="card-body">
        ${people.length ? `<div class="summary-list">${people.map(g => `
          <div class="summary-item">
            <div><strong>${esc(personName(g))}</strong><div class="mg-muted-xs">${esc(g.role || 'Guest')}${g.mobile ? ' · ' + esc(g.mobile) : ''}</div></div>
            ${g.mobile ? `<a class="btn btn-outline mg-btn-xs" href="https://wa.me/91${esc(g.mobile)}" target="_blank" rel="noopener">💬</a>` : ''}
          </div>`).join('')}</div>` : '<div class="mg-pad-note">No guests added. Use “Manage” or the Edit Pooja form.</div>'}
      </div>
    </div>
  </div>

  <div class="section-title mg-mt">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    <span>Quick Actions</span>
  </div>
  <div class="quick-actions-grid mg-quick">
    <div class="action-tile" onclick="openAddSevarthi('${p.id}')"><div class="action-tile-icon">➕</div><span>Add Sevarthi</span></div>
    <div class="action-tile" onclick="openEditPooja('${p.id}')"><div class="action-tile-icon">✏️</div><span>Edit Pooja</span></div>
    <div class="action-tile" onclick="setPoojaTab('invitation')"><div class="action-tile-icon">🎴</div><span>Invitation Card</span></div>
    <div class="action-tile" onclick="setPoojaTab('calendar')"><div class="action-tile-icon">🗓️</div><span>Calendar</span></div>
  </div>`;
}

/* ------------------------------------------------------------
   PANE: SEVARTHI
   ------------------------------------------------------------ */
function panePoojaSevarthi(p) {
  const sevs = sevarthisOf(p);
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">${window.t('pj_sevarthi_records')}</h2>
      <p class="mg-page-sub">Devotees who have taken the seva of this pooja</p>
    </div>
    <button class="btn btn-primary" onclick="openAddSevarthi('${p.id}')">+ Add Sevarthi</button>
  </div>

  ${sevs.length ? `
  <div class="card">
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll">
        <table class="custom-table">
          <thead><tr><th>Sevarthi</th><th>Mobile</th><th>City</th><th>Committee</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${sevs.map(s => `
            <tr>
              <td>
                <div class="mg-name-cell">
                  <span class="mg-avatar">${esc((s.firstName[0] || '') + (s.lastName[0] || ''))}</span>
                  <div><strong>${esc(s.firstName + ' ' + s.lastName)}</strong><div class="mg-muted-xs">${esc(s.id)} · joined ${fmtDate(s.addedDate)}</div></div>
                </div>
              </td>
              <td>${esc(s.mobile)}</td>
              <td>${esc(s.city || '—')}</td>
              <td><span class="badge badge-maroon">${esc(s.committee || '—')}</span></td>
              <td><span class="badge ${s.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${s.status === 'active' ? 'Active' : 'Inactive'}</span></td>
              <td>
                <div class="flex gap-1 mg-actions-wrap">
                  <button class="btn btn-outline mg-btn-xs" onclick="openSevarthiProfile('${s.id}')">View</button>
                  <a class="btn btn-outline mg-btn-xs" href="tel:${esc(s.mobile)}">📞</a>
                  <a class="btn btn-outline mg-btn-xs" href="https://wa.me/91${esc(s.mobile)}" target="_blank" rel="noopener">💬</a>
                  <button class="btn btn-outline mg-btn-xs" onclick="openEditSevarthi('${s.id}')">Edit</button>
                  <button class="btn btn-outline mg-btn-xs" onclick="toggleSevarthiStatus('${s.id}')">${s.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                  <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="removeSevarthiFromPooja('${p.id}','${s.id}')">Remove</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>` : emptyState('No sevarthi yet', 'Add the devotee who has taken the seva of this pooja. If they are already on record, the mobile number will link the existing profile.')}
  `;
}

function paneSevarthiProfile(p) {
  const s = sevarthiById(POOJA.activeSevarthiId);
  if (!s) { POOJA.activeSevarthiId = null; return panePoojaSevarthi(p); }

  const sponsored = POOJA.poojas.filter(pp => (pp.sevarthiIds || []).indexOf(s.id) !== -1);

  return `
  <button class="btn btn-outline mg-back" onclick="closeSevarthiProfile()">← Sevarthi Records</button>

  <div class="card mg-profile-card">
    <div class="mg-profile-head">
      <div class="mg-profile-avatar" style="background:${p.color}">${esc((s.firstName[0] || '') + (s.lastName[0] || ''))}</div>
      <div class="mg-profile-id">
        <h2>${esc(s.firstName + ' ' + s.lastName)}</h2>
        <div class="mg-muted-xs">${esc(s.id)} · devotee ${esc(s.devoteeId)}</div>
        <div class="mg-profile-badges">
          <span class="badge ${s.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${s.status === 'active' ? 'Active' : 'Inactive'}</span>
          <span class="badge badge-maroon">${esc(s.committee || 'No committee')}</span>
        </div>
      </div>
      <div class="mg-profile-actions">
        <a class="btn btn-outline" href="tel:${esc(s.mobile)}">📞 Call</a>
        <a class="btn btn-outline" href="https://wa.me/91${esc(s.mobile)}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <button class="btn btn-outline" onclick="openEditSevarthi('${s.id}')">Edit</button>
      </div>
    </div>

    <div class="mg-profile-grid">
      <div><span>Mobile</span><strong>${esc(s.mobile)}</strong></div>
      <div><span>City</span><strong>${esc(s.city || '—')}</strong></div>
      <div><span>State</span><strong>${esc(s.state || '—')}</strong></div>
      <div><span>Committee</span><strong>${esc(s.committee || '—')}</strong></div>
      <div><span>Devotee ID</span><strong>${esc(s.devoteeId)}</strong></div>
      <div><span>Added</span><strong>${fmtDate(s.addedDate)}</strong></div>
    </div>

    ${s.notes ? `<div class="mg-note-box"><strong>Notes:</strong> ${esc(s.notes)}</div>` : ''}
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Poojas Sponsored (${sponsored.length})</div></div>
    <div class="card-body" style="padding:0;">
      ${sponsored.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <thead><tr><th>Pooja</th><th>Type</th><th>Schedule</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${sponsored.map(pp => {
          const tt = typeById(pp.typeId);
          const stt = poojaStatus(pp);
          return `<tr>
            <td><strong>${esc(pjLoc(pp.name))}</strong></td>
            <td>${esc(tt ? pjLoc(tt.name) : '—')}</td>
            <td>${dateRangeText(pp)}</td>
            <td><span class="badge ${POOJA_STATUS_BADGE[stt]}">${poojaStatusLabel(stt)}</span></td>
            <td><button class="btn btn-outline mg-btn-xs" onclick="openPooja('${pp.id}')">Open</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : '<div class="mg-pad-note">Only this pooja so far.</div>'}
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   PANE: INVITATION CARD
   ------------------------------------------------------------ */
/** Committee options for the invitation audience dropdown (needs the CMT module). */
function invAudienceOptions() {
  if (typeof CMT === 'undefined' || !Array.isArray(CMT.committees)) return [];
  return CMT.committees.map(c => ({
    id: c.id,
    label: (typeof tData === 'function' ? tData(c.samaj || c.name) : (c.samaj || c.name)),
    count: (typeof cmtMembersOf === 'function' ? cmtMembersOf(c.id).length : 0)
  }));
}
/** Recipient rows (name + place + mobile) for a chosen audience committee. */
function invAudienceRecipients(audienceId) {
  if (!audienceId || typeof cmtMembersOf !== 'function') return [];
  return cmtMembersOf(audienceId).map(m => ({
    name: (m.firstName + ' ' + m.lastName).trim(),
    place: [m.city, m.state].filter(Boolean).map(x => (typeof tData === 'function' ? tData(x) : x)).join(', '),
    mobile: m.mobile || ''
  }));
}

function panePoojaInvitation(p) {
  const inv = p.invitation || {};
  const tplOpts = [
    ['royal', window.t('pj_inv_royal', 'Royal (ceremonial)')],
    ['cream', window.t('pj_inv_cream', 'Cream (minimal)')],
    ['festival', window.t('pj_inv_festival', 'Festival (celebratory)')]
  ];
  const langOpts = [['', window.t('pj_inv_lang_app', 'Same as app')], ['en', 'English'], ['gu', 'ગુજરાતી'], ['hi', 'हिन्दी']];
  const accentOpts = POOJA.accentPalette.map(a =>
    `<option value="${a.hex}" ${a.hex === inv.accent ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const audOpts = invAudienceOptions();
  const initRcpts = inv.audience ? invAudienceRecipients(inv.audience) : [];
  const audCount = initRcpts.length;

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">${window.t('pj_invitation_card')}</h2>
      <p class="mg-page-sub">${window.t('pj_inv_sub2', 'Auto-filled from the pooja. Adjust the copy, colour and language, then print or save as PDF (A5).')}</p>
    </div>
  </div>

  <div class="pj-invite-controls">
    <div class="pj-invite-stage">
      <div id="pjInvitePreview">${invitationPreviewHTML(p, inv, initRcpts)}</div>
      <div id="pjInviteBatchNote" class="pj-invite-batch-note"${audCount ? '' : ' hidden'}>${audCount ? (audCount + ' ' + window.t('cmt_members', 'members') + ' — ' + window.t('pj_inv_aud_pdf', 'Print / Save PDF generates all') + ' ' + audCount + ' (' + window.t('pj_inv_aud_onepage', 'one invitation per page') + ')') : ''}</div>
    </div>

    <div class="card">
      <div class="card-body">
        <form onsubmit="saveInvitation(event,'${p.id}')">
          <div class="grid mg-2col-form">
            <div class="form-group">
              <label class="form-label" for="invTemplate">${window.t('pj_inv_template', 'Template')}</label>
              <select class="form-select" id="invTemplate" onchange="updateInvitationPreview()">
                ${tplOpts.map(o => `<option value="${o[0]}" ${o[0] === (inv.template || 'royal') ? 'selected' : ''}>${o[1]}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="invLangSel">${window.t('pj_inv_language', 'Card Language')}</label>
              <select class="form-select" id="invLangSel" onchange="updateInvitationPreview()">
                ${langOpts.map(o => `<option value="${o[0]}" ${o[0] === (inv.lang || '') ? 'selected' : ''}>${o[1]}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="invAudience">${window.t('pj_inv_audience', 'Invite (audience)')}</label>
            <select class="form-select" id="invAudience" onchange="updateInvitationPreview()">
              <option value="">${window.t('pj_inv_aud_open', 'Open / public invitation (no name)')}</option>
              ${audOpts.length ? `<optgroup label="${window.t('pj_inv_aud_grp', 'One card per committee member')}">
                ${audOpts.map(o => `<option value="${o.id}" ${o.id === (inv.audience || '') ? 'selected' : ''}>${esc(o.label)} — ${o.count} ${window.t('cmt_members', 'members')}</option>`).join('')}
              </optgroup>` : ''}
            </select>
            <span class="mg-muted-xs">${window.t('pj_inv_aud_hint', 'Pick a samaj / committee to generate a personalised card (name, city, state) for every member — one page each in the PDF.')}</span>
          </div>
          <div class="form-group">
            <label class="form-label" for="invAccent">${window.t('pj_inv_accent', 'Accent Colour')}</label>
            <select class="form-select" id="invAccent" onchange="updateInvitationPreview()">${accentOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="invHeadline">${window.t('pj_inv_headline', 'Headline')}</label>
            <input class="form-input" id="invHeadline" value="${esc(inv.headline || '')}" placeholder="${esc(p.name)}" oninput="updateInvitationPreview()">
          </div>
          <div class="form-group">
            <label class="form-label" for="invLine">${window.t('pj_inv_line', 'Invitation Line')}</label>
            <input class="form-input" id="invLine" value="${esc(inv.inviteLine || '')}" placeholder="${esc(ivt(invLang(inv), 'invite'))}" oninput="updateInvitationPreview()">
          </div>
          <div class="form-group">
            <label class="form-label" for="invBlessing">${window.t('pj_inv_blessing', 'Closing Blessing')}</label>
            <input class="form-input" id="invBlessing" value="${esc(inv.blessing || '')}" placeholder="${esc(ivt(invLang(inv), 'blessing'))}" oninput="updateInvitationPreview()">
          </div>
          <div class="form-group">
            <label class="mg-check-inline"><input type="checkbox" id="invShowSchedule" ${inv.showSchedule !== false ? 'checked' : ''} onchange="updateInvitationPreview()"> <span>${window.t('pj_inv_show_schedule', 'Show full session schedule')}</span></label>
            <label class="mg-check-inline"><input type="checkbox" id="invShowSevarthi" ${inv.showSevarthi !== false ? 'checked' : ''} onchange="updateInvitationPreview()"> <span>${window.t('pj_inv_show_sevarthi', 'Show sevarthi name(s)')}</span></label>
            <label class="mg-check-inline"><input type="checkbox" id="invShowGuests" ${inv.showGuests !== false ? 'checked' : ''} onchange="updateInvitationPreview()"> <span>${window.t('pj_inv_show_guests', 'Show guests')}</span></label>
          </div>
          <div class="flex gap-2 mg-mt-sm" style="flex-wrap:wrap">
            <button class="btn btn-primary" type="submit">${window.t('pj_inv_save', 'Save Card')}</button>
            <button class="btn btn-outline" type="button" onclick="previewInvitation('${p.id}')">${window.t('preview')}</button>
            <button class="btn btn-secondary js-inv-dl" type="button" onclick="downloadInvitationFor('${p.id}')">⬇ ${window.t('pj_inv_download', 'Download all (1 PDF)')}</button>
            <button class="btn btn-secondary js-inv-zip" id="pjInvZipBtn" type="button" onclick="downloadInvitationZipFor('${p.id}')"${initRcpts.length ? '' : ' hidden'}>🗂️ ${window.t('pj_inv_zip', 'Download ZIP (individual)')}</button>
            <button class="btn btn-outline" type="button" onclick="printInvitationFor('${p.id}')">${window.t('pj_inv_print_only', 'Print')}</button>
          </div>
        </form>
      </div>
    </div>
  </div>`;
}

/** Read the live control values (falls back to saved invitation). */
function readInvitationOpts(p) {
  const g = id => document.getElementById(id);
  if (!g('invTemplate')) return Object.assign({}, p.invitation);
  return {
    template: g('invTemplate').value,
    accent: g('invAccent').value,
    lang: g('invLangSel') ? g('invLangSel').value : (p.invitation && p.invitation.lang) || '',
    audience: g('invAudience') ? g('invAudience').value : (p.invitation && p.invitation.audience) || '',
    headline: g('invHeadline').value,
    inviteLine: g('invLine').value,
    blessing: g('invBlessing').value,
    showSchedule: g('invShowSchedule').checked,
    showSevarthi: g('invShowSevarthi').checked,
    showGuests: g('invShowGuests').checked
  };
}

/** Build the designer-panel preview markup: one card for an open invitation,
    or one card per committee member (stacked, numbered) for an audience —
    the exact set that printInvitationFor() will send to the PDF. */
function invitationPreviewHTML(p, opts, rcpts) {
  if (!rcpts || !rcpts.length) return invitationMarkup(p, opts);
  return rcpts.map((r, i) =>
    `<div class="inv-pv"><span class="inv-pv-n">${i + 1} / ${rcpts.length}</span>` +
    invitationMarkup(p, Object.assign({}, opts, { recipient: r })) + '</div>'
  ).join('');
}

function updateInvitationPreview() {
  const p = poojaById(POOJA.activePoojaId);
  const box = document.getElementById('pjInvitePreview');
  if (!p || !box) return;
  const opts = readInvitationOpts(p);
  const rcpts = invAudienceRecipients(opts.audience);
  box.innerHTML = invitationPreviewHTML(p, opts, rcpts);
  const zipBtn = document.getElementById('pjInvZipBtn');
  if (zipBtn) zipBtn.hidden = !rcpts.length;
  const note = document.getElementById('pjInviteBatchNote');
  if (note) {
    note.hidden = !rcpts.length;
    if (rcpts.length) note.textContent =
      rcpts.length + ' ' + window.t('cmt_members', 'members') + ' — ' +
      window.t('pj_inv_aud_pdf', 'Print / Save PDF generates all') + ' ' + rcpts.length +
      ' (' + window.t('pj_inv_aud_onepage', 'one invitation per page') + ')';
  }
}

function saveInvitation(e, id) {
  e.preventDefault();
  const p = poojaById(id);
  if (!p) return;
  p.invitation = Object.assign({}, p.invitation, readInvitationOpts(p));
  logPoojaActivity(id, 'Invitation card updated');
  pjToast('Invitation card saved.');
  renderPooja();
  if (window.API && window.API.online && !!p.code) {
    window.API.patch('/poojas/' + (p.code || p.id), { invitation: p.invitation }).catch(function (err) { pjToast((err && err.message) || 'Saved locally — sync failed'); });
  }
}

function previewInvitation(id) {
  const p = poojaById(id);
  if (!p) return;
  const opts = readInvitationOpts(p);
  const rcpts = invAudienceRecipients(opts && opts.audience);
  const note = rcpts.length ? `<div class="pj-invite-batch-note">${rcpts.length} ${window.t('cmt_members', 'members')} — ${window.t('pj_inv_aud_pdf', 'Print / Save PDF generates all')} ${rcpts.length} (${window.t('pj_inv_aud_onepage', 'one invitation per page')})</div>` : '';
  openSheet({
    title: `Invitation — ${p.name}`,
    wide: true,
    body: `<div class="pj-invite-single">${invitationPreviewHTML(p, opts, rcpts)}</div>${note}`,
    footer: `<button class="btn btn-outline" onclick="closeSheet()">${window.t('close', 'Close')}</button>
             <button class="btn btn-outline" onclick="printInvitationFor('${id}')">${window.t('pj_inv_print_only', 'Print')}</button>
             ${rcpts.length ? `<button class="btn btn-outline js-inv-zip" onclick="downloadInvitationZipFor('${id}')">🗂️ ${window.t('pj_inv_zip', 'Download ZIP (individual)')}</button>` : ''}
             <button class="btn btn-primary js-inv-dl" onclick="downloadInvitationFor('${id}')">⬇ ${window.t('pj_inv_download', 'Download all (1 PDF)')}</button>`
  });
}

/** Resolve the full set of invitation cards for a pooja: one per committee
    member when an audience is chosen, otherwise a single open card.
    `items[]` carries each card's markup + its recipient (name / mobile / place)
    so the ZIP export can name every file. */
function invitationCardSet(id) {
  const p = poojaById(id);
  if (!p) return null;
  const opts = (POOJA.activePoojaId === id) ? readInvitationOpts(p) : Object.assign({}, p.invitation);
  const rcpts = invAudienceRecipients(opts && opts.audience);
  if (rcpts.length) {
    const cmt = (typeof cmtById === 'function') ? cmtById(opts.audience) : null;
    const cmtName = cmt ? (cmt.name || cmt.samaj || 'Committee') : 'Committee';
    const items = rcpts.map(r => ({ markup: invitationMarkup(p, Object.assign({}, opts, { recipient: r })), recipient: r }));
    return {
      cards: items.map(x => x.markup), items,
      title: p.name + ' - ' + cmtName, count: rcpts.length, cmtName, poojaName: p.name
    };
  }
  const only = invitationMarkup(p, opts);
  return { cards: [only], items: [{ markup: only, recipient: null }], title: p.name, count: 1, cmtName: '', poojaName: p.name };
}

/* Open the browser print dialog (kept as a secondary option / fallback). */
function printInvitationFor(id) {
  const set = invitationCardSet(id);
  if (set) printInvitationHTML(set.cards, set.title);
}

/* Option 1 — one multi-page PDF (one invitation per A5 page), downloaded directly. */
function downloadInvitationFor(id) {
  const set = invitationCardSet(id);
  if (!set) return;
  downloadInvitationPDF(set.cards, set.title, id);
}

/* Option 2 — a ZIP of individual single-page PDFs, one per devotee.
   Each PDF: "<pooja> - <devotee> - <mobile>.pdf" · ZIP: "<pooja> - <committee>.zip" */
function downloadInvitationZipFor(id) {
  const set = invitationCardSet(id);
  if (!set) return;
  downloadInvitationZIP(set, id);
}

function invImagesReady(root) {
  const imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
  return Promise.all(imgs.map(im => (im.complete && im.naturalWidth)
    ? Promise.resolve()
    : new Promise(res => { im.onload = im.onerror = res; setTimeout(res, 2500); })));
}

function invFileName(parts) {
  return (parts || []).filter(Boolean).join(' - ')
    .replace(/[\/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function invTriggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 3000);
}

/* Rasterise each invitation card markup to a JPEG data-URL (shared by the
   single-PDF and the ZIP export). Retries a tainted card with the inline
   SVG emblem instead of the local PNGs (needed on file://). */
async function renderInvitationImages(markups, onProgress) {
  const libs = await ensurePdfLibs();
  const h2c = libs.html2canvas;
  const stage = document.createElement('div');
  stage.className = 'pj-pdf-stage';
  stage.setAttribute('aria-hidden', 'true');
  document.body.appendChild(stage);
  const images = [];
  try {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    for (let i = 0; i < markups.length; i++) {
      stage.innerHTML = markups[i];
      const card = stage.firstElementChild;
      if (!card) continue;
      await invImagesReady(card);
      const opt = { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false,
                    width: card.offsetWidth, height: card.offsetHeight,
                    windowWidth: card.offsetWidth, windowHeight: card.offsetHeight };
      let canvas;
      try {
        canvas = await h2c(card, opt);
        canvas.toDataURL('image/jpeg', 0.5);           // probe: throws if the canvas is tainted
      } catch (tainted) {
        card.classList.add('pj-pdf-noimg');
        await invImagesReady(card);
        canvas = await h2c(card, opt);
      }
      images.push(canvas.toDataURL('image/jpeg', 0.92));
      if (onProgress) onProgress(i + 1, markups.length);
    }
  } finally {
    stage.remove();
  }
  return images;
}

// A5 portrait in PDF points (1pt = 1/72in): 148mm x 210mm.
const INV_A5_W = 148 / 25.4 * 72;   // ≈ 419.53
const INV_A5_H = 210 / 25.4 * 72;   // ≈ 595.28

function invPdfDocDef(images) {
  return {
    pageSize: 'A5', pageOrientation: 'portrait', pageMargins: [0, 0, 0, 0],
    content: images.map((data, i) => {
      // fit box a hair under the page so rounding never spills a blank page
      const node = { image: data, fit: [INV_A5_W, INV_A5_H - 2], alignment: 'center' };
      if (i > 0) node.pageBreak = 'before';
      return node;
    })
  };
}

function invBusy(sel, on) {
  const btns = document.querySelectorAll(sel);
  btns.forEach(b => {
    if (on) { b.disabled = true; b.dataset.lbl = b.dataset.lbl || b.textContent; b.textContent = window.t('pj_inv_dl_wait', 'Building…'); }
    else { b.disabled = false; if (b.dataset.lbl) { b.textContent = b.dataset.lbl; delete b.dataset.lbl; } }
  });
}

async function downloadInvitationPDF(cards, title, id) {
  const arr = Array.isArray(cards) ? cards : [cards];
  if (!arr.length) return;
  const fname = invFileName([title]) || 'Invitations';
  invBusy('.js-inv-dl', true);
  const done = () => invBusy('.js-inv-dl', false);

  let libs;
  try { libs = await ensurePdfLibs(); }
  catch (e) {
    done();
    pjToast(window.t('pj_inv_dl_offline', 'PDF engine unavailable — opening print view instead.'));
    printInvitationHTML(cards, title);
    return;
  }

  try {
    const images = await renderInvitationImages(arr, (n, tot) => {
      if (tot > 6) pjToast(window.t('pj_inv_dl_prog', 'Rendering') + ' ' + n + '/' + tot + '…');
    });
    if (!images.length) throw new Error('no cards rendered');
    libs.pdfMake.createPdf(invPdfDocDef(images)).download(fname + '.pdf');
    if (typeof logPoojaActivity === 'function' && id) logPoojaActivity(id, 'Invitation PDF generated (' + images.length + ' page' + (images.length > 1 ? 's' : '') + ')');
    pjToast(images.length + ' ' + window.t('pj_inv_dl_ok', 'invitation page(s) saved as PDF.'));
  } catch (e) {
    console.error('invitation PDF failed', e);
    pjToast(window.t('pj_inv_dl_fail', 'PDF generation failed — opening print view instead.'));
    printInvitationHTML(cards, title);
  } finally {
    done();
  }
}

async function downloadInvitationZIP(set, id) {
  if (!set || !set.items || !set.items.length) return;
  invBusy('.js-inv-zip', true);
  const done = () => invBusy('.js-inv-zip', false);

  let libs, JSZip;
  try { libs = await ensurePdfLibs(); JSZip = await ensureZipLib(); }
  catch (e) {
    done();
    pjToast(window.t('pj_inv_dl_offline', 'PDF engine unavailable — opening print view instead.'));
    printInvitationHTML(set.cards, set.title);
    return;
  }

  try {
    const images = await renderInvitationImages(set.items.map(it => it.markup), (n, tot) => {
      if (tot > 3) pjToast(window.t('pj_inv_zip_prog', 'Packing') + ' ' + n + '/' + tot + '…');
    });
    if (!images.length) throw new Error('no cards rendered');

    const pooja = set.poojaName || 'Pooja';
    const zip = new JSZip();
    const used = {};
    for (let i = 0; i < images.length; i++) {
      const blob = await new Promise(res => libs.pdfMake.createPdf(invPdfDocDef([images[i]])).getBlob(res));
      const r = set.items[i] && set.items[i].recipient;
      let base = invFileName([pooja, r && r.name, r && r.mobile]) || (pooja + ' ' + (i + 1));
      let name = base + '.pdf', k = 2;
      while (used[name.toLowerCase()]) name = base + ' (' + (k++) + ').pdf';
      used[name.toLowerCase()] = 1;
      zip.file(name, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const zipName = (invFileName([set.title]) || (pooja + ' invitations')) + '.zip';
    invTriggerDownload(zipBlob, zipName);
    if (typeof logPoojaActivity === 'function' && id) logPoojaActivity(id, 'Invitation ZIP generated (' + images.length + ' PDFs) — ' + zipName);
    pjToast(images.length + ' ' + window.t('pj_inv_zip_ok', 'invitation PDFs saved as a ZIP.'));
  } catch (e) {
    console.error('invitation ZIP failed', e);
    pjToast(window.t('pj_inv_zip_fail', 'ZIP generation failed — opening print view instead.'));
    printInvitationHTML(set.cards, set.title);
  } finally {
    done();
  }
}

/* ---- Invitation markup + SVG motifs ----
   icon.png = circular emblem, temple.png = temple cutout (faint watermark).
   Fixed phrases are translated per-card via INV_TXT / opts.lang. */
const INV_TXT = {
  en: { invite:'You are cordially invited to', blessing:'Your presence will be our blessing.',
        foot:'Jai Shri Vihat Meldi Mataji 🙏', ribbon:'~  Invitation  ~', programme:'Programme',
        presence:'In the gracious presence of', sevaby:'Seva by the Sevarthi Parivar', invitee:'To',
        withfamily:'and family', ldate:'Date', ltime:'Time', lvenue:'Venue', tba:'To be announced', atmandir:'At the Mandir', session:'Session' },
  hi: { invite:'आप सादर आमंत्रित हैं', blessing:'आपकी उपस्थिति ही हमारा आशीर्वाद है।',
        foot:'जय श्री विहत मेलडी माताजी 🙏', ribbon:'॥  आमंत्रण  ॥', programme:'कार्यक्रम',
        presence:'गरिमामयी उपस्थिति में', sevaby:'सेवार्थी परिवार द्वारा सेवा', invitee:'सेवा में',
        withfamily:'सपरिवार', ldate:'तिथि', ltime:'समय', lvenue:'स्थान', tba:'शीघ्र घोषित', atmandir:'मंदिर में', session:'सत्र' },
  gu: { invite:'આપ સૌને સાદર આમંત્રણ છે', blessing:'આપની ઉપસ્થિતિ એ જ અમારો આશીર્વાદ.',
        foot:'જય શ્રી વિહત મેલડી માતાજી 🙏', ribbon:'॥  સાદર આમંત્રણ  ॥', programme:'કાર્યક્રમ',
        presence:'મુખ્ય અતિથિ વિશેષ ઉપસ્થિતિમાં', sevaby:'સેવાર્થી પરિવાર દ્વારા સેવા', invitee:'પ્રતિ',
        withfamily:'સપરિવાર', ldate:'તારીખ', ltime:'સમય', lvenue:'સ્થળ', tba:'ટૂંક સમયમાં જાહેર', atmandir:'મંદિરે', session:'સત્ર' }
};
function invLang(opts) {
  const l = (opts && opts.lang) || (typeof currentLang === 'function' ? currentLang() : 'en');
  return INV_TXT[l] ? l : 'en';
}
function ivt(lang, k) { return (INV_TXT[lang] || INV_TXT.en)[k] || INV_TXT.en[k]; }
function invDateLoc(iso, lang) {
  if (!iso) return '';
  const p = iso.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  const loc = lang === 'gu' ? 'gu-IN' : lang === 'hi' ? 'hi-IN' : 'en-GB';
  try { return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (e) { return fmtDateLong(iso); }
}

function inviteEmblemImg() {
  const src = (typeof assetURL === 'function') ? assetURL('assets/icon.png') : 'assets/icon.png';
  return `<span class="pj-invite-emblem-wrap">
    <img class="pj-invite-emblem" src="${src}" alt=""
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <span class="pj-invite-emblem-fallback" style="display:none">${inviteMandalaSVG()}</span>
  </span>`;
}
function inviteMandalaSVG() {
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="0.7">
    <circle cx="60" cy="60" r="54"/><circle cx="60" cy="60" r="42"/><circle cx="60" cy="60" r="30"/><circle cx="60" cy="60" r="18"/>
    <polygon points="60,4 76,40 116,60 76,80 60,116 44,80 4,60 44,40"/>
    <polygon points="60,16 92,60 60,104 28,60"/></g></svg>`;
}

function invitationMarkup(p, opts) {
  opts = Object.assign({ template: 'royal', accent: '#6B1F2A', headline: '', inviteLine: '', blessing: '',
    showSchedule: true, showSevarthi: true, showGuests: true, lang: '' }, p.invitation || {}, opts || {});
  const L = invLang(opts);
  const ty = typeById(p.typeId);
  const sess = poojaSessions(p);
  const sevs = sevarthisOf(p);
  const people = peopleOf(p);
  const first = sess[0] || {};
  const multi = p.scheduleMode === 'multi' && sess.length > 1;

  let detailBlock;
  if (multi && opts.showSchedule) {
    detailBlock = `
      <div class="pj-invite-schedule">
        <span class="pj-invite-schedule-h">${esc(ivt(L, 'programme'))}</span>
        ${sess.map((s, i) => `<div class="pj-invite-schedule-row">
          <strong>${esc(s.label || (ivt(L, 'session') + ' ' + (i + 1)))}</strong>
          <span>${invDateLoc(s.date, L)} · ${fmtTime(s.startTime)}–${fmtTime(s.endTime)}${s.venue ? ' · ' + esc(s.venue) : ''}</span>
        </div>`).join('')}
      </div>`;
  } else {
    detailBlock = `
      <div class="pj-invite-details">
        <div><span class="pj-invite-dl">${esc(ivt(L, 'ldate'))}</span><strong>${first.date ? invDateLoc(first.date, L) : esc(ivt(L, 'tba'))}</strong></div>
        <div><span class="pj-invite-dl">${esc(ivt(L, 'ltime'))}</span><strong>${first.startTime ? fmtTime(first.startTime) + ' – ' + fmtTime(first.endTime) : '—'}</strong></div>
        <div><span class="pj-invite-dl">${esc(ivt(L, 'lvenue'))}</span><strong>${esc(first.venue || p.defaultVenue || ivt(L, 'atmandir'))}</strong></div>
      </div>`;
  }

  return `
  <div class="pj-invite pj-invite--${esc(opts.template)}" style="--c:${esc(opts.accent)}" data-lang="${L}">
    <span class="pj-invite-corner c-tl"></span><span class="pj-invite-corner c-tr"></span>
    <span class="pj-invite-corner c-bl"></span><span class="pj-invite-corner c-br"></span>
    <img class="pj-invite-hero" src="${(typeof assetURL === 'function') ? assetURL('assets/temple.png') : 'assets/temple.png'}" alt="" aria-hidden="true" onerror="this.style.display='none'">
    <div class="pj-invite-watermark">${inviteMandalaSVG()}</div>
    <div class="pj-invite-frame">
      ${inviteEmblemImg()}
      <div class="pj-invite-temple">${esc(window.t('temple_name', 'Shri Vihat Meldi Mata Mandir'))}</div>
      <div class="pj-invite-temple-sub">${esc(window.t('temple_loc', 'Sanand, Gujarat'))}</div>
      <div class="pj-invite-ribbon">${esc(ivt(L, 'ribbon'))}</div>
      <div class="pj-invite-invocation">${esc(opts.inviteLine || ivt(L, 'invite'))}</div>
      ${opts.recipient ? `<div class="pj-invite-recipient">
        <span class="pj-invite-recipient-l">${esc(ivt(L, 'invitee'))}</span>
        <strong>${esc(opts.recipient.name)} <em>${esc(ivt(L, 'withfamily'))}</em></strong>
        ${opts.recipient.place ? `<span class="pj-invite-recipient-p">${esc(opts.recipient.place)}</span>` : ''}
      </div>` : ''}
      <h1 class="pj-invite-headline">${esc(opts.headline || p.name)}</h1>
      ${ty ? `<div class="pj-invite-type">${esc(ty.name)}</div>` : ''}
      ${detailBlock}
      ${opts.showGuests && people.length ? `
        <div class="pj-invite-party">
          <span class="pj-invite-party-h">${esc(ivt(L, 'presence'))}</span>
          ${people.map(g => `<div><strong>${esc(personName(g))}</strong>${g.role ? ` <em>— ${esc(tData(g.role))}</em>` : ''}</div>`).join('')}
        </div>` : ''}
      ${opts.showSevarthi && sevs.length ? `
        <div class="pj-invite-party">
          <span class="pj-invite-party-h">${esc(ivt(L, 'sevaby'))}</span>
          ${sevs.map(s => `<div><strong>${esc(s.firstName + ' ' + s.lastName)}</strong>${s.city ? `, ${esc(tData(s.city))}` : ''}</div>`).join('')}
        </div>` : ''}
      <div class="pj-invite-blessing">${esc(opts.blessing || ivt(L, 'blessing'))}</div>
      <div class="pj-invite-foot">${esc(ivt(L, 'foot'))}</div>
    </div>
  </div>`;
}

/** Open a print window carrying the app CSS + fonts so the A5 output is faithful. */
function printInvitationHTML(cards, title) {
  if (typeof openPrintDoc !== 'function') { pjToast('Print service unavailable.'); return; }
  const arr = Array.isArray(cards) ? cards : [cards];
  // Each card gets its own plain BLOCK wrapper (.inv-page) — page-break-after
  // is reliably honoured on a block-flow element (it is ignored on flex items,
  // which is why cards were running together).
  const inner = arr.map((c, i) =>
    `<div class="inv-page">${arr.length > 1 ? `<span class="inv-page-n">${i + 1} / ${arr.length}</span>` : ''}${c}</div>`
  ).join('');
  openPrintDoc({
    title: (title || 'Invitation').replace(/[\/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Invitation',
    wrapClass: 'pj-invite-print',
    inner: inner,
    css:
      /* on-screen popup: each card is a distinct sheet, stacked vertically */
      '.pj-invite-print{display:block;background:#efe7d7;padding:20px 0}' +
      '.inv-page{display:block;position:relative;width:402px;max-width:92vw;margin:0 auto 26px;box-sizing:border-box}' +
      '.inv-page .pj-invite{box-shadow:0 16px 44px rgba(107,31,42,.28)}' +
      '.inv-page-n{position:absolute;top:-15px;left:50%;transform:translateX(-50%);z-index:6;' +
        'font:600 11px/1 Inter,system-ui,sans-serif;letter-spacing:1px;color:#8a7a5c;background:#efe7d7;padding:2px 10px;border-radius:10px}' +
      /* print / PDF: exactly one A5 page per card. Every rule is !important and
         each .inv-page carries an explicit A5 height, so N recipients always
         produce N pages even if a forced page-break were ignored and even
         before the linked stylesheet finishes parsing. */
      '@media print{' +
        '@page{size:A5 portrait;margin:0}' +
        'html,body{background:#fff !important;margin:0 !important;padding:0 !important}' +
        '.pj-invite-print{display:block !important;margin:0 !important;padding:0 !important;background:#fff !important}' +
        '.inv-page{display:block !important;position:relative !important;' +
          'width:148mm !important;height:210mm !important;min-height:0 !important;max-height:210mm !important;' +
          'margin:0 !important;padding:0 !important;box-sizing:border-box !important;overflow:hidden !important;' +
          'break-inside:avoid !important;page-break-inside:avoid !important;' +
          'break-after:page !important;page-break-after:always !important}' +
        '.inv-page:last-child{break-after:auto !important;page-break-after:auto !important}' +
        '.inv-page-n{display:none !important}' +
        '.pj-invite{width:148mm !important;height:210mm !important;min-height:0 !important;max-height:210mm !important;' +
          'margin:0 !important;border:0 !important;border-radius:0 !important;box-shadow:none !important;overflow:hidden !important;' +
          'break-inside:avoid !important;page-break-inside:avoid !important;' +
          'break-after:auto !important;page-break-after:auto !important;' +
          '-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}' +
        '.pj-invite-frame{margin:8mm !important;min-height:0 !important}' +
      '}'
  });
}

/* ------------------------------------------------------------
   PANE: CALENDAR
   ------------------------------------------------------------ */
function shiftPoojaMonth(delta) {
  let mo = POOJA.calendarMonth + delta, yr = POOJA.calendarYear;
  if (mo < 0) { mo = 11; yr--; }
  if (mo > 11) { mo = 0; yr++; }
  POOJA.calendarMonth = mo; POOJA.calendarYear = yr;
  renderPooja();
}

function panePoojaCalendar(p) {
  const yr = POOJA.calendarYear, mo = POOJA.calendarMonth;
  const monthKey = `${yr}-${String(mo + 1).padStart(2, '0')}`;
  const first = new Date(yr, mo, 1);
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7;
  const entries = poojaSessionEntries(monthKey);

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthKey}-${String(d).padStart(2, '0')}`;
    const dayE = entries.filter(x => x.session.date === iso);
    const isToday = iso === pjToday();
    cells += `
      <div class="mg-cal-cell ${isToday ? 'mg-cal-today' : ''}">
        <div class="mg-cal-date">${d}${isToday ? `<span class="mg-cal-todaytag">${window.t('today', 'Today')}</span>` : ''}</div>
        ${dayE.map(x => `
          <div class="mg-cal-event" style="--c:${x.pooja.color}" onclick="openPooja('${x.pooja.id}')" title="${esc(tData(x.pooja.name))}">
            <div class="mg-ev-title">${esc(tData(x.pooja.name))}</div>
            <div class="mg-ev-meta">${esc(tData(x.session.label || ''))}</div>
            <div class="mg-ev-meta">${locTime(x.session.startTime)}–${locTime(x.session.endTime)}</div>
          </div>`).join('')}
      </div>`;
  }
  const trailing = (7 - ((startDow + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">${window.t('pj_calendar')}</h2>
      <p class="mg-page-sub">${entries.length} session(s) in ${locMonthYear(yr, mo)} across ${isPoojaAdmin() ? 'all poojas' : 'your poojas'}</p>
    </div>
    <div class="flex gap-2 items-center">
      <button class="btn btn-outline mg-btn-xs" onclick="shiftPoojaMonth(-1)">← Prev</button>
      <strong class="mg-cal-label">${locMonthYear(yr, mo)}</strong>
      <button class="btn btn-outline mg-btn-xs" onclick="shiftPoojaMonth(1)">Next →</button>
    </div>
  </div>

  <div class="card">
    <div class="card-body">
      <div class="mg-cal-head">${locDowShort().map(x => `<div>${x}</div>`).join('')}</div>
      <div class="mg-cal-grid">${cells}</div>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">All Sessions — ${locMonthYear(yr, mo)}</div></div>
    <div class="card-body" style="padding:0;">
      ${entries.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <thead><tr><th>Date</th><th>Pooja</th><th>Session</th><th>Time</th><th>Venue</th><th>Action</th></tr></thead>
        <tbody>${entries.slice().sort((a, b) => (a.session.date + a.session.startTime).localeCompare(b.session.date + b.session.startTime)).map(x => `
          <tr>
            <td>${locDate(x.session.date)}</td>
            <td><strong>${esc(tData(x.pooja.name))}</strong></td>
            <td>${esc(tData(x.session.label || '—'))}</td>
            <td>${locTime(x.session.startTime)} – ${locTime(x.session.endTime)}</td>
            <td>${esc(tData(x.session.venue || x.pooja.defaultVenue || '—'))}</td>
            <td><button class="btn btn-outline mg-btn-xs" onclick="openPooja('${x.pooja.id}')">Open</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="mg-pad-note">No pooja sessions this month.</div>`}
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   PANE: SETTINGS
   ------------------------------------------------------------ */
function panePoojaSettings(p) {
  const admin = isPoojaAdmin();
  const pool = coordinatorPool().filter(c => (p.coordinatorIds || []).indexOf(c.id) === -1);

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">${window.t('pj_settings')}</h2>
      <p class="mg-page-sub">${admin ? 'Coordinator access, schedule type, custom fields and danger zone' : 'Coordinators can edit pooja details and custom fields. Access grants are admin-only.'}</p>
    </div>
  </div>

  ${admin ? `
  <div class="card">
    <div class="card-header"><div class="card-title">Assigned Coordinators</div></div>
    <div class="card-body">
      <div class="mg-chip-row">
        ${(p.coordinatorIds || []).length ? p.coordinatorIds.map(id => {
          const c = coordinatorById(id) || { name: id };
          return `<span class="mg-chip" style="--c:${p.color}">${esc(c.name)}
            <button class="mg-chip-x" onclick="revokeCoordinator('${p.id}','${id}')" title="Revoke">×</button></span>`;
        }).join(' ') : '<span class="mg-muted-xs">No coordinator assigned — only admins can open this pooja.</span>'}
      </div>
      <form class="mg-mt-sm" onsubmit="assignCoordinator(event,'${p.id}')">
        ${(typeof devoteeLinkField === 'function') ? devoteeLinkField({
          selId: 'pjGrantSelect', label: window.t('pj_grant_coordinator', 'Grant coordinator access to'), required: true
        }) : ''}
        <button class="btn btn-primary mg-mt-sm" type="submit">Grant Access</button>
      </form>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Schedule Type</div></div>
    <div class="card-body">
      <div class="flex gap-2 items-center">
        <select class="form-select mg-inline-select" id="pjModeSetting" onchange="changeScheduleMode('${p.id}', this.value)">
          <option value="single" ${p.scheduleMode === 'single' ? 'selected' : ''}>Single dated event</option>
          <option value="multi" ${p.scheduleMode === 'multi' ? 'selected' : ''}>Multi-session series</option>
        </select>
        <span class="mg-muted-xs">Switching to “single” keeps only the first session.</span>
      </div>
    </div>
  </div>` : `
  <div class="card">
    <div class="card-header"><div class="card-title">Your Permissions</div></div>
    <div class="card-body">
      <div class="mg-perm-grid">
        <div class="mg-perm">
          <h4>Pooja Coordinator</h4>
          <ul>
            <li>✓ Open only poojas assigned to you</li>
            <li>✓ Edit pooja details, sessions, guests and custom fields</li>
            <li>✓ Add and manage sevarthi records</li>
            <li>✓ Design and print the invitation card</li>
            <li>✗ Cannot change coordinator access or delete a pooja</li>
            <li>✗ Cannot open other temple modules</li>
          </ul>
        </div>
      </div>
    </div>
  </div>`}

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">Custom Fields</div>
      <button class="btn btn-outline mg-btn-xs" type="button" onclick="addSettingsCustomRow()">+ Add field</button>
    </div>
    <div class="card-body">
      <form onsubmit="handleSaveCustomFields(event,'${p.id}')">
        <div id="pjSettingsCustomRows">${settingsCustomRowsHTML(p.custom || [])}</div>
        <button class="btn btn-primary mg-mt-sm" type="submit">Save Custom Fields</button>
      </form>
    </div>
  </div>

  ${admin ? `
  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Danger Zone</div></div>
    <div class="card-body">
      <button class="btn btn-outline mg-btn-danger" onclick="confirmDeletePooja('${p.id}')">Delete this Pooja</button>
      <div class="mg-muted-xs mg-mt-sm">Removes the pooja, its sessions and its activity log. Sevarthi devotee records are kept.</div>
    </div>
  </div>` : ''}
  `;
}

function settingsCustomRowsHTML(list) {
  const rows = (list && list.length ? list : [{ label:'', value:'' }]);
  return rows.map(c => `
    <div class="pj-custom-row">
      <input class="form-input" placeholder="Label" value="${esc(c.label || '')}">
      <input class="form-input" placeholder="Value" value="${esc(c.value || '')}">
      <button class="btn btn-outline mg-btn-xs mg-btn-danger" type="button" onclick="this.closest('.pj-custom-row').remove()">Remove</button>
    </div>`).join('');
}
function addSettingsCustomRow() {
  const box = document.getElementById('pjSettingsCustomRows');
  if (box) box.insertAdjacentHTML('beforeend', settingsCustomRowsHTML([{ label:'', value:'' }]));
}

/* ------------------------------------------------------------
   PANE: ACTIVITY (admin)
   ------------------------------------------------------------ */
function panePoojaActivity(p) {
  const list = activityOfPooja(p.id);
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">${window.t('pj_activity')}</h2>
      <p class="mg-page-sub">Audit trail for ${esc(p.name)} — visible to administrators</p>
    </div>
  </div>
  <div class="card">
    <div class="card-body">
      <div class="summary-list">
        ${list.length ? list.map(a => `
          <div class="summary-item">
            <div><strong>${esc(a.text)}</strong></div>
            <span class="mg-muted-xs">${esc(a.when)}</span>
          </div>`).join('') : '<div class="mg-pad-note">No activity recorded.</div>'}
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   COORDINATOR GRANTS  +  EXPORT
   ------------------------------------------------------------ */
function assignCoordinator(e, poojaId) {
  e.preventDefault();
  const p = poojaById(poojaId);
  const sel = document.getElementById('pjGrantSelect');
  if (!p || !sel || !sel.value) return;
  if (!p.coordinatorIds) p.coordinatorIds = [];
  const val = sel.value;
  if (p.coordinatorIds.indexOf(val) === -1) {
    p.coordinatorIds.push(val);
    const c = coordinatorById(val) || { name: val };
    logPoojaActivity(poojaId, `Access granted to ${c.name}`);
    pjToast(`${c.name} can now open this pooja.`);
    if (window.API && window.API.online && (/^DEV-/i.test(val) || /^\d+$/.test(String(val)))) {
      window.API.post('/poojas/' + (p.code || p.id) + '/coordinators', { devoteeId: val })
        .then(function () { return window.__rehydrate && window.__rehydrate('poojas'); })
        .catch(function (err) { pjToast((err && err.message) || 'Grant failed to sync'); });
    }
  }
  populateCoordRoleOptions();
  renderPooja();
}

function revokeCoordinator(poojaId, coordId) {
  const p = poojaById(poojaId);
  if (!p) return;
  p.coordinatorIds = (p.coordinatorIds || []).filter(id => id !== coordId);
  const c = coordinatorById(coordId) || { name: coordId };
  logPoojaActivity(poojaId, `Access revoked from ${c.name}`);
  pjToast(`${c.name}'s access removed.`);
  populateCoordRoleOptions();
  renderPooja();
  if (window.API && window.API.online && (/^DEV-/i.test(coordId) || /^\d+$/.test(String(coordId)))) {
    window.API.del('/poojas/' + (p.code || p.id) + '/coordinators/' + coordId)
      .catch(function (err) { pjToast((err && err.message) || 'Revoke failed to sync'); });
  }
}

/* "+ Add new devotee" beside the Grant-Access select — same shared sheet,
   then drop the person into the coordinator pool and preselect them. */
function pjAddCoordinatorDevotee() {
  if (typeof openDevoteeSheet !== 'function') { pjToast('Devotee form unavailable'); return; }
  openDevoteeSheet({
    title: 'Add a new devotee',
    onSaved: function (dev) {
      if (!POOJA.coordinators.some(c => String(c.id) === String(dev.id))) {
        POOJA.coordinators.push({ id: dev.id, name: dev.name, mobile: dev.mobile || '', city: dev.city || '' });
      }
      renderPooja();
      const sel = document.getElementById('pjGrantSelect');
      if (sel) sel.value = dev.id;
    }
  });
}
/* legacy alias — the old inline mini-form is gone */
function addCoordinatorToPool(e) { if (e) e.preventDefault(); pjAddCoordinatorDevotee(); }

function changeScheduleMode(poojaId, mode) {
  const p = poojaById(poojaId);
  if (!p) return;
  p.scheduleMode = mode;
  if (mode === 'single' && p.sessions.length > 1) {
    p.sessions = [poojaSessions(p)[0]];
    pjToast('Kept the first session only.');
  }
  logPoojaActivity(poojaId, `Schedule type set to ${mode === 'multi' ? 'multi-session' : 'single event'}`);
  renderPooja();
}

function poojaExport() {
  return {
    filename: 'pooja-directory',
    title: window.t('pj_directory', 'Pooja Directory'),
    subtitle: window.t('pj_sub_admin', 'Pooja events, sevarthis and coordinators'),
    columns: [
      window.t('pj_col_id', 'Pooja ID'), window.t('name', 'Name'), window.t('pj_type', 'Type'),
      window.t('pj_schedule', 'Schedule'), window.t('pj_sessions_word', 'Sessions'),
      window.t('venue', 'Venue(s)'), window.t('pj_sevarthi', 'Sevarthi'),
      window.t('pj_coordinator', 'Coordinator'), window.t('status', 'Status'),
      window.t('pj_est_seva', 'Est. Seva (INR)'),
    ],
    rows: pjDirSorted(visiblePoojas()).map(p => {
      const t = typeById(p.typeId);
      const venues = Array.from(new Set(poojaSessions(p).map(s => pjLoc(s.venue)).filter(Boolean)));
      return [
        p.id, pjLoc(p.name), t ? pjLoc(t.name) : '', dateRangeText(p), poojaSessions(p).length,
        venues.join(' / '), sevarthisOf(p).map(s => s.firstName + ' ' + s.lastName).join(' / '),
        coordinatorNames(p), poojaStatusLabel(poojaStatus(p)), p.estimatedSevaAmount || 0
      ];
    })
  };
}
if (typeof registerExport === 'function') registerExport('mod-pooja', poojaExport);
function exportPoojaCSV() { if (typeof runExport === 'function') runExport('mod-pooja', 'csv'); }
