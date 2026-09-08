/* ============================================================
   POOJA APP MODULE — 36 Pooja Master Catalog + Pooja Events
   Shri Vihat Meldi Mata Mandir
   ------------------------------------------------------------
   Architecture (mirrors the Management module):
     Admin manages the Pooja Type catalog -> creates a Pooja
     (single dated event OR multi-session) -> records Sevarthi
     devotee(s) who sponsor & run it -> assigns Coordinator(s)
     who then see only their poojas -> generates a printable
     Invitation Card -> everything on a shared Calendar.
   Reuses management.js globals directly (esc, jsq, nextId,
   fmtDate, fmtTime, MONTHS, MONTHS_SHORT, kpiCard, emptyState,
   openSheet, openConfirm, downloadCSV, copyText, showToast).
   ============================================================ */

/* ------------------------------------------------------------
   1. MASTER DATA STORE
   ------------------------------------------------------------ */
const POOJA = {
  /* Session / permission context --------------------------- */
  session: { role: 'admin', userId: 'DEV-001', userName: 'Administrator' }, // 'admin' | 'coordinator'

  /* Router state ------------------------------------------- */
  view: 'directory',        // 'directory' | 'workspace'
  dirView: 'cards',         // 'cards' | 'table' — directory list mode
  activePoojaId: null,
  activeTab: 'overview',
  activeSevarthiId: null,
  editingPoojaId: null,
  editingSevarthiId: null,
  editingTypeId: null,
  editingGuestId: null,
  calendarMonth: 8,         // 0-indexed. 8 = September
  calendarYear: 2026,

  /* Demo clock fallback — pjToday()/pjNow() defer to MG.today */
  today: '2026-09-06',
  nowTime: '18:30',

  /* Card / calendar accent palette ------------------------ */
  accentPalette: [
    { name: 'Royal Maroon', hex: '#6B1F2A' },
    { name: 'Saffron',      hex: '#C96A20' },
    { name: 'Antique Gold', hex: '#C9A24A' },
    { name: 'Temple Green', hex: '#4C8B5A' },
    { name: 'Deep Plum',    hex: '#7A3B62' },
    { name: 'Indigo',       hex: '#3B5C8A' }
  ],

  /* --- Pooja Type master catalog (grows toward 36) -------- */
  poojaTypes: [
    { id:'PTY-001', name:'Vihat Meldi Mata Vishesh Havan', category:'Special Havan', description:'Principal havan invoking Maa Vihat Meldi with 108 aahutis.', defaultDurationMin:60,  suggestedOfferings:'Ghee, samidha, black sesame, kumkum, coconut', icon:'🔥' },
    { id:'PTY-002', name:'Maha Aarti & Deepotsav',         category:'Daily Ritual',  description:'Grand aarti with rows of lit diyas across the mandap.',    defaultDurationMin:30,  suggestedOfferings:'Ghee diyas, cotton wicks, camphor, flowers', icon:'🪔' },
    { id:'PTY-003', name:'Rudrabhishek Seva',              category:'Abhishek',      description:'Abhishek of the shivling with panchamrit and mantras.',   defaultDurationMin:45,  suggestedOfferings:'Milk, curd, honey, ghee, sugar, bilva leaves', icon:'💧' },
    { id:'PTY-004', name:'Navgraha Shanti Pooja',          category:'Shanti Pooja',  description:'Propitiation of the nine planets for peace and relief.',  defaultDurationMin:90,  suggestedOfferings:'Nine grains, nine cloths, ghee, havan samagri', icon:'🪐' },
    { id:'PTY-005', name:'Chandi Path & Archana',          category:'Path',          description:'Recitation of Durga Saptashati with archana.',            defaultDurationMin:120, suggestedOfferings:'Red flowers, chunri, kumkum, coconut, ghee lamp', icon:'📿' },
    { id:'PTY-006', name:'Shat Chandi Mahayagna',          category:'Special Yagna', description:'Hundred-fold Chandi recitation with mahayagna.',          defaultDurationMin:180, suggestedOfferings:'Large havan kund, ghee, dry fruits, 100 chunris', icon:'🕉️' },
    { id:'PTY-007', name:'Gau Seva & Grass Donation',      category:'Seva',          description:'Feeding and honouring the temple cows.',                  defaultDurationMin:15,  suggestedOfferings:'Green fodder, jaggery, wheat flour balls', icon:'🐄' },
    { id:'PTY-008', name:'Annadan Mahaprasad Seva',        category:'Prasad',        description:'Community meal offered as prasad to all devotees.',       defaultDurationMin:60,  suggestedOfferings:'Rice, dal, ghee, vegetables, sweets', icon:'🍲' },
    { id:'PTY-009', name:'Vihat Maa Moorti Sthapan Pooja', category:'Sthapana',      description:'Consecration & installation of the Maa Vihat idol.',      defaultDurationMin:150, suggestedOfferings:'Panchratna, navdhanya, kalash, chunri, gold thread', icon:'🛕' },
    { id:'PTY-010', name:'Kalash Sthapana',                category:'Sthapana',      description:'Establishment of the sacred kalash to begin an anushthan.', defaultDurationMin:45, suggestedOfferings:'Copper kalash, mango leaves, coconut, raw rice, thread', icon:'⚱️' },
    { id:'PTY-011', name:'Prana Pratishtha',               category:'Sthapana',      description:'Rite of infusing divine life-force into the deity.',      defaultDurationMin:120, suggestedOfferings:'Netravali, madhuparka, panchamrit, new vastra', icon:'✨' },
    { id:'PTY-012', name:'Yagna / Havan',                  category:'Havan',         description:'General fire ceremony with sankalp and purnahuti.',       defaultDurationMin:75,  suggestedOfferings:'Havan samagri, ghee, samidha, coconut', icon:'🔥' },
    { id:'PTY-013', name:'Abhishek Seva',                  category:'Abhishek',      description:'Ceremonial bathing of Maa with sacred substances.',       defaultDurationMin:40,  suggestedOfferings:'Milk, panchamrit, gangajal, rose water, chandan', icon:'💧' },
    { id:'PTY-014', name:'Annakut Darshan',               category:'Utsav',         description:'Mountain of food offered and displayed before Maa.',      defaultDurationMin:90,  suggestedOfferings:'56 bhog items, sweets, farsan, fruits', icon:'🍛' },
    { id:'PTY-015', name:'Mata Chowki / Dayro',            category:'Utsav',         description:'Devotional night of bhajan, garba and dayro.',            defaultDurationMin:240, suggestedOfferings:'Sound system, harmonium, prasad, chunri', icon:'🎶' },
    { id:'PTY-016', name:'Dhwaja Aarohan',                 category:'Utsav',         description:'Hoisting of the sacred flag atop the shikhar.',           defaultDurationMin:30,  suggestedOfferings:'Silk dhwaja, kalash, coconut, garland', icon:'🚩' }
  ],

  /* --- Pooja events (the thing admin creates & opens) ----- */
  poojas: [
    {
      id:'PJA-001', typeId:'PTY-009', name:'Vihat Maa Moorti Sthapan Pooja',
      scheduleMode:'multi', defaultVenue:'Main Sabha Mandap',
      sessions:[
        { id:'PSN-001', label:'Adhivas & Kalash Sthapana', date:'2026-09-15', startTime:'08:30', endTime:'12:00', venue:'Yagna Shala' },
        { id:'PSN-002', label:'Navgraha & Panchang Pooja', date:'2026-09-18', startTime:'09:00', endTime:'12:30', venue:'Yagna Shala' },
        { id:'PSN-003', label:'Moorti Sthapan & Prana Pratishtha', date:'2026-09-22', startTime:'07:30', endTime:'13:30', venue:'Main Sabha Mandap' }
      ],
      guestIds:['GST-001','GST-002'],
      sevarthiIds:['SEV-001','SEV-002'], coordinatorIds:['DEV-010'],
      status:'planned', color:'#6B1F2A', estimatedSevaAmount:251000,
      notes:'Sevarthi parivar is funding idol carving and all samagri. Coordinate carving delivery by 12 Sept.',
      custom:[ { label:'Muhurat', value:'Abhijit Muhurat, 11:48 AM (22 Sept)' }, { label:'Idol Height', value:'42 inches, white marble' } ],
      invitation:{ template:'royal', accent:'#6B1F2A', headline:'',
        inviteLine:'',
        blessing:'',
        showSevarthi:true, showGuests:true, showSchedule:true },
      createdDate:'2026-08-28'
    },
    {
      id:'PJA-002', typeId:'PTY-010', name:'Sharadiya Navratri Kalash Sthapana',
      scheduleMode:'single', defaultVenue:'Garbha Mandap',
      sessions:[ { id:'PSN-004', label:'Kalash Sthapana', date:'2026-09-06', startTime:'06:30', endTime:'08:30', venue:'Garbha Mandap' } ],
      guestIds:['GST-003'],
      sevarthiIds:['SEV-003'], coordinatorIds:['DEV-010'],
      status:'planned', color:'#C96A20', estimatedSevaAmount:21000,
      notes:'Opens the nine-night Navratri anushthan.',
      custom:[],
      invitation:{ template:'festival', accent:'#C96A20', headline:'',
        inviteLine:'',
        blessing:'',
        showSevarthi:true, showGuests:false, showSchedule:false },
      createdDate:'2026-08-20'
    },
    {
      id:'PJA-003', typeId:'PTY-006', name:'Shat Chandi Mahayagna',
      scheduleMode:'single', defaultVenue:'Yagna Shala',
      sessions:[ { id:'PSN-005', label:'Mahayagna & Purnahuti', date:'2026-09-02', startTime:'07:00', endTime:'12:30', venue:'Yagna Shala' } ],
      guestIds:['GST-004'],
      sevarthiIds:['SEV-004'], coordinatorIds:['DEV-011'],
      status:'planned', color:'#7A3B62', estimatedSevaAmount:151000,
      notes:'Completed. Purnahuti done at 12:10 PM.',
      custom:[ { label:'Aahuti Count', value:'1,08,000' } ],
      invitation:{ template:'royal', accent:'#7A3B62', headline:'',
        inviteLine:'',
        blessing:'',
        showSevarthi:true, showGuests:true, showSchedule:false },
      createdDate:'2026-08-10'
    },
    {
      id:'PJA-004', typeId:'PTY-014', name:'Annakut Mahotsav Darshan',
      scheduleMode:'single', defaultVenue:'Main Sabha Mandap',
      sessions:[ { id:'PSN-006', label:'Annakut Darshan', date:'2026-10-02', startTime:'10:00', endTime:'13:00', venue:'Main Sabha Mandap' } ],
      guestIds:[],
      sevarthiIds:['SEV-005'], coordinatorIds:['DEV-010'],
      status:'planned', color:'#C9A24A', estimatedSevaAmount:75000,
      notes:'56 bhog to be arranged with Bhojan Shala team.',
      custom:[],
      invitation:{ template:'cream', accent:'#C9A24A', headline:'',
        inviteLine:'',
        blessing:'',
        showSevarthi:true, showGuests:false, showSchedule:false },
      createdDate:'2026-09-01'
    },
    {
      id:'PJA-005', typeId:'PTY-003', name:'Shravan Rudrabhishek Seva',
      scheduleMode:'single', defaultVenue:'Shiv Mandir',
      sessions:[ { id:'PSN-007', label:'Rudrabhishek', date:'2026-09-08', startTime:'07:00', endTime:'08:30', venue:'Shiv Mandir' } ],
      guestIds:[],
      sevarthiIds:['SEV-006'], coordinatorIds:[],
      status:'planned', color:'#3B5C8A', estimatedSevaAmount:11000,
      notes:'',
      custom:[],
      invitation:{ template:'cream', accent:'#3B5C8A', headline:'',
        inviteLine:'',
        blessing:'',
        showSevarthi:true, showGuests:false, showSchedule:false },
      createdDate:'2026-09-01'
    },
    {
      id:'PJA-006', typeId:'PTY-005', name:'Poonam Chandi Path & Archana',
      scheduleMode:'single', defaultVenue:'Main Sabha Mandap',
      sessions:[ { id:'PSN-008', label:'Chandi Path', date:'2026-09-28', startTime:'16:00', endTime:'18:00', venue:'Main Sabha Mandap' } ],
      guestIds:['GST-005'],
      sevarthiIds:[], coordinatorIds:[],
      status:'planned', color:'#4C8B5A', estimatedSevaAmount:0,
      notes:'Sevarthi still to be confirmed.',
      custom:[],
      invitation:{ template:'royal', accent:'#4C8B5A', headline:'',
        inviteLine:'',
        blessing:'',
        showSevarthi:false, showGuests:true, showSchedule:false },
      createdDate:'2026-09-03'
    },
    {
      id:'PJA-007', typeId:'PTY-002', name:'Sandhya Deepmala Maha Aarti',
      scheduleMode:'single', defaultVenue:'Main Sabha Mandap',
      sessions:[ { id:'PSN-009', label:'Deepmala Aarti', date:'2026-09-06', startTime:'19:15', endTime:'20:30', venue:'Main Sabha Mandap' } ],
      guestIds:[],
      sevarthiIds:['SEV-003'], coordinatorIds:['DEV-011'],
      status:'planned', color:'#C9A24A', estimatedSevaAmount:5100,
      notes:'Lamp-lighting seva this evening. 251 diyas arranged.',
      custom:[ { label:'Diya Count', value:'251' } ],
      invitation:{ template:'festival', accent:'#C9A24A', headline:'',
        inviteLine:'',
        blessing:'',
        showSevarthi:true, showGuests:false, showSchedule:false },
      createdDate:'2026-09-06'
    }
  ],

  /* --- Sevarthi devotee records (module-local) ------------ */
  sevarthis: [
    { id:'SEV-001', devoteeId:'DEV-201', firstName:'Hasmukhbhai', lastName:'Prajapati', mobile:'9825011001', city:'Sanand',    state:'Gujarat', committee:'General Committee', status:'active',   notes:'Sponsoring idol carving; runs the sthapana operations personally.', addedDate:'2026-08-25' },
    { id:'SEV-002', devoteeId:'DEV-202', firstName:'Rekhaben',    lastName:'Prajapati', mobile:'9825011002', city:'Sanand',    state:'Gujarat', committee:'General Committee', status:'active',   notes:'Co-sevarthi with Hasmukhbhai (family).', addedDate:'2026-08-25' },
    { id:'SEV-003', devoteeId:'DEV-203', firstName:'Dineshbhai',  lastName:'Rabari',    mobile:'9825011003', city:'Bavla',     state:'Gujarat', committee:'Rabari Samaj',      status:'active',   notes:'Navratri kalash sthapana sevarthi.', addedDate:'2026-08-18' },
    { id:'SEV-004', devoteeId:'DEV-204', firstName:'Manishbhai',  lastName:'Soni',      mobile:'9825011004', city:'Ahmedabad', state:'Gujarat', committee:'Marvadi Samaj',     status:'active',   notes:'Funded full Shat Chandi Mahayagna.', addedDate:'2026-08-05' },
    { id:'SEV-005', devoteeId:'DEV-205', firstName:'Jayeshbhai',  lastName:'Patel',     mobile:'9825011005', city:'Viramgam',  state:'Gujarat', committee:'General Committee', status:'active',   notes:'Annakut bhog sevarthi.', addedDate:'2026-08-30' },
    { id:'SEV-006', devoteeId:'DEV-206', firstName:'Alkaben',     lastName:'Joshi',     mobile:'9825011006', city:'Sanand',    state:'Gujarat', committee:'General Committee', status:'inactive', notes:'Shravan Rudrabhishek sevarthi. Currently travelling.', addedDate:'2026-08-29' }
  ],

  /* --- Coordinator pool (grantable authorized members) ---- */
  coordinators: [
    { id:'DEV-001', name:'Rajesh Patel', mobile:'9876500001', city:'Sanand' },
    { id:'DEV-010', name:'Amit Shah',    mobile:'9876500002', city:'Ahmedabad' },
    { id:'DEV-011', name:'Kiran Patel',  mobile:'9876500003', city:'Sanand' }
  ],

  /* --- Guests & Pandits registry (shared across poojas) --- */
  people: [
    { id:'GST-001', firstName:'Rameshbhai',   lastName:'Joshi',   role:'Pandit',             mobile:'9825022001', city:'Sanand',    state:'Gujarat', notes:'Chief priest. Performs all sthapana and havan rituals.' },
    { id:'GST-002', firstName:'Bhupendrabhai', lastName:'Patel',  role:'Trust President',     mobile:'9825022002', city:'Sanand',    state:'Gujarat', notes:'' },
    { id:'GST-003', firstName:'Kailashben',   lastName:'Rabari',  role:'Mahila Mandal Head',  mobile:'9825022003', city:'Bavla',     state:'Gujarat', notes:'Leads the ladies volunteer group.' },
    { id:'GST-004', firstName:'Dixitji',      lastName:'Vyas',    role:'Yagna Acharya',       mobile:'9825022004', city:'Ahmedabad', state:'Gujarat', notes:'Specialist for Shat Chandi Mahayagna.' },
    { id:'GST-005', firstName:'Nileshbhai',   lastName:'Trivedi', role:'Path Acharya',        mobile:'9825022005', city:'Viramgam',  state:'Gujarat', notes:'Chandi Path recitation.' }
  ],

  /* --- Per-pooja activity log ----------------------------- */
  activity: [
    { poojaId:'PJA-001', text:'Pooja created and assigned to Amit Shah', when:'9 days ago' },
    { poojaId:'PJA-001', text:'Sevarthi Hasmukhbhai Prajapati added', when:'9 days ago' },
    { poojaId:'PJA-001', text:'Sevarthi Rekhaben Prajapati linked (same family)', when:'9 days ago' },
    { poojaId:'PJA-001', text:'Session "Moorti Sthapan & Prana Pratishtha" scheduled for 22 Sep', when:'6 days ago' },
    { poojaId:'PJA-002', text:'Navratri Kalash Sthapana created', when:'Today' },
    { poojaId:'PJA-003', text:'Shat Chandi Mahayagna marked complete', when:'4 days ago' }
  ]
};

/* ------------------------------------------------------------
   2. HELPERS  (unique names — reuses management.js globals)
   ------------------------------------------------------------ */

/* Resilience: if i18n.js somehow did not load, fall back to English. */
if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
  window.tData = function (v) { return v == null ? '' : v; };
  window.tField = function (o, f) { return o && o[f] != null ? o[f] : ''; };
  window.onLanguageChange = function () {};
}

/* Demo-clock accessors — one source of truth with the Management module */
function pjToday() { return (typeof MG !== 'undefined' && MG.today) ? MG.today : POOJA.today; }
function pjNow()   { return (typeof MG !== 'undefined' && MG.nowTime) ? MG.nowTime : POOJA.nowTime; }

function pjToast(msg) { if (typeof showToast === 'function') showToast(msg); }

const poojaById    = id => POOJA.poojas.find(p => p.id === id);
const typeById     = id => POOJA.poojaTypes.find(t => t.id === id);
const sevarthiById = id => POOJA.sevarthis.find(s => s.id === id);
const personById   = id => POOJA.people.find(x => x.id === id);

function sevarthisOf(p) {
  if (!p) return [];
  return (p.sevarthiIds || []).map(sevarthiById).filter(Boolean);
}

/** Guests & Pandits attached to a pooja (from the shared registry). */
function peopleOf(p) {
  if (!p) return [];
  return (p.guestIds || []).map(personById).filter(Boolean);
}
function personName(x) { return x ? (x.firstName + ' ' + (x.lastName || '')).trim() : 'Unknown'; }

/** Coordinator lookup — pool first, then fall back to Management leads. */
function coordinatorById(id) {
  return POOJA.coordinators.find(c => c.id === id)
      || (typeof leadById === 'function' ? leadById(id) : null)
      || null;
}

/** Everyone who may be granted access to a pooja. */
function coordinatorPool() {
  const seen = {};
  const out = [];
  POOJA.coordinators.forEach(c => { seen[c.id] = true; out.push(c); });
  if (typeof MG !== 'undefined' && Array.isArray(MG.leads)) {
    MG.leads.forEach(l => { if (!seen[l.id]) { seen[l.id] = true; out.push({ id:l.id, name:l.name, mobile:l.mobile, city:l.city }); } });
  }
  return out;
}

function coordinatorNames(p) {
  const names = (p.coordinatorIds || []).map(id => (coordinatorById(id) || {}).name).filter(Boolean);
  return names.length ? names.join(', ') : 'Unassigned';
}

function poojasOfCoordinator(userId) {
  return POOJA.poojas.filter(p => (p.coordinatorIds || []).indexOf(userId) !== -1);
}

const isPoojaAdmin = () => POOJA.session.role === 'admin';

function visiblePoojas() {
  if (isPoojaAdmin()) return POOJA.poojas;
  return poojasOfCoordinator(POOJA.session.userId);
}
function canOpenPooja(id) {
  return visiblePoojas().some(p => p.id === id);
}

/* Sessions -------------------------------------------------- */
function poojaSessions(p) {
  return (p && p.sessions ? p.sessions.slice() : [])
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
function firstSession(p) { return poojaSessions(p)[0] || null; }
function lastSession(p) {
  const s = poojaSessions(p);
  return s[s.length - 1] || null;
}
function nextSession(p) {
  const nowKey = pjToday() + ' ' + pjNow();
  const upcoming = poojaSessions(p).filter(s => (s.date + ' ' + s.endTime) >= nowKey);
  return upcoming[0] || lastSession(p);
}
function sessionIsPast(s) {
  return (s.date + ' ' + s.endTime) < (pjToday() + ' ' + pjNow());
}

/**
 * Pooja status. Explicit overrides (set by admin / coordinator) win:
 *   'done'      — marked complete (even ahead of the date)
 *   'extended'  — running longer / into another day (p.extendedUntil holds the new date)
 *   'cancelled'
 * Otherwise it is derived from the session dates against the demo clock:
 *   'today'     — a session is on today's date
 *   'completed' — every session has finished
 *   'planned'   — still upcoming
 */
function poojaStatus(p) {
  if (p.status === 'cancelled') return 'cancelled';
  if (p.status === 'extended')  return 'extended';
  if (p.status === 'done')      return 'done';
  const list = poojaSessions(p);
  if (!list.length) return 'planned';
  if (list.every(sessionIsPast)) return 'completed';
  if (list.some(s => s.date === pjToday())) return 'today';
  return 'planned';
}
const POOJA_STATUS_LABEL = { planned:'Upcoming', today:'Happening Today', completed:'Completed', done:'Completed', extended:'Extended', cancelled:'Cancelled' };
const POOJA_STATUS_BADGE = { planned:'badge-pending', today:'badge-confirmed', completed:'badge-maroon', done:'badge-maroon', extended:'badge-pending', cancelled:'badge-cancelled' };
const POOJA_STATUS_DOT   = { planned:'🗓️', today:'🟢', completed:'✅', done:'✅', extended:'⏩', cancelled:'⚪' };

/** Localised status label ('done' collapses to 'completed' for display). */
function poojaStatusLabel(st) {
  const key = st === 'done' ? 'completed' : st;
  return (typeof window !== 'undefined' && typeof window.t === 'function')
    ? window.t('pj_st_' + key, POOJA_STATUS_LABEL[st])
    : POOJA_STATUS_LABEL[st];
}

/** True once a pooja counts as finished (auto-completed or explicitly marked done). */
function isPoojaComplete(p) {
  const s = poojaStatus(p);
  return s === 'completed' || s === 'done';
}
/** Friendly one-liner under the status badge. */
function poojaStatusHint(p) {
  const s = poojaStatus(p);
  if (s === 'cancelled') return 'This pooja has been cancelled.';
  if (s === 'extended')  return p.extendedUntil ? ('Extended to ' + fmtDate(p.extendedUntil)) : 'Extended — still in progress.';
  if (s === 'done')      return 'Marked complete' + (p.completedOn ? (' on ' + fmtDate(p.completedOn)) : '') + '.';
  if (s === 'completed') return 'All sessions have finished.';
  if (s === 'today')     return 'A session is scheduled for today.';
  const nx = nextSession(p);
  return nx ? ('Next session ' + fmtDate(nx.date) + ' at ' + fmtTime(nx.startTime) + '.') : 'No date scheduled yet.';
}

function pjShortDate(iso) {
  if (!iso) return '—';
  const parts = iso.split('-').map(Number);
  return parts[2] + ' ' + MONTHS_SHORT[parts[1] - 1];
}
function dateRangeText(p) {
  const list = poojaSessions(p);
  if (!list.length) return 'No date set';
  if (list.length === 1) return pjShortDate(list[0].date);
  return pjShortDate(list[0].date) + ' – ' + pjShortDate(list[list.length - 1].date);
}

/** Long, formal date for invitation cards: "Sunday, 15 September 2026". */
function fmtDateLong(iso) {
  if (!iso) return '—';
  const parts = iso.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(d.getTime())) return (typeof fmtDate === 'function') ? fmtDate(iso) : iso;
  try {
    return d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  } catch (e) {
    return (typeof fmtDate === 'function') ? fmtDate(iso) : iso;
  }
}

/* Activity ------------------------------------------------- */
function logPoojaActivity(poojaId, text) {
  POOJA.activity.unshift({ poojaId, text, when: 'Just now' });
}
const activityOfPooja = poojaId => POOJA.activity.filter(a => a.poojaId === poojaId);

function typeCatalogCount() { return POOJA.poojaTypes.length; }

/** Every day a pooja touches, as ISO strings (for calendar plotting). */
function poojaSessionEntries(monthKey) {
  const out = [];
  visiblePoojas().forEach(p => {
    poojaSessions(p).forEach(s => {
      if (!monthKey || s.date.indexOf(monthKey) === 0) out.push({ pooja: p, session: s });
    });
  });
  return out;
}
