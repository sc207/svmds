/* ---- Pooja: modal markup moved out of index.html (injected at load) ---- */
(function () {
  if (typeof document === 'undefined' || document.getElementById('modalPooja')) return;
  document.body.insertAdjacentHTML('beforeend', `
<!-- Add / Edit Pooja -->
<div class="modal-overlay" id="modalPooja">
  <div class="modal-box" style="max-width: 760px;">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="poojaFormTitle">Schedule a Pooja / Seva</div>
        <span class="mg-muted-xs">A dated event — pick a ritual type from the catalog, set the date(s), then add sevarthi &amp; guests.</span>
      </div>
      <button class="modal-close-btn" onclick="closeModal('modalPooja')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formPooja" onsubmit="handleSavePooja(event)">
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="pjFieldType">Ritual Type * <span class="mg-muted-xs">(from catalog)</span></label>
            <select class="form-select" id="pjFieldType" onchange="onPoojaTypeChange()"></select>
            <div class="mg-muted-xs" id="pjTypeHint">Not listed? <a href="#" onclick="closeModal('modalPooja');openAddPoojaType();return false;">Add it to the catalog first &rarr;</a></div>
          </div>
          <div class="form-group">
            <label class="form-label" for="pjFieldName">Pooja / Seva Name *</label>
            <input type="text" class="form-input" id="pjFieldName" placeholder="e.g. Vihat Maa Moorti Sthapan Pooja" required>
            <div class="mg-muted-xs">Auto-fills from the type — edit for this specific occasion.</div>
          </div>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="pjFieldMode">Schedule Type *</label>
            <select class="form-select" id="pjFieldMode" onchange="onPoojaModeChange()">
              <option value="single">Single dated event</option>
              <option value="multi">Multi-session (series of dates)</option>
            </select>
          </div>        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="pjFieldDefaultVenue">Default Venue</label>
            <input type="text" class="form-input" id="pjFieldDefaultVenue" placeholder="e.g. Main Sabha Mandap" oninput="syncDefaultVenue()">
          </div>
          <div class="form-group">
            <label class="form-label" for="pjFieldSevaAmount">Estimated Seva Contribution (₹)</label>
            <input type="number" class="form-input" id="pjFieldSevaAmount" min="0" placeholder="Optional">
            <div class="mg-muted-xs">Sevarthi's own estimated spend for reference — <strong>not a joining fee</strong>. No pooja has a fee.</div>
          </div>
        </div>

        <div class="form-group">
          <div class="flex justify-between items-center">
            <label class="form-label" style="margin:0;">Sessions (date &amp; time) *</label>
            <button class="btn btn-outline mg-btn-xs" type="button" id="pjAddSessionBtn" onclick="addSessionRow()">+ Add session</button>
          </div>
          <div id="pjSessionRows"></div>
        </div>

        <div class="link-section">
          <div class="link-section-head">
            <p class="ls-title">Sevarthi(s) <span class="ls-req">*</span></p>
            <button class="btn-add-devotee" type="button" onclick="pjAddPerson('sevarthi')">Add new devotee</button>
          </div>
          <div class="link-section-hint">Who sponsors &amp; runs this seva. Pick from the register, or add a new devotee.</div>
          <div id="pjSevarthiPicker"></div>
        </div>

        <div class="link-section">
          <div class="link-section-head">
            <p class="ls-title">Coordinator(s)</p>
            <button class="btn-add-devotee" type="button" onclick="pjAddPerson('coord')">Add new devotee</button>
          </div>
          <div class="link-section-hint">Who runs this pooja day-to-day. Pick from the register, or add a new devotee.</div>
          <div id="pjCoordPicker"></div>
        </div>

        <div class="link-section">
          <div class="link-section-head">
            <p class="ls-title">Guests</p>
            <button class="btn-add-devotee" type="button" onclick="openAddGuest('poojaForm')">Add new devotee</button>
          </div>
          <div class="link-section-hint">Tick everyone attending. Your form stays saved while you add or edit a person.</div>
          <div id="pjGuestPicker"></div>
        </div>

        <div class="form-group">
          <div class="flex justify-between items-center">
            <label class="form-label" style="margin:0;">Custom Fields</label>
            <button class="btn btn-outline mg-btn-xs" type="button" onclick="addPoojaCustomRow()">+ Add field</button>
          </div>
          <div id="pjCustomRows"></div>
        </div>

        <div class="form-group">
          <label class="form-label" for="pjFieldNotes">Notes</label>
          <textarea class="form-input mg-textarea" id="pjFieldNotes" rows="2" placeholder="Internal notes, preparation instructions, etc."></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalPooja')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formPooja" id="poojaFormSubmitBtn">Schedule Pooja</button>
    </div>
  </div>
</div>

<!-- Add / Edit Sevarthi -->
<div class="modal-overlay" id="modalSevarthi">
  <div class="modal-box">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="sevarthiFormTitle">Add Sevarthi</div>
        <span class="mg-muted-xs">Pooja: <strong id="sevFormPooja">—</strong></span>
      </div>
      <button class="modal-close-btn" onclick="closeModal('modalSevarthi')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formSevarthi" onsubmit="handleSaveSevarthi(event)">
        <div id="sevPersonMount"></div>
        <div id="sevExistingHint"></div>
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="sevFieldCommittee">Committee / Samaj</label>
            <input type="text" class="form-input" id="sevFieldCommittee" list="sevCommitteeList" placeholder="e.g. Rabari Samaj">
            <datalist id="sevCommitteeList">
              <option value="Rabari Samaj"></option>
              <option value="Marvadi Samaj"></option>
              <option value="General Committee"></option>
            </datalist>
          </div>
          <div class="form-group">
            <label class="form-label" for="sevFieldStatus">Status</label>
            <select class="form-select" id="sevFieldStatus">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="sevFieldNotes">Notes</label>
          <textarea class="form-input mg-textarea" id="sevFieldNotes" rows="2" placeholder="Seva details, contribution, preferences"></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalSevarthi')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formSevarthi" id="sevarthiFormSubmitBtn">Add Sevarthi</button>
    </div>
  </div>
</div>

<!-- Add / Edit Guest (opens on top of the Pooja form; that form is preserved) -->
<div class="modal-overlay" id="modalGuest">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="guestFormTitle">Add Guest</div>
      <button class="modal-close-btn" onclick="closeModal('modalGuest')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formGuest" onsubmit="handleSaveGuest(event)">
        <div id="gstPersonMount"></div>
        <div class="form-group">
          <label class="form-label" for="gstFieldRole">Role at this event</label>
          <input type="text" class="form-input" id="gstFieldRole" list="gstRoleList" placeholder="e.g. Chief Guest, Priest">
          <datalist id="gstRoleList">
            <option value="Chief Guest"></option>
            <option value="Guest of Honour"></option>
            <option value="Trust President"></option>
            <option value="Trustee"></option>
            <option value="Yagna Acharya"></option>
            <option value="Path Acharya"></option>
            <option value="Mahila Mandal Head"></option>
          </datalist>
        </div>
        <div class="form-group">
          <label class="form-label" for="gstFieldNotes">Notes</label>
          <textarea class="form-input mg-textarea" id="gstFieldNotes" rows="2" placeholder="Travel, hospitality, speciality, etc."></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalGuest')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formGuest" id="guestFormSubmitBtn">Add Guest</button>
    </div>
  </div>
</div>

<!-- Add / Edit Pooja Type -->
<div class="modal-overlay" id="modalPoojaType">
  <div class="modal-box">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="poojaTypeFormTitle">Add Ritual Type (catalog)</div>
        <span class="mg-muted-xs">A reusable template — <strong>no dates here</strong>. You set dates when you schedule a Pooja.</span>
      </div>
      <button class="modal-close-btn" onclick="closeModal('modalPoojaType')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formPoojaType" onsubmit="handleSavePoojaType(event)">
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="ptyFieldName">Type Name *</label>
            <input type="text" class="form-input" id="ptyFieldName" placeholder="e.g. Kalash Sthapana" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="ptyFieldCategory">Category</label>
            <input type="text" class="form-input" id="ptyFieldCategory" placeholder="e.g. Sthapana, Havan, Path">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="ptyFieldDesc">Description</label>
          <textarea class="form-input mg-textarea" id="ptyFieldDesc" rows="2" placeholder="Short description of the ritual"></textarea>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="ptyFieldDuration">Default Duration (minutes)</label>
            <input type="number" class="form-input" id="ptyFieldDuration" min="0" placeholder="e.g. 90">
          </div>
          <div class="form-group">
            <label class="form-label" for="ptyFieldIcon">Icon (emoji)</label>
            <input type="text" class="form-input" id="ptyFieldIcon" maxlength="2" placeholder="🪔">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="ptyFieldOfferings">Suggested Offerings / Samagri</label>
          <input type="text" class="form-input" id="ptyFieldOfferings" placeholder="e.g. Ghee, flowers, kumkum, coconut">
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalPoojaType')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formPoojaType" id="poojaTypeFormSubmitBtn">Save to Catalog</button>
    </div>
  </div>
</div>

`);
})();

/* ============================================================
   POOJA APP — MODALS, FORMS & CRUD
   Depends on pooja.js (POOJA store + helpers) and pooja-ui.js
   (render layer). Reuses the generic openConfirm/openSheet and
   openModal/closeModal globals — no new dialog DOM.
   ============================================================ */

/* ------------------------------------------------------------
   OPTION BUILDERS
   ------------------------------------------------------------ */
function renderPoojaTypeOptions(selected) {
  return `<option value="">— Select pooja type —</option>` +
    POOJA.poojaTypes.map(t =>
      `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc((t.icon || '') + ' ' + t.name)}</option>`).join('');
}

/* ------------------------------------------------------------
   DYNAMIC ROWS — sessions / guests / custom fields
   ------------------------------------------------------------ */
function sessionRowsHTML(list) {
  const rows = (list && list.length ? list : [{ label:'', date: pjToday(), startTime:'09:00', endTime:'12:00', venue:'' }]);
  return rows.map(s => `
    <div class="pj-session-row">
      <input class="form-input pj-sess-label" placeholder="Session label (e.g. Havan)" value="${esc(s.label || '')}">
      <input class="form-input pj-sess-date" type="date" value="${esc(s.date || '')}">
      <input class="form-input pj-sess-start" type="time" value="${esc(s.startTime || '09:00')}">
      <input class="form-input pj-sess-end" type="time" value="${esc(s.endTime || '12:00')}">
      <input class="form-input pj-sess-venue" placeholder="Venue" value="${esc(s.venue || '')}">
      <button class="btn btn-outline mg-btn-xs mg-btn-danger" type="button" onclick="removeSessionRow(this)">✕</button>
    </div>`).join('');
}
function renderSessionRows(list) {
  const box = document.getElementById('pjSessionRows');
  if (box) box.innerHTML = sessionRowsHTML(list);
  refreshSessionAddBtn();
}
function addSessionRow() {
  const mode = document.getElementById('pjFieldMode').value;
  if (mode === 'single' && document.querySelectorAll('#pjSessionRows .pj-session-row').length >= 1) {
    pjToast('Single-event pooja has one session. Switch to Multi-session to add more.');
    return;
  }
  const venue = document.getElementById('pjFieldDefaultVenue').value.trim();
  document.getElementById('pjSessionRows').insertAdjacentHTML('beforeend',
    sessionRowsHTML([{ label:'', date: pjToday(), startTime:'09:00', endTime:'12:00', venue }]));
}
function removeSessionRow(btn) {
  const rows = document.querySelectorAll('#pjSessionRows .pj-session-row');
  if (rows.length <= 1) { pjToast('At least one session is required.'); return; }
  btn.closest('.pj-session-row').remove();
}
function refreshSessionAddBtn() {
  const btn = document.getElementById('pjAddSessionBtn');
  const mode = document.getElementById('pjFieldMode');
  if (btn && mode) btn.style.display = (mode.value === 'single') ? 'none' : '';
}
function onPoojaModeChange() {
  const mode = document.getElementById('pjFieldMode').value;
  const rows = document.querySelectorAll('#pjSessionRows .pj-session-row');
  if (mode === 'single' && rows.length > 1) {
    for (let i = rows.length - 1; i >= 1; i--) rows[i].remove();
    pjToast('Kept the first session for a single-event pooja.');
  }
  refreshSessionAddBtn();
}
function onPoojaTypeChange() {
  const t = typeById(document.getElementById('pjFieldType').value);
  const nameEl = document.getElementById('pjFieldName');
  if (t && !nameEl.value.trim()) nameEl.value = t.name;
  const hint = document.getElementById('pjTypeHint');
  if (hint) {
    if (t) {
      const bits = [t.category, t.defaultDurationMin ? '~' + t.defaultDurationMin + ' min' : '', t.suggestedOfferings ? 'Samagri: ' + t.suggestedOfferings : ''].filter(Boolean);
      hint.innerHTML = bits.length ? esc(bits.join('  ·  ')) : 'Reusable ritual template from the catalog.';
    } else {
      hint.innerHTML = 'Not listed? <a href="#" onclick="closeModal(\'modalPooja\');openAddPoojaType();return false;">Add it to the catalog first &rarr;</a>';
    }
  }
}
function syncDefaultVenue() {
  const venue = document.getElementById('pjFieldDefaultVenue').value.trim();
  document.querySelectorAll('#pjSessionRows .pj-sess-venue').forEach(inp => { if (!inp.value.trim()) inp.value = venue; });
}

/* ---- Guest picker inside the Pooja form ---- */
function guestPickerHTML(selectedIds) {
  const sel = selectedIds || [];
  if (!POOJA.people.length) {
    return `<div class="people-check-list"><div class="people-check-empty"><span class="pce-emoji">🎗️</span>No guests on record yet — use “Add new devotee”.</div></div>`;
  }
  const initials = nm => String(nm || '?').trim().split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('') || '?';
  return `<div class="people-check-list">` + POOJA.people.map(x => `
    <label class="people-check-row">
      <input type="checkbox" class="pj-guest-check" value="${x.id}" ${sel.indexOf(x.id) !== -1 ? 'checked' : ''}>
      <span class="pcr-avatar">${esc(initials(personName(x)))}</span>
      <span class="pcr-body">
        <strong>${esc(personName(x))}</strong>
        <small>${esc(x.role || 'Guest')}${x.mobile ? ' · ' + esc(x.mobile) : ''}${x.city ? ' · ' + esc(x.city) : ''}</small>
      </span>
      <button class="btn btn-outline mg-btn-xs" type="button" onclick="event.preventDefault();openEditGuest('${x.id}','poojaForm')">Edit</button>
    </label>`).join('') + `</div>`;
}
/** Render the picker with an explicit list of ticked ids. */
function renderGuestPicker(selectedIds) {
  const box = document.getElementById('pjGuestPicker');
  if (box) box.innerHTML = guestPickerHTML(selectedIds || []);
}
/** Re-render after a guest was added/edited, keeping the current ticks (+ optionally one new id). */
function refreshGuestPicker(addId) {
  const box = document.getElementById('pjGuestPicker');
  if (!box) return;
  const checked = Array.from(box.querySelectorAll('.pj-guest-check:checked')).map(c => c.value);
  if (addId && checked.indexOf(addId) === -1) checked.push(addId);
  box.innerHTML = guestPickerHTML(checked);
}

/* ---- Sevarthi & Coordinator pickers inside the Pooja form (devotee-backed) ---- */
function pjRenderPeoplePickers(sevIds, coordIds) {
  const people = (typeof allPeople === 'function') ? allPeople() : [];
  const s = document.getElementById('pjSevarthiPicker');
  const c = document.getElementById('pjCoordPicker');
  if (s) s.innerHTML = personCheckList(people, sevIds || [], 'pj-sev-check');
  if (c) c.innerHTML = personCheckList(people, coordIds || [], 'pj-coord-check');
}
/** "+ Add new Devotee" from either picker — reuse the shared devotee sheet,
    then re-render with the new person ticked. */
function pjAddPerson(kind) {
  const box = kind === 'coord' ? 'pjCoordPicker' : 'pjSevarthiPicker';
  const checkCls = kind === 'coord' ? 'pj-coord-check' : 'pj-sev-check';
  const keepSev = checkedIds('pjSevarthiPicker', 'pj-sev-check');
  const keepCoord = checkedIds('pjCoordPicker', 'pj-coord-check');
  openDevoteeSheet({
    title: kind === 'coord' ? 'Add a new Coordinator (devotee)' : 'Add a new Sevarthi (devotee)',
    onSaved: function (dev) {
      if (kind === 'coord') keepCoord.push(dev.id); else keepSev.push(dev.id);
      pjRenderPeoplePickers(keepSev, keepCoord);
    }
  });
}

function poojaCustomRowsHTML(list) {
  return (list || []).map(c => `
    <div class="pj-custom-row">
      <input class="form-input pj-cf-label" placeholder="Label (e.g. Muhurat)" value="${esc(c.label || '')}">
      <input class="form-input pj-cf-value" placeholder="Value" value="${esc(c.value || '')}">
      <button class="btn btn-outline mg-btn-xs mg-btn-danger" type="button" onclick="this.closest('.pj-custom-row').remove()">✕</button>
    </div>`).join('');
}
function addPoojaCustomRow() {
  document.getElementById('pjCustomRows').insertAdjacentHTML('beforeend', poojaCustomRowsHTML([{ label:'', value:'' }]));
}

/* ------------------------------------------------------------
   ADD / EDIT POOJA
   ------------------------------------------------------------ */
function openAddPooja() {
  if (!isPoojaAdmin()) { pjToast('Only an administrator can create a Pooja.'); return; }
  POOJA.editingPoojaId = null;
  document.getElementById('poojaFormTitle').textContent = 'Schedule a Pooja / Seva';
  document.getElementById('poojaFormSubmitBtn').textContent = 'Schedule Pooja';

  document.getElementById('formPooja').reset();
  document.getElementById('pjFieldType').innerHTML = renderPoojaTypeOptions('');
  document.getElementById('pjFieldType').disabled = false;  document.getElementById('pjFieldName').value = '';
  document.getElementById('pjFieldMode').value = 'single';
  document.getElementById('pjFieldDefaultVenue').value = '';
  document.getElementById('pjFieldSevaAmount').value = '';
  document.getElementById('pjFieldNotes').value = '';
  renderSessionRows([]);
  renderGuestPicker([]);
  pjRenderPeoplePickers([], []);
  document.getElementById('pjCustomRows').innerHTML = '';
  onPoojaTypeChange();
  openModal('modalPooja');
}

function openEditPooja(id) {
  const p = poojaById(id);
  if (!p) return;
  if (!canOpenPooja(id)) { pjToast('Access denied.'); return; }
  POOJA.editingPoojaId = id;
  document.getElementById('poojaFormTitle').textContent = 'Edit Pooja';
  document.getElementById('poojaFormSubmitBtn').textContent = 'Save Changes';

  document.getElementById('pjFieldType').innerHTML = renderPoojaTypeOptions(p.typeId);  document.getElementById('pjFieldType').disabled = !isPoojaAdmin();
  document.getElementById('pjFieldName').value = p.name;
  document.getElementById('pjFieldMode').value = p.scheduleMode || 'single';
  document.getElementById('pjFieldDefaultVenue').value = p.defaultVenue || '';
  document.getElementById('pjFieldSevaAmount').value = p.estimatedSevaAmount || '';
  document.getElementById('pjFieldNotes').value = p.notes || '';
  renderSessionRows(poojaSessions(p));
  renderGuestPicker(p.guestIds || []);
  pjRenderPeoplePickers(pjSevarthiIdsToDevoteeIds(p.sevarthiIds || []), p.coordinatorIds || []);
  document.getElementById('pjCustomRows').innerHTML = poojaCustomRowsHTML(p.custom || []);
  onPoojaTypeChange();
  openModal('modalPooja');
}

function collectSessionRows() {
  return Array.from(document.querySelectorAll('#pjSessionRows .pj-session-row')).map(row => ({
    label: row.querySelector('.pj-sess-label').value.trim(),
    date: row.querySelector('.pj-sess-date').value,
    startTime: row.querySelector('.pj-sess-start').value,
    endTime: row.querySelector('.pj-sess-end').value,
    venue: row.querySelector('.pj-sess-venue').value.trim()
  }));
}

/* The inline Sevarthi picker works in DEVOTEE ids, but POOJA.sevarthis and
   p.sevarthiIds work in SEV-### ids. Turn a devotee-id list into SEV-### ids,
   creating sevarthi records on demand (dedup by devoteeId, then mobile). */
function pjMaterialiseSevarthis(devoteeIds) {
  return (devoteeIds || []).map(function (did) {
    var per = (typeof window.personById === 'function') ? window.personById(did) : null;
    var nm = per ? per.name : String(did);
    var parts = String(nm).trim().split(/\s+/);
    var mobile = (per && per.mobile) ? String(per.mobile).replace(/\D/g, '') : '';
    var rec = POOJA.sevarthis.find(function (s) {
      return s.devoteeId === did || (mobile && s.mobile === mobile);
    });
    if (!rec) {
      rec = {
        id: nextId('SEV', POOJA.sevarthis, 3), devoteeId: did,
        firstName: parts.shift() || nm, lastName: parts.join(' '),
        mobile: mobile, city: (per && per.city) || '', state: (per && per.state) || 'Gujarat',
        committee: (per && per.samaj) || '', status: 'active', notes: '', addedDate: pjToday()
      };
      POOJA.sevarthis.push(rec);
    }
    return rec.id;
  });
}
/* SEV-### ids → devotee ids, for pre-checking the picker on edit (tolerates
   legacy poojas whose sevarthiIds already hold devotee ids). */
function pjSevarthiIdsToDevoteeIds(sevIds) {
  return (sevIds || []).map(function (id) {
    var s = sevarthiById(id);
    return s ? (s.devoteeId || s.id) : id;
  });
}

/* Reconcile a pooja's coordinator + sevarthi links to the backend.
   prevCoord / nextCoord are DEVOTEE ids (codes). prevSev is a list of SEV-###
   ids (mapped to devotee ids here); nextSev is DEVOTEE ids. */
function pjDiffLinks(code, prevCoord, nextCoord, prevSev, nextSev, localPooja) {
  const prevSevDev = (prevSev || []).map(function (id) { const s = sevarthiById(id); return s ? (s.devoteeId || s.id) : id; });
  const uniq = function (a) { return a.filter(function (v, i) { return a.indexOf(v) === i && v; }); };
  const addCoord = uniq(nextCoord).filter(function (d) { return prevCoord.indexOf(d) === -1; });
  const delCoord = uniq(prevCoord).filter(function (d) { return nextCoord.indexOf(d) === -1; });
  const addSev = uniq(nextSev).filter(function (d) { return prevSevDev.indexOf(d) === -1; });
  const delSev = uniq(prevSevDev).filter(function (d) { return nextSev.indexOf(d) === -1; });

  let chain = Promise.resolve();
  addCoord.forEach(function (d) { chain = chain.then(function () { return window.API.post('/poojas/' + code + '/coordinators', { devoteeId: d }).catch(function(){}); }); });
  delCoord.forEach(function (d) { chain = chain.then(function () { return window.API.del('/poojas/' + code + '/coordinators/' + d).catch(function(){}); }); });
  addSev.forEach(function (d) { chain = chain.then(function () { return window.API.post('/poojas/' + code + '/sevarthis', { devoteeId: d }).catch(function(e){ if (!(e && e.status === 409)) throw e; }); }); });
  delSev.forEach(function (d) {
    chain = chain.then(function () {
      // resolve the devotee id back to a SEV code for the delete route
      const s = POOJA.sevarthis.find(function (x) { return x.devoteeId === d; });
      const ref = s ? (s.code || s.id) : d;
      return window.API.del('/poojas/' + code + '/sevarthis/' + ref).catch(function(){});
    });
  });
  return chain;
}

function handleSavePooja(e) {
  e.preventDefault();
  const name = document.getElementById('pjFieldName').value.trim();
  const typeId = document.getElementById('pjFieldType').value;
  const mode = document.getElementById('pjFieldMode').value;
  const defaultVenue = document.getElementById('pjFieldDefaultVenue').value.trim();
  const accent = (typeof nextCardColor === 'function' ? nextCardColor((POOJA.poojas || []).length) : '#6B1F2A');
  const notes = document.getElementById('pjFieldNotes').value.trim();
  const sevaAmount = parseInt(document.getElementById('pjFieldSevaAmount').value, 10);

  if (!name) { pjToast('Pooja Name is required.'); return; }
  if (!typeId) { pjToast('Please select a Pooja Type.'); return; }

  let sessions = collectSessionRows().filter(s => s.date);
  if (!sessions.length) { pjToast('Add at least one session with a date.'); return; }
  for (const s of sessions) {
    if (s.endTime && s.startTime && s.endTime <= s.startTime) { pjToast('Each session end time must be after its start time.'); return; }
    if (!s.venue) s.venue = defaultVenue;
  }
  if (mode === 'single') sessions = [sessions[0]];

  const guestIds = Array.from(document.querySelectorAll('#pjGuestPicker .pj-guest-check:checked')).map(c => c.value);
  const sevarthiIds = pjMaterialiseSevarthis(checkedIds('pjSevarthiPicker', 'pj-sev-check'));  // → SEV-### ids
  const coordinatorIds = checkedIds('pjCoordPicker', 'pj-coord-check');                        // devotee ids (resolved via personById)
  const custom = Array.from(document.querySelectorAll('#pjCustomRows .pj-custom-row'))
    .map(r => ({ label: r.querySelector('.pj-cf-label').value.trim(), value: r.querySelector('.pj-cf-value').value.trim() }))
    .filter(c => c.label);

  const mintSession = makeSessionIdMinter();

  const online = !!(window.API && window.API.online);
  // devotee ids for the picked sevarthis/coordinators — never a phantom
  const sevDevIds = checkedIds('pjSevarthiPicker', 'pj-sev-check').filter(function (x) { return /^DEV-/i.test(x) || /^\d+$/.test(String(x)); });
  const coordDevIds = coordinatorIds.filter(function (x) { return /^DEV-/i.test(x) || /^\d+$/.test(String(x)); });
  const guestPayload = (function () {
    return guestIds.map(function (gid) {
      const g = pjGuestById(gid); if (!g) return null;
      return { name: (g.firstName + ' ' + (g.lastName || '')).trim(), firstName: g.firstName, lastName: g.lastName || '',
               role: g.role || '', mobile: (g.mobile || '').replace(/\D/g, ''), city: g.city || '', state: g.state || 'Gujarat',
               devoteeId: (g.devoteeId && /^DEV-/i.test(g.devoteeId)) ? g.devoteeId : undefined };
    }).filter(Boolean);
  })();

  if (POOJA.editingPoojaId) {
    const p = poojaById(POOJA.editingPoojaId);
    const prev = p.sessions || [];
    const code = p.code || p.id;
    const newSessions = sessions.map((s, i) => ({
      id: (prev[i] && prev[i].id) || mintSession(),
      label: s.label || `Session ${i + 1}`, date: s.date, startTime: s.startTime, endTime: s.endTime, venue: s.venue
    }));
    const prevSev = (p.sevarthiIds || []).slice();
    const prevCoord = (p.coordinatorIds || []).slice();
    p.sessions = newSessions;
    Object.assign(p, {
      name, defaultVenue, color: accent, notes, guestIds, sevarthiIds, coordinatorIds, custom,
      scheduleMode: mode,
      typeId: isPoojaAdmin() ? typeId : p.typeId,
      estimatedSevaAmount: isNaN(sevaAmount) ? 0 : sevaAmount
    });
    logPoojaActivity(p.id, `Pooja details updated by ${POOJA.session.userName}`);
    pjToast(`${name} updated.`);
    if (online) {
      window.API.patch('/poojas/' + code, {
        name, scheduleMode: mode, defaultVenue, notes, custom,
        estimatedSevaAmount: isNaN(sevaAmount) ? 0 : sevaAmount
      })
        .then(function () {
          // sessions: PATCH existing by id, POST any new ones
          return newSessions.reduce(function (chain, s) {
            return chain.then(function () {
              const had = prev.some(function (x) { return x.id === s.id; });
              const body = { label: s.label, date: s.date, startTime: s.startTime, endTime: s.endTime, venue: s.venue };
              return had ? window.API.patch('/poojas/' + code + '/sessions/' + s.id, body).catch(function(){})
                         : window.API.post('/poojas/' + code + '/sessions', body).catch(function(){});
            });
          }, Promise.resolve());
        })
        .then(function () { return pjDiffLinks(code, prevCoord, coordDevIds, prevSev, sevDevIds, p); })
        .then(function () { return window.__rehydrate && window.__rehydrate(); })
        .catch(function (err) { pjToast((err && err.message) || 'Saved locally — sync failed'); });
    }
  } else {
    const id = nextId('PJA', POOJA.poojas, 3);
    const local = {
      id, typeId, name, scheduleMode: mode, defaultVenue,
      sessions: sessions.map((s, i) => ({
        id: mintSession(),
        label: s.label || `Session ${i + 1}`, date: s.date, startTime: s.startTime, endTime: s.endTime, venue: s.venue
      })),
      guestIds, sevarthiIds, coordinatorIds,
      status: null, color: accent, estimatedSevaAmount: isNaN(sevaAmount) ? 0 : sevaAmount, notes, custom,
      invitation: {
        template: 'royal', accent, headline: '',
        inviteLine: 'With the divine grace of Maa, you are cordially invited to',
        blessing: 'Your presence will be our blessing. Jai Mataji.',
        showSevarthi: true, showGuests: true, showSchedule: true
      },
      createdDate: pjToday()
    };
    POOJA.poojas.push(local);
    logPoojaActivity(id, `Pooja "${name}" created`);
    pjToast(`${name} created.`);
    if (online) {
      window.API.post('/poojas', {
        name, typeId, scheduleMode: mode, defaultVenue, notes, custom,
        estimatedSevaAmount: isNaN(sevaAmount) ? 0 : sevaAmount,
        sessions: sessions.map(x => ({ label: x.label, date: x.date, startTime: x.startTime, endTime: x.endTime, venue: x.venue })),
        guests: guestPayload
      })
        .then(function (c) {
          const code = c && (c.code || c.id);
          if (!code) throw new Error('no pooja code returned');
          local.code = code;
          return pjDiffLinks(code, [], coordDevIds, [], sevDevIds, local);
        })
        .then(function () { return window.__rehydrate && window.__rehydrate(); })
        .catch(function (err) { pjToast((err && err.message) || 'Saved locally — sync failed'); });
    }
  }

  const f = firstSession(poojaById(POOJA.editingPoojaId || POOJA.poojas[POOJA.poojas.length - 1].id));
  if (f) {
    const parts = f.date.split('-').map(Number);
    POOJA.calendarYear = parts[0]; POOJA.calendarMonth = parts[1] - 1;
  }
  POOJA.editingPoojaId = null;
  closeModal('modalPooja');
  renderPooja();
}

/** Flat list of every session across all poojas — for id minting. */
function allSessions() {
  const out = [];
  POOJA.poojas.forEach(p => (p.sessions || []).forEach(s => out.push(s)));
  return out;
}

/** Returns a function that yields fresh, collision-free PSN-### ids. */
function makeSessionIdMinter() {
  let max = 0;
  allSessions().forEach(s => {
    const n = parseInt(String(s.id).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return () => 'PSN-' + String(++max).padStart(3, '0');
}

function confirmDeletePooja(id) {
  const p = poojaById(id);
  if (!p) return;
  if (!isPoojaAdmin()) { pjToast('Only an administrator can delete a Pooja.'); return; }
  openConfirm({
    title: 'Delete Pooja',
    danger: true,
    body: `<p>You are about to delete <strong>${esc(p.name)}</strong>.</p>
           <p class="mg-mt-sm">This removes <strong>${poojaSessions(p).length}</strong> session(s) and the pooja's activity log.</p>
           <p class="mg-muted-xs mg-mt-sm">Sevarthi devotee records are not deleted.</p>
           <p class="mg-mt-sm"><strong>This action cannot be undone.</strong></p>`,
    confirmLabel: 'Delete Pooja',
    onConfirm: () => {
      const code = p.code || p.id;
      const wasSynced = !!p.code;
      POOJA.activity = POOJA.activity.filter(a => a.poojaId !== id);
      POOJA.poojas = POOJA.poojas.filter(x => x.id !== id);
      if (POOJA.activePoojaId === id) { POOJA.activePoojaId = null; POOJA.view = 'directory'; }
      populateCoordRoleOptions();
      pjToast(`${p.name} deleted.`);
      renderPooja();
      if (window.API && window.API.online && wasSynced) {
        window.API.del('/poojas/' + code).catch(function (err) { pjToast((err && err.message) || 'Delete failed to sync'); });
      }
    }
  });
}

/* ------------------------------------------------------------
   STATUS ACTIONS — mark done / extended / cancelled / reopen
   Any admin or assigned coordinator may set these.
   ------------------------------------------------------------ */
function pjSyncStatus(p) {
  if (window.API && window.API.online && p.code) window.API.patch("/poojas/" + p.code, { status: p.status || "planned" }).catch(function () {});
}
function markPoojaDone(id) {
  const p = poojaById(id);
  if (!p) return;
  const early = !poojaSessions(p).every(sessionIsPast);
  openConfirm({
    title: 'Mark Pooja Completed',
    body: `<p>Mark <strong>${esc(p.name)}</strong> as completed?</p>
           ${early ? '<p class="mg-mt-sm mg-muted-xs">Some sessions are still in the future — this records the pooja as done ahead of schedule.</p>' : ''}`,
    confirmLabel: 'Mark Completed',
    onConfirm: () => {
      p.status = 'done';
      p.completedOn = pjToday();
      delete p.extendedUntil;
      logPoojaActivity(id, `Pooja marked completed by ${POOJA.session.userName}`);
      pjToast(`${p.name} marked completed.`);
      renderPooja();
      pjSyncStatus(p);
    }
  });
}

function markPoojaExtended(id) {
  const p = poojaById(id);
  if (!p) return;
  const last = lastSession(p);
  const defDate = last ? isoPlusDays(last.date, 1) : isoPlusDays(pjToday(), 1);
  openSheet({
    title: 'Extend Pooja',
    body: `
      <p class="mg-muted-xs">Use this when the pooja runs longer than planned or continues to another day.</p>
      <div class="form-group mg-mt-sm">
        <label class="form-label" for="pjExtDate">Revised end date</label>
        <input type="date" class="form-input" id="pjExtDate" value="${esc(defDate)}">
      </div>
      <div class="form-group">
        <label class="form-label" for="pjExtNote">Note (optional)</label>
        <input class="form-input" id="pjExtNote" placeholder="e.g. Purnahuti pushed to next morning">
      </div>`,
    footer: `<button class="btn btn-outline" onclick="closeSheet()">Cancel</button>
             <button class="btn btn-primary" onclick="confirmExtendPooja('${id}')">Mark Extended</button>`
  });
}
function confirmExtendPooja(id) {
  const p = poojaById(id);
  if (!p) return;
  const d = document.getElementById('pjExtDate').value;
  const note = document.getElementById('pjExtNote').value.trim();
  if (!d) { pjToast('Pick a revised end date.'); return; }
  p.status = 'extended';
  p.extendedUntil = d;
  if (note) p.custom = (p.custom || []).concat([{ label: 'Extension note', value: note }]);
  delete p.completedOn;
  logPoojaActivity(id, `Pooja extended to ${fmtDate(d)}${note ? ' — ' + note : ''}`);
  closeSheet();
  pjToast('Pooja marked as extended.');
  renderPooja();
  pjSyncStatus(p);
}

function cancelPooja(id) {
  const p = poojaById(id);
  if (!p) return;
  openConfirm({
    title: 'Cancel Pooja',
    danger: true,
    body: `<p>Cancel <strong>${esc(p.name)}</strong>? It stays on record but is marked cancelled everywhere.</p>`,
    confirmLabel: 'Cancel Pooja',
    onConfirm: () => {
      p.status = 'cancelled';
      logPoojaActivity(id, `Pooja cancelled by ${POOJA.session.userName}`);
      pjToast('Pooja marked cancelled.');
      renderPooja();
      pjSyncStatus(p);
    }
  });
}
function reopenPooja(id) {
  const p = poojaById(id);
  if (!p) return;
  p.status = null;
  delete p.completedOn;
  delete p.extendedUntil;
  logPoojaActivity(id, `Pooja reopened by ${POOJA.session.userName} — status back to automatic`);
  pjToast('Pooja reopened. Status now follows the dates again.');
  renderPooja();
  pjSyncStatus(p);
}

function isoPlusDays(iso, n) {
  const parts = String(iso).split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2] + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ------------------------------------------------------------
   GUEST & PANDIT REGISTRY
   ------------------------------------------------------------ */
let _guestReturnTo = null;   // 'poojaForm' | 'directory' | null

function openAddGuest(returnTo) {
  _guestReturnTo = returnTo || null;
  POOJA.editingGuestId = null;
  document.getElementById('guestFormTitle').textContent = 'Add Guest';
  document.getElementById('guestFormSubmitBtn').textContent = 'Add Guest';
  document.getElementById('formGuest').reset();
  document.getElementById('gstPersonMount').innerHTML = devoteeLinkField({
    selId: 'gstDevoteeSel', label: 'Guest (devotee)', required: true,
    hint: 'Pick from the register, or add a new devotee. The role below is specific to this event.'
  });
  openModal('modalGuest');
}
function openEditGuest(id, returnTo) {
  const x = pjGuestById(id);
  if (!x) return;
  _guestReturnTo = returnTo || null;
  POOJA.editingGuestId = id;
  document.getElementById('guestFormTitle').textContent = 'Edit Guest';
  document.getElementById('guestFormSubmitBtn').textContent = 'Save Changes';
  document.getElementById('gstPersonMount').innerHTML = devoteeLinkField({
    selId: 'gstDevoteeSel', label: 'Guest (devotee)', required: true,
    selectedId: x.devoteeId,
    selectedLabel: personName(x) + (x.mobile ? ' · ' + x.mobile : '') + (x.city ? ' · ' + x.city : '')
  });
  document.getElementById('gstFieldRole').value = x.role || '';
  document.getElementById('gstFieldNotes').value = x.notes || '';
  openModal('modalGuest');
}
function handleSaveGuest(e) {
  e.preventDefault();
  const person = (typeof devoteeLinkValue === 'function') ? devoteeLinkValue('gstDevoteeSel') : null;
  if (!person) { pjToast('Pick a devotee, or add a new one.'); return; }
  const first = person.firstName;
  const last = person.lastName || '';
  const role = document.getElementById('gstFieldRole').value.trim();
  const mobile = String(person.mobile || '').replace(/\D/g, '').slice(0, 10);
  const city = person.city || '';
  const state = person.state || 'Gujarat';
  const notes = document.getElementById('gstFieldNotes').value.trim();
  const pickedDevoteeId = person.id;
  if (!first) { pjToast('The chosen devotee has no name on record.'); return; }

  const wasEditing = !!POOJA.editingGuestId;
  let savedId;
  if (wasEditing) {
    const x = pjGuestById(POOJA.editingGuestId);
    Object.assign(x, { devoteeId: pickedDevoteeId || x.devoteeId, firstName: first, lastName: last, role, mobile, city, state, notes });
    savedId = x.id;
    pjToast(`${personName(x)} updated.`);
  } else {
    const dupe = POOJA.people.find(x => x.devoteeId === pickedDevoteeId || (mobile && x.mobile === mobile));
    if (dupe) { pjToast(`${personName(dupe)} is already in the guest registry.`); return; }
    savedId = nextId('GST', POOJA.people, 3);
    POOJA.people.push({ id: savedId, devoteeId: pickedDevoteeId, firstName: first, lastName: last, role, mobile, city, state, notes });
    pjToast(`${(first + ' ' + last).trim()} added to Guests.`);
  }

  POOJA.editingGuestId = null;
  const returnTo = _guestReturnTo;
  _guestReturnTo = null;
  closeModal('modalGuest');

  if (returnTo === 'poojaForm') {
    refreshGuestPicker(wasEditing ? null : savedId);   // guest rides along in the POST /poojas body
  } else {
    // standalone add on an open pooja workspace → attach it now
    const ap = poojaById(POOJA.activePoojaId);
    if (!wasEditing && ap && window.API && window.API.online && !!ap.code) {
      if (!ap.guestIds) ap.guestIds = [];
      if (ap.guestIds.indexOf(savedId) === -1) ap.guestIds.push(savedId);
      window.API.post('/poojas/' + (ap.code || ap.id) + '/guests', {
        firstName: first, lastName: last, name: (first + ' ' + last).trim(), role, mobile, city, state,
        devoteeId: (pickedDevoteeId && /^DEV-/i.test(pickedDevoteeId)) ? pickedDevoteeId : undefined
      })
        .then(function () { return window.__rehydrate && window.__rehydrate(); })
        .catch(function (err) { pjToast((err && err.message) || 'Saved locally — sync failed'); });
    }
    renderPooja();
  }
}
function confirmDeleteGuest(id) {
  const x = pjGuestById(id);
  if (!x) return;
  const used = POOJA.poojas.filter(p => (p.guestIds || []).indexOf(id) !== -1);
  openConfirm({
    title: 'Delete Guest',
    danger: true,
    body: `<p>Delete <strong>${esc(personName(x))}</strong> from the registry?</p>
           ${used.length ? `<p class="mg-muted-xs mg-mt-sm">They are attached to ${used.length} pooja(s); they will be removed from those too.</p>` : ''}`,
    confirmLabel: 'Delete',
    onConfirm: () => {
      const wasSynced = !x.code;
      const linkedPoojas = POOJA.poojas.filter(p => (p.guestIds || []).indexOf(id) !== -1);
      POOJA.poojas.forEach(p => { if (p.guestIds) p.guestIds = p.guestIds.filter(g => g !== id); });
      POOJA.people = POOJA.people.filter(x => x.id !== id);
      pjToast('Guest deleted.');
      renderPooja();
      if (window.API && window.API.online && wasSynced) {
        linkedPoojas.forEach(function (p) {
          if (p.code)
            window.API.del('/poojas/' + (p.code || p.id) + '/guests/' + (x.code || x.id)).catch(function () {});
        });
      }
    }
  });
}

/* ------------------------------------------------------------
   ADD / EDIT SEVARTHI
   ------------------------------------------------------------ */
function openAddSevarthi(poojaId) {
  const p = poojaById(poojaId);
  if (!p || !canOpenPooja(poojaId)) { pjToast('Access denied.'); return; }
  POOJA.editingSevarthiId = null;
  POOJA.activePoojaId = poojaId;

  document.getElementById('sevarthiFormTitle').textContent = 'Add Sevarthi';
  document.getElementById('sevarthiFormSubmitBtn').textContent = 'Add Sevarthi';
  document.getElementById('sevFormPooja').textContent = p.name;

  document.getElementById('formSevarthi').reset();
  document.getElementById('sevPersonMount').innerHTML = devoteeLinkField({
    selId: 'sevDevoteeSel', label: 'Sevarthi (devotee)', required: true,
    hint: 'Pick from the register, or add a new devotee. The same person can sponsor several poojas.'
  });
  document.getElementById('sevFieldStatus').value = 'active';
  document.getElementById('sevExistingHint').innerHTML = '';
  openModal('modalSevarthi');
}

function openEditSevarthi(id) {
  const s = sevarthiById(id);
  if (!s) return;
  POOJA.editingSevarthiId = id;
  const p = poojaById(POOJA.activePoojaId);

  document.getElementById('sevarthiFormTitle').textContent = 'Edit Sevarthi';
  document.getElementById('sevarthiFormSubmitBtn').textContent = 'Save Changes';
  document.getElementById('sevFormPooja').textContent = p ? p.name : '—';

  document.getElementById('sevPersonMount').innerHTML = devoteeLinkField({
    selId: 'sevDevoteeSel', label: 'Sevarthi (devotee)', required: true,
    selectedId: s.devoteeId,
    selectedLabel: (s.firstName + ' ' + s.lastName).trim() + (s.mobile ? ' · ' + s.mobile : '') + (s.city ? ' · ' + s.city : '')
  });
  document.getElementById('sevFieldCommittee').value = s.committee || '';
  document.getElementById('sevFieldStatus').value = s.status || 'active';
  document.getElementById('sevFieldNotes').value = s.notes || '';
  document.getElementById('sevExistingHint').innerHTML = '';
  openModal('modalSevarthi');
}

/* checkExistingSevarthi() was the old mobile-field live lookup. The Sevarthi
   modal is now a devotee picker (select an existing devotee or "+ Add new
   devotee"), which handles reuse itself, so the function is gone. */
function checkExistingSevarthi() {}

function handleSaveSevarthi(e) {
  e.preventDefault();
  const p = poojaById(POOJA.activePoojaId);
  if (!p) return;

  const person = (typeof devoteeLinkValue === 'function') ? devoteeLinkValue('sevDevoteeSel') : null;
  if (!person) { pjToast('Pick a devotee, or add a new one.'); return; }
  const firstName = person.firstName;
  const lastName = person.lastName || '';
  const mobile = String(person.mobile || '').replace(/\D/g, '');
  const city = person.city || '';
  const state = person.state || 'Gujarat';
  const pickedDevoteeId = person.id;
  const committee = document.getElementById('sevFieldCommittee').value.trim();
  const status = document.getElementById('sevFieldStatus').value;
  const notes = document.getElementById('sevFieldNotes').value.trim();

  if (!firstName) { pjToast('The chosen devotee has no name on record.'); return; }
  if (mobile && !/^[0-9]{10}$/.test(mobile)) { pjToast('That devotee’s mobile is not 10 digits — fix it in the register.'); return; }

  if (!pickedDevoteeId) { pjToast('Pick a devotee from the register first.'); return; }
  const online = !!(window.API && window.API.online);
  const code = p.code || p.id;

  if (POOJA.editingSevarthiId) {
    const s = sevarthiById(POOJA.editingSevarthiId);
    Object.assign(s, { devoteeId: pickedDevoteeId || s.devoteeId, firstName, lastName, mobile, city, state, committee, status, notes });
    logPoojaActivity(p.id, `Sevarthi ${firstName} ${lastName} details updated`);
    pjToast(`${firstName} ${lastName} updated.`);
    if (online && !!s.code) {
      window.API.patch('/sevarthis/' + (s.code || s.id), { firstName, lastName, mobile, city, state, committee, status, notes })
        .then(function () { return window.__rehydrate && window.__rehydrate(); })
        .catch(function (err) { pjToast((err && err.message) || 'Saved locally — sync failed'); });
    }
  } else {
    if ((p.sevarthiIds || []).some(id => {
      const sv = sevarthiById(id) || {};
      return sv.devoteeId === pickedDevoteeId || (mobile && sv.mobile === mobile);
    })) {
      pjToast(`${firstName} ${lastName} is already a sevarthi of this pooja.`); return;
    }
    const existing = POOJA.sevarthis.find(s => s.devoteeId === pickedDevoteeId || (mobile && s.mobile === mobile));
    let record = existing;
    if (!existing) {
      record = {
        id: nextId('SEV', POOJA.sevarthis, 3), devoteeId: pickedDevoteeId,
        firstName, lastName, mobile, city, state, committee, status, notes, addedDate: pjToday()
      };
      POOJA.sevarthis.push(record);
      logPoojaActivity(p.id, `New sevarthi ${firstName} ${lastName} added`);
    } else {
      logPoojaActivity(p.id, `${firstName} ${lastName} (${existing.devoteeId}) linked as sevarthi`);
    }
    if (!p.sevarthiIds) p.sevarthiIds = [];
    if (p.sevarthiIds.indexOf(record.id) === -1) p.sevarthiIds.push(record.id);
    pjToast(`${firstName} ${lastName} added to ${p.name}.`);
    if (online) {
      window.API.post('/poojas/' + code + '/sevarthis', { devoteeId: pickedDevoteeId })
        .then(function () { return window.__rehydrate && window.__rehydrate(); })
        .catch(function (err) {
          if (err && err.status === 409) { pjToast('Already a sevarthi of this pooja.'); return window.__rehydrate && window.__rehydrate(); }
          pjToast((err && err.message) || 'Saved locally — sync failed');
        });
    }
  }

  POOJA.editingSevarthiId = null;
  closeModal('modalSevarthi');
  renderPooja();
}

function removeSevarthiFromPooja(poojaId, sevId) {
  const p = poojaById(poojaId);
  const s = sevarthiById(sevId);
  if (!p || !s) return;
  openConfirm({
    title: 'Remove Sevarthi',
    danger: true,
    body: `<p>Remove <strong>${esc(s.firstName + ' ' + s.lastName)}</strong> as a sevarthi of <strong>${esc(p.name)}</strong>?</p>
           <p class="mg-muted-xs mg-mt-sm">The devotee record (${esc(s.devoteeId)}) is kept and stays available for other poojas.</p>`,
    confirmLabel: 'Remove',
    onConfirm: () => {
      const code = p.code || p.id;
      const ref = s.code || s.id;
      const wasSynced = !!s.code && !!p.code;
      p.sevarthiIds = (p.sevarthiIds || []).filter(id => id !== sevId);
      if (POOJA.activeSevarthiId === sevId) POOJA.activeSevarthiId = null;
      logPoojaActivity(poojaId, `${s.firstName} ${s.lastName} removed as sevarthi`);
      pjToast('Sevarthi removed from this pooja.');
      renderPooja();
      if (window.API && window.API.online && wasSynced) {
        window.API.del('/poojas/' + code + '/sevarthis/' + ref).catch(function (err) { pjToast((err && err.message) || 'Remove failed to sync'); });
      }
    }
  });
}

function toggleSevarthiStatus(id) {
  const s = sevarthiById(id);
  if (!s) return;
  if (s.status === 'active') {
    openConfirm({
      title: 'Deactivate Sevarthi',
      body: `<p>Mark <strong>${esc(s.firstName + ' ' + s.lastName)}</strong> inactive?</p>
             <p class="mg-mt-sm">Their record and pooja links are preserved.</p>`,
      confirmLabel: 'Deactivate',
      onConfirm: () => {
        s.status = 'inactive';
        pjToast(`${s.firstName} ${s.lastName} deactivated.`);
        renderPooja();
        pjSyncSevarthiStatus(s);
      }
    });
  } else {
    s.status = 'active';
    pjToast(`${s.firstName} ${s.lastName} reactivated.`);
    renderPooja();
    pjSyncSevarthiStatus(s);
  }
}
function pjSyncSevarthiStatus(s) {
  if (window.API && window.API.online && s.code) window.API.patch('/sevarthis/' + s.code, { status: s.status }).catch(function () {});
}

/* ------------------------------------------------------------
   POOJA TYPE CATALOG
   ------------------------------------------------------------ */
function openAddPoojaType() {
  if (!isPoojaAdmin()) { pjToast('Only an administrator can manage the type catalog.'); return; }
  POOJA.editingTypeId = null;
  document.getElementById('poojaTypeFormTitle').textContent = 'Add Ritual Type (catalog)';
  document.getElementById('poojaTypeFormSubmitBtn').textContent = 'Save to Catalog';
  document.getElementById('formPoojaType').reset();
  openModal('modalPoojaType');
}
function openEditPoojaType(id) {
  const t = typeById(id);
  if (!t) return;
  POOJA.editingTypeId = id;
  document.getElementById('poojaTypeFormTitle').textContent = 'Edit Ritual Type (catalog)';
  document.getElementById('poojaTypeFormSubmitBtn').textContent = 'Save Changes';
  document.getElementById('ptyFieldName').value = t.name;
  document.getElementById('ptyFieldCategory').value = t.category || '';
  document.getElementById('ptyFieldDesc').value = t.description || '';
  document.getElementById('ptyFieldDuration').value = t.defaultDurationMin || '';
  document.getElementById('ptyFieldIcon').value = t.icon || '';
  document.getElementById('ptyFieldOfferings').value = t.suggestedOfferings || '';
  openModal('modalPoojaType');
}
function handleSavePoojaType(e) {
  e.preventDefault();
  const name = document.getElementById('ptyFieldName').value.trim();
  if (!name) { pjToast('Type Name is required.'); return; }
  const dupe = POOJA.poojaTypes.find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== POOJA.editingTypeId);
  if (dupe) { pjToast('A pooja type with this name already exists.'); return; }

  const payload = {
    name,
    category: document.getElementById('ptyFieldCategory').value.trim(),
    description: document.getElementById('ptyFieldDesc').value.trim(),
    defaultDurationMin: parseInt(document.getElementById('ptyFieldDuration').value, 10) || 0,
    icon: document.getElementById('ptyFieldIcon').value.trim() || '🪔',
    suggestedOfferings: document.getElementById('ptyFieldOfferings').value.trim()
  };

  const online = !!(window.API && window.API.online);
  if (POOJA.editingTypeId) {
    const t = typeById(POOJA.editingTypeId);
    Object.assign(t, payload);
    pjToast(`${name} updated.`);
    if (online && (t.code || /^(PTY|PJT)-/i.test(t.id))) {
      window.API.patch('/pooja-types/' + (t.code || t.id), payload).catch(function (err) { pjToast((err && err.message) || 'Saved locally — sync failed'); });
    }
  } else {
    if (POOJA.poojaTypes.length >= 36) { pjToast('The master catalog already holds 36 pooja types.'); return; }
    const t = Object.assign({ id: nextId('PTY', POOJA.poojaTypes, 3) }, payload);
    POOJA.poojaTypes.push(t);
    pjToast(`${name} added to the catalog.`);
    if (online) window.API.post('/pooja-types', payload)
      .then(function () { return window.__rehydrate && window.__rehydrate(); })
      .catch(function (err) { pjToast((err && err.message) || 'Saved locally — sync failed'); });
  }
  POOJA.editingTypeId = null;
  closeModal('modalPoojaType');
  renderPooja();
}
function confirmDeletePoojaType(id) {
  const t = typeById(id);
  if (!t) return;
  const used = POOJA.poojas.filter(p => p.typeId === id).length;
  if (used) { pjToast(`${used} pooja(s) use this type — reassign them first.`); return; }
  openConfirm({
    title: 'Delete Pooja Type',
    danger: true,
    body: `<p>Delete <strong>${esc(t.name)}</strong> from the master catalog?</p>`,
    confirmLabel: 'Delete Type',
    onConfirm: () => {
      const wasSynced = t.code || /^(PTY|PJT)-/i.test(t.id);
      POOJA.poojaTypes = POOJA.poojaTypes.filter(x => x.id !== id);
      pjToast('Pooja type deleted.');
      renderPooja();
      if (window.API && window.API.online && wasSynced) window.API.del('/pooja-types/' + (t.code || t.id)).catch(function () {});
    }
  });
}

/* ------------------------------------------------------------
   SETTINGS — CUSTOM FIELDS
   ------------------------------------------------------------ */
function handleSaveCustomFields(e, poojaId) {
  e.preventDefault();
  const p = poojaById(poojaId);
  if (!p) return;
  p.custom = Array.from(document.querySelectorAll('#pjSettingsCustomRows .pj-custom-row'))
    .map(r => ({ label: r.children[0].value.trim(), value: r.children[1].value.trim() }))
    .filter(c => c.label);
  logPoojaActivity(poojaId, 'Custom fields updated');
  pjToast('Custom fields saved.');
  renderPooja();
  if (window.API && window.API.online && !!p.code) {
    window.API.patch('/poojas/' + (p.code || p.id), { custom: p.custom }).catch(function (err) { pjToast((err && err.message) || 'Saved locally — sync failed'); });
  }
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('poojaRoot')) return;
  populateCoordRoleOptions();
  renderPooja();
  if (typeof onLanguageChange === 'function') onLanguageChange(() => renderPooja());

  const cnt = document.getElementById('dashPoojaCount');
  if (cnt) cnt.textContent = `${POOJA.poojas.length} Poojas · ${POOJA.poojaTypes.length} Types`;
});
