/* Refunds — money given back from what a booking already holds.

   A refund is a payments row with kind 'refund', a NEGATIVE amount and
   payer_type = whom it went back to (the sevarthi or Bapa). Because every
   "paid" figure in the app is SUM(payments.amount), the net the trust holds
   is right everywhere without a query changing. The payment it offsets and
   that payment's receipt are never touched.

   What may be given back:
     live booking      the excess only — max(net paid − committed, 0). The
                       seva still has to be covered by what stays.
     cancelled booking everything still held, since the seat is released.
   and never more than that payer has put in (net), so the sevarthi's half
   of a split cannot be "refunded" out of Bapa's money or the other way. */
const db = require('../db');

/** Net held on a booking, per payer. Call inside the caller's db.tx(). */
async function held(bookingId) {
  const r = await db.get(`
    SELECT IFNULL(SUM(amount), 0) AS total,
           IFNULL(SUM(CASE WHEN payer_type = 'bhuvaji' THEN amount ELSE 0 END), 0) AS bhuvaji,
           IFNULL(SUM(CASE WHEN payer_type = 'bhuvaji' THEN 0 ELSE amount END), 0) AS devotee,
           IFNULL(-SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END), 0) AS refunded
      FROM payments WHERE booking_id = ?`, bookingId);
  return r;
}

/** How much may be given back right now, and to whom. */
async function refundable(booking) {
  const h = await held(booking.id);
  const cap = booking.status === 'cancelled' ? h.total : Math.max(0, h.total - booking.amount_committed);
  return {
    total: Math.max(0, cap),
    devotee: Math.max(0, Math.min(cap, h.devotee)),
    bhuvaji: Math.max(0, Math.min(cap, h.bhuvaji)),
    held: h,
  };
}

/** A correction or removal must never leave a booking having given back more
    than it received from someone. Call after the change, inside the tx. */
async function assertNotOverRefunded(bookingId) {
  const h = await held(bookingId);
  if (h.refunded > 0 && (h.devotee < 0 || h.bhuvaji < 0)) {
    const who = h.devotee < 0 ? 'the sevarthi' : 'Bapa';
    throw Object.assign(new Error(
      `That would leave ${who} refunded more than they paid. Remove the refund first, ` +
      'then correct this entry, and record the refund again if one is still owed.'), { status: 409 });
  }
}

module.exports = { held, refundable, assertNotOverRefunded };
