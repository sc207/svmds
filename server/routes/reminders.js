/* Opening announcements — what to put in front of a person when they open the
   app: every annual temple event from 3 days before it through the day itself.

   GET  /api/reminders       { today, windowEnd, items[], showOpening }
   POST /api/reminders/seen  { keys: [] } — shown to this user today

   Derived live from annual_events (nothing copied), so a pinned or corrected
   date is announced correctly the moment it changes. "Seen" is kept per user
   per IST day in reminder_seen, so the announcement shows once a day on
   whichever device the person opens first — not again on the next. */
const express = require('express');
const db = require('../db');
const { occurrencesIn } = require('../util/annual');
const { todayLocal } = require('../util/dates');

const router = express.Router();
const WINDOW_DAYS = 3;

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}
const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

router.get('/', async (req, res) => {
  const today = todayLocal();
  const windowEnd = addDays(today, WINDOW_DAYS);
  const years = [Number(today.slice(0, 4)), Number(windowEnd.slice(0, 4))];
  const [occ, seen] = await Promise.all([
    occurrencesIn(years),
    db.all(`SELECT reminder_key FROM reminder_seen WHERE user_id = ? AND seen_on = ?`, req.user.id, today),
  ]);
  const seenKeys = new Set(seen.map((r) => r.reminder_key));
  const items = occ
    .filter((o) => o.date >= today && o.date <= windowEnd)
    .map((o) => {
      const key = `annual:${o.code || o.id}:${o.year}`;
      return { kind: 'annual', key, ...o, daysUntil: daysBetween(today, o.date), seenToday: seenKeys.has(key) };
    });
  res.json({ today, windowEnd, items, showOpening: items.some((i) => !i.seenToday) });
});

router.post('/seen', async (req, res) => {
  const today = todayLocal();
  const keys = [...new Set((Array.isArray(req.body && req.body.keys) ? req.body.keys : []).map(String).filter((k) => /^annual:[\w-]+:\d{4}$/.test(k)))].slice(0, 50);
  let recorded = 0;
  for (const k of keys) {
    const r = await db.run(`INSERT OR IGNORE INTO reminder_seen (user_id, reminder_key, seen_on) VALUES (?, ?, ?)`,
      req.user.id, k, today);
    recorded += r.changes;
  }
  res.json({ ok: true, recorded });
});

module.exports = router;
