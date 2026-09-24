/* Audit for the account / session routes carried over from the portal
   (auth.js, users.js, sessions.js). Same table as every Phase 1 write —
   audit_log — so Accounts & Access shows one trail. Never throws: a
   failed audit row must not fail a sign-in. */
const db = require('../db');

async function logAudit({ userId, userEmail, userName, module = '', action,
  entityType = '', entityId = null, details = {} } = {}) {
  try {
    const verb = String(action || '').toLowerCase();
    const what = entityType || module.toLowerCase() || 'account';
    const target = details && (details.email || details.targetEmail || details.role);
    const summary = `${verb} ${what}${target ? ' — ' + target : ''}`;
    await db.run(
      `INSERT INTO audit_log (user_id, user_email, user_name, action, entity, entity_id, summary, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      userId || null, userEmail || '', userName || userEmail || 'System', verb, what,
      entityId == null || entityId === '' ? null : entityId, summary, JSON.stringify(details || {}));
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}

module.exports = { logAudit };
