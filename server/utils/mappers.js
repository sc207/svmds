/* snake_case DB row → camelCase DTO. One mapX per table the API returns.
   Keep these pure — no db calls, no req/res. (BACKEND_PLAN.md §4.1) */

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    devoteeId: row.devotee_id || null,
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
  const name = (row.org_name && row.org_name.trim())
    ? row.org_name
    : `${row.first_name || ''} ${row.last_name || ''}`.trim();
  return {
    id: row.code || String(row.id),
    rowId: row.id,
    code: row.code || '',
    type: row.type,                    // individual | organization | trust
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    orgName: row.org_name || '',
    contactPerson: row.contact_person || '',
    name,
    mobile: row.mobile || '',
    city: row.city || '',
    state: row.state || 'Gujarat',
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
    donorName: row.donor_name || '',
    categoryName: row.category_name || '',
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
};
