/* ============================================================
   DHAJA POOJA — FORMS  (#modalDhaja + optimistic CRUD)
   Sponsor a dhaja  -> POST /api/dhaja  (server: ensureDevotee ->
   ensureDonorForDevotee -> cash donation DCT-011 + receipt -> link).
   ============================================================ */
(function () {
  if (typeof document === 'undefined' || document.getElementById('modalDhaja')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="modalDhaja">
  <div class="modal-box" style="max-width: 620px;">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="dhajaFormTitle">Sponsor a Dhaja Pooja</div>
        <span class="mg-muted-xs">The sevarthi's contribution is recorded as a donation with an 80G receipt.</span>
      </div>
      <button class="modal-close-btn" onclick="closeModal('modalDhaja')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formDhaja" onsubmit="handleSponsorDhaja(event)">
        <div id="dhajaFormMount"></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalDhaja')">Cancel</button>
      <button class="btn btn-primary" id="dhajaSubmitBtn" onclick="handleSponsorDhaja(event)">Save &amp; Issue Receipt</button>
    </div>
  </div>
</div>`);
})();

function dhajaOpenReceipt(donationId) {
  if (typeof openDonationReceipt === 'function') { openDonationReceipt(donationId); return; }
  dhajaToast(window.t('dhaja_receipt_na', 'Open the Donations page to view this receipt.'));
}

function openSponsorDhaja(campaignCode) {
  const open = DHAJA.campaigns.filter(c => c.status !== 'closed');
  if (!open.length) { dhajaToast(window.t('dhaja_no_open', 'No open dhaja campaign — open one from a special day first.')); return; }
  const pre = campaignCode && open.find(c => c.code === campaignCode) ? campaignCode : open[0].code;

  const campOpts = open.map(c =>
    `<option value="${c.code}" ${c.code === pre ? 'selected' : ''}>${(typeof tData === 'function' ? tData(c.name) : c.name)}${c.targetCount ? ' (' + dhajaProgress(c).n + '/' + c.targetCount + ')' : ''}</option>`).join('');

  const devField = (typeof devoteeLinkField === 'function')
    ? devoteeLinkField({ selId: 'dhajaDevSel', label: window.t('dhaja_form_person', 'Sevarthi (devotee)'), required: true,
        hint: window.t('dhaja_form_person_hint', 'Pick the person from the register, or add a new devotee.') })
    : `<div class="form-group"><label class="form-label">${window.t('dhaja_form_person', 'Sevarthi name')} *</label><input class="form-input" id="dhajaDevName"></div>`;

  document.getElementById('dhajaFormMount').innerHTML = `
    <div class="form-group">
      <label class="form-label" for="dhajaCampSel">${window.t('dhaja_form_campaign', 'Campaign / occasion')} *</label>
      <select class="form-select" id="dhajaCampSel">${campOpts}</select>
    </div>
    ${devField}
    <div class="grid mg-2col-form">
      <div class="form-group">
        <label class="form-label" for="dhajaAmount">${window.t('dhaja_form_amount', 'Contribution (₹)')} *</label>
        <input type="number" min="1" step="1" class="form-input" id="dhajaAmount" placeholder="e.g. 1100" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="dhajaDate">${window.t('dhaja_form_date', 'Receipt date')}</label>
        <input type="date" class="form-input" id="dhajaDate" value="${dhajaToday()}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="dhajaSched">${window.t('dhaja_form_scheduled', 'Dhaja date (optional)')}</label>
      <input type="date" class="form-input" id="dhajaSched">
    </div>
    <div class="form-group">
      <label class="form-label" for="dhajaNotes">${window.t('dhaja_form_notes', 'Notes')}</label>
      <textarea class="form-input mg-textarea" id="dhajaNotes" rows="2"></textarea>
    </div>`;

  if (typeof openModal === 'function') openModal('modalDhaja');
}

function handleSponsorDhaja(e) {
  if (e && e.preventDefault) e.preventDefault();
  const btn = document.getElementById('dhajaSubmitBtn');
  const campCode = (document.getElementById('dhajaCampSel') || {}).value || '';
  const amount = parseInt((document.getElementById('dhajaAmount') || {}).value, 10);
  const date = (document.getElementById('dhajaDate') || {}).value || dhajaToday();
  const sched = (document.getElementById('dhajaSched') || {}).value || '';
  const notes = ((document.getElementById('dhajaNotes') || {}).value || '').trim();

  const camp = dhajaCampaignById(campCode);
  if (!camp) { dhajaToast(window.t('dhaja_pick_campaign', 'Pick a campaign.')); return; }
  if (!(amount > 0)) { dhajaToast(window.t('dhaja_bad_amount', 'Enter a contribution amount.')); return; }

  let person = null;
  if (typeof devoteeLinkValue === 'function') person = devoteeLinkValue('dhajaDevSel');
  else {
    const nm = ((document.getElementById('dhajaDevName') || {}).value || '').trim();
    if (nm) { const p = nm.split(/\s+/); person = { id: '', name: nm, firstName: p.shift() || nm, lastName: p.join(' '), mobile: '', city: '' }; }
  }
  if (!person || (!person.id && !person.name)) { dhajaToast(window.t('dhaja_pick_person', 'Pick or add the sevarthi.')); return; }

  const payload = { campaignId: camp.code, amount, date, notes };
  if (sched) payload.scheduledDate = sched;
  if (person.id && !/^DEV-LOCAL/i.test(person.id)) payload.devoteeId = person.id;
  else {
    payload.firstName = person.firstName; payload.lastName = person.lastName;
    payload.mobile = person.mobile; payload.city = person.city; payload.state = person.state || 'Gujarat';
  }

  // optimistic local row
  const localKey = 'tmp-' + Date.now();
  const localRow = {
    id: localKey, code: '', campaignId: camp.code, seqNo: null,
    devoteeId: person.id || '', sponsorName: person.name, sponsorMobile: person.mobile || '',
    scheduledDate: sched, performedDate: '', pledgeAmount: amount, donationId: '', receiptNo: '',
    status: 'sponsored', notes,
  };
  DHAJA.sponsorships.unshift(localRow);
  if (camp.sponsoredCount != null) camp.sponsoredCount++;
  if (typeof closeModal === 'function') closeModal('modalDhaja');
  renderDhaja();

  if (!(window.API && window.API.online)) {
    localRow._syncFailed = true;
    dhajaToast(window.t('dhaja_saved_local', 'Saved locally — will sync when online.'));
    return;
  }
  if (btn) btn.disabled = true;
  window.API.post('/dhaja', payload)
    .then(() => window.__rehydrate && window.__rehydrate())
    .catch(err => {
      // revert the optimistic row
      const i = DHAJA.sponsorships.indexOf(localRow);
      if (i !== -1) DHAJA.sponsorships.splice(i, 1);
      if (camp.sponsoredCount != null && camp.sponsoredCount > 0) camp.sponsoredCount--;
      renderDhaja();
      const msg = (err && err.message) || 'Save failed';
      dhajaToast((err && err.body && (err.body.full || err.body.closed))
        ? window.t('dhaja_campaign_full', 'That dhaja campaign is full / closed.') : msg);
    })
    .then(() => { if (btn) btn.disabled = false; });
}

function dhajaOpenSpecialDay(annualEventId) {
  if (!(window.API && window.API.online)) { dhajaToast(window.t('dhaja_need_online', 'Go online to open a special-day campaign.')); return; }
  let ev = null;
  if (typeof window.annualEventById === 'function') ev = window.annualEventById(annualEventId);
  const name = ev && typeof window.annualName === 'function' ? window.annualName(ev) : (ev && ev.name) || 'Dhaja';
  window.API.post('/dhaja/campaigns', {
    annualEventId: annualEventId,
    name: name + ' — ' + window.t('dhaja_title', 'Dhaja Pooja'),
    nameGu: (ev && ev.name_gu) || '',
    targetCount: 0,
  })
    .then(() => window.__rehydrate && window.__rehydrate())
    .then(() => dhajaToast(window.t('dhaja_opened', 'Dhaja sponsorship opened.')))
    .catch(err => dhajaToast((err && err.message) || 'Could not open campaign'));
}

function dhajaMarkPerformed(code) {
  const s = dhajaSponsorshipByCode(code);
  if (!s) return;
  s.status = 'performed'; s.performedDate = s.performedDate || dhajaToday();
  renderDhaja();
  if (window.API && window.API.online && s.code) {
    window.API.patch('/dhaja/' + s.code, { status: 'performed' })
      .then(() => window.__rehydrate && window.__rehydrate())
      .catch(err => { dhajaToast((err && err.message) || 'Sync failed'); window.__rehydrate && window.__rehydrate(); });
  }
}

function dhajaCancel(code) {
  const s = dhajaSponsorshipByCode(code);
  if (!s) return;
  const run = () => {
    s.status = 'cancelled'; s.seqNo = null;
    const c = dhajaCampaignById(s.campaignId);
    if (c && c.sponsoredCount != null && c.sponsoredCount > 0) c.sponsoredCount--;
    renderDhaja();
    if (window.API && window.API.online && s.code) {
      window.API.patch('/dhaja/' + s.code, { status: 'cancelled' })
        .then(() => window.__rehydrate && window.__rehydrate())
        .catch(err => { dhajaToast((err && err.message) || 'Sync failed'); window.__rehydrate && window.__rehydrate(); });
    }
  };
  if (typeof openConfirm === 'function') {
    openConfirm({
      title: window.t('dhaja_cancel_title', 'Cancel this dhaja sponsorship?'),
      body: window.t('dhaja_cancel_body', 'The linked donation and its receipt will be voided.'),
      confirmText: window.t('cancel', 'Cancel'), onConfirm: run,
    });
  } else if (window.confirm(window.t('dhaja_cancel_confirm', 'Cancel this sponsorship? The receipt will be voided.'))) {
    run();
  }
}
