/* The mandir works in local (India) time. SQLite stamps rows with
   datetime('now','+330 minutes'), so every JS-side "today" must be local
   too — toISOString() is UTC and would put an early-morning entry on
   the previous day. */
function todayLocal() {
  return new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local
}

function monthLocal() {
  return todayLocal().slice(0, 7);
}

/* A pooja slot with no date yet is the normal early state, not missing
   data — but interpolated raw into a sentence it reads as
   "added as sevarthi — Pothi Yatra on null", which is what the audit
   trail was showing. Every message that names a slot's day goes
   through here. */
const slotWhen = (iso) => (iso ? String(iso) : 'a date not fixed yet');

/* A real calendar day as YYYY-MM-DD. `new Date('2026-02-30')` quietly rolls
   over to 2 March, so the regex alone is not enough — the date has to come
   back out as the same string. */
function isDay(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

/** The date, or a 400 naming the field. Blank → `fallback` (may be null). */
function dayOf(v, label, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  if (!isDay(String(v))) {
    throw Object.assign(new Error(`${label}: give a real date (YYYY-MM-DD)`), { status: 400 });
  }
  return String(v);
}

module.exports = { todayLocal, monthLocal, slotWhen, isDay, dayOf };
