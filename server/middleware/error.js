const path = require('path');
const fs = require('fs');
const config = require('../config');

const NOT_FOUND_PAGE = path.join(__dirname, '..', '..', 'public', '404.html');

/* Every /api/* path is already fully handled above this in server/index.js
   (mounted routers + its own catch-all 404 JSON response), so anything
   reaching this middleware is a genuinely unknown front-end URL — not a
   static file, not index.html/login.html/yagna.html. A browser gets the
   branded 404 page; a non-browser client (fetch/curl without an HTML
   Accept header) gets a plain JSON 404 instead. */
function notFound(req, res) {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  if (req.accepts('html') && fs.existsSync(NOT_FOUND_PAGE)) {
    return res.status(404).sendFile(NOT_FOUND_PAGE);
  }
  res.status(404).json({ error: 'Not found' });
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
