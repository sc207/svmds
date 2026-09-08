/* ============================================================
   COMMITTEE / SAMAJ — RENDER & INTERACTION LAYER
   Depends on committee.js. Reuses management/pooja globals.
   ============================================================ */

function renderCommittee() {
  const root = document.getElementById('committeeRoot');
  if (!root) return;
  if (CMT.view === 'workspace' && CMT.activeCmtId && canOpenCmt(CMT.activeCmtId)) {
    root.innerHTML = viewCmtWorkspace();
  } else {
    CMT.view = 'directory';
    root.innerHTML = viewCmtDirectory();
  }
  applyCmtRoleChrome();
}

function openCommittee(id) {
  if (!canOpenCmt(id)) { cmtToast(window.t('cmt_access_denied', 'Access denied.')); return; }
  CMT.activeCmtId = id; CMT.view = 'workspace'; CMT.activeTab = 'overview';
  CMT.activeMeetingId = null; CMT.activeMemberId = null;
  renderCommittee(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function backToCmtDirectory() { CMT.view = 'directory'; CMT.activeCmtId = null; CMT.activeMeetingId = null; CMT.activeMemberId = null; renderCommittee(); }
function setCmtTab(tab) { CMT.activeTab = tab; CMT.activeMeetingId = null; CMT.activeMemberId = null; renderCommittee(); }
function openCmtMemberProfile(id) { CMT.activeMemberId = id; CMT.activeMeetingId = null; renderCommittee(); }
function closeCmtMemberProfile() { CMT.activeMemberId = null; renderCommittee(); }
function openCmtMeeting(id) {
  const x = meetingById(id); if (!x) return;
  CMT.activeMeetingId = id; CMT.activeMemberId = null;
  if (CMT.activeCmtId !== x.committeeId && canOpenCmt(x.committeeId)) CMT.activeCmtId = x.committeeId;
  renderCommittee(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function closeCmtMeeting() { CMT.activeMeetingId = null; renderCommittee(); }

/* ---- role chrome ---- */
const CMT_ALLOWED_PAGES = ['committees', 'dashboard', 'calendar'];
function applyCmtRoleChrome() {
  const lead = CMT.session.role === 'leader';
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const p = el.getAttribute('data-page');
    el.style.display = (lead && CMT_ALLOWED_PAGES.indexOf(p) === -1) ? 'none' : '';
  });
  document.querySelectorAll('.mobile-nav-item[data-page]').forEach(el => {
    const p = el.getAttribute('data-page');
    el.style.display = (lead && CMT_ALLOWED_PAGES.indexOf(p) === -1) ? 'none' : '';
  });
  document.querySelectorAll('[data-admin-only]').forEach(el => { el.style.display = lead ? 'none' : ''; });
  document.querySelectorAll('.nav-group-title').forEach(g => { g.style.display = lead ? 'none' : ''; });
  const banner = document.getElementById('committeeScopeBanner');
  if (banner) {
    banner.style.display = lead ? 'flex' : 'none';
    if (lead) {
      const mine = visibleCommittees().map(c => c.name).join(', ') || '—';
      banner.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span><strong>${window.t('cmt_leader_access', 'Committee Leader access.')}</strong> ${esc(mine)}</span>`;
    }
  }
}
function setCmtSession(role, leaderId, announce) {
  const speak = announce !== false;
  if (role === 'admin') {
    CMT.session = { role:'admin', userId:'DEV-001', userName:'Administrator' };
  } else {
    const l = cmtLeadById(leaderId) || CMT.leaders[0] || { id: leaderId || '', name: 'Committee Leader' };
    CMT.session = { role:'leader', userId:l.id, userName:l.name };
    if (speak) cmtToast('Context: ' + l.name + ' (Committee Leader)');
  }
  const nameEl = document.getElementById('topbarUserName');
  if (nameEl) nameEl.textContent = CMT.session.userName;
  CMT.view = 'directory'; CMT.activeCmtId = null; CMT.activeMeetingId = null; CMT.activeMemberId = null;
  renderCommittee();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (speak && typeof switchPage === 'function') switchPage('committees');
}
function populateCmtRoleOptions() {
  const grp = document.getElementById('roleCmtGroup');
  if (!grp) return;
  const leaderIds = [...new Set(CMT.committees.map(c => c.leaderId).filter(Boolean))];
  grp.innerHTML = leaderIds.map(id => {
    const l = cmtLeadById(id);
    const owns = CMT.committees.filter(c => c.leaderId === id);
    if (!l || !owns.length) return '';
    return `<option value="cmt:${id}">${esc(l.name)} — ${esc(owns.map(c => tData ? tData(c.name) : c.name).join(', '))}</option>`;
  }).join('');
}

/* ------------------------------------------------------------
   DIRECTORY
   ------------------------------------------------------------ */
function viewCmtDirectory() {
  const list = visibleCommittees();
  const admin = isCmtAdmin();
  const totalMembers = list.reduce((n, c) => n + cmtMembersOf(c.id).length, 0);
  const monthKey = cmtToday().slice(0, 7);
  const monthMeetings = list.reduce((n, c) => n + cmtMonthStats(c.id, monthKey).meetings, 0);
  const rates = list.map(c => cmtMonthStats(c.id, monthKey).rate).filter(r => r > 0);
  const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

  return `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">🏛️ ${admin ? window.t('cmt_title', 'Committee / Samaj') : window.t('cmt_my_title', 'My Committees')}</h1>
      <p class="mg-page-sub">${admin ? window.t('cmt_sub_admin', 'Committees for the temple construction — leaders, members, meetings and attendance') : window.t('cmt_sub_lead', 'Open a committee assigned to you')}</p>
    </div>
    <div class="flex gap-2">
      ${typeof exportBar === 'function' ? exportBar('mod-committee') : ''}
      ${admin ? `<button class="btn btn-primary" onclick="openAddCommittee()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        ${window.t('cmt_add', 'Add Committee')}</button>` : ''}
    </div>
  </div>

  <div class="stats-grid">
    ${kpiCard(window.t('cmt_kpi_total', 'Committees'), list.length, admin ? window.t('cmt_kpi_total_meta', 'Across the platform') : '', '🏛️')}
    ${kpiCard(window.t('cmt_kpi_members', 'Members'), totalMembers, window.t('cmt_kpi_members_meta', 'Registered across committees'), '👥')}
    ${kpiCard(window.t('cmt_kpi_meetings', 'Meetings This Month'), monthMeetings, locMonthYear(+monthKey.split('-')[0], +monthKey.split('-')[1] - 1), '🗓️')}
    ${kpiCard(window.t('cmt_kpi_attendance', 'Avg Attendance'), avg + '%', window.t('cmt_kpi_attendance_meta', 'This month'), '✅')}
  </div>

  ${list.length === 0 ? emptyState(window.t('cmt_none', 'No committee assigned'), admin ? window.t('cmt_none_admin', 'Create your first committee.') : window.t('cmt_none_lead', 'No committee has been assigned to you yet.')) : `
  <div class="section-title">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    <span>${window.t('cmt_open_ws', 'Open a Committee Workspace')}</span>
  </div>
  <div class="mg-card-grid">${list.map(c => cmtCard(c)).join('')}</div>`}
  `;
}

function cmtCard(c) {
  const members = cmtMembersOf(c.id).length;
  const active = cmtActiveOf(c.id).length;
  const st = cmtMonthStats(c.id, cmtToday().slice(0, 7));
  const nx = cmtNextMeeting(c.id);
  return `
  <div class="mg-card" style="--mg-color:${c.color}">
    <div class="mg-card-stripe"></div>
    <div class="mg-card-top">
      <div class="mg-card-avatar" style="background:${c.color}">🏛️</div>
      <div class="mg-card-heading">
        <h3>${esc(c.name)}</h3>
        <span class="badge ${c.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${c.status === 'active' ? window.t('active') : window.t('inactive')}</span>
      </div>
    </div>
    <p class="mg-card-desc">${esc(c.purpose)}</p>
    <div class="mg-card-meta">
      <div><span>${window.t('cmt_leader', 'Leader')}</span><strong>${esc(cmtLeadName(c.id))}</strong></div>
      <div><span>${window.t('cmt_members', 'Members')}</span><strong>${members} / ${c.expectedSize}</strong></div>
      <div><span>${window.t('active')}</span><strong>${active}</strong></div>
      <div><span>${window.t('cmt_attendance', 'Attendance')}</span><strong>${st.rate ? st.rate + '%' : '—'}</strong></div>
    </div>
    <div class="mg-card-next">${nx ? `${CMT_MEET_DOT[meetingStatus(nx)]} ${window.t('cmt_next', 'Next')}: <strong>${esc(nx.title)}</strong> · ${fmtDate(nx.date)}, ${fmtTime(nx.startTime)}` : window.t('cmt_no_meeting', 'No meeting scheduled')}</div>
    <button class="btn btn-primary w-full mg-open-btn" onclick="openCommittee('${c.id}')">${window.t('open')} →</button>
  </div>`;
}

/* ------------------------------------------------------------
   WORKSPACE
   ------------------------------------------------------------ */
const CMT_TABS = [
  { id:'overview',  icon:'🏠' }, { id:'members', icon:'👥' }, { id:'meetings', icon:'🗓️' },
  { id:'calendar',  icon:'📆' }, { id:'whatsapp', icon:'💬' }, { id:'settings', icon:'⚙️' },
  { id:'activity',  icon:'🕒', adminOnly:true }
];

function viewCmtWorkspace() {
  const c = cmtById(CMT.activeCmtId);
  if (!c) { CMT.view = 'directory'; return viewCmtDirectory(); }
  const tabs = CMT_TABS.filter(x => !x.adminOnly || isCmtAdmin());
  let body;
  if (CMT.activeMemberId) body = paneCmtMemberProfile(c);
  else if (CMT.activeMeetingId) body = paneCmtMeeting(c);
  else switch (CMT.activeTab) {
    case 'members':  body = paneCmtMembers(c); break;
    case 'meetings': body = paneCmtMeetings(c); break;
    case 'calendar': body = paneCmtCalendar(c); break;
    case 'whatsapp': body = paneCmtWhatsApp(c); break;
    case 'settings': body = paneCmtSettings(c); break;
    case 'activity': body = paneCmtActivity(c); break;
    default:         body = paneCmtOverview(c);
  }
  return `
  <div class="mg-ws" style="--mg-color:${c.color}">
    <button class="btn btn-outline mg-back" onclick="backToCmtDirectory()">← ${isCmtAdmin() ? window.t('cmt_all', 'All Committees') : window.t('cmt_my_title', 'My Committees')}</button>
    <div class="mg-ws-header">
      <div class="mg-ws-id" style="background:${c.color}">🏛️</div>
      <div class="mg-ws-titles">
        <h1>${esc(c.name)}</h1>
        <div class="mg-ws-sub">
          ${window.t('cmt_leader', 'Leader')}: <strong>${esc(cmtLeadName(c.id))}</strong>
          <span class="mg-sep">•</span> ${window.t('cmt_members', 'Members')}: <strong>${cmtMembersOf(c.id).length}</strong>
          <span class="mg-sep">•</span> <span class="badge ${c.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${c.status === 'active' ? window.t('active') : window.t('inactive')}</span>
        </div>
      </div>
      <div class="mg-ws-actions">
        <button class="btn btn-outline" onclick="openAddCmtMember('${c.id}')">+ ${window.t('cmt_add_member', 'Add Member')}</button>
        <button class="btn btn-primary" onclick="openScheduleMeeting('${c.id}')">+ ${window.t('cmt_schedule', 'Schedule Meeting')}</button>
      </div>
    </div>
    <div class="mg-tabs">
      ${tabs.map(x => `<button class="mg-tab ${CMT.activeTab === x.id && !CMT.activeMemberId && !CMT.activeMeetingId ? 'active' : ''}" onclick="setCmtTab('${x.id}')"><span>${x.icon}</span> ${window.t('cmt_tab_' + x.id, x.id)}</button>`).join('')}
    </div>
    <div class="mg-pane">${body}</div>
  </div>`;
}

function paneCmtOverview(c) {
  const members = cmtMembersOf(c.id);
  const monthKey = cmtToday().slice(0, 7);
  const st = cmtMonthStats(c.id, monthKey);
  const upcoming = cmtMeetingsOf(c.id).filter(x => meetingStatus(x) !== 'completed').slice(0, 4);
  const recent = cmtMeetingsOf(c.id).filter(x => meetingStatus(x) === 'completed').reverse().slice(0, 4);
  return `
  <div class="stats-grid">
    ${kpiCard(window.t('cmt_members', 'Members'), members.length, window.t('cmt_expected', 'Expected') + ' ' + c.expectedSize, '👥')}
    ${kpiCard(window.t('cmt_active_members', 'Active'), cmtActiveOf(c.id).length, (members.length - cmtActiveOf(c.id).length) + ' ' + window.t('inactive').toLowerCase(), '✅')}
    ${kpiCard(window.t('cmt_kpi_meetings', 'Meetings This Month'), st.meetings, st.slots + ' ' + window.t('cmt_seats', 'seats'), '🗓️')}
    ${kpiCard(window.t('cmt_attendance', 'Attendance'), st.rate + '%', st.present + ' / ' + (st.present + st.absent), '📊')}
  </div>

  <div class="dashboard-2col mg-mt">
    <div class="card">
      <div class="card-header flex justify-between items-center">
        <div class="card-title">${window.t('cmt_upcoming_meetings', 'Upcoming Meetings')}</div>
        <button class="btn btn-outline mg-btn-xs" onclick="setCmtTab('meetings')">${window.t('view')}</button>
      </div>
      <div class="card-body" style="padding:0;">
        ${upcoming.length ? `<div class="mg-table-scroll"><table class="custom-table">
          <thead><tr><th>${window.t('cmt_meeting', 'Meeting')}</th><th>${window.t('date')}</th><th>${window.t('time')}</th><th>${window.t('status')}</th><th></th></tr></thead>
          <tbody>${upcoming.map(x => cmtMeetingRow(x)).join('')}</tbody></table></div>` : `<div class="mg-pad-note">${window.t('cmt_no_upcoming', 'No upcoming meetings.')}</div>`}
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">${window.t('recent_activity', 'Recent Activity')}</div></div>
      <div class="card-body"><div class="summary-list">
        ${cmtActivityOf(c.id).slice(0, 6).map(a => `<div class="summary-item"><div><strong>${esc(a.text)}</strong></div><span class="mg-muted-xs">${esc(a.when)}</span></div>`).join('') || `<div class="mg-pad-note">${window.t('cmt_no_activity', 'No activity.')}</div>`}
      </div></div>
    </div>
  </div>

  <div class="card mg-mt">
    <div class="card-header"><div class="card-title">${window.t('cmt_completed_meetings', 'Completed Meetings')}</div></div>
    <div class="card-body" style="padding:0;">
      ${recent.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <thead><tr><th>${window.t('cmt_meeting', 'Meeting')}</th><th>${window.t('date')}</th><th>${window.t('cmt_present', 'Present')}</th><th>${window.t('cmt_absent', 'Absent')}</th><th>${window.t('cmt_attendance', 'Attendance')}</th><th></th></tr></thead>
        <tbody>${recent.map(x => { const t = meetingTally(x); const m = t.present + t.absent; const r = m ? Math.round(t.present / m * 100) : 0;
          return `<tr><td><strong>${esc(x.title)}</strong></td><td>${fmtDate(x.date)}</td><td><span class="badge badge-confirmed">${t.present}</span></td><td><span class="badge badge-cancelled">${t.absent}</span></td><td><strong>${r}%</strong></td><td><button class="btn btn-outline mg-btn-xs" onclick="openCmtMeeting('${x.id}')">${window.t('view')}</button></td></tr>`;
        }).join('')}</tbody></table></div>` : `<div class="mg-pad-note">${window.t('cmt_no_completed', 'No completed meetings yet.')}</div>`}
    </div>
  </div>`;
}
function cmtMeetingRow(x) {
  const st = meetingStatus(x); const t = meetingTally(x);
  return `<tr>
    <td><strong>${esc(x.title)}</strong><div class="mg-muted-xs">${esc(x.venue || '—')}</div></td>
    <td>${fmtDate(x.date)}</td><td>${fmtTime(x.startTime)} – ${fmtTime(x.endTime)}</td>
    <td><span class="badge ${CMT_MEET_BADGE[st]}">${CMT_MEET_DOT[st]} ${cmtMeetingLabel(st)}</span></td>
    <td><button class="btn btn-outline mg-btn-xs" onclick="openCmtMeeting('${x.id}')">${st === 'completed' ? window.t('view') : window.t('cmt_attendance', 'Attendance')}</button></td>
  </tr>`;
}

function paneCmtMembers(c) {
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div><h2 class="mg-pane-title">${window.t('cmt_members', 'Members')}</h2>
    <p class="mg-page-sub">${cmtMembersOf(c.id).length} ${window.t('cmt_members', 'members').toLowerCase()} · ${window.t('cmt_expected', 'expected')} ${c.expectedSize}</p></div>
    <button class="btn btn-primary" onclick="openAddCmtMember('${c.id}')">+ ${window.t('cmt_add_member', 'Add Member')}</button>
  </div>
  <div class="card"><div class="card-body" style="padding:0;"><div class="mg-table-scroll">
    <table class="custom-table pj-reg-table">
      <thead><tr><th>${window.t('name')}</th><th>${window.t('mobile')}</th><th>${window.t('city')}</th><th>${window.t('role')}</th><th>${window.t('status')}</th><th>${window.t('cmt_attendance', 'Attendance')}</th><th>${window.t('actions')}</th></tr></thead>
      <tbody>${cmtMemberRows(c.id)}</tbody>
    </table></div></div></div>`;
}
function cmtMemberRows(cid) {
  const list = cmtMembersOf(cid);
  if (!list.length) return `<tr><td colspan="7" class="mg-empty-cell">${window.t('cmt_no_members', 'No members yet.')}</td></tr>`;
  return list.map(x => {
    const s = cmtMemberStats(x.id);
    const other = committeesOfDevotee(x.devoteeId).filter(a => a.member.committeeId !== cid);
    return `<tr>
      <td><div class="mg-name-cell"><span class="mg-avatar">${esc((x.firstName[0] || '') + (x.lastName[0] || ''))}</span>
        <div><strong>${esc(cmtMemberName(x))}</strong><div class="mg-muted-xs">${esc(x.id)} · ${window.t('cmt_joined', 'joined')} ${fmtDate(x.joinedDate)}</div>
        ${other.length ? `<div class="mg-multi">${window.t('cmt_also_in', 'Also in')}: ${other.map(a => `<span class="mg-chip" style="--c:${a.committee.color}">${esc(a.committee.name)}</span>`).join('')}</div>` : ''}</div></div></td>
      <td>${esc(x.mobile)}</td><td>${esc(tData(x.city) || '—')}</td><td>${esc(x.role || 'Member')}</td>
      <td><span class="badge ${x.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${x.status === 'active' ? window.t('active') : window.t('inactive')}</span></td>
      <td><strong>${s.present}</strong> / ${s.meetings} <span class="mg-muted-xs">(${s.rate}%)</span></td>
      <td><div class="flex gap-1 mg-actions-wrap">
        <button class="btn btn-outline mg-btn-xs" onclick="openCmtMemberProfile('${x.id}')">${window.t('view')}</button>
        <a class="btn btn-outline mg-btn-xs" href="tel:${esc(x.mobile)}">📞</a>
        <a class="btn btn-outline mg-btn-xs" href="https://wa.me/91${esc(x.mobile)}" target="_blank" rel="noopener">💬</a>
        <button class="btn btn-outline mg-btn-xs" onclick="openEditCmtMember('${x.id}')">${window.t('edit')}</button>
        <button class="btn btn-outline mg-btn-xs" onclick="toggleCmtMemberStatus('${x.id}')">${x.status === 'active' ? window.t('cmt_deactivate', 'Deactivate') : window.t('cmt_activate', 'Activate')}</button>
        <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmRemoveCmtMember('${x.id}')">${window.t('remove')}</button>
      </div></td>
    </tr>`;
  }).join('');
}

function paneCmtMemberProfile(c) {
  const x = cmtMemberById(CMT.activeMemberId);
  if (!x) { CMT.activeMemberId = null; return paneCmtMembers(c); }
  const s = cmtMemberStats(x.id);
  const hist = CMT.meetings.filter(m => m.committeeId === c.id && (m.memberIds || []).includes(x.id))
    .slice().sort((a, b) => b.date.localeCompare(a.date));
  return `
  <button class="btn btn-outline mg-back" onclick="closeCmtMemberProfile()">← ${window.t('cmt_members', 'Members')}</button>
  <div class="card mg-profile-card">
    <div class="mg-profile-head">
      <div class="mg-profile-avatar" style="background:${c.color}">${esc((x.firstName[0] || '') + (x.lastName[0] || ''))}</div>
      <div class="mg-profile-id"><h2>${esc(cmtMemberName(x))}</h2>
        <div class="mg-muted-xs">${esc(c.name)} · ${esc(x.role || 'Member')} · ${esc(x.id)}</div>
        <div class="mg-profile-badges"><span class="badge ${x.status === 'active' ? 'badge-confirmed' : 'badge-cancelled'}">${x.status === 'active' ? window.t('active') : window.t('inactive')}</span>
        <span class="badge badge-maroon">${s.rate}% ${window.t('cmt_attendance', 'attendance')}</span></div></div>
      <div class="mg-profile-actions">
        <a class="btn btn-outline" href="tel:${esc(x.mobile)}">📞 ${window.t('call', 'Call')}</a>
        <a class="btn btn-outline" href="https://wa.me/91${esc(x.mobile)}" target="_blank" rel="noopener">💬 WhatsApp</a>
        <button class="btn btn-outline" onclick="openEditCmtMember('${x.id}')">${window.t('edit')}</button>
      </div>
    </div>
    <div class="mg-profile-grid">
      <div><span>${window.t('mobile')}</span><strong>${esc(x.mobile)}</strong></div>
      <div><span>${window.t('city')}</span><strong>${esc(tData(x.city) || '—')}</strong></div>
      <div><span>${window.t('state')}</span><strong>${esc(tData(x.state) || '—')}</strong></div>
      <div><span>${window.t('cmt_joined', 'Joined')}</span><strong>${fmtDate(x.joinedDate)}</strong></div>
      <div><span>${window.t('cmt_meetings_word', 'Meetings')}</span><strong>${s.meetings}</strong></div>
      <div><span>${window.t('cmt_present', 'Present')}</span><strong>${s.present}</strong></div>
    </div>
    ${x.notes ? `<div class="mg-note-box"><strong>${window.t('notes')}:</strong> ${esc(x.notes)}</div>` : ''}
  </div>
  <div class="card mg-mt"><div class="card-header"><div class="card-title">${window.t('cmt_attendance_history', 'Attendance History')}</div></div>
    <div class="card-body" style="padding:0;">${hist.length ? `<div class="mg-table-scroll"><table class="custom-table">
      <thead><tr><th>${window.t('date')}</th><th>${window.t('cmt_meeting', 'Meeting')}</th><th>${window.t('status')}</th></tr></thead>
      <tbody>${hist.map(m => { const a = cmtAtt(m.id, x.id); const lbl = a ? (a.status === 'present' ? window.t('cmt_present', 'Present') : window.t('cmt_absent', 'Absent')) : window.t('cmt_not_marked', 'Not marked');
        const cls = a ? (a.status === 'present' ? 'badge-confirmed' : 'badge-cancelled') : 'badge-pending';
        return `<tr><td>${fmtDate(m.date)}</td><td>${esc(m.title)}</td><td><span class="badge ${cls}">${lbl}</span></td></tr>`;
      }).join('')}</tbody></table></div>` : `<div class="mg-pad-note">${window.t('cmt_no_meetings', 'No meetings assigned.')}</div>`}</div></div>`;
}

function paneCmtMeetings(c) {
  const list = cmtMeetingsOf(c.id);
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div><h2 class="mg-pane-title">${window.t('cmt_meetings_word', 'Meetings')}</h2><p class="mg-page-sub">${window.t('cmt_meetings_sub', 'Schedule meetings and mark attendance')}</p></div>
    <button class="btn btn-primary" onclick="openScheduleMeeting('${c.id}')">+ ${window.t('cmt_schedule', 'Schedule Meeting')}</button>
  </div>
  <div class="card"><div class="card-body" style="padding:0;">
    ${list.length ? `<div class="mg-table-scroll"><table class="custom-table">
      <thead><tr><th>${window.t('cmt_meeting', 'Meeting')}</th><th>${window.t('date')}</th><th>${window.t('time')}</th><th>${window.t('venue')}</th><th>${window.t('cmt_seats', 'Seats')}</th><th>${window.t('status')}</th><th>${window.t('actions')}</th></tr></thead>
      <tbody>${list.map(x => { const st = meetingStatus(x); const t = meetingTally(x);
        return `<tr><td><strong>${esc(x.title)}</strong>${x.agenda ? `<div class="mg-muted-xs">${esc(x.agenda)}</div>` : ''}</td>
        <td>${fmtDate(x.date)}</td><td>${fmtTime(x.startTime)} – ${fmtTime(x.endTime)}</td><td>${esc(x.venue || '—')}</td>
        <td>${t.total}</td><td><span class="badge ${CMT_MEET_BADGE[st]}">${CMT_MEET_DOT[st]} ${cmtMeetingLabel(st)}</span></td>
        <td><div class="flex gap-1">
          <button class="btn btn-outline mg-btn-xs" onclick="openCmtMeeting('${x.id}')">${st === 'completed' ? window.t('view') : window.t('cmt_attendance', 'Attendance')}</button>
          <button class="btn btn-outline mg-btn-xs" onclick="openEditMeeting('${x.id}')">${window.t('edit')}</button>
          <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeleteMeeting('${x.id}')">${window.t('delete')}</button>
        </div></td></tr>`;
      }).join('')}</tbody></table></div>` : `<div class="mg-pad-note">${window.t('cmt_no_meetings2', 'No meetings scheduled yet.')}</div>`}
  </div></div>`;
}

function paneCmtMeeting(c) {
  const x = meetingById(CMT.activeMeetingId);
  if (!x) { CMT.activeMeetingId = null; return paneCmtOverview(c); }
  const st = meetingStatus(x); const t = meetingTally(x);
  const marked = t.present + t.absent; const rate = marked ? Math.round(t.present / marked * 100) : 0;
  return `
  <button class="btn btn-outline mg-back" onclick="closeCmtMeeting()">← ${window.t('back')}</button>
  <div class="card mg-session-card">
    <div class="mg-session-head">
      <div><h2 class="mg-pane-title">${esc(x.title)}</h2>
        <div class="mg-muted-xs">${fmtDate(x.date)} · ${fmtTime(x.startTime)} – ${fmtTime(x.endTime)}${x.venue ? ' · 📍 ' + esc(x.venue) : ''}</div></div>
      <div class="flex gap-2 items-center"><span class="badge ${CMT_MEET_BADGE[st]}">${CMT_MEET_DOT[st]} ${cmtMeetingLabel(st)}</span>
        ${!x.completed ? `<button class="btn btn-outline" onclick="openEditMeeting('${x.id}')">${window.t('edit')}</button>` : ''}</div>
    </div>
    ${x.agenda ? `<div class="mg-note-box"><strong>${window.t('cmt_agenda', 'Agenda')}:</strong> ${esc(x.agenda)}</div>` : ''}
    <div class="mg-session-stats">
      <div><span>${window.t('cmt_invited', 'Invited')}</span><strong>${t.total}</strong></div>
      <div><span>${window.t('cmt_present', 'Present')}</span><strong class="mg-ok">${t.present}</strong></div>
      <div><span>${window.t('cmt_absent', 'Absent')}</span><strong class="mg-bad">${t.absent}</strong></div>
      <div><span>${window.t('cmt_not_marked', 'Not marked')}</span><strong>${t.unmarked}</strong></div>
      <div><span>${window.t('cmt_attendance', 'Attendance')}</span><strong>${rate}%</strong></div>
    </div>
    ${x.completed ? `<div class="mg-locked">🔒 ${window.t('cmt_locked', 'This meeting is completed. Attendance is read-only.')}
      ${isCmtAdmin() ? `<button class="btn btn-outline mg-btn-xs" onclick="reopenMeeting('${x.id}')">${window.t('reopen')}</button>` : ''}</div>`
      : `<div class="flex gap-2 mg-bulk">
        <button class="btn btn-outline" onclick="markAllCmtAtt('${x.id}','present')">${window.t('cmt_all_present', 'Mark All Present')}</button>
        <button class="btn btn-outline" onclick="markAllCmtAtt('${x.id}','absent')">${window.t('cmt_all_absent', 'Mark All Absent')}</button>
        <button class="btn btn-secondary" onclick="completeMeeting('${x.id}')">${window.t('cmt_complete', 'Complete Meeting')}</button>
      </div>`}
  </div>
  <div class="card mg-mt"><div class="card-header"><div class="card-title">${window.t('cmt_attendance_list', 'Attendance List')}</div></div>
    <div class="card-body" style="padding:0;"><div class="mg-table-scroll"><table class="custom-table">
      <thead><tr><th>${window.t('name')}</th><th>${window.t('mobile')}</th><th>${window.t('role')}</th><th>${window.t('status')}</th><th>${window.t('actions')}</th></tr></thead>
      <tbody>${(x.memberIds || []).map(id => { const m = cmtMemberById(id); if (!m) return '';
        const a = cmtAtt(x.id, id); const lbl = a ? (a.status === 'present' ? window.t('cmt_present', 'Present') : window.t('cmt_absent', 'Absent')) : window.t('cmt_not_marked', 'Not marked');
        const cls = a ? (a.status === 'present' ? 'badge-confirmed' : 'badge-cancelled') : 'badge-pending';
        return `<tr><td><strong>${esc(cmtMemberName(m))}</strong></td><td>${esc(m.mobile)}</td><td>${esc(m.role || 'Member')}</td>
          <td><span class="badge ${cls}">${lbl}</span></td>
          <td>${x.completed ? `<span class="mg-muted-xs">${window.t('cmt_locked_short', 'Locked')}</span>` : `<div class="mg-att-toggle">
            <button class="mg-att-btn ${a && a.status === 'present' ? 'on-present' : ''}" onclick="markCmtAtt('${x.id}','${id}','present')">${window.t('cmt_present', 'Present')}</button>
            <button class="mg-att-btn ${a && a.status === 'absent' ? 'on-absent' : ''}" onclick="markCmtAtt('${x.id}','${id}','absent')">${window.t('cmt_absent', 'Absent')}</button>
          </div>`}</td></tr>`;
      }).join('')}</tbody></table></div></div></div>`;
}

/* calendar tab — this committee's meetings for the month */
function shiftCmtMonth(delta) {
  let mo = CMT.calendarMonth + delta, yr = CMT.calendarYear;
  if (mo < 0) { mo = 11; yr--; } if (mo > 11) { mo = 0; yr++; }
  CMT.calendarMonth = mo; CMT.calendarYear = yr; renderCommittee();
}
function paneCmtCalendar(c) {
  const yr = CMT.calendarYear, mo = CMT.calendarMonth;
  const monthKey = yr + '-' + String(mo + 1).padStart(2, '0');
  const daysIn = new Date(yr, mo + 1, 0).getDate();
  const startDow = (new Date(yr, mo, 1).getDay() + 6) % 7;
  const meets = CMT.meetings.filter(x => x.committeeId === c.id && (x.date || '').indexOf(monthKey) === 0);
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;
  for (let d = 1; d <= daysIn; d++) {
    const iso = monthKey + '-' + String(d).padStart(2, '0');
    const dayM = meets.filter(x => x.date === iso);
    cells += `<div class="mg-cal-cell ${iso === cmtToday() ? 'mg-cal-today' : ''}">
      <div class="mg-cal-date">${d}${iso === cmtToday() ? `<span class="mg-cal-todaytag">${window.t('today')}</span>` : ''}</div>
      ${dayM.map(x => `<div class="mg-cal-event" style="--c:${c.color}" onclick="openCmtMeeting('${x.id}')" title="${esc(tData(x.title))}">
        <div class="mg-ev-title">${esc(tData(x.title))}</div><div class="mg-ev-meta">${locTime(x.startTime)}–${locTime(x.endTime)}${x.venue ? ' · ' + esc(tData(x.venue)) : ''}</div></div>`).join('')}
    </div>`;
  }
  const trail = (7 - ((startDow + daysIn) % 7)) % 7;
  for (let i = 0; i < trail; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div><h2 class="mg-pane-title">${window.t('cmt_calendar', 'Meeting Calendar')}</h2><p class="mg-page-sub">${meets.length} ${window.t('cmt_meetings_word', 'meetings').toLowerCase()} · ${locMonthYear(yr, mo)}</p></div>
    <div class="flex gap-2 items-center">
      <button class="btn btn-outline mg-btn-xs" onclick="shiftCmtMonth(-1)">←</button>
      <strong class="mg-cal-label">${locMonthYear(yr, mo)}</strong>
      <button class="btn btn-outline mg-btn-xs" onclick="shiftCmtMonth(1)">→</button>
    </div>
  </div>
  <div class="card"><div class="card-body">
    <div class="mg-cal-head">${locDowShort().map(x => `<div>${x}</div>`).join('')}</div>
    <div class="mg-cal-grid">${cells}</div>
  </div></div>`;
}

function paneCmtWhatsApp(c) {
  const comm = cmtCommById(c.id) || { groupName:'', groupLink:'', broadcastName:'', broadcastLink:'' };
  const drafts = cmtDraftsOf(c.id);
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div><h2 class="mg-pane-title">${window.t('cmt_whatsapp', 'WhatsApp Communication')}</h2><p class="mg-page-sub">${window.t('cmt_whatsapp_sub', 'Group, broadcast and reusable draft messages')}</p></div>
    <button class="btn btn-primary" onclick="openCmtDraft('${c.id}')">+ ${window.t('cmt_new_draft', 'New Draft')}</button>
  </div>
  <div class="dashboard-2col">
    <div class="card"><div class="card-header"><div class="card-title">💬 ${window.t('cmt_group', 'WhatsApp Group')}</div></div>
      <div class="card-body"><form onsubmit="saveCmtComm(event,'${c.id}','group')">
        <div class="form-group"><label class="form-label">${window.t('cmt_group_name', 'Group Name')} *</label><input class="form-input" id="cmtGroupName" value="${esc(comm.groupName)}" required></div>
        <div class="form-group"><label class="form-label">${window.t('cmt_group_link', 'Group Invite Link')} *</label><input class="form-input" id="cmtGroupLink" type="url" value="${esc(comm.groupLink)}" placeholder="https://chat.whatsapp.com/..." required></div>
        <div class="flex gap-2"><button class="btn btn-primary" type="submit">${window.t('save')}</button>
        <button class="btn btn-outline" type="button" onclick="openWaLink('${jsq(comm.groupLink)}')">${window.t('cmt_open_group', 'Open Group')}</button></div>
      </form></div>
    </div>
    <div class="card"><div class="card-header"><div class="card-title">📢 ${window.t('cmt_broadcast', 'Broadcast')}</div></div>
      <div class="card-body"><form onsubmit="saveCmtComm(event,'${c.id}','broadcast')">
        <div class="form-group"><label class="form-label">${window.t('cmt_broadcast_name', 'Broadcast Name')} *</label><input class="form-input" id="cmtBroadcastName" value="${esc(comm.broadcastName)}" required></div>
        <div class="form-group"><label class="form-label">${window.t('cmt_broadcast_link', 'Broadcast Link')} *</label><input class="form-input" id="cmtBroadcastLink" type="url" value="${esc(comm.broadcastLink)}" placeholder="https://wa.me/91..." required></div>
        <div class="flex gap-2"><button class="btn btn-primary" type="submit">${window.t('save')}</button>
        <button class="btn btn-outline" type="button" onclick="openWaLink('${jsq(comm.broadcastLink)}')">${window.t('cmt_open_broadcast', 'Open Broadcast')}</button></div>
      </form></div>
    </div>
  </div>
  <div class="card mg-mt"><div class="card-header flex justify-between items-center"><div class="card-title">${window.t('cmt_drafts', 'Message Drafts')}</div>
    <button class="btn btn-outline mg-btn-xs" onclick="openCmtDraft('${c.id}')">+ ${window.t('cmt_new_draft', 'New Draft')}</button></div>
    <div class="card-body">${drafts.length ? `<div class="mg-draft-grid">${drafts.map(d => `
      <div class="mg-draft"><div class="mg-draft-head"><strong>${esc(d.title)}</strong><span class="mg-muted-xs">${window.t('cmt_updated', 'Updated')} ${fmtDate(d.updatedAt)}</span></div>
        <pre class="mg-draft-body">${esc(d.message)}</pre>
        <div class="flex gap-1 mg-draft-actions">
          <button class="btn btn-outline mg-btn-xs" onclick="openCmtDraft('${c.id}','${d.id}')">${window.t('edit')}</button>
          <button class="btn btn-outline mg-btn-xs" onclick="copyText(${JSON.stringify(d.message).replace(/"/g, '&quot;')}, window.t('cmt_copied','Copied.'))">${window.t('cmt_copy', 'Copy')}</button>
          <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeleteCmtDraft('${d.id}')">${window.t('delete')}</button>
          <button class="btn btn-secondary mg-btn-xs" onclick="sendCmtDraft('${d.id}')">${window.t('cmt_send', 'Send')}</button>
        </div></div>`).join('')}</div>` : `<div class="mg-pad-note">${window.t('cmt_no_drafts', 'No drafts yet.')}</div>`}
    </div>
  </div>`;
}

function paneCmtSettings(c) {
  const admin = isCmtAdmin();
  const leadOpts = (typeof personOptions === 'function')
    ? personOptions(c.leaderId, '— ' + window.t('cmt_select_leader', 'Select leader') + ' —')
    : CMT.leaders.map(l => `<option value="${l.id}" ${l.id === c.leaderId ? 'selected' : ''}>${esc(l.name)} · ${esc(l.mobile)}</option>`).join('');
  return `
  <div class="flex justify-between items-center mg-pane-head"><div><h2 class="mg-pane-title">${window.t('cmt_settings', 'Committee Settings')}</h2>
    <p class="mg-page-sub">${admin ? window.t('cmt_settings_admin', 'Full settings including leader assignment') : window.t('cmt_settings_lead', 'Leaders can edit committee details. Leader assignment is admin-only.')}</p></div></div>
  <div class="card"><div class="card-body"><form onsubmit="saveCmtSettings(event,'${c.id}')">
    <div class="form-group"><label class="form-label">${window.t('cmt_name', 'Committee Name')} *</label><input class="form-input" id="setCmtName" value="${esc(c.name)}" required></div>
    <div class="grid mg-2col-form">
      <div class="form-group"><label class="form-label">${window.t('cmt_leader', 'Leader')} *</label><select class="form-select" id="setCmtLead" ${admin ? '' : 'disabled'} required>${leadOpts}</select></div>
      <div class="form-group"><label class="form-label">${window.t('cmt_samaj', 'Samaj')}</label><input class="form-input" id="setCmtSamaj" value="${esc(c.samaj || '')}" list="donCommitteeList"></div>
    </div>
    <div class="grid mg-2col-form">
      <div class="form-group"><label class="form-label">${window.t('cmt_expected_size', 'Expected Size')} *</label><input class="form-input" type="number" min="1" id="setCmtSize" value="${c.expectedSize}" required></div>
      <div class="form-group"><label class="form-label">${window.t('status')} *</label><select class="form-select" id="setCmtStatus">
        <option value="active" ${c.status === 'active' ? 'selected' : ''}>${window.t('active')}</option>
        <option value="inactive" ${c.status === 'inactive' ? 'selected' : ''}>${window.t('inactive')}</option></select></div>
    </div>
    <div class="form-group"><label class="form-label">${window.t('cmt_purpose', 'Purpose')} *</label><textarea class="form-input mg-textarea" id="setCmtPurpose" rows="3" required>${esc(c.purpose)}</textarea></div>
    <div class="form-group"><label class="form-label">${window.t('notes')}</label><textarea class="form-input mg-textarea" id="setCmtNotes" rows="2">${esc(c.notes || '')}</textarea></div>
    <div class="flex gap-2"><button class="btn btn-primary" type="submit">${window.t('save')}</button>
      ${admin ? `<button class="btn btn-outline mg-btn-danger" type="button" onclick="confirmDeleteCommittee('${c.id}')">${window.t('cmt_delete', 'Delete Committee')}</button>` : ''}</div>
  </form></div></div>`;
}

function paneCmtActivity(c) {
  const list = cmtActivityOf(c.id);
  return `<div class="flex justify-between items-center mg-pane-head"><div><h2 class="mg-pane-title">${window.t('cmt_activity_log', 'Activity Log')}</h2>
    <p class="mg-page-sub">${esc(c.name)}</p></div></div>
  <div class="card"><div class="card-body"><div class="summary-list">
    ${list.length ? list.map(a => `<div class="summary-item"><div><strong>${esc(a.text)}</strong></div><span class="mg-muted-xs">${esc(a.when)}</span></div>`).join('') : `<div class="mg-pad-note">${window.t('cmt_no_activity', 'No activity.')}</div>`}
  </div></div></div>`;
}

/* ---- attendance actions ---- */
function markCmtAtt(mtgId, memberId, status) {
  const x = meetingById(mtgId); if (!x || x.completed) { cmtToast(window.t('cmt_locked_short', 'Locked')); return; }
  setCmtAttendance(mtgId, memberId, status);
  const m = cmtMemberById(memberId);
  cmtLogActivity(x.committeeId, cmtMemberName(m) + ' — ' + (status === 'present' ? window.t('cmt_present', 'Present') : window.t('cmt_absent', 'Absent')) + ' · ' + x.title);
  renderCommittee();
}
function markAllCmtAtt(mtgId, status) {
  const x = meetingById(mtgId); if (!x || x.completed) return;
  (x.memberIds || []).forEach(id => setCmtAttendance(mtgId, id, status));
  renderCommittee();
}
function completeMeeting(mtgId) {
  const x = meetingById(mtgId); if (!x) return;
  const t = meetingTally(x);
  openConfirm({
    title: window.t('cmt_complete', 'Complete Meeting'),
    body: `<p><strong>${esc(x.title)}</strong> — ${fmtDate(x.date)}</p><p class="mg-mt-sm">${window.t('cmt_present', 'Present')}: ${t.present} · ${window.t('cmt_absent', 'Absent')}: ${t.absent} · ${window.t('cmt_not_marked', 'Not marked')}: ${t.unmarked}</p><p class="mg-mt-sm">${window.t('cmt_complete_note', 'Once completed, attendance becomes read-only.')}</p>`,
    confirmLabel: window.t('cmt_complete', 'Complete Meeting'),
    onConfirm: () => { x.completed = true; cmtLogActivity(x.committeeId, x.title + ' ' + window.t('cmt_done', 'completed').toLowerCase() + ' — ' + t.present + ' present'); cmtToast(window.t('cmt_meeting_done', 'Meeting completed.')); renderCommittee(); }
  });
}
function reopenMeeting(mtgId) { const x = meetingById(mtgId); if (!x) return; x.completed = false; renderCommittee(); }

/* ---- whatsapp helpers ---- */
function saveCmtComm(e, cid, which) {
  e.preventDefault();
  let comm = cmtCommById(cid);
  if (!comm) { comm = { committeeId: cid, groupName:'', groupLink:'', broadcastName:'', broadcastLink:'' }; CMT.communication.push(comm); }
  if (which === 'group') { comm.groupName = document.getElementById('cmtGroupName').value.trim(); comm.groupLink = document.getElementById('cmtGroupLink').value.trim(); }
  else { comm.broadcastName = document.getElementById('cmtBroadcastName').value.trim(); comm.broadcastLink = document.getElementById('cmtBroadcastLink').value.trim(); }
  cmtToast(window.t('save') + ' ✓'); renderCommittee();
}
function openWaLink(link) { if (!link) { cmtToast(window.t('cmt_no_link', 'No link saved yet.')); return; } window.open(link, '_blank', 'noopener'); }
function sendCmtDraft(id) {
  const d = CMT.drafts.find(x => x.id === id); if (!d) return;
  const comm = cmtCommById(d.committeeId) || {};
  openSheet({
    title: window.t('cmt_send', 'Send Message'),
    body: `<pre class="mg-draft-body">${esc(d.message)}</pre>
      <div class="mg-send-grid mg-mt">
        <button class="mg-send-opt" onclick="sendCmtTo('${id}','group')" ${comm.groupLink ? '' : 'disabled'}><span class="mg-send-ico">💬</span><strong>${window.t('cmt_group', 'Group')}</strong><small>${esc(comm.groupName || window.t('cmt_no_link', 'No link'))}</small></button>
        <button class="mg-send-opt" onclick="sendCmtTo('${id}','broadcast')" ${comm.broadcastLink ? '' : 'disabled'}><span class="mg-send-ico">📢</span><strong>${window.t('cmt_broadcast', 'Broadcast')}</strong><small>${esc(comm.broadcastName || window.t('cmt_no_link', 'No link'))}</small></button>
      </div>`,
    footer: `<button class="btn btn-outline" onclick="closeSheet()">${window.t('cancel')}</button>
      <button class="btn btn-secondary" onclick="copyText(${JSON.stringify(d.message).replace(/"/g, '&quot;')}, window.t('cmt_copied','Copied.'))">${window.t('cmt_copy', 'Copy')}</button>`
  });
}
function sendCmtTo(id, target) {
  const d = CMT.drafts.find(x => x.id === id); if (!d) return;
  const comm = cmtCommById(d.committeeId) || {};
  const link = target === 'group' ? comm.groupLink : comm.broadcastLink;
  if (!link) { cmtToast(window.t('cmt_no_link', 'No link saved.')); return; }
  copyText(d.message, window.t('cmt_copied_paste', 'Message copied — paste it in WhatsApp.'));
  window.open(link, '_blank', 'noopener');
  cmtLogActivity(d.committeeId, window.t('cmt_sent', 'Message sent') + ': ' + d.title);
  closeSheet();
}

function committeeExport() {
  return {
    filename: 'committees',
    title: window.t('cmt_title', 'Committee / Samaj'),
    subtitle: window.t('cmt_sub_admin', 'Leaders, members, meetings and attendance'),
    columns: ['Committee', 'Samaj', 'Leader', 'Members', 'Expected', 'Status', 'Meetings (month)', 'Attendance %'],
    rows: visibleCommittees().map(c => {
      const s = cmtMonthStats(c.id, cmtToday().slice(0, 7));
      return [c.name, tData(c.samaj || ''), cmtLeadName(c.id), cmtMembersOf(c.id).length,
        c.expectedSize, c.status, s.meetings, s.rate + '%'];
    })
  };
}
if (typeof registerExport === 'function') registerExport('mod-committee', committeeExport);
function exportCmtCSV() { if (typeof runExport === 'function') runExport('mod-committee', 'csv'); }
