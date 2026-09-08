/* ============================================================
   EVENTS MODULE — temple festivals & mahotsavs
   (Poonam Dayro, Sharad Purnima Seva, Navratri Mahotsav, ...)
   Mirrors the Pooja module, leaner. Renders into #eventsRoot.
   ============================================================ */

if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
  window.tData = function (v) { return v == null ? '' : v; };
  window.onLanguageChange = function () {};
}

const EV = {
  view: 'directory',            // 'directory' | 'workspace'
  activeEventId: null,
  activeTab: 'overview',
  editingEventId: null,
  editingTypeId: null,
  calendarMonth: 8,
  calendarYear: 2026,
  today: '2026-09-06',

  accentPalette: [
    { name:'Saffron', hex:'#C96A20' }, { name:'Maroon', hex:'#6B1F2A' },
    { name:'Antique Gold', hex:'#C9A24A' }, { name:'Temple Green', hex:'#4C8B5A' },
    { name:'Deep Plum', hex:'#7A3B62' }, { name:'Indigo', hex:'#3B5C8A' }
  ],

  incharges: [
    { id:'DEV-001', name:'Rajesh Patel',    mobile:'9876500001' },
    { id:'DEV-010', name:'Amit Shah',       mobile:'9876500002' },
    { id:'DEV-011', name:'Kiran Patel',     mobile:'9876500003' },
    { id:'DEV-021', name:'Manjula Ben',     mobile:'9876500022' }
  ],

  eventTypes: [
    { id:'EVT-001', name:'Meldi Mata Poonam Dayro', category:'Mahotsav', icon:'🌕', description:'Full-moon night of bhajan, dayro and Annakut mahaprasad.' },
    { id:'EVT-002', name:'Sharad Purnima Seva',     category:'Seva',     icon:'🥛', description:'Kheer mahaprasad distribution and special aarti.' },
    { id:'EVT-003', name:'Navratri Mahotsav',        category:'Utsav',    icon:'🪭', description:'Nine nights of garba, chandi path havan and daily maha aarti.' },
    { id:'EVT-004', name:'Annakut Mahotsav',         category:'Utsav',    icon:'🍛', description:'56-bhog annakut darshan the day after Diwali.' },
    { id:'EVT-005', name:'Patotsav (Foundation Day)',category:'Utsav',    icon:'🛕', description:'Temple foundation / prana-pratishtha anniversary.' },
    { id:'EVT-006', name:'Dhwaja Aarohan',           category:'Vidhi',    icon:'🚩', description:'Hoisting of the sacred flag on the shikhar.' },
    { id:'EVT-007', name:'Lok Dayro / Santvani',     category:'Cultural', icon:'🎤', description:'Folk devotional programme with invited kalakars.' },
    { id:'EVT-008', name:'Shobha Yatra',             category:'Yatra',    icon:'🛺', description:'Procession of the deity through the town.' },
    { id:'EVT-009', name:'Diwali Chopda Pujan',      category:'Vidhi',    icon:'🪔', description:'Account-book worship on Diwali with the vyapari mandal.' },
    { id:'EVT-010', name:'Holi Dhuleti Utsav',       category:'Utsav',    icon:'🎨', description:'Holika dahan and community dhuleti.' }
  ],

  events: [
    {
      id:'EVN-001', typeId:'EVT-001', name:'Meldi Mata Poonam Dayro — September',
      days:[{ date:'2026-09-15', startTime:'20:00', endTime:'23:59' }],
      venue:'Mahotsav Ground', inChargeId:'DEV-001', expectedFootfall:3000, budget:250000,
      status:'confirmed', color:'#C96A20',
      notes:'Sound & stage by Event crew. Annakut prasad after midnight.', createdDate:'2026-08-20'
    },
    {
      id:'EVN-002', typeId:'EVT-003', name:'Navratri Mahotsav 2026',
      days:[
        { date:'2026-09-22', startTime:'18:30', endTime:'23:59' },
        { date:'2026-09-23', startTime:'18:30', endTime:'23:59' },
        { date:'2026-09-24', startTime:'18:30', endTime:'23:59' },
        { date:'2026-09-25', startTime:'18:30', endTime:'23:59' }
      ],
      venue:'Garbha Mandap & Mahotsav Ground', inChargeId:'DEV-010', expectedFootfall:5000, budget:1200000,
      status:'planning', color:'#7A3B62',
      notes:'Full 9-night plan pending committee approval. Security & parking rosters via Management module.', createdDate:'2026-08-10'
    },
    {
      id:'EVN-003', typeId:'EVT-002', name:'Sharad Purnima Kheer Seva',
      days:[{ date:'2026-10-06', startTime:'19:00', endTime:'22:00' }],
      venue:'Bhojan Shala', inChargeId:'DEV-021', expectedFootfall:1200, budget:90000,
      status:'planning', color:'#C9A24A',
      notes:'Kheer prepared under Prasad Management team.', createdDate:'2026-09-01'
    },
    {
      id:'EVN-004', typeId:'EVT-006', name:'Dhwaja Aarohan — Poonam',
      days:[{ date:'2026-09-06', startTime:'08:00', endTime:'09:30' }],
      venue:'Shikhar', inChargeId:'DEV-001', expectedFootfall:400, budget:15000,
      status:'confirmed', color:'#6B1F2A',
      notes:'Silk dhwaja sponsored by a devotee family.', createdDate:'2026-08-28'
    },
    {
      id:'EVN-005', typeId:'EVT-004', name:'Annakut Mahotsav 2026',
      days:[{ date:'2026-10-21', startTime:'10:00', endTime:'13:00' }],
      venue:'Main Sabha Mandap', inChargeId:'DEV-011', expectedFootfall:2500, budget:400000,
      status:'planning', color:'#C96A20',
      notes:'56-bhog coordination with Marvadi Samaj Committee.', createdDate:'2026-09-02'
    }
  ],

  activity: [
    { eventId:'EVN-001', text:'Poonam Dayro confirmed; stage vendor booked', when:'3 days ago' },
    { eventId:'EVN-002', text:'Navratri Mahotsav draft plan created', when:'1 week ago' },
    { eventId:'EVN-004', text:'Dhwaja Aarohan sponsor confirmed', when:'2 days ago' }
  ]
};

/* ---- helpers ---- */
function evToday() { return (typeof MG !== 'undefined' && MG.today) ? MG.today : EV.today; }
function evNow()   { return (typeof MG !== 'undefined' && MG.nowTime) ? MG.nowTime : '18:30'; }
function evToast(m) { if (typeof showToast === 'function') showToast(m); }

const evTypeById  = id => EV.eventTypes.find(t => t.id === id);
const eventById    = id => EV.events.find(e => e.id === id);
const evInchargeById = id => EV.incharges.find(i => i.id === id) || (typeof cmtLeadById === 'function' ? cmtLeadById(id) : null);

function evDays(ev) {
  return (ev && ev.days ? ev.days.slice() : []).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
function evFirstDay(ev) { return evDays(ev)[0] || null; }
function evLastDay(ev) { const d = evDays(ev); return d[d.length - 1] || null; }
function evTypeName(ev) { const t = evTypeById(ev && ev.typeId); return t ? t.name : (ev && ev.name || '—'); }
function evInchargeName(ev) { const i = evInchargeById(ev && ev.inChargeId); return i ? i.name : 'Unassigned'; }

function evStatus(ev) {
  if (ev.status === 'cancelled') return 'cancelled';
  if (ev.status === 'completed') return 'completed';
  const d = evDays(ev);
  if (!d.length) return ev.status || 'planning';
  const nowKey = evToday() + ' ' + evNow();
  const allPast = d.every(x => (x.date + ' ' + x.endTime) < nowKey);
  if (allPast) return 'completed';
  if (d.some(x => x.date === evToday())) return 'ongoing';
  return ev.status || 'planning';
}
function evStatusLabel(st) { return window.t('ev_st_' + st, st.charAt(0).toUpperCase() + st.slice(1)); }
const EV_STATUS_BADGE = { planning:'badge-pending', confirmed:'badge-confirmed', ongoing:'badge-confirmed', completed:'badge-maroon', cancelled:'badge-cancelled' };
const EV_STATUS_DOT   = { planning:'🟡', confirmed:'🟢', ongoing:'🔴', completed:'🔵', cancelled:'⚪' };

function evShortDate(iso) {
  if (!iso) return '—';
  const p = iso.split('-').map(Number);
  const MS = (typeof MONTHS_SHORT !== 'undefined') ? MONTHS_SHORT : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return p[2] + ' ' + MS[p[1] - 1];
}
function evDateRange(ev) {
  const d = evDays(ev);
  if (!d.length) return window.t('ev_no_date', 'No date');
  if (d.length === 1) return evShortDate(d[0].date);
  return evShortDate(d[0].date) + ' – ' + evShortDate(d[d.length - 1].date);
}
const evActivityOf = id => EV.activity.filter(a => a.eventId === id);
function evLog(id, text) { EV.activity.unshift({ eventId: id, text, when: 'Just now' }); }
function evNextId(prefix, list, pad) {
  let max = 0;
  list.forEach(x => { const n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (!isNaN(n) && n > max) max = n; });
  return prefix + '-' + String(max + 1).padStart(pad, '0');
}
