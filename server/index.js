/* SVMMMS — Shri Vihat Meldi Mata Mandir — backend entry.
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
const { seedReferenceData } = require('./db/seed/reference-data');
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
      scriptSrc:      ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcAttr:   ["'unsafe-inline'"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:         ["'self'", "data:", "blob:"],
      connectSrc:     ["'self'"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

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

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many OTP requests' } });
app.use('/api/auth/request-setup-otp', otpLimiter);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

/* ============================================================
   API ROUTERS — mounted here from Phase 2 onward.
     app.use('/api/auth', require('./routes/auth'));          // public
     app.use('/api/public', require('./routes/publicSignups').publicRouter); // unauth signup
     app.use('/api', require('./middleware/auth').authRequired);
     app.use('/api', require('./middleware/authz').attachScope);
     app.use('/api/settings', require('./routes/settings'));
     app.use('/api/devotees', require('./routes/devotees'));
     … (one Router per resource — see BACKEND_PLAN.md §4.4)
   ============================================================ */
app.use('/api', (req, res) => res.status(501).json({ error: 'API not implemented yet (Phase 2+)' }));

/* ---- static front-end (Phase 6: `git mv index.html css assets js public/`) ---- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get(['/login', '/login.html'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
} else {
  console.warn('⚠ public/ not found — front-end not served (still Phase 0). Run the git mv in Phase 6.');
}

app.use(notFound);
app.use(errorHandler);

async function start() {
  console.log(`▶ SVMMMS backend — ${config.nodeEnv}`);
  await runMigrations();
  await seedReferenceData();
  // Phase 2: await require('./services/bootstrap').ensureAdminUser();
  // Phase 4: if (process.argv.includes('--demo')) await require('./db/seed/demo-data').seedDemoData();
  const port = process.env.PORT || config.port || 3000;
  app.listen(port, () => console.log(`✔ listening on :${port}  (health: /health)`));
}

start().catch(err => { console.error('BOOT FAILED', err); process.exit(1); });

module.exports = app;
