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
  dirSort: 'date-asc',      // 'date-asc' | 'date-desc' — directory order by nearest session date
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
  poojaTypes: [],

  /* --- Pooja events (the thing admin creates & opens) ----- */
  poojas: [],

  /* --- Sevarthi devotee records (module-local) ------------ */
  sevarthis: [],

  /* --- Coordinator pool (grantable authorized members) ---- */
  coordinators: [],

  /* --- Guests registry (shared across poojas) --- */
  people: [],

  /* --- Per-pooja activity log ----------------------------- */
  activity: []
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
const pjGuestById   = id => POOJA.people.find(x => x.id === id);

function sevarthisOf(p) {
  if (!p) return [];
  return (p.sevarthiIds || []).map(sevarthiById).filter(Boolean);
}

/** Guests attached to a pooja (from the shared registry). */
function peopleOf(p) {
  if (!p) return [];
  return (p.guestIds || []).map(pjGuestById).filter(Boolean);
}
function personName(x) { return x ? (x.firstName + ' ' + (x.lastName || '')).trim() : 'Unknown'; }

/** Coordinator lookup — the shared people picker, then the local pool. */
function coordinatorById(id) {
  return (typeof personById === 'function' ? personById(id) : null)
      || POOJA.coordinators.find(c => c.id === id)
      || (typeof leadById === 'function' ? leadById(id) : null)
      || null;
}

/** Everyone who may be granted access to a pooja — real people from the
    shared picker (devotees / committee / management members), plus any
    locally-added pool entries. */
function coordinatorPool() {
  const seen = {};
  const out = [];
  if (typeof templePeople === 'function') {
    templePeople().forEach(p => { seen[p.id] = true; out.push(p); });
  }
  (POOJA.coordinators || []).forEach(c => { if (!seen[c.id]) { seen[c.id] = true; out.push(c); } });
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
