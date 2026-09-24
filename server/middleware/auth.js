/* Session-cookie guard. The cookie is OUR JWT (issued after Google verifies the
   user), not a Google token. Every JWT carries a `jti` that must map to a live
   (non-revoked) `sessions` row, so a device can be listed and remotely logged
   out. */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { queryOne, run } = require('../db/connection');

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

/* Everything authRequired needs — the session, the LIVE account and its
   roles — in ONE round trip. On Turso every query is a network hop (~50ms
   from Render), and this runs before every API call, so it was four hops
   (session, user, roles, last_seen) ahead of any page data. */
const SESSION_ACCOUNT = `
  SELECT s.revoked, s.user_id,
         (s.last_seen < datetime('now', '-5 minutes')) AS stale,
         u.id, u.email, u.name, u.active, u.is_deleted,
         (SELECT group_concat(role) FROM user_roles WHERE user_id = u.id) AS roles
    FROM sessions s JOIN users u ON u.id = s.user_id
   WHERE s.id = ?`;

/** Gate: 401 unless a live session cookie is present. */
async function authRequired(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE];
    let payload = null;
    try { payload = token ? jwt.verify(token, config.jwtSecret) : null; } catch (_) { payload = null; }
    if (!payload || !payload.jti) return res.status(401).json({ error: 'Please sign in' });

    /* The JWT's roles are a snapshot from sign-in. Read the live account
       instead, so a role granted (or an account disabled) takes effect on
       the next request rather than at the next sign-in. */
    const row = await queryOne(SESSION_ACCOUNT, [payload.jti]);
    if (!row || row.revoked || row.id !== payload.id || !row.active || row.is_deleted) {
      return res.status(401).json({ error: 'Please sign in' });
    }
    /* last_seen is "roughly when" — refresh it at most every 5 minutes, so
       reads do not each queue a write behind the real ones. */
    if (row.stale) {
      run("UPDATE sessions SET last_seen = datetime('now') WHERE id = ?", [payload.jti]).catch(() => {});
    }
    const roles = row.roles ? String(row.roles).split(',') : [];
    req.user = { ...payload, email: row.email, name: row.name || '', roles };
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { COOKIE, signToken, cookieOptions, clearCookieOptions, readSession, authRequired };
