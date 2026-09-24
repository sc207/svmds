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

  // Is there ALREADY a superadmin (any address)? If so we must never mint a
  // second one — a typo in ADMIN_EMAIL previously created a duplicate.
  const existingSuper = await queryOne(
    `SELECT u.id, u.email FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
     WHERE ur.role = 'superadmin' AND u.is_deleted = 0
     LIMIT 1`
  );

  if (!user) {
    if (existingSuper) {
      console.warn(
        `⚠ ADMIN_EMAIL (${email}) has no account, but a superadmin already exists ` +
        `(${existingSuper.email}). NOT creating a second superadmin. If ADMIN_EMAIL ` +
        `is wrong, fix it; if it is a genuine new owner, add the account from ` +
        `Accounts & Access and grant it there.`
      );
      return;
    }
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
    if (existingSuper && existingSuper.id !== user.id) {
      console.warn(
        `⚠ ${email} exists but is not superadmin, and ${existingSuper.email} already is. ` +
        `Not granting a second superadmin. Fix ADMIN_EMAIL or manage roles from the UI.`
      );
      return;
    }
    await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [user.id, 'superadmin']);
    console.log(`  ✓ granted superadmin role to ${email}`);
  }
}

module.exports = { ensureAdminUser };
