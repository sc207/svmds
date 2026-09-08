/* Thin data helpers for users + roles, shared by routes/auth.js and routes/users.js.
   No req/res here. */
const { queryAll, queryOne, run } = require('../db/connection');

async function rolesOf(userId) {
  const rows = await queryAll('SELECT role FROM user_roles WHERE user_id = ?', [userId]);
  return rows.map(r => r.role);
}

/** Full user row + roles[] by id, or null. */
async function getUser(id) {
  const row = await queryOne('SELECT * FROM users WHERE id = ? AND is_deleted = 0', [id]);
  if (!row) return null;
  row.roles = await rolesOf(row.id);
  return row;
}

/** Active, non-deleted user by email (case-insensitive) + roles[], or null. */
async function getActiveUserByEmail(email) {
  const row = await queryOne(
    'SELECT * FROM users WHERE lower(email) = ? AND active = 1 AND is_deleted = 0',
    [String(email).toLowerCase().trim()]
  );
  if (!row) return null;
  row.roles = await rolesOf(row.id);
  return row;
}

async function listUsers() {
  const rows = await queryAll(
    'SELECT * FROM users WHERE is_deleted = 0 ORDER BY id'
  );
  for (const r of rows) r.roles = await rolesOf(r.id);
  return rows;
}

/** Record the Google subject id (and fill name if empty) on first sign-in. */
async function linkGoogle(userId, sub, name) {
  await run(
    `UPDATE users
       SET google_sub = COALESCE(google_sub, ?),
           name       = CASE WHEN name = '' THEN ? ELSE name END,
           updated_at = datetime('now')
     WHERE id = ?`,
    [sub || null, name || '', userId]
  );
}

module.exports = { rolesOf, getUser, getActiveUserByEmail, listUsers, linkGoogle };
