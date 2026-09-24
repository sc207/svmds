/* Who may do what — the Phase 1 permission ladder, now enforced by the
   signed-in Google session (middleware/auth.js sets req.user with the
   account's LIVE roles). Ranks and the role → rank mapping live in
   middleware/authz.js:  operator < accountant < admin < superadmin.

   The narrow version is deliberate: operators keep every part of the
   daily job — registering sevarthi, taking payments, recording padhramni
   and donations. Only three things are held back:

     money already recorded   correcting or removing a payment or a
                              donation (accountant+), because that
                              rewrites what the trust holds
     the seva list            creating, re-dating, re-pricing or
                              deleting a pooja (admin+)
     bulk import / settings   (admin+)

   A refusal always says what to do instead. A bare "not allowed"
   leaves an operator stuck at a counter with somebody waiting.

   Called `needs`, not `require`: a function declaration by that name
   shadows Node's own `require` for the whole module. */
const { RANK, rankOf } = require('./authz');

const roleOf = (req) => rankOf(req.user);

/** True when the acting user is at least `min`. */
const atLeast = (req, min) => (RANK[roleOf(req)] ?? -1) >= (RANK[min] ?? 0);

const LABEL = {
  none: 'an account with no role', operator: 'an operator', accountant: 'the temple accountant',
  admin: 'an administrator', superadmin: 'the super admin',
};

/** Express middleware. `what` names the action in the refusal. */
function needs(min, what) {
  return (req, res, next) => {
    if (atLeast(req, min)) return next();
    const who = LABEL[roleOf(req)] || 'this account';
    res.status(403).json({
      error: `${what} is kept for ${LABEL[min]}. You are signed in as ${who} — ` +
             'ask an administrator to do it, or to give your account that role in Accounts & Access.',
    });
  };
}

module.exports = { roleOf, atLeast, needs, RANK };
