/* ---- Committee: modal markup moved out of index.html (injected at load) ---- */
(function () {
  if (typeof document === 'undefined' || document.getElementById('modalCommittee')) return;
  document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="modalCommittee">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="committeeFormTitle">Add Committee</div>
      <button class="modal-close-btn" onclick="closeModal('modalCommittee')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formCommittee" onsubmit="handleSaveCommittee(event)">
        <div class="form-group"><label class="form-label" for="cmtFieldName">Committee Name *</label>
          <input type="text" class="form-input" id="cmtFieldName" placeholder="e.g. Rabari Samaj Committee" required></div>

        <div class="link-section">
          <div class="link-section-head">
            <p class="ls-title">Leader <span class="ls-req">*</span></p>
            <button class="btn-add-devotee" type="button" onclick="cmtAddLeader()">Add new devotee</button>
          </div>
          <div class="link-section-hint">Pick a devotee from the register, or add a new one — no login account needed.</div>
          <div class="link-field"><select class="form-select" id="cmtLeadSelect" required></select></div>
        </div>

        <div class="link-section">
          <div class="link-section-head">
            <p class="ls-title">Members</p>
            <button class="btn-add-devotee" type="button" onclick="cmtAddMemberPerson()">Add new devotee</button>
          </div>
          <div class="link-section-hint">Tick people from the register (or add new ones) and set each one's role here. The leader is added automatically. A member's status &amp; later edits are on the committee's Members tab.</div>
          <div id="cmtMemberPicker"></div>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="cmtFieldSamaj">Samaj</label>
            <input type="text" class="form-input" id="cmtFieldSamaj" list="donCommitteeList" placeholder="e.g. Rabari Samaj"></div>
          <div class="form-group"><label class="form-label" for="cmtFieldSize">Expected Size *</label><input type="number" class="form-input" id="cmtFieldSize" min="1" value="20" required></div>
        </div>
        <div class="form-group"><label class="form-label" for="cmtFieldStatus">Status *</label><select class="form-select" id="cmtFieldStatus"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        <div class="form-group"><label class="form-label" for="cmtFieldPurpose">Purpose *</label>
          <textarea class="form-input mg-textarea" id="cmtFieldPurpose" rows="3" placeholder="What this committee is responsible for" required></textarea></div>
        <div class="form-group"><label class="form-label" for="cmtFieldNotes">Notes</label>
          <textarea class="form-input mg-textarea" id="cmtFieldNotes" rows="2"></textarea></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalCommittee')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formCommittee" id="committeeFormSubmitBtn">Create Committee</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalCmtMember">
  <div class="modal-box">
    <div class="modal-header">
      <div><div class="modal-title" id="cmtMemberFormTitle">Add Member</div>
        <span class="mg-muted-xs">Committee: <strong id="cmtMemberFormCmt">—</strong></span></div>
      <button class="modal-close-btn" onclick="closeModal('modalCmtMember')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formCmtMember" onsubmit="handleSaveCmtMember(event)">
        <div id="cmmPersonMount"></div>
        <div id="cmmExistingHint"></div>
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="cmmFieldRole">Role in this committee</label>
            <input type="text" class="form-input" id="cmmFieldRole" list="cmtRoleList" placeholder="e.g. Treasurer, Member">
            <datalist id="cmtRoleList"><option value="Member"></option><option value="Secretary"></option><option value="Treasurer"></option><option value="Coordinator"></option><option value="Village In-charge"></option><option value="Mahila Wing"></option></datalist></div>
          <div class="form-group"><label class="form-label" for="cmmFieldStatus">Status</label><select class="form-select" id="cmmFieldStatus"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        </div>
        <div class="form-group"><label class="form-label" for="cmmFieldNotes">Notes</label><textarea class="form-input mg-textarea" id="cmmFieldNotes" rows="2"></textarea></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalCmtMember')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formCmtMember" id="cmtMemberFormSubmitBtn">Add Member</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalMeeting">
  <div class="modal-box" style="max-width: 720px;">
    <div class="modal-header">
      <div><div class="modal-title" id="meetingFormTitle">Schedule Meeting</div>
        <span class="mg-muted-xs">Committee: <strong id="meetingFormCmt">—</strong></span></div>
      <button class="modal-close-btn" onclick="closeModal('modalMeeting')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formMeeting" onsubmit="handleSaveMeeting(event)">
        <div class="form-group"><label class="form-label" for="mtgFieldTitle">Meeting Title *</label>
          <input type="text" class="form-input" id="mtgFieldTitle" placeholder="e.g. Monthly Governance Meeting" required></div>
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="mtgFieldDate">Date *</label><input type="date" class="form-input" id="mtgFieldDate" required></div>
          <div class="form-group"><label class="form-label" for="mtgFieldVenue">Venue</label><input type="text" class="form-input" id="mtgFieldVenue" placeholder="e.g. Trust Office, Sanand"></div>
        </div>
        <div class="grid mg-2col-form">
          <div class="form-group"><label class="form-label" for="mtgFieldStart">Start *</label><input type="time" class="form-input" id="mtgFieldStart" required></div>
          <div class="form-group"><label class="form-label" for="mtgFieldEnd">End *</label><input type="time" class="form-input" id="mtgFieldEnd" required></div>
        </div>
        <div class="form-group"><label class="form-label">Invite Members *</label><div class="mg-picker" id="mtgMemberPicker"></div></div>
        <div class="form-group"><label class="form-label" for="mtgFieldAgenda">Agenda</label>
          <textarea class="form-input mg-textarea" id="mtgFieldAgenda" rows="2" placeholder="Points to discuss"></textarea></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalMeeting')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formMeeting" id="meetingFormSubmitBtn">Schedule Meeting</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalCmtDraft">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="cmtDraftFormTitle">New Draft</div>
      <button class="modal-close-btn" onclick="closeModal('modalCmtDraft')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formCmtDraft" onsubmit="handleSaveCmtDraft(event)">
        <div class="form-group"><label class="form-label" for="cmtDraftFieldTitle">Draft Title *</label>
          <input type="text" class="form-input" id="cmtDraftFieldTitle" placeholder="e.g. Meeting Reminder" required></div>
        <div class="form-group"><label class="form-label" for="cmtDraftFieldMsg">Message *</label>
          <textarea class="form-input mg-textarea" id="cmtDraftFieldMsg" rows="7" required placeholder="Jai Mataji 🙏&#10;&#10;..."></textarea></div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalCmtDraft')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formCmtDraft">Save Draft</button>
    </div>
  </div>
</div>

`);
})();

/* ============================================================
   COMMITTEE / SAMAJ — MODALS, FORMS & CRUD
   ============================================================ */

/* ---- committee ---- */
function cmtLeadOptions(sel) {
  if (typeof personOptions === 'function') return personOptions(sel, '— ' + window.t('cmt_select_leader', 'Select leader') + ' —', { peopleOnly: true });
  return `<option value="">— ${window.t('cmt_select_leader', 'Select leader')} —</option>` +
    CMT.leaders.map(l => `<option value="${l.id}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)} · ${esc(l.mobile)}</option>`).join('');
}
function openAddCommittee() {
  if (!isCmtAdmin()) { cmtToast(window.t('cmt_admin_only', 'Only an administrator can do this.')); return; }
  CMT.editingCmtId = null;
  document.getElementById('committeeFormTitle').textContent = window.t('cmt_add', 'Add Committee');
  document.getElementById('committeeFormSubmitBtn').textContent = window.t('cmt_create', 'Create Committee');
  document.getElementById('formCommittee').reset();
  document.getElementById('cmtLeadSelect').innerHTML = cmtLeadOptions('');
  cmtRenderMemberPicker([]);
  document.getElementById('cmtFieldSize').value = 20;
  document.getElementById('cmtFieldStatus').value = 'active';
  openModal('modalCommittee');
}
function openEditCommittee(id) {
  const c = cmtById(id); if (!c || !isCmtAdmin()) { cmtToast(window.t('cmt_admin_only', 'Only an administrator can do this.')); return; }
  CMT.editingCmtId = id;
  document.getElementById('committeeFormTitle').textContent = window.t('cmt_edit', 'Edit Committee');
  document.getElementById('committeeFormSubmitBtn').textContent = window.t('save');
  document.getElementById('cmtLeadSelect').innerHTML = cmtLeadOptions(c.leaderId);
  // prefill from the live roster (CMT.members) so members added on the workspace
  // tab also show; the leader lives in its own picker, so exclude it here
  cmtRenderMemberPicker(
    CMT.members
      .filter(function (m) { return m.committeeId === id && String(m.devoteeId || m.id) !== String(c.leaderId); })
      .map(function (m) { return { id: m.devoteeId || m.id, role: m.role || 'Member' }; })
  );
  document.getElementById('cmtFieldName').value = c.name;
  document.getElementById('cmtFieldSamaj').value = c.samaj || '';
  document.getElementById('cmtFieldSize').value = c.expectedSize;
  document.getElementById('cmtFieldStatus').value = c.status;
  document.getElementById('cmtFieldPurpose').value = c.purpose;
  document.getElementById('cmtFieldNotes').value = c.notes || '';
  openModal('modalCommittee');
}
/* leader "+ New devotee" — reuse the shared sheet, then select the new person */
function cmtAddLeader() {
  openDevoteeSheet({
    title: 'Add a new Leader (devotee)',
    onSaved: function (dev) {
      document.getElementById('cmtLeadSelect').innerHTML = cmtLeadOptions(dev.id);
    }
  });
}
/* members roster inside the committee form — each ticked person also gets a role */
const CMT_MEMBER_ROLES = ['Member', 'Secretary', 'Treasurer', 'Coordinator', 'Village In-charge', 'Mahila Wing'];
function cmtRenderMemberPicker(sel) {
  const box = document.getElementById('cmtMemberPicker');
  if (box) box.innerHTML = personCheckList((typeof allPeople === 'function' ? allPeople() : []), sel || [], 'cmt-mem-check', CMT_MEMBER_ROLES);
}
function cmtAddMemberPerson() {
  const keep = checkedPeople('cmtMemberPicker', 'cmt-mem-check');
  openDevoteeSheet({
    title: 'Add a new Member (devotee)',
    extraFields: [
      { name: 'role', label: 'Role in this committee', type: 'select', options: CMT_MEMBER_ROLES, value: 'Member' }
    ],
    onSaved: function (dev, extras) {
      keep.push({ id: dev.id, role: (extras && extras.role) || 'Member' });
      cmtRenderMemberPicker(keep);
    }
  });
}

/* Turn the create-form's picked people (+ the leader) into real CMT.members
   rows so the workspace Members tab and counts are correct. Idempotent. */
function materialiseCmtRoster(committeeId, members, leaderId) {
  const roster = (members || []).slice();
  if (leaderId && !roster.some(function (x) { return String(x.id) === String(leaderId); })) {
    roster.unshift({ id: leaderId, role: 'Leader' });
  }
  roster.forEach(function (mm) {
    const p = (typeof personById === 'function') ? personById(mm.id) : null;
    const nm = p ? p.name : String(mm.id);
    const parts = String(nm).trim().split(/\s+/);
    const mobile = (p && p.mobile) ? String(p.mobile).replace(/\D/g, '') : '';
    const exists = CMT.members.some(function (x) {
      return x.committeeId === committeeId && (x.devoteeId === mm.id || (mobile && x.mobile === mobile));
    });
    if (exists) return;
    CMT.members.push({
      id: cmtNextId('CMM', CMT.members, 3),
      committeeId: committeeId, devoteeId: mm.id,
      firstName: parts.shift() || nm, lastName: parts.join(' '),
      mobile: mobile, city: (p && p.city) || '', state: (p && p.state) || 'Gujarat',
      role: mm.role || 'Member', status: 'active', notes: '', joinedDate: cmtToday()
    });
  });
}

function handleSaveCommittee(e) {
  e.preventDefault();
  const name = document.getElementById('cmtFieldName').value.trim();
  const leaderId = document.getElementById('cmtLeadSelect').value;
  const members = checkedPeople('cmtMemberPicker', 'cmt-mem-check');   // [{id, role}]
  const memberIds = members.map(function (m) { return m.id; });
  const size = parseInt(document.getElementById('cmtFieldSize').value, 10);
  const purpose = document.getElementById('cmtFieldPurpose').value.trim();
  if (!name) { cmtToast(window.t('cmt_need_name', 'Name is required.')); return; }
  if (!leaderId) { cmtToast(window.t('cmt_need_leader', 'Assign a leader.')); return; }
  if (!purpose) { cmtToast(window.t('cmt_need_purpose', 'Purpose is required.')); return; }
  const payload = {
    name, leaderId, expectedSize: size || 20, purpose,
    samaj: document.getElementById('cmtFieldSamaj').value.trim(),
    status: document.getElementById('cmtFieldStatus').value,
    notes: document.getElementById('cmtFieldNotes').value.trim()
  };
  // card colour is auto-assigned in creation order — never picked by the user
  if (!CMT.editingCmtId) payload.color = nextCardColor((CMT.committees || []).length);
  if (CMT.editingCmtId) {
    Object.assign(cmtById(CMT.editingCmtId), payload, { memberIds, members });
    materialiseCmtRoster(CMT.editingCmtId, members, leaderId);
    cmtLogActivity(CMT.editingCmtId, window.t('cmt_updated_by', 'Committee updated by') + ' ' + CMT.session.userName);
    cmtToast(name + ' — ' + window.t('save') + ' ✓');
  } else {
    const id = cmtNextId('CMT', CMT.committees, 3);
    CMT.committees.push(Object.assign({ id, createdDate: cmtToday(), memberIds, members }, payload));
    CMT.communication.push({ committeeId: id, groupName:'', groupLink:'', broadcastName:'', broadcastLink:'' });
    // materialise the picked people (+ the leader) into the committee's roster
    materialiseCmtRoster(id, members, leaderId);
    cmtLogActivity(id, window.t('cmt_created', 'Committee created') + ' — ' + cmtLeadName(id));
    cmtToast(name + ' — ' + window.t('cmt_create', 'created'));
    // best-effort DB persist: committee + leader + each member
    if (window.API && window.API.online) {
      window.API.post('/committees', { name, samaj: payload.samaj, purpose: payload.purpose, expectedSize: payload.expectedSize })
        .then(function (c) {
          var code = c && (c.code || c.id);
          if (!code) return;
          if (leaderId) window.API.post('/committees/' + code + '/leader', { devoteeId: leaderId }).catch(function () {});
          members.forEach(function (m) {
            var p = (typeof personById === 'function') ? personById(m.id) : null;
            if (!p) return;
            var parts = String(p.name || '').trim().split(/\s+/);
            window.API.post('/committees/' + code + '/members', {
              firstName: parts.shift() || p.name, lastName: parts.join(' '),
              mobile: (p.mobile || '').replace(/\D/g, ''), city: p.city || '', role: m.role || 'Member'
            }).catch(function () {});
          });
        }).catch(function () {});
    }
  }
  CMT.editingCmtId = null;
  closeModal('modalCommittee');
  populateCmtRoleOptions();
  renderCommittee();
}
function confirmDeleteCommittee(id) {
  const c = cmtById(id); if (!c || !isCmtAdmin()) return;
  openConfirm({
    title: window.t('cmt_delete', 'Delete Committee'), danger: true,
    body: `<p>${window.t('cmt_delete_body', 'This deletes the committee, its members, meetings and attendance.')}<br><strong>${esc(c.name)}</strong></p>`,
    confirmLabel: window.t('cmt_delete', 'Delete Committee'),
    onConfirm: () => {
      const mtgIds = CMT.meetings.filter(m => m.committeeId === id).map(m => m.id);
      CMT.attendance = CMT.attendance.filter(a => mtgIds.indexOf(a.meetingId) === -1);
      CMT.meetings = CMT.meetings.filter(m => m.committeeId !== id);
      CMT.members = CMT.members.filter(m => m.committeeId !== id);
      CMT.communication = CMT.communication.filter(x => x.committeeId !== id);
      CMT.drafts = CMT.drafts.filter(d => d.committeeId !== id);
      CMT.activity = CMT.activity.filter(a => a.committeeId !== id);
      CMT.committees = CMT.committees.filter(x => x.id !== id);
      if (CMT.activeCmtId === id) { CMT.activeCmtId = null; CMT.view = 'directory'; }
      populateCmtRoleOptions();
      cmtToast(c.name + ' ' + window.t('cmt_deleted', 'deleted'));
      renderCommittee();
    }
  });
}

/* ---- member ---- */
function openAddCmtMember(cid) {
  if (!canOpenCmt(cid)) { cmtToast(window.t('cmt_access_denied', 'Access denied.')); return; }
  CMT.editingMemberId = null; CMT.activeCmtId = cid;
  document.getElementById('cmtMemberFormTitle').textContent = window.t('cmt_add_member', 'Add Member');
  document.getElementById('cmtMemberFormSubmitBtn').textContent = window.t('cmt_add_member', 'Add Member');
  document.getElementById('cmtMemberFormCmt').textContent = cmtById(cid).name;
  document.getElementById('formCmtMember').reset();
  document.getElementById('cmmPersonMount').innerHTML = devoteeLinkField({
    selId: 'cmmDevoteeSel', label: 'Member (devotee)', required: true,
    hint: 'Pick from the register, or add a new devotee. One person can be on several committees.'
  });
  document.getElementById('cmmFieldRole').value = 'Member';
  document.getElementById('cmmFieldStatus').value = 'active';
  document.getElementById('cmmExistingHint').innerHTML = '';
  openModal('modalCmtMember');
}
function openEditCmtMember(id) {
  const x = cmtMemberById(id); if (!x || !canOpenCmt(x.committeeId)) { cmtToast(window.t('cmt_access_denied', 'Access denied.')); return; }
  CMT.editingMemberId = id; CMT.activeCmtId = x.committeeId;
  document.getElementById('cmtMemberFormTitle').textContent = window.t('cmt_edit_member', 'Edit Member');
  document.getElementById('cmtMemberFormSubmitBtn').textContent = window.t('save');
  document.getElementById('cmtMemberFormCmt').textContent = cmtById(x.committeeId).name;
  document.getElementById('cmmPersonMount').innerHTML = devoteeLinkField({
    selId: 'cmmDevoteeSel', label: 'Member (devotee)', required: true,
    selectedId: x.devoteeId,
    selectedLabel: cmtMemberName(x) + (x.mobile ? ' · ' + x.mobile : '') + (x.city ? ' · ' + x.city : '')
  });
  document.getElementById('cmmFieldRole').value = x.role || 'Member';
  document.getElementById('cmmFieldStatus').value = x.status;
  document.getElementById('cmmFieldNotes').value = x.notes || '';
  document.getElementById('cmmExistingHint').innerHTML = '';
  openModal('modalCmtMember');
}
/* checkExistingCmtMember() was the old mobile-field live lookup on the Add
   Member modal. That modal is now a devotee picker, which handles reuse
   itself, so the function is gone. */
function checkExistingCmtMember() {}
function handleSaveCmtMember(e) {
  e.preventDefault();
  const cid = CMT.editingMemberId ? cmtMemberById(CMT.editingMemberId).committeeId : CMT.activeCmtId;
  const person = (typeof devoteeLinkValue === 'function') ? devoteeLinkValue('cmmDevoteeSel') : null;
  if (!person) { cmtToast('Pick a devotee, or add a new one.'); return; }
  const first = person.firstName;
  const last = person.lastName || '';
  const mobile = String(person.mobile || '').replace(/\D/g, '');
  const pickedDevoteeId = person.id;
  if (!first) { cmtToast('The chosen devotee has no name on record.'); return; }
  if (mobile && !/^[0-9]{10}$/.test(mobile)) { cmtToast(window.t('cmt_need_mobile', 'That devotee’s mobile is not 10 digits — fix it in the register.')); return; }
  const fields = {
    firstName: first, lastName: last, mobile,
    city: person.city || '',
    state: person.state || 'Gujarat',
    role: document.getElementById('cmmFieldRole').value.trim() || 'Member',
    status: document.getElementById('cmmFieldStatus').value,
    notes: document.getElementById('cmmFieldNotes').value.trim()
  };
  if (CMT.editingMemberId) {
    Object.assign(cmtMemberById(CMT.editingMemberId), fields, { devoteeId: pickedDevoteeId || cmtMemberById(CMT.editingMemberId).devoteeId });
    cmtToast((first + ' ' + last).trim() + ' — ' + window.t('save') + ' ✓');
  } else {
    if (CMT.members.some(m => m.committeeId === cid && (m.devoteeId === pickedDevoteeId || (mobile && m.mobile === mobile)))) { cmtToast(window.t('cmt_already_member', 'already on this committee.')); return; }
    const existing = CMT.members.find(m => m.devoteeId === pickedDevoteeId || (mobile && m.mobile === mobile));
    const devoteeId = pickedDevoteeId || (existing ? existing.devoteeId : cmtNextId('DEV', CMT.members.map(m => ({ id: m.devoteeId })), 3));
    const id = cmtNextId('CMM', CMT.members, 3);
    CMT.members.push(Object.assign({ id, committeeId: cid, devoteeId, joinedDate: cmtToday() }, fields));
    cmtLogActivity(cid, first + ' ' + last + ' ' + window.t('cmt_added_word', 'added'));
    cmtToast(first + ' ' + last + ' ' + window.t('cmt_added_word', 'added'));
  }
  CMT.editingMemberId = null;
  closeModal('modalCmtMember');
  renderCommittee();
}
function toggleCmtMemberStatus(id) {
  const x = cmtMemberById(id); if (!x) return;
  if (x.status === 'active') {
    openConfirm({
      title: window.t('cmt_deactivate', 'Deactivate Member'),
      body: `<p>${window.t('cmt_deactivate_body', 'They stop appearing in new meetings but history is kept.')}<br><strong>${esc(cmtMemberName(x))}</strong></p>`,
      confirmLabel: window.t('cmt_deactivate', 'Deactivate'),
      onConfirm: () => { x.status = 'inactive'; cmtToast(cmtMemberName(x) + ' — ' + window.t('inactive').toLowerCase()); renderCommittee(); }
    });
  } else { x.status = 'active'; cmtToast(cmtMemberName(x) + ' — ' + window.t('active').toLowerCase()); renderCommittee(); }
}
function confirmRemoveCmtMember(id) {
  const x = cmtMemberById(id); if (!x) return;
  openConfirm({
    title: window.t('cmt_remove_member', 'Remove Member'), danger: true,
    body: `<p>${window.t('cmt_remove_body', 'Removes the committee assignment and its attendance rows. The devotee record is kept.')}<br><strong>${esc(cmtMemberName(x))}</strong></p>`,
    confirmLabel: window.t('remove'),
    onConfirm: () => {
      CMT.meetings.forEach(m => { m.memberIds = (m.memberIds || []).filter(i => i !== id); });
      CMT.attendance = CMT.attendance.filter(a => a.memberId !== id);
      CMT.members = CMT.members.filter(m => m.id !== id);
      if (CMT.activeMemberId === id) CMT.activeMemberId = null;
      cmtToast(cmtMemberName(x) + ' ' + window.t('cmt_removed', 'removed'));
      renderCommittee();
    }
  });
}

/* ---- meeting ---- */
function openScheduleMeeting(cid) {
  if (!canOpenCmt(cid)) { cmtToast(window.t('cmt_access_denied', 'Access denied.')); return; }
  CMT.editingMeetingId = null; CMT.activeCmtId = cid;
  document.getElementById('meetingFormTitle').textContent = window.t('cmt_schedule', 'Schedule Meeting');
  document.getElementById('meetingFormSubmitBtn').textContent = window.t('cmt_schedule', 'Schedule Meeting');
  document.getElementById('meetingFormCmt').textContent = cmtById(cid).name;
  document.getElementById('formMeeting').reset();
  document.getElementById('mtgFieldDate').value = cmtToday();
  document.getElementById('mtgFieldStart').value = '10:00';
  document.getElementById('mtgFieldEnd').value = '12:00';
  renderMeetingPicker(cid, cmtActiveOf(cid).map(m => m.id));
  openModal('modalMeeting');
}
function openEditMeeting(id) {
  const x = meetingById(id); if (!x || !canOpenCmt(x.committeeId)) { cmtToast(window.t('cmt_access_denied', 'Access denied.')); return; }
  CMT.editingMeetingId = id; CMT.activeCmtId = x.committeeId;
  document.getElementById('meetingFormTitle').textContent = window.t('cmt_edit_meeting', 'Edit Meeting');
  document.getElementById('meetingFormSubmitBtn').textContent = window.t('save');
  document.getElementById('meetingFormCmt').textContent = cmtById(x.committeeId).name;
  document.getElementById('mtgFieldTitle').value = x.title;
  document.getElementById('mtgFieldDate').value = x.date;
  document.getElementById('mtgFieldStart').value = x.startTime;
  document.getElementById('mtgFieldEnd').value = x.endTime;
  document.getElementById('mtgFieldVenue').value = x.venue || '';
  document.getElementById('mtgFieldAgenda').value = x.agenda || '';
  renderMeetingPicker(x.committeeId, x.memberIds || []);
  openModal('modalMeeting');
}
function renderMeetingPicker(cid, selected) {
  const box = document.getElementById('mtgMemberPicker');
  const list = cmtMembersOf(cid).filter(m => m.status === 'active' || selected.indexOf(m.id) !== -1);
  box.innerHTML = list.length ? list.map(m => `
    <label class="mg-pick ${selected.indexOf(m.id) !== -1 ? 'picked' : ''}">
      <input type="checkbox" class="cmt-mtg-check" value="${m.id}" ${selected.indexOf(m.id) !== -1 ? 'checked' : ''}
        onchange="this.closest('.mg-pick').classList.toggle('picked', this.checked)">
      <span class="mg-avatar">${esc((m.firstName[0] || '') + (m.lastName[0] || ''))}</span>
      <span class="mg-pick-body"><strong>${esc(cmtMemberName(m))}</strong><small>${esc(m.role || 'Member')} · ${esc(m.mobile)}</small></span>
    </label>`).join('') : `<div class="mg-pad-note">${window.t('cmt_no_active_members', 'No active members yet.')}</div>`;
}
function handleSaveMeeting(e) {
  e.preventDefault();
  const cid = CMT.editingMeetingId ? meetingById(CMT.editingMeetingId).committeeId : CMT.activeCmtId;
  const title = document.getElementById('mtgFieldTitle').value.trim();
  const date = document.getElementById('mtgFieldDate').value;
  const start = document.getElementById('mtgFieldStart').value;
  const end = document.getElementById('mtgFieldEnd').value;
  const memberIds = Array.from(document.querySelectorAll('.cmt-mtg-check:checked')).map(c => c.value);
  if (!title) { cmtToast(window.t('cmt_need_meeting_title', 'Meeting title is required.')); return; }
  if (!date || !start || !end) { cmtToast(window.t('cmt_need_datetime', 'Date and time are required.')); return; }
  if (end <= start) { cmtToast(window.t('cmt_end_after_start', 'End time must be after start time.')); return; }
  if (!memberIds.length) { cmtToast(window.t('cmt_pick_members', 'Invite at least one member.')); return; }
  const fields = { title, date, startTime: start, endTime: end,
    venue: document.getElementById('mtgFieldVenue').value.trim(),
    agenda: document.getElementById('mtgFieldAgenda').value.trim(), memberIds };
  if (CMT.editingMeetingId) {
    const x = meetingById(CMT.editingMeetingId);
    const dropped = (x.memberIds || []).filter(i => memberIds.indexOf(i) === -1);
    CMT.attendance = CMT.attendance.filter(a => !(a.meetingId === x.id && dropped.indexOf(a.memberId) !== -1));
    Object.assign(x, fields);
    cmtToast(window.t('cmt_meeting_updated', 'Meeting updated.'));
  } else {
    const id = cmtNextId('MTG', CMT.meetings, 3);
    CMT.meetings.push(Object.assign({ id, committeeId: cid, notes:'', completed:false }, fields));
    cmtLogActivity(cid, window.t('cmt_meeting_scheduled', 'Meeting scheduled') + ': ' + title + ' — ' + fmtDate(date));
    cmtToast(window.t('cmt_meeting_scheduled', 'Meeting scheduled') + '.');
  }
  CMT.editingMeetingId = null;
  const [y, m] = date.split('-').map(Number);
  CMT.calendarYear = y; CMT.calendarMonth = m - 1;
  closeModal('modalMeeting');
  renderCommittee();
}
function confirmDeleteMeeting(id) {
  const x = meetingById(id); if (!x) return;
  openConfirm({
    title: window.t('cmt_delete_meeting', 'Delete Meeting'), danger: true,
    body: `<p><strong>${esc(x.title)}</strong> — ${fmtDate(x.date)}</p>`,
    confirmLabel: window.t('delete'),
    onConfirm: () => {
      CMT.attendance = CMT.attendance.filter(a => a.meetingId !== id);
      CMT.meetings = CMT.meetings.filter(m => m.id !== id);
      if (CMT.activeMeetingId === id) CMT.activeMeetingId = null;
      cmtToast(window.t('cmt_meeting_deleted', 'Meeting deleted.'));
      renderCommittee();
    }
  });
}

/* ---- drafts ---- */
function openCmtDraft(cid, draftId) {
  if (!canOpenCmt(cid)) { cmtToast(window.t('cmt_access_denied', 'Access denied.')); return; }
  CMT.activeCmtId = cid; CMT.editingDraftId = draftId || null;
  const d = draftId ? CMT.drafts.find(x => x.id === draftId) : null;
  document.getElementById('cmtDraftFormTitle').textContent = d ? window.t('cmt_edit_draft', 'Edit Draft') : window.t('cmt_new_draft', 'New Draft');
  document.getElementById('cmtDraftFieldTitle').value = d ? d.title : '';
  document.getElementById('cmtDraftFieldMsg').value = d ? d.message : '';
  openModal('modalCmtDraft');
}
function handleSaveCmtDraft(e) {
  e.preventDefault();
  const title = document.getElementById('cmtDraftFieldTitle').value.trim();
  const message = document.getElementById('cmtDraftFieldMsg').value.trim();
  if (!title || !message) { cmtToast(window.t('cmt_need_draft', 'Title and message are required.')); return; }
  if (CMT.editingDraftId) {
    const d = CMT.drafts.find(x => x.id === CMT.editingDraftId);
    d.title = title; d.message = message; d.updatedAt = cmtToday();
  } else {
    CMT.drafts.push({ id: cmtNextId('CDR', CMT.drafts, 3), committeeId: CMT.activeCmtId, title, message, updatedAt: cmtToday() });
  }
  CMT.editingDraftId = null;
  closeModal('modalCmtDraft');
  cmtToast(window.t('save') + ' ✓');
  renderCommittee();
}
function confirmDeleteCmtDraft(id) {
  const d = CMT.drafts.find(x => x.id === id); if (!d) return;
  openConfirm({
    title: window.t('cmt_delete_draft', 'Delete Draft'), danger: true,
    body: `<p><strong>${esc(d.title)}</strong></p>`,
    confirmLabel: window.t('delete'),
    onConfirm: () => { CMT.drafts = CMT.drafts.filter(x => x.id !== id); cmtToast(window.t('cmt_draft_deleted', 'Draft deleted.')); renderCommittee(); }
  });
}

/* ---- settings save ---- */
function saveCmtSettings(e, cid) {
  e.preventDefault();
  const c = cmtById(cid); if (!c) return;
  c.name = document.getElementById('setCmtName').value.trim() || c.name;
  c.samaj = document.getElementById('setCmtSamaj').value.trim();
  c.expectedSize = parseInt(document.getElementById('setCmtSize').value, 10) || c.expectedSize;
  c.status = document.getElementById('setCmtStatus').value;
  c.purpose = document.getElementById('setCmtPurpose').value.trim() || c.purpose;
  c.notes = document.getElementById('setCmtNotes').value.trim();
  if (isCmtAdmin()) c.leaderId = document.getElementById('setCmtLead').value;
  cmtLogActivity(cid, window.t('cmt_updated_by', 'Committee updated by') + ' ' + CMT.session.userName);
  cmtToast(window.t('save') + ' ✓');
  populateCmtRoleOptions();
  renderCommittee();
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('committeeRoot')) return;
  populateCmtRoleOptions();
  renderCommittee();
  if (typeof onLanguageChange === 'function') onLanguageChange(() => renderCommittee());
});
