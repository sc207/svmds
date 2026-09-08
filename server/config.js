/* The ONLY module that reads process.env. Everything else imports this. */
require('dotenv').config();

const config = {
  nodeEnv:   process.env.NODE_ENV || 'development',
  isProd:    process.env.NODE_ENV === 'production',
  port:      parseInt(process.env.PORT || '3000', 10),

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  appName:   process.env.APP_NAME || 'Shri Vihat Meldi Mata Mandir',

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
};

module.exports = config;
