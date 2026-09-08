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
  leaders: [
    { id:'DEV-001', name:'Rajesh Patel',   mobile:'9876500001', city:'Sanand' },
    { id:'DEV-010', name:'Amit Shah',       mobile:'9876500002', city:'Ahmedabad' },
    { id:'DEV-020', name:'Harishbhai Rabari',mobile:'9876500021', city:'Bavla' },
    { id:'DEV-021', name:'Manjula Ben',     mobile:'9876500022', city:'Viramgam' }
  ],

  committees: [
    { id:'CMT-001', name:'General Temple Committee', leaderId:'DEV-001', samaj:'General Committee',
      purpose:'Overall governance of the temple construction — approvals, budgets and coordination between samaj committees.',
      color:'#6B1F2A', expectedSize:25, status:'active', createdDate:'2026-06-01',
      notes:'Meets on the first Sunday of every month.' },
    { id:'CMT-002', name:'Rabari Samaj Committee', leaderId:'DEV-020', samaj:'Rabari Samaj',
      purpose:'Rabari samaj contribution drives, shram-daan rosters and stone/timber procurement for the shikhar.',
      color:'#C96A20', expectedSize:45, status:'active', createdDate:'2026-06-05',
      notes:'Largest samaj group; handles village-wise collection.' },
    { id:'CMT-003', name:'Marvadi Samaj Committee', leaderId:'DEV-021', samaj:'Marvadi Samaj',
      purpose:'Festival celebrations, prasad sponsorship and marble / gold work funding.',
      color:'#7A3B62', expectedSize:32, status:'active', createdDate:'2026-06-08',
      notes:'' }
  ],

  /* devoteeId links to a shared person record so one devotee can sit on several committees */
  members: [
    { id:'CMM-001', committeeId:'CMT-001', devoteeId:'DEV-101', firstName:'Bharat',   lastName:'Patel',    mobile:'9811100201', city:'Sanand',    state:'Gujarat', role:'Treasurer',      status:'active',   notes:'Keeps the construction ledger.', joinedDate:'2026-06-02' },
    { id:'CMM-002', committeeId:'CMT-001', devoteeId:'DEV-102', firstName:'Nita',     lastName:'Shah',     mobile:'9811100202', city:'Ahmedabad', state:'Gujarat', role:'Secretary',      status:'active',   notes:'Records minutes.', joinedDate:'2026-06-02' },
    { id:'CMM-003', committeeId:'CMT-001', devoteeId:'DEV-103', firstName:'Suresh',   lastName:'Thakor',   mobile:'9811100203', city:'Bavla',     state:'Gujarat', role:'Member',         status:'active',   notes:'', joinedDate:'2026-06-10' },
    { id:'CMM-004', committeeId:'CMT-001', devoteeId:'DEV-104', firstName:'Alpa',     lastName:'Joshi',    mobile:'9811100204', city:'Sanand',    state:'Gujarat', role:'Member',         status:'inactive', notes:'On leave — family abroad.', joinedDate:'2026-06-12' },
    { id:'CMM-005', committeeId:'CMT-001', devoteeId:'DEV-020', firstName:'Harishbhai',lastName:'Rabari',  mobile:'9876500021', city:'Bavla',     state:'Gujarat', role:'Coordinator',    status:'active',   notes:'Also leads the Rabari Samaj Committee.', joinedDate:'2026-06-02' },

    { id:'CMM-006', committeeId:'CMT-002', devoteeId:'DEV-105', firstName:'Ramesh',   lastName:'Rabari',   mobile:'9811100205', city:'Sanand',    state:'Gujarat', role:'Village In-charge', status:'active', notes:'Sanand village collection.', joinedDate:'2026-06-06' },
    { id:'CMM-007', committeeId:'CMT-002', devoteeId:'DEV-106', firstName:'Dinesh',   lastName:'Rabari',   mobile:'9811100206', city:'Bavla',     state:'Gujarat', role:'Village In-charge', status:'active', notes:'Bavla + Changodar.', joinedDate:'2026-06-06' },
    { id:'CMM-008', committeeId:'CMT-002', devoteeId:'DEV-107', firstName:'Kanta',    lastName:'Ben',      mobile:'9811100207', city:'Viramgam',  state:'Gujarat', role:'Mahila Wing',    status:'active',   notes:'Ladies shram-daan roster.', joinedDate:'2026-06-11' },
    { id:'CMM-009', committeeId:'CMT-002', devoteeId:'DEV-108', firstName:'Jayanti',  lastName:'Rabari',   mobile:'9811100208', city:'Sanand',    state:'Gujarat', role:'Member',         status:'active',   notes:'', joinedDate:'2026-06-14' },

    { id:'CMM-010', committeeId:'CMT-003', devoteeId:'DEV-109', firstName:'Mahesh',   lastName:'Soni',     mobile:'9811100209', city:'Ahmedabad', state:'Gujarat', role:'Treasurer',      status:'active',   notes:'Gold / marble fund.', joinedDate:'2026-06-09' },
    { id:'CMM-011', committeeId:'CMT-003', devoteeId:'DEV-110', firstName:'Rekha',    lastName:'Agrawal',  mobile:'9811100210', city:'Ahmedabad', state:'Gujarat', role:'Member',         status:'active',   notes:'', joinedDate:'2026-06-15' }
  ],

  /* Meetings (with an assigned attendee list) */
  meetings: [
    { id:'MTG-001', committeeId:'CMT-001', title:'Monthly Governance Meeting', date:'2026-09-01', startTime:'10:00', endTime:'12:00', venue:'Trust Office, Sanand', agenda:'Budget review, contractor payment approval, samaj drive status.', memberIds:['CMM-001','CMM-002','CMM-003','CMM-005'], notes:'', completed:true },
    { id:'MTG-002', committeeId:'CMT-001', title:'Contractor Coordination', date:'2026-09-06', startTime:'17:00', endTime:'18:30', venue:'Construction Site', agenda:'Shikhar stone delivery schedule, labour arrangement.', memberIds:['CMM-001','CMM-003','CMM-005'], notes:'On site.', completed:false },
    { id:'MTG-003', committeeId:'CMT-001', title:'Navratri Planning', date:'2026-09-18', startTime:'19:00', endTime:'21:00', venue:'Sabha Mandap', agenda:'Mahotsav budget, stage, security, prasad.', memberIds:['CMM-001','CMM-002','CMM-003','CMM-004','CMM-005'], notes:'', completed:false },
    { id:'MTG-004', committeeId:'CMT-002', title:'Rabari Samaj Collection Review', date:'2026-09-03', startTime:'18:00', endTime:'20:00', venue:'Rabari Vadi, Sanand', agenda:'Village-wise contribution figures, pending pledges.', memberIds:['CMM-006','CMM-007','CMM-008','CMM-009'], notes:'', completed:true },
    { id:'MTG-005', committeeId:'CMT-002', title:'Shram-daan Roster', date:'2026-09-14', startTime:'07:00', endTime:'09:00', venue:'Construction Site', agenda:'Assign weekend shram-daan teams for foundation work.', memberIds:['CMM-006','CMM-007','CMM-008','CMM-009'], notes:'', completed:false },
    { id:'MTG-006', committeeId:'CMT-003', title:'Marble & Gold Work Funding', date:'2026-09-05', startTime:'11:00', endTime:'12:30', venue:'Ahmedabad Office', agenda:'Quotations for garbhagruh marble, gold kalash sponsorship.', memberIds:['CMM-010','CMM-011'], notes:'', completed:true }
  ],

  attendance: [
    { meetingId:'MTG-001', memberId:'CMM-001', status:'present', markedAt:'2026-09-01T10:05:00' },
    { meetingId:'MTG-001', memberId:'CMM-002', status:'present', markedAt:'2026-09-01T10:02:00' },
    { meetingId:'MTG-001', memberId:'CMM-003', status:'absent',  markedAt:'2026-09-01T10:30:00' },
    { meetingId:'MTG-001', memberId:'CMM-005', status:'present', markedAt:'2026-09-01T10:08:00' },
    { meetingId:'MTG-002', memberId:'CMM-001', status:'present', markedAt:'2026-09-06T17:03:00' },
    { meetingId:'MTG-002', memberId:'CMM-005', status:'present', markedAt:'2026-09-06T17:05:00' },
    { meetingId:'MTG-004', memberId:'CMM-006', status:'present', markedAt:'2026-09-03T18:04:00' },
    { meetingId:'MTG-004', memberId:'CMM-007', status:'present', markedAt:'2026-09-03T18:02:00' },
    { meetingId:'MTG-004', memberId:'CMM-008', status:'present', markedAt:'2026-09-03T18:10:00' },
    { meetingId:'MTG-004', memberId:'CMM-009', status:'absent',  markedAt:'2026-09-03T18:40:00' },
    { meetingId:'MTG-006', memberId:'CMM-010', status:'present', markedAt:'2026-09-05T11:05:00' },
    { meetingId:'MTG-006', memberId:'CMM-011', status:'present', markedAt:'2026-09-05T11:02:00' }
  ],

  communication: [
    { committeeId:'CMT-001', groupName:'General Committee', groupLink:'https://chat.whatsapp.com/demo-genc', broadcastName:'General Committee Broadcast', broadcastLink:'https://wa.me/919876500001' },
    { committeeId:'CMT-002', groupName:'Rabari Samaj Nirman', groupLink:'https://chat.whatsapp.com/demo-rabari', broadcastName:'Rabari Samaj Broadcast', broadcastLink:'https://wa.me/919876500021' },
    { committeeId:'CMT-003', groupName:'', groupLink:'', broadcastName:'', broadcastLink:'' }
  ],

  drafts: [
    { id:'CDR-001', committeeId:'CMT-001', title:'Meeting Reminder', message:"Jai Mataji 🙏\n\nReminder: General Committee meeting tomorrow at 10:00 AM at the Trust Office. Agenda: budget review & contractor approval. Please be on time.\n\nThank you.", updatedAt:'2026-09-05' },
    { id:'CDR-002', committeeId:'CMT-002', title:'Contribution Update Request', message:"Jai Mataji 🙏\n\nVillage in-charges, kindly send your updated collection figures and pending pledge list before Friday for the review meeting.\n\nThank you.", updatedAt:'2026-09-04' }
  ],

  activity: [
    { committeeId:'CMT-001', text:'Contractor payment of ₹8,50,000 approved', when:'5 days ago' },
    { committeeId:'CMT-001', text:'Bharat Patel marked Present for Monthly Governance Meeting', when:'5 days ago' },
    { committeeId:'CMT-002', text:'Village-wise collection figures updated', when:'3 days ago' },
    { committeeId:'CMT-003', text:'Committee created and assigned to Manjula Ben', when:'3 months ago' }
  ]
};

/* ------------------------------------------------------------
   HELPERS
   ------------------------------------------------------------ */
function cmtToday() { return (typeof MG !== 'undefined' && MG.today) ? MG.today : CMT.today; }
function cmtNow()   { return (typeof MG !== 'undefined' && MG.nowTime) ? MG.nowTime : CMT.nowTime; }
function cmtToast(m) { if (typeof showToast === 'function') showToast(m); }

const cmtById       = id => CMT.committees.find(c => c.id === id);
const cmtMemberById = id => CMT.members.find(m => m.id === id);
const cmtLeadById   = id => CMT.leaders.find(l => l.id === id);
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
