/* Express 4 does not catch a rejected promise from an async handler — the
   request just hangs. Every Phase 1 route is async now (the database is),
   so this patches the one place Express calls a handler to forward a
   rejection to next(err), exactly as a synchronous throw already is.
   Loaded once from server/index.js before any router is mounted. */
const Layer = require('express/lib/router/layer');

Layer.prototype.handle_request = function handle(req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) return next();          // an error handler — skip, as Express does
  try {
    const out = fn(req, res, next);
    if (out && typeof out.then === 'function') out.catch(next);
  } catch (err) {
    next(err);
  }
};
