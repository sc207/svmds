/* Boot-time hydration: when the backend is reachable (API.online), replace the
   in-memory seed data with real rows from the REST API and re-render.
   Runs on window.load, AFTER every module's own DOMContentLoaded render, so a
   failure here can never stop the app painting. Each store is hydrated in its
   own try/catch — one failing endpoint never blocks the others.

   The server keys people by a numeric devotees.id; the frontend keys them by
   the human DEV-### code. `devCode()` bridges the two using an index built from
   the hydrated devotee list, so every module ends up referencing the SAME real
   devotee identity. */
(function () {
  if (typeof window === 'undefined') return;

  function log(msg) { try { console.info('[hydrate] ' + msg); } catch (e) {} }

  var DEV_BY_ROW = {};        // numeric devotees.id  -> 'DEV-###'
  window.__devCodeByRow = DEV_BY_ROW;
  function devCode(rowId) {
    if (rowId == null || rowId === '') return '';
    return DEV_BY_ROW[rowId] || String(rowId);
  }

  function swap(arr, rows) {
    if (!Array.isArray(arr)) return;
    arr.length = 0;
    for (var i = 0; i < rows.length; i++) arr.push(rows[i]);
  }

  async function hydrateSettings() {
    var s = await window.API.get('/settings');
    if (!s) return;
    var overridden = false;
    try { overridden = !!localStorage.getItem('svmmm_clock'); } catch (e) {}
    if (!overridden && s.workingDate) {
      if (typeof MG !== 'undefined') {
        MG.today = s.workingDate;
        if (/^\d{2}:\d{2}$/.test(s.workingTime || '')) MG.nowTime = s.workingTime;
      }
    }
    try {
      var cur = JSON.parse(localStorage.getItem('svmmm_temple') || '{}');
      if ((!cur || !cur.name) && s.templeIdentity && s.templeIdentity.name) {
        localStorage.setItem('svmmm_temple', JSON.stringify(s.templeIdentity));
      }
    } catch (e) {}
    try {
      var langChosen = !!localStorage.getItem('svmmm_lang');
      if (!langChosen && s.defaultLanguage && typeof window.setLanguage === 'function') {
        window.setLanguage(s.defaultLanguage, { announce: false });
      }
    } catch (e) {}
    log('settings applied (clock ' + (overridden ? 'kept local override' : s.workingDate) + ')');
  }

  async function hydrateCore() {
    if (typeof state === 'undefined') return;

    try {
      var devotees = await window.API.get('/devotees');
      for (var k in DEV_BY_ROW) delete DEV_BY_ROW[k];
      devotees.forEach(function (d) {
        if (d.rowId != null) DEV_BY_ROW[d.rowId] = d.code || d.id;
      });
      swap(state.devotees, devotees.map(function (d) {
        var mob = d.mobile || d.phone || '';
        return { id: d.code || d.id, rowId: d.rowId, code: d.code || d.id, name: d.name,
                 phone: mob, mobile: mob, city: d.city, samaj: d.samaj, status: d.status,
                 visits: d.visits || 0 };
      }));
      if (typeof renderDevotees === 'function') renderDevotees();
      log('devotees: ' + state.devotees.length);
    } catch (e) { log('devotees failed: ' + e.message); }

    try {
      var inv = await window.API.get('/inventory');
      swap(state.inventory, inv.map(function (x) {
        return { id: x.code || x.id, item: x.item, category: x.category,
                 stock: x.stock, minStock: x.minStock, status: x.status };
      }));
      if (typeof renderInventoryTable === 'function') renderInventoryTable();
      log('inventory: ' + state.inventory.length);
    } catch (e) { log('inventory failed: ' + e.message); }

    try {
      var exp = await window.API.get('/expenses');
      swap(state.expenses, exp.map(function (x) {
        return { id: x.code || x.id, title: x.title, category: x.category,
                 amount: x.amount, date: x.date, status: x.status };
      }));
      if (typeof renderExpensesTable === 'function') renderExpensesTable();
      log('expenses: ' + state.expenses.length);
    } catch (e) { log('expenses failed: ' + e.message); }
  }

  /* ---- Committee / Samaj ---- */
  async function hydrateCommittees() {
    if (typeof CMT === 'undefined') return;
    var rows = await window.API.get('/committees');
    if (!Array.isArray(rows)) return;

    var committees = [], members = [], meetings = [], attendance = [], communication = [], drafts = [];
    var memCodeByRow = {};   // numeric committee_member id -> its code (meetings/attendance key on the numeric id)

    rows.forEach(function (c) {
      committees.push({
        id: c.id, code: c.code, name: c.name,
        leaderId: devCode(c.leaderDevoteeId),
        samaj: c.samaj || '', purpose: c.purpose || '', color: c.color || '#6B1F2A',
        expectedSize: c.expectedSize || 0, status: c.status || 'active',
        createdDate: c.createdDate || '', notes: c.notes || ''
      });
      (c.members || []).forEach(function (m) {
        if (m.rowId != null) memCodeByRow[m.rowId] = m.id;
        members.push({
          id: m.id, committeeId: c.id, devoteeId: devCode(m.devoteeId),
          firstName: m.firstName || '', lastName: m.lastName || '',
          mobile: m.mobile || '', city: m.city || '', state: m.state || 'Gujarat',
          role: m.role || 'Member', status: m.status || 'active',
          notes: m.notes || '', joinedDate: m.joinedDate || ''
        });
      });
      (c.meetings || []).forEach(function (mt) {
        meetings.push({
          id: mt.id, committeeId: c.id, title: mt.title, date: mt.date,
          startTime: mt.startTime || '', endTime: mt.endTime || '', venue: mt.venue || '',
          agenda: mt.agenda || '', notes: mt.notes || '', completed: !!mt.completed,
          memberIds: (mt.memberIds || []).map(function (rid) { return memCodeByRow[rid] || String(rid); })
        });
        (mt.attendance || []).forEach(function (a) {
          attendance.push({
            meetingId: mt.id,
            memberId: memCodeByRow[a.memberId] || String(a.memberId),
            status: a.status, markedAt: a.markedAt || ''
          });
        });
      });
      if (c.communication) {
        communication.push({
          committeeId: c.id,
          groupName: c.communication.groupName || '', groupLink: c.communication.groupLink || '',
          broadcastName: c.communication.broadcastName || '', broadcastLink: c.communication.broadcastLink || ''
        });
      }
      (c.drafts || []).forEach(function (d) {
        drafts.push({ id: d.id, committeeId: c.id, title: d.title || '', message: d.message || '', updatedAt: d.updatedAt || '' });
      });
    });

    swap(CMT.committees, committees);
    swap(CMT.members, members);
    swap(CMT.meetings, meetings);
    swap(CMT.attendance, attendance);
    swap(CMT.communication, communication);
    swap(CMT.drafts, drafts);
    if (typeof renderCommittee === 'function') renderCommittee();
    log('committees: ' + committees.length + ' (' + members.length + ' members)');
  }

  /* ---- Management / Teams ---- */
  async function hydrateTeams() {
    if (typeof MG === 'undefined') return;
    var rows = await window.API.get('/teams');
    if (!Array.isArray(rows)) return;

    var teams = [], members = [], volunteering = [], attendance = [], communication = [], drafts = [];
    var publicPages = {};
    var memCodeByRow = {};

    rows.forEach(function (t) {
      teams.push({
        id: t.id, code: t.code, name: t.name,
        leadId: devCode(t.leadDevoteeId),
        description: t.description || '', color: t.color || '#6B1F2A',
        expectedTeamSize: t.expectedTeamSize || 0, status: t.status || 'active',
        createdDate: t.createdDate || '', notes: t.notes || ''
      });
      (t.members || []).forEach(function (m) {
        if (m.rowId != null) memCodeByRow[m.rowId] = m.id;
        members.push({
          id: m.id, managementId: t.id, devoteeId: devCode(m.devoteeId),
          firstName: m.firstName || '', lastName: m.lastName || '',
          mobile: m.mobile || '', city: m.city || '', state: m.state || 'Gujarat',
          role: m.role || 'Volunteer', status: m.status || 'active',
          notes: m.notes || '', joinedDate: m.joinedDate || ''
        });
      });
      (t.sessions || []).forEach(function (s) {
        volunteering.push({
          id: s.id, managementId: t.id, title: s.title, date: s.date,
          startTime: s.startTime || '', endTime: s.endTime || '', location: s.location || '',
          notes: s.notes || '', completed: !!s.completed, publicOpen: !!s.publicOpen,
          memberIds: (s.memberIds || []).map(function (rid) { return memCodeByRow[rid] || String(rid); })
        });
        (s.attendance || []).forEach(function (a) {
          attendance.push({
            sessionId: s.id,
            memberId: memCodeByRow[a.memberId] || String(a.memberId),
            status: a.status, markedAt: a.markedAt || ''
          });
        });
      });
      if (t.communication) {
        communication.push({
          managementId: t.id,
          groupName: t.communication.groupName || '', groupLink: t.communication.groupLink || '',
          broadcastName: t.communication.broadcastName || '', broadcastLink: t.communication.broadcastLink || ''
        });
      }
      (t.drafts || []).forEach(function (d) {
        drafts.push({ id: d.id, managementId: t.id, title: d.title || '', message: d.message || '', updatedAt: d.updatedAt || '' });
      });
      if (t.publicPage) publicPages[t.id] = { enabled: !!t.publicPage.enabled, intro: t.publicPage.intro || '', contact: t.publicPage.contact || '' };
    });

    swap(MG.managements, teams);
    swap(MG.members, members);
    swap(MG.volunteering, volunteering);
    swap(MG.attendance, attendance);
    swap(MG.communication, communication);
    swap(MG.drafts, drafts);
    if (MG.publicPages && typeof MG.publicPages === 'object') {
      Object.keys(MG.publicPages).forEach(function (k) { delete MG.publicPages[k]; });
      Object.keys(publicPages).forEach(function (k) { MG.publicPages[k] = publicPages[k]; });
    }
    if (typeof renderManagement === 'function') renderManagement();
    log('teams: ' + teams.length + ' (' + members.length + ' members)');
  }

  /* ---- Pooja ---- */
  async function hydratePoojas() {
    if (typeof POOJA === 'undefined') return;
    var types = [];
    try { types = await window.API.get('/pooja-types'); } catch (e) {}
    if (Array.isArray(types)) {
      swap(POOJA.poojaTypes, types.map(function (t) {
        return { id: t.id, code: t.code, name: t.name, category: t.category || '',
                 description: t.description || '', defaultDurationMin: t.defaultDurationMin || 60,
                 suggestedOfferings: t.suggestedOfferings || '', icon: t.icon || '🪔' };
      }));
    }

    var sevRows = [];
    try { sevRows = await window.API.get('/sevarthis'); } catch (e) {}
    if (Array.isArray(sevRows)) {
      swap(POOJA.sevarthis, sevRows.map(function (s) {
        return { id: s.id, code: s.code, devoteeId: devCode(s.devoteeId),
                 firstName: s.firstName || '', lastName: s.lastName || '',
                 mobile: s.mobile || '', city: s.city || '', state: s.state || 'Gujarat',
                 committee: s.committee || '', status: s.status || 'active',
                 notes: s.notes || '', addedDate: s.addedDate || '' };
      }));
    }

    var rows = await window.API.get('/poojas');
    if (!Array.isArray(rows)) return;
    var poojas = [], guests = {};
    rows.forEach(function (p) {
      (p.guests || []).forEach(function (g) {
        if (!guests[g.id]) guests[g.id] = {
          id: g.id, code: g.code, devoteeId: '', firstName: g.firstName || '', lastName: g.lastName || '',
          role: g.role || g.title || '', mobile: g.mobile || '', city: g.city || '', state: g.state || 'Gujarat',
          notes: g.notes || ''
        };
      });
      poojas.push({
        id: p.id, code: p.code, typeId: p.typeId, name: p.name,
        scheduleMode: p.scheduleMode || 'single', defaultVenue: p.defaultVenue || '',
        status: p.status || null, color: p.color || '#6B1F2A',
        estimatedSevaAmount: p.estimatedSevaAmount || 0, notes: p.notes || '',
        custom: p.custom || [], invitation: p.invitation || {},
        extendedUntil: p.extendedUntil || undefined, completedOn: p.completedOn || undefined,
        createdDate: p.createdDate || '',
        sessions: (p.sessions || []).map(function (s) {
          return { id: s.id, label: s.label || '', date: s.date, startTime: s.startTime || '',
                   endTime: s.endTime || '', venue: s.venue || '' };
        }),
        sevarthiIds: (p.sevarthiIds || []).slice(),
        coordinatorIds: (p.coordinatorIds || []).slice(),
        guestIds: (p.guests || []).map(function (g) { return g.id; })
      });
    });
    swap(POOJA.poojas, poojas);
    swap(POOJA.people, Object.keys(guests).map(function (k) { return guests[k]; }));
    if (typeof renderPooja === 'function') renderPooja();
    log('poojas: ' + poojas.length + ' (' + POOJA.sevarthis.length + ' sevarthis, ' + POOJA.poojaTypes.length + ' types)');
  }

  async function refreshViews() {
    try { if (typeof renderDashboard === 'function') renderDashboard(); } catch (e) {}
    try { if (typeof renderUnifiedCalendar === 'function') renderUnifiedCalendar(); } catch (e) {}
    try { if (typeof syncEntitySelects === 'function') syncEntitySelects(); } catch (e) {}
  }

  async function run() {
    if (!window.API || !window.API.online) { log('offline — keeping seed data'); return; }
    log('backend online — hydrating');
    try { await hydrateSettings(); } catch (e) { log('settings failed: ' + e.message); }
    await hydrateCore();
    try { await hydrateCommittees(); } catch (e) { log('committees failed: ' + e.message); }
    try { await hydrateTeams(); } catch (e) { log('teams failed: ' + e.message); }
    try { await hydratePoojas(); } catch (e) { log('poojas failed: ' + e.message); }
    await refreshViews();
    log('done');
  }

  window.__rehydrate = run;   // modules can force a full re-pull after a big change

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
