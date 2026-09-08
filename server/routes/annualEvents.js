/* Temple annual Tithi & important events — master list.
   Reads: any signed-in user. Writes (add / edit / disable / delete / pin a
   per-year date): admin tier only. Gregorian dates for TITHI rows are computed
   per ?year via services/panchang.js; FIXED_DATE rows use month/day; an
   admin-pinned override for a year always wins. (spec: Annual Temple Events) */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { mapAnnualEvent } = require('../utils/mappers');
const { MASA_KEYS } = require('../services/panchang');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

const byIdOrCode = v =>
  queryOne('SELECT * FROM annual_events WHERE (id = ? OR code = ?) AND is_deleted = 0',
    [parseInt(v, 10) || -1, v]);

function currentYear() { return new Date().getFullYear(); }

/* GET /?year=YYYY&all=1 */
router.get('/', async (req, res, next) => {
  try {
    const year = /^\d{4}$/.test(req.query.year || '') ? parseInt(req.query.year, 10) : currentYear();
    const where = ['is_deleted = 0'];
    if (!req.query.all) where.push('active = 1');
    const rows = await queryAll(`SELECT * FROM annual_events WHERE ${where.join(' AND ')} ORDER BY id`);
    const list = rows.map(r => mapAnnualEvent(r, year));
    // sort by the resolved Gregorian date within the year (nulls last)
    list.sort((a, b) => (a.gregorianDate || '9999').localeCompare(b.gregorianDate || '9999'));
    res.json({ year, events: list });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const year = /^\d{4}$/.test(req.query.year || '') ? parseInt(req.query.year, 10) : currentYear();
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Annual event not found' });
    res.json(mapAnnualEvent(row, year));
  } catch (e) { next(e); }
});

function validate(b, partial) {
  const type = b.type === 'FIXED_DATE' ? 'FIXED_DATE' : 'TITHI';
  if (!partial && !String(b.name || '').trim()) return 'name is required';
  if (type === 'TITHI') {
    if (b.masa !== undefined && b.masa && MASA_KEYS.indexOf(b.masa) === -1) return 'unknown masa';
    if (b.paksha !== undefined && b.paksha && ['shukla', 'krishna'].indexOf(b.paksha) === -1) return "paksha must be 'shukla' or 'krishna'";
    if (b.tithi !== undefined && b.tithi && (b.tithi < 1 || b.tithi > 15)) return 'tithi must be 1..15';
  } else {
    if (b.fixedMonth !== undefined && (b.fixedMonth < 1 || b.fixedMonth > 12)) return 'fixedMonth must be 1..12';
    if (b.fixedDay !== undefined && (b.fixedDay < 1 || b.fixedDay > 31)) return 'fixedDay must be 1..31';
  }
  return null;
}

/* POST /  (admin) */
router.post('/', adminTier, async (req, res, next) => {
  try {
    const b = req.body || {};
    const err = validate(b, false);
    if (err) return res.status(400).json({ error: err });
    const type = b.type === 'FIXED_DATE' ? 'FIXED_DATE' : 'TITHI';
    const code = await nextCode('annual_event');
    const r = await run(
      `INSERT INTO annual_events
         (code, name, name_gu, name_hi, activity, activity_gu, activity_hi, type,
          masa, paksha, tithi, fixed_month, fixed_day, description, notes, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, String(b.name).trim(), b.name_gu || '', b.name_hi || '',
       b.activity || '', b.activity_gu || '', b.activity_hi || '', type,
       type === 'TITHI' ? (b.masa || '') : '', type === 'TITHI' ? (b.paksha || '') : '',
       type === 'TITHI' ? (parseInt(b.tithi, 10) || 0) : 0,
       type === 'FIXED_DATE' ? (parseInt(b.fixedMonth, 10) || 0) : 0,
       type === 'FIXED_DATE' ? (parseInt(b.fixedDay, 10) || 0) : 0,
       b.description || '', b.notes || '', b.active === false ? 0 : 1]
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'CREATE', entityType: 'annual_event', entityId: code, details: { name: b.name } });
    res.status(201).json(mapAnnualEvent(await queryOne('SELECT * FROM annual_events WHERE id = ?', [r.lastInsertRowid]), currentYear()));
  } catch (e) { next(e); }
});

/* PATCH /:id  (admin) */
router.patch('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Annual event not found' });
    const b = req.body || {};
    const err = validate(b, true);
    if (err) return res.status(400).json({ error: err });

    const map = {
      name: 'name', name_gu: 'name_gu', name_hi: 'name_hi',
      activity: 'activity', activity_gu: 'activity_gu', activity_hi: 'activity_hi',
      masa: 'masa', paksha: 'paksha', description: 'description', notes: 'notes',
    };
    const sets = [], args = [];
    for (const [k, col] of Object.entries(map)) {
      if (typeof b[k] === 'string') { sets.push(`${col} = ?`); args.push(b[k]); }
    }
    if (b.type === 'TITHI' || b.type === 'FIXED_DATE') { sets.push('type = ?'); args.push(b.type); }
    if (b.tithi !== undefined) { sets.push('tithi = ?'); args.push(parseInt(b.tithi, 10) || 0); }
    if (b.fixedMonth !== undefined) { sets.push('fixed_month = ?'); args.push(parseInt(b.fixedMonth, 10) || 0); }
    if (b.fixedDay !== undefined) { sets.push('fixed_day = ?'); args.push(parseInt(b.fixedDay, 10) || 0); }
    if (b.active !== undefined) { sets.push('active = ?'); args.push(b.active ? 1 : 0); }
    if (!sets.length) return res.json(mapAnnualEvent(row, currentYear()));

    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE annual_events SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'UPDATE', entityType: 'annual_event', entityId: row.code });
    res.json(mapAnnualEvent(await queryOne('SELECT * FROM annual_events WHERE id = ?', [row.id]), currentYear()));
  } catch (e) { next(e); }
});

/* PUT /:id/override  { year, date:'YYYY-MM-DD' | null }  (admin) — pin / unpin a year */
router.put('/:id/override', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Annual event not found' });
    const year = String(parseInt(req.body.year, 10) || 0);
    if (!/^\d{4}$/.test(year)) return res.status(400).json({ error: 'year (YYYY) required' });
    const date = req.body.date;
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'date must be YYYY-MM-DD or null' });

    let overrides = {};
    try { overrides = JSON.parse(row.overrides_json || '{}'); } catch (_) {}
    if (date === null) delete overrides[year];
    else overrides[year] = date;

    await run(`UPDATE annual_events SET overrides_json = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify(overrides), row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: date === null ? 'UNPIN' : 'PIN', entityType: 'annual_event', entityId: row.code, details: { year, date } });
    res.json(mapAnnualEvent(await queryOne('SELECT * FROM annual_events WHERE id = ?', [row.id]), parseInt(year, 10)));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Annual event not found' });
    await run(`UPDATE annual_events SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'DELETE', entityType: 'annual_event', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
