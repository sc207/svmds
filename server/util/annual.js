/* Annual Temple Events → dated occurrences.

   One place turns an annual_events row into "this event falls on YYYY-MM-DD
   in year Y", for the Universal Calendar, the announcements and the events
   list alike. The tithi → date conversion is public/js/panchang.js, the very
   file the browser loads, so the server and the page can never disagree.

   Resolution order (panchang.resolveDate): an admin-pinned date for that year
   (overrides_json {"2026": "2026-10-20"}) → a FIXED_DATE's month/day → the
   calculated tithi date. The calculation places a tithi by its value at
   ~06:00 IST, so for an observance decided by a different rule (Dussehra,
   Dhanteras) or in an adhik-maas year it can be a day or a month out — which
   is what pinning is for. */
const db = require('../db');
const { resolveDate } = require('../../public/js/panchang.js');

function parseOverrides(json) {
  try { const o = JSON.parse(json || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; }
}

/** The shape the API returns for one event in one year. */
function occurrence(row, year) {
  const overrides = parseOverrides(row.overrides_json);
  const r = resolveDate({
    type: row.type, masa: row.masa, paksha: row.paksha, tithi: Number(row.tithi || 0),
    fixedMonth: Number(row.fixed_month || 0), fixedDay: Number(row.fixed_day || 0), overrides,
  }, year);
  return {
    id: row.id, code: row.code, year: Number(year),
    date: r.date, source: r.source,             // 'pinned' | 'fixed' | 'calculated' | 'once'
    name: row.name, name_gu: row.name_gu || '', name_hi: row.name_hi || '',
    activity: row.activity || '', activity_gu: row.activity_gu || '', activity_hi: row.activity_hi || '',
    type: row.type, masa: row.masa || '', paksha: row.paksha || '', tithi: Number(row.tithi || 0),
    fixed_month: Number(row.fixed_month || 0), fixed_day: Number(row.fixed_day || 0),
    pinned: Object.keys(overrides).filter((k) => /^\d{4}$/.test(k)).sort()
      .reduce((o, k) => ({ ...o, [k]: overrides[k] }), {}),
    description: row.description || '', notes: row.notes || '',
  };
}

const activeRows = () =>
  db.all(`SELECT * FROM annual_events WHERE is_deleted = 0 AND active = 1 ORDER BY id`);

/** Every active event's occurrence in each of `years` that has a date. */
async function occurrencesIn(years) {
  const rows = await activeRows();
  const out = [];
  for (const y of [...new Set(years.map(Number))]) {
    for (const row of rows) {
      const o = occurrence(row, y);
      if (o.date) out.push(o);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

module.exports = { occurrence, occurrencesIn, activeRows, parseOverrides };
