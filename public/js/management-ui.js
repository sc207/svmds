/* ============================================================
   MANAGEMENT APP — RENDER & INTERACTION LAYER
   Depends on management.js (MG store + helpers)
   ============================================================ */

/* ------------------------------------------------------------
   ROOT ROUTER
   ------------------------------------------------------------ */
function renderManagement() {
  const root = document.getElementById('managementRoot');
  if (!root) return;

  if (MG.view === 'workspace' && MG.activeMgmtId && canOpen(MG.activeMgmtId)) {
    root.innerHTML = viewWorkspace();
  } else {
    MG.view = 'directory';
    root.innerHTML = viewDirectory();
  }
  applyRoleChrome();
}

function openManagement(id) {
  if (!canOpen(id)) {
    mgToast('Access denied — this Management is not assigned to you.');
    return;
  }
  MG.activeMgmtId = id;
  MG.view = 'workspace';
  MG.activeTab = 'overview';
  MG.activeSessionId = null;
  MG.activeMemberId = null;
  renderManagement();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToDirectory() {
  MG.view = 'directory';
  MG.activeMgmtId = null;
  MG.activeMemberId = null;
  MG.activeSessionId = null;
  renderManagement();
}

function setMgTab(tab) {
  MG.activeTab = tab;
  MG.activeMemberId = null;
  MG.activeSessionId = null;
  renderManagement();
}

/* ------------------------------------------------------------
   ROLE CHROME — hides admin-only nav for a Lead
   ------------------------------------------------------------ */
const LEAD_ALLOWED_PAGES = ['management', 'dashboard', 'calendar'];

function applyRoleChrome() {
  const lead = !isAdmin();

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    el.style.display = (lead && !LEAD_ALLOWED_PAGES.includes(page)) ? 'none' : '';
  });
  document.querySelectorAll('.mobile-nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    el.style.display = (lead && !LEAD_ALLOWED_PAGES.includes(page)) ? 'none' : '';
  });
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = lead ? 'none' : '';
  });

  const groups = document.querySelectorAll('.nav-group-title');
  groups.forEach(g => { g.style.display = lead ? 'none' : ''; });

  const banner = document.getElementById('leadScopeBanner');
  if (banner) {
    banner.style.display = lead ? 'flex' : 'none';
    if (lead) {
      const mine = visibleManagements().map(m => m.name).join(', ') || 'no assignments yet';
      banner.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span><strong>Management Lead access.</strong> You can only open: ${esc(mine)}</span>`;
    }
  }
}

/**
 * Switch session role.
 * @param {'admin'|'lead'} role
 * @param {string|null} leadId  lead devotee id when role === 'lead'
 * @param {boolean} announce    toast + jump to the Management page (default true)
 */
function setMgSession(role, leadId, announce) {
  const speak = announce !== false;

  if (role === 'admin') {
    MG.session = { role:'admin', userId:'DEV-001', userName:'Administrator' };
    if (speak) mgToast('Context switched to: Super Admin (Full Platform)');
  } else {
    const l = leadById(leadId) || MG.leads[0] || { id: leadId || '', name: 'Management Lead' };
    MG.session = { role:'lead', userId:l.id, userName:l.name };
    if (speak) mgToast(`Context switched to: ${l.name} (Management Lead)`);
  }

  const nameEl = document.getElementById('topbarUserName');
  if (nameEl) nameEl.textContent = MG.session.userName;

  MG.view = 'directory';
  MG.activeMgmtId = null;
  MG.activeMemberId = null;
  MG.activeSessionId = null;
  MG.badgeSelection = [];
  renderManagement();

  if (typeof renderDashboard === 'function') renderDashboard();
  if (speak && typeof switchPage === 'function') switchPage('management');
}

/** Populate the topbar role selector with one entry per Management Lead. */
function populateLeadRoleOptions() {
  const grp = document.getElementById('roleLeadGroup');
  if (!grp) return;
  const ids = [...new Set(MG.managements.map(m => m.leadId).filter(Boolean))];
  grp.innerHTML = ids.map(id => {
    const l = leadById(id);
    const owns = MG.managements.filter(m => m.leadId === id);
    if (!l || !owns.length) return '';
    return `<option value="lead:${id}">${esc(l.name)} — ${esc(owns.map(m => m.name).join(', '))}</option>`;
  }).join('');
}

/* ------------------------------------------------------------
   VIEW: DIRECTORY
   ------------------------------------------------------------ */
function viewDirectory() {
  const list = visibleManagements();
  const heading = isAdmin() ? 'Management Apps' : 'My Management Apps';
  const sub = isAdmin()
    ? 'Create operational teams, assign Leads and open any Management workspace'
    : 'Open a Management assigned to you';

  const totalMembers = list.reduce((n,m) => n + membersOf(m.id).length, 0);
  const totalActive  = list.reduce((n,m) => n + activeMembersOf(m.id).length, 0);
  const monthSessions = list.reduce((n,m) => n + mgmtMonthStats(m.id, MG.reportMonth).sessions, 0);
  const rates = list.map(m => mgmtMonthStats(m.id, MG.reportMonth).rate).filter(r => r > 0);
  const avgRate = rates.length ? Math.round(rates.reduce((a,b)=>a+b,0) / rates.length * 10) / 10 : 0;

  return `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">🗂️ ${heading}</h1>
      <p class="mg-page-sub">${sub}</p>
    </div>
    <div class="flex gap-2">
      ${isAdmin() ? `
        ${typeof exportBar === 'function' ? exportBar('mod-management') : ''}
        <button class="btn btn-primary" onclick="openAddManagement()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Management
        </button>` : ''}
    </div>
  </div>

  <div class="stats-grid">
    ${kpiCard('Total Managements', list.length, isAdmin() ? 'Across the platform' : 'Assigned to you', '🗂️')}
    ${kpiCard('Team Members', totalMembers, `${totalActive} active`, '👥')}
    ${kpiCard('Sessions This Month', monthSessions, locMonthYear(MG.calendarYear, MG.calendarMonth), '📅')}
    ${kpiCard('Average Attendance', avgRate + '%', 'Across visible teams', '✅')}
  </div>

  ${list.length === 0 ? emptyState('No Management assigned',
      isAdmin() ? 'Create your first Management to get started.'
                : 'No Management App has been assigned to your account yet. Please contact the temple administrator.') : `
  <div class="section-title">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    <span>Open a Management Workspace</span>
  </div>

  <div class="mg-card-grid">
    ${list.map(m => mgmtCard(m)).join('')}
  </div>

  ${isAdmin() ? `
  <div class="card" style="margin-top:1.75rem;">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">Management Directory</div>
      <input class="form-input mg-inline-search" id="mgDirSearch" placeholder="Search management or lead..." oninput="filterMgDirectory()">
    </div>
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll">
        <table class="custom-table">
          <thead>
            <tr><th>Management</th><th>Lead</th><th>Team</th><th>Expected</th><th>Status</th><th>Attendance</th><th>Next Volunteering</th><th>Actions</th></tr>
          </thead>
          <tbody id="mgDirectoryBody">${directoryRows(list)}</tbody>
        </table>
      </div>
    </div>
  </div>` : ''}
  `}
  `;
}

function directoryRows(list) {
  if (!list.length) return `<tr><td colspan="8" class="mg-empty-cell">No managements found.</td></tr>`;
  return list.map(m => {
    const team = membersOf(m.id).length;
    const st = mgmtMonthStats(m.id, MG.reportMonth);
    const nx = nextSessionOf(m.id);
    return `
    <tr>
      <td>
        <div class="mg-name-cell">
          <span class="mg-dot" style="background:${m.color}"></span>
          <div>
            <strong>${esc(m.name)}</strong>
            <div class="mg-muted-xs">${esc(m.id)}</div>
          </div>
        </div>
      </td>
      <td>${esc(leadName(m.id))}</td>
      <td><strong>${team}</strong></td>
      <td>${m.expectedTeamSize}</td>
      <td><span class="badge ${m.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${m.status === 'active' ? 'Active' : 'Inactive'}</span></td>
      <td>${st.rate ? st.rate + '%' : '—'}</td>
      <td>${nx ? `${fmtDate(nx.date)}, ${fmtTime(nx.startTime)}` : '—'}</td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-outline mg-btn-xs" onclick="openManagement('${m.id}')">Open</button>
          <button class="btn btn-outline mg-btn-xs" onclick="openEditManagement('${m.id}')">Edit</button>
          <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeleteManagement('${m.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterMgDirectory() {
  const q = (document.getElementById('mgDirSearch')?.value || '').toLowerCase();
  const list = visibleManagements().filter(m =>
    m.name.toLowerCase().includes(q) || leadName(m.id).toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  const body = document.getElementById('mgDirectoryBody');
  if (body) body.innerHTML = directoryRows(list);
}

function mgmtCard(m) {
  const team = membersOf(m.id).length;
  const active = activeMembersOf(m.id).length;
  const st = mgmtMonthStats(m.id, MG.reportMonth);
  const nx = nextSessionOf(m.id);
  return `
  <div class="mg-card" style="--mg-color:${m.color}">
    <div class="mg-card-stripe"></div>
    <div class="mg-card-top">
      <div class="mg-card-avatar" style="background:${m.color}">${esc(mgmtCode(m))}</div>
      <div class="mg-card-heading">
        <h3>${esc(m.name)}</h3>
        <span class="badge ${m.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${m.status === 'active' ? 'Active' : 'Inactive'}</span>
      </div>
    </div>
    <p class="mg-card-desc">${esc(m.description)}</p>
    <div class="mg-card-meta">
      <div><span>Lead</span><strong>${esc(leadName(m.id))}</strong></div>
      <div><span>Team</span><strong>${team} / ${m.expectedTeamSize}</strong></div>
      <div><span>Active</span><strong>${active}</strong></div>
      <div><span>Attendance</span><strong>${st.rate ? st.rate + '%' : '—'}</strong></div>
    </div>
    <div class="mg-card-next">
      ${nx ? `${STATUS_DOT[sessionStatus(nx)]} Next: <strong>${esc(nx.title)}</strong> · ${fmtDate(nx.date)}, ${fmtTime(nx.startTime)}`
           : 'No upcoming volunteering scheduled'}
    </div>
    <button class="btn btn-primary w-full mg-open-btn" onclick="openManagement('${m.id}')">Open Management →</button>
  </div>`;
}

function kpiCard(title, value, meta, icon) {
  return `
  <div class="stat-card">
    <div class="stat-card-info">
      <span class="stat-card-title">${esc(title)}</span>
      <span class="stat-card-value">${esc(value)}</span>
      <span class="mg-muted-xs">${esc(meta)}</span>
    </div>
    <div class="stat-card-icon-wrapper icon-diya-bg"><span class="mg-kpi-emoji">${icon}</span></div>
  </div>`;
}

function emptyState(title, body) {
  return `
  <div class="card mg-empty">
    <div class="mg-empty-mandala">🪔</div>
    <h3>${esc(title)}</h3>
    <p>${esc(body)}</p>
  </div>`;
}

/* ------------------------------------------------------------
   VIEW: WORKSPACE SHELL
   ------------------------------------------------------------ */
const MG_TABS = [
  { id:'overview',   label:'Overview',    icon:'🏠' },
  { id:'members',    label:'Team Members',icon:'👥' },
  { id:'calendar',   label:'Calendar',    icon:'🗓️' },
  { id:'attendance', label:'Attendance',  icon:'✅' },
  { id:'public',     label:'Public Page', icon:'🌐' },
  { id:'badges',     label:'Badges',      icon:'🎫' },
  { id:'whatsapp',   label:'WhatsApp',    icon:'💬' },
  { id:'settings',   label:'Settings',    icon:'⚙️' },
  { id:'activity',   label:'Activity',    icon:'🕒', adminOnly:true }
];

function viewWorkspace() {
  const m = mgmtById(MG.activeMgmtId);
  if (!m) { MG.view = 'directory'; return viewDirectory(); }

  const team = membersOf(m.id).length;
  const active = activeMembersOf(m.id).length;
  const tabs = MG_TABS.filter(t => !t.adminOnly || isAdmin());

  let body = '';
  if (MG.activeMemberId)       body = paneMemberProfile(m);
  else if (MG.activeSessionId) body = paneSessionAttendance(m);
  else switch (MG.activeTab) {
    case 'members':    body = paneMembers(m); break;
    case 'calendar':   body = paneCalendar(m); break;
    case 'attendance': body = paneAttendance(m); break;
    case 'public':     body = panePublic(m); break;
    case 'badges':     body = paneBadges(m); break;
    case 'whatsapp':   body = paneWhatsApp(m); break;
    case 'settings':   body = paneSettings(m); break;
    case 'activity':   body = paneActivity(m); break;
    default:           body = paneOverview(m);
  }

  return `
  <div class="mg-ws" style="--mg-color:${m.color}">
    <button class="btn btn-outline mg-back" onclick="backToDirectory()">← ${isAdmin() ? 'All Managements' : 'My Managements'}</button>

    <div class="mg-ws-header">
      <div class="mg-ws-id" style="background:${m.color}">${esc(mgmtCode(m))}</div>
      <div class="mg-ws-titles">
        <h1>${esc(m.name)}</h1>
        <div class="mg-ws-sub">
          Lead: <strong>${esc(leadName(m.id))}</strong>
          <span class="mg-sep">•</span> Team Members: <strong>${team}</strong>
          <span class="mg-sep">•</span> Active: <strong>${active}</strong>
          <span class="mg-sep">•</span> <span class="badge ${m.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${m.status === 'active' ? 'Active' : 'Inactive'}</span>
        </div>
      </div>
      <div class="mg-ws-actions">
        <button class="btn btn-outline" onclick="openAddMember('${m.id}')">+ Add Volunteer</button>
        <button class="btn btn-primary" onclick="openScheduleSession('${m.id}')">+ Schedule Volunteering</button>
      </div>
    </div>

    <div class="mg-tabs">
      ${tabs.map(t => `
        <button class="mg-tab ${MG.activeTab === t.id && !MG.activeMemberId && !MG.activeSessionId ? 'active' : ''}"
                onclick="setMgTab('${t.id}')">
          <span>${t.icon}</span> ${t.label}
        </button>`).join('')}
    </div>

    <div class="mg-pane">${body}</div>
  </div>`;
}

/* ------------------------------------------------------------
   PANE: OVERVIEW
   ------------------------------------------------------------ */
function paneOverview(m) {
  const team = membersOf(m.id);
  const active = team.filter(x => x.status === 'active');
  const st = mgmtMonthStats(m.id, MG.reportMonth);
  const todays = todaySessionsOf(m.id);
  const todayTally = todays.reduce((acc,v) => {
    const t = sessionTally(v);
    acc.assigned += t.total; acc.present += t.present; acc.absent += t.absent; return acc;
  }, { assigned:0, present:0, absent:0 });
  const nx = nextSessionOf(m.id);
  const upcoming = sessionsOf(m.id).filter(v => sessionStatus(v) !== 'completed').slice(0,4);
  const recent = sessionsOf(m.id).filter(v => sessionStatus(v) === 'completed').reverse().slice(0,4);

  return `
  <div class="stats-grid">
    ${kpiCard('Team Members', team.length, `Expected ${m.expectedTeamSize}`, '👥')}
    ${kpiCard('Active Volunteers', active.length, `${team.length - active.length} inactive`, '✅')}
    ${kpiCard('Sessions This Month', st.sessions, `${st.slots} volunteer slots`, '📅')}
    ${kpiCard('Attendance Rate', st.rate + '%', `${st.present} present / ${st.absent} absent`, '📊')}
  </div>

  <div class="stats-grid">
    ${kpiCard("Today's Volunteers", todayTally.assigned, todays.length ? `${todays.length} session(s) today` : 'No session today', '🙋')}
    ${kpiCard('Present Today', todayTally.present, 'Marked present', '🟢')}
    ${kpiCard('Absent Today', todayTally.absent, 'Marked absent', '🔴')}
    ${kpiCard('Next Session', nx ? `${fmtDate(nx.date).replace(/ \d{4}$/,'')}` : '—', nx ? `${fmtTime(nx.startTime)} · ${esc(nx.title)}` : 'Nothing scheduled', '⏭️')}
  </div>

  <div class="section-title">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    <span>Quick Actions</span>
  </div>
  <div class="quick-actions-grid mg-quick">
    <div class="action-tile" onclick="openAddMember('${m.id}')"><div class="action-tile-icon">➕</div><span>Add Volunteer</span></div>
    <div class="action-tile" onclick="openScheduleSession('${m.id}')"><div class="action-tile-icon">🗓️</div><span>Schedule Volunteering</span></div>
    <div class="action-tile" onclick="jumpToAttendance('${m.id}')"><div class="action-tile-icon">✅</div><span>Mark Attendance</span></div>
    <div class="action-tile" onclick="setMgTab('public')"><div class="action-tile-icon">🌐</div><span>Public Page</span></div>
    <div class="action-tile" onclick="setMgTab('badges')"><div class="action-tile-icon">🎫</div><span>Generate Badges</span></div>
    <div class="action-tile" onclick="setMgTab('whatsapp')"><div class="action-tile-icon">💬</div><span>WhatsApp</span></div>
    <div class="action-tile" onclick="setMgTab('attendance')"><div class="action-tile-icon">📊</div><span>Monthly Report</span></div>
  </div>

  <div class="dashboard-2col mg-mt">
    <div class="card">
      <div class="card-header flex justify-between items-center">
        <div class="card-title">Upcoming & Running Volunteering</div>
        <button class="btn btn-outline mg-btn-xs" onclick="setMgTab('calendar')">View Calendar</button>
      </div>
      <div class="card-body" style="padding:0;">
        ${upcoming.length ? `<div class="mg-table-scroll"><table class="custom-table">
          <thead><tr><th>Session</th><th>Date</th><th>Time</th><th>Team</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${upcoming.map(v => sessionRow(v)).join('')}</tbody>
        </table></div>` : `<div class="mg-pad-note">No upcoming volunteering. Use “Schedule Volunteering” to create one.</div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">Recent Activity</div></div>
      <div class="card-body">
        <div class="summary-list">
          ${activityOf(m.id).slice(0,6).map(a => `
            <div class="summary-item">
              <div><strong>${esc(a.text)}</strong></div>
              <span class="mg-muted-xs">${esc(a.when)}</span>
            </div>`).join('') || '<div class="mg-pad-note">No activity recorded.</div>'}
        </div>
      </div>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Completed Sessions</div></div>
    <div class="card-body" style="padding:0;">
      ${recent.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <thead><tr><th>Session</th><th>Date</th><th>Assigned</th><th>Present</th><th>Absent</th><th>Rate</th><th>Action</th></tr></thead>
        <tbody>${recent.map(v => {
          const t = sessionTally(v);
          const marked = t.present + t.absent;
          const rate = marked ? Math.round(t.present / marked * 100) : 0;
          return `<tr>
            <td><strong>${esc(v.title)}</strong></td>
            <td>${fmtDate(v.date)}</td>
            <td>${t.total}</td>
            <td><span class="badge badge-confirmed">${t.present}</span></td>
            <td><span class="badge badge-cancelled">${t.absent}</span></td>
            <td><strong>${rate}%</strong></td>
            <td><button class="btn btn-outline mg-btn-xs" onclick="openSession('${v.id}')">View</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="mg-pad-note">No completed sessions yet.</div>`}
    </div>
  </div>`;
}

function sessionRow(v) {
  const s = sessionStatus(v);
  const t = sessionTally(v);
  return `
  <tr>
    <td><strong>${esc(v.title)}</strong><div class="mg-muted-xs">${esc(v.location || '—')}</div></td>
    <td>${fmtDate(v.date)}</td>
    <td>${fmtTime(v.startTime)} – ${fmtTime(v.endTime)}</td>
    <td>${t.total} members</td>
    <td><span class="badge ${STATUS_BADGE[s]}">${STATUS_DOT[s]} ${STATUS_LABEL[s]}</span></td>
    <td><button class="btn btn-outline mg-btn-xs" onclick="openSession('${v.id}')">${s === 'completed' ? 'View' : 'Attendance'}</button></td>
  </tr>`;
}

function jumpToAttendance(mgmtId) {
  const running = sessionsOf(mgmtId).find(v => sessionStatus(v) === 'running')
    || todaySessionsOf(mgmtId)[0]
    || nextSessionOf(mgmtId);
  if (running) openSession(running.id);
  else { mgToast('No volunteering session available to mark.'); setMgTab('attendance'); }
}

/* ------------------------------------------------------------
   PANE: TEAM MEMBERS
   ------------------------------------------------------------ */
function paneMembers(m) {
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">Team Members</h2>
      <p class="mg-page-sub">${membersOf(m.id).length} members · expected team size ${m.expectedTeamSize}</p>
    </div>
    <div class="flex gap-2">
      <input class="form-input mg-inline-search" id="mgMemberSearch" placeholder="Search name, mobile, city..." oninput="renderMemberRows()">
      <select class="form-select mg-inline-select" id="mgMemberStatusFilter" onchange="renderMemberRows()">
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <button class="btn btn-primary" onclick="openAddMember('${m.id}')">+ Add Volunteer</button>
    </div>
  </div>

  <div class="card">
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll">
        <table class="custom-table">
          <thead>
            <tr><th>Volunteer</th><th>Mobile</th><th>City</th><th>State</th><th>Role</th><th>Status</th><th>Attendance</th><th>Actions</th></tr>
          </thead>
          <tbody id="mgMemberRows">${memberRows(m.id)}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function memberRows(mgmtId) {
  const q = (document.getElementById('mgMemberSearch')?.value || '').toLowerCase();
  const sf = document.getElementById('mgMemberStatusFilter')?.value || 'all';

  const list = membersOf(mgmtId).filter(x => {
    const hit = memberName(x).toLowerCase().includes(q) || x.mobile.includes(q) || (x.city||'').toLowerCase().includes(q);
    const st = sf === 'all' || x.status === sf;
    return hit && st;
  });

  if (!list.length) return `<tr><td colspan="8" class="mg-empty-cell">No volunteers match your filters.</td></tr>`;

  return list.map(x => {
    const s = memberStats(x.id, null);
    const other = assignmentsOfDevotee(x.devoteeId).filter(a => a.member.managementId !== mgmtId);
    return `
    <tr>
      <td>
        <div class="mg-name-cell">
          <span class="mg-avatar">${esc((x.firstName[0]||'') + (x.lastName[0]||''))}</span>
          <div>
            <strong>${esc(memberName(x))}</strong>
            <div class="mg-muted-xs">${esc(x.id)} · joined ${fmtDate(x.joinedDate)}</div>
            ${other.length ? `<div class="mg-multi">Also in: ${other.map(a => `<span class="mg-chip" style="--c:${a.management.color}">${esc(a.management.name)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${esc(x.mobile)}</td>
      <td>${esc(x.city || '—')}</td>
      <td>${esc(x.state || '—')}</td>
      <td>${esc(x.role || 'Volunteer')}</td>
      <td><span class="badge ${x.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${x.status === 'active' ? 'Active' : 'Inactive'}</span></td>
      <td><strong>${s.present}</strong> / ${s.sessions} <span class="mg-muted-xs">(${s.rate}%)</span></td>
      <td>
        <div class="flex gap-1 mg-actions-wrap">
          <button class="btn btn-outline mg-btn-xs" onclick="openMemberProfile('${x.id}')">View</button>
          <a class="btn btn-outline mg-btn-xs" href="tel:${esc(x.mobile)}" onclick="mgToast('Calling ${jsq(memberName(x))}...')">📞</a>
          <a class="btn btn-outline mg-btn-xs" href="https://wa.me/91${esc(x.mobile)}" target="_blank" rel="noopener">💬</a>
          <button class="btn btn-outline mg-btn-xs" onclick="openEditMember('${x.id}')">Edit</button>
          <button class="btn btn-outline mg-btn-xs" onclick="toggleMemberStatus('${x.id}')">${x.status === 'active' ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmRemoveMember('${x.id}')">Remove</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderMemberRows() {
  const body = document.getElementById('mgMemberRows');
  if (body && MG.activeMgmtId) body.innerHTML = memberRows(MG.activeMgmtId);
}

/* ------------------------------------------------------------
   PANE: MEMBER PROFILE
   ------------------------------------------------------------ */
function openMemberProfile(id) { MG.activeMemberId = id; MG.activeSessionId = null; renderManagement(); }
function closeMemberProfile() { MG.activeMemberId = null; renderManagement(); }

function paneMemberProfile(m) {
  const x = memberById(MG.activeMemberId);
  if (!x) { MG.activeMemberId = null; return paneMembers(m); }

  const all = memberStats(x.id, null);
  const month = memberStats(x.id, MG.reportMonth);
  const grade = attendanceGrade(all.rate, all.sessions);
  const other = assignmentsOfDevotee(x.devoteeId).filter(a => a.member.managementId !== m.id);

  const history = MG.volunteering
    .filter(v => v.managementId === m.id && v.memberIds.includes(x.id))
    .slice().sort((a,b) => b.date.localeCompare(a.date));

  return `
  <button class="btn btn-outline mg-back" onclick="closeMemberProfile()">← Team Members</button>

  <div class="card mg-profile-card">
    <div class="mg-profile-head">
      <div class="mg-profile-avatar" style="background:${m.color}">${esc((x.firstName[0]||'') + (x.lastName[0]||''))}</div>
      <div class="mg-profile-id">
        <h2>${esc(memberName(x))}</h2>
        <div class="mg-muted-xs">${esc(m.name)} · ${esc(x.role || 'Volunteer')} · ${esc(x.id)}</div>
        <div class="mg-profile-badges">
          <span class="badge ${x.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${x.status === 'active' ? 'Active' : 'Inactive'}</span>
          <span class="badge ${grade.cls}">${grade.label}</span>
        </div>
      </div>
      <div class="mg-profile-actions">
        <a class="btn btn-outline" href="tel:${esc(x.mobile)}">📞 Call</a>
        <a class="btn btn-outline" href="https://wa.me/91${esc(x.mobile)}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <button class="btn btn-outline" onclick="openEditMember('${x.id}')">Edit</button>
        <button class="btn btn-secondary" onclick="previewBadge('${x.id}')">Generate Badge</button>
      </div>
    </div>

    <div class="mg-profile-grid">
      <div><span>Mobile</span><strong>${esc(x.mobile)}</strong></div>
      <div><span>City</span><strong>${esc(x.city || '—')}</strong></div>
      <div><span>State</span><strong>${esc(x.state || '—')}</strong></div>
      <div><span>Joined</span><strong>${fmtDate(x.joinedDate)}</strong></div>
      <div><span>Total Volunteering</span><strong>${all.sessions}</strong></div>
      <div><span>Present</span><strong>${all.present}</strong></div>
      <div><span>Absent</span><strong>${all.absent}</strong></div>
      <div><span>Attendance Rate</span><strong>${all.rate}%</strong></div>
    </div>

    ${x.notes ? `<div class="mg-note-box"><strong>Notes:</strong> ${esc(x.notes)}</div>` : ''}

    ${other.length ? `
    <div class="mg-note-box">
      <strong>Other Management Assignments:</strong>
      ${other.map(a => `<span class="mg-chip" style="--c:${a.management.color}">${esc(a.management.name)} · ${esc(a.member.role || 'Volunteer')}</span>`).join(' ')}
      <div class="mg-muted-xs mg-mt-sm">The same devotee record (${esc(x.devoteeId)}) is shared across teams — no duplicate profiles.</div>
    </div>` : ''}
  </div>

  <div class="dashboard-2col mg-mt">
    <div class="card">
      <div class="card-header"><div class="card-title">Attendance History</div></div>
      <div class="card-body" style="padding:0;">
        ${history.length ? `<div class="mg-table-scroll"><table class="custom-table">
          <thead><tr><th>Date</th><th>Session</th><th>Time</th><th>Status</th></tr></thead>
          <tbody>
            ${history.map(v => {
              const a = attFor(v.id, x.id);
              const label = a ? (a.status === 'present' ? 'Present' : 'Absent') : 'Not Marked';
              const cls = a ? (a.status === 'present' ? 'badge-confirmed' : 'badge-cancelled') : 'badge-pending';
              return `<tr>
                <td>${fmtDate(v.date)}</td>
                <td>${esc(v.title)}</td>
                <td>${fmtTime(v.startTime)} – ${fmtTime(v.endTime)}</td>
                <td><span class="badge ${cls}">${label}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>` : `<div class="mg-pad-note">No volunteering assigned yet.</div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">${locMonthYear(MG.calendarYear, MG.calendarMonth)} Summary</div></div>
      <div class="card-body">
        <div class="summary-list">
          <div class="summary-item"><div><strong>Sessions Assigned</strong></div><strong>${month.sessions}</strong></div>
          <div class="summary-item"><div><strong>Present</strong></div><span class="badge badge-confirmed">${month.present}</span></div>
          <div class="summary-item"><div><strong>Absent</strong></div><span class="badge badge-cancelled">${month.absent}</span></div>
          <div class="summary-item"><div><strong>Attendance Rate</strong></div><strong>${month.rate}%</strong></div>
          <div class="summary-item"><div><strong>Assessment</strong></div><span class="badge ${attendanceGrade(month.rate, month.sessions).cls}">${attendanceGrade(month.rate, month.sessions).label}</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   PANE: CALENDAR
   ------------------------------------------------------------ */
function shiftMonth(delta) {
  let mo = MG.calendarMonth + delta, yr = MG.calendarYear;
  if (mo < 0) { mo = 11; yr--; }
  if (mo > 11) { mo = 0; yr++; }
  MG.calendarMonth = mo; MG.calendarYear = yr;
  MG.reportMonth = `${yr}-${String(mo+1).padStart(2,'0')}`;
  renderManagement();
}

function paneCalendar(m) {
  const yr = MG.calendarYear, mo = MG.calendarMonth;
  const monthKey = `${yr}-${String(mo+1).padStart(2,'0')}`;
  const first = new Date(yr, mo, 1);
  const daysInMonth = new Date(yr, mo+1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7;   // Monday-first
  const sessions = MG.volunteering.filter(v => v.managementId === m.id && v.date.startsWith(monthKey));
  const todayDow = (typeof todayDowIndex === 'function') ? todayDowIndex(yr, mo, MG.today) : -1;

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthKey}-${String(d).padStart(2,'0')}`;
    const dayS = sessions.filter(v => v.date === iso);
    const isToday = iso === MG.today;
    cells += `
      <div class="mg-cal-cell ${isToday ? 'mg-cal-today' : ''}">
        <div class="mg-cal-date">${d}${isToday ? `<span class="mg-cal-todaytag">${window.t('today', 'Today')}</span>` : ''}</div>
        ${dayS.map(v => {
          const s = sessionStatus(v);
          const t = sessionTally(v);
          return `
          <div class="mg-cal-event mg-ev-${s}" style="--c:${m.color}" onclick="openSession('${v.id}')" title="${esc(tData(v.title))}">
            <div class="mg-ev-title">${esc(tData(v.title))}</div>
            <div class="mg-ev-meta">${locTime(v.startTime)}–${locTime(v.endTime)}</div>
            <div class="mg-ev-meta">👥 ${t.total} · ${STATUS_DOT[s]} ${STATUS_LABEL[s]}</div>
            ${(s !== 'scheduled') ? `<div class="mg-ev-meta">🟢 ${t.present} · 🔴 ${t.absent}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  /* Pad the tail so the last week is a complete row */
  const trailing = (7 - ((startDow + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">Volunteering Calendar</h2>
      <p class="mg-page-sub">${sessions.length} session(s) in ${locMonthYear(yr, mo)}</p>
    </div>
    <div class="flex gap-2 items-center">
      <button class="btn btn-outline mg-btn-xs" onclick="shiftMonth(-1)">← Prev</button>
      <strong class="mg-cal-label">${locMonthYear(yr, mo)}</strong>
      <button class="btn btn-outline mg-btn-xs" onclick="shiftMonth(1)">Next →</button>
      <button class="btn btn-primary" onclick="openScheduleSession('${m.id}')">+ Schedule Volunteering</button>
    </div>
  </div>

  <div class="mg-legend">
    <span>🟡 Scheduled</span><span>🟢 Running</span><span>🔵 Completed</span>
    <span class="mg-legend-color"><i style="background:${m.color}"></i> ${esc(tData(m.name))}</span>
  </div>

  <div class="card">
    <div class="card-body">
      <div class="mg-cal-head">
        ${locDowShort().map((d, i) => `<div class="${i === todayDow ? 'mg-cal-dow-today' : ''}">${d}</div>`).join('')}
      </div>
      <div class="mg-cal-grid">${cells}</div>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">All Sessions — ${locMonthYear(yr, mo)}</div></div>
    <div class="card-body" style="padding:0;">
      ${sessions.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <thead><tr><th>Session</th><th>Date</th><th>Time</th><th>Location</th><th>Assigned</th><th>Present</th><th>Absent</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${sessions.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(v => {
          const s = sessionStatus(v); const t = sessionTally(v);
          return `<tr>
            <td><strong>${esc(tData(v.title))}</strong></td>
            <td>${locDate(v.date)}</td>
            <td>${locTime(v.startTime)} – ${locTime(v.endTime)}</td>
            <td>${esc(tData(v.location || '—'))}</td>
            <td>${t.total}</td>
            <td>${t.present}</td>
            <td>${t.absent}</td>
            <td><span class="badge ${STATUS_BADGE[s]}">${STATUS_DOT[s]} ${STATUS_LABEL[s]}</span></td>
            <td>
              <div class="flex gap-1">
                <button class="btn btn-outline mg-btn-xs" onclick="openSession('${v.id}')">Open</button>
                <button class="btn btn-outline mg-btn-xs" onclick="openEditSession('${v.id}')">Edit</button>
                <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeleteSession('${v.id}')">Delete</button>
              </div>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="mg-pad-note">No volunteering scheduled this month.</div>`}
    </div>
  </div>`;
}

/* ------------------------------------------------------------
   PANE: SESSION ATTENDANCE
   ------------------------------------------------------------ */
function openSession(id) {
  const v = sessionById(id);
  if (!v) return;
  MG.activeSessionId = id;
  MG.activeMemberId = null;
  if (MG.activeMgmtId !== v.managementId && canOpen(v.managementId)) MG.activeMgmtId = v.managementId;
  renderManagement();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function closeSession() { MG.activeSessionId = null; renderManagement(); }

function paneSessionAttendance(m) {
  const v = sessionById(MG.activeSessionId);
  if (!v) { MG.activeSessionId = null; return paneOverview(m); }

  const s = sessionStatus(v);
  const t = sessionTally(v);
  const marked = t.present + t.absent;
  const rate = marked ? Math.round(t.present / marked * 100) : 0;

  return `
  <button class="btn btn-outline mg-back" onclick="closeSession()">← Back</button>

  <div class="card mg-session-card">
    <div class="mg-session-head">
      <div>
        <h2 class="mg-pane-title">${esc(v.title)}</h2>
        <div class="mg-muted-xs">
          ${fmtDate(v.date)} · ${fmtTime(v.startTime)} – ${fmtTime(v.endTime)}
          ${v.location ? ` · 📍 ${esc(v.location)}` : ''}
        </div>
      </div>
      <div class="flex gap-2 items-center">
        <span class="badge ${STATUS_BADGE[s]}">${STATUS_DOT[s]} ${STATUS_LABEL[s]}</span>
        ${!v.completed ? `<button class="btn btn-outline" onclick="openEditSession('${v.id}')">Edit Session</button>` : ''}
      </div>
    </div>

    ${v.notes ? `<div class="mg-note-box"><strong>Notes:</strong> ${esc(v.notes)}</div>` : ''}

    <div class="mg-session-stats">
      <div><span>Total Assigned</span><strong>${t.total}</strong></div>
      <div><span>Present</span><strong class="mg-ok">${t.present}</strong></div>
      <div><span>Absent</span><strong class="mg-bad">${t.absent}</strong></div>
      <div><span>Not Marked</span><strong>${t.unmarked}</strong></div>
      <div><span>Attendance Rate</span><strong>${rate}%</strong></div>
    </div>

    ${v.completed ? `
      <div class="mg-locked">
        🔒 This volunteering is <strong>Completed</strong> and attendance is recorded. Records are read-only.
        ${isAdmin() ? `<button class="btn btn-outline mg-btn-xs" onclick="reopenSession('${v.id}')">Reopen (Admin)</button>` : ''}
      </div>` : `
      <div class="flex gap-2 mg-bulk">
        <button class="btn btn-outline" onclick="markAllAttendance('${v.id}','present')">Mark All Present</button>
        <button class="btn btn-outline" onclick="markAllAttendance('${v.id}','absent')">Mark All Absent</button>
        <button class="btn btn-secondary" onclick="confirmCompleteSession('${v.id}')">Complete Volunteering</button>
      </div>`}
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Attendance List</div></div>
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll">
        <table class="custom-table">
          <thead><tr><th>Volunteer</th><th>Mobile</th><th>Role</th><th>Status</th><th>Marked At</th><th>Action</th></tr></thead>
          <tbody>
            ${v.memberIds.map(id => {
              const x = memberById(id);
              if (!x) return '';
              const a = attFor(v.id, id);
              const label = a ? (a.status === 'present' ? 'Present' : 'Absent') : 'Not Marked';
              const cls = a ? (a.status === 'present' ? 'badge-confirmed' : 'badge-cancelled') : 'badge-pending';
              return `<tr>
                <td>
                  <div class="mg-name-cell">
                    <span class="mg-avatar">${esc((x.firstName[0]||'')+(x.lastName[0]||''))}</span>
                    <div><strong>${esc(memberName(x))}</strong><div class="mg-muted-xs">${esc(x.id)}</div></div>
                  </div>
                </td>
                <td>${esc(x.mobile)}</td>
                <td>${esc(x.role || 'Volunteer')}</td>
                <td><span class="badge ${cls}">${label}</span></td>
                <td class="mg-muted-xs">${a ? esc(a.markedAt.replace('T',' ').slice(0,16)) : '—'}</td>
                <td>
                  ${v.completed ? '<span class="mg-muted-xs">Locked</span>' : `
                  <div class="mg-att-toggle">
                    <button class="mg-att-btn ${a && a.status==='present' ? 'on-present' : ''}" onclick="markAttendance('${v.id}','${id}','present')">Present</button>
                    <button class="mg-att-btn ${a && a.status==='absent' ? 'on-absent' : ''}" onclick="markAttendance('${v.id}','${id}','absent')">Absent</button>
                  </div>`}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function mgSessionApi(volId) {
  const v = sessionById(volId); if (!v) return null;
  const m = mgmtById(v.managementId);
  const tcode = m && (m.code || m.id);
  if (!window.API || !window.API.online || !tcode || !v.code) return null;
  return { tcode: tcode, scode: v.code || v.id };
}
function mgSyncSessionAttendance(volId) {
  const ep = mgSessionApi(volId); if (!ep) return;
  const entries = MG.attendance
    .filter(function (a) { return a.volunteeringId === volId || a.sessionId === volId; })
    .map(function (a) { return { memberId: (typeof mgMemberRowId === 'function' ? mgMemberRowId(a.memberId) : a.memberId), status: a.status }; })
    .filter(function (e) { return e.memberId != null; });
  window.API.put('/teams/' + ep.tcode + '/sessions/' + ep.scode + '/attendance', { entries: entries }).catch(function () {});
}
function markAttendance(volId, memberId, status) {
  const v = sessionById(volId);
  if (!v || v.completed) { mgToast('Session is completed — attendance is locked.'); return; }
  setAttendance(volId, memberId, status);
  const x = memberById(memberId);
  logActivity(v.managementId, `${memberName(x)} marked ${status === 'present' ? 'Present' : 'Absent'} for ${v.title}`);
  renderManagement();
  mgSyncSessionAttendance(volId);
}

function markAllAttendance(volId, status) {
  const v = sessionById(volId);
  if (!v || v.completed) return;
  v.memberIds.forEach(id => setAttendance(volId, id, status));
  logActivity(v.managementId, `All ${v.memberIds.length} members marked ${status} for ${v.title}`);
  mgToast(`All members marked ${status}.`);
  renderManagement();
  mgSyncSessionAttendance(volId);
}

function confirmCompleteSession(volId) {
  const v = sessionById(volId);
  if (!v) return;
  const t = sessionTally(v);
  const warn = t.unmarked > 0
    ? `${t.unmarked} member(s) are still unmarked. Please confirm attendance before completing this volunteering session.`
    : 'All attendance has been confirmed.';
  openConfirm({
    title: 'Complete Volunteering',
    body: `<p><strong>${esc(v.title)}</strong><br>${fmtDate(v.date)} · ${fmtTime(v.startTime)} – ${fmtTime(v.endTime)}</p>
           <p class="mg-mt-sm">${esc(warn)}</p>
           <p class="mg-muted-xs mg-mt-sm">Present: ${t.present} · Absent: ${t.absent} · Not marked: ${t.unmarked}</p>
           <p class="mg-mt-sm">Once completed, attendance becomes read-only.</p>`,
    confirmLabel: 'Complete Volunteering',
    onConfirm: () => {
      v.completed = true;
      logActivity(v.managementId, `${v.title} completed — ${t.present} present, ${t.absent} absent`);
      mgToast('Volunteering completed. Attendance recorded.');
      renderManagement();
      mgSyncSessionAttendance(volId);
      const ep = mgSessionApi(volId);
      if (ep) window.API.patch('/teams/' + ep.tcode + '/sessions/' + ep.scode, { completed: true }).catch(function () {});
    }
  });
}

function reopenSession(volId) {
  const v = sessionById(volId);
  if (!v) return;
  v.completed = false;
  logActivity(v.managementId, `${v.title} reopened for attendance correction`);
  mgToast('Session reopened.');
  renderManagement();
  const ep = mgSessionApi(volId);
  if (ep) window.API.patch('/teams/' + ep.tcode + '/sessions/' + ep.scode, { completed: false }).catch(function () {});
}

/* ------------------------------------------------------------
   PANE: ATTENDANCE / MONTHLY REPORT
   ------------------------------------------------------------ */
/** A rolling 12-month window ending at the real current month (was a
    hardcoded ['2026-07'..'2026-10'] list — dead past October 2026, and
    missing any month before July). `selectedKey` is always included even
    if it falls outside the window, so an already-picked month is never
    silently dropped from its own <select>. */
function mgReportMonthOptions(selectedKey) {
  const now = new Date();
  const keys = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  if (selectedKey && keys.indexOf(selectedKey) === -1) keys.push(selectedKey);
  return keys.sort().map(k => {
    const [y, mo] = k.split('-');
    return `<option value="${k}" ${k === selectedKey ? 'selected' : ''}>${locMonthYear(+y, +mo - 1)}</option>`;
  }).join('');
}
function paneAttendance(m) {
  const monthKey = MG.reportMonth;
  const st = mgmtMonthStats(m.id, monthKey);
  const sessions = MG.volunteering.filter(v => v.managementId === m.id && v.date.startsWith(monthKey))
    .slice().sort((a,b) => a.date.localeCompare(b.date));

  const rows = membersOf(m.id).map(x => ({ x, s: memberStats(x.id, monthKey) }))
    .sort((a,b) => b.s.rate - a.s.rate || b.s.present - a.s.present);

  const monthOptions = mgReportMonthOptions(monthKey);

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">Attendance & Monthly Report</h2>
      <p class="mg-page-sub">Session attendance, monthly rates and team decision support</p>
    </div>
    <div class="flex gap-2">
      <select class="form-select mg-inline-select" id="mgReportMonth" onchange="changeReportMonth(this.value)">${monthOptions}</select>
      ${typeof exportBar === 'function' ? exportBar('mod-attendance') : '<button class="btn btn-outline" onclick="exportAttendanceCSV()">Export Report</button>'}
    </div>
  </div>

  <div class="stats-grid">
    ${kpiCard('Total Sessions', st.sessions, locMonthYear(+monthKey.split('-')[0], +monthKey.split('-')[1] - 1), '📅')}
    ${kpiCard('Volunteer Slots', st.slots, 'Assigned across sessions', '🎟️')}
    ${kpiCard('Present', st.present, `${st.absent} absent`, '🟢')}
    ${kpiCard('Attendance Rate', st.rate + '%', 'Of marked slots', '📊')}
  </div>

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">Sessions This Month</div>
      <button class="btn btn-primary mg-btn-xs" onclick="openScheduleSession('${m.id}')">+ Schedule</button>
    </div>
    <div class="card-body" style="padding:0;">
      ${sessions.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <thead><tr><th>Date</th><th>Session</th><th>Time</th><th>Assigned</th><th>Present</th><th>Absent</th><th>Unmarked</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${sessions.map(v => {
          const s = sessionStatus(v); const t = sessionTally(v);
          return `<tr>
            <td>${fmtDate(v.date)}</td>
            <td><strong>${esc(v.title)}</strong></td>
            <td>${fmtTime(v.startTime)} – ${fmtTime(v.endTime)}</td>
            <td>${t.total}</td>
            <td><span class="badge badge-confirmed">${t.present}</span></td>
            <td><span class="badge badge-cancelled">${t.absent}</span></td>
            <td>${t.unmarked}</td>
            <td><span class="badge ${STATUS_BADGE[s]}">${STATUS_DOT[s]} ${STATUS_LABEL[s]}</span></td>
            <td><button class="btn btn-outline mg-btn-xs" onclick="openSession('${v.id}')">${v.completed ? 'View' : 'Mark'}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="mg-pad-note">No sessions this month.</div>`}
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Volunteer Attendance — Team Decision Support</div></div>
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll">
        <table class="custom-table">
          <thead><tr><th>Volunteer</th><th>Sessions</th><th>Present</th><th>Absent</th><th>Attendance</th><th>Assessment</th><th>Action</th></tr></thead>
          <tbody>
            ${rows.map(({x,s}) => {
              const g = x.status === 'inactive' ? { label:'Inactive', cls:'badge-cancelled' } : attendanceGrade(s.rate, s.sessions);
              return `<tr>
                <td>
                  <div class="mg-name-cell">
                    <span class="mg-avatar">${esc((x.firstName[0]||'')+(x.lastName[0]||''))}</span>
                    <div><strong>${esc(memberName(x))}</strong><div class="mg-muted-xs">${esc(x.role || 'Volunteer')}</div></div>
                  </div>
                </td>
                <td>${s.sessions}</td>
                <td>${s.present}</td>
                <td>${s.absent}</td>
                <td>
                  <div class="mg-bar"><i style="width:${Math.max(s.rate,2)}%;background:${m.color}"></i></div>
                  <span class="mg-muted-xs">${s.rate}%</span>
                </td>
                <td><span class="badge ${g.cls}">${g.label}</span></td>
                <td><button class="btn btn-outline mg-btn-xs" onclick="openMemberProfile('${x.id}')">Profile</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="mg-advice">
    <strong>Lead guidance:</strong> attendance figures are indicators, not automatic actions. Review “Needs Attention” volunteers before deciding whether the team needs additional volunteers, replacements, or a size adjustment. No volunteer is removed automatically.
  </div>`;
}

function changeReportMonth(val) {
  MG.reportMonth = val;
  const [y,mo] = val.split('-').map(Number);
  MG.calendarYear = y; MG.calendarMonth = mo - 1;
  renderManagement();
}

/* ------------------------------------------------------------
   PANE: PUBLIC VOLUNTEERING PAGE (Lead + Admin)
   ------------------------------------------------------------ */
function panePublic(m) {
  const cfg = publicPageOf(m.id);
  const link = publicPageLink(m.id);
  const allUpcoming = sessionsOf(m.id).filter(v => sessionStatus(v) !== 'completed');
  const order = { pending:0, approved:1, declined:2 };
  const signups = signupsOf(m.id).slice()
    .sort((a,b) => (order[a.status] - order[b.status]) || String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const pending = pendingSignupsOf(m.id).length;
  const openCount = allUpcoming.filter(v => v.publicOpen === true).length;

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">Public Volunteering Page</h2>
      <p class="mg-page-sub">A no-login page where devotees sign up for a slot and date you publish</p>
    </div>
    <label class="mg-switch">
      <input type="checkbox" ${cfg.enabled ? 'checked' : ''} onchange="togglePublicPage('${m.id}', this.checked)">
      <span class="mg-switch-track"><span class="mg-switch-thumb"></span></span>
      <span class="mg-switch-label">${cfg.enabled ? 'Active' : 'Inactive'}</span>
    </label>
  </div>

  <div class="stats-grid">
    ${kpiCard('Page Status', cfg.enabled ? 'Live' : 'Off', cfg.enabled ? 'Publicly reachable' : 'Link shows “not available”', '🌐')}
    ${kpiCard('Open Slots', openCount, `of ${allUpcoming.length} upcoming session(s)`, '🗓️')}
    ${kpiCard('Pending Sign-ups', pending, 'Awaiting your review', '📨')}
    ${kpiCard('Total Sign-ups', signups.length, `${signups.filter(s => s.status === 'approved').length} approved`, '🙋')}
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Share & Publish</div></div>
    <div class="card-body">
      ${cfg.enabled ? `
        <div class="mg-note-box mg-ok-box">🌐 <strong>The public page is live.</strong> Share this link on WhatsApp, notice boards or the temple website.</div>
        <div class="mg-public-link">
          <input class="form-input" id="mgPublicLinkField" readonly value="${esc(link)}" onclick="this.select()">
          <button class="btn btn-outline" type="button" onclick="copyText(document.getElementById('mgPublicLinkField').value,'Public link copied.')">Copy Link</button>
          <button class="btn btn-primary" type="button" onclick="window.open('${jsq(link)}','_blank','noopener')">Open / Preview</button>
        </div>
      ` : `
        <div class="mg-note-box mg-warn">This page is <strong>inactive</strong>. Turn on the switch above to publish it. While inactive the link shows a “registration not open” message.</div>
      `}

      <form class="mg-mt" onsubmit="savePublicPage(event,'${m.id}')">
        <div class="form-group">
          <label class="form-label" for="mgPubIntro">Welcome message / instructions shown to the public</label>
          <textarea class="form-input mg-textarea" id="mgPubIntro" rows="3" placeholder="Tell devotees what this seva involves and what to expect.">${esc(cfg.intro || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="mgPubContact">Contact number shown on the page</label>
          <input class="form-input" id="mgPubContact" value="${esc(cfg.contact || '')}" placeholder="10-digit mobile" maxlength="10">
        </div>
        <button class="btn btn-primary" type="submit">Save Page Details</button>
      </form>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">Slots open for public sign-up</div>
      <button class="btn btn-primary mg-btn-xs" onclick="openScheduleSession('${m.id}')">+ Schedule Volunteering</button>
    </div>
    <div class="card-body" style="padding:0;">
      ${allUpcoming.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <thead><tr><th>Session</th><th>Date</th><th>Time</th><th>Location</th><th>Public sign-ups</th><th>Open to public</th></tr></thead>
        <tbody>${allUpcoming.map(v => `
          <tr>
            <td><strong>${esc(v.title)}</strong></td>
            <td>${fmtDate(v.date)}</td>
            <td>${fmtTime(v.startTime)} – ${fmtTime(v.endTime)}</td>
            <td>${esc(v.location || '—')}</td>
            <td>${signupsForSession(v.id).length}</td>
            <td>
              <label class="mg-switch mg-switch-sm">
                <input type="checkbox" ${v.publicOpen === true ? 'checked' : ''} onchange="toggleSessionPublic('${v.id}', this.checked)">
                <span class="mg-switch-track"><span class="mg-switch-thumb"></span></span>
              </label>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="mg-pad-note">No upcoming sessions. Use “Schedule Volunteering” to publish a date and time first.</div>`}
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">Public Sign-ups</div>
      <span class="mg-muted-xs">${pending} pending review</span>
    </div>
    <div class="card-body" style="padding:0;">
      ${signups.length ? `<div class="mg-table-scroll"><table class="custom-table" style="min-width:880px;">
        <thead><tr><th>Name</th><th>Mobile</th><th>City</th><th>Slot</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${signups.map(s => {
          const v = sessionById(s.volunteeringId);
          const cls = s.status === 'approved' ? 'badge-confirmed' : s.status === 'declined' ? 'badge-cancelled' : 'badge-pending';
          return `<tr>
            <td><strong>${esc(s.name)}</strong>${s.note ? `<div class="mg-muted-xs">${esc(s.note)}</div>` : ''}</td>
            <td>${esc(s.mobile)}</td>
            <td>${esc(s.city || '—')}</td>
            <td>${v ? `${esc(v.title)}<div class="mg-muted-xs">${fmtDate(v.date)} · ${fmtTime(v.startTime)}</div>` : '<span class="mg-muted-xs">Slot removed</span>'}</td>
            <td class="mg-muted-xs">${esc(String(s.submittedAt).replace('T',' ').slice(0,16))}</td>
            <td><span class="badge ${cls}">${esc(s.status[0].toUpperCase() + s.status.slice(1))}</span></td>
            <td>
              ${s.status === 'pending' ? `<div class="flex gap-1">
                <button class="btn btn-outline mg-btn-xs" onclick="approvePublicSignup('${s.id}')">Approve</button>
                <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="declinePublicSignup('${s.id}')">Decline</button>
              </div>` : `<a class="btn btn-outline mg-btn-xs" href="https://wa.me/91${esc(s.mobile)}" target="_blank" rel="noopener">💬 WhatsApp</a>`}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="mg-pad-note">No public sign-ups yet. Share the link once the page is active.</div>`}
    </div>
  </div>

  <div class="mg-advice mg-mt-sm">
    Approving a sign-up adds the person as a Volunteer (reusing the devotee record if the mobile already exists) and assigns them to the chosen session. Nothing is added to your team until you approve it.
  </div>`;
}

function mgPubSync(mgmtId) {
  const m = mgmtById(mgmtId);
  const cfg = publicPageOf(mgmtId);
  if (!m || !window.API || !window.API.online) return;
  window.API.put('/teams/' + (m.code || m.id) + '/public-page', {
    enabled: !!cfg.enabled, intro: cfg.intro || '', contact: cfg.contact || ''
  }).catch(function () {});
}
function togglePublicPage(mgmtId, on) {
  const cfg = publicPageOf(mgmtId);
  cfg.enabled = !!on;
  logActivity(mgmtId, `Public volunteering page ${on ? 'activated' : 'turned off'}`);
  mgToast(on ? 'Public page is now live.' : 'Public page turned off.');
  renderManagement();
  mgPubSync(mgmtId);
}

function savePublicPage(e, mgmtId) {
  e.preventDefault();
  const cfg = publicPageOf(mgmtId);
  cfg.intro = document.getElementById('mgPubIntro').value.trim();
  cfg.contact = document.getElementById('mgPubContact').value.replace(/\D/g, '').slice(0, 10);
  logActivity(mgmtId, 'Public page details updated');
  mgToast('Public page details saved.');
  renderManagement();
  mgPubSync(mgmtId);
}

function toggleSessionPublic(volId, on) {
  const v = sessionById(volId);
  if (!v) return;
  v.publicOpen = !!on;
  logActivity(v.managementId, `"${v.title}" ${on ? 'opened for' : 'closed to'} public sign-up`);
  renderManagement();
  const m = mgmtById(v.managementId);
  if (window.API && window.API.online && m && !v.code) {
    window.API.patch('/teams/' + (m.code || m.id) + '/sessions/' + (v.code || v.id), { publicOpen: !!on }).catch(function () {});
  }
}

function approvePublicSignup(id) {
  const s = MG.publicSignups.find(x => x.id === id);
  if (!s) return;
  const m = mgmtById(s.managementId);
  if (!m) return;
  const v = sessionById(s.volunteeringId);

  openConfirm({
    title: 'Approve Volunteer Sign-up',
    body: `<p>Add <strong>${esc(s.name)}</strong> (${esc(s.mobile)}) to <strong>${esc(m.name)}</strong>${v ? ` and assign them to <strong>${esc(v.title)}</strong> on ${fmtDate(v.date)}` : ''}?</p>
           <p class="mg-muted-xs mg-mt-sm">Creates a team member, or reuses the existing devotee record if this mobile is already known.</p>`,
    confirmLabel: 'Approve & Add',
    onConfirm: () => {
      s.status = 'approved';
      logActivity(m.id, `${s.name} approved from public sign-up${v ? ` for ${v.title}` : ''}`);
      mgToast(`${s.name} added to ${m.name}.`);
      renderManagement();
      // the server creates/reuses the devotee + team member and links the session
      if (window.API && window.API.online && !!s.code) {
        window.API.post('/teams/' + (m.code || m.id) + '/signups/' + (s.code || s.id) + '/approve')
          .then(function () { return window.__rehydrate && window.__rehydrate('teams'); })
          .catch(function (err) { mgToast((err && err.message) || 'Approve failed to sync'); });
      }
    }
  });
}

function declinePublicSignup(id) {
  const s = MG.publicSignups.find(x => x.id === id);
  if (!s) return;
  s.status = 'declined';
  logActivity(s.managementId, `Public sign-up from ${s.name} declined`);
  mgToast('Sign-up declined.');
  renderManagement();
  const m = mgmtById(s.managementId);
  if (window.API && window.API.online && m && !!s.code) {
    window.API.post('/teams/' + (m.code || m.id) + '/signups/' + (s.code || s.id) + '/decline').catch(function () {});
  }
}

/* ------------------------------------------------------------
   PANE: BADGES
   ------------------------------------------------------------ */
function paneBadges(m) {
  /* Badges are only issued to active volunteers — deactivated members keep
     their attendance history but must not carry a valid temple badge. */
  const team = activeMembersOf(m.id);
  const inactiveCount = membersOf(m.id).length - team.length;
  const lead = leadById(m.leadId);

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">Team Badges</h2>
      <p class="mg-page-sub">Mandala identity badges in the ${esc(m.name)} team colour</p>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-outline" onclick="previewLeadBadge('${m.id}')">My / Lead Badge</button>
      <button class="btn btn-outline" onclick="selectAllBadges(true)">Select All</button>
      <button class="btn btn-outline" onclick="selectAllBadges(false)">Clear</button>
      <button class="btn btn-primary" onclick="generateSelectedBadges('${m.id}')">Generate PDF / Print</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">Lead Badge</div></div>
    <div class="card-body">
      <div class="mg-badge-row">
        ${badgeMarkup(m, {
          id: 'LEAD', firstName: (lead?.name || 'Lead').split(' ')[0],
          lastName: (lead?.name || '').split(' ').slice(1).join(' '),
          role: 'Management Lead', mobile: lead?.mobile || '', status: 'active'
        }, true)}
        <div class="mg-badge-side">
          <p><strong>${esc(lead?.name || 'Unassigned')}</strong> is the Management Lead for ${esc(m.name)}.</p>
          <p class="mg-muted-xs">Team Members: ${membersOf(m.id).length} · Active: ${team.length}</p>
          <button class="btn btn-secondary mg-mt-sm" onclick="previewLeadBadge('${m.id}')">Preview / Print Lead Badge</button>
        </div>
      </div>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">Volunteer Badges</div>
      <span class="mg-muted-xs" id="mgBadgeCount">${MG.badgeSelection.length} selected</span>
    </div>
    <div class="card-body">
      ${inactiveCount ? `<div class="mg-note-box mg-mb-sm">${inactiveCount} deactivated volunteer(s) are hidden here — badges are issued to active volunteers only.</div>` : ''}
      ${team.length ? `<div class="mg-badge-grid">
        ${team.map(x => `
          <div class="mg-badge-pick">
            <label class="mg-check">
              <input type="checkbox" ${MG.badgeSelection.includes(x.id) ? 'checked' : ''} onchange="toggleBadgePick('${x.id}', this.checked)">
              <span>${esc(memberName(x))}</span>
            </label>
            ${badgeMarkup(m, x, false)}
            <div class="flex gap-1 mg-mt-sm">
              <button class="btn btn-outline mg-btn-xs" onclick="previewBadge('${x.id}')">View</button>
              <button class="btn btn-outline mg-btn-xs" onclick="printSingleBadge('${x.id}')">Print</button>
            </div>
          </div>`).join('')}
      </div>` : `<div class="mg-pad-note">Add volunteers to generate badges.</div>`}
    </div>
  </div>`;
}

function badgeEmblemImg() {
  const src = (typeof assetURL === 'function') ? assetURL('assets/icon.png') : 'assets/icon.png';
  return `<img class="mg-badge-emblem-img" src="${src}" alt=""
    onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('span'),{className:'mg-badge-emblem-fb',textContent:'🛕'}))">`;
}

function badgeMarkup(m, x, isLead) {
  const code = isLead ? `${mgmtCode(m)}-LEAD` : badgeCode(m, x);
  const name = `${x.firstName || ''} ${x.lastName || ''}`.trim();
  const initials = ((x.firstName || ' ')[0] + (x.lastName || ' ')[0]).trim().toUpperCase() || 'MV';
  const active = (x.status || 'active') === 'active';
  const role = isLead ? window.t('mg_lead', 'Management Lead') : (x.role || window.t('mg_volunteer', 'Volunteer'));
  return `
  <div class="mg-badge" style="--c:${m.color}">
    <span class="mg-badge-corner c-tl"></span><span class="mg-badge-corner c-tr"></span>
    <span class="mg-badge-corner c-bl"></span><span class="mg-badge-corner c-br"></span>
    <img class="mg-badge-hero" src="${(typeof assetURL === 'function') ? assetURL('assets/temple.png') : 'assets/temple.png'}" alt="" aria-hidden="true" onerror="this.style.display='none'">
    <div class="mg-badge-inner">
      <div class="mg-badge-head">
        ${badgeEmblemImg()}
        <div class="mg-badge-htext">
          <strong>${esc(window.t('temple_name', 'Shri Vihat Meldi Mata Mandir'))}</strong>
          <span>${esc(window.t('temple_loc', 'Sanand, Gujarat'))}</span>
        </div>
      </div>
      <div class="mg-badge-band">${esc(m.name.toUpperCase())}</div>
      <div class="mg-badge-photo">${esc(initials)}</div>
      <div class="mg-badge-name">${esc(name || '—')}</div>
      <div class="mg-badge-role">${esc(role)}</div>
      <div class="mg-badge-foot">
        <div class="mg-badge-qr"><svg viewBox="0 0 21 21" aria-hidden="true">${qrCells(code)}</svg></div>
        <div class="mg-badge-ids">
          <div>${window.t('mg_id', 'ID')}: <strong>${esc(code)}</strong></div>
          <div>${esc(m.id)} · ${esc(leadName(m.id))}</div>
          <div><span class="mg-badge-dot ${active ? 'on' : 'off'}"></span>${esc(active ? window.t('active', 'Active') : window.t('inactive', 'Inactive'))}</div>
        </div>
      </div>
    </div>
  </div>`;
}

/** Deterministic pseudo-QR block pattern from a string (visual only). */
function qrCells(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  let out = '';
  const rnd = (n) => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h % n; };
  for (let y = 0; y < 21; y++) {
    for (let xx = 0; xx < 21; xx++) {
      const finder = (y < 7 && xx < 7) || (y < 7 && xx > 13) || (y > 13 && xx < 7);
      const on = finder
        ? !((y > 1 && y < 5 && xx > 1 && xx < 5) || (y === 1 || y === 5 || xx === 1 || xx === 5) === false)
        : rnd(100) > 52;
      if (on) out += `<rect x="${xx}" y="${y}" width="1" height="1" fill="currentColor"/>`;
    }
  }
  return out;
}

function toggleBadgePick(id, on) {
  if (on) { if (!MG.badgeSelection.includes(id)) MG.badgeSelection.push(id); }
  else MG.badgeSelection = MG.badgeSelection.filter(x => x !== id);
  const el = document.getElementById('mgBadgeCount');
  if (el) el.textContent = `${MG.badgeSelection.length} selected`;
}

function selectAllBadges(on) {
  MG.badgeSelection = on ? activeMembersOf(MG.activeMgmtId).map(x => x.id) : [];
  renderManagement();
}

function previewBadge(memberId) {
  const x = memberById(memberId);
  if (!x) return;
  const m = mgmtById(x.managementId);
  openSheet({
    title: `Badge — ${memberName(x)}`,
    body: `<div class="mg-badge-single">${badgeMarkup(m, x, false)}</div>`,
    footer: `<button class="btn btn-outline" onclick="closeSheet()">Close</button>
             <button class="btn btn-primary" onclick="printSingleBadge('${memberId}')">Print / Save PDF</button>`
  });
}

function previewLeadBadge(mgmtId) {
  const m = mgmtById(mgmtId);
  const lead = leadById(m.leadId);
  const pseudo = {
    id:'LEAD', firstName:(lead?.name || 'Lead').split(' ')[0],
    lastName:(lead?.name || '').split(' ').slice(1).join(' '),
    role:'Management Lead', mobile: lead?.mobile || '', status:'active'
  };
  openSheet({
    title: `Lead Badge — ${lead?.name || 'Unassigned'}`,
    body: `<div class="mg-badge-single">${badgeMarkup(m, pseudo, true)}</div>`,
    footer: `<button class="btn btn-outline" onclick="closeSheet()">Close</button>
             <button class="btn btn-primary" onclick="printBadgeHTML(document.querySelector('#mgSheetBody .mg-badge-single').innerHTML)">Print / Save PDF</button>`
  });
}

function printSingleBadge(memberId) {
  const x = memberById(memberId);
  if (!x) return;
  printBadgeHTML(badgeMarkup(mgmtById(x.managementId), x, false));
}

function generateSelectedBadges(mgmtId) {
  const m = mgmtById(mgmtId);
  const roster = activeMembersOf(mgmtId);
  const picked = MG.badgeSelection.length
    ? roster.filter(x => MG.badgeSelection.includes(x.id))
    : roster;
  if (!picked.length) { mgToast('No active volunteers available to print.'); return; }
  printBadgeHTML(picked.map(x => badgeMarkup(m, x, false)).join(''));
  mgToast(`${picked.length} badge(s) sent to print.`);
}

/** Open a print window carrying the badge CSS + fonts so output is faithful. */
function printBadgeHTML(inner) {
  if (typeof openPrintDoc !== 'function') { mgToast('Print service unavailable.'); return; }
  openPrintDoc({
    title: 'Team Badges',
    wrapClass: 'mg-badge-print',
    inner: inner,
    /* NOT flex for print — a flex row that straddles a page boundary gets
       sliced (top half on page 1, nothing on page 2). Block flow with
       inline-block badges + break-inside:avoid moves each whole badge to
       the next page instead. */
    css: '.mg-badge-print{display:block;text-align:center;padding:14mm;background:#f2ece0}' +
      '.mg-badge-print .mg-badge{display:inline-block;vertical-align:top;margin:6mm}' +
      '@media print{' +
        '@page{size:A4;margin:10mm}' +
        'html,body{background:#fff}' +
        '.mg-badge-print{background:#fff;padding:0}' +
        '.mg-badge-print .mg-badge{margin:5mm 4mm;break-inside:avoid;page-break-inside:avoid;' +
          'box-shadow:none !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '}'
  });
}

/* ------------------------------------------------------------
   PANE: WHATSAPP
   ------------------------------------------------------------ */
function paneWhatsApp(m) {
  const c = commById(m.id) || { groupName:'', groupLink:'', broadcastName:'', broadcastLink:'' };
  const drafts = draftsOf(m.id);

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">WhatsApp Communication</h2>
      <p class="mg-page-sub">Group, broadcast and reusable message drafts for ${esc(m.name)}</p>
    </div>
    <button class="btn btn-primary" onclick="openDraftEditor('${m.id}')">+ New Message Draft</button>
  </div>

  <div class="dashboard-2col">
    <div class="card">
      <div class="card-header"><div class="card-title">💬 WhatsApp Group</div></div>
      <div class="card-body">
        <form id="mgGroupForm" onsubmit="saveCommunication(event,'${m.id}','group')">
          <div class="form-group">
            <label class="form-label" for="mgGroupName">Group Name *</label>
            <input class="form-input" id="mgGroupName" value="${esc(c.groupName)}" placeholder="Group name exactly as saved in WhatsApp" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="mgGroupLink">Group Invite Link *</label>
            <input class="form-input" id="mgGroupLink" type="url" value="${esc(c.groupLink)}" placeholder="https://chat.whatsapp.com/..." required>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-primary" type="submit">Save Group</button>
            <button class="btn btn-outline" type="button" onclick="openWhatsAppLink('${jsq(c.groupLink)}')">Open WhatsApp Group</button>
          </div>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">📢 Broadcast</div></div>
      <div class="card-body">
        <form id="mgBroadcastForm" onsubmit="saveCommunication(event,'${m.id}','broadcast')">
          <div class="form-group">
            <label class="form-label" for="mgBroadcastName">Broadcast Name *</label>
            <input class="form-input" id="mgBroadcastName" value="${esc(c.broadcastName)}" placeholder="Broadcast list name as saved in WhatsApp" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="mgBroadcastLink">Broadcast Link *</label>
            <input class="form-input" id="mgBroadcastLink" type="url" value="${esc(c.broadcastLink)}" placeholder="https://wa.me/91..." required>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-primary" type="submit">Save Broadcast</button>
            <button class="btn btn-outline" type="button" onclick="openWhatsAppLink('${jsq(c.broadcastLink)}')">Open Broadcast</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">Message Drafts</div>
      <button class="btn btn-outline mg-btn-xs" onclick="openDraftEditor('${m.id}')">+ New Draft</button>
    </div>
    <div class="card-body">
      ${drafts.length ? `<div class="mg-draft-grid">
        ${drafts.map(d => `
          <div class="mg-draft">
            <div class="mg-draft-head">
              <strong>${esc(d.title)}</strong>
              <span class="mg-muted-xs">Updated ${fmtDate(d.updatedAt)}</span>
            </div>
            <pre class="mg-draft-body">${esc(d.message)}</pre>
            <div class="flex gap-1 mg-draft-actions">
              <button class="btn btn-outline mg-btn-xs" onclick="openDraftEditor('${m.id}','${d.id}')">Edit</button>
              <button class="btn btn-outline mg-btn-xs" onclick="duplicateDraft('${d.id}')">Duplicate</button>
              <button class="btn btn-outline mg-btn-xs" onclick="copyDraft('${d.id}')">Copy</button>
              <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeleteDraft('${d.id}')">Delete</button>
              <button class="btn btn-secondary mg-btn-xs" onclick="openSendDraft('${d.id}')">Send</button>
            </div>
          </div>`).join('')}
      </div>` : `<div class="mg-pad-note">No message drafts yet. Create one to reuse for reminders.</div>`}
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Direct Volunteer Contact</div></div>
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll">
        <table class="custom-table">
          <thead><tr><th>Volunteer</th><th>Mobile</th><th>Status</th><th>Contact</th></tr></thead>
          <tbody>
            ${membersOf(m.id).map(x => `
              <tr>
                <td><strong>${esc(memberName(x))}</strong></td>
                <td>${esc(x.mobile)}</td>
                <td><span class="badge ${x.status==='active'?'badge-confirmed':'badge-cancelled'}">${x.status==='active'?'Active':'Inactive'}</span></td>
                <td>
                  <div class="flex gap-1">
                    <a class="btn btn-outline mg-btn-xs" href="tel:${esc(x.mobile)}">📞 Call</a>
                    <a class="btn btn-outline mg-btn-xs" href="https://wa.me/91${esc(x.mobile)}" target="_blank" rel="noopener">💬 WhatsApp</a>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function saveCommunication(e, mgmtId, which) {
  e.preventDefault();
  let c = commById(mgmtId);
  if (!c) { c = { managementId: mgmtId, groupName:'', groupLink:'', broadcastName:'', broadcastLink:'' }; MG.communication.push(c); }

  if (which === 'group') {
    c.groupName = document.getElementById('mgGroupName').value.trim();
    c.groupLink = document.getElementById('mgGroupLink').value.trim();
    logActivity(mgmtId, `WhatsApp group updated to "${c.groupName}"`);
    mgToast('WhatsApp group saved.');
  } else {
    c.broadcastName = document.getElementById('mgBroadcastName').value.trim();
    c.broadcastLink = document.getElementById('mgBroadcastLink').value.trim();
    logActivity(mgmtId, `WhatsApp broadcast updated to "${c.broadcastName}"`);
    mgToast('Broadcast saved.');
  }
  renderManagement();
  if (window.API && window.API.online) {
    const m = mgmtById(mgmtId);
    const code = m && (m.code || m.id);
    if (code) window.API.put('/teams/' + code + '/communication', {
      groupName: c.groupName, groupLink: c.groupLink, broadcastName: c.broadcastName, broadcastLink: c.broadcastLink
    }).catch(function () {});
  }
}

function openWhatsAppLink(link) {
  if (!link) { mgToast('No link saved yet. Add and save a link first.'); return; }
  window.open(link, '_blank', 'noopener');
}

/* ------------------------------------------------------------
   PANE: SETTINGS
   ------------------------------------------------------------ */
function paneSettings(m) {
  const team = membersOf(m.id).length;
  const lockLead = !isAdmin();
  const leadName = (typeof personById === 'function' && personById(m.leadId) || {}).name
    || (typeof leadById === 'function' && leadById(m.leadId) || {}).name || m.leadId || '—';
  const leadCell = !lockLead && typeof devoteeLinkField === 'function'
    ? devoteeLinkField({ selId: 'setMgLead', label: 'Management Lead', required: true, selectedId: m.leadId, selectedLabel: leadName })
    : `<div class="form-group"><label class="form-label">Management Lead *</label>` +
      `<input class="form-input" value="${esc(leadName)}" disabled><input type="hidden" id="setMgLead" value="${esc(m.leadId || '')}">` +
      `<div class="mg-muted-xs">Only an administrator can change the Lead.</div></div>`;

  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">Management Settings</h2>
      <p class="mg-page-sub">${isAdmin() ? 'Full settings including Lead assignment' : 'Leads can update team details. Lead assignment is admin-only.'}</p>
    </div>
  </div>

  <div class="card">
    <div class="card-body">
      <form id="mgSettingsForm" onsubmit="saveManagementSettings(event,'${m.id}')">
        <div class="form-group">
          <label class="form-label" for="setMgName">Management Name *</label>
          <input class="form-input" id="setMgName" value="${esc(m.name)}" required>
        </div>

        <div class="grid mg-2col-form">
          ${leadCell}
          <div class="form-group">
            <label class="form-label" for="setMgSize">Expected Team Size *</label>
            <input class="form-input" id="setMgSize" type="number" min="1" value="${m.expectedTeamSize}" required>
            <div class="mg-muted-xs">Current team members: <strong>${team}</strong> (calculated automatically)</div>
          </div>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="setMgStatus">Status *</label>
            <select class="form-select" id="setMgStatus" required>
              <option value="active" ${m.status==='active'?'selected':''}>Active</option>
              <option value="inactive" ${m.status==='inactive'?'selected':''}>Inactive</option>
            </select>
          </div>        </div>

        <div class="form-group">
          <label class="form-label" for="setMgDesc">Description *</label>
          <textarea class="form-input mg-textarea" id="setMgDesc" rows="3" required>${esc(m.description)}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="setMgNotes">Additional Notes</label>
          <textarea class="form-input mg-textarea" id="setMgNotes" rows="2">${esc(m.notes || '')}</textarea>
        </div>

        <div class="flex gap-2">
          <button class="btn btn-primary" type="submit">Save Settings</button>
          ${isAdmin() ? `<button class="btn btn-outline mg-btn-danger" type="button" onclick="confirmDeleteManagement('${m.id}')">Delete Management</button>` : ''}
        </div>
      </form>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">Permissions ${isAdmin() ? '' : '(read-only)'}</div></div>
    <div class="card-body">
      <div class="mg-perm-grid">
        <div class="mg-perm">
          <h4>Super Admin / Admin</h4>
          <ul>
            <li>✓ Create, edit and delete Management</li>
            <li>✓ Assign or change the Management Lead</li>
            <li>✓ View all Managements and teams</li>
            <li>✓ View schedules, attendance and badges</li>
            <li>✓ View activity log and reports</li>
          </ul>
        </div>
        <div class="mg-perm">
          <h4>Management Lead</h4>
          <ul>
            <li>✓ Open only assigned Management Apps</li>
            <li>✓ Add, edit and deactivate volunteers</li>
            <li>✓ Schedule volunteering and mark attendance</li>
            <li>✓ View monthly attendance and generate badges</li>
            <li>✓ Manage WhatsApp group, broadcast and drafts</li>
            <li>✗ Cannot open other Managements or admin modules</li>
            <li>✗ Cannot change another Management's Lead</li>
          </ul>
        </div>
      </div>
      <div class="mg-advice mg-mt-sm">
        Management Tasks (assignment, priority, deadlines and task reports) are planned as a later phase. This foundation is deliberately generic so each Management type can receive its own task set without rework.
      </div>
    </div>
  </div>`;
}

function saveManagementSettings(e, mgmtId) {
  e.preventDefault();
  const m = mgmtById(mgmtId);
  if (!m) return;

  const name = document.getElementById('setMgName').value.trim();
  const size = parseInt(document.getElementById('setMgSize').value, 10);
  const desc = document.getElementById('setMgDesc').value.trim();
  if (!name || !desc || !size || size < 1) { mgToast('Please complete all required fields.'); return; }

  m.name = name;
  m.expectedTeamSize = size;
  m.description = desc;
  m.status = document.getElementById('setMgStatus').value;
  m.notes = document.getElementById('setMgNotes').value.trim();
  const prevLead = m.leadId;
  if (isAdmin()) m.leadId = document.getElementById('setMgLead').value;

  logActivity(m.id, `Management settings updated by ${MG.session.userName}`);
  mgToast('Management settings saved.');
  renderManagement();
  if (window.API && window.API.online) {
    const code = m.code || m.id;
    window.API.patch('/teams/' + code, { name: m.name, description: m.description, expectedTeamSize: m.expectedTeamSize, status: m.status, notes: m.notes })
      .then(function () { return (m.leadId && m.leadId !== prevLead) ? window.API.post('/teams/' + code + '/lead', { devoteeId: m.leadId }) : null; })
      .then(function () { return window.__rehydrate && window.__rehydrate('teams'); })
      .catch(function (err) { mgToast((err && err.message) || 'Saved locally — sync failed'); });
  }
}

/* ------------------------------------------------------------
   PANE: ACTIVITY (admin)
   ------------------------------------------------------------ */
function paneActivity(m) {
  const list = activityOf(m.id);
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div>
      <h2 class="mg-pane-title">Activity Log</h2>
      <p class="mg-page-sub">Audit trail for ${esc(m.name)} — visible to administrators</p>
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
   EXPORTS
   ------------------------------------------------------------ */
/* downloadCSV lives in export.js (loaded first). Fallback kept only in
   case that file is ever removed. */
if (typeof window.downloadCSV !== 'function') {
  window.downloadCSV = function (filename, rows) {
    const csv = rows.map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    if (typeof mgToast === 'function') mgToast(`${filename} exported.`);
  };
}

function managementExport() {
  return {
    filename: 'management-directory',
    title: (typeof t === 'function' ? t('nav_management_s', 'Management Apps') : 'Management Apps'),
    subtitle: 'Volunteer teams, leads and attendance',
    columns: ['Management ID', 'Name', 'Lead', 'Team Members', 'Expected Size', 'Status', 'Attendance Rate', 'Next Volunteering'],
    rows: visibleManagements().map(m => {
      const nx = nextSessionOf(m.id);
      return [m.id, m.name, leadName(m.id), membersOf(m.id).length, m.expectedTeamSize,
        m.status, mgmtMonthStats(m.id, MG.reportMonth).rate + '%',
        nx ? `${fmtDate(nx.date)} ${fmtTime(nx.startTime)}` : ''];
    })
  };
}
if (typeof registerExport === 'function') registerExport('mod-management', managementExport);
function exportManagementCSV() { if (typeof runExport === 'function') runExport('mod-management', 'csv'); }

function attendanceExport() {
  const m = mgmtById(MG.activeMgmtId);
  if (!m) return { filename: 'attendance', title: 'Attendance', columns: [], rows: [] };
  return {
    filename: `${m.name.replace(/\s+/g, '-').toLowerCase()}-${MG.reportMonth}-attendance`,
    title: `${m.name} — Attendance`,
    subtitle: `Month ${MG.reportMonth}`,
    columns: ['Volunteer', 'Role', 'Status', 'Sessions', 'Present', 'Absent', 'Attendance %', 'Assessment'],
    rows: membersOf(m.id).map(x => {
      const s = memberStats(x.id, MG.reportMonth);
      return [memberName(x), x.role || 'Volunteer', x.status, s.sessions, s.present, s.absent, s.rate,
        attendanceGrade(s.rate, s.sessions).label];
    })
  };
}
if (typeof registerExport === 'function') registerExport('mod-attendance', attendanceExport);
function exportAttendanceCSV() { if (typeof runExport === 'function') runExport('mod-attendance', 'csv'); }

/* ============================================================
   PUBLIC VOLUNTEERING PAGE  (no login — shareable link)
   Route:  <file>#/volunteer/<MGMT-ID>   (or ?volunteer=<MGMT-ID>)
   Renders full-screen into #publicVolunteerRoot and hides the
   authenticated platform shell.
   ============================================================ */
function publicRouteId() {
  const mm = String(location.hash || '').match(/^#\/volunteer\/([A-Za-z0-9_-]+)/);
  if (mm) return decodeURIComponent(mm[1]);
  try { return new URLSearchParams(location.search).get('volunteer'); }
  catch (e) { return null; }
}

/** Called on load and on hashchange. Returns true when the public page is shown. */
function renderPublicRouter() {
  const root = document.getElementById('publicVolunteerRoot');
  const app = document.getElementById('app');
  if (!root) return false;

  const id = publicRouteId();
  if (!id) {
    root.style.display = 'none';
    root.innerHTML = '';
    if (app) app.style.display = '';
    document.body.classList.remove('public-mode');
    return false;
  }

  if (app) app.style.display = 'none';
  document.body.classList.add('public-mode');
  root.style.display = 'block';
  root.innerHTML = renderPublicVolunteer(id);
  window.scrollTo(0, 0);
  return true;
}

function renderPublicVolunteer(mgmtId) {
  const m = mgmtById(mgmtId);
  const cfg = m ? publicPageOf(m.id) : null;

  const shell = inner => `
    <div class="pub-wrap">
      <div class="pub-card">
        <div class="pub-head" style="--c:${m ? m.color : '#6B1F2A'}">
          <div class="pub-emblem">🪔</div>
          <div class="pub-temple">Shri Vihat Meldi Mata Mandir</div>
          <div class="pub-temple-sub">Sanand, Gujarat</div>
        </div>
        ${inner}
        <div class="pub-foot">Jai Shri Vihat Meldi Mataji 🙏 · Official public volunteering registration page</div>
      </div>
    </div>`;

  if (!m || !cfg || !cfg.enabled) {
    return shell(`
      <div class="pub-body">
        <div class="pub-inactive">
          <h2>Volunteering registration is not open right now</h2>
          <p>This page is currently inactive. Please check with the temple office or try again later.</p>
        </div>
      </div>`);
  }

  const slots = publicSessionsOf(m.id);

  return shell(`
    <div class="pub-body">
      <h1 class="pub-title">${esc(m.name)} — Volunteer Sign-up</h1>
      ${cfg.intro ? `<p class="pub-intro">${esc(cfg.intro)}</p>` : ''}

      <div id="pubFormArea">
        ${slots.length ? `
        <form onsubmit="submitPublicSignup(event,'${m.id}')">
          <div class="pub-field">
            <label>Select a volunteering slot *</label>
            <div class="pub-slots">
              ${slots.map((v, i) => `
                <label class="pub-slot">
                  <input type="radio" name="pubSlot" value="${v.id}" ${i === 0 ? 'checked' : ''}>
                  <span class="pub-slot-body">
                    <strong>${esc(v.title)}</strong>
                    <span class="pub-slot-meta">📅 ${fmtDate(v.date)}</span>
                    <span class="pub-slot-meta">🕒 ${fmtTime(v.startTime)} – ${fmtTime(v.endTime)}</span>
                    ${v.location ? `<span class="pub-slot-meta">📍 ${esc(v.location)}</span>` : ''}
                  </span>
                </label>`).join('')}
            </div>
          </div>

          <div class="pub-grid">
            <div class="pub-field">
              <label for="pubName">Full name *</label>
              <input id="pubName" class="pub-input" required placeholder="Your name">
            </div>
            <div class="pub-field">
              <label for="pubMobile">Mobile number *</label>
              <input id="pubMobile" class="pub-input" required inputmode="numeric" maxlength="10" placeholder="10-digit mobile">
            </div>
          </div>
          <div class="pub-field">
            <label for="pubCity">City / Village</label>
            <input id="pubCity" class="pub-input" placeholder="Where you are coming from">
          </div>
          <div class="pub-field">
            <label for="pubNote">Anything the team should know?</label>
            <textarea id="pubNote" class="pub-input" rows="2" placeholder="Optional"></textarea>
          </div>

          <button class="pub-submit" type="submit">Submit Volunteering Details</button>
          <p class="pub-help">The team lead will confirm your slot on WhatsApp${cfg.contact ? ` — ${esc(cfg.contact)}` : ''}.</p>
        </form>` : `
        <div class="pub-inactive">
          <h2>No open slots at the moment</h2>
          <p>Volunteering dates have not been published yet. Please check back soon.</p>
        </div>`}
      </div>
    </div>`);
}

function submitPublicSignup(e, mgmtId) {
  e.preventDefault();
  if (!isPublicEnabled(mgmtId)) return;

  const slot = document.querySelector('input[name="pubSlot"]:checked');
  const name = document.getElementById('pubName').value.trim();
  const mobile = document.getElementById('pubMobile').value.replace(/\D/g, '');
  const city = document.getElementById('pubCity').value.trim();
  const note = document.getElementById('pubNote').value.trim();

  if (!slot) { alert('Please select a volunteering slot.'); return; }
  if (!name) { alert('Please enter your name.'); return; }
  if (!/^[0-9]{10}$/.test(mobile)) { alert('Please enter a valid 10-digit mobile number.'); return; }

  const id = nextId('PUB', MG.publicSignups, 3);
  MG.publicSignups.push({
    id, managementId: mgmtId, volunteeringId: slot.value,
    name, mobile, city, note,
    submittedAt: `${MG.today}T${MG.nowTime}:00`, status: 'pending'
  });
  logActivity(mgmtId, `New public volunteering sign-up from ${name}`);

  const v = sessionById(slot.value);
  document.getElementById('pubFormArea').innerHTML = `
    <div class="pub-success">
      <div class="pub-success-tick">✓</div>
      <h2>Jai Mataji 🙏 Your details are received</h2>
      <p>Thank you, <strong>${esc(name)}</strong>. You have registered for
        ${v ? `<strong>${esc(v.title)}</strong> on <strong>${fmtDate(v.date)}</strong> at <strong>${fmtTime(v.startTime)}</strong>` : 'the selected slot'}.</p>
      <p class="pub-help">The team lead will call or WhatsApp you on <strong>${esc(mobile)}</strong> to confirm.</p>
    </div>`;
}
