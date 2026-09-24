/* Session-cookie guard. The cookie is OUR JWT (issued after Google verifies the
   user), not a Google token. Every JWT carries a `jti` that must map to a live
   (non-revoked) `sessions` row, so a device can be listed and remotely logged
   out. (BACKEND_PLAN.md §5, §6) */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { queryAll, queryOne, run } = require('../db/connection');

const COOKIE = 'token';

function signToken(user, jti, extra = {}) {
  return jwt.sign(
    { id: user.id, email: user.email, roles: user.roles || [], jti, ...extra },
    config.jwtSecret,
    { expiresIn: `${config.sessionDays}d` }
  );
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',                       // survives the top-level return from Google
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  };
}

/* clearCookie must be called with the same attributes minus maxAge/expires. */
function clearCookieOptions() {
  const o = cookieOptions();
  delete o.maxAge;
  return o;
}

/** Verify the cookie; return the decoded payload or null (no throw). */
async function readSession(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (_) {
    return null;
  }
  if (!payload.jti) return null;
  const s = await queryOne('SELECT revoked FROM sessions WHERE id = ?', [payload.jti]);
  if (!s || s.revoked) return null;
  return payload;
}

/** Gate: 401 unless a live session cookie is present. */
async function authRequired(req, res, next) {
  try {
    const payload = await readSession(req);
    if (!payload) return res.status(401).json({ error: 'Please sign in' });
    /* The JWT's roles are a snapshot from sign-in. Read the live account
       instead, so a role granted (or an account disabled) takes effect on
       the next request rather than at the next sign-in. */
    const acct = await queryOne('SELECT id, email, name, active, is_deleted FROM users WHERE id = ?', [payload.id]);
    if (!acct || !acct.active || acct.is_deleted) return res.status(401).json({ error: 'Please sign in' });
    const roles = (await queryAll('SELECT role FROM user_roles WHERE user_id = ?', [acct.id])).map((r) => r.role);
    run("UPDATE sessions SET last_seen = datetime('now') WHERE id = ?", [payload.jti]).catch(() => {});
    req.user = { ...payload, email: acct.email, name: acct.name || '', roles };
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { COOKIE, signToken, cookieOptions, clearCookieOptions, readSession, authRequired };
