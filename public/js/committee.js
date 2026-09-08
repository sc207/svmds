/* ============================================================
   COMMITTEE / SAMAJ MODULE
   Shri Vihat Meldi Mata Mandir — Temple Construction Governance
   ------------------------------------------------------------
   Admin creates a Committee -> assigns a Leader -> Leader (and
   admin) manage members -> Leader calls Meetings -> attendance
   is tracked per meeting per member -> a WhatsApp page holds the
   committee's group/broadcast links and reusable draft messages.
   Mirrors the Management module; reuses management.js/pooja.js
   globals (esc, jsq, fmtDate, fmtTime, nextId, MONTHS, kpiCard,
   emptyState, openConfirm, openSheet, downloadCSV, copyText, t).
   ============================================================ */

if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
  window.tData = function (v) { return v == null ? '' : v; };
  window.onLanguageChange = function () {};
}

const CMT = {
  session: { role: 'admin', userId: 'DEV-001', userName: 'Administrator' }, // 'admin' | 'leader'
  view: 'directory',            // 'directory' | 'workspace'
  activeCmtId: null,
  activeTab: 'overview',
  activeMeetingId: null,
  activeMemberId: null,
  editingCmtId: null,
  editingMemberId: null,
  editingMeetingId: null,
  editingDraftId: null,
  calendarMonth: 8,
  calendarYear: 2026,
  today: '2026-09-06',
  nowTime: '18:30',

  palette: [
    { name:'Maroon', hex:'#6B1F2A' }, { name:'Saffron', hex:'#C96A20' },
    { name:'Antique Gold', hex:'#C9A24A' }, { name:'Temple Green', hex:'#4C8B5A' },
    { name:'Indigo', hex:'#3B5C8A' }, { name:'Deep Plum', hex:'#7A3B62' }
  ],

  /* Devotees who can lead a committee */
  leaders: [],

  committees: [
    { id:'CMT-001', name:'General Temple Committee', leaderId: '', samaj:'General Committee',
      purpose:'Overall governance of the temple construction — approvals, budgets and coordination between samaj committees.',
      color:'#6B1F2A', expectedSize:0, status:'active', createdDate:'2026-06-01',
      notes:'Meets on the first Sunday of every month.' },
    { id:'CMT-002', name:'Rabari Samaj Committee', leaderId: '', samaj:'Rabari Samaj',
      purpose:'Rabari samaj contribution drives, shram-daan rosters and stone/timber procurement for the shikhar.',
      color:'#C96A20', expectedSize:0, status:'active', createdDate:'2026-06-05',
      notes:'Largest samaj group; handles village-wise collection.' },
    { id:'CMT-003', name:'Marvadi Samaj Committee', leaderId: '', samaj:'Marvadi Samaj',
      purpose:'Festival celebrations, prasad sponsorship and marble / gold work funding.',
      color:'#7A3B62', expectedSize:0, status:'active', createdDate:'2026-06-08',
      notes:'' }
  ],

  /* devoteeId links to a shared person record so one devotee can sit on several committees */
  members: [],

  /* Meetings (with an assigned attendee list) */
  meetings: [],

  attendance: [],

  communication: [],

  drafts: [],

  activity: []
};

/* ------------------------------------------------------------
   HELPERS
   ------------------------------------------------------------ */
function cmtToday() { return (typeof MG !== 'undefined' && MG.today) ? MG.today : CMT.today; }
function cmtNow()   { return (typeof MG !== 'undefined' && MG.nowTime) ? MG.nowTime : CMT.nowTime; }
function cmtToast(m) { if (typeof showToast === 'function') showToast(m); }

const cmtById       = id => CMT.committees.find(c => c.id === id);
const cmtMemberById = id => CMT.members.find(m => m.id === id);
const cmtLeadById   = id => (typeof personById === 'function' ? personById(id) : null) || CMT.leaders.find(l => l.id === id);
const cmtCommById   = id => CMT.communication.find(x => x.committeeId === id);
const meetingById   = id => CMT.meetings.find(x => x.id === id);

const cmtMembersOf   = cid => CMT.members.filter(m => m.committeeId === cid);
const cmtActiveOf    = cid => cmtMembersOf(cid).filter(m => m.status === 'active');
const cmtMeetingsOf  = cid => CMT.meetings.filter(x => x.committeeId === cid)
  .slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
const cmtDraftsOf    = cid => CMT.drafts.filter(d => d.committeeId === cid);
const cmtActivityOf  = cid => CMT.activity.filter(a => a.committeeId === cid);

const cmtMemberName = m => m ? (m.firstName + ' ' + m.lastName).trim() : 'Unknown';
function cmtLeadName(cid) {
  const c = cmtById(cid); const l = c ? cmtLeadById(c.leaderId) : null;
  return l ? l.name : 'Unassigned';
}

const isCmtAdmin = () => CMT.session.role === 'admin';
function visibleCommittees() {
  if (isCmtAdmin()) return CMT.committees;
  return CMT.committees.filter(c => c.leaderId === CMT.session.userId);
}
function canOpenCmt(id) { return visibleCommittees().some(c => c.id === id); }

/* meeting status vs demo clock */
function meetingStatus(x) {
  if (x.completed) return 'completed';
  const now = cmtToday() + ' ' + cmtNow();
  if (now < x.date + ' ' + x.startTime) return 'scheduled';
  if (now <= x.date + ' ' + x.endTime) return 'running';
  return 'completed';
}
function cmtMeetingLabel(st) {
  return st === 'running' ? window.t('cmt_running', 'Running')
       : st === 'completed' ? window.t('cmt_done', 'Completed')
       : window.t('cmt_scheduled', 'Scheduled');
}
const CMT_MEET_BADGE = { scheduled:'badge-pending', running:'badge-confirmed', completed:'badge-maroon' };
const CMT_MEET_DOT   = { scheduled:'🟡', running:'🟢', completed:'🔵' };

function cmtAtt(mtgId, memberId) {
  return CMT.attendance.find(a => a.meetingId === mtgId && a.memberId === memberId);
}
function meetingTally(x) {
  let present = 0, absent = 0;
  (x.memberIds || []).forEach(id => {
    const a = cmtAtt(x.id, id);
    if (a && a.status === 'present') present++;
    else if (a && a.status === 'absent') absent++;
  });
  return { present, absent, unmarked: (x.memberIds || []).length - present - absent, total: (x.memberIds || []).length };
}
function setCmtAttendance(mtgId, memberId, status) {
  const ex = cmtAtt(mtgId, memberId);
  const stamp = cmtToday() + 'T' + cmtNow() + ':00';
  if (ex) { ex.status = status; ex.markedAt = stamp; }
  else CMT.attendance.push({ meetingId: mtgId, memberId, status, markedAt: stamp });
}
/** member attendance rate across a committee (all meetings marked). */
function cmtMemberStats(memberId) {
  const m = cmtMemberById(memberId);
  if (!m) return { meetings: 0, present: 0, absent: 0, rate: 0 };
  let meetings = 0, present = 0, absent = 0;
  CMT.meetings.filter(x => x.committeeId === m.committeeId && (x.memberIds || []).includes(memberId)).forEach(x => {
    const a = cmtAtt(x.id, memberId);
    if (!a) return;
    meetings++;
    if (a.status === 'present') present++; else absent++;
  });
  return { meetings, present, absent, rate: meetings ? Math.round((present / meetings) * 100) : 0 };
}
function cmtMonthStats(cid, monthKey) {
  const list = CMT.meetings.filter(x => x.committeeId === cid && (x.date || '').indexOf(monthKey) === 0);
  let slots = 0, present = 0, absent = 0;
  list.forEach(x => { const t = meetingTally(x); slots += t.total; present += t.present; absent += t.absent; });
  const marked = present + absent;
  return { meetings: list.length, slots, present, absent, rate: marked ? Math.round((present / marked) * 100) : 0 };
}
function cmtNextMeeting(cid) {
  return cmtMeetingsOf(cid).filter(x => meetingStatus(x) !== 'completed')[0] || null;
}

function cmtLogActivity(cid, text) { CMT.activity.unshift({ committeeId: cid, text, when: 'Just now' }); }

/** Every committee a devotee sits on. */
function committeesOfDevotee(devoteeId) {
  return CMT.members.filter(m => m.devoteeId === devoteeId).map(m => ({ member: m, committee: cmtById(m.committeeId) }));
}

function cmtNextId(prefix, list, pad) {
  let max = 0;
  list.forEach(x => { const n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (!isNaN(n) && n > max) max = n; });
  return prefix + '-' + String(max + 1).padStart(pad, '0');
}
