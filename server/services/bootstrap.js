/* ensureAdminUser — idempotent on every boot. Guarantees the ADMIN_EMAIL Google
   address exists as an active `superadmin`. Fixes the ChallanPro gap where the
   first admin was only documented, never created. (BACKEND_PLAN.md §9) */
const config = require('../config');
const { queryOne, run } = require('../db/connection');

async function ensureAdminUser() {
  const email = config.adminEmail;
  if (!email) {
    console.warn('⚠ ADMIN_EMAIL not set — no superadmin bootstrapped. Set it and reboot.');
    return;
  }

  let user = await queryOne('SELECT * FROM users WHERE lower(email) = ?', [email]);

  if (!user) {
    await run(
      'INSERT INTO users (email, name, active) VALUES (?, ?, 1)',
      [email, 'Administrator']
    );
    user = await queryOne('SELECT * FROM users WHERE lower(email) = ?', [email]);
    console.log(`  ✓ created superadmin user ${email}`);
  } else if (!user.active || user.is_deleted) {
    await run('UPDATE users SET active = 1, is_deleted = 0 WHERE id = ?', [user.id]);
    console.log(`  ✓ re-activated superadmin user ${email}`);
  }

  const hasRole = await queryOne(
    'SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND role = ?',
    [user.id, 'superadmin']
  );
  if (!hasRole) {
    await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [user.id, 'superadmin']);
    console.log(`  ✓ granted superadmin role to ${email}`);
  }
}

module.exports = { ensureAdminUser };
