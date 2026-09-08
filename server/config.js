/* The ONLY module that reads process.env. Everything else imports this. */
require('dotenv').config();

const config = {
  nodeEnv:   process.env.NODE_ENV || 'development',
  isProd:    process.env.NODE_ENV === 'production',
  port:      parseInt(process.env.PORT || '3000', 10),

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  appName:   process.env.APP_NAME || 'Shri Vihat Meldi Mata Mandir',

  smtp: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_APP_PASSWORD || '',
  },
  smtpFrom:  process.env.SMTP_FROM || process.env.SMTP_USER || '',

  turso: {
    url:   process.env.TURSO_DATABASE_URL || '',
    token: process.env.TURSO_AUTH_TOKEN || '',
  },

  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean),

  otpTtlMin:   parseInt(process.env.OTP_TTL_MIN || '10', 10),
  sessionDays: parseInt(process.env.SESSION_DAYS || '7', 10),
};

module.exports = config;
