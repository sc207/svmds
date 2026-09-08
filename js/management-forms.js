/* ---- Management: modal markup moved out of index.html (injected at load) ---- */
(function () {
  if (typeof document === 'undefined' || document.getElementById('modalManagement')) return;
  document.body.insertAdjacentHTML('beforeend', `
<!-- Add / Edit Management (Admin only) -->
<div class="modal-overlay" id="modalManagement">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="mgFormTitle">Add Management</div>
      <button class="modal-close-btn" onclick="closeModal('modalManagement')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formManagement" onsubmit="handleSaveManagement(event)">
        <div class="form-group">
          <label class="form-label" for="mgFieldName">Management Name *</label>
          <input type="text" class="form-input" id="mgFieldName" placeholder="e.g. Parking Management, Prasad Management" required>
          <span class="mg-muted-xs">Any operational team — the platform is not limited to a fixed set of management types.</span>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="mgLeadSelect">Management Lead *</label>
            <select class="form-select" id="mgLeadSelect" required></select>
            <span class="mg-muted-xs">The Lead can only manage the Management(s) assigned to them.</span>
          </div>
          <div class="form-group">
            <label class="form-label" for="mgFieldSize">Expected Team Size *</label>
            <input type="number" class="form-input" id="mgFieldSize" min="1" value="15" required>
            <span class="mg-muted-xs" id="mgCurrentTeamNote">Current team members: 0</span>
          </div>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="mgFieldStatus">Status *</label>
            <select class="form-select" id="mgFieldStatus" required>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="mgColorSelect">Team Colour Code *</label>
            <select class="form-select" id="mgColorSelect" required onchange="previewMgColor(this.value)"></select>
            <div class="mg-color-swatch" id="mgColorSwatch"></div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="mgFieldDesc">Description *</label>
          <textarea class="form-input mg-textarea" id="mgFieldDesc" rows="3" placeholder="What this management team is responsible for" required></textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="mgFieldNotes">Additional Notes</label>
          <textarea class="form-input mg-textarea" id="mgFieldNotes" rows="2" placeholder="Internal notes, coordination details, escalation contacts"></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalManagement')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formManagement" id="mgFormSubmitBtn">Create Management</button>
    </div>
  </div>
</div>

<!-- Add / Edit Volunteer -->
<div class="modal-overlay" id="modalMember">
  <div class="modal-box">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="memberFormTitle">Add Volunteer</div>
        <span class="mg-muted-xs">Management: <strong id="memberFormMgmt">—</strong></span>
      </div>
      <button class="modal-close-btn" onclick="closeModal('modalMember')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formMember" onsubmit="handleSaveMember(event)">
        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="memFieldFirst">First Name *</label>
            <input type="text" class="form-input" id="memFieldFirst" placeholder="e.g. Rajesh" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="memFieldLast">Last Name *</label>
            <input type="text" class="form-input" id="memFieldLast" placeholder="e.g. Rabari" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="memFieldMobile">Mobile Number *</label>
          <input type="tel" class="form-input" id="memFieldMobile" placeholder="10-digit mobile number"
                 pattern="[0-9]{10}" maxlength="10" required oninput="checkExistingDevotee()">
          <span class="mg-muted-xs">If this devotee already volunteers elsewhere, they are linked — not duplicated.</span>
          <div id="memExistingHint"></div>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="memFieldCity">City</label>
            <input type="text" class="form-input" id="memFieldCity" placeholder="e.g. Sanand">
          </div>
          <div class="form-group">
            <label class="form-label" for="memFieldState">State</label>
            <input type="text" class="form-input" id="memFieldState" placeholder="e.g. Gujarat">
          </div>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="memFieldRole">Role in Team</label>
            <input type="text" class="form-input" id="memFieldRole" placeholder="e.g. Volunteer, Coordinator" value="Volunteer">
          </div>
          <div class="form-group">
            <label class="form-label" for="memFieldStatus">Status *</label>
            <select class="form-select" id="memFieldStatus" required>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="memFieldNotes">Additional Notes</label>
          <textarea class="form-input mg-textarea" id="memFieldNotes" rows="2" placeholder="Availability, language, special skills"></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalMember')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formMember" id="memberFormSubmitBtn">Add Volunteer</button>
    </div>
  </div>
</div>

<!-- Schedule / Edit Volunteering -->
<div class="modal-overlay" id="modalSession">
  <div class="modal-box" style="max-width: 720px;">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="sessionFormTitle">Schedule Volunteering</div>
        <span class="mg-muted-xs">Management: <strong id="sessionFormMgmt">—</strong></span>
      </div>
      <button class="modal-close-btn" onclick="closeModal('modalSession')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formSession" onsubmit="handleSaveSession(event)">
        <div class="form-group">
          <label class="form-label" for="sesFieldTitle">Volunteering Title *</label>
          <input type="text" class="form-input" id="sesFieldTitle" placeholder="e.g. Navratri Evening Aarti Duty" required>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="sesFieldDate">Date *</label>
            <input type="date" class="form-input" id="sesFieldDate" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="sesFieldLocation">Location</label>
            <input type="text" class="form-input" id="sesFieldLocation" placeholder="e.g. Main Gate, Sabha Mandap">
          </div>
        </div>

        <div class="grid mg-2col-form">
          <div class="form-group">
            <label class="form-label" for="sesFieldStart">Start Time *</label>
            <input type="time" class="form-input" id="sesFieldStart" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="sesFieldEnd">End Time *</label>
            <input type="time" class="form-input" id="sesFieldEnd" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Select Volunteers *</label>
          <div class="mg-pick-toolbar">
            <span class="mg-muted-xs" id="sesPickCount">0 volunteer(s) selected</span>
            <div class="flex gap-1">
              <button class="btn btn-outline mg-btn-xs" type="button" onclick="toggleAllVolunteers(true)">Select All</button>
              <button class="btn btn-outline mg-btn-xs" type="button" onclick="toggleAllVolunteers(false)">Clear</button>
            </div>
          </div>
          <div class="mg-picker" id="sesVolunteerPicker"></div>
        </div>

        <div class="form-group">
          <label class="form-label" for="sesFieldNotes">Notes</label>
          <textarea class="form-input mg-textarea" id="sesFieldNotes" rows="2" placeholder="Instructions for volunteers, reporting point, dress code"></textarea>
        </div>

        <div class="form-group">
          <label class="mg-check-inline">
            <input type="checkbox" id="sesFieldPublic">
            <span>Open this slot on the <strong>public volunteering page</strong> — devotees can sign up for this date &amp; time without logging in. Manage sign-ups from the <strong>Public Page</strong> tab.</span>
          </label>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalSession')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formSession" id="sessionFormSubmitBtn">Schedule Volunteering</button>
    </div>
  </div>
</div>

<!-- Message Draft -->
<div class="modal-overlay" id="modalDraft">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" id="draftFormTitle">New Message Draft</div>
      <button class="modal-close-btn" onclick="closeModal('modalDraft')">&times;</button>
    </div>
    <div class="modal-body">
      <form id="formDraft" onsubmit="handleSaveDraft(event)">
        <div class="form-group">
          <label class="form-label" for="draftFieldTitle">Draft Title *</label>
          <input type="text" class="form-input" id="draftFieldTitle" placeholder="e.g. Duty Reminder, Thank You Message" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="draftFieldMessage">Message *</label>
          <textarea class="form-input mg-textarea" id="draftFieldMessage" rows="7" required
                    placeholder="Jay Meldi Maa 🙏&#10;&#10;Reminder: your volunteering duty is scheduled for..."
                    oninput="updateDraftCount()"></textarea>
          <span class="mg-muted-xs" id="draftCharCount">0 characters</span>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalDraft')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="formDraft" id="draftFormSubmitBtn">Create Draft</button>
    </div>
  </div>
</div>

<!-- Generic Sheet (badge preview, send message) -->
<div class="modal-overlay" id="mgSheet">
  <div class="modal-box" id="mgSheetBox">
    <div class="modal-header">
      <div class="modal-title" id="mgSheetTitle"></div>
      <button class="modal-close-btn" onclick="closeSheet()">&times;</button>
    </div>
    <div class="modal-body" id="mgSheetBody"></div>
    <div class="modal-footer" id="mgSheetFooter"></div>
  </div>
</div>

<!-- Generic Confirm -->
<div class="modal-overlay" id="mgConfirm">
  <div class="modal-box" style="max-width: 460px;">
    <div class="modal-header">
      <div class="modal-title" id="mgConfirmTitle">Please confirm</div>
      <button class="modal-close-btn" onclick="closeConfirm()">&times;</button>
    </div>
    <div class="modal-body" id="mgConfirmBody"></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeConfirm()">Cancel</button>
      <button class="btn btn-primary" id="mgConfirmBtn" onclick="runConfirm()">Confirm</button>
    </div>
  </div>
</div>

<!-- Modal 6: Public Join Team -->
<div class="modal-overlay" id="modalJoinTeam">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">👷 Public Volunteer Application</div>
      <button class="modal-close-btn" onclick="closeModal('modalJoinTeam')">&times;</button>
    </div>
    <div class="modal-body">
      <p style="font-size: 0.85rem; color: var(--muted-brown); margin-bottom: 1rem;">Apply to serve as a volunteer at Shri Vihat Meldi Mata Mandir, Sanand.</p>
      <form id="joinTeamForm" onsubmit="handleJoinTeam(event)">
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" class="form-input" id="inputVolunteerName" placeholder="Your Name" required>
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Mobile Number *</label>
            <input type="tel" class="form-input" id="inputVolunteerPhone" placeholder="10-digit phone" required>
          </div>
          <div class="form-group">
            <label class="form-label">Select Team *</label>
            <select class="form-select" id="inputVolunteerTeam">
              <option value="Parking Management">Parking Management</option>
              <option value="Mandir Handling Team">Mandir Handling Team</option>
              <option value="Bhojan Shala & Prasad">Bhojan Shala & Prasad</option>
              <option value="VIP Guest Escort">VIP Guest Escort</option>
            </select>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modalJoinTeam')">Cancel</button>
      <button class="btn btn-primary" type="submit" form="joinTeamForm">Submit Application</button>
    </div>
  </div>
</div>

<!-- Modal 8: Member QR Badge -->
<div class="modal-overlay" id="modalBadgeViewer">
  <div class="modal-box" style="max-width: 420px;">
    <div class="modal-header">
      <div class="modal-title">Team Member Identity QR Badge</div>
      <button class="modal-close-btn" onclick="closeModal('modalBadgeViewer')">&times;</button>
    </div>
    <div class="modal-body" style="text-align: center;">
      <div style="background: linear-gradient(135deg, var(--primary-maroon), var(--primary-maroon-dark)); color: #FFF; padding: 1.75rem; border-radius: var(--radius-md); border: 2px solid var(--antique-gold); box-shadow: var(--shadow-md);">
        <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80" style="width: 85px; height: 85px; border-radius: 50%; border: 3px solid var(--gold-light); margin-bottom: 0.6rem;" alt="Member Photo">
        <h3 style="font-family: var(--font-heading); color: var(--gold-light); font-size: 1.25rem;">Rameshbhai Rabari</h3>
        <p style="font-size: 0.88rem; opacity: 0.95; font-weight: 600;">Team Lead — Parking Management</p>
        <div style="margin: 1rem 0; background: #FFF; padding: 0.65rem; display: inline-block; border-radius: 10px;">
          <!-- SVG QR Code -->
          <svg width="110" height="110" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="#FFF"/>
            <path d="M10 10h30v30H10zM60 10h30v30H60zM10 60h30v30H10z" fill="#3B2418"/>
            <path d="M20 20h10v10H20zM70 20h10v10H70zM20 70h10v10H20z" fill="#FFF"/>
            <path d="M50 20h5v10h-5zM50 50h30v30H50zM20 50h10v5h-10z" fill="#3B2418"/>
          </svg>
        </div>
        <div style="font-size: 0.78rem; color: var(--gold-light); font-weight: 700;">ID: #TMB-9021 | Shri Vihat Meldi Mata Mandir</div>
      </div>
    </div>
  </div>
</div>

`);
})();

/* ============================================================
   MANAGEMENT APP — MODALS, FORMS & CRUD
   Depends on management.js (MG store + helpers)
             management-ui.js (render layer)
   ============================================================ */

/* ------------------------------------------------------------
   GENERIC SHEET (dynamic modal) — used for badges, sends, etc.
   ------------------------------------------------------------ */
function openSheet({ title, body, footer, wide }) {
  const box = document.getElementById('mgSheetBox');
  const t   = document.getElementById('mgSheetTitle');
  const b   = document.getElementById('mgSheetBody');
  const f   = document.getElementById('mgSheetFooter');
  if (!box) return;
  t.textContent = title || '';
  b.innerHTML = body || '';
  f.innerHTML = footer || `<button class="btn btn-primary" onclick="closeSheet()">Close</button>`;
  box.classList.toggle('mg-sheet-wide', !!wide);
  document.getElementById('mgSheet').classList.add('active');
}
function closeSheet() {
  document.getElementById('mgSheet')?.classList.remove('active');
}

/* ------------------------------------------------------------
   GENERIC CONFIRM
   ------------------------------------------------------------ */
let _mgConfirmFn = null;
function openConfirm({ title, body, confirmLabel, danger, onConfirm }) {
  document.getElementById('mgConfirmTitle').textContent = title || 'Please confirm';
  document.getElementById('mgConfirmBody').innerHTML = body || '';
  const btn = document.getElementById('mgConfirmBtn');
  btn.textContent = confirmLabel || 'Confirm';
  btn.className = 'btn ' + (danger ? 'btn-primary mg-btn-danger-solid' : 'btn-primary');
  _mgConfirmFn = onConfirm || null;
  document.getElementById('mgConfirm').classList.add('active');
}
function closeConfirm() {
  document.getElementById('mgConfirm')?.classList.remove('active');
  _mgConfirmFn = null;
}
function runConfirm() {
  const fn = _mgConfirmFn;
  closeConfirm();
  if (typeof fn === 'function') fn();
}

/* ============================================================
   ADD / EDIT MANAGEMENT
   ============================================================ */
function openAddManagement() {
  if (!isAdmin()) { mgToast('Only an administrator can create a Management.'); return; }
  MG.editingMgmtId = null;
  document.getElementById('mgFormTitle').textContent = 'Add Management';
  document.getElementById('mgFormSubmitBtn').textContent = 'Create Management';

  const f = document.getElementById('formManagement');
  f.reset();
  document.getElementById('mgLeadSelect').innerHTML = leadOptionsHTML('');
  document.getElementById('mgColorSelect').innerHTML = colorOptionsHTML(MG.palette[0].hex);
  document.getElementById('mgFieldName').value = '';
  document.getElementById('mgFieldSize').value = 15;
  document.getElementById('mgFieldStatus').value = 'active';
  document.getElementById('mgFieldDesc').value = '';
  document.getElementById('mgFieldNotes').value = '';
  document.getElementById('mgCurrentTeamNote').textContent = 'Current team members: 0 (volunteers are added after creation)';
  previewMgColor(MG.palette[0].hex);
  openModal('modalManagement');
}

function openEditManagement(id) {
  const m = mgmtById(id);
  if (!m) return;
  if (!isAdmin()) { mgToast('Only an administrator can edit Management details here.'); return; }
  MG.editingMgmtId = id;
  document.getElementById('mgFormTitle').textContent = 'Edit Management';
  document.getElementById('mgFormSubmitBtn').textContent = 'Save Changes';

  document.getElementById('mgLeadSelect').innerHTML = leadOptionsHTML(m.leadId);
  document.getElementById('mgColorSelect').innerHTML = colorOptionsHTML(m.color);
  document.getElementById('mgFieldName').value = m.name;
  document.getElementById('mgFieldSize').value = m.expectedTeamSize;
  document.getElementById('mgFieldStatus').value = m.status;
  document.getElementById('mgFieldDesc').value = m.description;
  document.getElementById('mgFieldNotes').value = m.notes || '';
  document.getElementById('mgCurrentTeamNote').textContent =
    `Current team members: ${membersOf(m.id).length} (calculated from actual volunteers)`;
  previewMgColor(m.color);
  openModal('modalManagement');
}

function leadOptionsHTML(selected) {
  return `<option value="">— Select Management Lead —</option>` +
    MG.leads.map(l => {
      const owns = MG.managements.filter(m => m.leadId === l.id).length;
      return `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${esc(l.name)} · ${esc(l.mobile)}${owns ? ` (leads ${owns})` : ''}</option>`;
    }).join('');
}

function colorOptionsHTML(selected) {
  return MG.palette.map(p =>
    `<option value="${p.hex}" ${p.hex === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

function previewMgColor(hex) {
  const el = document.getElementById('mgColorSwatch');
  if (el) el.style.background = hex;
}

function handleSaveManagement(e) {
  e.preventDefault();

  const name = document.getElementById('mgFieldName').value.trim();
  const leadId = document.getElementById('mgLeadSelect').value;
  const size = parseInt(document.getElementById('mgFieldSize').value, 10);
  const desc = document.getElementById('mgFieldDesc').value.trim();
  const status = document.getElementById('mgFieldStatus').value;
  const color = document.getElementById('mgColorSelect').value;
  const notes = document.getElementById('mgFieldNotes').value.trim();

  if (!name) { mgToast('Management Name is required.'); return; }
  if (!leadId) { mgToast('Please assign a Management Lead.'); return; }
  if (!size || size < 1) { mgToast('Expected Team Size must be at least 1.'); return; }
  if (!desc) { mgToast('Description is required.'); return; }

  const dupe = MG.managements.find(m => m.name.toLowerCase() === name.toLowerCase() && m.id !== MG.editingMgmtId);
  if (dupe) { mgToast('A Management with this name already exists.'); return; }

  if (MG.editingMgmtId) {
    const m = mgmtById(MG.editingMgmtId);
    const leadChanged = m.leadId !== leadId;
    Object.assign(m, { name, leadId, expectedTeamSize: size, description: desc, status, color, notes });
    logActivity(m.id, leadChanged
      ? `Management updated — Lead changed to ${leadName(m.id)}`
      : `Management details updated by ${MG.session.userName}`);
    mgToast(`${name} updated.`);
  } else {
    const id = nextId('MGMT', MG.managements, 3);
    MG.managements.push({
      id, name, leadId, expectedTeamSize: size, description: desc, status, color, notes,
      createdAt: MG.today
    });
    MG.communication.push({ managementId: id, groupName:'', groupLink:'', broadcastName:'', broadcastLink:'' });
    logActivity(id, `Management created and assigned to ${leadById(leadId)?.name || 'Lead'}`);
    mgToast(`${name} created. Open it to add volunteers.`);
  }

  MG.editingMgmtId = null;
  closeModal('modalManagement');
  renderManagement();
}

function confirmDeleteManagement(id) {
  const m = mgmtById(id);
  if (!m) return;
  if (!isAdmin()) { mgToast('Only an administrator can delete a Management.'); return; }
  const team = membersOf(id).length;
  const sess = MG.volunteering.filter(v => v.managementId === id).length;

  openConfirm({
    title: 'Delete Management',
    danger: true,
    body: `<p>You are about to delete <strong>${esc(m.name)}</strong>.</p>
           <p class="mg-mt-sm">This will also remove <strong>${team}</strong> team assignment(s),
              <strong>${sess}</strong> volunteering session(s) and their attendance records.</p>
           <p class="mg-muted-xs mg-mt-sm">Devotee records themselves are not deleted — only their assignment to this Management.</p>
           <p class="mg-mt-sm"><strong>This action cannot be undone.</strong></p>`,
    confirmLabel: 'Delete Management',
    onConfirm: () => {
      const volIds = MG.volunteering.filter(v => v.managementId === id).map(v => v.id);
      MG.attendance   = MG.attendance.filter(a => !volIds.includes(a.volunteeringId));
      MG.volunteering = MG.volunteering.filter(v => v.managementId !== id);
      MG.members      = MG.members.filter(x => x.managementId !== id);
      MG.communication= MG.communication.filter(c => c.managementId !== id);
      MG.drafts       = MG.drafts.filter(d => d.managementId !== id);
      MG.activity     = MG.activity.filter(a => a.managementId !== id);
      MG.managements  = MG.managements.filter(m2 => m2.id !== id);
      if (MG.activeMgmtId === id) { MG.activeMgmtId = null; MG.view = 'directory'; }
      mgToast(`${m.name} deleted.`);
      renderManagement();
    }
  });
}

/* ============================================================
   ADD / EDIT VOLUNTEER (TEAM MEMBER)
   ============================================================ */
function openAddMember(mgmtId) {
  if (!canOpen(mgmtId)) { mgToast('Access denied.'); return; }
  MG.editingMemberId = null;
  MG.activeMgmtId = mgmtId;
  const m = mgmtById(mgmtId);

  document.getElementById('memberFormTitle').textContent = 'Add Volunteer';
  document.getElementById('memberFormSubmitBtn').textContent = 'Add Volunteer';
  document.getElementById('memberFormMgmt').textContent = m.name;

  document.getElementById('formMember').reset();
  document.getElementById('memFieldFirst').value = '';
  document.getElementById('memFieldLast').value = '';
  document.getElementById('memFieldMobile').value = '';
  document.getElementById('memFieldCity').value = 'Ahmedabad';
  document.getElementById('memFieldState').value = 'Gujarat';
  document.getElementById('memFieldRole').value = 'Volunteer';
  document.getElementById('memFieldStatus').value = 'active';
  document.getElementById('memFieldNotes').value = '';
  document.getElementById('memExistingHint').innerHTML = '';
  openModal('modalMember');
}

function openEditMember(id) {
  const x = memberById(id);
  if (!x) return;
  if (!canOpen(x.managementId)) { mgToast('Access denied.'); return; }
  MG.editingMemberId = id;
  const m = mgmtById(x.managementId);

  document.getElementById('memberFormTitle').textContent = 'Edit Volunteer';
  document.getElementById('memberFormSubmitBtn').textContent = 'Save Changes';
  document.getElementById('memberFormMgmt').textContent = m.name;

  document.getElementById('memFieldFirst').value = x.firstName;
  document.getElementById('memFieldLast').value = x.lastName;
  document.getElementById('memFieldMobile').value = x.mobile;
  document.getElementById('memFieldCity').value = x.city || '';
  document.getElementById('memFieldState').value = x.state || '';
  document.getElementById('memFieldRole').value = x.role || 'Volunteer';
  document.getElementById('memFieldStatus').value = x.status;
  document.getElementById('memFieldNotes').value = x.notes || '';

  const other = assignmentsOfDevotee(x.devoteeId).filter(a => a.member.id !== id);
  document.getElementById('memExistingHint').innerHTML = other.length
    ? `<div class="mg-note-box mg-muted-xs">Devotee <strong>${esc(x.devoteeId)}</strong> also serves in:
        ${other.map(a => esc(a.management.name)).join(', ')}. Editing here only affects this Management assignment.</div>`
    : '';
  openModal('modalMember');
}

/** Live check — if this mobile already exists, reuse the devotee record. */
function checkExistingDevotee() {
  const mobile = document.getElementById('memFieldMobile').value.trim();
  const hint = document.getElementById('memExistingHint');
  if (!hint || MG.editingMemberId) return;
  if (mobile.length < 10) { hint.innerHTML = ''; return; }

  const found = MG.members.find(x => x.mobile === mobile);
  if (!found) { hint.innerHTML = ''; return; }

  const already = MG.members.some(x => x.mobile === mobile && x.managementId === MG.activeMgmtId);
  if (already) {
    hint.innerHTML = `<div class="mg-note-box mg-warn">⚠ ${esc(memberName(found))} is already a member of this Management.</div>`;
  } else {
    const teams = assignmentsOfDevotee(found.devoteeId).map(a => esc(a.management.name)).join(', ');
    hint.innerHTML = `<div class="mg-note-box">✓ Existing devotee <strong>${esc(found.devoteeId)} — ${esc(memberName(found))}</strong> found.
      Currently in: ${teams}. Adding here creates a second assignment, not a duplicate devotee.</div>`;
    document.getElementById('memFieldFirst').value = found.firstName;
    document.getElementById('memFieldLast').value = found.lastName;
    document.getElementById('memFieldCity').value = found.city || '';
    document.getElementById('memFieldState').value = found.state || '';
  }
}

function handleSaveMember(e) {
  e.preventDefault();
  const mgmtId = MG.editingMemberId ? memberById(MG.editingMemberId).managementId : MG.activeMgmtId;
  const m = mgmtById(mgmtId);
  if (!m) return;

  const firstName = document.getElementById('memFieldFirst').value.trim();
  const lastName  = document.getElementById('memFieldLast').value.trim();
  const mobile    = document.getElementById('memFieldMobile').value.trim();
  const city      = document.getElementById('memFieldCity').value.trim();
  const state     = document.getElementById('memFieldState').value.trim();
  const role      = document.getElementById('memFieldRole').value.trim() || 'Volunteer';
  const status    = document.getElementById('memFieldStatus').value;
  const notes     = document.getElementById('memFieldNotes').value.trim();

  if (!firstName) { mgToast('First Name is required.'); return; }
  if (!lastName)  { mgToast('Last Name is required.'); return; }
  if (!/^[0-9]{10}$/.test(mobile)) { mgToast('Mobile Number must be exactly 10 digits.'); return; }

  if (MG.editingMemberId) {
    const x = memberById(MG.editingMemberId);
    Object.assign(x, { firstName, lastName, mobile, city, state, role, status, notes });
    logActivity(mgmtId, `Volunteer ${memberName(x)} details updated`);
    mgToast(`${memberName(x)} updated.`);
  } else {
    const dupe = MG.members.find(x => x.mobile === mobile && x.managementId === mgmtId);
    if (dupe) { mgToast(`${memberName(dupe)} is already in this Management.`); return; }

    const existing = MG.members.find(x => x.mobile === mobile);
    const devoteeId = existing ? existing.devoteeId : nextId('DEV', MG.members.map(x => ({ id:x.devoteeId })), 3);

    const id = nextId('MEM', MG.members, 3);
    MG.members.push({ id, managementId: mgmtId, devoteeId, firstName, lastName, mobile,
      city, state, role, status, notes, joinedDate: MG.today });

    logActivity(mgmtId, existing
      ? `${firstName} ${lastName} (${devoteeId}) added — also serves in other Managements`
      : `New volunteer ${firstName} ${lastName} added to the team`);
    mgToast(`${firstName} ${lastName} added to ${m.name}.`);
  }

  MG.editingMemberId = null;
  closeModal('modalMember');
  renderManagement();
}

function toggleMemberStatus(id) {
  const x = memberById(id);
  if (!x) return;
  if (x.status === 'active') {
    openConfirm({
      title: 'Deactivate Volunteer',
      body: `<p>Deactivate <strong>${esc(memberName(x))}</strong> in ${esc(mgmtById(x.managementId).name)}?</p>
             <p class="mg-mt-sm">They will stop appearing in new volunteering assignments, but all past
                attendance history is preserved.</p>`,
      confirmLabel: 'Deactivate',
      onConfirm: () => {
        x.status = 'inactive';
        logActivity(x.managementId, `${memberName(x)} deactivated — attendance history preserved`);
        mgToast(`${memberName(x)} deactivated.`);
        renderManagement();
      }
    });
  } else {
    x.status = 'active';
    logActivity(x.managementId, `${memberName(x)} reactivated`);
    mgToast(`${memberName(x)} reactivated.`);
    renderManagement();
  }
}

function confirmRemoveMember(id) {
  const x = memberById(id);
  if (!x) return;
  const m = mgmtById(x.managementId);
  const assigned = MG.volunteering.filter(v => v.memberIds.includes(id)).length;

  openConfirm({
    title: 'Remove Volunteer',
    danger: true,
    body: `<p>Are you sure you want to remove this volunteer from the management team?</p>
           <p class="mg-mt-sm"><strong>${esc(memberName(x))}</strong> — ${esc(m.name)}</p>
           <p class="mg-muted-xs mg-mt-sm">They appear in ${assigned} volunteering session(s).
              Removing clears this assignment and its attendance rows. The devotee record
              (${esc(x.devoteeId)}) and any other Management assignments remain untouched.</p>
           <p class="mg-mt-sm">Prefer <strong>Deactivate</strong> if you want to keep the history.</p>`,
    confirmLabel: 'Remove from Team',
    onConfirm: () => {
      MG.volunteering.forEach(v => { v.memberIds = v.memberIds.filter(i => i !== id); });
      MG.attendance = MG.attendance.filter(a => a.memberId !== id);
      MG.members = MG.members.filter(mm => mm.id !== id);
      if (MG.activeMemberId === id) MG.activeMemberId = null;
      logActivity(m.id, `${memberName(x)} removed from the team`);
      mgToast(`${memberName(x)} removed from ${m.name}.`);
      renderManagement();
    }
  });
}

/* ============================================================
   SCHEDULE / EDIT VOLUNTEERING
   ============================================================ */
function openScheduleSession(mgmtId) {
  if (!canOpen(mgmtId)) { mgToast('Access denied.'); return; }
  MG.editingSessionId = null;
  MG.activeMgmtId = mgmtId;
  const m = mgmtById(mgmtId);

  document.getElementById('sessionFormTitle').textContent = 'Schedule Volunteering';
  document.getElementById('sessionFormSubmitBtn').textContent = 'Schedule Volunteering';
  document.getElementById('sessionFormMgmt').textContent = m.name;

  document.getElementById('formSession').reset();
  document.getElementById('sesFieldTitle').value = '';
  document.getElementById('sesFieldDate').value = MG.today;
  document.getElementById('sesFieldStart').value = '09:00';
  document.getElementById('sesFieldEnd').value = '13:00';
  document.getElementById('sesFieldLocation').value = '';
  document.getElementById('sesFieldNotes').value = '';
  const pub = document.getElementById('sesFieldPublic');
  if (pub) pub.checked = false;
  renderVolunteerPicker(mgmtId, []);
  openModal('modalSession');
}

function openEditSession(volId) {
  const v = sessionById(volId);
  if (!v) return;
  if (!canOpen(v.managementId)) { mgToast('Access denied.'); return; }
  MG.editingSessionId = volId;
  MG.activeMgmtId = v.managementId;
  const m = mgmtById(v.managementId);

  document.getElementById('sessionFormTitle').textContent = 'Edit Volunteering';
  document.getElementById('sessionFormSubmitBtn').textContent = 'Save Changes';
  document.getElementById('sessionFormMgmt').textContent = m.name;

  document.getElementById('sesFieldTitle').value = v.title;
  document.getElementById('sesFieldDate').value = v.date;
  document.getElementById('sesFieldStart').value = v.startTime;
  document.getElementById('sesFieldEnd').value = v.endTime;
  document.getElementById('sesFieldLocation').value = v.location || '';
  document.getElementById('sesFieldNotes').value = v.notes || '';
  const pub = document.getElementById('sesFieldPublic');
  if (pub) pub.checked = v.publicOpen === true;
  renderVolunteerPicker(v.managementId, v.memberIds);
  openModal('modalSession');
}

function renderVolunteerPicker(mgmtId, selected) {
  const box = document.getElementById('sesVolunteerPicker');
  if (!box) return;
  const list = membersOf(mgmtId).filter(x => x.status === 'active' || selected.includes(x.id));

  box.innerHTML = list.length ? list.map(x => `
    <label class="mg-pick ${selected.includes(x.id) ? 'picked' : ''}">
      <input type="checkbox" class="mg-vol-check" value="${x.id}" ${selected.includes(x.id) ? 'checked' : ''}
             onchange="this.closest('.mg-pick').classList.toggle('picked', this.checked); updatePickCount();">
      <span class="mg-avatar">${esc((x.firstName[0]||'')+(x.lastName[0]||''))}</span>
      <span class="mg-pick-body">
        <strong>${esc(memberName(x))}</strong>
        <small>${esc(x.role || 'Volunteer')} · ${esc(x.mobile)}${x.status === 'inactive' ? ' · inactive' : ''}</small>
      </span>
    </label>`).join('')
    : `<div class="mg-pad-note">No active volunteers in this team yet. Add volunteers first.</div>`;

  updatePickCount();
}

function updatePickCount() {
  const n = document.querySelectorAll('.mg-vol-check:checked').length;
  const el = document.getElementById('sesPickCount');
  if (el) el.textContent = `${n} volunteer(s) selected`;
}

function toggleAllVolunteers(on) {
  document.querySelectorAll('.mg-vol-check').forEach(c => {
    c.checked = on;
    c.closest('.mg-pick').classList.toggle('picked', on);
  });
  updatePickCount();
}

function handleSaveSession(e) {
  e.preventDefault();
  const mgmtId = MG.editingSessionId ? sessionById(MG.editingSessionId).managementId : MG.activeMgmtId;
  const m = mgmtById(mgmtId);
  if (!m) return;

  const title = document.getElementById('sesFieldTitle').value.trim();
  const date  = document.getElementById('sesFieldDate').value;
  const start = document.getElementById('sesFieldStart').value;
  const end   = document.getElementById('sesFieldEnd').value;
  const location = document.getElementById('sesFieldLocation').value.trim();
  const notes = document.getElementById('sesFieldNotes').value.trim();
  const publicOpen = !!document.getElementById('sesFieldPublic')?.checked;
  const memberIds = Array.from(document.querySelectorAll('.mg-vol-check:checked')).map(c => c.value);

  if (!title) { mgToast('Volunteering Title is required.'); return; }
  if (!date)  { mgToast('Date is required.'); return; }
  if (!start) { mgToast('Start Time is required.'); return; }
  if (!end)   { mgToast('End Time is required.'); return; }
  if (end <= start) { mgToast('End Time must be after Start Time.'); return; }
  if (!memberIds.length && !publicOpen) { mgToast('Select at least one volunteer, or open the slot for public sign-up.'); return; }

  if (MG.editingSessionId) {
    const v = sessionById(MG.editingSessionId);
    const dropped = v.memberIds.filter(i => !memberIds.includes(i));
    MG.attendance = MG.attendance.filter(a => !(a.volunteeringId === v.id && dropped.includes(a.memberId)));
    Object.assign(v, { title, date, startTime:start, endTime:end, location, notes, memberIds, publicOpen });
    logActivity(mgmtId, `Volunteering "${title}" updated — ${memberIds.length} volunteers assigned${publicOpen ? ', open to public' : ''}`);
    mgToast('Volunteering updated.');
  } else {
    const id = nextId('VOL', MG.volunteering, 3);
    MG.volunteering.push({ id, managementId: mgmtId, title, date, startTime:start, endTime:end,
      location, memberIds, notes, completed:false, publicOpen });
    logActivity(mgmtId, `Volunteering "${title}" scheduled for ${fmtDate(date)} with ${memberIds.length} volunteers${publicOpen ? ', open to public' : ''}`);
    mgToast(`Volunteering scheduled for ${fmtDate(date)}.`);
  }

  MG.editingSessionId = null;
  closeModal('modalSession');
  const [y, mo] = date.split('-').map(Number);
  MG.calendarYear = y; MG.calendarMonth = mo - 1;
  MG.reportMonth = `${y}-${String(mo).padStart(2,'0')}`;
  renderManagement();
}

function confirmDeleteSession(volId) {
  const v = sessionById(volId);
  if (!v) return;
  const t = sessionTally(v);
  openConfirm({
    title: 'Delete Volunteering',
    danger: true,
    body: `<p>Delete <strong>${esc(v.title)}</strong> on ${fmtDate(v.date)}?</p>
           <p class="mg-muted-xs mg-mt-sm">${t.present + t.absent} attendance record(s) will also be deleted.</p>`,
    confirmLabel: 'Delete Session',
    onConfirm: () => {
      MG.attendance = MG.attendance.filter(a => a.volunteeringId !== volId);
      MG.volunteering = MG.volunteering.filter(x => x.id !== volId);
      if (MG.activeSessionId === volId) MG.activeSessionId = null;
      logActivity(v.managementId, `Volunteering "${v.title}" deleted`);
      mgToast('Volunteering deleted.');
      renderManagement();
    }
  });
}

/* ============================================================
   MESSAGE DRAFTS
   ============================================================ */
function openDraftEditor(mgmtId, draftId) {
  if (!canOpen(mgmtId)) { mgToast('Access denied.'); return; }
  MG.activeMgmtId = mgmtId;
  MG.editingDraftId = draftId || null;
  const d = draftId ? MG.drafts.find(x => x.id === draftId) : null;

  document.getElementById('draftFormTitle').textContent = d ? 'Edit Message Draft' : 'New Message Draft';
  document.getElementById('draftFormSubmitBtn').textContent = d ? 'Save Draft' : 'Create Draft';
  document.getElementById('draftFieldTitle').value = d ? d.title : '';
  document.getElementById('draftFieldMessage').value = d ? d.message : '';
  updateDraftCount();
  openModal('modalDraft');
}

function updateDraftCount() {
  const el = document.getElementById('draftCharCount');
  const v = document.getElementById('draftFieldMessage')?.value || '';
  if (el) el.textContent = `${v.length} characters`;
}

function handleSaveDraft(e) {
  e.preventDefault();
  const title = document.getElementById('draftFieldTitle').value.trim();
  const message = document.getElementById('draftFieldMessage').value.trim();
  if (!title) { mgToast('Draft Title is required.'); return; }
  if (!message) { mgToast('Message text is required.'); return; }

  if (MG.editingDraftId) {
    const d = MG.drafts.find(x => x.id === MG.editingDraftId);
    d.title = title; d.message = message; d.updatedAt = MG.today;
    logActivity(d.managementId, `Message draft "${title}" updated`);
    mgToast('Draft saved.');
  } else {
    const id = nextId('DRF', MG.drafts, 3);
    MG.drafts.push({ id, managementId: MG.activeMgmtId, title, message, updatedAt: MG.today });
    logActivity(MG.activeMgmtId, `Message draft "${title}" created`);
    mgToast('Draft created.');
  }
  MG.editingDraftId = null;
  closeModal('modalDraft');
  renderManagement();
}

function duplicateDraft(id) {
  const d = MG.drafts.find(x => x.id === id);
  if (!d) return;
  const nid = nextId('DRF', MG.drafts, 3);
  MG.drafts.push({ id:nid, managementId:d.managementId, title:`${d.title} (Copy)`, message:d.message, updatedAt:MG.today });
  logActivity(d.managementId, `Message draft "${d.title}" duplicated`);
  mgToast('Draft duplicated.');
  renderManagement();
}

function confirmDeleteDraft(id) {
  const d = MG.drafts.find(x => x.id === id);
  if (!d) return;
  openConfirm({
    title: 'Delete Draft',
    danger: true,
    body: `<p>Delete the draft <strong>${esc(d.title)}</strong>?</p>`,
    confirmLabel: 'Delete Draft',
    onConfirm: () => {
      MG.drafts = MG.drafts.filter(x => x.id !== id);
      logActivity(d.managementId, `Message draft "${d.title}" deleted`);
      mgToast('Draft deleted.');
      renderManagement();
    }
  });
}

function copyDraft(id) {
  const d = MG.drafts.find(x => x.id === id);
  if (!d) return;
  copyText(d.message, 'Message copied to clipboard.');
}

function copyText(text, okMsg) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => mgToast(okMsg || 'Copied.')).catch(() => fallbackCopy(text, okMsg));
  } else fallbackCopy(text, okMsg);
}

function fallbackCopy(text, okMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); mgToast(okMsg || 'Copied.'); }
  catch (e) { mgToast('Copy failed — please select the text manually.'); }
  document.body.removeChild(ta);
}

function openSendDraft(id) {
  const d = MG.drafts.find(x => x.id === id);
  if (!d) return;
  const c = commById(d.managementId) || {};
  const m = mgmtById(d.managementId);

  openSheet({
    title: 'Send Message',
    body: `
      <p class="mg-muted-xs">Choose where to send <strong>${esc(d.title)}</strong> for ${esc(m.name)}.</p>
      <pre class="mg-draft-body mg-mt-sm">${esc(d.message)}</pre>
      <div class="mg-send-grid mg-mt">
        <button class="mg-send-opt" onclick="sendDraftTo('${id}','group')" ${c.groupLink ? '' : 'disabled'}>
          <span class="mg-send-ico">💬</span>
          <strong>WhatsApp Group</strong>
          <small>${c.groupName ? esc(c.groupName) : 'No group link saved'}</small>
        </button>
        <button class="mg-send-opt" onclick="sendDraftTo('${id}','broadcast')" ${c.broadcastLink ? '' : 'disabled'}>
          <span class="mg-send-ico">📢</span>
          <strong>Broadcast</strong>
          <small>${c.broadcastName ? esc(c.broadcastName) : 'No broadcast link saved'}</small>
        </button>
      </div>
      ${(!c.groupLink || !c.broadcastLink) ? `<div class="mg-note-box mg-warn mg-mt-sm">
        Missing links are configured in the WhatsApp tab.</div>` : ''}`,
    footer: `<button class="btn btn-outline" onclick="closeSheet()">Cancel</button>
             <button class="btn btn-secondary" onclick="copyDraft('${id}')">Copy Message</button>`
  });
}

function sendDraftTo(id, target) {
  const d = MG.drafts.find(x => x.id === id);
  if (!d) return;
  const c = commById(d.managementId) || {};
  const link = target === 'group' ? c.groupLink : c.broadcastLink;
  const label = target === 'group' ? (c.groupName || 'WhatsApp Group') : (c.broadcastName || 'Broadcast');

  if (!link) { mgToast(`No ${target} link saved. Add it in the WhatsApp tab.`); return; }

  copyText(d.message, 'Message copied — paste it in WhatsApp.');
  window.open(link, '_blank', 'noopener');
  logActivity(d.managementId, `Message "${d.title}" sent via ${label}`);
  closeSheet();
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('managementRoot');
  if (!root) return;

  /* Public volunteering page — no-login route: #/volunteer/<MGMT-ID> */
  if (typeof renderPublicRouter === 'function') {
    renderPublicRouter();
    window.addEventListener('hashchange', renderPublicRouter);
  }

  populateLeadRoleOptions();
  renderManagement();
  if (typeof onLanguageChange === 'function') onLanguageChange(() => renderManagement());

  const cnt = document.getElementById('dashMgmtCount');
  if (cnt) {
    const teams = MG.managements.length;
    const vols = MG.members.filter(x => x.status === 'active').length;
    cnt.textContent = `${teams} Teams · ${vols} Volunteers`;
  }

  document.getElementById('mgSheet')?.addEventListener('click', e => {
    if (e.target.id === 'mgSheet') closeSheet();
  });
  document.getElementById('mgConfirm')?.addEventListener('click', e => {
    if (e.target.id === 'mgConfirm') closeConfirm();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSheet(); closeConfirm(); }
  });
});
