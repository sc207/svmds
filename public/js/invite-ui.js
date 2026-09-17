/* ============================================================
   COMBINED / UNIVERSAL INVITATION — #inviteRoot
   ------------------------------------------------------------
   A second, additional way to send invitations: pick several poojas
   (from every pooja ever added) and build ONE invitation card listing
   all of them together (a festival-programme style card), instead of
   the existing one-card-per-pooja designer on each pooja's own
   workspace (public/js/pooja-ui.js — untouched by this file).

   Reuses pooja-ui.js's shared invitation machinery as-is: printInvitationHTML,
   downloadInvitationPDF, downloadInvitationZIP, invAudienceOptions,
   invAudienceRecipients, ivt/invLang/invDateLoc, inviteEmblemImg,
   inviteMandalaSVG. Only the card-body markup (combinedInvitationMarkup) and
   the pooja-selection UI are new — no existing pooja-ui.js function is
   modified. Loaded right after pooja-forms.js (index.html), so every one of
   those globals already exists by the time this file runs.
   ============================================================ */

if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
  window.onLanguageChange = function () {};
}

var CIV = {
  selectedIds: [],
  search: '',
  opts: { template: 'royal', accent: '#6B1F2A', lang: '', headline: '', inviteLine: '', blessing: '', audience: '' }
};

/* ---- pooja selection ---- */
function civFilteredPoojas() {
  var list = (typeof visiblePoojas === 'function' ? visiblePoojas() : []).slice();
  var q = (CIV.search || '').toLowerCase().trim();
  if (q) list = list.filter(function (p) { return (p.name || '').toLowerCase().indexOf(q) !== -1; });
  list.sort(function (a, b) {
    var fa = firstSession(a), fb = firstSession(b);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return (fa.date + fa.startTime).localeCompare(fb.date + fb.startTime);
  });
  return list;
}

function civPoojaChecklistHTML() {
  var list = civFilteredPoojas();
  if (!list.length) {
    return '<div class="mg-pad-note">' + esc(window.t('civ_no_poojas', 'No poojas have been added yet.')) + '</div>';
  }
  return '<div style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:0.4rem;">' +
    list.map(function (p) {
      var st = poojaStatus(p);
      var checked = CIV.selectedIds.indexOf(p.id) !== -1;
      return '<label class="mg-check-inline" style="align-items:flex-start;padding:0.4rem 0.5rem;border-radius:8px;border:1px solid var(--warm-border);">' +
        '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="toggleCivPooja(\'' + p.id + '\')">' +
        '<span style="display:flex;flex-direction:column;gap:2px;">' +
        '<strong>' + esc(pjLoc(p.name)) + '</strong>' +
        '<span class="mg-muted-xs">' + esc(dateRangeText(p)) +
        ' · <span class="badge ' + POOJA_STATUS_BADGE[st] + '">' + POOJA_STATUS_DOT[st] + ' ' + esc(poojaStatusLabel(st)) + '</span></span>' +
        '</span>' +
        '</label>';
    }).join('') +
    '</div>';
}

function civRefreshChecklist() {
  var box = document.getElementById('civChecklist');
  if (box) box.innerHTML = civPoojaChecklistHTML();
}

function civSetSearch(v) {
  CIV.search = v;
  civRefreshChecklist();
}

function toggleCivPooja(id) {
  var i = CIV.selectedIds.indexOf(id);
  if (i === -1) CIV.selectedIds.push(id); else CIV.selectedIds.splice(i, 1);
  updateCombinedInvitationPreview();
}

function civSelectAll() {
  civFilteredPoojas().forEach(function (p) {
    if (CIV.selectedIds.indexOf(p.id) === -1) CIV.selectedIds.push(p.id);
  });
  civRefreshChecklist();
  updateCombinedInvitationPreview();
}

function civClearAll() {
  var visible = civFilteredPoojas().map(function (p) { return p.id; });
  CIV.selectedIds = CIV.selectedIds.filter(function (id) { return visible.indexOf(id) === -1; });
  civRefreshChecklist();
  updateCombinedInvitationPreview();
}

function selectedPoojasSorted() {
  var list = CIV.selectedIds.map(poojaById).filter(Boolean);
  list.sort(function (a, b) {
    var fa = firstSession(a), fb = firstSession(b);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return (fa.date + fa.startTime).localeCompare(fb.date + fb.startTime);
  });
  return list;
}

/* ---- designer options (mirrors readInvitationOpts, no schedule/sevarthi/
   guest toggles — the combined card always shows its programme list and
   never a single pooja's sevarthi/guest block, which would be ambiguous
   across several selected poojas) ---- */
function readCombinedInvitationOpts() {
  var g = function (id) { return document.getElementById(id); };
  if (!g('civTemplate')) return Object.assign({}, CIV.opts);
  return {
    template: g('civTemplate').value,
    accent: g('civAccent').value,
    lang: g('civLangSel') ? g('civLangSel').value : '',
    audience: g('civAudience') ? g('civAudience').value : '',
    headline: g('civHeadline').value,
    inviteLine: g('civLine').value,
    blessing: g('civBlessing').value
  };
}

/* ---- combined card markup — sibling of invitationMarkup(p,opts) in
   pooja-ui.js, never edits it. One row per selected pooja (not per
   session): a single/one-session pooja shows its date+time+venue; a
   multi-session pooja shows a first–last date range (matching
   dateRangeText()'s style) so a card with several poojas stays a compact
   programme overview instead of an itemized per-session list — full
   session detail is what the per-pooja Invitation tab is for. ---- */
function combinedInvitationMarkup(poojas, opts) {
  opts = Object.assign({ template: 'royal', accent: '#6B1F2A', headline: '', inviteLine: '', blessing: '', lang: '' }, opts || {});
  var L = invLang(opts);
  var rows = (poojas || []).map(function (p) {
    var sess = poojaSessions(p);
    var first = sess[0], last = sess[sess.length - 1];
    var multi = p.scheduleMode === 'multi' && sess.length > 1;
    var dateTxt = !first ? ivt(L, 'tba')
      : multi ? (invDateLoc(first.date, L) + ' – ' + invDateLoc(last.date, L))
              : invDateLoc(first.date, L);
    var timeTxt = (!multi && first && first.startTime) ? (fmtTime(first.startTime) + '–' + fmtTime(first.endTime)) : '';
    var venueTxt = p.defaultVenue || (first && first.venue) || '';
    return '<div class="pj-invite-schedule-row">' +
      '<strong>' + esc(pjLoc(p.name)) + '</strong>' +
      '<span>' + dateTxt + (timeTxt ? ' · ' + timeTxt : '') + (venueTxt ? ' · ' + esc(pjLoc(venueTxt)) : '') + '</span>' +
      '</div>';
  }).join('');
  var programme = '<div class="pj-invite-schedule">' +
    '<span class="pj-invite-schedule-h">' + esc(ivt(L, 'programme')) + '</span>' +
    (rows || '<div class="pj-invite-schedule-row"><span>' + esc(ivt(L, 'tba')) + '</span></div>') +
    '</div>';

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
      <h1 class="pj-invite-headline">${esc(opts.headline || window.t('civ_default_headline', 'Forthcoming Poojas & Seva'))}</h1>
      ${programme}
      <div class="pj-invite-blessing">${esc(opts.blessing || ivt(L, 'blessing'))}</div>
      <div class="pj-invite-foot">${esc(ivt(L, 'foot'))}</div>
    </div>
  </div>`;
}

function combinedInvitationPreviewHTML(poojas, opts, rcpts) {
  if (!poojas || !poojas.length) {
    return '<div class="mg-pad-note">' + esc(window.t('civ_empty_preview', 'Select one or more poojas to build the combined card.')) + '</div>';
  }
  if (!rcpts || !rcpts.length) return combinedInvitationMarkup(poojas, opts);
  return rcpts.map(function (r, i) {
    return '<div class="inv-pv"><span class="inv-pv-n">' + (i + 1) + ' / ' + rcpts.length + '</span>' +
      combinedInvitationMarkup(poojas, Object.assign({}, opts, { recipient: r })) + '</div>';
  }).join('');
}

function updateCombinedInvitationPreview() {
  var box = document.getElementById('civPreview');
  if (!box) return;
  var opts = readCombinedInvitationOpts();
  CIV.opts = opts;
  var poojas = selectedPoojasSorted();
  var rcpts = invAudienceRecipients(opts.audience);
  box.innerHTML = combinedInvitationPreviewHTML(poojas, opts, rcpts);
  var zipBtn = document.getElementById('civZipBtn');
  if (zipBtn) zipBtn.hidden = !rcpts.length;
  var note = document.getElementById('civBatchNote');
  if (note) {
    note.hidden = !rcpts.length;
    if (rcpts.length) note.textContent =
      rcpts.length + ' ' + window.t('cmt_members', 'members') + ' — ' +
      window.t('pj_inv_aud_pdf', 'Print / Save PDF generates all') + ' ' + rcpts.length +
      ' (' + window.t('pj_inv_aud_onepage', 'one invitation per page') + ')';
  }
}

/* ---- output — reuses printInvitationHTML / downloadInvitationPDF /
   downloadInvitationZIP verbatim, exactly like invitationCardSet() does for
   a single pooja, just built from the current multi-pooja selection. ---- */
function combinedInvitationCardSet() {
  var poojas = selectedPoojasSorted();
  if (!poojas.length) return null;
  var opts = readCombinedInvitationOpts();
  var rcpts = invAudienceRecipients(opts.audience);
  var baseTitle = window.t('civ_title', 'Combined Invitation');
  if (rcpts.length) {
    var cmt = (typeof cmtById === 'function') ? cmtById(opts.audience) : null;
    var cmtName = cmt ? (cmt.name || cmt.samaj || 'Committee') : 'Committee';
    var items = rcpts.map(function (r) {
      return { markup: combinedInvitationMarkup(poojas, Object.assign({}, opts, { recipient: r })), recipient: r };
    });
    return {
      cards: items.map(function (x) { return x.markup; }), items,
      title: baseTitle + ' - ' + cmtName, count: rcpts.length, cmtName, poojaName: baseTitle
    };
  }
  var only = combinedInvitationMarkup(poojas, opts);
  return { cards: [only], items: [{ markup: only, recipient: null }], title: baseTitle, count: 1, cmtName: '', poojaName: baseTitle };
}

function printCombinedInvitation() {
  var set = combinedInvitationCardSet();
  if (!set) { pjToast(window.t('civ_need_pooja', 'Select at least one pooja first.')); return; }
  printInvitationHTML(set.cards, set.title);
}
function downloadCombinedInvitationPDF() {
  var set = combinedInvitationCardSet();
  if (!set) { pjToast(window.t('civ_need_pooja', 'Select at least one pooja first.')); return; }
  downloadInvitationPDF(set.cards, set.title);
}
function downloadCombinedInvitationZip() {
  var set = combinedInvitationCardSet();
  if (!set) { pjToast(window.t('civ_need_pooja', 'Select at least one pooja first.')); return; }
  downloadInvitationZIP(set);
}

/* ---- page shell ---- */
function renderInvitePage() {
  var root = document.getElementById('inviteRoot');
  if (!root) return;
  if (typeof canOpenPage === 'function' && !canOpenPage('invite')) { root.innerHTML = ''; return; }

  var tplOpts = [
    ['royal', window.t('pj_inv_royal', 'Royal (ceremonial)')],
    ['cream', window.t('pj_inv_cream', 'Cream (minimal)')],
    ['festival', window.t('pj_inv_festival', 'Festival (celebratory)')]
  ];
  var langOpts = [['', window.t('pj_inv_lang_app', 'Same as app')], ['en', 'English'], ['gu', 'ગુજરાતી'], ['hi', 'हिन्दी']];
  var accentOpts = (typeof POOJA !== 'undefined' && POOJA.accentPalette ? POOJA.accentPalette : []).map(function (a) {
    return '<option value="' + a.hex + '" ' + (a.hex === CIV.opts.accent ? 'selected' : '') + '>' + esc(a.name) + '</option>';
  }).join('');
  var audOpts = invAudienceOptions();
  var L0 = invLang(CIV.opts);

  root.innerHTML = `
  <div class="mg-page-head">
    <div>
      <h1 class="banner-title mg-page-title">🎴 ${window.t('civ_title', 'Combined Invitation')}</h1>
      <p class="mg-page-sub">${window.t('civ_sub', 'Select any poojas already added and build one combined invitation card listing all of them together.')}</p>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:320px 1fr;gap:1.25rem;align-items:start;">
    <div class="card">
      <div class="card-body">
        <h3 class="mg-pane-title">${window.t('civ_pick_poojas', 'Select Poojas')}</h3>
        <input class="form-input mg-mt-sm" id="civSearch" placeholder="${window.t('search', 'Search')}…" oninput="civSetSearch(this.value)">
        <div class="flex gap-2 mg-mt-sm">
          <button class="btn btn-outline mg-btn-xs" type="button" onclick="civSelectAll()">${window.t('civ_select_all', 'Select all')}</button>
          <button class="btn btn-outline mg-btn-xs" type="button" onclick="civClearAll()">${window.t('civ_clear_all', 'Clear')}</button>
        </div>
        <div id="civChecklist" class="mg-mt-sm">${civPoojaChecklistHTML()}</div>
      </div>
    </div>

    <div class="pj-invite-controls">
      <div class="pj-invite-stage">
        <div id="civPreview"></div>
        <div id="civBatchNote" class="pj-invite-batch-note" hidden></div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="grid mg-2col-form">
            <div class="form-group">
              <label class="form-label" for="civTemplate">${window.t('pj_inv_template', 'Template')}</label>
              <select class="form-select" id="civTemplate" onchange="updateCombinedInvitationPreview()">
                ${tplOpts.map(function (o) { return '<option value="' + o[0] + '" ' + (o[0] === CIV.opts.template ? 'selected' : '') + '>' + o[1] + '</option>'; }).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="civLangSel">${window.t('pj_inv_language', 'Card Language')}</label>
              <select class="form-select" id="civLangSel" onchange="updateCombinedInvitationPreview()">
                ${langOpts.map(function (o) { return '<option value="' + o[0] + '" ' + (o[0] === CIV.opts.lang ? 'selected' : '') + '>' + o[1] + '</option>'; }).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="civAudience">${window.t('pj_inv_audience', 'Invite (audience)')}</label>
            <select class="form-select" id="civAudience" onchange="updateCombinedInvitationPreview()">
              <option value="">${window.t('pj_inv_aud_open', 'Open / public invitation (no name)')}</option>
              ${audOpts.length ? ('<optgroup label="' + window.t('pj_inv_aud_grp', 'One card per committee member') + '">' +
                audOpts.map(function (o) { return '<option value="' + o.id + '" ' + (o.id === CIV.opts.audience ? 'selected' : '') + '>' + esc(o.label) + ' — ' + o.count + ' ' + window.t('cmt_members', 'members') + '</option>'; }).join('') +
                '</optgroup>') : ''}
            </select>
            <span class="mg-muted-xs">${window.t('pj_inv_aud_hint', 'Pick a samaj / committee to generate a personalised card (name, city, state) for every member — one page each in the PDF.')}</span>
          </div>
          <div class="form-group">
            <label class="form-label" for="civAccent">${window.t('pj_inv_accent', 'Accent Colour')}</label>
            <select class="form-select" id="civAccent" onchange="updateCombinedInvitationPreview()">${accentOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="civHeadline">${window.t('pj_inv_headline', 'Headline')}</label>
            <input class="form-input" id="civHeadline" value="${esc(CIV.opts.headline || '')}" placeholder="${esc(window.t('civ_default_headline', 'Forthcoming Poojas & Seva'))}" oninput="updateCombinedInvitationPreview()">
          </div>
          <div class="form-group">
            <label class="form-label" for="civLine">${window.t('pj_inv_line', 'Invitation Line')}</label>
            <input class="form-input" id="civLine" value="${esc(CIV.opts.inviteLine || '')}" placeholder="${esc(ivt(L0, 'invite'))}" oninput="updateCombinedInvitationPreview()">
          </div>
          <div class="form-group">
            <label class="form-label" for="civBlessing">${window.t('pj_inv_blessing', 'Closing Blessing')}</label>
            <input class="form-input" id="civBlessing" value="${esc(CIV.opts.blessing || '')}" placeholder="${esc(ivt(L0, 'blessing'))}" oninput="updateCombinedInvitationPreview()">
          </div>
          <div class="flex gap-2 mg-mt-sm" style="flex-wrap:wrap">
            <button class="btn btn-secondary js-inv-dl" type="button" onclick="downloadCombinedInvitationPDF()">⬇ ${window.t('pj_inv_download', 'Download all (1 PDF)')}</button>
            <button class="btn btn-secondary js-inv-zip" id="civZipBtn" type="button" onclick="downloadCombinedInvitationZip()" hidden>🗂️ ${window.t('pj_inv_zip', 'Download ZIP (individual)')}</button>
            <button class="btn btn-outline" type="button" onclick="printCombinedInvitation()">${window.t('pj_inv_print_only', 'Print')}</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  updateCombinedInvitationPreview();
}

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('inviteRoot')) renderInvitePage();
  document.querySelectorAll('.nav-item[data-page="invite"], .mobile-nav-item[data-page="invite"]')
    .forEach(function (el) { el.addEventListener('click', renderInvitePage); });
  if (typeof onLanguageChange === 'function') onLanguageChange(function () {
    if (document.getElementById('inviteRoot')) renderInvitePage();
  });
});
