/* Opening announcements / daily reminders.
   GET  /api/reminders        → this user's eligible upcoming activities (0..3 days),
                                each flagged seenToday, derived live from canonical data.
   POST /api/reminders/seen   → { keys:[] } mark those keys seen on the working-date.
   Mounted behind authRequired + attachScope. No new role system — visibility is
   resolved from the canonical relationships in services/reminders.js. */
const express = require('express');
const { remindersFor, markSeen } = require('../services/reminders');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const out = await remindersFor(req.user);
    // "should the opening announcement pop this session?" — only if there's at
    // least one item the user hasn't already seen today.
    out.showOpening = out.items.some(it => !it.seenToday);
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/seen', async (req, res, next) => {
  try {
    const keys = Array.isArray(req.body && req.body.keys) ? req.body.keys.map(String) : [];
    const n = await markSeen(req.user.id, keys, (req.body && req.body.seenOn) || null);
    res.json({ ok: true, recorded: n });
  } catch (e) { next(e); }
});

module.exports = router;
