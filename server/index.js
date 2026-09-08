/* SVMDS — Shri Vihat Meldi Mata Mandir — backend entry.
   Boot sequence: BACKEND_PLAN.md §1.2.  Phase 0: health + static + migrations.
   API routers are mounted in Phase 2+ where marked below. */
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { runMigrations } = require('./db/migrate');
const { seedPlatform } = require('./db/seed/platform');
const { notFound, errorHandler } = require('./middleware/error');

/* ---- fail-fast: strong JWT secret in production ---- */
if (config.isProd && (
  !process.env.JWT_SECRET ||
  config.jwtSecret === 'dev-secret-change-in-production' ||
  config.jwtSecret.length < 32
)) {
  console.error('FATAL: JWT_SECRET must be a strong 32+ character value in production.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://accounts.google.com/gsi/client"],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com/gsi/style"],
      styleSrcAttr:   ["'unsafe-inline'"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:         ["'self'", "data:", "blob:", "https://images.unsplash.com"],
      connectSrc:     ["'self'", "https://accounts.google.com"],
      frameSrc:       ["https://accounts.google.com"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

/* Let Google Identity Services use the FedCM credential API from this origin
   (needed by the "Sign in with Google" button on modern Chrome). */
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'identity-credentials-get=(self "https://accounts.google.com")');
  next();
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || !config.allowedOrigins.length || config.allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many sign-in attempts' } });
app.use('/api/auth/google', authLimiter);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

/* ============================================================
   API ROUTERS
   Phase 2 (live): auth + sessions + users.
   Phase 3+ adds one protected Router per resource below the guard —
   see BACKEND_PLAN.md §4.4.
   ============================================================ */
const { authRequired } = require('./middleware/auth');
const { attachScope } = require('./middleware/authz');

app.use('/api/auth', require('./routes/auth'));                 // public
app.use('/api/public', require('./routes/publicSignups'));      // public (no session)

app.use('/api', authRequired);                                  // everything below needs a session
app.use('/api', attachScope);

app.use('/api/settings', require('./routes/settings'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/devotees', require('./routes/devotees'));
app.use('/api/donation-categories', require('./routes/donationCategories'));
app.use('/api/donors', require('./routes/donors'));
app.use('/api/donations', require('./routes/donations'));
app.use('/api/pooja-types', require('./routes/poojaTypes'));
app.use('/api/poojas', require('./routes/poojas'));
app.use('/api/sevarthis', require('./routes/sevarthis'));
app.use('/api/annual-events', require('./routes/annualEvents'));
app.use('/api/committees', require('./routes/committees'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/events', require('./routes/events'));
app.use('/api/visits', require('./routes/visits'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api', require('./routes/derived'));   // /calendar /dashboard /activity /reports

app.use('/api', (req, res) => res.status(404).json({ error: 'No such API route' }));

/* ---- static front-end (moved into public/ in Phase 2) ---- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get(['/login', '/login.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
} else {
  console.warn('⚠ public/ not found — front-end not served. Run: git mv index.html css js assets public/');
}

app.use(notFound);
app.use(errorHandler);

async function start() {
  console.log(`▶ SVMDS backend — ${config.nodeEnv}`);
  await runMigrations();
  await seedPlatform();               // app_settings + counters only — no demo / catalog data
  await require('./services/bootstrap').ensureAdminUser();
  const port = process.env.PORT || config.port || 3000;
  app.listen(port, () => console.log(`✔ listening on :${port}  (health: /health)`));
}

start().catch(err => { console.error('BOOT FAILED', err); process.exit(1); });

module.exports = app;
