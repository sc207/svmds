/* Public auth router.  Google Sign-In → our revocable session cookie.
   (BACKEND_PLAN.md §5, §6) */
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const config = require('../config');
const { COOKIE, signToken, cookieOptions, clearCookieOptions, readSession } = require('../middleware/auth');
const { pagesForUser, isSuperadmin } = require('../middleware/authz');
const { verifyGoogleToken } = require('../services/google');
const { getActiveUserByEmail, getUser, linkGoogle } = require('../services/userStore');
const { logAudit } = require('../services/audit');
const { run } = require('../db/connection');

const router = express.Router();

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name || '', roles: u.roles || [] };
}

/* -------------------- GET /config  (public) -------------------- */
/* login.html reads this to initialise the Google Identity Services button. */
router.get('/config', (req, res) => {
  res.json({ googleClientId: config.googleClientId || '' });
});

async function createSession(user, req, extra = {}) {
  const jti = crypto.randomUUID();
  await run(
    `INSERT INTO sessions (id, user_id, user_email, user_agent, ip, impersonated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      jti, user.id, user.email,
      String(req.headers['user-agent'] || '').slice(0, 300),
      req.ip || '',
      extra.impersonatedBy || null,
    ]
  );
  return jti;
}

/* Verify a Google credential, resolve it to an active SVMDS user, link the
   Google sub, create a session and set the auth cookie. Shared by the JSON
   sign-in (POST /google, used by the Windows/Android popup+FedCM flow) and
   the full-navigation sign-in (POST /google/redirect, used by the iOS GIS
   redirect flow) so both do exactly the same authentication work — only
   how the credential arrives and how the result is returned differ.
   @throws {Error} with a `.status` (401 bad/expired credential, 403 email
   not registered) that the caller maps to its own response shape. */
async function authenticateGoogleCredential(credential, req, res) {
  let profile;
  try {
    profile = await verifyGoogleToken(credential);
  } catch (e) {
    const err = new Error(e.message || 'Google sign-in failed');
    err.status = 401;
    throw err;
  }

  const user = await getActiveUserByEmail(profile.email);
  if (!user) {
    const err = new Error('This Google account has no access — ask an administrator');
    err.status = 403;
    throw err;
  }

  await linkGoogle(user.id, profile.sub, profile.name);

  const jti = await createSession(user, req);
  res.cookie(COOKIE, signToken(user, jti), cookieOptions());
  await logAudit({ userId: user.id, userEmail: user.email, module: 'Auth', action: 'LOGIN' });

  return user;
}

/* -------------------- POST /google -------------------- */
/* Windows/Android (and any non-iOS browser): the GIS popup/FedCM button
   hands the page an ID token, which is POSTed here as JSON via fetch. */
router.post('/google', async (req, res, next) => {
  try {
    const credential = req.body && req.body.credential;
    let user;
    try {
      user = await authenticateGoogleCredential(credential, req, res);
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || 'Sign-in failed' });
    }
    res.json({ user: publicUser(user), pages: pagesForUser(user), isSuperadmin: isSuperadmin(user) });
  } catch (e) {
    next(e);
  }
});

/* -------------------- POST /google/redirect -------------------- */
/* iOS only (public/login.html's isIOS() branch): GIS's ux_mode:'redirect'
   does a full top-level navigation to Google and back, submitting a real
   HTML form to this URL instead of calling back into the page with fetch —
   iOS Safari's popup/FedCM/third-party-cookie restrictions make the normal
   popup button unreliable there. This route must therefore respond with a
   redirect, not JSON, and must never leave the browser hanging mid
   navigation: every failure lands back on /login with a plain, non-technical
   `?error=` code the page already knows how to display — never a raw
   stack trace, a hang, or a silent bounce with no explanation.
   Registering this URL in the Google Cloud OAuth client's "Authorized
   redirect URIs" (a separate list from "Authorized JavaScript origins",
   which stays as-is) is required before this can work, and is done outside
   this codebase. */
router.post('/google/redirect', async (req, res) => {
  const fail = (code) => res.redirect('/login?error=' + encodeURIComponent(code));
  try {
    // Google's documented CSRF protection for redirect mode: it sets a
    // g_csrf_token cookie on this origin and includes the same value as a
    // form field in the POST — both must be present and equal.
    const csrfCookie = req.cookies && req.cookies.g_csrf_token;
    const csrfBody = req.body && req.body.g_csrf_token;
    if (!csrfCookie || !csrfBody || csrfCookie !== csrfBody) {
      return fail('csrf');
    }

    const credential = req.body && req.body.credential;
    if (!credential) return fail('no_credential');

    try {
      await authenticateGoogleCredential(credential, req, res);
    } catch (e) {
      return fail(e.status === 403 ? 'not_authorized' : 'google_failed');
    }

    res.redirect('/');
  } catch (e) {
    console.error('[auth] POST /google/redirect unexpected failure:', e.message);
    fail('server_error');
  }
});

/* -------------------- GET /me -------------------- */
router.get('/me', async (req, res, next) => {
  try {
    const payload = await readSession(req);
    if (!payload) return res.json({ user: null });
    const user = await getUser(payload.id);
    if (!user || !user.active) return res.json({ user: null });
    res.json({
      user: publicUser(user),
      pages: pagesForUser(user),
      isSuperadmin: isSuperadmin(user),
      impersonating: !!payload.impersonating,
    });
  } catch (e) {
    next(e);
  }
});

/* -------------------- POST /logout -------------------- */
async function endSession(req, res) {
  const payload = await readSession(req);
  if (payload && payload.jti) {
    await run('UPDATE sessions SET revoked = 1 WHERE id = ?', [payload.jti]);
    await logAudit({ userId: payload.id, userEmail: payload.email, module: 'Auth', action: 'LOGOUT' });
  }
  res.clearCookie(COOKIE, clearCookieOptions());
}

router.post('/logout', async (req, res, next) => {
  try { await endSession(req, res); res.json({ ok: true }); } catch (e) { next(e); }
});

/* GET /logout — plain-navigation sign-out, lands on the login page. */
router.get('/logout', async (req, res, next) => {
  try { await endSession(req, res); res.redirect('/login'); } catch (e) { next(e); }
});

/* -------------------- POST /impersonate  (superadmin only) -------------------- */
router.post('/impersonate', async (req, res, next) => {
  try {
    const payload = await readSession(req);
    if (!payload) return res.status(401).json({ error: 'Please sign in' });
    const actor = await getUser(payload.id);
    if (!actor || !isSuperadmin(actor)) {
      return res.status(403).json({ error: 'Superadmin only' });
    }
    if (payload.impersonating) {
      return res.status(400).json({ error: 'Already impersonating — stop first' });
    }

    const targetId = parseInt(req.body && req.body.userId, 10);
    const target = targetId ? await getUser(targetId) : null;
    if (!target || !target.active) return res.status(404).json({ error: 'Target user not found' });
    if (isSuperadmin(target)) return res.status(400).json({ error: 'Cannot impersonate another superadmin' });

    const jti = await createSession(target, req, { impersonatedBy: actor.id });
    // short-lived impersonation token (1h), regardless of SESSION_DAYS
    const token = jwt.sign(
      { id: target.id, email: target.email, roles: target.roles || [], jti,
        impersonating: true, impersonatedBy: actor.id },
      config.jwtSecret, { expiresIn: '1h' }
    );
    res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: 60 * 60 * 1000 });
    await logAudit({
      userId: actor.id, userEmail: actor.email, module: 'Auth', action: 'IMPERSONATE',
      entityType: 'user', entityId: target.id, details: { targetEmail: target.email },
    });
    res.json({ user: publicUser(target), pages: pagesForUser(target), impersonating: true });
  } catch (e) {
    next(e);
  }
});

/* -------------------- POST /stop-impersonate -------------------- */
router.post('/stop-impersonate', async (req, res, next) => {
  try {
    const payload = await readSession(req);
    if (payload && payload.jti) {
      await run('UPDATE sessions SET revoked = 1 WHERE id = ?', [payload.jti]);
    }
    res.clearCookie(COOKIE, clearCookieOptions());
    // client then re-runs Google sign-in as itself
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
