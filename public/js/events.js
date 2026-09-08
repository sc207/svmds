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

  incharges: [],   // in-charge options now come from the shared people picker (js/people-picker.js)

  eventTypes: [],

  events: [],

  activity: []
};

/* ---- helpers ---- */
function evToday() { return (typeof MG !== 'undefined' && MG.today) ? MG.today : EV.today; }
function evNow()   { return (typeof MG !== 'undefined' && MG.nowTime) ? MG.nowTime : '18:30'; }
function evToast(m) { if (typeof showToast === 'function') showToast(m); }

const evTypeById  = id => EV.eventTypes.find(t => t.id === id);
const eventById    = id => EV.events.find(e => e.id === id);
const evInchargeById = id => (typeof personById === 'function' ? personById(id) : null)
  || EV.incharges.find(i => i.id === id)
  || (typeof cmtLeadById === 'function' ? cmtLeadById(id) : null);

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
