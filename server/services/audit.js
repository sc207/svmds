/* Append-only audit trail. Call logAudit() from every mutation (BACKEND_PLAN.md §3).
   audit_logs.id is a TEXT uuid (no AUTOINCREMENT) — we mint it here. */
const crypto = require('crypto');
const { run } = require('../db/connection');

async function logAudit({
  userId, userEmail, module = '', action,
  entityType = '', entityId = '', scopeId = '', details = {},
} = {}) {
  try {
    await run(
      `INSERT INTO audit_logs
         (id, user_id, user_email, module, action, entity_type, entity_id, scope_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        userId || null,
        userEmail || '',
        module || '',
        action,
        entityType || '',
        String(entityId || ''),
        String(scopeId || ''),
        JSON.stringify(details || {}),
      ]
    );
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}

module.exports = { logAudit };
