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
</div>
<div class="modal-overlay" id="modalDhajaCamp">
  <div class="modal-box" style="max-width: 560px;">
    <div class="modal-header">
      <div class="modal-title" id="dhajaCampTitle">New Dhaja Campaign</div>
      <button class="modal-close-btn" onclick="closeModal('modalDhajaCamp')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formDhajaCamp" onsubmit="handleSaveDhajaCampaign(event)">
        <input type="hidden" id="dcEditCode">
        <div class="grid mg-2col-form">
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label" for="dcName">Campaign name *</label>
            <input class="form-input" id="dcName" placeholder="e.g. February Dhaja Mahotsav" required>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label" for="dcNameGu">Name (Gujarati)</label>
            <input class="form-input" id="dcNameGu" placeholder="ફેબ્રુઆરી ધજા મહોત્સવ">
          </div>
          <div class="form-group">
            <label class="form-label" for="dcTarget">Target count</label>
            <input type="number" min="0" step="1" class="form-input" id="dcTarget" placeholder="0 = open-ended">
            <div class="mg-muted-xs">0 means no limit. Set 108 for the February mahotsav.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="dcStatus">Status</label>
            <select class="form-select" id="dcStatus"><option value="open">Open</option><option value="closed">Closed</option></select>
          </div>
          <div class="form-group">
            <label class="form-label" for="dcStart">Start date</label>
            <input type="date" class="form-input" id="dcStart">
          </div>
          <div class="form-group">
            <label class="form-label" for="dcEnd">End date</label>
            <input type="date" class="form-input" id="dcEnd">
          </div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline mg-btn-danger" id="dcDeleteBtn" style="margin-right:auto;display:none" onclick="dhajaDeleteCampaign(document.getElementById('dcEditCode').value)">Delete</button>
      <button class="btn btn-outline" onclick="closeModal('modalDhajaCamp')">Cancel</button>
      <button class="btn btn-primary" id="dcSubmitBtn" onclick="handleSaveDhajaCampaign(event)">Save Campaign</button>
    </div>
  </div>
</div>`);
})();

/* ---------- campaigns: create / edit / delete ----------
   A dhaja campaign is a standalone row: name, dates, target, status. It links
   to nothing else. `prefill` (name/nameGu/startDate) just seeds a NEW form —
   e.g. from the "temple tithis" shortcut — it never creates any other record. */
function openDhajaCampaignForm(code, prefill) {
  const c = code ? dhajaCampaignById(code) : null;
  const pf = (!c && prefill) ? prefill : {};
  document.getElementById('dhajaCampTitle').textContent = c
    ? window.t('dhaja_edit_campaign', 'Edit Dhaja Campaign')
    : window.t('dhaja_new_campaign', 'New Dhaja Campaign');
  document.getElementById('dcEditCode').value = c ? c.code : '';
  document.getElementById('dcName').value = c ? c.name : (pf.name || '');
  document.getElementById('dcNameGu').value = c ? (c.nameGu || '') : (pf.nameGu || '');
  document.getElementById('dcTarget').value = c ? (c.targetCount || 0) : '';
  document.getElementById('dcStatus').value = c ? (c.status || 'open') : 'open';
  document.getElementById('dcStart').value = c ? (c.startDate || '') : (pf.startDate || '');
  document.getElementById('dcEnd').value = c ? (c.endDate || '') : '';
  // never offer Delete for the General catch-all (or a campaign that isn't synced)
  const del = document.getElementById('dcDeleteBtn');
  del.style.display = (c && c.code && !dhajaIsGeneral(c)) ? '' : 'none';
  if (typeof openModal === 'function') openModal('modalDhajaCamp');
}

function handleSaveDhajaCampaign(e) {
  if (e && e.preventDefault) e.preventDefault();
  const btn = document.getElementById('dcSubmitBtn');
  const code = (document.getElementById('dcEditCode') || {}).value || '';
  const name = ((document.getElementById('dcName') || {}).value || '').trim();
  if (!name) { dhajaToast(window.t('dhaja_camp_need_name', 'Enter a campaign name.')); return; }
  const body = {
    name,
    nameGu: ((document.getElementById('dcNameGu') || {}).value || '').trim(),
    targetCount: Math.max(0, parseInt((document.getElementById('dcTarget') || {}).value, 10) || 0),
    startDate: (document.getElementById('dcStart') || {}).value || null,
    endDate: (document.getElementById('dcEnd') || {}).value || null,
  };
  if (code) body.status = (document.getElementById('dcStatus') || {}).value || 'open';

  if (!(window.API && window.API.online)) { dhajaToast(window.t('dhaja_need_online', 'Go online to manage campaigns.')); return; }
  if (btn) btn.disabled = true;
  const req = code
    ? window.API.patch('/dhaja/campaigns/' + code, body)
    : window.API.post('/dhaja/campaigns', body);
  req
    .then(() => window.__rehydrate && window.__rehydrate('dhaja'))
    .then(() => {
      if (typeof closeModal === 'function') closeModal('modalDhajaCamp');
      dhajaToast(code ? window.t('saved', 'Saved') : window.t('dhaja_camp_created', 'Campaign created.'));
    })
    .catch(err => dhajaToast((err && err.message) || 'Save failed'))
    .then(() => { if (btn) btn.disabled = false; });
}

function dhajaDeleteCampaign(code) {
  const c = dhajaCampaignById(code);
  if (!c || !c.code) return;
  if (dhajaIsGeneral(c)) { dhajaToast(window.t('dhaja_camp_general_keep', 'The General campaign cannot be deleted.')); return; }
  if (!(window.API && window.API.online)) { dhajaToast(window.t('dhaja_need_online', 'Go online to manage campaigns.')); return; }

  const doDelete = (force) => window.API.del('/dhaja/campaigns/' + c.code + (force ? '?force=1' : ''))
    .then(() => window.__rehydrate && window.__rehydrate('dhaja'))
    .then(() => { if (typeof closeModal === 'function') closeModal('modalDhajaCamp'); dhajaToast(window.t('dhaja_camp_deleted', 'Campaign deleted.')); })
    .catch(err => {
      if (err && err.status === 409 && !force) {
        const n = (err.body && err.body.count) || '';
        const msg = window.t('dhaja_camp_has_sponsors', 'This campaign has {n} sponsorship(s). Delete it and void their receipts?').replace('{n}', n);
        if ((typeof openConfirm === 'function')) {
          openConfirm({ title: window.t('dhaja_camp_delete_title', 'Delete campaign?'), body: msg,
            confirmText: window.t('delete', 'Delete'), onConfirm: () => doDelete(true) });
        } else if (window.confirm(msg)) { doDelete(true); }
        return;
      }
      dhajaToast((err && err.message) || 'Delete failed');
    });

  if (typeof openConfirm === 'function') {
    openConfirm({
      title: window.t('dhaja_camp_delete_title', 'Delete campaign?'),
      body: window.t('dhaja_camp_delete_body', 'Remove this dhaja campaign?') + ' — ' + (c.name || c.code),
      confirmText: window.t('delete', 'Delete'), onConfirm: () => doDelete(false),
    });
  } else if (window.confirm(window.t('dhaja_camp_delete_body', 'Remove this dhaja campaign?'))) {
    doDelete(false);
  }
}

/* A "special-day dhaja" is just a campaign for that day — nothing links to the
   Annual Temple Events table. This opens the New Campaign form, optionally
   pre-filled with a tithi's name + date from the read-only reference list. */
function dhajaAddSpecialDay(evId) {
  let pf;
  if (evId && typeof window.annualEventById === 'function') {
    const ev = window.annualEventById(evId);
    if (ev) {
      const nm = (typeof window.annualName === 'function') ? window.annualName(ev) : ev.name;
      let date = ev.gregorianDate || '';
      if (!date && typeof window.annualResolve === 'function') {
        const yr = (typeof ANNUAL !== 'undefined' && ANNUAL.year) || new Date().getFullYear();
        try { date = (window.annualResolve(ev, yr) || {}).date || ''; } catch (e) {}
      }
      const suffix = ' — ' + window.t('dhaja_title', 'Dhaja Pooja');
      pf = {
        name: nm + suffix,
        nameGu: ev.name_gu ? ev.name_gu + suffix : '',
        startDate: date,
      };
    }
  }
  openDhajaCampaignForm(null, pf);
}
/* back-compat: the old special-day button now just pre-fills a new campaign */
function dhajaOpenSpecialDay(evId) { dhajaAddSpecialDay(evId); }

function dhajaOpenReceipt(donationId) {
  if (typeof openDonationReceipt === 'function') { openDonationReceipt(donationId); return; }
  dhajaToast(window.t('dhaja_receipt_na', 'Open the Donations page to view this receipt.'));
}

function openSponsorDhaja(campaignCode) {
  const open = DHAJA.campaigns.filter(c => c.status !== 'closed');
  if (!open.length) {
    dhajaToast(window.t('dhaja_no_open', 'No open dhaja campaign — create one with “New Campaign” first.'));
    return;
  }
  // default to the chosen campaign, else the General catch-all, else the first
  const pre = (campaignCode && open.find(c => c.code === campaignCode))
    ? campaignCode
    : (open.find(dhajaIsGeneral) || open[0]).code;

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
    .then(() => window.__rehydrate && window.__rehydrate('dhaja'))
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
    .then(() => window.__rehydrate && window.__rehydrate('dhaja'))
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
      .then(() => window.__rehydrate && window.__rehydrate('dhaja'))
      .catch(err => { dhajaToast((err && err.message) || 'Sync failed'); window.__rehydrate && window.__rehydrate('dhaja'); });
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
        .then(() => window.__rehydrate && window.__rehydrate('dhaja'))
        .catch(err => { dhajaToast((err && err.message) || 'Sync failed'); window.__rehydrate && window.__rehydrate('dhaja'); });
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
