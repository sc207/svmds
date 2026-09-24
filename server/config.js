/* The ONLY module that reads process.env. Everything else imports this. */
require('dotenv').config();

/* The mandir works in India time, and Render / Turso run in UTC. Pinning
   the process zone here (this module loads first) makes every JS-side
   "today" (util/dates.js todayLocal) the IST date; SQL defaults use the
   same fixed offset: datetime('now','+330 minutes'). India has no DST. */
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const config = {
  nodeEnv:   process.env.NODE_ENV || 'development',
  isProd:    process.env.NODE_ENV === 'production',
  port:      parseInt(process.env.PORT || '3000', 10),

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  appName:   process.env.APP_NAME || 'Shri Vihat Meldi Dham — Sanand',

  // Google OAuth Web client id — used client-side by the GIS button and
  // server-side as the ID-token audience to verify. No client secret needed.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  turso: {
    url:   process.env.TURSO_DATABASE_URL || '',
    token: process.env.TURSO_AUTH_TOKEN || '',
  },

  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean),

  sessionDays: parseInt(process.env.SESSION_DAYS || '7', 10),

  // The commit being run — Render provides it; shown by /health.
  gitCommit: process.env.RENDER_GIT_COMMIT || '',
};

module.exports = config;
