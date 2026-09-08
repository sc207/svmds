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
          </div>
          <div class="form-group">
            <label class="form-label" for="pjFieldAccent">Card / Calendar Colour</label>
            <select class="form-select" id="pjFieldAccent"></select>
          </div>
        </div>

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

        <div class="form-group">
          <div class="flex justify-between items-center">
            <label class="form-label" style="margin:0;">Guests &amp; Pandits</label>
            <button class="btn btn-outline mg-btn-xs" type="button" onclick="openAddGuest('poojaForm')">+ Add new Guest / Pandit</button>
          </div>
          <div class="mg-muted-xs" style="margin-bottom:0.4rem;">Tick everyone attending. Your form stays saved while you add or edit a person.</div>
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
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="sevFieldFirst">First Name *</label>
            <input type="text" class="form-input" id="sevFieldFirst" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="sevFieldLast">Last Name *</label>
            <input type="text" class="form-input" id="sevFieldLast" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="sevFieldMobile">Mobile Number *</label>
          <input type="tel" class="form-input" id="sevFieldMobile" pattern="[0-9]{10}" maxlength="10" placeholder="10-digit mobile" required oninput="checkExistingSevarthi()">
          <div id="sevExistingHint"></div>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="sevFieldCity">City</label>
            <input type="text" class="form-input" id="sevFieldCity" placeholder="e.g. Sanand">
          </div>
          <div class="form-group">
            <label class="form-label" for="sevFieldState">State</label>
            <input type="text" class="form-input" id="sevFieldState" placeholder="e.g. Gujarat">
          </div>
        </div>
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

<!-- Add / Edit Guest or Pandit (opens on top of the Pooja form; that form is preserved) -->
<div class="modal-overlay" id="modalGuest">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="guestFormTitle">Add Guest / Pandit</div>
      <button class="modal-close-btn" onclick="closeModal('modalGuest')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formGuest" onsubmit="handleSaveGuest(event)">
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="gstFieldFirst">First Name *</label>
            <input type="text" class="form-input" id="gstFieldFirst" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="gstFieldLast">Last Name</label>
            <input type="text" class="form-input" id="gstFieldLast">
          </div>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="gstFieldRole">Role</label>
            <input type="text" class="form-input" id="gstFieldRole" list="gstRoleList" placeholder="e.g. Pandit, Chief Guest">
            <datalist id="gstRoleList">
              <option value="Pandit"></option>
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
            <label class="form-label" for="gstFieldMobile">Mobile Number</label>
            <input type="tel" class="form-input" id="gstFieldMobile" maxlength="10" placeholder="10-digit mobile">
          </div>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="gstFieldCity">City</label>
            <input type="text" class="form-input" id="gstFieldCity" placeholder="e.g. Sanand">
          </div>
          <div class="form-group">
            <label class="form-label" for="gstFieldState">State</label>
            <input type="text" class="form-input" id="gstFieldState" placeholder="e.g. Gujarat">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="gstFieldNotes">Notes</label>
          <textarea class="form-input mg-textarea" id="gstFieldNotes" rows="2" placeholder="Travel, hospitality, speciality, etc."></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalGuest')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formGuest" id="guestFormSubmitBtn">Add Guest / Pandit</button>
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
function renderAccentOptions(selected) {
  return POOJA.accentPalette.map(a =>
    `<option value="${a.hex}" ${a.hex === selected ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
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

/* ---- Guest & Pandit picker inside the Pooja form ---- */
function guestPickerHTML(selectedIds) {
  const sel = selectedIds || [];
  if (!POOJA.people.length) {
    return `<div class="mg-pad-note">No guests or pandits on record yet. Use “+ Add new Guest / Pandit”.</div>`;
  }
  return `<div class="pj-people-list">` + POOJA.people.map(x => `
    <label class="pj-people-row">
      <input type="checkbox" class="pj-guest-check" value="${x.id}" ${sel.indexOf(x.id) !== -1 ? 'checked' : ''}>
      <span class="pj-people-body">
        <strong>${esc(personName(x))}</strong>
        <small>${esc(x.role || 'Guest')}${x.mobile ? ' · ' + esc(x.mobile) : ''}${x.city ? ' · ' + esc(x.city) : ''}</small>
      </span>
      <button class="btn btn-outline mg-btn-xs" type="button" onclick="openEditGuest('${x.id}','poojaForm')">Edit</button>
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
  document.getElementById('pjFieldType').disabled = false;
  document.getElementById('pjFieldAccent').innerHTML = renderAccentOptions(POOJA.accentPalette[0].hex);
  document.getElementById('pjFieldName').value = '';
  document.getElementById('pjFieldMode').value = 'single';
  document.getElementById('pjFieldDefaultVenue').value = '';
  document.getElementById('pjFieldSevaAmount').value = '';
  document.getElementById('pjFieldNotes').value = '';
  renderSessionRows([]);
  renderGuestPicker([]);
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

  document.getElementById('pjFieldType').innerHTML = renderPoojaTypeOptions(p.typeId);
  document.getElementById('pjFieldAccent').innerHTML = renderAccentOptions(p.color);
  document.getElementById('pjFieldType').disabled = !isPoojaAdmin();
  document.getElementById('pjFieldName').value = p.name;
  document.getElementById('pjFieldMode').value = p.scheduleMode || 'single';
  document.getElementById('pjFieldDefaultVenue').value = p.defaultVenue || '';
  document.getElementById('pjFieldSevaAmount').value = p.estimatedSevaAmount || '';
  document.getElementById('pjFieldNotes').value = p.notes || '';
  renderSessionRows(poojaSessions(p));
  renderGuestPicker(p.guestIds || []);
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

function handleSavePooja(e) {
  e.preventDefault();
  const name = document.getElementById('pjFieldName').value.trim();
  const typeId = document.getElementById('pjFieldType').value;
  const mode = document.getElementById('pjFieldMode').value;
  const defaultVenue = document.getElementById('pjFieldDefaultVenue').value.trim();
  const accent = document.getElementById('pjFieldAccent').value;
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
  const custom = Array.from(document.querySelectorAll('#pjCustomRows .pj-custom-row'))
    .map(r => ({ label: r.querySelector('.pj-cf-label').value.trim(), value: r.querySelector('.pj-cf-value').value.trim() }))
    .filter(c => c.label);

  const mintSession = makeSessionIdMinter();

  if (POOJA.editingPoojaId) {
    const p = poojaById(POOJA.editingPoojaId);
    const prev = p.sessions || [];
    p.sessions = sessions.map((s, i) => ({
      id: (prev[i] && prev[i].id) || mintSession(),
      label: s.label || `Session ${i + 1}`, date: s.date, startTime: s.startTime, endTime: s.endTime, venue: s.venue
    }));
    Object.assign(p, {
      name, defaultVenue, color: accent, notes, guestIds, custom,
      scheduleMode: mode,
      typeId: isPoojaAdmin() ? typeId : p.typeId,
      estimatedSevaAmount: isNaN(sevaAmount) ? 0 : sevaAmount
    });
    logPoojaActivity(p.id, `Pooja details updated by ${POOJA.session.userName}`);
    pjToast(`${name} updated.`);
  } else {
    const id = nextId('PJA', POOJA.poojas, 3);
    POOJA.poojas.push({
      id, typeId, name, scheduleMode: mode, defaultVenue,
      sessions: sessions.map((s, i) => ({
        id: mintSession(),
        label: s.label || `Session ${i + 1}`, date: s.date, startTime: s.startTime, endTime: s.endTime, venue: s.venue
      })),
      guestIds, sevarthiIds: [], coordinatorIds: [],
      status: null, color: accent, estimatedSevaAmount: isNaN(sevaAmount) ? 0 : sevaAmount, notes, custom,
      invitation: {
        template: 'royal', accent, headline: '',
        inviteLine: 'With the divine grace of Maa, you are cordially invited to',
        blessing: 'Your presence will be our blessing. Jai Mataji.',
        showSevarthi: true, showGuests: true, showSchedule: true
      },
      createdDate: pjToday()
    });
    logPoojaActivity(id, `Pooja "${name}" created`);
    pjToast(`${name} created. Open it to add sevarthis.`);
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
      POOJA.activity = POOJA.activity.filter(a => a.poojaId !== id);
      POOJA.poojas = POOJA.poojas.filter(x => x.id !== id);
      if (POOJA.activePoojaId === id) { POOJA.activePoojaId = null; POOJA.view = 'directory'; }
      populateCoordRoleOptions();
      pjToast(`${p.name} deleted.`);
      renderPooja();
    }
  });
}

/* ------------------------------------------------------------
   STATUS ACTIONS — mark done / extended / cancelled / reopen
   Any admin or assigned coordinator may set these.
   ------------------------------------------------------------ */
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
  document.getElementById('guestFormTitle').textContent = 'Add Guest / Pandit';
  document.getElementById('guestFormSubmitBtn').textContent = 'Add Guest / Pandit';
  document.getElementById('formGuest').reset();
  document.getElementById('gstFieldState').value = 'Gujarat';
  openModal('modalGuest');
}
function openEditGuest(id, returnTo) {
  const x = personById(id);
  if (!x) return;
  _guestReturnTo = returnTo || null;
  POOJA.editingGuestId = id;
  document.getElementById('guestFormTitle').textContent = 'Edit Guest / Pandit';
  document.getElementById('guestFormSubmitBtn').textContent = 'Save Changes';
  document.getElementById('gstFieldFirst').value = x.firstName || '';
  document.getElementById('gstFieldLast').value = x.lastName || '';
  document.getElementById('gstFieldRole').value = x.role || '';
  document.getElementById('gstFieldMobile').value = x.mobile || '';
  document.getElementById('gstFieldCity').value = x.city || '';
  document.getElementById('gstFieldState').value = x.state || '';
  document.getElementById('gstFieldNotes').value = x.notes || '';
  openModal('modalGuest');
}
function handleSaveGuest(e) {
  e.preventDefault();
  const first = document.getElementById('gstFieldFirst').value.trim();
  const last = document.getElementById('gstFieldLast').value.trim();
  const role = document.getElementById('gstFieldRole').value.trim();
  const mobile = document.getElementById('gstFieldMobile').value.replace(/\D/g, '').slice(0, 10);
  const city = document.getElementById('gstFieldCity').value.trim();
  const state = document.getElementById('gstFieldState').value.trim();
  const notes = document.getElementById('gstFieldNotes').value.trim();
  if (!first) { pjToast('First name is required.'); return; }
  if (mobile && !/^[0-9]{10}$/.test(mobile)) { pjToast('Mobile must be 10 digits (or left blank).'); return; }

  const wasEditing = !!POOJA.editingGuestId;
  let savedId;
  if (wasEditing) {
    const x = personById(POOJA.editingGuestId);
    Object.assign(x, { firstName: first, lastName: last, role, mobile, city, state, notes });
    savedId = x.id;
    pjToast(`${personName(x)} updated.`);
  } else {
    const dupe = POOJA.people.find(x => x.mobile && x.mobile === mobile);
    if (dupe && mobile) { pjToast(`${personName(dupe)} already has this mobile — edit that record instead.`); return; }
    savedId = nextId('GST', POOJA.people, 3);
    POOJA.people.push({ id: savedId, firstName: first, lastName: last, role, mobile, city, state, notes });
    pjToast(`${first} ${last} added to Guests & Pandits.`);
  }

  POOJA.editingGuestId = null;
  const returnTo = _guestReturnTo;
  _guestReturnTo = null;
  closeModal('modalGuest');

  if (returnTo === 'poojaForm') {
    refreshGuestPicker(wasEditing ? null : savedId);   // keep the pooja form intact
  } else {
    renderPooja();
  }
}
function confirmDeleteGuest(id) {
  const x = personById(id);
  if (!x) return;
  const used = POOJA.poojas.filter(p => (p.guestIds || []).indexOf(id) !== -1);
  openConfirm({
    title: 'Delete Guest / Pandit',
    danger: true,
    body: `<p>Delete <strong>${esc(personName(x))}</strong> from the registry?</p>
           ${used.length ? `<p class="mg-muted-xs mg-mt-sm">They are attached to ${used.length} pooja(s); they will be removed from those too.</p>` : ''}`,
    confirmLabel: 'Delete',
    onConfirm: () => {
      POOJA.poojas.forEach(p => { if (p.guestIds) p.guestIds = p.guestIds.filter(g => g !== id); });
      POOJA.people = POOJA.people.filter(x => x.id !== id);
      pjToast('Guest / Pandit deleted.');
      renderPooja();
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
  document.getElementById('sevFieldState').value = 'Gujarat';
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

  document.getElementById('sevFieldFirst').value = s.firstName;
  document.getElementById('sevFieldLast').value = s.lastName;
  document.getElementById('sevFieldMobile').value = s.mobile;
  document.getElementById('sevFieldCity').value = s.city || '';
  document.getElementById('sevFieldState').value = s.state || '';
  document.getElementById('sevFieldCommittee').value = s.committee || '';
  document.getElementById('sevFieldStatus').value = s.status || 'active';
  document.getElementById('sevFieldNotes').value = s.notes || '';
  document.getElementById('sevExistingHint').innerHTML = '';
  openModal('modalSevarthi');
}

/** Live check — reuse an existing sevarthi record by mobile. */
function checkExistingSevarthi() {
  const mobile = document.getElementById('sevFieldMobile').value.trim();
  const hint = document.getElementById('sevExistingHint');
  if (!hint || POOJA.editingSevarthiId) return;
  if (mobile.length < 10) { hint.innerHTML = ''; return; }

  const found = POOJA.sevarthis.find(s => s.mobile === mobile);
  if (!found) { hint.innerHTML = ''; return; }

  const p = poojaById(POOJA.activePoojaId);
  const already = p && (p.sevarthiIds || []).indexOf(found.id) !== -1;
  if (already) {
    hint.innerHTML = `<div class="mg-note-box mg-warn">⚠ ${esc(found.firstName + ' ' + found.lastName)} is already a sevarthi of this pooja.</div>`;
  } else {
    hint.innerHTML = `<div class="mg-note-box">✓ Existing devotee <strong>${esc(found.devoteeId)} — ${esc(found.firstName + ' ' + found.lastName)}</strong> found. Adding here links the same record — it will not be duplicated.</div>`;
    document.getElementById('sevFieldFirst').value = found.firstName;
    document.getElementById('sevFieldLast').value = found.lastName;
    document.getElementById('sevFieldCity').value = found.city || '';
    document.getElementById('sevFieldState').value = found.state || '';
    document.getElementById('sevFieldCommittee').value = found.committee || '';
  }
}

function handleSaveSevarthi(e) {
  e.preventDefault();
  const p = poojaById(POOJA.activePoojaId);
  if (!p) return;

  const firstName = document.getElementById('sevFieldFirst').value.trim();
  const lastName = document.getElementById('sevFieldLast').value.trim();
  const mobile = document.getElementById('sevFieldMobile').value.trim();
  const city = document.getElementById('sevFieldCity').value.trim();
  const state = document.getElementById('sevFieldState').value.trim();
  const committee = document.getElementById('sevFieldCommittee').value.trim();
  const status = document.getElementById('sevFieldStatus').value;
  const notes = document.getElementById('sevFieldNotes').value.trim();

  if (!firstName) { pjToast('First Name is required.'); return; }
  if (!lastName) { pjToast('Last Name is required.'); return; }
  if (!/^[0-9]{10}$/.test(mobile)) { pjToast('Mobile Number must be exactly 10 digits.'); return; }

  if (POOJA.editingSevarthiId) {
    const s = sevarthiById(POOJA.editingSevarthiId);
    Object.assign(s, { firstName, lastName, mobile, city, state, committee, status, notes });
    logPoojaActivity(p.id, `Sevarthi ${firstName} ${lastName} details updated`);
    pjToast(`${firstName} ${lastName} updated.`);
  } else {
    if ((p.sevarthiIds || []).some(id => (sevarthiById(id) || {}).mobile === mobile)) {
      pjToast(`${firstName} ${lastName} is already a sevarthi of this pooja.`); return;
    }
    const existing = POOJA.sevarthis.find(s => s.mobile === mobile);
    let record = existing;
    if (existing) {
      logPoojaActivity(p.id, `${firstName} ${lastName} (${existing.devoteeId}) linked as sevarthi`);
    } else {
      const mgIds = (typeof MG !== 'undefined' && MG.members) ? MG.members.map(x => ({ id: x.devoteeId })) : [];
      const devoteeId = nextId('DEV', POOJA.sevarthis.map(x => ({ id: x.devoteeId })).concat(mgIds), 3);
      record = {
        id: nextId('SEV', POOJA.sevarthis, 3), devoteeId,
        firstName, lastName, mobile, city, state, committee, status, notes, addedDate: pjToday()
      };
      POOJA.sevarthis.push(record);
      logPoojaActivity(p.id, `New sevarthi ${firstName} ${lastName} added`);
    }
    if (!p.sevarthiIds) p.sevarthiIds = [];
    if (p.sevarthiIds.indexOf(record.id) === -1) p.sevarthiIds.push(record.id);
    pjToast(`${firstName} ${lastName} added to ${p.name}.`);
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
      p.sevarthiIds = (p.sevarthiIds || []).filter(id => id !== sevId);
      if (POOJA.activeSevarthiId === sevId) POOJA.activeSevarthiId = null;
      logPoojaActivity(poojaId, `${s.firstName} ${s.lastName} removed as sevarthi`);
      pjToast('Sevarthi removed from this pooja.');
      renderPooja();
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
      }
    });
  } else {
    s.status = 'active';
    pjToast(`${s.firstName} ${s.lastName} reactivated.`);
    renderPooja();
  }
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

  if (POOJA.editingTypeId) {
    Object.assign(typeById(POOJA.editingTypeId), payload);
    pjToast(`${name} updated.`);
  } else {
    if (POOJA.poojaTypes.length >= 36) { pjToast('The master catalog already holds 36 pooja types.'); return; }
    POOJA.poojaTypes.push(Object.assign({ id: nextId('PTY', POOJA.poojaTypes, 3) }, payload));
    pjToast(`${name} added to the catalog.`);
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
      POOJA.poojaTypes = POOJA.poojaTypes.filter(x => x.id !== id);
      pjToast('Pooja type deleted.');
      renderPooja();
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
