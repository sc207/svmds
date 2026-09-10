/* snake_case DB row → camelCase DTO. One mapX per table the API returns.
   Keep these pure — no db calls, no req/res. (BACKEND_PLAN.md §4.1) */

/* Person identity for a relationship row (committee_members / team_members /
   sevarthis / donors / guests / visits).

   CURRENT identity is resolved from the JOINed canonical devotees row — the
   route SELECT aliases it as devotee_code / dev_name / dev_mobile / dev_city /
   dev_state. The row's own first_name / last_name / mobile / city / state are a
   FROZEN "as recorded" snapshot, surfaced (as asRecorded*) only for history and
   used as the value ONLY when the row has no devotee link (legacy rows).
   No PATCH /devotees fan-out — nothing is copied, so an edit is reflected
   everywhere automatically. See .claude/plans/pooja-module-...refactor. */
function personIdentity(row) {
  const linked = row && row.devotee_id != null &&
    (row.dev_name != null || row.dev_mobile != null || row.devotee_code != null);
  const snapFull = `${(row && row.first_name) || ''} ${(row && row.last_name) || ''}`.trim();
  const curFull = linked ? String(row.dev_name || '').trim() : snapFull;
  const parts = curFull.split(/\s+/).filter(Boolean);
  return {
    devoteeCode: (row && row.devotee_code) || null,
    firstName: linked ? (parts.shift() || '') : ((row && row.first_name) || ''),
    lastName: linked ? parts.join(' ') : ((row && row.last_name) || ''),
    name: curFull,
    mobile: linked ? (row.dev_mobile || '') : ((row && row.mobile) || ''),
    city: linked ? (row.dev_city || '') : ((row && row.city) || ''),
    state: linked ? (row.dev_state || 'Gujarat') : ((row && row.state) || 'Gujarat'),
    asRecordedName: snapFull,
    asRecordedMobile: (row && row.mobile) || '',
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    devoteeId: row.devotee_id || null,        // numeric devotees.id
    devoteeCode: row.devotee_code || null,    // 'DEV-###' — the id every other module keys on
    email: row.email,
    name: row.name || '',
    mobile: row.mobile || '',
    city: row.city || '',
    active: !!row.active,
    googleLinked: !!row.google_sub,
    roles: Array.isArray(row.roles) ? row.roles : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapDevotee(row) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),   // frontend keys on the human code
    rowId: row.id,
    code: row.code || '',
    name: row.name,
    mobile: row.mobile || '',
    phone: row.mobile || '',          // legacy alias used by app.js renderers
    city: row.city || '',
    state: row.state || 'Gujarat',
    samaj: row.samaj || '',
    status: row.status === 'inactive' ? 'Inactive' : 'Active',
    notes: row.notes || '',
    visits: row.visit_count != null ? Number(row.visit_count) : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapDonationCategory(row) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    name: row.name,
    kind: row.kind,                    // 'cash' | 'kind'
    icon: row.icon || '',
    description: row.description || '',
  };
}

function mapDonor(row) {
  if (!row) return null;
  // individual + linked → current name from the devotee; org/trust → org_name
  const linkedIndiv = row.type === 'individual' && row.devotee_id != null && row.dev_name != null;
  const personName = linkedIndiv ? String(row.dev_name || '').trim()
    : `${row.first_name || ''} ${row.last_name || ''}`.trim();
  const pParts = personName.split(/\s+/).filter(Boolean);
  const name = (row.org_name && row.org_name.trim()) ? row.org_name : personName;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    type: row.type,                    // individual | organization | trust
    firstName: linkedIndiv ? (pParts.shift() || '') : (row.first_name || ''),
    lastName: linkedIndiv ? pParts.join(' ') : (row.last_name || ''),
    orgName: row.org_name || '',
    contactPerson: row.contact_person || '',
    name,
    asRecordedName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    devoteeId: row.devotee_id || null,
    devoteeCode: row.devotee_code || null,
    mobile: (row.devotee_id != null && row.dev_mobile != null) ? row.dev_mobile : (row.mobile || ''),
    city: (row.devotee_id != null && row.dev_city != null) ? row.dev_city : (row.city || ''),
    state: (row.devotee_id != null && row.dev_state != null) ? row.dev_state : (row.state || 'Gujarat'),
    committee: row.committee || '',
    pan: row.pan || '',
    notes: row.notes || '',
    addedDate: row.added_date || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapDonation(row) {
  if (!row) return null;
  return {
    id: row.code || row.id,
    uuid: row.id,
    code: row.code || '',
    receiptNo: row.receipt_no || '',
    certNo: row.cert_no || '',
    donorId: row.donor_code || String(row.donor_id),
    categoryId: row.category_code || String(row.category_id),
    mode: row.mode || 'Cash',
    amount: Number(row.amount || 0),
    item: row.item || '',
    qty: row.qty || '',
    valuation: Number(row.valuation || 0),
    value: Number(row.amount || 0) || Number(row.valuation || 0),   // donationValue()
    date: row.date,
    purpose: row.purpose || '',
    committee: row.committee || '',
    status: row.status || 'received',
    certificateIssued: !!row.certificate_issued,
    notes: row.notes || '',
    recordedBy: row.recorded_by || '',
    recordedByUserId: row.recorded_by_user_id || null,
    recordedByName: row.recorded_by_name || row.recorded_by || '',
    donorName: row.donor_name || '',
    categoryName: row.category_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapPoojaType(row) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    name: row.name,
    category: row.category || '',
    description: row.description || '',
    defaultDurationMin: Number(row.default_duration_min || 60),
    suggestedOfferings: row.suggested_offerings || '',
    icon: row.icon || '',
  };
}

function mapPoojaSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    poojaId: row.pooja_id,
    label: row.label || '',
    date: row.date,
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    venue: row.venue || '',
  };
}

function mapSevarthi(row) {
  if (!row) return null;
  const p = personIdentity(row);
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    devoteeId: row.devotee_id || null,
    devoteeCode: p.devoteeCode,
    firstName: p.firstName,
    lastName: p.lastName,
    name: p.name,
    mobile: p.mobile,
    city: p.city,
    state: p.state,
    asRecordedName: p.asRecordedName,
    committee: row.committee || '',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    notes: row.notes || '',
    addedDate: row.added_date || row.created_at,
  };
}

function mapGuest(row) {
  if (!row) return null;
  const p = personIdentity(row);
  // the per-pooja role comes from the pooja_guest_links row (link_role); fall
  // back to the legacy guests.role column for un-migrated / registry-level reads
  const role = row.link_role != null ? row.link_role : (row.role || '');
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    devoteeId: row.devotee_id || null,
    devoteeCode: p.devoteeCode,
    firstName: p.firstName,
    lastName: p.lastName,
    name: p.name,
    role: role,
    title: role,
    mobile: p.mobile,
    city: p.city,
    state: p.state,
    asRecordedName: p.asRecordedName,
    notes: row.notes || '',
  };
}

function mapPooja(row, extra = {}) {
  if (!row) return null;
  let custom = [], invitation = {};
  try { custom = JSON.parse(row.custom_json || '[]'); } catch (_) {}
  try { invitation = JSON.parse(row.invitation_json || '{}'); } catch (_) {}
  return {
    id: row.code || row.id,
    uuid: row.id,
    code: row.code || '',
    typeId: row.type_code || (row.type_id != null ? String(row.type_id) : null),
    name: row.name,
    scheduleMode: row.schedule_mode || 'single',
    defaultVenue: row.default_venue || '',
    status: row.status || 'planned',
    color: row.color || '#6B1F2A',
    estimatedSevaAmount: Number(row.estimated_seva_amount || 0),
    notes: row.notes || '',
    custom,
    invitation,
    extendedUntil: row.extended_until || null,
    completedOn: row.completed_on || null,
    createdDate: row.created_date || row.created_at,
    sessions: extra.sessions || [],
    sevarthiIds: extra.sevarthiIds || [],
    coordinatorIds: extra.coordinatorIds || [],          // devotee codes (person identity)
    coordinatorUserIds: extra.coordinatorUserIds || [],  // account ids, where an account exists
    guests: extra.guests || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapCommittee(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    name: row.name,
    leaderId: row.leader_id || null,
    leaderDevoteeId: row.leader_devotee_id || null,
    samaj: row.samaj || '',
    purpose: row.purpose || '',
    color: row.color || '#6B1F2A',
    expectedSize: Number(row.expected_size || 0),
    status: row.status || 'active',
    notes: row.notes || '',
    createdDate: row.created_date || row.created_at,
    members: extra.members || [],
    meetings: extra.meetings || [],
    communication: extra.communication || null,
    drafts: extra.drafts || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapCommitteeMember(row) {
  if (!row) return null;
  const p = personIdentity(row);
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    committeeId: row.committee_id,
    devoteeId: row.devotee_id || null,
    devoteeCode: p.devoteeCode,
    firstName: p.firstName,
    lastName: p.lastName,
    name: p.name,
    mobile: p.mobile,
    city: p.city,
    state: p.state,
    asRecordedName: p.asRecordedName,
    role: row.role || 'Member',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    notes: row.notes || '',
    joinedDate: row.joined_date || row.created_at,
  };
}

function mapMeeting(row, attendance = []) {
  if (!row) return null;
  let memberIds = [];
  try { memberIds = JSON.parse(row.member_ids_json || '[]'); } catch (_) {}
  return {
    id: row.code || row.id,
    uuid: row.id,
    code: row.code || '',
    committeeId: row.committee_id,
    title: row.title,
    date: row.date,
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    venue: row.venue || '',
    agenda: row.agenda || '',
    memberIds,
    notes: row.notes || '',
    completed: !!row.completed,
    attendance,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapCommunication(row) {
  if (!row) return { groupName: '', groupLink: '', broadcastName: '', broadcastLink: '' };
  return {
    groupName: row.group_name || '',
    groupLink: row.group_link || '',
    broadcastName: row.broadcast_name || '',
    broadcastLink: row.broadcast_link || '',
    updatedAt: row.updated_at || null,
  };
}

function mapDraft(row) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    title: row.title || '',
    message: row.message || '',
    updatedAt: row.updated_at || null,
  };
}

function mapAttendance(row) {
  if (!row) return null;
  return {
    id: row.id,
    contextType: row.context_type,
    contextId: row.context_id,
    memberId: row.member_id,
    status: row.status,
    markedAt: row.marked_at,
  };
}

function mapTeam(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    name: row.name,
    leadId: row.lead_id || null,
    leadDevoteeId: row.lead_devotee_id || null,
    description: row.description || '',
    color: row.color || '#6B1F2A',
    expectedTeamSize: Number(row.expected_team_size || 0),
    status: row.status || 'active',
    notes: row.notes || '',
    createdDate: row.created_date || row.created_at,
    members: extra.members || [],
    sessions: extra.sessions || [],
    publicPage: extra.publicPage || null,
    communication: extra.communication || null,
    drafts: extra.drafts || [],
    pendingSignups: extra.pendingSignups != null ? extra.pendingSignups : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapTeamMember(row) {
  if (!row) return null;
  const p = personIdentity(row);
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    teamId: row.team_id,
    devoteeId: row.devotee_id || null,
    devoteeCode: p.devoteeCode,
    firstName: p.firstName,
    lastName: p.lastName,
    name: p.name,
    mobile: p.mobile,
    city: p.city,
    state: p.state,
    asRecordedName: p.asRecordedName,
    role: row.role || 'Volunteer',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    notes: row.notes || '',
    joinedDate: row.joined_date || row.created_at,
  };
}

function mapVolunteeringSession(row, attendance = []) {
  if (!row) return null;
  let memberIds = [];
  try { memberIds = JSON.parse(row.member_ids_json || '[]'); } catch (_) {}
  return {
    id: row.code || row.id,
    uuid: row.id,
    code: row.code || '',
    teamId: row.team_id,
    title: row.title,
    date: row.date,
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    location: row.location || '',
    memberIds,
    notes: row.notes || '',
    completed: !!row.completed,
    publicOpen: !!row.public_open,
    attendance,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapPublicPage(row) {
  if (!row) return { enabled: false, intro: '', contact: '' };
  return {
    enabled: !!row.enabled,
    intro: row.intro || '',
    contact: row.contact || '',
    updatedAt: row.updated_at || null,
  };
}

function mapSignup(row) {
  if (!row) return null;
  return {
    id: row.code || row.id,
    uuid: row.id,
    code: row.code || '',
    teamId: row.team_id,
    sessionId: row.session_id,
    name: row.name,
    mobile: row.mobile || '',
    city: row.city || '',
    note: row.note || '',
    status: row.status || 'pending',
    submittedAt: row.submitted_at,
  };
}

function mapEventType(row) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    name: row.name,
    category: row.category || '',
    icon: row.icon || '',
    description: row.description || '',
  };
}

function mapEvent(row, days = []) {
  if (!row) return null;
  return {
    id: row.code || row.id,
    uuid: row.id,
    code: row.code || '',
    typeId: row.type_code || (row.type_id != null ? String(row.type_id) : null),
    name: row.name,
    venue: row.venue || '',
    inChargeId: row.in_charge_id || null,
    inChargeDevoteeId: row.in_charge_devotee_id || null,
    expectedFootfall: Number(row.expected_footfall || 0),
    budget: Number(row.budget || 0),
    status: row.status || 'planning',
    color: row.color || '#C96A20',
    notes: row.notes || '',
    days: days.map(d => ({ id: d.id, date: d.date, startTime: d.start_time || '', endTime: d.end_time || '' })),
    createdDate: row.created_date || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapVisit(row) {
  if (!row) return null;
  const linked = row.devotee_id != null && row.dev_name != null;
  return {
    id: row.code || row.id,
    uuid: row.id,
    code: row.code || '',
    devoteeName: linked ? String(row.dev_name || '').trim() : (row.devotee_name || ''),
    asRecordedName: row.devotee_name || '',
    devoteeId: row.devotee_id || null,
    devoteeCode: row.devotee_code || null,
    mobile: linked && row.dev_mobile != null ? row.dev_mobile : (row.mobile || ''),
    purpose: row.purpose || 'other',
    address: row.address || '',
    city: linked && row.dev_city != null ? row.dev_city : (row.city || ''),
    state: linked && row.dev_state != null ? row.dev_state : (row.state || 'Gujarat'),
    date: row.date,
    time: row.time || '',
    escortTeam: row.escort_team || '',
    escortTeamId: row.escort_team_id || null,
    escortTeamName: row.escort_team_name || row.escort_team || '',
    status: row.status || 'requested',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapExpense(row) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    title: row.title,
    category: row.category || '',
    amount: Number(row.amount || 0),
    date: row.date,
    status: row.status || 'Pending',
    createdAt: row.created_at,
  };
}

function mapInventory(row) {
  if (!row) return null;
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    item: row.item,
    category: row.category || '',
    stock: row.stock || '',
    minStock: row.min_stock || '',
    status: row.status || 'In Stock',
    createdAt: row.created_at,
  };
}

function mapAnnualEvent(row, year) {
  if (!row) return null;
  let overrides = {};
  try { overrides = JSON.parse(row.overrides_json || '{}'); } catch (_) {}
  const ev = {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    name: row.name,
    name_gu: row.name_gu || '',
    name_hi: row.name_hi || '',
    activity: row.activity || '',
    activity_gu: row.activity_gu || '',
    activity_hi: row.activity_hi || '',
    type: row.type,
    masa: row.masa || '',
    paksha: row.paksha || '',
    tithi: Number(row.tithi || 0),
    fixedMonth: Number(row.fixed_month || 0),
    fixedDay: Number(row.fixed_day || 0),
    overrides,
    description: row.description || '',
    notes: row.notes || '',
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
  if (year) {
    try {
      const { resolveDate } = require('../services/panchang');
      const r = resolveDate(ev, year);
      ev.year = Number(year);
      ev.gregorianDate = r.date;
      ev.dateSource = r.source;   // 'pinned' | 'fixed' | 'calculated'
    } catch (_) {}
  }
  return ev;
}

function mapDhajaCampaign(row, extra = {}) {
  if (!row) return null;
  const target = Number(row.target_count || 0);
  const sponsored = extra.sponsoredCount != null ? Number(extra.sponsoredCount) : 0;
  return {
    id: row.code || String(row.id),
    uuid: row.id,
    code: row.code || '',
    name: row.name,
    nameGu: row.name_gu || '',
    targetCount: target,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    annualEventId: row.annual_event_id || null,
    annualEventCode: row.annual_event_code || null,
    status: row.status || 'open',
    notes: row.notes || '',
    sponsoredCount: sponsored,
    raisedAmount: extra.raisedAmount != null ? Number(extra.raisedAmount) : 0,
    remaining: extra.remaining != null
      ? Number(extra.remaining)
      : (target > 0 ? Math.max(0, target - sponsored) : null),
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapDhajaPooja(row) {
  if (!row) return null;
  return {
    id: row.code || row.id,
    uuid: row.id,
    code: row.code || '',
    campaignId: row.campaign_code || (row.campaign_id != null ? String(row.campaign_id) : null),
    seqNo: row.seq_no != null ? Number(row.seq_no) : null,
    devoteeId: row.devotee_id || null,        // numeric devotees.id — hydrate.devCode() converts
    devoteeCode: row.devotee_code || null,    // 'DEV-###' from the join, for consumers outside hydrate
    sponsorName: row.sponsor_name || '',
    sponsorMobile: row.sponsor_mobile || '',
    annualEventId: row.annual_event_id || null,
    annualEventCode: row.annual_event_code || null,
    scheduledDate: row.scheduled_date || '',
    performedDate: row.performed_date || '',
    pledgeAmount: Number(row.pledge_amount || 0),
    donationId: row.donation_code || row.donation_id || null,
    receiptNo: row.receipt_no || '',
    status: row.status || 'sponsored',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function mapSession(row, currentJti) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userAgent: row.user_agent,
    ip: row.ip,
    impersonatedBy: row.impersonated_by || null,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    current: currentJti != null && row.id === currentJti,
  };
}

function mapAudit(row) {
  if (!row) return null;
  let details = {};
  try { details = JSON.parse(row.details_json || '{}'); } catch (_) {}
  return {
    id: row.id,
    userId: row.user_id || null,
    userEmail: row.user_email || '',
    module: row.module || '',
    action: row.action,
    entityType: row.entity_type || '',
    entityId: row.entity_id || '',
    scopeId: row.scope_id || '',
    details,
    createdAt: row.created_at,
  };
}

module.exports = {
  mapUser, mapDevotee, mapSession, mapAudit,
  mapDonationCategory, mapDonor, mapDonation,
  mapPoojaType, mapPoojaSession, mapSevarthi, mapGuest, mapPooja,
  mapCommittee, mapCommitteeMember, mapMeeting, mapCommunication, mapDraft, mapAttendance,
  mapTeam, mapTeamMember, mapVolunteeringSession, mapPublicPage, mapSignup,
  mapEventType, mapEvent, mapVisit, mapExpense, mapInventory,
  mapAnnualEvent,
  mapDhajaCampaign, mapDhajaPooja,
};
