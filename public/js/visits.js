/* ============================================================
   BAPPA / BHUVAJI VISITS
   ------------------------------------------------------------
   A "padhramani" — the deity's murti (or the Bhuvaji, the
   temple's oracle/medium who channels Maa) visits a devotee's
   new home, shop or a family function to bless it. Each visit
   needs a date/time, the full address, and an ESCORT TEAM —
   the temple volunteers who carry the palki / murti, manage
   the aarti thali, crowd and the return journey safely.
   Single-file module, renders into #visitsRoot, uses the
   generic openSheet() for its add/edit form.
   ============================================================ */

if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
  window.onLanguageChange = function () {};
}

const VISITS = {
  today: '2026-09-06',
  filterStatus: 'all',
  search: '',
  editingId: null,

  purposes: ['home_inauguration', 'shop_opening', 'wedding_blessing', 'health_blessing', 'business_puja', 'festival_padhramani', 'other'],
  teams: [],

  list: []
};

function visToday() { return (typeof MG !== 'undefined' && MG.today) ? MG.today : VISITS.today; }
function visToast(m) { if (typeof showToast === 'function') showToast(m); }
const visitById = id => VISITS.list.find(v => v.id === id);

function visitPurposeLabel(p) { return window.t('vis_p_' + p, (p || '').replace(/_/g, ' ')); }
function visitStatusLabel(s) { return window.t('vis_s_' + s, (s || '').charAt(0).toUpperCase() + (s || '').slice(1)); }
const VIS_STATUS_BADGE = { requested:'badge-pending', scheduled:'badge-pending', confirmed:'badge-confirmed', completed:'badge-maroon', cancelled:'badge-cancelled' };

function renderVisits() {
  const root = document.getElementById('visitsRoot');
  if (!root) return;
  const q = (VISITS.search || '').toLowerCase();
  const list = VISITS.list.filter(v => {
    if (VISITS.filterStatus !== 'all' && v.status !== VISITS.filterStatus) return false;
    if (q && [v.devoteeName, v.mobile, v.address, v.city, visitPurposeLabel(v.purpose)].join(' ').toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

  const nowKey = visToday();
  const upcoming = VISITS.list.filter(v => v.date >= nowKey && v.status !== 'cancelled' && v.status !== 'completed').length;
  const pending = VISITS.list.filter(v => v.status === 'requested').length;

  root.innerHTML = `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">🙏 ${window.t('vis_title', 'Bappa / Bhuvaji Visits')}</h1>
      <p class="mg-page-sub">${window.t('vis_sub', 'Padhramani to homes, shops and family functions — with an escort team')}</p>
    </div>
    <button class="btn btn-primary" onclick="openAddVisit()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      ${window.t('vis_add', 'Add Visit')}
    </button>
  </div>

  <div class="stats-grid">
    ${kpiCard(window.t('vis_kpi_total', 'Total Visits'), VISITS.list.length, '', '🙏')}
    ${kpiCard(window.t('vis_kpi_upcoming', 'Upcoming'), upcoming, window.t('vis_kpi_upcoming_meta', 'Scheduled / confirmed'), '📅')}
    ${kpiCard(window.t('vis_kpi_pending', 'Awaiting Approval'), pending, window.t('vis_kpi_pending_meta', 'New requests'), '⏳')}
    ${kpiCard(window.t('vis_kpi_teams', 'Escort Teams'), VISITS.teams.length, window.t('vis_kpi_teams_meta', 'On the roster'), '👷')}
  </div>

  <div class="card mg-mt">
    <div class="card-header flex justify-between items-center" style="flex-wrap:wrap; gap:0.5rem;">
      <div class="card-title">${window.t('vis_register', 'Visit Register')}</div>
      <div class="flex gap-2" style="flex-wrap:wrap;">
        ${typeof exportBar === 'function' ? exportBar('mod-visits') : ''}
        <select class="form-select mg-inline-select" onchange="VISITS.filterStatus=this.value; renderVisits()">
          <option value="all" ${VISITS.filterStatus === 'all' ? 'selected' : ''}>${window.t('all')} ${window.t('status')}</option>
          ${['requested', 'scheduled', 'confirmed', 'completed', 'cancelled'].map(s => `<option value="${s}" ${VISITS.filterStatus === s ? 'selected' : ''}>${esc(visitStatusLabel(s))}</option>`).join('')}
        </select>
        <input class="form-input mg-inline-search" placeholder="${window.t('search')}…" value="${esc(VISITS.search)}" oninput="VISITS.search=this.value; renderVisits()">
      </div>
    </div>
    <div class="card-body" style="padding:0;">
      <div class="mg-table-scroll">
        <table class="custom-table" style="min-width:900px;">
          <thead><tr>
            <th>${window.t('vis_devotee', 'Devotee')}</th><th>${window.t('vis_purpose', 'Purpose')}</th>
            <th>${window.t('vis_address', 'Address')}</th><th>${window.t('vis_datetime', 'Date & Time')}</th>
            <th>${window.t('vis_escort', 'Escort Team')}</th><th>${window.t('status')}</th><th>${window.t('actions')}</th>
          </tr></thead>
          <tbody>${list.length ? list.map(v => `
            <tr>
              <td><strong>${esc(v.devoteeName)}</strong>${v.mobile ? `<div class="mg-muted-xs">${esc(v.mobile)}</div>` : ''}</td>
              <td><span class="badge badge-maroon">${esc(visitPurposeLabel(v.purpose))}</span></td>
              <td>${esc(v.address || '')}${v.city ? `<div class="mg-muted-xs">${esc(v.city)}${v.state ? ', ' + esc(v.state) : ''}</div>` : ''}</td>
              <td>${(typeof fmtDate === 'function') ? fmtDate(v.date) : v.date}${v.time ? `<div class="mg-muted-xs">${(typeof fmtTime === 'function') ? fmtTime(v.time) : v.time}</div>` : ''}</td>
              <td>${esc(v.escortTeam || '—')}</td>
              <td><span class="badge ${VIS_STATUS_BADGE[v.status] || 'badge-pending'}">${esc(visitStatusLabel(v.status))}</span></td>
              <td><div class="flex gap-1">
                ${v.mobile ? `<a class="btn btn-outline mg-btn-xs" href="tel:${esc(v.mobile)}">📞</a>` : ''}
                <button class="btn btn-outline mg-btn-xs" onclick="openEditVisit('${v.id}')">${window.t('edit')}</button>
                <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="confirmDeleteVisit('${v.id}')">${window.t('delete')}</button>
              </div></td>
            </tr>`).join('') : `<tr><td colspan="7" class="mg-empty-cell">${window.t('vis_none', 'No visits match.')}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="mg-advice mg-mt-sm">
    ${window.t('vis_explain', 'A padhramani is when Maa\'s murti or the Bhuvaji (the temple oracle) is taken to a devotee\'s home / shop for a blessing. The escort team is the volunteer group that carries the palki, manages the aarti thali and crowd, and brings everything back safely.')}
  </div>`;
}

/* People from the shared register, for the devotee dropdown. */
function visPeople() {
  if (typeof allPeople === 'function') return allPeople();
  if (typeof templePeople === 'function') return templePeople();
  return [];
}
function visDevoteeOptions(v) {
  v = v || {};
  const people = visPeople();
  let matched = false;
  let opts = `<option value="">— ${window.t('vis_pick_devotee', 'pick a devotee')} —</option>`;
  opts += people.map(p => {
    const sel = (v.devoteeId && String(p.id) === String(v.devoteeId)) ||
                (!v.devoteeId && v.devoteeName && p.name === v.devoteeName);
    if (sel) matched = true;
    return `<option value="${esc(p.id)}" ${sel ? 'selected' : ''}>${esc(p.name)}${p.mobile ? ' · ' + esc(p.mobile) : ''}${p.city ? ' · ' + esc(p.city) : ''}</option>`;
  }).join('');
  if (v.devoteeName && !matched) {
    opts += `<option value="name:${esc(v.devoteeName)}" selected>${esc(v.devoteeName)} (${window.t('vis_not_in_register', 'not in register')})</option>`;
  }
  return opts;
}
/* Auto-fill mobile / city from the chosen devotee when those fields are blank. */
function visOnDevoteePick() {
  const sel = document.getElementById('visDevoteeSelect');
  if (!sel || !sel.value || sel.value.indexOf('name:') === 0) return;
  const p = visPeople().find(x => String(x.id) === String(sel.value));
  if (!p) return;
  const m = document.getElementById('visMobile');
  if (m && !m.value.trim() && p.mobile) m.value = String(p.mobile).replace(/\D/g, '').slice(0, 10);
  const c = document.getElementById('visCity');
  if (c && !c.value.trim() && p.city) c.value = p.city;
}
/* "+ Add new devotee" — the shared devotee sheet, opened ON TOP of this form. */
function visAddDevotee() {
  if (typeof openDevoteeSheet !== 'function') { visToast('Devotee form unavailable'); return; }
  openDevoteeSheet({
    title: window.t('vis_add_devotee', 'Add a new devotee'),
    onSaved: function (dev) {
      const sel = document.getElementById('visDevoteeSelect');
      if (!sel) return;
      let o = Array.prototype.slice.call(sel.options).find(x => String(x.value) === String(dev.id));
      if (!o) {
        o = document.createElement('option');
        o.value = dev.id;
        o.textContent = dev.name + (dev.mobile ? ' · ' + dev.mobile : '') + (dev.city ? ' · ' + dev.city : '');
        sel.appendChild(o);
      }
      sel.value = dev.id;
      visOnDevoteePick();
    }
  });
}

function visitFormBody(v) {
  v = v || {};
  const pOpts = VISITS.purposes.map(p => `<option value="${p}" ${v.purpose === p ? 'selected' : ''}>${esc(visitPurposeLabel(p))}</option>`).join('');
  const sOpts = ['requested', 'scheduled', 'confirmed', 'completed', 'cancelled'].map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${esc(visitStatusLabel(s))}</option>`).join('');
  return `
  <form id="formVisit" onsubmit="handleSaveVisit(event)">
    <div class="link-section">
      <div class="link-section-head">
        <p class="ls-title">${window.t('vis_devotee', 'Devotee')} <span class="ls-req">*</span></p>
        <button class="btn-add-devotee" type="button" onclick="visAddDevotee()">${window.t('vis_add_devotee', 'Add new devotee')}</button>
      </div>
      <div class="link-section-hint">${window.t('vis_devotee_hint', 'Pick from the register, or add a new devotee. Mobile fills in automatically.')}</div>
      <div class="grid mg-2col-form">
        <div class="form-group"><div class="link-field"><select class="form-select" id="visDevoteeSelect" onchange="visOnDevoteePick()" required>${visDevoteeOptions(v)}</select></div></div>
        <div class="form-group"><label class="form-label" for="visMobile">${window.t('mobile')}</label><input class="form-input" id="visMobile" maxlength="10" value="${esc(v.mobile || '')}"></div>
      </div>
    </div>
    <div class="grid mg-2col-form">
      <div class="form-group"><label class="form-label" for="visPurpose">${window.t('vis_purpose', 'Purpose')}</label><select class="form-select" id="visPurpose">${pOpts}</select></div>
      <div class="form-group"><label class="form-label" for="visStatus">${window.t('status')}</label><select class="form-select" id="visStatus">${sOpts}</select></div>
    </div>
    <div class="form-group"><label class="form-label" for="visAddress">${window.t('vis_address', 'Full Address')}</label><input class="form-input" id="visAddress" value="${esc(v.address || '')}" placeholder="House / shop no., society, landmark"></div>
    <div class="grid mg-2col-form">
      <div class="form-group"><label class="form-label" for="visCity">${window.t('city')}</label><input class="form-input" id="visCity" value="${esc(v.city || '')}"></div>
      <div class="form-group"><label class="form-label" for="visState">${window.t('state')}</label><input class="form-input" id="visState" value="${esc(v.state || 'Gujarat')}"></div>
    </div>
    <div class="grid mg-2col-form">
      <div class="form-group"><label class="form-label" for="visDate">${window.t('date')} *</label><input type="date" class="form-input" id="visDate" value="${esc(v.date || visToday())}" required></div>
      <div class="form-group"><label class="form-label" for="visTime">${window.t('time')}</label><input type="time" class="form-input" id="visTime" value="${esc(v.time || '11:00')}"></div>
    </div>
    <div class="form-group"><label class="form-label" for="visEscort">${window.t('vis_escort', 'Escort Team')}</label>
      <input class="form-input" id="visEscort" list="visTeamList" value="${esc(v.escortTeam || '')}" placeholder="${window.t('vis_escort_ph', 'Team that carries the palki & manages the visit')}">
      <datalist id="visTeamList">${((typeof teamNames === 'function' ? teamNames() : null) || VISITS.teams).map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>
    </div>
    <div class="form-group"><label class="form-label" for="visNotes">${window.t('notes')}</label><textarea class="form-input mg-textarea" id="visNotes" rows="2">${esc(v.notes || '')}</textarea></div>
  </form>`;
}

function openAddVisit() {
  VISITS.editingId = null;
  openSheet({
    title: window.t('vis_add', 'Add Visit'),
    body: visitFormBody(null),
    footer: `<button class="btn btn-outline" onclick="closeSheet()">${window.t('cancel')}</button>
             <button class="btn btn-primary" type="submit" form="formVisit">${window.t('save')}</button>`
  });
}
function openEditVisit(id) {
  const v = visitById(id); if (!v) return;
  VISITS.editingId = id;
  openSheet({
    title: window.t('vis_edit', 'Edit Visit'),
    body: visitFormBody(v),
    footer: `<button class="btn btn-outline" onclick="closeSheet()">${window.t('cancel')}</button>
             <button class="btn btn-primary" type="submit" form="formVisit">${window.t('save')}</button>`
  });
}
function handleSaveVisit(e) {
  e.preventDefault();
  const g = id => document.getElementById(id);
  const sel = g('visDevoteeSelect');
  const selVal = sel ? sel.value : '';
  let devoteeId = '';
  let name = '';
  if (selVal.indexOf('name:') === 0) {
    name = selVal.slice(5);
  } else if (selVal) {
    devoteeId = selVal;
    const p = visPeople().find(x => String(x.id) === String(selVal));
    name = p ? p.name
             : ((sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '').split(' · ')[0].trim());
  }
  if (!devoteeId && VISITS.editingId) {
    const prev = visitById(VISITS.editingId);
    if (prev && prev.devoteeId && name === prev.devoteeName) devoteeId = prev.devoteeId;
  }
  const date = g('visDate').value;
  if (!name) { visToast(window.t('vis_need_name', 'Pick a devotee, or add a new one.')); return; }
  if (!date) { visToast(window.t('vis_need_date', 'Date is required.')); return; }
  const fields = {
    devoteeId: devoteeId, devoteeName: name, mobile: g('visMobile').value.replace(/\D/g, '').slice(0, 10),
    purpose: g('visPurpose').value, status: g('visStatus').value,
    address: g('visAddress').value.trim(), city: g('visCity').value.trim(), state: g('visState').value.trim(),
    date, time: g('visTime').value, escortTeam: g('visEscort').value.trim(),
    notes: g('visNotes').value.trim()
  };
  if (VISITS.editingId) {
    Object.assign(visitById(VISITS.editingId), fields);
    visToast(name + ' — ' + window.t('save') + ' ✓');
  } else {
    let max = 0;
    VISITS.list.forEach(x => { const n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (n > max) max = n; });
    VISITS.list.push(Object.assign({ id: 'VIS-' + String(max + 1).padStart(3, '0') }, fields));
    visToast(window.t('vis_added', 'Visit added.'));
  }
  VISITS.editingId = null;
  if (typeof closeSheet === 'function') closeSheet();
  renderVisits();
  if (typeof renderUnifiedCalendar === 'function') renderUnifiedCalendar();
}
function confirmDeleteVisit(id) {
  const v = visitById(id); if (!v) return;
  openConfirm({
    title: window.t('vis_delete', 'Delete Visit'), danger: true,
    body: `<p><strong>${esc(v.devoteeName)}</strong> — ${esc(visitPurposeLabel(v.purpose))}</p>`,
    confirmLabel: window.t('delete'),
    onConfirm: () => { VISITS.list = VISITS.list.filter(x => x.id !== id); visToast(window.t('vis_deleted', 'Visit deleted.')); renderVisits(); }
  });
}

function visitsExport() {
  return {
    filename: 'bhuvaji-visits',
    title: window.t('vis_title', 'Bappa / Bhuvaji Visits'),
    subtitle: window.t('vis_sub', 'Padhramani register with escort teams'),
    columns: ['Devotee', 'Mobile', 'Purpose', 'Address', 'City', 'State', 'Date', 'Time', 'Escort Team', 'Status'],
    rows: VISITS.list.map(v => [v.devoteeName || '', v.mobile || '', visitPurposeLabel(v.purpose),
      v.address || '', v.city || '', v.state || '', v.date || '', v.time || '',
      v.escortTeam || '', visitStatusLabel(v.status)])
  };
}
if (typeof registerExport === 'function') registerExport('mod-visits', visitsExport);

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('visitsRoot')) return;
  renderVisits();
  if (typeof onLanguageChange === 'function') onLanguageChange(() => renderVisits());
});
