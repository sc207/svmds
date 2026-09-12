/* Temple settings: working-date clock, default language, temple identity.
   Mounted behind authRequired. Reads are open to any signed-in user;
   writes are admin tier. (BACKEND_PLAN.md §10.3) */
const express = require('express');
const { requireRole } = require('../middleware/authz');
const { getSettings, setWorkingDate, clearWorkingDate, setTempleIdentity, setDefaultLanguage } = require('../services/settingsStore');
const { logAudit } = require('../services/audit');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

router.get('/', async (req, res, next) => {
  try { res.json(await getSettings()); } catch (e) { next(e); }
});

/* PUT /working-date  { date:'YYYY-MM-DD', time:'HH:MM' } */
router.put('/working-date', adminTier, async (req, res, next) => {
  try {
    const { date, time } = req.body || {};
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (time && !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: 'time must be HH:MM' });
    const out = await setWorkingDate(date, time);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Settings',
      action: 'UPDATE', entityType: 'working_date', details: { date, time } });
    res.json(out);
  } catch (e) { next(e); }
});

/* DELETE /working-date — un-pin; the clock goes back to tracking real time */
router.delete('/working-date', adminTier, async (req, res, next) => {
  try {
    const out = await clearWorkingDate();
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Settings',
      action: 'UPDATE', entityType: 'working_date', details: { cleared: true } });
    res.json(out);
  } catch (e) { next(e); }
});

/* PUT /identity  { name, loc, founder, head, email, phone, ... } */
router.put('/identity', adminTier, async (req, res, next) => {
  try {
    const out = await setTempleIdentity(req.body || {});
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Settings',
      action: 'UPDATE', entityType: 'temple_identity' });
    res.json(out);
  } catch (e) { next(e); }
});

/* PUT /language  { language:'en'|'hi'|'gu' } */
router.put('/language', adminTier, async (req, res, next) => {
  try {
    const lang = String((req.body || {}).language || '');
    if (!['en', 'hi', 'gu'].includes(lang)) return res.status(400).json({ error: 'language must be en|hi|gu' });
    const out = await setDefaultLanguage(lang);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Settings',
      action: 'UPDATE', entityType: 'default_language', details: { lang } });
    res.json(out);
  } catch (e) { next(e); }
});

module.exports = router;
