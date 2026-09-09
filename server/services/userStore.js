/* Thin data helpers for users + roles, shared by routes/auth.js and routes/users.js.
   No req/res here. */
const { queryAll, queryOne, run } = require('../db/connection');

async function rolesOf(userId) {
  const rows = await queryAll('SELECT role FROM user_roles WHERE user_id = ?', [userId]);
  return rows.map(r => r.role);
}

const USER_SELECT =
  'SELECT u.*, d.code AS devotee_code FROM users u LEFT JOIN devotees d ON d.id = u.devotee_id';

/** Full user row (+ devotee_code) + roles[] by id, or null. */
async function getUser(id) {
  const row = await queryOne(`${USER_SELECT} WHERE u.id = ? AND u.is_deleted = 0`, [id]);
  if (!row) return null;
  row.roles = await rolesOf(row.id);
  return row;
}

/** Active, non-deleted user by email (case-insensitive) + roles[], or null. */
async function getActiveUserByEmail(email) {
  const row = await queryOne(
    `${USER_SELECT} WHERE lower(u.email) = ? AND u.active = 1 AND u.is_deleted = 0`,
    [String(email).toLowerCase().trim()]
  );
  if (!row) return null;
  row.roles = await rolesOf(row.id);
  return row;
}

async function listUsers() {
  const rows = await queryAll(`${USER_SELECT} WHERE u.is_deleted = 0 ORDER BY u.id`);
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
