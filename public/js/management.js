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
  leads: [
    { id: 'DEV-001', name: 'Rajesh Patel',    mobile: '9876500001', city: 'Sanand' },
    { id: 'DEV-010', name: 'Amit Shah',       mobile: '9876500002', city: 'Ahmedabad' },
    { id: 'DEV-011', name: 'Kiran Patel',     mobile: '9876500003', city: 'Sanand' },
    { id: 'DEV-012', name: 'Manjula Ben',     mobile: '9876500004', city: 'Viramgam' },
    { id: 'DEV-013', name: 'Harish Rabari',   mobile: '9876500005', city: 'Bavla' }
  ],

  /* --- Managements ------------------------------------------ */
  managements: [
    {
      id: 'MGMT-001', name: 'VIP Guest Management', leadId: 'DEV-001',
      description: 'Responsible for welcoming and assisting VIP guests during darshan and events.',
      color: '#6B1F2A', expectedTeamSize: 15, status: 'active',
      createdDate: '2026-08-01', notes: 'VIP reception and guest coordination.'
    },
    {
      id: 'MGMT-002', name: 'Parking Management', leadId: 'DEV-010',
      description: 'Vehicle routing, parking lot allocation and crowd traffic control.',
      color: '#3B5C8A', expectedTeamSize: 20, status: 'active',
      createdDate: '2026-08-03', notes: 'Peak load on Poonam and festival days.'
    },
    {
      id: 'MGMT-003', name: 'Prasad Management', leadId: 'DEV-011',
      description: 'Prasad preparation, packing and orderly distribution at Bhojan Shala.',
      color: '#4C8B5A', expectedTeamSize: 12, status: 'active',
      createdDate: '2026-08-05', notes: 'Hygiene checklist mandatory before each session.'
    },
    {
      id: 'MGMT-004', name: 'Event Management', leadId: 'DEV-001',
      description: 'Mahotsav staging, sound, seating and programme coordination.',
      color: '#C96A20', expectedTeamSize: 25, status: 'active',
      createdDate: '2026-08-08', notes: 'Navratri planning is the current priority.'
    },
    {
      id: 'MGMT-005', name: 'Security Management', leadId: 'DEV-013',
      description: 'Gate screening, queue discipline and lost-and-found desk.',
      color: '#5A4029', expectedTeamSize: 18, status: 'inactive',
      createdDate: '2026-08-12', notes: 'Team paused until Navratri roster is approved.'
    }
  ],

  /* --- Management members ----------------------------------------
     devoteeId links to the central person record, so the SAME
     devotee can appear in several managements without duplication. */
  members: [
    // VIP Guest Management
    { id:'MEM-001', managementId:'MGMT-001', devoteeId:'DEV-002', firstName:'Amit',   lastName:'Patel',  mobile:'9876543210', city:'Sanand',    state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Available mostly on weekends.', joinedDate:'2026-08-10' },
    { id:'MEM-002', managementId:'MGMT-001', devoteeId:'DEV-003', firstName:'Karan',  lastName:'Shah',   mobile:'9723456789', city:'Ahmedabad', state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Fluent in Hindi and English.', joinedDate:'2026-08-10' },
    { id:'MEM-003', managementId:'MGMT-001', devoteeId:'DEV-004', firstName:'Ravi',   lastName:'Patel',  mobile:'9988776655', city:'Sanand',    state:'Gujarat', role:'Volunteer',      status:'inactive', notes:'Out of town for two months.', joinedDate:'2026-08-11' },
    { id:'MEM-004', managementId:'MGMT-001', devoteeId:'DEV-005', firstName:'Mehul',  lastName:'Shah',   mobile:'9654321098', city:'Bavla',     state:'Gujarat', role:'Senior Volunteer',status:'active',  notes:'Handles VIP escort duty.', joinedDate:'2026-08-12' },
    { id:'MEM-005', managementId:'MGMT-001', devoteeId:'DEV-006', firstName:'Nilesh', lastName:'Parmar', mobile:'9898012345', city:'Changodar', state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-14' },
    { id:'MEM-006', managementId:'MGMT-001', devoteeId:'DEV-007', firstName:'Hetal',  lastName:'Shah',   mobile:'9712398765', city:'Sanand',    state:'Gujarat', role:'Coordinator',    status:'active',   notes:'Ladies guest desk.', joinedDate:'2026-08-15' },
    { id:'MEM-007', managementId:'MGMT-001', devoteeId:'DEV-008', firstName:'Jignesh',lastName:'Patel',  mobile:'9823456780', city:'Ahmedabad', state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-18' },
    { id:'MEM-008', managementId:'MGMT-001', devoteeId:'DEV-009', firstName:'Pooja',  lastName:'Rabari', mobile:'9834567123', city:'Sanand',    state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Evening shifts preferred.', joinedDate:'2026-08-20' },

    // Parking Management
    { id:'MEM-009', managementId:'MGMT-002', devoteeId:'DEV-002', firstName:'Amit',   lastName:'Patel',  mobile:'9876543210', city:'Sanand',    state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Also in VIP Guest team.', joinedDate:'2026-08-12' },
    { id:'MEM-010', managementId:'MGMT-002', devoteeId:'DEV-014', firstName:'Suresh', lastName:'Thakor', mobile:'9845612370', city:'Sanand',    state:'Gujarat', role:'Senior Volunteer',status:'active',  notes:'Two-wheeler lane in-charge.', joinedDate:'2026-08-12' },
    { id:'MEM-011', managementId:'MGMT-002', devoteeId:'DEV-015', firstName:'Dinesh', lastName:'Chauhan',mobile:'9856123478', city:'Bavla',     state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-13' },
    { id:'MEM-012', managementId:'MGMT-002', devoteeId:'DEV-016', firstName:'Vikram', lastName:'Solanki',mobile:'9867234512', city:'Viramgam',  state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Night shift available.', joinedDate:'2026-08-15' },
    { id:'MEM-013', managementId:'MGMT-002', devoteeId:'DEV-017', firstName:'Bhavesh',lastName:'Desai',  mobile:'9878345621', city:'Changodar', state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-16' },
    { id:'MEM-014', managementId:'MGMT-002', devoteeId:'DEV-018', firstName:'Rakesh', lastName:'Vaghela',mobile:'9889456732', city:'Sanand',    state:'Gujarat', role:'Volunteer',      status:'inactive', notes:'Requested a break.', joinedDate:'2026-08-17' },

    // Prasad Management
    { id:'MEM-015', managementId:'MGMT-003', devoteeId:'DEV-019', firstName:'Manjula',lastName:'Ben',    mobile:'9890567843', city:'Sanand',    state:'Gujarat', role:'Coordinator',    status:'active',   notes:'Bhojan Shala kitchen lead.', joinedDate:'2026-08-06' },
    { id:'MEM-016', managementId:'MGMT-003', devoteeId:'DEV-020', firstName:'Kailash',lastName:'Bhatt',  mobile:'9812678954', city:'Ahmedabad', state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-07' },
    { id:'MEM-017', managementId:'MGMT-003', devoteeId:'DEV-007', firstName:'Hetal',  lastName:'Shah',   mobile:'9712398765', city:'Sanand',    state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Also in VIP Guest team.', joinedDate:'2026-08-09' },
    { id:'MEM-018', managementId:'MGMT-003', devoteeId:'DEV-021', firstName:'Geeta',  lastName:'Rabari', mobile:'9823789065', city:'Bavla',     state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-10' },
    { id:'MEM-019', managementId:'MGMT-003', devoteeId:'DEV-022', firstName:'Ramesh', lastName:'Prajapati',mobile:'9834890176',city:'Sanand',   state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Packing station.', joinedDate:'2026-08-11' },

    // Event Management
    { id:'MEM-020', managementId:'MGMT-004', devoteeId:'DEV-002', firstName:'Amit',   lastName:'Patel',  mobile:'9876543210', city:'Sanand',    state:'Gujarat', role:'Senior Volunteer',status:'active',  notes:'Third team assignment.', joinedDate:'2026-08-20' },
    { id:'MEM-021', managementId:'MGMT-004', devoteeId:'DEV-005', firstName:'Mehul',  lastName:'Shah',   mobile:'9654321098', city:'Bavla',     state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Also in VIP Guest team.', joinedDate:'2026-08-21' },
    { id:'MEM-022', managementId:'MGMT-004', devoteeId:'DEV-023', firstName:'Sanjay', lastName:'Makwana',mobile:'9845901287', city:'Ahmedabad', state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Sound system handling.', joinedDate:'2026-08-22' },
    { id:'MEM-023', managementId:'MGMT-004', devoteeId:'DEV-024', firstName:'Paresh', lastName:'Joshi',  mobile:'9856012398', city:'Sanand',    state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-23' },
    { id:'MEM-024', managementId:'MGMT-004', devoteeId:'DEV-025', firstName:'Alpesh', lastName:'Dave',   mobile:'9867123409', city:'Viramgam',  state:'Gujarat', role:'Volunteer',      status:'active',   notes:'Stage decoration.', joinedDate:'2026-08-24' },
    { id:'MEM-025', managementId:'MGMT-004', devoteeId:'DEV-026', firstName:'Nayan',  lastName:'Trivedi',mobile:'9878234510', city:'Sanand',    state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-25' },

    // Security Management
    { id:'MEM-026', managementId:'MGMT-005', devoteeId:'DEV-027', firstName:'Jayesh', lastName:'Marvadi',mobile:'9889345621', city:'Sanand',    state:'Gujarat', role:'Senior Volunteer',status:'active',  notes:'Main gate screening.', joinedDate:'2026-08-14' },
    { id:'MEM-027', managementId:'MGMT-005', devoteeId:'DEV-028', firstName:'Kishor', lastName:'Zala',   mobile:'9890456732', city:'Bavla',     state:'Gujarat', role:'Volunteer',      status:'active',   notes:'', joinedDate:'2026-08-15' }
  ],

  /* --- Volunteering sessions -------------------------------- */
  volunteering: [
    // ---- VIP Guest Management: past, today, upcoming
    { id:'VOL-001', managementId:'MGMT-001', title:'VIP Guest Reception', date:'2026-09-01', startTime:'17:00', endTime:'21:00', location:'Main Temple Entrance', memberIds:['MEM-001','MEM-002','MEM-004','MEM-005','MEM-006','MEM-007'], notes:'Arrive 15 minutes early.', completed:true },
    { id:'VOL-002', managementId:'MGMT-001', title:'Morning Darshan Assistance', date:'2026-09-03', startTime:'06:00', endTime:'10:00', location:'Darshan Queue Hall', memberIds:['MEM-001','MEM-002','MEM-005','MEM-008'], notes:'', completed:true },
    { id:'VOL-003', managementId:'MGMT-001', title:'VIP Guest Reception', date:'2026-09-04', startTime:'17:00', endTime:'21:00', location:'Main Temple Entrance', memberIds:['MEM-001','MEM-004','MEM-006','MEM-007','MEM-008'], notes:'Trustee visit expected.', completed:true },
    { id:'VOL-004', managementId:'MGMT-001', title:'Evening Aarti VIP Desk', date:'2026-09-06', startTime:'17:00', endTime:'21:00', location:'Sabha Mandap', memberIds:['MEM-001','MEM-002','MEM-004','MEM-005','MEM-006','MEM-007','MEM-008'], notes:'Running session — mark attendance as members report.', completed:false },
    { id:'VOL-005', managementId:'MGMT-001', title:'Poonam Dayro VIP Seating', date:'2026-09-15', startTime:'19:00', endTime:'23:30', location:'Mahotsav Ground', memberIds:['MEM-001','MEM-002','MEM-004','MEM-005','MEM-006','MEM-007','MEM-008'], notes:'Full team required. Wear team badge.', completed:false },
    { id:'VOL-006', managementId:'MGMT-001', title:'Navratri Day 1 VIP Reception', date:'2026-09-22', startTime:'18:00', endTime:'23:00', location:'Main Temple Entrance', memberIds:['MEM-001','MEM-004','MEM-006','MEM-007'], notes:'', completed:false },

    // ---- Parking Management
    { id:'VOL-007', managementId:'MGMT-002', title:'Sunday Rush Parking Duty', date:'2026-09-01', startTime:'07:00', endTime:'13:00', location:'North Parking Lot', memberIds:['MEM-009','MEM-010','MEM-011','MEM-012','MEM-013'], notes:'', completed:true },
    { id:'VOL-008', managementId:'MGMT-002', title:'Evening Traffic Control', date:'2026-09-05', startTime:'17:30', endTime:'21:30', location:'Temple Approach Road', memberIds:['MEM-010','MEM-011','MEM-012'], notes:'', completed:true },
    { id:'VOL-009', managementId:'MGMT-002', title:'Poonam Parking Deployment', date:'2026-09-15', startTime:'17:00', endTime:'23:59', location:'All Parking Zones', memberIds:['MEM-009','MEM-010','MEM-011','MEM-012','MEM-013'], notes:'Heavy inflow expected.', completed:false },
    { id:'VOL-010', managementId:'MGMT-002', title:'Navratri Parking Roster', date:'2026-09-22', startTime:'17:00', endTime:'23:59', location:'All Parking Zones', memberIds:['MEM-010','MEM-011','MEM-012','MEM-013'], notes:'', completed:false },

    // ---- Prasad Management
    { id:'VOL-011', managementId:'MGMT-003', title:'Annadan Prasad Distribution', date:'2026-09-02', startTime:'11:00', endTime:'15:00', location:'Bhojan Shala', memberIds:['MEM-015','MEM-016','MEM-017','MEM-018','MEM-019'], notes:'', completed:true },
    { id:'VOL-012', managementId:'MGMT-003', title:'Prasad Packing Drive', date:'2026-09-06', startTime:'09:00', endTime:'12:00', location:'Prasad Store Room', memberIds:['MEM-015','MEM-016','MEM-018','MEM-019'], notes:'Completed earlier today.', completed:true },
    { id:'VOL-013', managementId:'MGMT-003', title:'Sharad Purnima Kheer Seva', date:'2026-10-06', startTime:'18:00', endTime:'22:00', location:'Bhojan Shala', memberIds:['MEM-015','MEM-016','MEM-017','MEM-018','MEM-019'], notes:'Kheer Mahaprasad.', completed:false },

    // ---- Event Management
    { id:'VOL-014', managementId:'MGMT-004', title:'Mahotsav Stage Setup', date:'2026-09-04', startTime:'08:00', endTime:'14:00', location:'Mahotsav Ground', memberIds:['MEM-020','MEM-021','MEM-022','MEM-023','MEM-024','MEM-025'], notes:'', completed:true },
    { id:'VOL-015', managementId:'MGMT-004', title:'Sound & Light Trial', date:'2026-09-06', startTime:'20:00', endTime:'22:30', location:'Mahotsav Ground', memberIds:['MEM-020','MEM-022','MEM-024'], notes:'Scheduled later this evening.', completed:false },
    { id:'VOL-016', managementId:'MGMT-004', title:'Poonam Dayro Programme Duty', date:'2026-09-15', startTime:'18:00', endTime:'23:59', location:'Mahotsav Ground', memberIds:['MEM-020','MEM-021','MEM-022','MEM-023','MEM-024','MEM-025'], notes:'All hands.', completed:false },

    // ---- Security Management
    { id:'VOL-017', managementId:'MGMT-005', title:'Gate Screening Duty', date:'2026-09-03', startTime:'06:00', endTime:'12:00', location:'Main Gate', memberIds:['MEM-026','MEM-027'], notes:'', completed:true }
  ],

  /* --- Attendance (kept separate from sessions) ------------- */
  attendance: [
    // VOL-001
    { volunteeringId:'VOL-001', memberId:'MEM-001', status:'present', markedAt:'2026-09-01T17:05:00' },
    { volunteeringId:'VOL-001', memberId:'MEM-002', status:'present', markedAt:'2026-09-01T17:04:00' },
    { volunteeringId:'VOL-001', memberId:'MEM-004', status:'present', markedAt:'2026-09-01T17:02:00' },
    { volunteeringId:'VOL-001', memberId:'MEM-005', status:'absent',  markedAt:'2026-09-01T17:30:00' },
    { volunteeringId:'VOL-001', memberId:'MEM-006', status:'present', markedAt:'2026-09-01T17:01:00' },
    { volunteeringId:'VOL-001', memberId:'MEM-007', status:'present', markedAt:'2026-09-01T17:08:00' },
    // VOL-002
    { volunteeringId:'VOL-002', memberId:'MEM-001', status:'present', markedAt:'2026-09-03T06:03:00' },
    { volunteeringId:'VOL-002', memberId:'MEM-002', status:'absent',  markedAt:'2026-09-03T06:40:00' },
    { volunteeringId:'VOL-002', memberId:'MEM-005', status:'present', markedAt:'2026-09-03T06:01:00' },
    { volunteeringId:'VOL-002', memberId:'MEM-008', status:'present', markedAt:'2026-09-03T06:05:00' },
    // VOL-003
    { volunteeringId:'VOL-003', memberId:'MEM-001', status:'present', markedAt:'2026-09-04T17:02:00' },
    { volunteeringId:'VOL-003', memberId:'MEM-004', status:'present', markedAt:'2026-09-04T17:00:00' },
    { volunteeringId:'VOL-003', memberId:'MEM-006', status:'present', markedAt:'2026-09-04T17:06:00' },
    { volunteeringId:'VOL-003', memberId:'MEM-007', status:'present', markedAt:'2026-09-04T17:04:00' },
    { volunteeringId:'VOL-003', memberId:'MEM-008', status:'absent',  markedAt:'2026-09-04T17:45:00' },
    // VOL-004 (running today — partially marked)
    { volunteeringId:'VOL-004', memberId:'MEM-001', status:'present', markedAt:'2026-09-06T17:03:00' },
    { volunteeringId:'VOL-004', memberId:'MEM-002', status:'present', markedAt:'2026-09-06T17:05:00' },
    { volunteeringId:'VOL-004', memberId:'MEM-004', status:'present', markedAt:'2026-09-06T17:02:00' },
    { volunteeringId:'VOL-004', memberId:'MEM-006', status:'present', markedAt:'2026-09-06T17:10:00' },
    { volunteeringId:'VOL-004', memberId:'MEM-007', status:'absent',  markedAt:'2026-09-06T17:40:00' },
    // VOL-007
    { volunteeringId:'VOL-007', memberId:'MEM-009', status:'present', markedAt:'2026-09-01T07:02:00' },
    { volunteeringId:'VOL-007', memberId:'MEM-010', status:'present', markedAt:'2026-09-01T07:00:00' },
    { volunteeringId:'VOL-007', memberId:'MEM-011', status:'present', markedAt:'2026-09-01T07:05:00' },
    { volunteeringId:'VOL-007', memberId:'MEM-012', status:'absent',  markedAt:'2026-09-01T07:35:00' },
    { volunteeringId:'VOL-007', memberId:'MEM-013', status:'present', markedAt:'2026-09-01T07:04:00' },
    // VOL-008
    { volunteeringId:'VOL-008', memberId:'MEM-010', status:'present', markedAt:'2026-09-05T17:32:00' },
    { volunteeringId:'VOL-008', memberId:'MEM-011', status:'present', markedAt:'2026-09-05T17:31:00' },
    { volunteeringId:'VOL-008', memberId:'MEM-012', status:'present', markedAt:'2026-09-05T17:35:00' },
    // VOL-011
    { volunteeringId:'VOL-011', memberId:'MEM-015', status:'present', markedAt:'2026-09-02T11:00:00' },
    { volunteeringId:'VOL-011', memberId:'MEM-016', status:'present', markedAt:'2026-09-02T11:02:00' },
    { volunteeringId:'VOL-011', memberId:'MEM-017', status:'present', markedAt:'2026-09-02T11:05:00' },
    { volunteeringId:'VOL-011', memberId:'MEM-018', status:'absent',  markedAt:'2026-09-02T11:40:00' },
    { volunteeringId:'VOL-011', memberId:'MEM-019', status:'present', markedAt:'2026-09-02T11:03:00' },
    // VOL-012
    { volunteeringId:'VOL-012', memberId:'MEM-015', status:'present', markedAt:'2026-09-06T09:01:00' },
    { volunteeringId:'VOL-012', memberId:'MEM-016', status:'present', markedAt:'2026-09-06T09:03:00' },
    { volunteeringId:'VOL-012', memberId:'MEM-018', status:'present', markedAt:'2026-09-06T09:05:00' },
    { volunteeringId:'VOL-012', memberId:'MEM-019', status:'absent',  markedAt:'2026-09-06T09:35:00' },
    // VOL-014
    { volunteeringId:'VOL-014', memberId:'MEM-020', status:'present', markedAt:'2026-09-04T08:02:00' },
    { volunteeringId:'VOL-014', memberId:'MEM-021', status:'present', markedAt:'2026-09-04T08:00:00' },
    { volunteeringId:'VOL-014', memberId:'MEM-022', status:'present', markedAt:'2026-09-04T08:05:00' },
    { volunteeringId:'VOL-014', memberId:'MEM-023', status:'absent',  markedAt:'2026-09-04T08:40:00' },
    { volunteeringId:'VOL-014', memberId:'MEM-024', status:'present', markedAt:'2026-09-04T08:03:00' },
    { volunteeringId:'VOL-014', memberId:'MEM-025', status:'present', markedAt:'2026-09-04T08:07:00' },
    // VOL-017
    { volunteeringId:'VOL-017', memberId:'MEM-026', status:'present', markedAt:'2026-09-03T06:02:00' },
    { volunteeringId:'VOL-017', memberId:'MEM-027', status:'present', markedAt:'2026-09-03T06:04:00' }
  ],

  /* --- WhatsApp group / broadcast per management ------------ */
  communication: [
    { managementId:'MGMT-001', groupName:'VIP Guest Volunteers',   groupLink:'https://chat.whatsapp.com/demo-vip',     broadcastName:'VIP Guest Broadcast',   broadcastLink:'https://wa.me/919876500001' },
    { managementId:'MGMT-002', groupName:'Parking Team Sanand',    groupLink:'https://chat.whatsapp.com/demo-parking', broadcastName:'Parking Broadcast',     broadcastLink:'https://wa.me/919876500002' },
    { managementId:'MGMT-003', groupName:'Prasad Seva Group',      groupLink:'https://chat.whatsapp.com/demo-prasad',  broadcastName:'Prasad Broadcast',      broadcastLink:'https://wa.me/919876500003' },
    { managementId:'MGMT-004', groupName:'Event Crew',             groupLink:'https://chat.whatsapp.com/demo-event',   broadcastName:'Event Broadcast',       broadcastLink:'https://wa.me/919876500001' },
    { managementId:'MGMT-005', groupName:'',                       groupLink:'',                                       broadcastName:'',                      broadcastLink:'' }
  ],

  /* --- Message drafts -------------------------------------- */
  drafts: [
    { id:'MSG-001', managementId:'MGMT-001', title:"Tomorrow's Volunteering", message:"Jai Mataji 🙏\n\nTomorrow's VIP Guest volunteering is scheduled from 5:00 PM to 9:00 PM at the Main Temple Entrance.\n\nPlease arrive 15 minutes early and carry your team badge.\n\nThank you.", updatedAt:'2026-09-05' },
    { id:'MSG-002', managementId:'MGMT-001', title:'Poonam Dayro Reminder', message:"Jai Mataji 🙏\n\nPoonam Dayro VIP seating duty on 15 September, 7:00 PM to 11:30 PM at Mahotsav Ground.\n\nFull team attendance is required.\n\nThank you.", updatedAt:'2026-09-06' },
    { id:'MSG-003', managementId:'MGMT-002', title:'Parking Deployment Notice', message:"Jai Mataji 🙏\n\nPoonam parking deployment on 15 September from 5:00 PM. Report at the North Parking Lot for zone allocation.\n\nThank you.", updatedAt:'2026-09-04' },
    { id:'MSG-004', managementId:'MGMT-003', title:'Hygiene Checklist', message:"Jai Mataji 🙏\n\nReminder: complete the hygiene checklist before starting prasad packing. Gloves and head cover are mandatory.\n\nThank you.", updatedAt:'2026-09-02' },
    { id:'MSG-005', managementId:'MGMT-004', title:'Stage Setup Call Time', message:"Jai Mataji 🙏\n\nStage setup call time is 8:00 AM at Mahotsav Ground. Bring tools issued last week.\n\nThank you.", updatedAt:'2026-09-03' }
  ],

  /* --- Activity log ---------------------------------------- */
  activity: [
    { managementId:'MGMT-001', text:'Amit Patel marked Present for Evening Aarti VIP Desk', when:'5 minutes ago' },
    { managementId:'MGMT-001', text:'Hetal Shah marked Absent for Evening Aarti VIP Desk', when:'22 minutes ago' },
    { managementId:'MGMT-001', text:'Pooja Rabari added to team', when:'Today' },
    { managementId:'MGMT-001', text:'Poonam Dayro VIP Seating scheduled for 15 Sept', when:'Yesterday' },
    { managementId:'MGMT-001', text:'Rajesh Patel updated the WhatsApp group link', when:'Yesterday' },
    { managementId:'MGMT-002', text:'Evening Traffic Control session completed', when:'Yesterday' },
    { managementId:'MGMT-002', text:'Rakesh Vaghela set to Inactive', when:'2 days ago' },
    { managementId:'MGMT-003', text:'Prasad Packing Drive completed with 3 present, 1 absent', when:'Today' },
    { managementId:'MGMT-004', text:'Sound & Light Trial scheduled for this evening', when:'Today' },
    { managementId:'MGMT-005', text:'Management set to Inactive pending roster approval', when:'3 days ago' }
  ]
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
const leadById   = id => MG.leads.find(l => l.id === id);
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
MG.publicPages = {
  'MGMT-001': {
    enabled: true,
    intro: 'Jai Mataji 🙏 Join the VIP Guest seva team for darshan and festival days. Pick a slot below and share your details — the team lead will confirm on WhatsApp.',
    contact: '9876500001'
  },
  'MGMT-003': {
    enabled: false,
    intro: 'Help prepare and serve Mahaprasad at the Bhojan Shala. Hygiene checklist is mandatory before every session.',
    contact: '9876500003'
  }
};

/* Public sign-ups (people who filled the public page). */
MG.publicSignups = [
  { id:'PUB-001', managementId:'MGMT-001', volunteeringId:'VOL-005', name:'Sunil Rabari',  mobile:'9811100011', city:'Sanand',    note:'First time volunteering — please guide.', submittedAt:'2026-09-06T10:15:00', status:'pending'  },
  { id:'PUB-002', managementId:'MGMT-001', volunteeringId:'VOL-006', name:'Falguni Shah',  mobile:'9811100022', city:'Ahmedabad', note:'Available after 6 PM only.',              submittedAt:'2026-09-06T11:40:00', status:'pending'  },
  { id:'PUB-003', managementId:'MGMT-001', volunteeringId:'VOL-005', name:'Rohit Thakor',  mobile:'9811100033', city:'Bavla',     note:'',                                        submittedAt:'2026-09-05T18:05:00', status:'approved' }
];

/* Seed which existing sessions the Lead has opened to the public. */
['VOL-005','VOL-006','VOL-013'].forEach(id => {
  const v = sessionById(id);
  if (v) v.publicOpen = true;
});

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
