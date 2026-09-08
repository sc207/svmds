/* PUBLIC — no auth. The no-login volunteering page: a team's lead enables it
   (public_pages.enabled) and marks sessions publicOpen; the public sees those
   and can submit a signup, which lands as `pending` in the lead's review queue.
   Mounted at /api/public BEFORE the auth guard in server/index.js. */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { queryAll, queryOne, run } = require('../db/connection');
const { nextCode } = require('../services/entityCode');
const { mapVolunteeringSession } = require('../utils/mappers');

const router = express.Router();

const signupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many submissions, try later' } });

const teamByIdOrCode = v =>
  queryOne('SELECT * FROM teams WHERE (id = ? OR code = ?) AND is_deleted = 0', [parseInt(v, 10) || -1, v]);

/* GET /teams/:teamId  — the public page + its open sessions (or 404 if disabled) */
router.get('/teams/:teamId', async (req, res, next) => {
  try {
    const team = await teamByIdOrCode(req.params.teamId);
    if (!team) return res.status(404).json({ error: 'Not found' });
    const pp = await queryOne('SELECT * FROM public_pages WHERE team_id = ? AND enabled = 1', [team.id]);
    if (!pp) return res.status(404).json({ error: 'This volunteering page is not open' });
    const sessions = await queryAll(
      `SELECT * FROM volunteering_sessions
       WHERE team_id = ? AND is_deleted = 0 AND public_open = 1 AND date >= date('now')
       ORDER BY date`, [team.id]
    );
    res.json({
      team: { id: team.code || String(team.id), name: team.name, color: team.color },
      intro: pp.intro || '',
      contact: pp.contact || '',
      sessions: sessions.map(s => {
        const m = mapVolunteeringSession(s);
        return { id: m.id, title: m.title, date: m.date, startTime: m.startTime, endTime: m.endTime, location: m.location };
      }),
    });
  } catch (e) { next(e); }
});

/* POST /teams/:teamId/signups  { sessionId, name, mobile?, city?, note? } */
router.post('/teams/:teamId/signups', signupLimiter, async (req, res, next) => {
  try {
    const team = await teamByIdOrCode(req.params.teamId);
    if (!team) return res.status(404).json({ error: 'Not found' });
    const pp = await queryOne('SELECT 1 AS x FROM public_pages WHERE team_id = ? AND enabled = 1', [team.id]);
    if (!pp) return res.status(404).json({ error: 'This volunteering page is not open' });

    const b = req.body || {};
    const name = String(b.name || '').trim();
    const mobile = String(b.mobile || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (mobile && !/^[0-9]{10}$/.test(mobile)) return res.status(400).json({ error: 'mobile must be 10 digits' });

    const sess = await queryOne(
      `SELECT * FROM volunteering_sessions
       WHERE (id = ? OR code = ?) AND team_id = ? AND is_deleted = 0 AND public_open = 1`,
      [b.sessionId, b.sessionId, team.id]
    );
    if (!sess) return res.status(400).json({ error: 'That session is not open for signups' });

    const id = crypto.randomUUID();
    const code = await nextCode('public_signup');
    await run(
      `INSERT INTO public_signups (id, code, team_id, session_id, name, mobile, city, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, code, team.id, sess.id, name, mobile, b.city || '', String(b.note || '').slice(0, 500)]
    );
    res.status(201).json({ ok: true, reference: code });
  } catch (e) { next(e); }
});

module.exports = router;
