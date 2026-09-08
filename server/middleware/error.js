const config = require('../config');

function notFound(req, res, next) {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  next();
}

/* Global backstop. Never leak stack traces or SQL in production. */
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: config.isProd && status >= 500 ? 'Internal server error' : (err.message || 'Error'),
  });
}

module.exports = { notFound, errorHandler };
