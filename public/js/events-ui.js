/* ============================================================
   EVENTS — RENDER LAYER  (renders into #eventsRoot)
   ============================================================ */

function renderEvents() {
  const root = document.getElementById('eventsRoot');
  if (!root) return;
  root.innerHTML = (EV.view === 'workspace' && EV.activeEventId && eventById(EV.activeEventId))
    ? viewEventWorkspace() : viewEventsDirectory();
}
function openEvent(id) { EV.activeEventId = id; EV.view = 'workspace'; EV.activeTab = 'overview'; renderEvents(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function backToEventsDirectory() { EV.view = 'directory'; EV.activeEventId = null; renderEvents(); }
function setEventTab(tab) { EV.activeTab = tab; renderEvents(); }

function viewEventsDirectory() {
  const list = EV.events.slice().sort((a, b) => ((evFirstDay(a) || {}).date || '').localeCompare((evFirstDay(b) || {}).date || ''));
  const monthKey = evToday().slice(0, 7);
  const nowKey = evToday() + ' ' + evNow();
  const upcoming = list.filter(e => evDays(e).some(d => (d.date + ' ' + d.endTime) >= nowKey)).length;
  const footfall = list.filter(e => (evFirstDay(e) || {}).date && (evFirstDay(e).date.indexOf(monthKey) === 0)).reduce((s, e) => s + (e.expectedFootfall || 0), 0);

  return `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">📅 ${window.t('ev_title', 'Temple Events')}</h1>
      <p class="mg-page-sub">${window.t('ev_sub', 'Festivals, mahotsavs and seva programmes')}</p>
    </div>
    <div class="flex gap-2">
      ${typeof exportBar === 'function' ? exportBar('mod-events') : ''}
      <button class="btn btn-primary" onclick="openAddEvent()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        ${window.t('ev_add', 'Add Event')}
      </button>
    </div>
  </div>

  <div class="stats-grid">
    ${kpiCard(window.t('ev_kpi_total', 'Total Events'), list.length, window.t('ev_kpi_total_meta', 'On the calendar'), '📅')}
    ${kpiCard(window.t('ev_kpi_upcoming', 'Upcoming'), upcoming, window.t('ev_kpi_upcoming_meta', 'Still to come'), '⏭️')}
    ${kpiCard(window.t('ev_kpi_footfall', 'Expected Footfall'), locNum(footfall), locMonthYear(+monthKey.split('-')[0], +monthKey.split('-')[1] - 1), '👥')}
    ${kpiCard(window.t('ev_kpi_types', 'Event Types'), EV.eventTypes.length, window.t('ev_kpi_types_meta', 'Master list'), '📜')}
  </div>

  <div class="section-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>${window.t('ev_open_ws', 'Open an Event')}</span></div>
  <div class="mg-card-grid">${list.map(e => eventCard(e)).join('')}</div>

  ${typeof annualEventsSection === 'function' ? annualEventsSection() : ''}

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center">
      <div class="card-title">${window.t('ev_type_catalog', 'Event Type Master List')} (${EV.eventTypes.length})</div>
      <button class="btn btn-primary mg-btn-xs" onclick="openAddEventType()">+ ${window.t('ev_type', 'Type')}</button>
    </div>
    <div class="card-body"><div class="pj-type-grid">${EV.eventTypes.map(t => {
      const used = EV.events.filter(e => e.typeId === t.id).length;
      return `<div class="pj-type-card">
        <div class="pj-type-top"><span class="pj-type-icon">${esc(t.icon || '📅')}</span>
          <div class="pj-type-head"><strong>${esc(t.name)}</strong><span class="mg-muted-xs">${esc(tData(t.category) || 'Event')}</span></div></div>
        ${t.description ? `<p class="pj-type-desc">${esc(t.description)}</p>` : ''}
        <div class="pj-type-foot"><span class="mg-muted-xs">${used ? used + ' ' + window.t('ev_records', 'event(s)') : window.t('ev_unused', 'Not used yet')}</span>
          <span class="flex gap-1"><button class="btn btn-outline mg-btn-xs" onclick="openEditEventType('${t.id}')">${window.t('edit')}</button>
          <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeleteEventType('${t.id}')">${window.t('delete')}</button></span></div>
      </div>`;
    }).join('')}</div></div>
  </div>`;
}

function eventCard(e) {
  const t = evTypeById(e.typeId);
  const st = evStatus(e);
  const days = evDays(e);
  return `
  <div class="mg-card" style="--mg-color:${e.color}">
    <div class="mg-card-stripe"></div>
    <div class="mg-card-top">
      <div class="mg-card-avatar" style="background:${e.color}">${esc(t ? t.icon : '📅')}</div>
      <div class="mg-card-heading"><h3>${esc(e.name)}</h3>
        <span class="badge ${EV_STATUS_BADGE[st]}">${EV_STATUS_DOT[st]} ${esc(evStatusLabel(st))}</span></div>
    </div>
    <p class="mg-card-desc">${esc(t ? t.name : 'Event')}${days.length > 1 ? ` · ${days.length} ${window.t('ev_days', 'days')}` : ''}</p>
    <div class="mg-card-meta">
      <div><span>${window.t('date')}</span><strong>${evDateRange(e)}</strong></div>
      <div><span>${window.t('venue')}</span><strong>${esc(e.venue || '—')}</strong></div>
      <div><span>${window.t('ev_incharge', 'In-charge')}</span><strong>${esc(evInchargeName(e))}</strong></div>
      <div><span>${window.t('ev_footfall', 'Footfall')}</span><strong>${(e.expectedFootfall || 0).toLocaleString('en-IN')}</strong></div>
    </div>
    <button class="btn btn-primary w-full mg-open-btn" onclick="openEvent('${e.id}')">${window.t('open')} →</button>
  </div>`;
}

const EV_TABS = [{ id:'overview', icon:'🏠' }, { id:'schedule', icon:'🗓️' }, { id:'settings', icon:'⚙️' }, { id:'activity', icon:'🕒' }];

function viewEventWorkspace() {
  const e = eventById(EV.activeEventId);
  if (!e) { EV.view = 'directory'; return viewEventsDirectory(); }
  const t = evTypeById(e.typeId);
  const st = evStatus(e);
  let body;
  switch (EV.activeTab) {
    case 'schedule': body = paneEventSchedule(e); break;
    case 'settings': body = paneEventSettings(e); break;
    case 'activity': body = paneEventActivity(e); break;
    default: body = paneEventOverview(e);
  }
  return `
  <div class="mg-ws" style="--mg-color:${e.color}">
    <button class="btn btn-outline mg-back" onclick="backToEventsDirectory()">← ${window.t('ev_title', 'Temple Events')}</button>
    <div class="mg-ws-header">
      <div class="mg-ws-id" style="background:${e.color}">${esc(t ? t.icon : '📅')}</div>
      <div class="mg-ws-titles"><h1>${esc(e.name)}</h1>
        <div class="mg-ws-sub">${esc(t ? t.name : 'Event')} <span class="mg-sep">•</span> ${evDateRange(e)}
        <span class="mg-sep">•</span> <span class="badge ${EV_STATUS_BADGE[st]}">${EV_STATUS_DOT[st]} ${esc(evStatusLabel(st))}</span></div>
      </div>
      <div class="mg-ws-actions">
        <button class="btn btn-outline" onclick="printEventNotice('${e.id}')">🖨 ${window.t('ev_notice', 'Notice / Invite')}</button>
        <button class="btn btn-primary" onclick="openEditEvent('${e.id}')">${window.t('edit')}</button>
      </div>
    </div>
    <div class="mg-tabs">${EV_TABS.map(x => `<button class="mg-tab ${EV.activeTab === x.id ? 'active' : ''}" onclick="setEventTab('${x.id}')"><span>${x.icon}</span> ${window.t('ev_tab_' + x.id, x.id)}</button>`).join('')}</div>
    <div class="mg-pane">${body}</div>
  </div>`;
}

function paneEventOverview(e) {
  const t = evTypeById(e.typeId);
  const days = evDays(e);
  const st = evStatus(e);
  return `
  <div class="stats-grid">
    ${kpiCard(window.t('status'), evStatusLabel(st), days.length + ' ' + window.t('ev_days', 'day(s)'), '📌')}
    ${kpiCard(window.t('ev_footfall', 'Expected Footfall'), (e.expectedFootfall || 0).toLocaleString('en-IN'), '', '👥')}
    ${kpiCard(window.t('ev_budget', 'Budget'), '₹' + (e.budget || 0).toLocaleString('en-IN'), window.t('ev_estimate', 'Estimate'), '💸')}
    ${kpiCard(window.t('ev_incharge', 'In-charge'), evInchargeName(e), '', '🧑‍💼')}
  </div>
  <div class="card mg-mt"><div class="card-header flex justify-between items-center"><div class="card-title">${window.t('ev_schedule', 'Schedule')}</div>
    <button class="btn btn-outline mg-btn-xs" onclick="openEditEvent('${e.id}')">${window.t('ev_manage_days', 'Manage Days')}</button></div>
    <div class="card-body" style="padding:0;"><div class="mg-table-scroll"><table class="custom-table">
      <thead><tr><th>#</th><th>${window.t('date')}</th><th>${window.t('time')}</th><th>${window.t('venue')}</th></tr></thead>
      <tbody>${days.map((d, i) => `<tr><td>${i + 1}</td><td>${(typeof fmtDateLong === 'function') ? fmtDateLong(d.date) : fmtDate(d.date)}</td>
        <td>${fmtTime(d.startTime)} – ${fmtTime(d.endTime)}</td><td>${esc(e.venue || '—')}</td></tr>`).join('')}</tbody>
    </table></div></div>
  </div>
  ${e.notes ? `<div class="mg-note-box mg-mt"><strong>${window.t('notes')}:</strong> ${esc(e.notes)}</div>` : ''}
  <div class="card mg-mt"><div class="card-header"><div class="card-title">${window.t('recent_activity', 'Recent Activity')}</div></div>
    <div class="card-body"><div class="summary-list">${evActivityOf(e.id).slice(0, 6).map(a => `<div class="summary-item"><div><strong>${esc(a.text)}</strong></div><span class="mg-muted-xs">${esc(a.when)}</span></div>`).join('') || `<div class="mg-pad-note">—</div>`}</div></div>
  </div>`;
}

function paneEventSchedule(e) {
  const monthKey = EV.calendarYear + '-' + String(EV.calendarMonth + 1).padStart(2, '0');
  const y = EV.calendarYear, mo = EV.calendarMonth;
  const daysIn = new Date(y, mo + 1, 0).getDate();
  const startDow = (new Date(y, mo, 1).getDay() + 6) % 7;
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;
  for (let d = 1; d <= daysIn; d++) {
    const iso = monthKey + '-' + String(d).padStart(2, '0');
    const has = evDays(e).filter(x => x.date === iso);
    cells += `<div class="mg-cal-cell ${iso === evToday() ? 'mg-cal-today' : ''}">
      <div class="mg-cal-date">${d}${iso === evToday() ? `<span class="mg-cal-todaytag">${window.t('today', 'Today')}</span>` : ''}</div>
      ${has.map(x => `<div class="mg-cal-event" style="--c:${e.color}" title="${esc(tData(e.name))}"><div class="mg-ev-title">${esc(tData(e.name))}</div><div class="mg-ev-meta">${locTime(x.startTime)}–${locTime(x.endTime)}${e.venue ? ' · ' + esc(tData(e.venue)) : ''}</div></div>`).join('')}
    </div>`;
  }
  const trail = (7 - ((startDow + daysIn) % 7)) % 7;
  for (let i = 0; i < trail; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;
  return `
  <div class="flex justify-between items-center mg-pane-head">
    <div><h2 class="mg-pane-title">${window.t('ev_schedule', 'Schedule')}</h2></div>
    <div class="flex gap-2 items-center">
      <button class="btn btn-outline mg-btn-xs" onclick="shiftEvMonth(-1)">←</button>
      <strong class="mg-cal-label">${locMonthYear(y, mo)}</strong>
      <button class="btn btn-outline mg-btn-xs" onclick="shiftEvMonth(1)">→</button>
    </div>
  </div>
  <div class="card"><div class="card-body">
    <div class="mg-cal-head">${locDowShort().map(x => `<div>${x}</div>`).join('')}</div>
    <div class="mg-cal-grid">${cells}</div>
  </div></div>`;
}
function shiftEvMonth(delta) {
  let mo = EV.calendarMonth + delta, yr = EV.calendarYear;
  if (mo < 0) { mo = 11; yr--; } if (mo > 11) { mo = 0; yr++; }
  EV.calendarMonth = mo; EV.calendarYear = yr; renderEvents();
}

function paneEventSettings(e) {
  const statusOpts = ['planning', 'confirmed', 'ongoing', 'completed', 'cancelled']
    .map(s => `<option value="${s}" ${e.status === s ? 'selected' : ''}>${esc(evStatusLabel(s))}</option>`).join('');
  return `
  <div class="card"><div class="card-body"><form onsubmit="saveEventSettings(event,'${e.id}')">
    <div class="grid mg-2col-form">
      <div class="form-group"><label class="form-label">${window.t('status')}</label><select class="form-select" id="evSetStatus">${statusOpts}</select></div>
      <div class="form-group"><label class="form-label">${window.t('ev_footfall', 'Expected Footfall')}</label><input class="form-input" type="number" id="evSetFootfall" value="${e.expectedFootfall || 0}"></div>
    </div>
    <div class="form-group"><label class="form-label">${window.t('ev_budget', 'Budget')} (₹)</label><input class="form-input" type="number" id="evSetBudget" value="${e.budget || 0}"></div>
    <div class="form-group"><label class="form-label">${window.t('notes')}</label><textarea class="form-input mg-textarea" id="evSetNotes" rows="3">${esc(e.notes || '')}</textarea></div>
    <div class="flex gap-2"><button class="btn btn-primary" type="submit">${window.t('save')}</button>
      <button class="btn btn-outline mg-btn-danger" type="button" onclick="confirmDeleteEvent('${e.id}')">${window.t('ev_delete', 'Delete Event')}</button></div>
  </form></div></div>`;
}
function saveEventSettings(ev, id) {
  ev.preventDefault();
  const e = eventById(id); if (!e) return;
  e.status = document.getElementById('evSetStatus').value;
  e.expectedFootfall = parseInt(document.getElementById('evSetFootfall').value, 10) || 0;
  e.budget = parseInt(document.getElementById('evSetBudget').value, 10) || 0;
  e.notes = document.getElementById('evSetNotes').value.trim();
  evLog(id, window.t('ev_updated', 'Event updated'));
  evToast(window.t('save') + ' ✓');
  renderEvents();
}

function paneEventActivity(e) {
  const list = evActivityOf(e.id);
  return `<div class="card"><div class="card-body"><div class="summary-list">
    ${list.length ? list.map(a => `<div class="summary-item"><div><strong>${esc(a.text)}</strong></div><span class="mg-muted-xs">${esc(a.when)}</span></div>`).join('') : `<div class="mg-pad-note">—</div>`}
  </div></div></div>`;
}

/* ---- printable event notice (reuses temple imagery) ---- */
function printEventNotice(id) {
  const e = eventById(id); if (!e) return;
  const t = evTypeById(e.typeId);
  const days = evDays(e);
  const inner = `
  <div class="pj-invite pj-invite--festival" style="--c:${e.color}">
    <span class="pj-invite-corner pj-tl"><svg viewBox="0 0 60 60"><g fill="none" stroke="currentColor" stroke-width="1.1"><path d="M2 2 H40 M2 2 V40"/><path d="M2 14 Q14 14 14 2"/><circle cx="14" cy="14" r="3"/></g></svg></span>
    <span class="pj-invite-corner pj-tr"><svg viewBox="0 0 60 60"><g fill="none" stroke="currentColor" stroke-width="1.1"><path d="M2 2 H40 M2 2 V40"/><path d="M2 14 Q14 14 14 2"/><circle cx="14" cy="14" r="3"/></g></svg></span>
    <span class="pj-invite-corner pj-bl"><svg viewBox="0 0 60 60"><g fill="none" stroke="currentColor" stroke-width="1.1"><path d="M2 2 H40 M2 2 V40"/><path d="M2 14 Q14 14 14 2"/><circle cx="14" cy="14" r="3"/></g></svg></span>
    <span class="pj-invite-corner pj-br"><svg viewBox="0 0 60 60"><g fill="none" stroke="currentColor" stroke-width="1.1"><path d="M2 2 H40 M2 2 V40"/><path d="M2 14 Q14 14 14 2"/><circle cx="14" cy="14" r="3"/></g></svg></span>
    <img class="pj-invite-hero" src="${(typeof assetURL === 'function') ? assetURL('assets/temple.png') : 'assets/temple.png'}" alt="" onerror="this.style.display='none'">
    <div class="pj-invite-frame">
      <img class="pj-invite-emblem" src="${(typeof assetURL === 'function') ? assetURL('assets/icon.png') : 'assets/icon.png'}" alt="" onerror="this.style.display='none'">
      <div class="pj-invite-temple">Shri Vihat Meldi Mata Mandir</div>
      <div class="pj-invite-temple-sub">Sanand, Gujarat</div>
      <div class="pj-invite-invocation">${esc(window.t('ev_invite_line', 'You are cordially invited to'))}</div>
      <h1 class="pj-invite-headline">${esc(e.name)}</h1>
      ${t ? `<div class="pj-invite-type">${esc(t.name)}</div>` : ''}
      <div class="pj-invite-schedule">
        <span class="pj-invite-schedule-h">${esc(window.t('ev_schedule', 'Schedule'))}</span>
        ${days.map(d => `<div class="pj-invite-schedule-row"><strong>${(typeof fmtDateLong === 'function') ? fmtDateLong(d.date) : fmtDate(d.date)}</strong><span>${fmtTime(d.startTime)}–${fmtTime(d.endTime)}${e.venue ? ' · ' + esc(e.venue) : ''}</span></div>`).join('')}
      </div>
      <div class="pj-invite-blessing">${esc(window.t('banner_khamma', 'ખમ્મા માડી, ખમ્મા 🙏'))}</div>
      <div class="pj-invite-foot">Jai Shri Vihat Meldi Mataji 🙏</div>
    </div>
  </div>`;
  if (typeof printInvitationHTML === 'function') printInvitationHTML(inner, e.name);
  else if (typeof printDonationHTML === 'function') printDonationHTML(inner, 'don-print-cert');
}

function eventsExport() {
  return {
    filename: 'temple-events',
    title: window.t('ev_title', 'Temple Events'),
    subtitle: window.t('ev_sub', 'Festivals, mahotsavs and seva programmes'),
    columns: ['Event', 'Type', 'Dates', 'Venue', 'In-charge', 'Footfall', 'Budget (INR)', 'Status'],
    rows: EV.events.map(e => [e.name, evTypeName(e), evDateRange(e), e.venue, evInchargeName(e),
      e.expectedFootfall || 0, e.budget || 0, evStatus(e)])
  };
}
if (typeof registerExport === 'function') registerExport('mod-events', eventsExport);
function exportEventsCSV() { if (typeof runExport === 'function') runExport('mod-events', 'csv'); }
