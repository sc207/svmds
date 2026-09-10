/* ============================================================
   DHAJA POOJA — RENDER LAYER  (renders into #dhajaRoot)
   Progress board + sponsorship register + special-days section.
   ============================================================ */

function renderDhaja() {
  const root = document.getElementById('dhajaRoot');
  if (!root) return;
  root.innerHTML = viewDhaja();
}

function setDhajaView(v) { DHAJA.view = v; renderDhaja(); }
function setDhajaStatusFilter(v) { DHAJA.filterStatus = v; renderDhaja(); }
function dhajaSearch(v) { DHAJA.search = String(v || '').toLowerCase(); renderDhajaRegisterBody(); }

function dhajaEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- top-level ---------- */
function viewDhaja() {
  const admin = dhajaIsAdmin();
  const totalRaised = dhajaGrandTotal().raised;   // true total, no double-count from the General bucket
  const feb = DHAJA.campaigns.find(c => c.targetCount === 108) || DHAJA.campaigns[0];

  return `
  <div class="flex justify-between items-center mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">🚩 ${window.t('dhaja_title', 'Dhaja Pooja')}</h1>
      <p class="mg-page-sub">${window.t('dhaja_subtitle', 'Sevarthis sponsor a dhaja — each sponsorship gets an 80G receipt')}</p>
    </div>
    <div class="flex gap-2">
      ${typeof exportBar === 'function' ? exportBar('mod-dhaja') : ''}
      ${admin ? `<button class="btn btn-outline" onclick="openDhajaCampaignForm()">+ ${window.t('dhaja_new_campaign', 'New Campaign')}</button>` : ''}
      ${admin ? `<button class="btn btn-primary" onclick="openSponsorDhaja()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        ${window.t('dhaja_sponsor_btn', 'Sponsor a Dhaja')}</button>` : ''}
    </div>
  </div>

  <div class="stats-grid">
    ${typeof kpiCard === 'function' ? kpiCard(window.t('dhaja_campaigns', 'Campaigns'), DHAJA.campaigns.length, window.t('dhaja_campaigns_meta', 'February + special days'), '🚩') : ''}
    ${typeof kpiCard === 'function' ? kpiCard(window.t('dhaja_sponsored', 'Sponsored'), DHAJA.sponsorships.filter(s => s.status !== 'cancelled').length, window.t('dhaja_sponsored_meta', 'Dhaja poojas booked'), '🙏') : ''}
    ${typeof kpiCard === 'function' ? kpiCard(window.t('dhaja_raised', 'Contributions'), dhajaMoney(totalRaised), window.t('dhaja_raised_meta', 'Total received'), '🧾') : ''}
    ${feb && typeof kpiCard === 'function' ? kpiCard(window.t('dhaja_remaining', 'Remaining (108)'), (dhajaProgress(feb).remaining != null ? dhajaProgress(feb).remaining : '—'), window.t('dhaja_remaining_meta', 'To reach 108'), '📿') : ''}
  </div>

  <div class="dhaja-boards">${DHAJA.campaigns.length
    ? DHAJA.campaigns.map(dhajaCampaignCard).join('')
    : `<div class="card mg-mt"><div class="card-body" style="text-align:center;padding:2rem 1rem">
        <div style="font-size:1.8rem">🚩</div>
        <p class="mg-page-sub">${window.t('dhaja_empty', 'No dhaja campaigns yet. Open one from a special day below, or use “Sponsor a Dhaja”.')}</p>
      </div></div>`}</div>

  <div class="section-title mg-mt"><span>🧾 ${window.t('dhaja_register', 'Sponsorship register')}</span></div>
  <div class="card">
    <div class="card-header flex justify-between items-center" style="flex-wrap:wrap;gap:.5rem">
      <div class="flex gap-2 items-center" style="flex-wrap:wrap">
        <select class="form-select mg-inline-select" onchange="setDhajaStatusFilter(this.value)">
          ${['all', 'sponsored', 'performed', 'cancelled'].map(s =>
            `<option value="${s}" ${DHAJA.filterStatus === s ? 'selected' : ''}>${s === 'all' ? window.t('dhaja_all', 'All') : dhajaStatusLabel(s)}</option>`).join('')}
        </select>
        <input class="form-input mg-inline-select" style="max-width:220px" placeholder="${window.t('dhaja_search', 'Search sponsor / receipt…')}"
          value="${dhajaEsc(DHAJA.search)}" oninput="dhajaSearch(this.value)">
      </div>
    </div>
    <div class="card-body" style="padding:0">
      <div class="mg-table-scroll"><table class="custom-table" style="min-width:760px">
        <thead><tr>
          <th>#</th><th>${window.t('dhaja_seq', 'Seq')}</th><th>${window.t('dhaja_form_person', 'Sponsor')}</th>
          <th>${window.t('dhaja_form_campaign', 'Campaign')}</th><th>${window.t('dhaja_form_amount', 'Amount')}</th>
          <th>${window.t('date')}</th><th>${window.t('dhaja_receipt', 'Receipt')}</th>
          <th>${window.t('status', 'Status')}</th>${dhajaIsAdmin() ? '<th></th>' : ''}
        </tr></thead>
        <tbody id="dhajaRegisterBody">${dhajaRegisterRows()}</tbody>
      </table></div>
    </div>
  </div>

  ${dhajaSpecialDaysSection()}`;
}

function renderDhajaRegisterBody() {
  const b = document.getElementById('dhajaRegisterBody');
  if (b) b.innerHTML = dhajaRegisterRows();
}

function dhajaRegisterRows() {
  const admin = dhajaIsAdmin();
  let rows = DHAJA.sponsorships.slice();
  if (DHAJA.filterStatus !== 'all') rows = rows.filter(s => s.status === DHAJA.filterStatus);
  if (DHAJA.search) {
    const q = DHAJA.search;
    rows = rows.filter(s => (s.sponsorName + ' ' + s.sponsorMobile + ' ' + (s.receiptNo || '') + ' ' + (s.code || '')).toLowerCase().indexOf(q) !== -1);
  }
  rows.sort((a, b) => (b.code || '').localeCompare(a.code || ''));
  if (!rows.length) return `<tr><td colspan="${admin ? 9 : 8}" class="mg-pad-note">${window.t('dhaja_none', 'No sponsorships yet.')}</td></tr>`;
  return rows.map((s, i) => {
    const c = dhajaCampaignById(s.campaignId);
    const rec = s.donationId
      ? `<button class="btn btn-outline mg-btn-xs" onclick="dhajaOpenReceipt('${dhajaEsc(s.donationId)}')">${dhajaEsc(s.receiptNo || window.t('view', 'View'))}</button>`
      : '<span class="mg-muted-xs">—</span>';
    return `<tr${s.status === 'cancelled' ? ' style="opacity:.55"' : ''}>
      <td>${i + 1}</td>
      <td>${s.seqNo != null ? '#' + s.seqNo : '—'}</td>
      <td><strong>${dhajaEsc(s.sponsorName)}</strong>${s.sponsorMobile ? `<div class="mg-muted-xs">${dhajaEsc(s.sponsorMobile)}</div>` : ''}</td>
      <td>${dhajaEsc(c ? (typeof tData === 'function' ? tData(c.name) : c.name) : s.campaignId || '—')}</td>
      <td>${dhajaMoney(s.pledgeAmount)}</td>
      <td>${dhajaDate(s.scheduledDate || s.performedDate)}</td>
      <td>${rec}</td>
      <td><span class="badge ${DHAJA_STATUS_BADGE[s.status] || 'badge-pending'}">${dhajaEsc(dhajaStatusLabel(s.status))}</span></td>
      ${admin ? `<td class="flex gap-1">
        ${s.status === 'sponsored' ? `<button class="btn btn-outline mg-btn-xs" onclick="dhajaMarkPerformed('${dhajaEsc(s.code)}')">${window.t('dhaja_mark_done', 'Done')}</button>` : ''}
        ${s.status !== 'cancelled' ? `<button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="dhajaCancel('${dhajaEsc(s.code)}')">${window.t('cancel', 'Cancel')}</button>` : ''}
      </td>` : ''}
    </tr>`;
  }).join('');
}

/* ---------- one campaign progress card ---------- */
function dhajaCampaignCard(c) {
  const p = dhajaProgress(c);
  const admin = dhajaIsAdmin();
  const bar = p.pct != null
    ? `<div class="dhaja-bar"><span style="width:${p.pct}%"></span></div>`
    : '';
  return `
  <div class="card mg-mt dhaja-camp${p.general ? ' dhaja-camp--general' : ''}">
    <div class="card-body">
      <div class="flex justify-between items-center" style="flex-wrap:wrap;gap:.4rem">
        <div>
          <div class="card-title">🚩 ${dhajaEsc(typeof tData === 'function' ? tData(c.name) : c.name)}
            <span class="badge ${c.status === 'closed' ? 'badge-maroon' : 'badge-confirmed'}">${c.status === 'closed' ? window.t('dhaja_campaign_closed', 'Closed') : window.t('dhaja_open', 'Open')}</span></div>
          ${p.general
            ? `<div class="mg-muted-xs">${window.t('dhaja_general_all', 'Every dhaja pooja — all occasions')}</div>`
            : (c.startDate ? `<div class="mg-muted-xs">${window.t('dhaja_from', 'From')} ${dhajaDate(c.startDate)}</div>` : '')}
        </div>
        <div style="text-align:right">
          <div style="font-size:1.5rem;font-weight:700;color:var(--primary-maroon,#6B1F2A)">${p.n}${p.target ? ' / ' + p.target : ''}</div>
          <div class="mg-muted-xs">${dhajaMoney(p.raised)} ${window.t('dhaja_received', 'received')}</div>
        </div>
      </div>
      ${bar}
      <div class="flex gap-2 mg-mt items-center" style="flex-wrap:wrap">
        ${admin && c.status !== 'closed'
          ? `<button class="btn btn-primary mg-btn-xs" onclick="openSponsorDhaja('${dhajaEsc(c.code)}')">+ ${window.t('dhaja_sponsor_btn', 'Sponsor a Dhaja')}</button>` : ''}
        ${p.remaining != null ? `<span class="badge badge-pending">${p.remaining} ${window.t('dhaja_left', 'left')}</span>` : ''}
        ${admin && c.code ? `<button class="btn btn-outline mg-btn-xs" onclick="openDhajaCampaignForm('${dhajaEsc(c.code)}')" style="margin-left:auto">${window.t('edit', 'Edit')}</button>` : ''}
        ${admin && c.code && !p.general ? `<button class="btn btn-outline mg-btn-xs mg-btn-danger" onclick="dhajaDeleteCampaign('${dhajaEsc(c.code)}')">${window.t('delete', 'Delete')}</button>` : ''}
      </div>
    </div>
  </div>`;
}

/* ---------- special days (from Annual Temple Events) ---------- */
function dhajaSpecialDaysSection() {
  const admin = dhajaIsAdmin();
  const head = `
  <div class="section-title mg-mt flex justify-between items-center" style="flex-wrap:wrap;gap:.4rem">
    <span>📿 ${window.t('dhaja_special_days', 'Special-day dhaja')}</span>
    ${admin ? `<button class="btn btn-outline mg-btn-xs" onclick="dhajaAddSpecialDay()">+ ${window.t('dhaja_add_special_day', 'Add special day')}</button>` : ''}
  </div>`;
  if (typeof window.annualForYear !== 'function' || typeof ANNUAL === 'undefined') return admin ? head : '';
  const yr = ANNUAL.year || new Date().getFullYear();
  const evs = window.annualForYear(yr, false) || [];
  if (!evs.length) return admin ? head + `<div class="card"><div class="card-body mg-pad-note">${window.t('dhaja_no_special', 'No special days yet — add one above.')}</div></div>` : '';
  const rows = evs.map(ev => {
    const camp = DHAJA.campaigns.find(c => c.annualEventCode === ev.id || c.annualEventId === ev.id);
    const name = (typeof window.annualName === 'function') ? window.annualName(ev) : ev.name;
    const tithi = (typeof window.annualTithiLabel === 'function') ? window.annualTithiLabel(ev) : '';
    let action;
    if (camp) {
      const p = dhajaProgress(camp);
      action = `<span class="badge badge-confirmed">${p.n}${p.target ? '/' + p.target : ''} ${window.t('dhaja_sponsored', 'sponsored')}</span>`
        + (admin && camp.status !== 'closed' ? ` <button class="btn btn-outline mg-btn-xs" onclick="openSponsorDhaja('${dhajaEsc(camp.code)}')">${window.t('dhaja_sponsor_btn', 'Sponsor')}</button>` : '');
    } else {
      action = admin
        ? `<button class="btn btn-outline mg-btn-xs" onclick="dhajaOpenSpecialDay('${dhajaEsc(ev.id)}')">${window.t('dhaja_open_sponsorship', 'Open Dhaja sponsorship')}</button>`
        : '<span class="mg-muted-xs">—</span>';
    }
    return `<tr>
      <td><strong>${dhajaEsc(name)}</strong>${tithi ? `<div class="mg-muted-xs">${dhajaEsc(tithi)}</div>` : ''}</td>
      <td>${dhajaDate(ev.gregorianDate)}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');
  return `
  ${head}
  <div class="card"><div class="card-body" style="padding:0">
    <div class="mg-table-scroll"><table class="custom-table" style="min-width:560px">
      <thead><tr><th>${window.t('dhaja_day', 'Day')}</th><th>${window.t('date')}</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div></div>`;
}

/* ---------- export builder ---------- */
function dhajaExport() {
  return {
    filename: 'dhaja-pooja',
    title: window.t('dhaja_title', 'Dhaja Pooja') + ' — ' + window.t('dhaja_register', 'Sponsorship register'),
    columns: ['Seq', 'Sponsor', 'Mobile', 'Campaign', 'Amount (INR)', 'Date', 'Receipt', 'Status'],
    rows: DHAJA.sponsorships.filter(s => s.status !== 'cancelled').map(s => {
      const c = dhajaCampaignById(s.campaignId);
      return [
        s.seqNo != null ? s.seqNo : '', s.sponsorName, s.sponsorMobile,
        c ? c.name : (s.campaignId || ''), Number(s.pledgeAmount) || 0,
        s.scheduledDate || s.performedDate || '', s.receiptNo || '', s.status,
      ];
    }),
    meta: DHAJA.campaigns.map(c => {
      const p = dhajaProgress(c);
      return c.name + ': ' + p.n + (p.target ? '/' + p.target : '') + ' · ₹' + (p.raised || 0);
    }),
  };
}
if (typeof registerExport === 'function') registerExport('mod-dhaja', dhajaExport);

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('dhajaRoot')) return;
  renderDhaja();
  if (typeof onLanguageChange === 'function') onLanguageChange(() => renderDhaja());
});
