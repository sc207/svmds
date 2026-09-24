/* Shri Vihat Meldi Dham — Sanand
   Phase 1: Murti Pran Pratishtha Mahotsav sevarthi & contribution tracking,
   behind the portal's Google Sign-In, sessions and Accounts & Access.

   Boot: migrations → invariant repairs → receipt backfill → ADMIN_EMAIL
   superadmin → listen. A deploy only installs and starts; it never wipes. */
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const config = require('./config');
require('./util/async-routes');                 // async handlers → next(err)
const db = require('./db');
const { runMigrations, bootRepairs } = require('./db/migrate');
const { notFound, errorHandler } = require('./middleware/error');
const { authRequired, readSession } = require('./middleware/auth');
const { requireAnyRole } = require('./middleware/authz');

/* ---- fail-fast: production needs a strong secret and a real database ---- */
if (config.isProd && (!process.env.JWT_SECRET ||
    config.jwtSecret === 'dev-secret-change-in-production' || config.jwtSecret.length < 32)) {
  console.error('FATAL: JWT_SECRET must be a strong 32+ character value in production.');
  process.exit(1);
}
/* Without TURSO_* the driver falls back to a local file, which Render wipes
   on every restart / deploy — every sevarthi and payment would vanish. */
if (config.isProd && !(config.turso.url && config.turso.token)) {
  console.error('FATAL: NODE_ENV=production but TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.\n' +
    'The server would write to an ephemeral local file and lose all data on the next restart.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/client'],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
      styleSrcAttr:   ["'unsafe-inline'"],
      fontSrc:        ["'self'", 'data:'],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
      connectSrc:     ["'self'", 'https://accounts.google.com'],
      frameSrc:       ['https://accounts.google.com'],
      objectSrc:      ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

/* Google Identity Services uses the FedCM credential API from this origin. */
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'identity-credentials-get=(self "https://accounts.google.com")');
  next();
});

app.use(cors((req, cb) => {
  /* The iOS redirect sign-in is a real top-level form POST from
     accounts.google.com — let that one path through the allowlist. */
  if (req.path === '/api/auth/google/redirect') return cb(null, { origin: true, credentials: true });
  const origin = req.headers.origin;
  const allowed = !origin || !config.allowedOrigins.length || config.allowedOrigins.includes(origin);
  cb(allowed ? null : new Error('Not allowed by CORS'), { origin: allowed, credentials: true });
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/api/auth/google', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many sign-in attempts' } }));

/* Health + DB diagnostic. No auth, no PII — infra status and counts only. */
app.get('/health', async (req, res) => {
  const info = { status: 'ok', env: config.nodeEnv, tursoConfigured: !!(config.turso.url && config.turso.token),
    adminEmailSet: !!config.adminEmail, db: null, counts: null };
  try {
    await db.init();
    info.db = db.isTurso() ? 'turso (persistent)' : 'local-file';
    try {
      const n = async (t, w = '') => Number((await db.get(`SELECT COUNT(*) AS n FROM ${t} ${w}`)).n);
      info.counts = {
        users: await n('users', 'WHERE is_deleted = 0'),
        activeSessions: await n('sessions', 'WHERE revoked = 0'),
        devotees: await n('devotees'),
        bookings: await n('sevarthi_bookings'),
        payments: await n('payments'),
      };
    } catch (e) { info.counts = { error: e.message }; }
  } catch (e) { info.status = 'degraded'; info.db = 'ERROR: ' + e.message; }
  res.json(info);
});

/* ---- API ---- */
app.use('/api/auth', require('./routes/auth'));             // public: Google sign-in

app.use('/api', authRequired);                              // everything below needs a session
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/legacy-backup', require('./routes/legacyBackup'));   // TEMPORARY, super admin only
app.use('/api', requireAnyRole);                            // …and an account with a role

app.use('/api/lookups', require('./routes/lookups'));
app.use('/api/devotees', require('./routes/devotees').router);
app.use('/api/poojas', require('./routes/poojas').router);
app.use('/api/bookings', require('./routes/bookings').router);
app.use('/api/payments', require('./routes/payments'));
app.use('/api/donations', require('./routes/donations'));
app.use('/api/visits', require('./routes/visits'));
app.use('/api/import', require('./routes/import'));         // mounts its own express.raw
app.use('/api/annual-events', require('./routes/annualEvents'));
app.use('/api/reminders', require('./routes/reminders'));   // opening announcements
app.use('/api', require('./routes/misc'));                  // /dashboard /calendar /settings /audit
app.use('/api', (req, res) => res.status(404).json({ error: 'No such API route' }));

/* ---- front end ----
   The app shell needs a session; without one, go to the Google sign-in
   page. CSS / JS / fonts / images are public (the login page uses them).
   HTML, CSS, JS and the icon sprite revalidate every load so an update
   never leaves an operator on a stale screen; fonts and images cache for
   a week (replaced by adding a new file, never by editing one). */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

async function shell(req, res, next) {
  try {
    if (!(await readSession(req))) return res.redirect('/login');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  } catch (e) { next(e); }
}
app.get(['/', '/index.html'], shell);
app.get(['/login', '/login.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});
app.use(express.static(PUBLIC_DIR, {
  index: false,
  etag: true,
  setHeaders(res, filePath) {
    if (/icons\.svg$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    else if (/\.(woff2?|png|jpe?g|svg|ico)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.use(notFound);
app.use(errorHandler);

async function start() {
  console.log(`▶ Shri Vihat Meldi Dham — ${config.nodeEnv} — ${db.where()}`);
  await runMigrations();
  await bootRepairs();
  /* Receipt numbers are issued, not typed: fill any blanks and lift each
     series past anything hand-typed so an issued number cannot collide. */
  await require('./util/receipts').backfillMissing();
  await require('./services/bootstrap').ensureAdminUser();

  const port = process.env.PORT || config.port || 3000;
  const server = app.listen(port, () => console.log(`✔ listening on http://localhost:${port}  (health: /health)`));

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close(async () => { await db.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 1500).unref();
  };
  ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].forEach((s) => process.on(s, shutdown));
}

if (require.main === module) {
  start().catch((err) => { console.error('BOOT FAILED:', err.message || err); process.exit(1); });
}

module.exports = app;
