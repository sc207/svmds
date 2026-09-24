/* Audit trail. Every write path calls `await log(req, {...})` so the
   Accounts & Access page can answer "who did what, when". The acting
   user is the signed-in Google account (req.user), never a header the
   browser could set. Inside db.tx() the row joins the transaction, so a
   write that rolls back leaves no audit row claiming it happened. */
const db = require('../db');

function userOf(req) {
  const u = req && req.user;
  return (u && (u.name || u.email)) || 'System';
}

async function log(req, { action, entity, entityId = null, summary = '', details = null }) {
  const u = (req && req.user) || {};
  await db.run(
    `INSERT INTO audit_log (user_id, user_email, user_name, action, entity, entity_id, summary, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    u.id || null, u.email || null, userOf(req), action, entity,
    entityId == null ? null : entityId, summary, details ? JSON.stringify(details) : null);
}

module.exports = { log, userOf };
