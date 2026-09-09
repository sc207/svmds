/* Opening-announcement eligibility.

   "What upcoming temple activity should THIS user be reminded about today?"

   Everything is derived live from the canonical rows — poojas / pooja_sessions,
   committees / meetings, teams / volunteering_sessions, events / event_days,
   annual_events, visits. Nothing is copied. If an activity is edited, cancelled
   or deleted, the next call reflects it automatically.

   "Today" is the app's working-date (app_settings.working_date), the same
   clock every other module uses — never the server wall clock. An activity is
   eligible from 3 days before through the activity day itself (daysUntil 0..3).

   Visibility uses the canonical relationship model + the existing role system:
     - pooja      → admin, its coordinators, its sevarthis
     - meeting    → admin, the committee's leader + active members
     - session    → admin, the team's lead + active members
     - event      → every signed-in user (temple-wide; events routes are
                    already any-session read)
     - annual     → every signed-in user (temple-wide)
     - visit      → admin tier only (operational / escort-team data)
*/
const { queryAll, queryOne, run } = require('../db/connection');
const { getSettings } = require('./settingsStore');
const { mapAnnualEvent } = require('../utils/mappers');

const WINDOW_DAYS = 3;

function addDays(isoDate, n) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function daysBetween(fromISO, toISO) {
  const a = Date.UTC(...String(fromISO).split('-').map((v, i) => (i === 1 ? +v - 1 : +v)));
  const b = Date.UTC(...String(toISO).split('-').map((v, i) => (i === 1 ? +v - 1 : +v)));
  return Math.round((b - a) / 86400000);
}

/**
 * @param {object} user   req.user  ({ id, email, roles })
 * @returns {Promise<{ today, windowEnd, items: Array }>}
 */
async function remindersFor(user) {
  const { workingDate } = await getSettings();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(workingDate || '') ? workingDate : new Date().toISOString().slice(0, 10);
  const windowEnd = addDays(today, WINDOW_DAYS);

  const roles = (user && user.roles) || [];
  const isAdmin = roles.includes('superadmin') || roles.includes('admin');
  const me = user && user.id ? await queryOne('SELECT devotee_id FROM users WHERE id = ?', [user.id]) : null;
  const devId = (me && me.devotee_id) || -1;
  const uid = (user && user.id) || -1;

  const inWindow = 's.date >= ? AND s.date <= ?';
  const items = [];

  /* ---------------- poojas ---------------- */
  {
    let sql = `
      SELECT p.code AS pcode, p.name, p.color, p.status,
             s.id AS sid, s.date, s.start_time AS time, s.venue, s.label
      FROM pooja_sessions s
      JOIN poojas p ON p.id = s.pooja_id
      WHERE s.is_deleted = 0 AND p.is_deleted = 0
        AND p.status NOT IN ('cancelled','done','completed')
        AND ${inWindow}`;
    const args = [today, windowEnd];
    let reason = 'Temple pooja';
    if (!isAdmin) {
      sql += `
        AND ( EXISTS (SELECT 1 FROM pooja_coordinator_links l
                        WHERE l.pooja_id = p.id AND (l.devotee_id = ? OR l.user_id = ?))
           OR EXISTS (SELECT 1 FROM pooja_sevarthi_links l
                        JOIN sevarthis sv ON sv.id = l.sevarthi_id
                        WHERE l.pooja_id = p.id AND sv.devotee_id = ? AND sv.is_deleted = 0) )`;
      args.push(devId, uid, devId);
      reason = 'You are on this pooja';
    }
    for (const r of await queryAll(sql, args)) {
      items.push(shape('pooja', `pooja:${r.pcode}:${r.sid}`, r.name, r.label || 'Pooja / Seva',
        r.date, r.time, r.venue, r.color || '#6B1F2A', reason, 'puja', today));
    }
  }

  /* ---------------- committee meetings ---------------- */
  {
    let sql = `
      SELECT c.code AS ccode, m.code AS mcode, m.title, c.color, m.venue,
             m.date, m.start_time AS time
      FROM meetings m
      JOIN committees c ON c.id = m.committee_id
      WHERE m.is_deleted = 0 AND c.is_deleted = 0 AND m.completed = 0
        AND m.date >= ? AND m.date <= ?`;
    const args = [today, windowEnd];
    let reason = 'Committee meeting';
    if (!isAdmin) {
      sql += `
        AND ( c.leader_devotee_id = ? OR c.leader_id = ?
           OR EXISTS (SELECT 1 FROM committee_members cm
                        WHERE cm.committee_id = c.id AND cm.devotee_id = ? AND cm.is_deleted = 0 AND cm.status = 'active') )`;
      args.push(devId, uid, devId);
      reason = 'Your committee';
    }
    for (const r of await queryAll(sql, args)) {
      items.push(shape('meeting', `meeting:${r.mcode}`, r.title, 'Committee meeting',
        r.date, r.time, r.venue, r.color || '#6B1F2A', reason, 'committees', today));
    }
  }

  /* ---------------- management volunteering sessions ---------------- */
  {
    let sql = `
      SELECT t.code AS tcode, v.code AS vcode, v.title, t.color, v.location AS venue,
             v.date, v.start_time AS time
      FROM volunteering_sessions v
      JOIN teams t ON t.id = v.team_id
      WHERE v.is_deleted = 0 AND t.is_deleted = 0 AND v.completed = 0
        AND v.date >= ? AND v.date <= ?`;
    const args = [today, windowEnd];
    let reason = 'Volunteering session';
    if (!isAdmin) {
      sql += `
        AND ( t.lead_devotee_id = ? OR t.lead_id = ?
           OR EXISTS (SELECT 1 FROM team_members tm
                        WHERE tm.team_id = t.id AND tm.devotee_id = ? AND tm.is_deleted = 0 AND tm.status = 'active') )`;
      args.push(devId, uid, devId);
      reason = 'Your team';
    }
    for (const r of await queryAll(sql, args)) {
      items.push(shape('session', `session:${r.vcode}`, r.title, 'Volunteering',
        r.date, r.time, r.venue, r.color || '#3B5C8A', reason, 'management', today));
    }
  }

  /* ---------------- temple events (visible to everyone) ---------------- */
  {
    const rows = await queryAll(`
      SELECT e.code AS ecode, e.name, e.color, e.venue, d.date, d.start_time AS time
      FROM event_days d
      JOIN events e ON e.id = d.event_id
      WHERE d.is_deleted = 0 AND e.is_deleted = 0
        AND e.status NOT IN ('cancelled','completed')
        AND d.date >= ? AND d.date <= ?`, [today, windowEnd]);
    for (const r of rows) {
      items.push(shape('event', `event:${r.ecode}:${r.date}`, r.name, 'Temple event',
        r.date, r.time, r.venue, r.color || '#C96A20', 'Temple event', 'events', today));
    }
  }

  /* ---------------- annual tithi / important events (everyone) ---------------- */
  {
    const years = new Set([Number(today.slice(0, 4)), Number(windowEnd.slice(0, 4))]);
    const rows = await queryAll(`SELECT * FROM annual_events WHERE is_deleted = 0 AND active = 1`);
    for (const row of rows) {
      for (const yr of years) {
        let ev;
        try { ev = mapAnnualEvent(row, yr); } catch (_) { ev = null; }
        if (!ev || !ev.gregorianDate) continue;
        // respect a one-off ("once") event pinned to a single year
        if (ev.overrides && ev.overrides.once && Number(ev.overrides.once) !== yr) continue;
        if (ev.gregorianDate < today || ev.gregorianDate > windowEnd) continue;
        items.push(shape('annual', `annual:${ev.code}:${yr}`,
          ev.name, ev.activity || 'Annual temple event',
          ev.gregorianDate, '', '', '#C9A24A', 'Temple calendar', 'calendar', today));
      }
    }
  }

  /* ---------------- padhramani visits (admin tier only) ---------------- */
  if (isAdmin) {
    const rows = await queryAll(`
      SELECT code AS vcode, devotee_name, date, time, address AS venue, escort_team
      FROM visits
      WHERE is_deleted = 0 AND status NOT IN ('cancelled','completed')
        AND date >= ? AND date <= ?`, [today, windowEnd]);
    for (const r of rows) {
      items.push(shape('visit', `visit:${r.vcode}`, r.devotee_name || 'Padhramani',
        r.escort_team ? `Padhramani · escort: ${r.escort_team}` : 'Padhramani visit',
        r.date, r.time, r.venue, '#4C8B5A', 'Padhramani register', 'visits', today));
    }
  }

  /* de-dupe (an admin sevarthi could match a pooja twice), then mark seen-today */
  const byKey = new Map();
  for (const it of items) if (!byKey.has(it.key)) byKey.set(it.key, it);
  let list = [...byKey.values()];

  if (list.length && uid > 0) {
    const seen = new Set((await queryAll(
      `SELECT reminder_key FROM reminder_seen WHERE user_id = ? AND seen_on = ?`, [uid, today]
    )).map(r => r.reminder_key));
    list.forEach(it => { it.seenToday = seen.has(it.key); });
  }

  // priority: soonest first, then by start time, then a stable type order
  const typeRank = { event: 0, annual: 1, pooja: 2, meeting: 3, session: 4, visit: 5 };
  list.sort((a, b) =>
    (a.daysUntil - b.daysUntil) ||
    String(a.time || '99:99').localeCompare(b.time || '99:99') ||
    (typeRank[a.kind] - typeRank[b.kind]) ||
    a.title.localeCompare(b.title));

  return { today, windowEnd, items: list };
}

function shape(kind, key, title, subtitle, date, time, venue, color, reasonRole, deepLink, today) {
  return {
    kind, key,
    title: title || '(untitled)',
    subtitle: subtitle || '',
    date,
    time: time || '',
    venue: venue || '',
    color: color || '#6B1F2A',
    reasonRole: reasonRole || '',
    deepLink: deepLink || '',
    daysUntil: Math.max(0, daysBetween(today, date)),
  };
}

/** Record that `keys` were shown to `userId` on the working-date. Idempotent. */
async function markSeen(userId, keys, seenOn) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(seenOn || '') ? seenOn : (await getSettings()).workingDate;
  let n = 0;
  for (const key of [...new Set((keys || []).filter(Boolean))]) {
    try {
      const r = await run(
        `INSERT INTO reminder_seen (user_id, reminder_key, seen_on)
         SELECT ?, ?, ? WHERE NOT EXISTS
           (SELECT 1 FROM reminder_seen WHERE user_id = ? AND reminder_key = ? AND seen_on = ?)`,
        [userId, key, day, userId, key, day]
      );
      if (r && r.changes) n += r.changes;
    } catch (_) { /* ux_reminder_seen race — already recorded, fine */ }
  }
  return n;
}

module.exports = { remindersFor, markSeen, WINDOW_DAYS };
