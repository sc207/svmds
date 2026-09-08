/* ============================================================
   Annual Temple Events — UI section inside the Seva & Pooja directory.
   Year selector + event cards + admin add/edit/pin/disable, and one-click
   "Create Seva/Pooja" and "Create Invitation" from an event.
   ============================================================ */
(function () {
  if (typeof window === 'undefined') return;
  var T = function (k, f) { return (typeof window.t === 'function') ? window.t(k, f) : f; };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isAdmin() { return (typeof isPoojaAdmin === 'function') ? isPoojaAdmin() : true; }
  function toast(m) { if (typeof showToast === 'function') showToast(m); else if (typeof pjToast === 'function') pjToast(m); }

  var SRC_BADGE = {
    pinned:     { cls: 'badge-confirmed', txt: 'ann_src_pinned' },
    fixed:      { cls: 'badge-maroon',    txt: 'ann_src_fixed' },
    calculated: { cls: 'badge-pending',   txt: 'ann_src_calc' }
  };

  /* the section is shown in both Pooja & Seva and Temple Events, and feeds the
     unified calendar — re-render every surface that could be visible. */
  function annualRerender() {
    try { if (typeof annualClearCache === 'function') annualClearCache(); } catch (e) {}
    try { if (typeof renderPooja === 'function') renderPooja(); } catch (e) {}
    try { if (typeof renderEvents === 'function') renderEvents(); } catch (e) {}
    try { if (typeof renderUnifiedCalendar === 'function') renderUnifiedCalendar(); } catch (e) {}
  }
  window.annualRerender = annualRerender;

  /* ---------- the section (returns an HTML string) ---------- */
  window.annualEventsSection = function () {
    var Y = window.ANNUAL.year;
    var years = [];
    for (var y = Y - 2; y <= Y + 6; y++) years.push(y);
    var list = window.annualForYear(Y, isAdmin());

    var cards = list.map(function (ev) {
      var b = SRC_BADGE[ev.dateSource] || SRC_BADGE.calculated;
      var admin = isAdmin();
      return '' +
        '<div class="ann-card' + (ev.active ? '' : ' ann-card--off') + '">' +
          '<div class="ann-card-head">' +
            '<div class="ann-name">' + esc(window.annualName(ev)) + '</div>' +
            (ev.active ? '' : '<span class="badge badge-cancelled">' + esc(T('ann_disabled', 'Disabled')) + '</span>') +
          '</div>' +
          '<div class="ann-activity">' + esc(window.annualActivity(ev)) + '</div>' +
          '<div class="ann-tithi">' + esc(window.annualTithiLabel(ev)) + '</div>' +
          '<div class="ann-greg">' +
            '<span class="ann-greg-date">' + esc(window.annualLocDate(ev.gregorianDate)) + '</span> ' +
            '<span class="badge ' + b.cls + ' ann-greg-src">' + esc(T(b.txt, ev.dateSource)) + '</span>' +
          '</div>' +
          (ev.dateSource === 'calculated' && ev.gregorianDate
            ? '<div class="ann-hint">' + esc(T('ann_verify', 'Calculated — confirm against the temple panchang and pin if needed.')) + '</div>'
            : (!ev.gregorianDate ? '<div class="ann-hint ann-hint--warn">' + esc(T('ann_no_date', 'Could not calculate for this year — pin the correct date.')) + '</div>' : '')) +
          '<div class="ann-card-actions">' +
            '<button class="btn btn-outline mg-btn-xs" onclick="createPoojaFromAnnual(\'' + ev.id + '\', false)">' + esc(T('ann_make_pooja', 'Create Seva/Pooja')) + '</button>' +
            '<button class="btn btn-outline mg-btn-xs" onclick="createPoojaFromAnnual(\'' + ev.id + '\', true)">' + esc(T('ann_make_invite', 'Create Invitation')) + '</button>' +
            (admin ? (
              '<button class="btn btn-outline mg-btn-xs" onclick="pinAnnualDate(\'' + ev.id + '\')">' + esc(T('ann_pin', 'Pin date')) + '</button>' +
              '<button class="btn btn-outline mg-btn-xs" onclick="openAnnualEventForm(\'' + ev.id + '\')">' + esc(T('edit', 'Edit')) + '</button>' +
              '<button class="btn btn-outline mg-btn-xs" onclick="toggleAnnualActive(\'' + ev.id + '\')">' + esc(ev.active ? T('ann_disable', 'Disable') : T('ann_enable', 'Enable')) + '</button>'
            ) : '') +
          '</div>' +
        '</div>';
    }).join('');

    return '' +
      '<div class="card mg-mt ann-section">' +
        '<div class="card-header flex justify-between items-center" style="flex-wrap:wrap;gap:.6rem">' +
          '<div class="card-title">🗓️ ' + esc(T('ann_title', 'Annual Temple Events')) +
            ((typeof currentLang === 'function' && currentLang() === 'gu')
              ? ''
              : ' <span class="mg-muted-xs">' + esc(T('ann_title_gu', 'મંદિરના વાર્ષિક પ્રસંગો')) + '</span>') +
            '</div>' +
          '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">' +
            '<label class="mg-muted-xs" for="annYearSel">' + esc(T('ann_year', 'Year')) + '</label>' +
            '<select id="annYearSel" class="form-select mg-inline-select" onchange="annualSetYear(this.value)">' +
              years.map(function (y) { return '<option value="' + y + '"' + (y === Y ? ' selected' : '') + '>' + y + '</option>'; }).join('') +
            '</select>' +
            (isAdmin() ? '<button class="btn btn-primary mg-btn-xs" onclick="openAnnualEventForm()">+ ' + esc(T('ann_add', 'Add event')) + '</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="card-body"><div class="ann-grid">' + (cards || ('<div class="mg-muted-xs" style="padding:1rem">' + esc(T('ann_none', 'No annual events.')) + '</div>')) + '</div></div>' +
      '</div>';
  };

  window.annualSetYear = function (y) {
    window.ANNUAL.year = parseInt(y, 10) || new Date().getFullYear();
    annualRerender();
  };

  /* ---------- create a Seva/Pooja from an annual event ---------- */
  window.createPoojaFromAnnual = function (id, gotoInvitation) {
    var ev = window.annualEventById(id);
    if (!ev) return;
    var res = window.annualResolve(ev, window.ANNUAL.year);
    if (!res.date) { toast(T('ann_no_date', 'Could not calculate for this year — pin the correct date.')); return; }
    if (typeof POOJA === 'undefined' || !Array.isArray(POOJA.poojas)) { toast('Pooja module not ready'); return; }

    var name = (typeof annualActivity === 'function' ? window.annualActivity(ev) : ev.activity) || window.annualName(ev);
    var accent = '#6B1F2A';
    var newId = (typeof nextId === 'function') ? nextId('PJA', POOJA.poojas, 3) : ('PJA-' + (POOJA.poojas.length + 1));
    var sid = (typeof mintSession === 'function') ? mintSession() : ('PSN-' + Date.now());

    POOJA.poojas.push({
      id: newId, typeId: null, name: name, scheduleMode: 'single',
      defaultVenue: 'Main Sabha Mandap',
      sessions: [{ id: sid, label: window.annualName(ev), date: res.date, startTime: '', endTime: '', venue: 'Main Sabha Mandap' }],
      guestIds: [], sevarthiIds: [], coordinatorIds: [],
      status: null, color: accent, estimatedSevaAmount: 0,
      notes: T('ann_from', 'Created from annual event') + ': ' + window.annualName(ev) + ' (' + window.annualTithiLabel(ev) + ')',
      custom: [{ label: 'Tithi', value: window.annualTithiLabel(ev) }],
      annualEventId: ev.id,
      invitation: {
        template: 'royal', accent: accent, headline: '',
        inviteLine: 'With the divine grace of Maa, you are cordially invited to',
        blessing: 'Your presence will be our blessing. Jai Mataji.',
        showSevarthi: true, showGuests: true, showSchedule: true
      },
      createdDate: (typeof pjToday === 'function') ? pjToday() : res.date
    });
    if (typeof logPoojaActivity === 'function') logPoojaActivity(newId, 'Created from annual event "' + ev.name + '"');

    // best-effort server persist
    if (window.API && window.API.online) {
      window.API.post('/poojas', {
        name: name, scheduleMode: 'single', defaultVenue: 'Main Sabha Mandap',
        sessions: [{ label: ev.name, date: res.date, venue: 'Main Sabha Mandap' }],
        notes: 'From annual event ' + ev.code || ev.id
      }).catch(function () {});
    }

    toast(name + ' — ' + T('ann_created', 'Seva/Pooja created') + '.');
    if (typeof switchPage === 'function') switchPage('puja');
    if (typeof openPooja === 'function') {
      openPooja(newId);
      if (gotoInvitation && typeof setPoojaTab === 'function') setPoojaTab('invitation');
    } else {
      annualRerender();
    }
  };

  /* ---------- pin / unpin the Gregorian date for the selected year ---------- */
  window.pinAnnualDate = function (id) {
    var ev = window.annualEventById(id);
    if (!ev || typeof openSheet !== 'function') return;
    var Y = window.ANNUAL.year;
    var cur = (ev.overrides || {})[String(Y)] || (window.annualResolve(ev, Y).date || '');
    openSheet({
      title: T('ann_pin', 'Pin date') + ' — ' + esc(window.annualName(ev)) + ' · ' + Y,
      body:
        '<p class="mg-page-sub">' + esc(T('ann_pin_help', 'Set the exact Gregorian date for this year from the temple panchang. This overrides the calculation for ' + Y + ' only.')) + '</p>' +
        '<div class="form-group"><label class="form-label">' + esc(T('date', 'Date')) + ' (' + Y + ')</label>' +
        '<input type="date" class="form-input" id="annPinDate" value="' + esc(cur) + '"></div>',
      footer:
        '<button class="btn btn-outline" onclick="closeSheet()">' + esc(T('cancel', 'Cancel')) + '</button>' +
        ((ev.overrides || {})[String(Y)] ? '<button class="btn btn-outline mg-btn-danger" onclick="submitAnnualPin(\'' + id + '\', true)">' + esc(T('ann_unpin', 'Remove pin')) + '</button>' : '') +
        '<button class="btn btn-primary" onclick="submitAnnualPin(\'' + id + '\', false)">' + esc(T('save', 'Save')) + '</button>'
    });
  };
  window.submitAnnualPin = function (id, remove) {
    var ev = window.annualEventById(id); if (!ev) return;
    var Y = String(window.ANNUAL.year);
    var val = remove ? null : ((document.getElementById('annPinDate') || {}).value || '');
    if (!remove && !/^\d{4}-\d{2}-\d{2}$/.test(val)) { toast(T('ann_bad_date', 'Choose a valid date.')); return; }
    ev.overrides = ev.overrides || {};
    if (remove) delete ev.overrides[Y]; else ev.overrides[Y] = val;
    if (window.API && window.API.online) {
      window.API.put('/annual-events/' + id + '/override', { year: Number(Y), date: remove ? null : val }).catch(function () {});
    }
    if (typeof closeSheet === 'function') closeSheet();
    toast(remove ? T('ann_unpinned', 'Pin removed.') : T('ann_pinned', 'Date pinned for ' + Y + '.'));
    annualRerender();
  };

  /* ---------- add / edit an annual event (admin) ---------- */
  window.openAnnualEventForm = function (id) {
    if (typeof openSheet !== 'function') return;
    var ev = id ? window.annualEventById(id) : null;
    var MASA = (window.Panchang && window.Panchang.MASA_KEYS) ||
      ['Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashwin', 'Kartik', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna'];
    var e = ev || { type: 'TITHI', masa: 'Kartik', paksha: 'shukla', tithi: 1, fixedMonth: 9, fixedDay: 27, active: true };
    openSheet({
      title: (ev ? T('edit', 'Edit') : T('ann_add', 'Add event')) + ' — ' + T('ann_title', 'Annual Temple Event'),
      wide: true,
      body:
        '<form id="annForm" class="mg-2col-form">' +
          '<div class="form-group"><label class="form-label">' + esc(T('ann_name_en', 'Name (English) *')) + '</label><input class="form-input" name="name" value="' + esc(e.name || '') + '" required></div>' +
          '<div class="form-group"><label class="form-label">' + esc(T('ann_name_gu', 'Name (Gujarati)')) + '</label><input class="form-input" name="name_gu" value="' + esc(e.name_gu || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">' + esc(T('ann_act_en', 'Activity (English)')) + '</label><input class="form-input" name="activity" value="' + esc(e.activity || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">' + esc(T('ann_act_gu', 'Activity (Gujarati)')) + '</label><input class="form-input" name="activity_gu" value="' + esc(e.activity_gu || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">' + esc(T('ann_type', 'Type')) + '</label>' +
            '<select class="form-select" name="type" onchange="annualFormType(this.value)">' +
              '<option value="TITHI"' + (e.type !== 'FIXED_DATE' ? ' selected' : '') + '>' + esc(T('ann_type_tithi', 'Tithi (Hindu calendar)')) + '</option>' +
              '<option value="FIXED_DATE"' + (e.type === 'FIXED_DATE' ? ' selected' : '') + '>' + esc(T('ann_type_fixed', 'Fixed Gregorian date')) + '</option>' +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">&nbsp;</label>' +
            '<label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="active"' + (e.active !== false ? ' checked' : '') + '> ' + esc(T('ann_active', 'Active')) + '</label></div>' +
          '<div id="annTithiFields" class="mg-2col-form" style="grid-column:1/-1;display:' + (e.type === 'FIXED_DATE' ? 'none' : 'grid') + '">' +
            '<div class="form-group"><label class="form-label">' + esc(T('ann_masa', 'Gujarati month (masa)')) + '</label><select class="form-select" name="masa">' +
              MASA.map(function (m) { return '<option value="' + m + '"' + (m === e.masa ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div>' +
            '<div class="form-group"><label class="form-label">' + esc(T('ann_paksha', 'Paksha')) + '</label><select class="form-select" name="paksha">' +
              '<option value="shukla"' + (e.paksha !== 'krishna' ? ' selected' : '') + '>Sud / Shukla</option>' +
              '<option value="krishna"' + (e.paksha === 'krishna' ? ' selected' : '') + '>Vad / Krishna</option></select></div>' +
            '<div class="form-group"><label class="form-label">' + esc(T('ann_tithi', 'Tithi (1–15)')) + '</label><input type="number" min="1" max="15" class="form-input" name="tithi" value="' + esc(e.tithi || 1) + '"></div>' +
          '</div>' +
          '<div id="annFixedFields" class="mg-2col-form" style="grid-column:1/-1;display:' + (e.type === 'FIXED_DATE' ? 'grid' : 'none') + '">' +
            '<div class="form-group"><label class="form-label">' + esc(T('ann_month', 'Month (1–12)')) + '</label><input type="number" min="1" max="12" class="form-input" name="fixedMonth" value="' + esc(e.fixedMonth || 1) + '"></div>' +
            '<div class="form-group"><label class="form-label">' + esc(T('ann_day', 'Day (1–31)')) + '</label><input type="number" min="1" max="31" class="form-input" name="fixedDay" value="' + esc(e.fixedDay || 1) + '"></div>' +
          '</div>' +
          '<div class="form-group" style="grid-column:1/-1"><label class="form-label">' + esc(T('ann_notes', 'Notes')) + '</label><textarea class="form-input mg-textarea" name="notes">' + esc(e.notes || '') + '</textarea></div>' +
        '</form>',
      footer:
        '<button class="btn btn-outline" onclick="closeSheet()">' + esc(T('cancel', 'Cancel')) + '</button>' +
        '<button class="btn btn-primary" onclick="saveAnnualEvent(' + (ev ? "'" + ev.id + "'" : 'null') + ')">' + esc(T('save', 'Save')) + '</button>'
    });
  };
  window.annualFormType = function (v) {
    var t = document.getElementById('annTithiFields'), f = document.getElementById('annFixedFields');
    if (t) t.style.display = v === 'FIXED_DATE' ? 'none' : 'grid';
    if (f) f.style.display = v === 'FIXED_DATE' ? 'grid' : 'none';
  };
  window.saveAnnualEvent = function (id) {
    var f = document.getElementById('annForm'); if (!f) return;
    var g = function (n) { var el = f.elements[n]; return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
    var body = {
      name: g('name'), name_gu: g('name_gu'), activity: g('activity'), activity_gu: g('activity_gu'),
      type: g('type'), masa: g('masa'), paksha: g('paksha'), tithi: parseInt(g('tithi'), 10) || 0,
      fixedMonth: parseInt(g('fixedMonth'), 10) || 0, fixedDay: parseInt(g('fixedDay'), 10) || 0,
      notes: g('notes'), active: g('active')
    };
    if (!body.name) { toast(T('ann_need_name', 'Name is required.')); return; }

    if (window.API && window.API.online) {
      var p = id ? window.API.patch('/annual-events/' + id, body) : window.API.post('/annual-events', body);
      p.then(function () { return window.annualLoad(); })
        .then(function () { if (typeof closeSheet === 'function') closeSheet(); toast(T('saved', 'Saved.')); annualRerender(); })
        .catch(function (e) { toast((e && e.message) || 'Save failed'); });
      return;
    }
    // demo mode
    if (id) {
      var ev = window.annualEventById(id);
      if (ev) Object.assign(ev, body);
    } else {
      body.id = 'ANE-' + String(window.ANNUAL.events.length + 1).padStart(3, '0');
      body.overrides = {};
      window.ANNUAL.events.push(body);
    }
    if (typeof closeSheet === 'function') closeSheet();
    toast(T('saved', 'Saved.'));
    annualRerender();
  };

  window.toggleAnnualActive = function (id) {
    var ev = window.annualEventById(id); if (!ev) return;
    var next = !ev.active;
    ev.active = next;
    if (window.API && window.API.online) window.API.patch('/annual-events/' + id, { active: next }).catch(function () {});
    toast(next ? T('ann_enabled', 'Event enabled.') : T('ann_disabled_t', 'Event disabled.'));
    annualRerender();
  };

  /* pull from the server on first load when online */
  if (window.API && window.API.online && typeof window.annualLoad === 'function') {
    window.annualLoad().then(function (ok) { if (ok) annualRerender(); });
  }
})();
