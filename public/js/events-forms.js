/* ---- Events: modal markup moved out of index.html (injected at load) ---- */
(function () {
  if (typeof document === 'undefined' || document.getElementById('modalEvent')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="modalEvent">
  <div class="modal-box" style="max-width: 720px;">
    <div class="modal-header">
      <div class="modal-title" id="eventFormTitle">Add Event</div>
      <button class="modal-close-btn" onclick="closeModal('modalEvent')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formEvent" onsubmit="handleSaveEvent(event)">
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="evFieldType">Event Type *</label><select class="form-select" id="evFieldType" onchange="onEventTypeChange()"></select></div>
          <div class="form-group"><label class="form-label" for="evFieldName">Event Name *</label><input type="text" class="form-input" id="evFieldName" placeholder="e.g. Navratri Mahotsav 2026" required></div>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="evFieldVenue">Venue</label><input type="text" class="form-input" id="evFieldVenue" placeholder="e.g. Mahotsav Ground"></div>
          <div class="form-group"><label class="form-label" for="evFieldIncharge">In-charge</label><select class="form-select" id="evFieldIncharge"></select></div>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="evFieldFootfall">Expected Footfall</label><input type="number" class="form-input" id="evFieldFootfall" min="0" placeholder="e.g. 3000"></div>
          <div class="form-group"><label class="form-label" for="evFieldBudget">Budget (₹)</label><input type="number" class="form-input" id="evFieldBudget" min="0" placeholder="e.g. 250000"></div>
        </div>
        <div class="form-group">
          <div class="flex justify-between items-center"><label class="form-label" style="margin:0;">Days (date &amp; time) *</label>
            <button class="btn btn-outline mg-btn-xs" type="button" onclick="evAddDayRow()">+ Add day</button></div>
          <div id="evDayRows"></div>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="evFieldAccent">Colour</label><select class="form-select" id="evFieldAccent"></select></div>
          <div class="form-group"></div>
        </div>
        <div class="form-group"><label class="form-label" for="evFieldNotes">Notes</label><textarea class="form-input mg-textarea" id="evFieldNotes" rows="2"></textarea></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalEvent')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formEvent" id="eventFormSubmitBtn">Add Event</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalEventType">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="evTypeFormTitle">Add Event Type</div>
      <button class="modal-close-btn" onclick="closeModal('modalEventType')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formEventType" onsubmit="handleSaveEventType(event)">
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="evTypeFieldName">Type Name *</label><input type="text" class="form-input" id="evTypeFieldName" required></div>
          <div class="form-group"><label class="form-label" for="evTypeFieldCategory">Category</label><input type="text" class="form-input" id="evTypeFieldCategory" placeholder="e.g. Utsav, Seva, Yatra"></div>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="evTypeFieldIcon">Icon (emoji)</label><input type="text" class="form-input" id="evTypeFieldIcon" maxlength="2" placeholder="📅"></div>
          <div class="form-group"></div>
        </div>
        <div class="form-group"><label class="form-label" for="evTypeFieldDesc">Description</label><input type="text" class="form-input" id="evTypeFieldDesc"></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalEventType')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formEventType">Save</button>
    </div>
  </div>
</div>

`);
})();

/* ============================================================
   EVENTS — MODALS, FORMS & CRUD
   ============================================================ */

function evTypeOptions(sel) {
  return `<option value="">— ${window.t('ev_select_type', 'Select type')} —</option>` +
    EV.eventTypes.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc((t.icon || '') + ' ' + t.name)}</option>`).join('');
}
function evInchargeOptions(sel) {
  if (typeof personOptions === 'function') return personOptions(sel, '— ' + window.t('ev_select_incharge', 'Select in-charge') + ' —');
  return `<option value="">— ${window.t('ev_select_incharge', 'Select in-charge')} —</option>` +
    EV.incharges.map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)} · ${esc(i.mobile || '')}</option>`).join('');
}
function evAccentOptions(sel) {
  return EV.accentPalette.map(a => `<option value="${a.hex}" ${a.hex === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
}

function evDayRowsHTML(list) {
  const rows = (list && list.length ? list : [{ date: evToday(), startTime: '18:00', endTime: '22:00' }]);
  return rows.map(d => `
    <div class="pj-session-row">
      <input class="form-input ev-day-date" type="date" value="${esc(d.date || '')}">
      <input class="form-input ev-day-start" type="time" value="${esc(d.startTime || '18:00')}">
      <input class="form-input ev-day-end" type="time" value="${esc(d.endTime || '22:00')}">
      <button class="btn btn-outline mg-btn-xs mg-btn-danger" type="button" onclick="evRemoveDayRow(this)">✕</button>
    </div>`).join('');
}
function evRenderDayRows(list) { const b = document.getElementById('evDayRows'); if (b) b.innerHTML = evDayRowsHTML(list); }
function evAddDayRow() { document.getElementById('evDayRows').insertAdjacentHTML('beforeend', evDayRowsHTML([{ date: evToday(), startTime: '18:00', endTime: '22:00' }])); }
function evRemoveDayRow(btn) {
  if (document.querySelectorAll('#evDayRows .pj-session-row').length <= 1) { evToast(window.t('ev_need_day', 'At least one day is required.')); return; }
  btn.closest('.pj-session-row').remove();
}
function onEventTypeChange() {
  const t = evTypeById(document.getElementById('evFieldType').value);
  const n = document.getElementById('evFieldName');
  if (t && !n.value.trim()) n.value = t.name;
}

function openAddEvent() {
  EV.editingEventId = null;
  document.getElementById('eventFormTitle').textContent = window.t('ev_add', 'Add Event');
  document.getElementById('eventFormSubmitBtn').textContent = window.t('ev_add', 'Add Event');
  document.getElementById('formEvent').reset();
  document.getElementById('evFieldType').innerHTML = evTypeOptions('');
  document.getElementById('evFieldIncharge').innerHTML = evInchargeOptions('');
  document.getElementById('evFieldAccent').innerHTML = evAccentOptions(EV.accentPalette[0].hex);
  evRenderDayRows([]);
  openModal('modalEvent');
}
function openEditEvent(id) {
  const e = eventById(id); if (!e) return;
  EV.editingEventId = id;
  document.getElementById('eventFormTitle').textContent = window.t('ev_edit', 'Edit Event');
  document.getElementById('eventFormSubmitBtn').textContent = window.t('save');
  document.getElementById('evFieldType').innerHTML = evTypeOptions(e.typeId);
  document.getElementById('evFieldIncharge').innerHTML = evInchargeOptions(e.inChargeId);
  document.getElementById('evFieldAccent').innerHTML = evAccentOptions(e.color);
  document.getElementById('evFieldName').value = e.name;
  document.getElementById('evFieldVenue').value = e.venue || '';
  document.getElementById('evFieldFootfall').value = e.expectedFootfall || '';
  document.getElementById('evFieldBudget').value = e.budget || '';
  document.getElementById('evFieldNotes').value = e.notes || '';
  evRenderDayRows(evDays(e));
  openModal('modalEvent');
}
function handleSaveEvent(ev) {
  ev.preventDefault();
  const typeId = document.getElementById('evFieldType').value;
  const name = document.getElementById('evFieldName').value.trim();
  if (!name) { evToast(window.t('ev_need_name', 'Event name is required.')); return; }
  if (!typeId) { evToast(window.t('ev_need_type', 'Select an event type.')); return; }
  const days = Array.from(document.querySelectorAll('#evDayRows .pj-session-row')).map(r => ({
    date: r.querySelector('.ev-day-date').value,
    startTime: r.querySelector('.ev-day-start').value,
    endTime: r.querySelector('.ev-day-end').value
  })).filter(d => d.date);
  if (!days.length) { evToast(window.t('ev_need_day', 'Add at least one day.')); return; }
  for (const d of days) if (d.endTime && d.startTime && d.endTime <= d.startTime) { evToast(window.t('ev_end_after', 'End time must be after start time.')); return; }

  const payload = {
    typeId, name, days,
    venue: document.getElementById('evFieldVenue').value.trim(),
    inChargeId: document.getElementById('evFieldIncharge').value,
    expectedFootfall: parseInt(document.getElementById('evFieldFootfall').value, 10) || 0,
    budget: parseInt(document.getElementById('evFieldBudget').value, 10) || 0,
    color: document.getElementById('evFieldAccent').value,
    notes: document.getElementById('evFieldNotes').value.trim()
  };
  const online = !!(window.API && window.API.online);
  const inChargeDev = /^DEV-/i.test(payload.inChargeId) || /^\d+$/.test(String(payload.inChargeId)) ? payload.inChargeId : null;

  if (EV.editingEventId) {
    const e = eventById(EV.editingEventId);
    const prevInCharge = e.inChargeId;
    const code = e.code || e.id;
    Object.assign(e, payload);
    evLog(EV.editingEventId, window.t('ev_updated', 'Event updated'));
    evToast(name + ' — ' + window.t('save') + ' ✓');
    if (online && e.code) {
      window.API.patch('/events/' + code, {
        name, venue: payload.venue, expectedFootfall: payload.expectedFootfall,
        budget: payload.budget, color: payload.color, notes: payload.notes, days
      })
        .then(function () { return (inChargeDev && inChargeDev !== prevInCharge) ? window.API.post('/events/' + code + '/incharge', { devoteeId: inChargeDev }) : null; })
        .then(function () { return window.__rehydrate && window.__rehydrate('events'); })
        .catch(function (err) { evToast((err && err.message) || 'Saved locally — sync failed'); });
    }
  } else {
    const id = evNextId('EVN', EV.events, 3);
    const local = Object.assign({ id, status: 'planning', createdDate: evToday() }, payload);
    EV.events.push(local);
    evLog(id, window.t('ev_created', 'Event created'));
    evToast(name + ' — ' + window.t('ev_created', 'created'));
    if (online) {
      window.API.post('/events', { typeId, name, venue: payload.venue, expectedFootfall: payload.expectedFootfall, budget: payload.budget, color: payload.color, notes: payload.notes, days })
        .then(function (c) {
          const code = c && (c.code || c.id);
          if (!code) throw new Error('no event code returned');
          local.code = code;
          return inChargeDev ? window.API.post('/events/' + code + '/incharge', { devoteeId: inChargeDev }) : null;
        })
        .then(function () { return window.__rehydrate && window.__rehydrate('events'); })
        .catch(function (err) { evToast((err && err.message) || 'Saved locally — sync failed'); });
    }
  }
  EV.editingEventId = null;
  const f = days.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
  if (f) { const p = f.date.split('-').map(Number); EV.calendarYear = p[0]; EV.calendarMonth = p[1] - 1; }
  closeModal('modalEvent');
  renderEvents();
}
function confirmDeleteEvent(id) {
  const e = eventById(id); if (!e) return;
  openConfirm({
    title: window.t('ev_delete', 'Delete Event'), danger: true,
    body: `<p><strong>${esc(e.name)}</strong></p>`,
    confirmLabel: window.t('delete'),
    onConfirm: () => {
      const code = e.code || e.id;
      const wasSynced = !!e.code;
      EV.events = EV.events.filter(x => x.id !== id);
      EV.activity = EV.activity.filter(a => a.eventId !== id);
      if (EV.activeEventId === id) { EV.activeEventId = null; EV.view = 'directory'; }
      evToast(window.t('ev_deleted', 'Event deleted.'));
      renderEvents();
      if (window.API && window.API.online && wasSynced) window.API.del('/events/' + code).catch(function (err) { evToast((err && err.message) || 'Delete failed to sync'); });
    }
  });
}

/* ---- event type catalog ---- */
function openAddEventType() {
  EV.editingTypeId = null;
  document.getElementById('evTypeFormTitle').textContent = window.t('ev_add_type', 'Add Event Type');
  document.getElementById('formEventType').reset();
  openModal('modalEventType');
}
function openEditEventType(id) {
  const t = evTypeById(id); if (!t) return;
  EV.editingTypeId = id;
  document.getElementById('evTypeFormTitle').textContent = window.t('ev_edit_type', 'Edit Event Type');
  document.getElementById('evTypeFieldName').value = t.name;
  document.getElementById('evTypeFieldCategory').value = t.category || '';
  document.getElementById('evTypeFieldIcon').value = t.icon || '';
  document.getElementById('evTypeFieldDesc').value = t.description || '';
  openModal('modalEventType');
}
function handleSaveEventType(ev) {
  ev.preventDefault();
  const name = document.getElementById('evTypeFieldName').value.trim();
  if (!name) { evToast(window.t('ev_need_name', 'Name is required.')); return; }
  const dupe = EV.eventTypes.find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== EV.editingTypeId);
  if (dupe) { evToast(window.t('ev_type_exists', 'That type already exists.')); return; }
  const payload = {
    name,
    category: document.getElementById('evTypeFieldCategory').value.trim(),
    icon: document.getElementById('evTypeFieldIcon').value.trim() || '📅',
    description: document.getElementById('evTypeFieldDesc').value.trim()
  };
  const online = !!(window.API && window.API.online);
  if (EV.editingTypeId) {
    const t = evTypeById(EV.editingTypeId);
    Object.assign(t, payload);
    // events type route has no PATCH; recreate is not desirable — local-only edit
  } else {
    const t = Object.assign({ id: evNextId('EVT', EV.eventTypes, 3) }, payload);
    EV.eventTypes.push(t);
    if (online) window.API.post('/events/types', payload)
      .then(function () { return window.__rehydrate && window.__rehydrate('events'); })
      .catch(function (err) { evToast((err && err.message) || 'Saved locally — sync failed'); });
  }
  EV.editingTypeId = null;
  closeModal('modalEventType');
  evToast(window.t('save') + ' ✓');
  renderEvents();
}
function confirmDeleteEventType(id) {
  const used = EV.events.filter(e => e.typeId === id).length;
  if (used) { evToast(used + ' ' + window.t('ev_type_in_use', 'event(s) use this type.')); return; }
  openConfirm({
    title: window.t('ev_delete_type', 'Delete Event Type'), danger: true,
    body: `<p><strong>${esc((evTypeById(id) || {}).name || '')}</strong></p>`,
    confirmLabel: window.t('delete'),
    onConfirm: () => {
      const t = evTypeById(id) || {};
      const wasSynced = !!t.code;
      EV.eventTypes = EV.eventTypes.filter(t => t.id !== id);
      evToast(window.t('ev_type_deleted', 'Type deleted.'));
      renderEvents();
      if (window.API && window.API.online && wasSynced) window.API.del('/events/types/' + (t.code || id)).catch(function () {});
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('eventsRoot')) return;
  renderEvents();
  if (typeof onLanguageChange === 'function') onLanguageChange(() => renderEvents());
});
