/* Annual Temple Events — read by everyone signed in; an administrator can
   pin the correct date for a year when the calculated tithi date is off
   (the temple's panchang decides). Pinning edits overrides_json only — it
   never adds, removes or renames an event. */
const express = require('express');
const db = require('../db');
const roles = require('../middleware/roles');
const { log } = require('../middleware/audit');
const { occurrence, occurrencesIn, parseOverrides } = require('../util/annual');
const { todayLocal } = require('../util/dates');

const router = express.Router();

/* GET /?year=2026 — every active event with its date that year. */
router.get('/', async (req, res) => {
  const year = Number(req.query.year) || Number(todayLocal().slice(0, 4));
  res.json(await occurrencesIn([year]));
});

/* PUT /:id/date  { year, date: 'YYYY-MM-DD' | null } — pin (or unpin) a year. */
router.put('/:id/date', roles.needs('admin', 'Setting the date of an annual event'), async (req, res) => {
  const year = Number(req.body && req.body.year);
  const date = req.body && req.body.date ? String(req.body.date) : null;
  if (!(year >= 2000 && year <= 2100)) return res.status(400).json({ error: 'Give the year this date is for' });
  if (date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00'))) {
      return res.status(400).json({ error: 'Give the date as YYYY-MM-DD' });
    }
    if (Number(date.slice(0, 4)) !== year) {
      return res.status(400).json({ error: `The date must fall in ${year} — it is that year's date being set` });
    }
  }
  const out = await db.tx(async () => {
    const row = await db.get(`SELECT * FROM annual_events WHERE id = ? AND is_deleted = 0`, req.params.id);
    if (!row) throw Object.assign(new Error('Annual event not found'), { status: 404 });
    const before = occurrence(row, year);
    const o = parseOverrides(row.overrides_json);
    if (date === null) delete o[String(year)]; else o[String(year)] = date;
    await db.run(`UPDATE annual_events SET overrides_json = ?, updated_at = datetime('now') WHERE id = ?`,
      JSON.stringify(o), row.id);
    const after = occurrence({ ...row, overrides_json: JSON.stringify(o) }, year);
    await log(req, {
      action: 'update', entity: 'annual_event', entityId: row.id,
      summary: date === null
        ? `${row.name} ${year}: pinned date cleared — back to the calculated ${after.date || 'date'}`
        : `${row.name} ${year}: date set to ${date} (was ${before.date || 'not set'})`,
      details: { year, from: before.date, to: after.date },
    });
    return after;
  });
  res.json(out);
});

module.exports = router;
