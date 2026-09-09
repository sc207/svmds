/* Server-authoritative unified calendar. UNIONs the v_cal_* views and applies
   the caller's scope so a restricted persona only sees their own module's
   entries. (BACKEND_PLAN.md §3.5, §8) */
const { queryAll } = require('../db/connection');

const UNION = `
  SELECT date, time, type, CAST(scope_id AS TEXT) AS scope_id, title, color, label, venue FROM v_cal_pooja
  UNION ALL SELECT date, time, type, CAST(scope_id AS TEXT), title, color, label, venue FROM v_cal_meeting
  UNION ALL SELECT date, time, type, CAST(scope_id AS TEXT), title, color, label, venue FROM v_cal_event
  UNION ALL SELECT date, time, type, CAST(scope_id AS TEXT), title, color, label, venue FROM v_cal_visit
  UNION ALL SELECT date, time, type, CAST(scope_id AS TEXT), title, color, label, venue FROM v_cal_pledge
  UNION ALL SELECT date, time, type, CAST(scope_id AS TEXT), title, color, label, venue FROM v_cal_dhaja`;

/**
 * @param {string} [month]  'YYYY-MM' — restrict to that month
 * @param {object} scope    req.scope
 */
async function calendarEntries(month, scope) {
  const where = [];
  const args = [];
  if (month && /^\d{4}-\d{2}$/.test(month)) { where.push("substr(date,1,7) = ?"); args.push(month); }

  let rows = await queryAll(
    `SELECT * FROM (${UNION}) ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date, time`,
    args
  );

  if (scope && !scope.isAdmin) {
    const roles = scope.roles || [];
    const allow = [];
    if (roles.includes('pooja_coordinator')) allow.push(['pooja', new Set((scope.poojaIds || []).map(String))]);
    if (roles.includes('committee_leader')) allow.push(['committee', new Set((scope.committeeIds || []).map(String))]);
    if (roles.includes('event_incharge')) allow.push(['event', new Set((scope.eventIds || []).map(String))]);
    if (allow.length) {
      rows = rows.filter(r => allow.some(([t, ids]) => r.type === t && ids.has(String(r.scope_id))));
    }
    // accountant / no calendar-bearing role → see nothing scoped, keep pledges visible
    else if (roles.includes('accountant')) {
      rows = rows.filter(r => r.type === 'donation');
    }
  }

  return rows.map(r => ({
    date: r.date,
    time: r.time || '',
    type: r.type,
    scopeId: r.scope_id,
    title: r.title,
    color: r.color,
    label: r.label || '',
    venue: r.venue || '',
  }));
}

module.exports = { calendarEntries };
