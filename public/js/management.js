/* ============================================================
   MANAGEMENT APP MODULE — Multi-Team Operational Platform
   Shri Vihat Meldi Mata Mandir
   ------------------------------------------------------------
   Architecture:
     Admin creates Management -> assigns Lead -> Lead manages
     only that Management -> Volunteers -> Schedules ->
     Attendance -> Badges / Calendar / Monthly Reports
   No management type is hard-coded. All behaviour is generic.
   ============================================================ */

/* Fallback stubs if i18n.js somehow isn't loaded (legacy harnesses) */
if (typeof window !== 'undefined') {
  if (typeof window.t !== 'function') window.t = function (k, f) { return f != null ? f : k; };
  if (typeof window.tData !== 'function') window.tData = function (v) { return v == null ? '' : v; };
  if (typeof window.locMonthYear !== 'function') window.locMonthYear = function (y, mo) { return (y || '') + '-' + ((mo || 0) + 1); };
  if (typeof window.locDate !== 'function') window.locDate = function (v) { return String(v || ''); };
  if (typeof window.locTime !== 'function') window.locTime = function (v) { return String(v || ''); };
  if (typeof window.locNum !== 'function') window.locNum = function (n) { return String(n || 0); };
  if (typeof window.locDowShort !== 'function') window.locDowShort = function () { return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; };
}

/* ------------------------------------------------------------
   1. MASTER DATA STORE
   ------------------------------------------------------------ */
const MG = {
  /* Session / permission context ------------------------------ */
  session: {
    role: 'admin',          // 'admin' | 'lead'
    userId: 'DEV-001',      // devotee id of logged-in person
    userName: 'Administrator'
  },

  /* Router state --------------------------------------------- */
  view: 'directory',        // 'directory' | 'workspace'
  activeMgmtId: null,
  activeTab: 'overview',
  activeSessionId: null,    // volunteering session open for attendance
  activeMemberId: null,     // volunteer profile open
  calendarMonth: 8,         // 0-indexed. 8 = September
  calendarYear: 2026,
  reportMonth: '2026-09',
  editingMemberId: null,
  editingMgmtId: null,
  editingSessionId: null,
  editingDraftId: null,
  badgeSelection: [],

  /* Demo "today" so statuses are deterministic in the prototype */
  today: '2026-09-06',
  nowTime: '18:30',

  /* --- Colour palette available for managements ------------- */
  palette: [
    { name: 'Maroon',      hex: '#6B1F2A' },
    { name: 'Saffron',     hex: '#C96A20' },
    { name: 'Antique Gold',hex: '#C9A24A' },
    { name: 'Temple Green',hex: '#4C8B5A' },
    { name: 'Indigo Blue', hex: '#3B5C8A' },
    { name: 'Dark Brown',  hex: '#5A4029' },
    { name: 'Deep Plum',   hex: '#7A3B62' },
    { name: 'Teal',        hex: '#2F7A72' }
  ],

  /* --- Leads (devotee records that can lead a management) --- */
  leads: [],

  /* --- Managements ------------------------------------------ */
  managements: [
    {
      id: 'MGMT-001', name: 'VIP Guest Management', leadId: '',
      description: 'Responsible for welcoming and assisting VIP guests during darshan and events.',
      color: '#6B1F2A', expectedTeamSize: 0, status: 'active',
      createdDate: '', notes: ''
    },
    {
      id: 'MGMT-002', name: 'Parking Management', leadId: '',
      description: 'Vehicle routing, parking lot allocation and crowd traffic control.',
      color: '#3B5C8A', expectedTeamSize: 0, status: 'active',
      createdDate: '', notes: ''
    },
    {
      id: 'MGMT-003', name: 'Prasad Management', leadId: '',
      description: 'Prasad preparation, packing and orderly distribution at Bhojan Shala.',
      color: '#4C8B5A', expectedTeamSize: 0, status: 'active',
      createdDate: '', notes: ''
    }
  ],

  /* --- Management members ----------------------------------------
     devoteeId links to the central person record, so the SAME
     devotee can appear in several managements without duplication. */
  members: [],

  /* --- Volunteering sessions -------------------------------- */
  volunteering: [],

  /* --- Attendance (kept separate from sessions) ------------- */
  attendance: [],

  /* --- WhatsApp group / broadcast per management ------------ */
  communication: [],

  /* --- Message drafts -------------------------------------- */
  drafts: [],

  /* --- Activity log ---------------------------------------- */
  activity: []
};

/* Working-date override — the shared demo clock (MG.today / MG.nowTime) is the
   single source of "now" for every module. A value saved from Settings is
   applied here at load time, before any module renders, so all date-derived
   state (pooja/event status, "today" highlights, upcoming counts, monthly
   reports) is computed against the chosen date. */
try {
  const _clk = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem('svmmm_clock')) || 'null');
  if (_clk && /^\d{4}-\d{2}-\d{2}$/.test(_clk.date)) {
    MG.today = _clk.date;
    if (/^\d{2}:\d{2}$/.test(_clk.time || '')) MG.nowTime = _clk.time;
  }
} catch (e) {}

/* ------------------------------------------------------------
   2. HELPERS
   ------------------------------------------------------------ */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/** escape for use inside a single-quoted inline JS attribute */
const jsq = s => esc(String(s == null ? '' : s)).replace(/\\/g,'\\\\').replace(/&#39;/g,"\\&#39;");

const mgmtById   = id => MG.managements.find(m => m.id === id);
const memberById = id => MG.members.find(m => m.id === id);
const leadById   = id => (typeof personById === 'function' ? personById(id) : null) || MG.leads.find(l => l.id === id);
const commById   = id => MG.communication.find(c => c.managementId === id);
const sessionById= id => MG.volunteering.find(v => v.id === id);

const membersOf = mgmtId => MG.members.filter(m => m.managementId === mgmtId);
const activeMembersOf = mgmtId => membersOf(mgmtId).filter(m => m.status === 'active');
const sessionsOf = mgmtId => MG.volunteering.filter(v => v.managementId === mgmtId)
  .slice().sort((a,b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
const draftsOf = mgmtId => MG.drafts.filter(d => d.managementId === mgmtId);
const activityOf = mgmtId => MG.activity.filter(a => a.managementId === mgmtId);

const memberName = m => m ? `${m.firstName} ${m.lastName}` : 'Unknown';
const leadName = mgmtId => {
  const m = mgmtById(mgmtId);
  const l = m ? leadById(m.leadId) : null;
  return l ? l.name : 'Unassigned';
};

/** Managements the current session may open. */
function visibleManagements() {
  if (MG.session.role === 'admin') return MG.managements;
  return MG.managements.filter(m => m.leadId === MG.session.userId);
}
function canOpen(mgmtId) {
  return visibleManagements().some(m => m.id === mgmtId);
}
const isAdmin = () => MG.session.role === 'admin';

/* Dates -------------------------------------------------- */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m-1]} ${y}`;
}
function fmtTime(t) {
  if (!t) return '';
  let [h,mi] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2,'0')} ${ap}`;
}
function todayISO() { return MG.today; }

/** Session status derived from date + time against the demo clock. */
function sessionStatus(v) {
  if (v.completed) return 'completed';
  const now = `${MG.today} ${MG.nowTime}`;
  const start = `${v.date} ${v.startTime}`;
  const end = `${v.date} ${v.endTime}`;
  if (now < start) return 'scheduled';
  if (now >= start && now <= end) return 'running';
  return 'completed';
}
const STATUS_LABEL = { scheduled:'Scheduled', running:'Running', completed:'Completed' };
const STATUS_DOT   = { scheduled:'🟡', running:'🟢', completed:'🔵' };
const STATUS_BADGE = { scheduled:'badge-pending', running:'badge-confirmed', completed:'badge-maroon' };

/* Attendance --------------------------------------------- */
function attFor(volId, memberId) {
  return MG.attendance.find(a => a.volunteeringId === volId && a.memberId === memberId);
}
function sessionTally(v) {
  let present = 0, absent = 0;
  v.memberIds.forEach(id => {
    const a = attFor(v.id, id);
    if (a && a.status === 'present') present++;
    else if (a && a.status === 'absent') absent++;
  });
  return { present, absent, unmarked: v.memberIds.length - present - absent, total: v.memberIds.length };
}
function setAttendance(volId, memberId, status) {
  const existing = attFor(volId, memberId);
  const stamp = `${MG.today}T${MG.nowTime}:00`;
  if (existing) { existing.status = status; existing.markedAt = stamp; }
  else MG.attendance.push({ volunteeringId: volId, memberId, status, markedAt: stamp });
}

/** Member attendance across a month ('YYYY-MM') or all time when null. */
function memberStats(memberId, month) {
  const m = memberById(memberId);
  if (!m) return { sessions:0, present:0, absent:0, rate:0 };
  let sessions = 0, present = 0, absent = 0;
  MG.volunteering
    .filter(v => v.managementId === m.managementId)
    .filter(v => !month || v.date.startsWith(month))
    .filter(v => v.memberIds.includes(memberId))
    .forEach(v => {
      const a = attFor(v.id, memberId);
      if (!a) return;                 // unmarked does not count toward rate
      sessions++;
      if (a.status === 'present') present++; else absent++;
    });
  const rate = sessions ? Math.round((present / sessions) * 1000) / 10 : 0;
  return { sessions, present, absent, rate };
}

function attendanceGrade(rate, sessions) {
  if (!sessions) return { label:'No Data', cls:'badge-pending' };
  if (rate >= 95) return { label:'Excellent', cls:'badge-confirmed' };
  if (rate >= 80) return { label:'Good', cls:'badge-maroon' };
  if (rate >= 60) return { label:'Needs Attention', cls:'badge-pending' };
  return { label:'Critical', cls:'badge-cancelled' };
}

/** Roll-up stats for one management, scoped to a month. */
function mgmtMonthStats(mgmtId, month) {
  const list = MG.volunteering.filter(v => v.managementId === mgmtId && v.date.startsWith(month));
  let slots = 0, present = 0, absent = 0;
  list.forEach(v => {
    const t = sessionTally(v);
    slots += t.total; present += t.present; absent += t.absent;
  });
  const marked = present + absent;
  return {
    sessions: list.length, slots, present, absent,
    rate: marked ? Math.round((present / marked) * 1000) / 10 : 0
  };
}

function nextSessionOf(mgmtId) {
  const upcoming = sessionsOf(mgmtId).filter(v => sessionStatus(v) !== 'completed');
  return upcoming[0] || null;
}
function todaySessionsOf(mgmtId) {
  return sessionsOf(mgmtId).filter(v => v.date === MG.today);
}

/** Every management a devotee belongs to — proves multi-assignment. */
function assignmentsOfDevotee(devoteeId) {
  return MG.members.filter(m => m.devoteeId === devoteeId).map(m => ({
    member: m, management: mgmtById(m.managementId)
  }));
}

function nextId(prefix, list, pad) {
  let max = 0;
  list.forEach(x => {
    const n = parseInt(String(x.id).replace(/\D/g,''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return `${prefix}-${String(max + 1).padStart(pad, '0')}`;
}

function logActivity(mgmtId, text) {
  MG.activity.unshift({ managementId: mgmtId, text, when: 'Just now' });
}

function mgToast(msg) {
  if (typeof showToast === 'function') showToast(msg);
}

/** Volunteer badge id, e.g. VGM-0012 from "VIP Guest Management" */
function badgeCode(mgmt, member) {
  const initials = mgmt.name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w))
    .map(w => w[0].toUpperCase()).join('').slice(0,3) || 'MGT';
  const num = String(member.id).replace(/\D/g,'').padStart(4,'0');
  return `${initials}-${num}`;
}
function mgmtCode(mgmt) {
  return mgmt.name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w))
    .map(w => w[0].toUpperCase()).join('').slice(0,3) || 'MGT';
}

/* ============================================================
   3. PUBLIC VOLUNTEERING PAGE — data + helpers
   ------------------------------------------------------------
   A Lead can "activate" a no-login page (shareable link) where
   devotees sign up for a specific volunteering slot — the date
   and time are the ones the Lead set when scheduling the
   session. Submissions arrive here as 'pending' until the Lead
   approves them into the team.
   ============================================================ */

/* Per-management public page config, keyed by management id. */
MG.publicPages = {};

/* Public sign-ups (people who filled the public page). */
MG.publicSignups = [];

/* Seed which existing sessions the Lead has opened to the public. */

/** Public page config for a management, created on first access. */
function publicPageOf(mgmtId) {
  if (!MG.publicPages[mgmtId]) {
    MG.publicPages[mgmtId] = { enabled: false, intro: '', contact: '' };
  }
  return MG.publicPages[mgmtId];
}
const isPublicEnabled = mgmtId => !!(MG.publicPages[mgmtId] && MG.publicPages[mgmtId].enabled);

/** Upcoming sessions a Lead has opened for public sign-up. */
function publicSessionsOf(mgmtId) {
  return sessionsOf(mgmtId).filter(v => sessionStatus(v) !== 'completed' && v.publicOpen === true);
}
const signupsOf         = mgmtId => MG.publicSignups.filter(s => s.managementId === mgmtId);
const pendingSignupsOf  = mgmtId => signupsOf(mgmtId).filter(s => s.status === 'pending');
const signupsForSession = volId  => MG.publicSignups.filter(s => s.volunteeringId === volId && s.status !== 'declined');

/** Absolute, shareable link to a management's public volunteering page. */
function publicPageLink(mgmtId) {
  const origin = (location.origin && location.origin !== 'null')
    ? location.origin + location.pathname
    : location.href.split('#')[0].split('?')[0];
  return `${origin}#/volunteer/${mgmtId}`;
}
