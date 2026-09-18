/* PUBLIC — no auth. Maha Yagna sevarthi registration: a raw, staging-only
   sign-up (NOT devotees/sevarthis/committees — see MAHA_YAGNA_PLAN.md).
   samaj_name is free text exactly as entered — no committees dependency, no
   automatic committee creation; admin normalises it into real committees
   later. Admin turns the page on/off + sets an open/close window
   (services/settingsStore.js yagnaRegistration); staff review and approve
   rows in a later phase. Mounted at /api/public BEFORE the auth guard in
   server/index.js. */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { queryAll, queryOne, run } = require('../db/connection');
const { nextCode } = require('../services/entityCode');
const { yagnaRegistrationStatus } = require('../services/settingsStore');
const { logAudit } = require('../services/audit');
const { mapYagnaSignup } = require('../utils/mappers');

const router = express.Router();

const submitLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, message: { error: 'Too many submissions, try again later' } });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts, try again later' } });

const YAGNA_SELECT = `SELECT y.* FROM yagna_sevarthi_signups y WHERE y.is_deleted = 0`;

async function signupById(id) {
  const rows = await queryAll(YAGNA_SELECT + ' AND y.id = ?', [id]);
  return rows[0] || null;
}

/* GET /yagna/status — is registration open right now? */
router.get('/yagna/status', async (req, res, next) => {
  try {
    res.json(await yagnaRegistrationStatus());
  } catch (e) { next(e); }
});

/* POST /yagna/submit { firstName, lastName?, samajName, city?, state?, mobile, expectedContribution? } */
router.post('/yagna/submit', submitLimiter, async (req, res, next) => {
  try {
    const status = await yagnaRegistrationStatus();
    if (!status.open) return res.status(404).json({ error: 'Registration is not open right now' });

    const b = req.body || {};
    const firstName = String(b.firstName || '').trim();
    const lastName = String(b.lastName || '').trim();
    const samajName = String(b.samajName || '').trim();
    const mobile = String(b.mobile || '').trim();
    if (!firstName) return res.status(400).json({ error: 'First name is required' });
    if (!samajName) return res.status(400).json({ error: 'Samaj name is required' });
    if (!/^[0-9]{10}$/.test(mobile)) return res.status(400).json({ error: 'Mobile must be a 10-digit number' });
    const contribution = Number(b.expectedContribution);
    if (!(contribution >= 0)) return res.status(400).json({ error: 'Expected contribution must be a number' });

    // double-submit guard: an existing non-deleted row for the same mobile in
    // the last 24h just returns its token instead of creating a duplicate.
    const existing = await queryOne(
      `SELECT id FROM yagna_sevarthi_signups
        WHERE mobile = ? AND is_deleted = 0 AND created_at >= datetime('now', '-1 day')
        ORDER BY created_at DESC LIMIT 1`, [mobile]);
    if (existing) {
      const row = await signupById(existing.id);
      return res.status(200).json({ ...mapYagnaSignup(row), _deduped: true });
    }

    const id = crypto.randomUUID();
    const code = await nextCode('yagna_sevarthi');
    await run(
      `INSERT INTO yagna_sevarthi_signups
         (id, code, first_name, last_name, samaj_name, city, state, mobile,
          expected_contribution, submitted_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, firstName, lastName, samajName,
       String(b.city || '').trim(), String(b.state || 'Gujarat').trim(), mobile, contribution,
       String(req.ip || '').slice(0, 64)]
    );
    await logAudit({
      userEmail: 'public', module: 'Maha Yagna Sevarthi',
      action: 'CREATE', entityType: 'yagna_signup', entityId: code,
      details: { firstName, lastName, samajName, city: b.city || '' },
    });

    res.status(201).json(mapYagnaSignup(await signupById(id)));
  } catch (e) { next(e); }
});

/* POST /yagna/verify { code, mobile } — BOTH required (prevents enumerating
   other people's details via a guessable sequential token alone). */
router.post('/yagna/verify', verifyLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};
    const code = String(b.code || '').trim().toUpperCase();
    const mobile = String(b.mobile || '').trim();
    if (!code || !/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({ error: 'Token and 10-digit mobile number are both required' });
    }
    const rows = await queryAll(YAGNA_SELECT + ' AND y.code = ? AND y.mobile = ?', [code, mobile]);
    if (!rows[0]) return res.status(404).json({ error: 'No registration found for that token and mobile number' });
    res.json(mapYagnaSignup(rows[0]));
  } catch (e) { next(e); }
});

module.exports = router;
