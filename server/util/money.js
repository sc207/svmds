/* Reading an amount out of a request body.

   Every rupee figure the trust enters — a contribution, Bapa's share, a
   seva's amount or target, a donation — must be a real, non-negative number
   of a believable size. Without this, "abc" became NaN and reached the
   database as a constraint failure (a 500 with SQLite's words in it), a
   negative contribution quietly produced a negative "outstanding", and
   1e30 went into totals. A refusal names the field. */
const MAX = 1e9;   // ₹100 crore — far above any single seva, well inside a double's exact range

/** The amount, or null when absent. Throws a 400 naming `label` when it is not one. */
function amountOf(v, label, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw Object.assign(new Error(`${label} is required`), { status: 400 });
    return null;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(n)) throw Object.assign(new Error(`${label} must be a number`), { status: 400 });
  if (n < 0) throw Object.assign(new Error(`${label} cannot be negative`), { status: 400 });
  if (n > MAX) throw Object.assign(new Error(`${label} is larger than any seva — check the amount`), { status: 400 });
  return Math.round(n * 100) / 100;
}

module.exports = { amountOf, MAX };
