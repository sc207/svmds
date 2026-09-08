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

module.exports = { mapUser, mapDevotee, mapSession, mapAudit };
