/* ============================================================
   ADMIN / LEADER DASHBOARD  (renders into #dashboardRoot)
   One cockpit that pulls live numbers from every module.
   Scope-aware: super-admin sees the whole temple; a
   management-lead / pooja-coordinator / committee-leader sees
   only their area, with the same blessing banner.
   ============================================================ */

if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
  window.onLanguageChange = function () {};
}

function dashToday() { return (typeof MG !== 'undefined' && MG.today) ? MG.today : '2026-09-06'; }
function dashMonthKey() { return dashToday().slice(0, 7); }

/** Which persona is currently switched on in the topbar. */
function activePersona() {
  if (typeof CMT !== 'undefined' && CMT.session && CMT.session.role === 'leader')
    return { kind: 'committee_leader', name: CMT.session.userName, id: CMT.session.userId };
  if (typeof POOJA !== 'undefined' && POOJA.session && POOJA.session.role === 'coordinator')
    return { kind: 'pooja_coordinator', name: POOJA.session.userName, id: POOJA.session.userId };
  if (typeof MG !== 'undefined' && MG.session && MG.session.role === 'lead')
    return { kind: 'management_lead', name: MG.session.userName, id: MG.session.userId };
  return { kind: 'admin', name: window.t('administrator', 'Admin'), id: 'DEV-001' };
}

/* ---- live figures ---- */
function dashFigures() {
  const mk = dashMonthKey(), today = dashToday();
  const f = { poojaToday: 0, poojaUpcoming: 0, donCash: 0, donKind: 0, donPledged: 0,
    devotees: 0, accounts: (typeof ACCOUNTS !== 'undefined' ? ACCOUNTS.length : 0),
    meetings: 0, events: 0, visits: 0, lowStock: 0, needSevarthi: 0, unconfirmedVisits: 0 };

  if (typeof POOJA !== 'undefined') {
    POOJA.poojas.forEach(p => (p.sessions || []).forEach(s => {
      if (s.date === today) f.poojaToday++;
      if (s.date >= today) f.poojaUpcoming++;
    }));
    f.needSevarthi = POOJA.poojas.filter(p => !(p.sevarthiIds || []).length && poojaStatus(p) !== 'completed').length;
  }
  if (typeof DON !== 'undefined') {
    DON.donations.forEach(x => {
      if ((x.date || '').indexOf(mk) === 0 && x.status === 'received') {
        if (typeof donationIsKind === 'function' && donationIsKind(x)) f.donKind += Number(x.valuation) || 0;
        else f.donCash += Number(x.amount) || 0;
      }
      if (x.status === 'pledged') f.donPledged++;
    });
  }
  if (typeof state !== 'undefined' && Array.isArray(state.devotees)) f.devotees = state.devotees.length;
  if (typeof CMT !== 'undefined') f.meetings = CMT.meetings.filter(m => (m.date || '').indexOf(mk) === 0).length;
  if (typeof EV !== 'undefined') f.events = EV.events.filter(e => (typeof evDays === 'function' ? evDays(e) : e.days || []).some(d => (d.date || '').indexOf(mk) === 0)).length;
  if (typeof VISITS !== 'undefined') {
    f.visits = VISITS.list.filter(v => (v.date || '') >= today && v.status !== 'cancelled').length;
    f.unconfirmedVisits = VISITS.list.filter(v => v.status === 'requested').length;
  }
  if (typeof state !== 'undefined' && Array.isArray(state.inventory)) {
    f.lowStock = state.inventory.filter(i => /low|out/i.test(i.status || '')).length;
  }
  return f;
}

/* ---- today's items from the unified calendar ----
   `scope` (optional) = { types:[...], own:(entry)=>bool } restricts what a
   non-admin persona is allowed to see so the dashboard never leaks another
   module's data. The filtered list is cached for dashOpenCalItem(). */
function dashTodayItems(scope) {
  if (typeof calEntries !== 'function') { dashTodayItems._cache = []; return []; }
  let list = calEntries(dashMonthKey()).filter(e => e.date === dashToday());
  if (scope && scope.types) list = list.filter(e => scope.types.indexOf(e.type) !== -1);
  if (scope && typeof scope.own === 'function') list = list.filter(e => scope.own(e));
  dashTodayItems._cache = list;
  return list;
}

/* ---- module tiles ---- */
function dashModuleTiles(persona) {
  const admin = persona.kind === 'admin';
  const tiles = [];
  /* sub = a short "what you do here", not another number */
  const T = (page, icon, key, def, count, sub, show) => {
    if (show === false) return;
    tiles.push(`<button class="dash-tile" onclick="switchPage('${page}')">
      <span class="dash-tile-ico">${icon}</span>
      <span class="dash-tile-body">
        <span class="dash-tile-headrow"><strong>${esc(window.t(key, def))}</strong><span class="dash-tile-count">${esc(String(count))}</span></span>
        <span class="dash-tile-sub">${esc(sub)}</span>
      </span>
      <span class="dash-tile-go">→</span>
    </button>`);
  };
  if (typeof POOJA !== 'undefined')
    T('puja', '🪔', 'nav_puja_s', 'Pooja & Seva', POOJA.poojas.length, window.t('guide_m_puja', 'Schedule rituals & sevas, record sevarthi, print invitations'), admin || persona.kind === 'pooja_coordinator');
  if (typeof DON !== 'undefined') {
    const dm = DON.donations.filter(x => (x.date || '').indexOf(dashMonthKey()) === 0);
    T('donations', '💰', 'don_title', 'Donations', dm.length, window.t('guide_m_don', 'Cash & in-kind offerings, 80G receipts & certificates'), admin || persona.kind === 'accountant');
  }
  if (typeof CMT !== 'undefined')
    T('committees', '🏛️', 'cmt_title', 'Committee / Samaj', CMT.committees.length, window.t('guide_m_cmt', 'Construction governance bodies — members, meetings, attendance'), admin || persona.kind === 'committee_leader');
  if (typeof EV !== 'undefined')
    T('events', '📅', 'ev_title', 'Temple Events', EV.events.length, window.t('guide_m_events', 'Plan festivals — Navratri, Annakut, Patotsav'), admin || persona.kind === 'event_incharge');
  if (typeof MG !== 'undefined')
    T('management', '🗂️', 'nav_management_s', 'Management Apps', MG.managements.length, window.t('guide_m_mg', 'Volunteer teams — prasad, parking, decoration — rosters & badges'), admin || persona.kind === 'management_lead');
  if (typeof VISITS !== 'undefined')
    T('visits', '🙏', 'vis_title', 'Bhuvaji Visits', VISITS.list.length, window.t('guide_m_visits', 'Take the murti / Bhuvaji to a home or shop, with an escort team'), admin);
  if (admin && typeof state !== 'undefined') {
    T('devotees', '👥', 'nav_devotees_s', 'Devotees', state.devotees.length, window.t('guide_m_devotees', 'The master register used across donations, poojas & committees'), true);
    T('inventory', '📦', 'nav_inventory_s', 'Inventory', state.inventory.length, window.t('guide_m_inv', 'Samagri, prasad & assets, with low-stock alerts'), true);
    T('expenses', '💸', 'nav_expenses_s', 'Expenses', state.expenses.length, window.t('guide_m_exp', 'Log temple spending against vouchers'), true);
  }
  T('calendar', '🗓️', 'cal_title', 'Unified Calendar', dashTodayItems().length, window.t('guide_m_cal', 'Every dated item from every section on one grid'), true);
  return tiles.join('');
}

/* ---- "how it works" orientation panel (admin) ---- */
function dashGuideSeen() {
  try { return localStorage.getItem('svmmm_guide_seen') === '1'; } catch (e) { return false; }
}
function dashDismissGuide() {
  try { localStorage.setItem('svmmm_guide_seen', '1'); } catch (e) {}
  const d = document.querySelector('.dash-guide'); if (d) d.open = false;
}
function dashShowGuide() {
  try { localStorage.removeItem('svmmm_guide_seen'); } catch (e) {}
  const d = document.querySelector('.dash-guide');
  if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
function dashGuidePanel() {
  const mods = [
    ['puja', '🪔', window.t('nav_puja_s', 'Pooja & Seva'), window.t('guide_m_puja', 'Schedule rituals & sevas, record sevarthi, print invitations')],
    ['events', '📅', window.t('ev_title', 'Temple Events'), window.t('guide_m_events', 'Plan festivals — Navratri, Annakut, Patotsav')],
    ['visits', '🙏', window.t('vis_title', 'Bappa / Bhuvaji Visits'), window.t('guide_m_visits', 'Take the murti / Bhuvaji to a home or shop, with an escort team')],
    ['devotees', '👥', window.t('nav_devotees_s', 'Devotees'), window.t('guide_m_devotees', 'The master register used across donations, poojas & committees')],
    ['committees', '🏛️', window.t('cmt_title', 'Committee / Samaj'), window.t('guide_m_cmt', 'Construction governance bodies — members, meetings, attendance')],
    ['management', '🗂️', window.t('nav_management_s', 'Management Apps'), window.t('guide_m_mg', 'Volunteer teams — prasad, parking, decoration — rosters & badges')],
    ['donations', '💰', window.t('don_title', 'Donations'), window.t('guide_m_don', 'Cash & in-kind offerings, 80G receipts & certificates')],
    ['expenses', '💸', window.t('nav_expenses_s', 'Expenses'), window.t('guide_m_exp', 'Log temple spending against vouchers')],
    ['inventory', '📦', window.t('nav_inventory_s', 'Inventory'), window.t('guide_m_inv', 'Samagri, prasad & assets, with low-stock alerts')],
    ['calendar', '🗓️', window.t('cal_title', 'Unified Calendar'), window.t('guide_m_cal', 'Every dated item from every section on one grid')],
    ['reports', '📊', window.t('rep_title', 'Reports & Analytics'), window.t('guide_m_rep', 'Live month figures + downloadable registers (CSV / Excel / PDF)')],
    ['admin', '🛡️', window.t('acc_title', 'Accounts & Access'), window.t('guide_m_acc', 'Who has a login and what each person can open; audit trail')],
    ['settings', '⚙️', window.t('set_title', 'Platform Settings'), window.t('guide_m_set', 'Temple identity, language, and the working date that drives reports')]
  ].map(m => `<button class="dash-guide-mod" onclick="switchPage('${m[0]}')">
      <span class="dash-guide-ico">${m[1]}</span>
      <span class="dash-guide-mtext"><strong>${esc(m[2])}</strong><span>${esc(m[3])}</span></span>
    </button>`).join('');

  const tasks = [
    [window.t('guide_t_don', 'Record a donation & print an 80G receipt'), 'donations', window.t('don_record', 'Record Donation')],
    [window.t('guide_t_pooja', 'Schedule a pooja or festival seva'), 'puja', window.t('pj_schedule_btn', 'Schedule Pooja / Seva')],
    [window.t('guide_t_fest', 'Plan a festival (Navratri, Annakut…)'), 'events', window.t('ev_add', 'Add Event')],
    [window.t('guide_t_visit', 'Send Bappa / Bhuvaji to a home or shop'), 'visits', window.t('vis_add', 'Add Visit')],
    [window.t('guide_t_team', 'Start a volunteer team (parking, prasad…)'), 'management', window.t('nav_management_s', 'Management Apps')],
    [window.t('guide_t_login', 'Give someone login access'), 'admin', window.t('acc_title', 'Accounts & Access')],
    [window.t('guide_t_date', 'Change the working date or temple details'), 'settings', window.t('set_title', 'Settings')]
  ].map(t => `<tr><td>${esc(t[0])}</td>
      <td style="text-align:right;white-space:nowrap"><button class="btn btn-outline mg-btn-xs" onclick="switchPage('${t[1]}')">${esc(t[2])} →</button></td></tr>`).join('');

  const gloss = [
    ['Sevarthi', window.t('guide_g_sevarthi', 'The devotee family that sponsors and performs a pooja as seva.')],
    [window.t('guide_g_padh_k', 'Padhramani / Bhuvaji visit'), window.t('guide_g_padh', "Taking Maa's murti or the Bhuvaji to a devotee's home or shop for a blessing.")],
    [window.t('guide_g_cvm_k', 'Committee vs Management'), window.t('guide_g_cvm', 'Committee = construction governance bodies. Management = operational volunteer teams.')],
    [window.t('guide_g_date_k', 'Working date'), window.t('guide_g_date', 'The "today" every dashboard, report and status is measured against — set it in Settings.')],
    [window.t('guide_g_scope_k', '"Viewing as" (top bar)'), window.t('guide_g_scope', 'Preview the app as a limited login would see it. Switch back to Administrator any time.')]
  ].map(g => `<div><strong>${esc(g[0])}</strong><span>${esc(g[1])}</span></div>`).join('');

  return `
  <details class="dash-guide"${dashGuideSeen() ? '' : ' open'}>
    <summary>📖 ${window.t('guide_title', 'New here? How this platform works')}</summary>
    <div class="dash-guide-body">
      <p class="dash-guide-lead">${window.t('guide_lead', 'This is one platform for the whole temple. Pick a section from the sidebar, or use the shortcuts below. Every list has an “Add” button top-right, and every record opens a workspace with tabs.')}</p>
      <div class="dash-guide-sec">${window.t('guide_modules', 'What each section is for')}</div>
      <div class="dash-guide-mods">${mods}</div>
      <div class="dash-guide-sec">${window.t('guide_tasks', 'Common tasks — where to go')}</div>
      <div class="mg-table-scroll"><table class="custom-table dash-guide-tasks"><tbody>${tasks}</tbody></table></div>
      <div class="dash-guide-sec">${window.t('guide_glossary', 'Words used here')}</div>
      <div class="dash-guide-gloss">${gloss}</div>
      <button class="btn btn-outline mg-btn-xs dash-guide-hide" onclick="dashDismissGuide()">${window.t('guide_hide', 'Got it — hide this')}</button>
    </div>
  </details>`;
}

/* ---- needs-attention alerts ---- */
function dashAlerts() {
  const a = [];
  const f = dashFigures();
  if (f.donPledged) a.push({ txt: window.t('dash_a_pledged', 'donation pledge(s) awaiting realisation').replace('{n}', f.donPledged), n: f.donPledged, go: 'donations' });
  if (f.unconfirmedVisits) a.push({ txt: window.t('dash_a_visits', 'Bhuvaji visit request(s) to approve').replace('{n}', f.unconfirmedVisits), n: f.unconfirmedVisits, go: 'visits' });
  if (f.needSevarthi) a.push({ txt: window.t('dash_a_sevarthi', 'pooja(s) with no sevarthi recorded').replace('{n}', f.needSevarthi), n: f.needSevarthi, go: 'puja' });
  if (f.lowStock) a.push({ txt: window.t('dash_a_stock', 'inventory item(s) low or out of stock').replace('{n}', f.lowStock), n: f.lowStock, go: 'inventory' });
  if (typeof CMT !== 'undefined') {
    const weak = CMT.committees.filter(c => { const s = cmtMonthStats(c.id, dashMonthKey()); return s.rate > 0 && s.rate < 60; });
    if (weak.length) a.push({ txt: window.t('dash_a_attend', 'committee(s) with low meeting attendance').replace('{n}', weak.length), n: weak.length, go: 'committees' });
  }
  return a;
}

/* ---- shared blocks ---- */
function dashActivityCard(limit, filterFn) {
  let list = (typeof mergedActivity === 'function') ? mergedActivity(60) : [];
  if (filterFn) list = list.filter(filterFn);
  list = list.slice(0, limit || 8);
  return `<div class="card">
    <div class="card-header"><div class="card-title">${window.t('recent_activity', 'Recent Activity')}</div></div>
    <div class="card-body"><div class="summary-list">
      ${list.length ? list.map(x => `<div class="summary-item">
        <div><span class="badge badge-maroon" style="margin-right:6px">${esc(x.tag)}</span>${esc(x.text)}${x.ref ? `<div class="mg-muted-xs">${esc(x.ref)}</div>` : ''}</div>
        <span class="mg-muted-xs">${esc(x.when)}</span>
      </div>`).join('') : `<div class="mg-pad-note">${window.t('cal_nothing', 'Nothing yet.')}</div>`}
    </div></div>
  </div>`;
}
/** Access scope for a non-admin persona: which calendar types + owned ids
    the dashboard is allowed to surface. null = admin (everything). */
function personaScope(persona) {
  if (persona.kind === 'committee_leader' && typeof CMT !== 'undefined') {
    const ids = CMT.committees.filter(c => c.leaderId === persona.id).map(c => c.id);
    return { tag: 'Committee', types: ['committee'], ids: ids, own: e => ids.indexOf(e.scopeId) !== -1 };
  }
  if (persona.kind === 'pooja_coordinator' && typeof POOJA !== 'undefined') {
    const ids = (typeof poojasOfCoordinator === 'function' ? poojasOfCoordinator(persona.id) : []).map(p => p.id);
    return { tag: 'Pooja', types: ['pooja'], ids: ids, own: e => ids.indexOf(e.scopeId) !== -1 };
  }
  if (persona.kind === 'management_lead' && typeof MG !== 'undefined') {
    const ids = MG.managements.filter(m => m.leadId === persona.id).map(m => m.id);
    return { tag: 'Management', types: [], ids: ids, own: () => false };
  }
  return null;
}

function dashTodayCard(scope) {
  const items = dashTodayItems(scope);
  const title = scope ? window.t('dash_today_area', 'Today in your area')
                      : window.t('dash_today_temple', 'Today across the temple');
  const calBtn = (typeof canOpenPage === 'function' ? canOpenPage('calendar') : true)
    ? `<button class="btn btn-outline mg-btn-xs" onclick="switchPage('calendar')">${window.t('cal_title', 'Calendar')}</button>` : '';
  return `<div class="card">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">${title}</div>
      ${calBtn}
    </div>
    <div class="card-body" style="padding:0;">
      ${items.length ? `<div class="mg-table-scroll"><table class="custom-table">
        <tbody>${items.map((e, i) => `<tr>
          <td style="width:34px"><span class="dash-dot" style="background:${e.color}"></span></td>
          <td><strong>${esc(e.title)}</strong><div class="mg-muted-xs">${esc(e.sub)}</div></td>
          <td style="text-align:right"><button class="btn btn-outline mg-btn-xs" onclick="dashOpenCalItem(${i})">${window.t('open', 'Open')}</button></td>
        </tr>`).join('')}</tbody></table></div>` : `<div class="mg-pad-note">${window.t('dash_quiet', 'A quiet day — nothing scheduled.')}</div>`}
    </div>
  </div>`;
}
function dashOpenCalItem(i) {
  const items = dashTodayItems._cache || [];
  if (items[i] && typeof items[i].go === 'function') items[i].go();
}

/* ---- admin cockpit ---- */
function dashboardAdmin() {
  const f = dashFigures();
  const alerts = dashAlerts();
  return `
  ${dashGuidePanel()}

  <div class="stats-grid">
    ${kpiCard(window.t('dash_kpi_pooja', "Today's Poojas"), f.poojaToday, `${f.poojaUpcoming} ${window.t('cal_up_next', 'upcoming')}`, '🪔')}
    ${kpiCard(window.t('dash_kpi_don', 'Donations This Month'), '₹' + (f.donCash + f.donKind).toLocaleString('en-IN'), `${window.t('don_cash', 'cash')} ₹${f.donCash.toLocaleString('en-IN')} · ${window.t('don_kind', 'kind')} ₹${f.donKind.toLocaleString('en-IN')}`, '💰')}
    ${kpiCard(window.t('dash_kpi_accounts', 'Authorized Accounts'), f.accounts, window.t('dash_kpi_accounts_meta', 'With platform access'), '🛡️')}
    ${kpiCard(window.t('dash_kpi_month', 'This Month'), (f.meetings + f.events) + '', `${f.meetings} ${window.t('cmt_meetings_word', 'meetings')} · ${f.events} ${window.t('ev_title', 'events')}`, '🗓️')}
  </div>

  <div class="section-title mg-mt flex justify-between items-center">
    <span class="flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
    ${window.t('dash_glance', 'Your temple at a glance')}</span>
    <button class="btn btn-outline mg-btn-xs" onclick="dashShowGuide()">📖 ${window.t('guide_reopen', 'Guide')}</button>
  </div>
  <div class="dash-tiles">${dashModuleTiles({ kind: 'admin' })}</div>

  ${alerts.length ? `
  <div class="card mg-mt dash-alerts">
    <div class="card-header"><div class="card-title">⚠️ ${window.t('dash_attention', 'Needs attention')}</div></div>
    <div class="card-body"><div class="summary-list">
      ${alerts.map(x => `<div class="summary-item">
        <div><strong>${x.n}</strong> ${esc(x.txt)}</div>
        <button class="btn btn-outline mg-btn-xs" onclick="switchPage('${x.go}')">${window.t('open', 'Open')}</button>
      </div>`).join('')}
    </div></div>
  </div>` : ''}

  <div class="dashboard-2col mg-mt">
    ${dashTodayCard()}
    ${dashActivityCard(8)}
  </div>`;
}

/* ---- leader mini-dashboard ---- */
function dashboardLeader(persona) {
  const scope = personaScope(persona);
  let scopeCards = '', openBtn = '', tag = '';
  if (persona.kind === 'committee_leader' && typeof CMT !== 'undefined') {
    tag = 'Committee'; openBtn = `<button class="btn btn-primary" onclick="switchPage('committees')">${window.t('cmt_open_ws', 'Open my committee')} →</button>`;
    const mine = CMT.committees.filter(c => c.leaderId === persona.id);
    scopeCards = mine.map(c => {
      const s = cmtMonthStats(c.id, dashMonthKey());
      const nx = cmtNextMeeting(c.id);
      return dashScopeCard(c.name, [
        [window.t('cmt_members', 'Members'), cmtMembersOf(c.id).length],
        [window.t('cmt_kpi_meetings', 'Meetings (month)'), s.meetings],
        [window.t('cmt_attendance', 'Attendance'), (s.rate || 0) + '%'],
        [window.t('cmt_next', 'Next'), nx ? fmtDate(nx.date) + ' ' + fmtTime(nx.startTime) : '—']
      ], () => openCommittee(c.id));
    }).join('');
  } else if (persona.kind === 'pooja_coordinator' && typeof POOJA !== 'undefined') {
    tag = 'Pooja'; openBtn = `<button class="btn btn-primary" onclick="switchPage('puja')">${window.t('pj_open_ws', 'Open my poojas')} →</button>`;
    const mine = poojasOfCoordinator(persona.id);
    scopeCards = mine.map(p => dashScopeCard(p.name, [
      [window.t('pj_type', 'Type'), (typeById(p.typeId) || {}).name || '—'],
      [window.t('pj_schedule', 'Schedule'), dateRangeText(p)],
      [window.t('pj_sevarthi', 'Sevarthi'), sevarthisOf(p).length],
      [window.t('status'), poojaStatusLabel(poojaStatus(p))]
    ], () => openPooja(p.id))).join('');
  } else if (persona.kind === 'management_lead' && typeof MG !== 'undefined') {
    tag = 'Management'; openBtn = `<button class="btn btn-primary" onclick="switchPage('management')">${window.t('cmt_open_ws', 'Open my team')} →</button>`;
    const mine = MG.managements.filter(m => m.leadId === persona.id);
    scopeCards = mine.map(m => {
      const st = (typeof mgmtMonthStats === 'function') ? mgmtMonthStats(m.id, MG.reportMonth) : { sessions: 0, rate: 0 };
      return dashScopeCard(m.name, [
        [window.t('cmt_members', 'Members'), membersOf(m.id).length],
        [window.t('cmt_kpi_meetings', 'Sessions (month)'), st.sessions],
        [window.t('cmt_attendance', 'Attendance'), (st.rate || 0) + '%'],
        [window.t('status'), m.status]
      ], () => openManagement(m.id));
    }).join('');
  }

  return `
  <div class="dash-leader-head">
    <div>
      <span class="badge badge-maroon">${esc(window.t('role_' + persona.kind, tag + ' Leader'))}</span>
      <h2 class="mg-pane-title" style="margin-top:6px">${window.t('dash_your_area', 'Your area')}</h2>
    </div>
    ${openBtn}
  </div>
  <div class="dash-tiles">${scopeCards || `<div class="mg-pad-note">${window.t('dash_no_assign', 'Nothing assigned to you yet.')}</div>`}</div>
  <div class="dashboard-2col mg-mt">
    ${dashTodayCard(scope || { types: [], own: () => false })}
    ${dashActivityCard(8, x => x.tag === tag && (!scope || scope.ids.indexOf(x.scopeId) !== -1))}
  </div>`;
}
function dashScopeCard(title, rows, onOpen) {
  const fn = 'dashScope_' + Math.random().toString(36).slice(2);
  window[fn] = onOpen;
  return `<div class="dash-scope-card">
    <div class="dash-scope-title">${esc(title)}</div>
    <div class="dash-scope-grid">${rows.map(r => `<div><span>${esc(r[0])}</span><strong>${esc(String(r[1]))}</strong></div>`).join('')}</div>
    <button class="btn btn-outline mg-btn-xs" onclick="${fn}()">${window.t('open', 'Open')} →</button>
  </div>`;
}

function renderDashboard() {
  const root = document.getElementById('dashboardRoot');
  if (!root) return;
  const persona = activePersona();
  const nameEl = document.getElementById('bannerAdminName');
  if (nameEl) nameEl.textContent = persona.name;
  root.innerHTML = (persona.kind === 'admin') ? dashboardAdmin() : dashboardLeader(persona);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('dashboardRoot')) return;
  renderDashboard();
  if (typeof onLanguageChange === 'function') onLanguageChange(renderDashboard);
});
