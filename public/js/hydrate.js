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

  // just the people register — the one thing a scoped post-save refresh needs
  // so devCode() resolves any devotee the save created.
  async function hydrateDevotees() {
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
  }

  async function hydrateCore() {
    if (typeof state === 'undefined') return;
    await hydrateDevotees();

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
          id: m.id, code: m.code || m.id, rowId: m.rowId, committeeId: c.id, devoteeId: devCode(m.devoteeId),
          firstName: m.firstName || '', lastName: m.lastName || '',
          mobile: m.mobile || '', city: m.city || '', state: m.state || 'Gujarat',
          role: m.role || 'Member', status: m.status || 'active',
          notes: m.notes || '', joinedDate: m.joinedDate || ''
        });
      });
      (c.meetings || []).forEach(function (mt) {
        meetings.push({
          id: mt.id, code: mt.code || mt.id, committeeId: c.id, title: mt.title, date: mt.date,
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
        drafts.push({ id: d.id, code: d.code || d.id, committeeId: c.id, title: d.title || '', message: d.message || '', updatedAt: d.updatedAt || '' });
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

    var teams = [], members = [], volunteering = [], attendance = [], communication = [], drafts = [], signups = [];
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
          id: m.id, code: m.code || m.id, rowId: m.rowId, managementId: t.id, devoteeId: devCode(m.devoteeId),
          firstName: m.firstName || '', lastName: m.lastName || '',
          mobile: m.mobile || '', city: m.city || '', state: m.state || 'Gujarat',
          role: m.role || 'Volunteer', status: m.status || 'active',
          notes: m.notes || '', joinedDate: m.joinedDate || ''
        });
      });
      (t.sessions || []).forEach(function (s) {
        volunteering.push({
          id: s.id, code: s.code || s.id, managementId: t.id, title: s.title, date: s.date,
          startTime: s.startTime || '', endTime: s.endTime || '', location: s.location || '',
          notes: s.notes || '', completed: !!s.completed, publicOpen: !!s.publicOpen,
          memberIds: (s.memberIds || []).map(function (rid) { return memCodeByRow[rid] || String(rid); })
        });
        (s.attendance || []).forEach(function (a) {
          attendance.push({
            volunteeringId: s.id,
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
        drafts.push({ id: d.id, code: d.code || d.id, managementId: t.id, title: d.title || '', message: d.message || '', updatedAt: d.updatedAt || '' });
      });
      if (t.publicPage) publicPages[t.id] = { enabled: !!t.publicPage.enabled, intro: t.publicPage.intro || '', contact: t.publicPage.contact || '' };
    });

    // pending public sign-ups (one call per team that has any)
    for (var ti = 0; ti < rows.length; ti++) {
      var tt = rows[ti];
      if (!tt.pendingSignups) continue;
      try {
        var su = await window.API.get('/teams/' + tt.id + '/signups?status=pending');
        (Array.isArray(su) ? su : []).forEach(function (s) {
          signups.push({ id: s.id, code: s.code, managementId: tt.id, volunteeringId: s.sessionId,
                         name: s.name, mobile: s.mobile || '', city: s.city || '', note: s.note || '',
                         status: s.status || 'pending', submittedAt: s.submittedAt || '' });
        });
      } catch (e) {}
    }

    swap(MG.managements, teams);
    swap(MG.members, members);
    swap(MG.volunteering, volunteering);
    swap(MG.attendance, attendance);
    swap(MG.communication, communication);
    swap(MG.drafts, drafts);
    if (Array.isArray(MG.publicSignups)) swap(MG.publicSignups, signups);
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

  /* ---- Events ---- */
  async function hydrateEvents() {
    if (typeof EV === 'undefined') return;
    var types = [];
    try { types = await window.API.get('/events/types'); } catch (e) {}
    if (Array.isArray(types)) {
      swap(EV.eventTypes, types.map(function (t) {
        return { id: t.id, code: t.code, name: t.name, category: t.category || '',
                 icon: t.icon || '📅', description: t.description || '' };
      }));
    }
    var rows = await window.API.get('/events');
    if (!Array.isArray(rows)) return;
    swap(EV.events, rows.map(function (e) {
      return { id: e.id, code: e.code, typeId: e.typeId, name: e.name, venue: e.venue || '',
               inChargeId: devCode(e.inChargeDevoteeId), inChargeUserId: e.inChargeId || null,
               expectedFootfall: e.expectedFootfall || 0, budget: e.budget || 0,
               status: e.status || 'planning', color: e.color || '#C96A20', notes: e.notes || '',
               days: (e.days || []).map(function (d) { return { id: d.id, date: d.date, startTime: d.startTime || '', endTime: d.endTime || '' }; }),
               createdDate: e.createdDate || '' };
    }));
    if (typeof renderEvents === 'function') renderEvents();
    log('events: ' + EV.events.length + ' (' + EV.eventTypes.length + ' types)');
  }

  /* ---- Visits ---- */
  async function hydrateVisits() {
    if (typeof VISITS === 'undefined') return;
    var rows = await window.API.get('/visits');
    if (!Array.isArray(rows)) return;
    swap(VISITS.list, rows.map(function (v) {
      return { id: v.id, code: v.code, devoteeName: v.devoteeName || '', devoteeId: devCode(v.devoteeId),
               mobile: v.mobile || '', purpose: v.purpose || 'other', address: v.address || '',
               city: v.city || '', state: v.state || 'Gujarat', date: v.date, time: v.time || '',
               escortTeam: v.escortTeam || '', status: v.status || 'requested', notes: v.notes || '' };
    }));
    if (typeof renderVisits === 'function') renderVisits();
    log('visits: ' + VISITS.list.length);
  }

  /* ---- Donations ---- */
  async function hydrateDonations() {
    if (typeof DON === 'undefined') return;
    var cats = [];
    try { cats = await window.API.get('/donation-categories'); } catch (e) {}
    if (Array.isArray(cats)) {
      swap(DON.categories, cats.map(function (c) {
        return { id: c.id, code: c.code, name: c.name, kind: c.kind, icon: c.icon || '🪙', description: c.description || '' };
      }));
    }
    var donors = [];
    try { donors = await window.API.get('/donors'); } catch (e) {}
    if (Array.isArray(donors)) {
      swap(DON.donors, donors.map(function (d) {
        return { id: d.id, code: d.code, type: d.type, firstName: d.firstName || '', lastName: d.lastName || '',
                 orgName: d.orgName || '', contactPerson: d.contactPerson || '', devoteeId: devCode(d.devoteeId),
                 mobile: d.mobile || '', pan: d.pan || '', city: d.city || '', state: d.state || 'Gujarat',
                 committee: d.committee || '', notes: d.notes || '', addedDate: d.addedDate || '' };
      }));
    }
    var rows = await window.API.get('/donations');
    if (!Array.isArray(rows)) return;
    swap(DON.donations, rows.map(function (x) {
      return { id: x.id, code: x.code, receiptNo: x.receiptNo || '', certNo: x.certNo || '',
               donorId: x.donorId, categoryId: x.categoryId, mode: x.mode || 'Cash',
               amount: x.amount || 0, item: x.item || '', qty: x.qty || '', valuation: x.valuation || 0,
               date: x.date, purpose: x.purpose || '', committee: x.committee || '',
               status: x.status || 'received', certificateIssued: !!x.certificateIssued,
               notes: x.notes || '', recordedBy: x.recordedBy || '' };
    }));
    if (typeof renderDonations === 'function') renderDonations();
    log('donations: ' + DON.donations.length + ' (' + DON.donors.length + ' donors, ' + DON.categories.length + ' categories)');
  }

  /* ---- Dhaja Pooja ---- */
  async function hydrateDhaja() {
    if (typeof DHAJA === 'undefined') return;
    var camps = [];
    try { camps = await window.API.get('/dhaja/campaigns'); } catch (e) {}
    if (Array.isArray(camps)) {
      var mapped = camps.map(function (c) {
        return { id: c.id, uuid: c.uuid, code: c.code, name: c.name, nameGu: c.nameGu || '',
                 targetCount: c.targetCount || 0, startDate: c.startDate || '', endDate: c.endDate || '',
                 annualEventId: c.annualEventId || null, annualEventCode: c.annualEventCode || null,
                 status: c.status || 'open', notes: c.notes || '',
                 sponsoredCount: c.sponsoredCount || 0, raisedAmount: c.raisedAmount || 0,
                 remaining: c.remaining != null ? c.remaining : null };
      });
      // General Dhaja Pooja (the all-occasions bucket) always sorts first
      var isGen = function (c) { return (typeof dhajaIsGeneral === 'function') && dhajaIsGeneral(c); };
      mapped.sort(function (a, b) { return (isGen(b) ? 1 : 0) - (isGen(a) ? 1 : 0); });
      swap(DHAJA.campaigns, mapped);
    }
    var rows = await window.API.get('/dhaja');
    if (!Array.isArray(rows)) return;
    swap(DHAJA.sponsorships, rows.map(function (x) {
      return { id: x.id, code: x.code, campaignId: x.campaignId, seqNo: x.seqNo,
               devoteeId: devCode(x.devoteeId),
               sponsorName: x.sponsorName || '', sponsorMobile: x.sponsorMobile || '',
               annualEventId: x.annualEventId || null,
               scheduledDate: x.scheduledDate || '', performedDate: x.performedDate || '',
               pledgeAmount: x.pledgeAmount || 0, donationId: x.donationId || '',
               receiptNo: x.receiptNo || '', status: x.status || 'sponsored', notes: x.notes || '' };
    }));
    if (typeof renderDhaja === 'function') renderDhaja();
    log('dhaja: ' + DHAJA.sponsorships.length + ' (' + DHAJA.campaigns.length + ' campaigns)');
  }

  async function refreshViews() {
    try { if (typeof renderDashboard === 'function') renderDashboard(); } catch (e) {}
    try { if (typeof renderUnifiedCalendar === 'function') renderUnifiedCalendar(); } catch (e) {}
    try { if (typeof syncEntitySelects === 'function') syncEntitySelects(); } catch (e) {}
  }

  // one hydrate step per module — used for both the full boot load and the
  // scoped post-save refresh.
  var STEPS = {
    devotees: hydrateDevotees, core: hydrateCore,
    committees: hydrateCommittees, teams: hydrateTeams,
    poojas: hydratePoojas, events: hydrateEvents, visits: hydrateVisits,
    donations: hydrateDonations, dhaja: hydrateDhaja,
  };
  // the full boot load runs `core` (devotees + inventory + expenses); a scoped
  // refresh runs only `devotees`.
  var ALL = ['core', 'committees', 'teams', 'poojas', 'events', 'visits', 'donations', 'dhaja'];

  // run(undefined)        → full boot load (every module + settings)
  // run('dhaja') / run(['poojas','donations']) → just those modules (+ core, so
  //   devCode() stays current for any devotee the save created) + refreshViews.
  // A failure in one step is logged and NEVER aborts the rest.
  async function run(only) {
    if (!window.API || !window.API.online) { log('offline — keeping seed data'); return; }
    var full = only == null;
    var mods = full ? ALL.slice()
      : (Array.isArray(only) ? only : [only]).filter(function (k) { return STEPS[k]; });
    if (!full && !mods.length) { full = true; mods = ALL.slice(); }        // unknown key → be safe
    if (!full && mods.indexOf('devotees') === -1 && mods.indexOf('core') === -1) mods = ['devotees'].concat(mods);

    log(full ? 'full hydrate' : 'refresh [' + mods.join(',') + ']');
    if (full) { try { await hydrateSettings(); } catch (e) { log('settings failed: ' + e.message); } }
    for (var i = 0; i < mods.length; i++) {
      try { await STEPS[mods[i]](); } catch (e) { log(mods[i] + ' failed: ' + e.message); }
    }
    try { await refreshViews(); } catch (e) { log('refreshViews failed: ' + e.message); }
    log('done' + (full ? '' : ' [' + mods.join(',') + ']'));
  }

  // Post-save calls are COALESCED: a save flow that fires several __rehydrate()
  // calls (create + link + link…) collapses into ONE refresh a beat later, so
  // the page never thrashes through a dozen API round-trips per entry. The
  // widest scope requested wins (any full request beats scoped).
  var _timer = null, _wantFull = false, _wantMods = {}, _waiters = [];
  function schedule(only) {
    if (only == null || (typeof only === 'string' && !STEPS[only])) _wantFull = true;
    else (Array.isArray(only) ? only : [only]).forEach(function (k) { if (STEPS[k]) _wantMods[k] = true; });
    if (_timer) clearTimeout(_timer);
    return new Promise(function (resolve) {
      _waiters.push(resolve);
      _timer = setTimeout(function () {
        _timer = null;
        var full = _wantFull, mods = Object.keys(_wantMods), w = _waiters;
        _wantFull = false; _wantMods = {}; _waiters = [];
        run(full ? undefined : mods).then(function () { w.forEach(function (r) { r(); }); },
                                          function () { w.forEach(function (r) { r(); }); });
      }, 200);
    });
  }

  window.__rehydrate = schedule;   // modules: window.__rehydrate('<module>') after a save
  window.__rehydrateNow = run;     // synchronous, un-debounced (rarely needed)

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
