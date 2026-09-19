/* ============================================================
   MAHA YAGNA SEVARTHI SIGNUPS — RENDER LAYER  (renders into #yagnaSignupsRoot)
   ============================================================ */

function renderYagnaSignups() {
  const root = document.getElementById('yagnaSignupsRoot');
  if (!root) return;
  // Admin-only (ROLE_META — no coordinator role fits, see people.js). Without
  // this guard the submitters' names/mobiles would still render into the DOM
  // for a scoped session even though #page-yagna-signups itself stays hidden.
  if (typeof accGuard === 'function' && !accGuard(root, 'yagna-signups')) return;
  root.innerHTML = viewYagnaSignups();
}

function setYagnaStatusFilter(v) { YAGNA.filterStatus = v; renderYagnaSignups(); }
function setYagnaInterestFilter(v) { YAGNA.filterInterest = v; renderYagnaSignups(); }
function yagnaSearch(v) { YAGNA.search = String(v || '').toLowerCase(); renderYagnaSignupsBody(); }

function yagnaEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function viewYagnaSignups() {
  const s = yagnaSummary();
  const settingsOn = !!YAGNA.settings.enabled;

  return `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">🔥 ${window.t('yagna_title', 'Maha Yagna Sevarthi Signups')}</h1>
      <p class="mg-page-sub">${window.t('yagna_subtitle', 'Public registration submissions — review, clean and later approve into Devotees/Committee/Sevarthi')}</p>
    </div>
    <div class="flex gap-2">
      ${typeof exportBar === 'function' ? exportBar('mod-yagna-signups') : ''}
      <button class="btn btn-primary" onclick="openYagnaSettingsSheet()">
        ⚙️ ${window.t('yagna_settings_btn', 'Registration Settings')}
      </button>
    </div>
  </div>

  <div class="card mg-mt" style="border-left:4px solid ${settingsOn ? 'var(--success,#3F8F5F)' : 'var(--danger,#B5443A)'}">
    <div class="card-body flex justify-between items-center" style="flex-wrap:wrap;gap:.5rem">
      <div>
        <strong>${settingsOn ? window.t('yagna_status_open', 'Public registration page is ON') : window.t('yagna_status_closed', 'Public registration page is OFF')}</strong>
        ${(YAGNA.settings.opensAt || YAGNA.settings.closesAt) ? `<div class="mg-muted-xs">
          ${YAGNA.settings.opensAt ? window.t('yagna_opens_at', 'Opens') + ' ' + yagnaEsc(YAGNA.settings.opensAt.replace('T', ' ')) : ''}
          ${YAGNA.settings.closesAt ? ' · ' + window.t('yagna_closes_at', 'Closes') + ' ' + yagnaEsc(YAGNA.settings.closesAt.replace('T', ' ')) : ''}
        </div>` : `<div class="mg-muted-xs">${window.t('yagna_no_window', 'No open/close window set — stays open until turned off.')}</div>`}
      </div>
      <a class="btn btn-outline mg-btn-xs" href="/yagna" target="_blank" rel="noopener">${window.t('yagna_view_page', 'View public page ↗')}</a>
    </div>
  </div>

  <div class="stats-grid mg-mt">
    ${typeof kpiCard === 'function' ? kpiCard(window.t('yagna_kpi_total', 'Total Submissions'), s.total, window.t('yagna_kpi_total_meta', 'All time'), '📝') : ''}
    ${typeof kpiCard === 'function' ? kpiCard(window.t('yagna_st_submitted', 'Submitted'), s.byStatus.submitted, window.t('yagna_kpi_pending', 'Awaiting review'), '🕒') : ''}
    ${typeof kpiCard === 'function' ? kpiCard(window.t('yagna_st_reviewed', 'Reviewed'), s.byStatus.reviewed, window.t('yagna_kpi_reviewed', 'Cleaned, ready to approve'), '✅') : ''}
    ${typeof kpiCard === 'function' ? kpiCard(window.t('yagna_kpi_contribution', 'Expected Contribution'), yagnaMoney(s.totalContribution), window.t('yagna_kpi_contribution_meta', 'Sum of all entries'), '🪔') : ''}
  </div>

  <div class="section-title mg-mt"><span>📋 ${window.t('yagna_register', 'Registration register')}</span></div>
  <div class="card">
    <div class="card-header flex justify-between items-center" style="flex-wrap:wrap;gap:.5rem">
      <div class="flex gap-2 items-center" style="flex-wrap:wrap">
        <select class="form-select mg-inline-select" onchange="setYagnaStatusFilter(this.value)">
          <option value="all" ${YAGNA.filterStatus === 'all' ? 'selected' : ''}>${window.t('yagna_all', 'All statuses')}</option>
          ${YAGNA_STATUSES.map(st =>
            `<option value="${st}" ${YAGNA.filterStatus === st ? 'selected' : ''}>${yagnaStatusLabel(st)}</option>`).join('')}
        </select>
        <select class="form-select mg-inline-select" onchange="setYagnaInterestFilter(this.value)">
          <option value="all" ${YAGNA.filterInterest === 'all' ? 'selected' : ''}>${window.t('yagna_all_interests', 'All interests')}</option>
          ${YAGNA_INTEREST_TYPES.map(it =>
            `<option value="${it}" ${YAGNA.filterInterest === it ? 'selected' : ''}>${yagnaInterestLabel(it)}</option>`).join('')}
        </select>
        <input class="form-input mg-inline-select" style="max-width:260px" placeholder="${window.t('yagna_search', 'Search name / mobile / samaj / city / token…')}"
          value="${yagnaEsc(YAGNA.search)}" oninput="yagnaSearch(this.value)">
      </div>
    </div>
    <div class="card-body" style="padding:0">
      <div class="mg-table-scroll"><table class="custom-table" style="min-width:900px">
        <thead><tr>
          <th>${window.t('yagna_token', 'Token')}</th><th>${window.t('name', 'Name')}</th>
          <th>${window.t('yagna_interest', 'Interested In')}</th>
          <th>${window.t('yagna_samaj', 'Samaj (as entered)')}</th><th>${window.t('city', 'City')}</th>
          <th>${window.t('mobile', 'Mobile')}</th><th>${window.t('yagna_contribution', 'Contribution')}</th>
          <th>${window.t('status', 'Status')}</th><th>${window.t('yagna_submitted', 'Submitted')}</th><th></th>
        </tr></thead>
        <tbody id="yagnaRegisterBody">${yagnaRegisterRows()}</tbody>
      </table></div>
    </div>
  </div>

  <div class="section-title mg-mt"><span>🗂️ ${window.t('yagna_samaj_breakdown', 'Samaj names as submitted')}</span></div>
  <p class="mg-page-sub" style="margin-top:-.4rem">${window.t('yagna_samaj_breakdown_hint', 'Raw, unnormalised — the same committee may appear under several spellings. Use this to decide which real Committees to create/map before approving.')}</p>
  <div class="card"><div class="card-body" style="padding:0">
    <div class="mg-table-scroll"><table class="custom-table" style="min-width:360px">
      <thead><tr><th>${window.t('yagna_samaj', 'Samaj (as entered)')}</th><th>${window.t('yagna_count', 'Count')}</th></tr></thead>
      <tbody>${yagnaSamajBreakdownRows()}</tbody>
    </table></div>
  </div></div>`;
}

function yagnaSamajBreakdownRows() {
  const rows = yagnaSamajBreakdown();
  if (!rows.length) return `<tr><td colspan="2" class="mg-pad-note">${window.t('yagna_none', 'No registrations yet.')}</td></tr>`;
  return rows.map(r => `<tr><td>${yagnaEsc(r.name)}</td><td>${r.count}</td></tr>`).join('');
}

function renderYagnaSignupsBody() {
  const b = document.getElementById('yagnaRegisterBody');
  if (b) b.innerHTML = yagnaRegisterRows();
}

function yagnaRegisterRows() {
  let rows = YAGNA.list.slice();
  if (YAGNA.filterStatus !== 'all') rows = rows.filter(x => x.status === YAGNA.filterStatus);
  if (YAGNA.filterInterest !== 'all') rows = rows.filter(x => (x.interestType || 'yagna') === YAGNA.filterInterest);
  if (YAGNA.search) {
    const q = YAGNA.search;
    rows = rows.filter(x => (x.firstName + ' ' + x.lastName + ' ' + x.mobile + ' ' + x.samajName + ' ' + x.city + ' ' + (x.code || '')).toLowerCase().indexOf(q) !== -1);
  }
  rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!rows.length) return `<tr><td colspan="10" class="mg-pad-note">${window.t('yagna_none', 'No registrations yet.')}</td></tr>`;
  return rows.map(x => {
    const similar = yagnaSimilarTo(x);
    return `<tr>
    <td><strong>${yagnaEsc(x.code)}</strong>${similar.length ? `<div class="mg-muted-xs" style="color:var(--warning,#B06A12)" title="${window.t('yagna_similar_hint', 'Shares mobile, or name+city, with another registration — review before treating as a new person.')}">⚠ ${window.t('yagna_similar', 'Possible duplicate')} (${similar.length})</div>` : ''}</td>
    <td>${yagnaEsc((x.firstName + ' ' + x.lastName).trim())}</td>
    <td><span class="badge ${YAGNA_INTEREST_BADGE[x.interestType] || 'badge-maroon'}">${yagnaEsc(yagnaInterestLabel(x.interestType))}</span></td>
    <td>${yagnaEsc(x.samajName || '—')}</td>
    <td>${yagnaEsc(x.city || '—')}</td>
    <td>${yagnaEsc(x.mobile)}</td>
    <td>${yagnaMoney(x.expectedContribution)}</td>
    <td><span class="badge ${YAGNA_STATUS_BADGE[x.status] || 'badge-pending'}">${yagnaEsc(yagnaStatusLabel(x.status))}</span></td>
    <td class="mg-muted-xs">${yagnaEsc(yagnaDate(x.createdAt))}</td>
    <td class="flex gap-1">
      <button class="btn btn-outline mg-btn-xs" onclick="openYagnaReviewSheet('${yagnaEsc(x.code)}')">${window.t('review', 'Review')}</button>
      <button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="yagnaDeleteConfirm('${yagnaEsc(x.code)}')">${window.t('delete', 'Delete')}</button>
    </td>
  </tr>`;
  }).join('');
}

/* ---------- export builder ---------- */
function yagnaExport() {
  return {
    filename: 'maha-yagna-sevarthi-signups',
    title: window.t('yagna_title', 'Maha Yagna Sevarthi Signups'),
    columns: ['Token', 'First Name', 'Last Name', 'Interested In', 'Samaj (as entered)', 'City', 'State', 'Mobile', 'Contribution (INR)', 'Status', 'Submitted'],
    rows: YAGNA.list.map(x => [
      x.code, x.firstName, x.lastName, yagnaInterestLabel(x.interestType), x.samajName, x.city, x.state, x.mobile,
      Number(x.expectedContribution) || 0, x.status, x.createdAt || '',
    ]),
    meta: [window.t('yagna_kpi_total', 'Total Submissions') + ': ' + YAGNA.list.length],
  };
}
if (typeof registerExport === 'function') registerExport('mod-yagna-signups', yagnaExport);

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('yagnaSignupsRoot')) return;
  renderYagnaSignups();
  if (typeof onLanguageChange === 'function') onLanguageChange(() => renderYagnaSignups());
});
