/* Poojas — event + ordered pooja_sessions + sevarthi / coordinator / guest links.
   Scope: admin tier sees all; a pooja_coordinator sees only poojas they're linked
   to (req.scope.poojaIds). Catalog + coordinator assignment + pooja delete are
   admin tier; a coordinator may edit their own pooja's sessions/sevarthis/guests.
   (BACKEND_PLAN.md §3 Pooja module) */
const express = require('express');
const crypto = require('crypto');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole, isAdminTier } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { ensureDevotee, digits } = require('../services/people');
const { nextColorFor } = require('../services/palette');
const { mapPooja, mapPoojaSession, mapSevarthi, mapGuest } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

/* ---------- hydration ---------- */
async function hydrate(poojaRow) {
  if (!poojaRow) return null;
  const [sessRows, sevRows, coordRows, guestRows] = await Promise.all([
    queryAll('SELECT * FROM pooja_sessions WHERE pooja_id = ? AND is_deleted = 0 ORDER BY date, start_time', [poojaRow.id]),
    queryAll(`SELECT s.*, dv.code AS devotee_code, dv.name AS dev_name, dv.mobile AS dev_mobile,
                dv.city AS dev_city, dv.state AS dev_state
              FROM sevarthis s JOIN pooja_sevarthi_links l ON l.sevarthi_id = s.id
              LEFT JOIN devotees dv ON dv.id = s.devotee_id
              WHERE l.pooja_id = ? AND s.is_deleted = 0`, [poojaRow.id]),
    queryAll(`SELECT l.user_id, l.devotee_id, d.code AS devotee_code
              FROM pooja_coordinator_links l LEFT JOIN devotees d ON d.id = l.devotee_id
              WHERE l.pooja_id = ?`, [poojaRow.id]),
    queryAll(`SELECT g.*, l.role AS link_role, dv.code AS devotee_code, dv.name AS dev_name,
                dv.mobile AS dev_mobile, dv.city AS dev_city, dv.state AS dev_state
              FROM guests g JOIN pooja_guest_links l ON l.guest_id = g.id
              LEFT JOIN devotees dv ON dv.id = g.devotee_id
              WHERE l.pooja_id = ? AND g.is_deleted = 0`, [poojaRow.id]),
  ]);
  // coordinatorIds = the person identity (devotee code) so the client links the
  // same way whether or not that person has a login account.
  return mapPooja(poojaRow, {
    sessions: sessRows.map(mapPoojaSession),
    sevarthiIds: sevRows.map(r => r.code || String(r.id)),
    coordinatorIds: coordRows.map(r => r.devotee_code || (r.devotee_id != null ? String(r.devotee_id) : null))
      .filter(Boolean),
    coordinatorUserIds: coordRows.map(r => r.user_id).filter(v => v != null),
    guests: guestRows.map(mapGuest),
  });
}

const TYPE_JOIN = `
  SELECT p.*, pt.code AS type_code
  FROM poojas p
  LEFT JOIN pooja_types pt ON pt.id = p.type_id
  WHERE p.is_deleted = 0`;

async function poojaByIdOrCode(v) {
  const rows = await queryAll(TYPE_JOIN + ' AND (p.id = ? OR p.code = ?) LIMIT 1', [v, v]);
  return rows[0] || null;
}

async function canManage(req, poojaRow) {
  if (isAdminTier(req.user)) return true;
  if ((req.user.roles || []).includes('pooja_coordinator')) {
    const me = await queryOne('SELECT devotee_id FROM users WHERE id = ?', [req.user.id]);
    const devId = (me && me.devotee_id) || -1;
    const link = await queryOne(
      'SELECT 1 AS x FROM pooja_coordinator_links WHERE pooja_id = ? AND (user_id = ? OR devotee_id = ?)',
      [poojaRow.id, req.user.id, devId]);
    return !!link;
  }
  return false;
}

/* ---------- list ---------- */
router.get('/', async (req, res, next) => {
  try {
    const where = [];
    const args = [];
    if (!isAdminTier(req.user) && (req.user.roles || []).includes('pooja_coordinator')) {
      const ids = req.scope.poojaIds || [];
      if (!ids.length) return res.json([]);
      where.push(`p.id IN (${ids.map(() => '?').join(',')})`);
      args.push(...ids);
    }
    if (req.query.status) { where.push('p.status = ?'); args.push(req.query.status); }
    if (req.query.typeId) { where.push('(pt.code = ? OR p.type_id = ?)'); args.push(req.query.typeId, parseInt(req.query.typeId, 10) || -1); }
    const sql = TYPE_JOIN + (where.length ? ' AND ' + where.join(' AND ') : '') + ' ORDER BY p.created_at DESC';
    const rows = await queryAll(sql, args);
    const out = [];
    for (const r of rows) out.push(await hydrate(r));
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!isAdminTier(req.user) && (req.user.roles || []).includes('pooja_coordinator')
        && !(req.scope.poojaIds || []).includes(row.id)) {
      return res.status(403).json({ error: 'Not your pooja' });
    }
    res.json(await hydrate(row));
  } catch (e) { next(e); }
});

/* ---------- create (admin tier) ---------- */
router.post('/', adminTier, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const scheduleMode = b.scheduleMode === 'multi' ? 'multi' : 'single';

    let typeId = null;
    if (b.typeId) {
      const t = await queryOne('SELECT id FROM pooja_types WHERE (code = ? OR id = ?) AND is_deleted = 0',
        [b.typeId, parseInt(b.typeId, 10) || -1]);
      if (!t) return res.status(400).json({ error: 'Unknown typeId' });
      typeId = t.id;
    }

    const sessions = Array.isArray(b.sessions) ? b.sessions : [];
    if (!sessions.length) return res.status(400).json({ error: 'at least one session is required' });
    for (const s of sessions) {
      if (!s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return res.status(400).json({ error: 'each session needs a date (YYYY-MM-DD)' });
    }
    if (scheduleMode === 'single' && sessions.length > 1) {
      return res.status(400).json({ error: 'single-mode pooja can have only one session' });
    }

    const id = crypto.randomUUID();
    let annualEventId = null;
    if (b.annualEventId) {
      const ae = await queryOne('SELECT id FROM annual_events WHERE (code = ? OR id = ?) AND is_deleted = 0',
        [b.annualEventId, parseInt(b.annualEventId, 10) || -1]);
      annualEventId = ae ? ae.id : null;
    }
    const code = await nextCode('pooja');
    const color = b.color || await nextColorFor('poojas');   // auto-cycled, no picker
    await run(
      `INSERT INTO poojas (id, code, type_id, name, schedule_mode, default_venue, status, color,
                           estimated_seva_amount, notes, custom_json, invitation_json, annual_event_id, created_date)
       VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, date('now'))`,
      [id, code, typeId, name, scheduleMode, b.defaultVenue || '', color,
       Number(b.estimatedSevaAmount || 0), b.notes || '',
       JSON.stringify(b.custom || []), JSON.stringify(b.invitation || {}), annualEventId]
    );
    for (const s of sessions) {
      await run(
        `INSERT INTO pooja_sessions (id, pooja_id, label, date, start_time, end_time, venue)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), id, s.label || '', s.date, s.startTime || '', s.endTime || '', s.venue || b.defaultVenue || '']
      );
    }
    for (const g of (Array.isArray(b.guests) ? b.guests : [])) {
      await addGuest(id, g);
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'CREATE', entityType: 'pooja', entityId: code, details: { name } });
    res.status(201).json(await hydrate(await poojaByIdOrCode(id)));
  } catch (e) { next(e); }
});

/* ---------- patch pooja fields ---------- */
router.patch('/:id', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });

    const b = req.body || {};
    const sets = [], args = [];
    if (typeof b.name === 'string') { sets.push('name = ?'); args.push(b.name); }
    if (typeof b.defaultVenue === 'string') { sets.push('default_venue = ?'); args.push(b.defaultVenue); }
    if (typeof b.notes === 'string') { sets.push('notes = ?'); args.push(b.notes); }
    if (typeof b.color === 'string') { sets.push('color = ?'); args.push(b.color); }
    if (b.estimatedSevaAmount !== undefined) { sets.push('estimated_seva_amount = ?'); args.push(Number(b.estimatedSevaAmount || 0)); }
    if (b.scheduleMode === 'single' || b.scheduleMode === 'multi') { sets.push('schedule_mode = ?'); args.push(b.scheduleMode); }
    if (b.custom !== undefined) { sets.push('custom_json = ?'); args.push(JSON.stringify(b.custom || [])); }
    if (b.invitation !== undefined) { sets.push('invitation_json = ?'); args.push(JSON.stringify(b.invitation || {})); }
    if (b.status && ['planned', 'today', 'completed', 'done', 'extended', 'cancelled'].includes(b.status)) {
      sets.push('status = ?'); args.push(b.status);
    }
    if (!sets.length) return res.json(await hydrate(row));
    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE poojas SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'UPDATE', entityType: 'pooja', entityId: row.code });
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    await run(`UPDATE poojas SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await run('UPDATE pooja_sessions SET is_deleted = 1 WHERE pooja_id = ?', [row.id]);
    await run('DELETE FROM pooja_sevarthi_links WHERE pooja_id = ?', [row.id]);
    await run('DELETE FROM pooja_coordinator_links WHERE pooja_id = ?', [row.id]);
    await run('DELETE FROM pooja_guest_links WHERE pooja_id = ?', [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'DELETE', entityType: 'pooja', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- sessions ---------- */
router.post('/:id/sessions', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const s = req.body || {};
    if (!s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    const sid = crypto.randomUUID();
    await run(
      `INSERT INTO pooja_sessions (id, pooja_id, label, date, start_time, end_time, venue) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sid, row.id, s.label || '', s.date, s.startTime || '', s.endTime || '', s.venue || row.default_venue || '']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'CREATE', entityType: 'pooja_session', entityId: sid, scopeId: row.code });
    res.status(201).json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.patch('/:id/sessions/:sid', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const s = req.body || {};
    const sets = [], args = [];
    for (const [k, col] of Object.entries({ label: 'label', startTime: 'start_time', endTime: 'end_time', venue: 'venue' })) {
      if (typeof s[k] === 'string') { sets.push(`${col} = ?`); args.push(s[k]); }
    }
    if (s.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return res.status(400).json({ error: 'bad date' });
      sets.push('date = ?'); args.push(s.date);
    }
    if (!sets.length) return res.json(await hydrate(row));
    args.push(req.params.sid, row.id);
    await run(`UPDATE pooja_sessions SET ${sets.join(', ')} WHERE id = ? AND pooja_id = ?`, args);
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/sessions/:sid', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    await run('UPDATE pooja_sessions SET is_deleted = 1 WHERE id = ? AND pooja_id = ?', [req.params.sid, row.id]);
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

/* ---------- sevarthis (add-or-reuse by mobile, link to devotee) ---------- */
router.post('/:id/sevarthis', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body || {};

    let sev = null;
    if (b.sevarthiId) {
      sev = await queryOne('SELECT * FROM sevarthis WHERE (code = ? OR id = ?) AND is_deleted = 0',
        [b.sevarthiId, parseInt(b.sevarthiId, 10) || -1]);
      if (!sev) return res.status(400).json({ error: 'Unknown sevarthiId' });
    } else {
      const mobile = digits(b.mobile);
      if (mobile && mobile.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });

      let devoteeId = null;
      if (b.devoteeId != null && String(b.devoteeId).trim()) {
        const dev = await queryOne('SELECT id FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
          [parseInt(b.devoteeId, 10) || -1, String(b.devoteeId)]);
        if (!dev) return res.status(400).json({ error: 'That devotee no longer exists' });
        devoteeId = dev.id;
      } else {
        const first = String(b.firstName || '').trim();
        if (!first && !b.name && !mobile) return res.status(400).json({ error: 'devoteeId or firstName is required' });
        devoteeId = await ensureDevotee({
          firstName: first, lastName: b.lastName, name: b.name, mobile,
          city: b.city, state: b.state,
        });
      }

      // reuse an existing sevarthi for this person (by devotee link, then mobile)
      const findSev = async () => {
        let s = devoteeId ? await queryOne('SELECT * FROM sevarthis WHERE devotee_id = ? AND is_deleted = 0', [devoteeId]) : null;
        if (!s && mobile) s = await queryOne('SELECT * FROM sevarthis WHERE mobile = ? AND is_deleted = 0', [mobile]);
        return s;
      };
      sev = await findSev();
      if (!sev) {
        const dev = await queryOne('SELECT * FROM devotees WHERE id = ?', [devoteeId]);
        const parts = String((dev && dev.name) || b.firstName || '').trim().split(/\s+/);
        const first = parts.shift() || (b.firstName || '');
        try {
          const code = await nextCode('sevarthi');
          const r = await run(
            `INSERT INTO sevarthis (code, devotee_id, first_name, last_name, mobile, city, state, committee, status, notes, added_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, date('now'))`,
            [code, devoteeId, first, parts.join(' ') || (b.lastName || ''),
             (dev && dev.mobile) || mobile, (dev && dev.city) || b.city || '',
             (dev && dev.state) || b.state || 'Gujarat', b.committee || '', b.notes || '']
          );
          sev = await queryOne('SELECT * FROM sevarthis WHERE id = ?', [r.lastInsertRowid]);
        } catch (e) {
          sev = await findSev();                       // lost a concurrent race → reuse the winner
          if (!sev) throw e;
        }
      } else if (devoteeId && !sev.devotee_id) {
        await run('UPDATE sevarthis SET devotee_id = ? WHERE id = ?', [devoteeId, sev.id]);
      }
    }

    const linked = await queryOne('SELECT 1 AS x FROM pooja_sevarthi_links WHERE pooja_id = ? AND sevarthi_id = ?', [row.id, sev.id]);
    if (linked) return res.status(409).json({ error: 'Already a sevarthi of this pooja' });
    try {
      await run('INSERT INTO pooja_sevarthi_links (pooja_id, sevarthi_id) VALUES (?, ?)', [row.id, sev.id]);
    } catch (e) {
      // composite PK already holds this pair (concurrent double-add) — treat as done
      const now = await queryOne('SELECT 1 AS x FROM pooja_sevarthi_links WHERE pooja_id = ? AND sevarthi_id = ?', [row.id, sev.id]);
      if (!now) throw e;
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'LINK', entityType: 'sevarthi', entityId: sev.code, scopeId: row.code });
    res.status(201).json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/sevarthis/:sevId', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const sev = await queryOne('SELECT id FROM sevarthis WHERE code = ? OR id = ?',
      [req.params.sevId, parseInt(req.params.sevId, 10) || -1]);
    if (sev) await run('DELETE FROM pooja_sevarthi_links WHERE pooja_id = ? AND sevarthi_id = ?', [row.id, sev.id]);
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

/* ---------- coordinators (admin tier) ----------
   body: { userId } — an account holder, OR { devoteeId } — a person with no login.
   The link stores both the devotee identity and the account id when one exists;
   the role is granted only for an actual account. */
router.post('/:id/coordinators', adminTier, async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });

    let u = null, devId = null;
    if (req.body.userId != null && String(req.body.userId).trim()) {
      const uid = parseInt(req.body.userId, 10) || -1;
      u = await queryOne('SELECT * FROM users WHERE id = ? AND is_deleted = 0', [uid]);
      if (!u) return res.status(400).json({ error: 'Unknown userId' });
      devId = u.devotee_id;
    } else if (req.body.devoteeId != null && String(req.body.devoteeId).trim()) {
      const d = await queryOne('SELECT * FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
        [parseInt(req.body.devoteeId, 10) || -1, String(req.body.devoteeId)]);
      if (!d) return res.status(400).json({ error: 'Unknown devoteeId' });
      devId = d.id;
      u = await queryOne('SELECT * FROM users WHERE devotee_id = ? AND is_deleted = 0', [d.id]);
    } else {
      return res.status(400).json({ error: 'userId or devoteeId is required' });
    }

    const uid = u ? u.id : null;
    if (!devId && u) {
      devId = await ensureDevotee({ name: u.name || String(u.email || '').split('@')[0], mobile: u.mobile, city: u.city });
      if (devId) await run('UPDATE users SET devotee_id = ? WHERE id = ?', [devId, uid]);
    }

    if (uid) {
      await run(`INSERT INTO user_roles (user_id, role) SELECT ?, ? WHERE NOT EXISTS
                 (SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?)`, [uid, 'pooja_coordinator', uid, 'pooja_coordinator']);
    }
    const linked = await queryOne(
      'SELECT rowid AS rid, user_id FROM pooja_coordinator_links WHERE pooja_id = ? AND (devotee_id = ? OR user_id = ?) LIMIT 1',
      [row.id, devId || -1, uid || -1]);
    if (!linked) {
      try {
        await run('INSERT INTO pooja_coordinator_links (pooja_id, user_id, devotee_id) VALUES (?, ?, ?)', [row.id, uid, devId]);
      } catch (e) {
        // ux_pcoord_pd / ux_pcoord_pu — a concurrent grant already linked this person
        const now = await queryOne('SELECT 1 x FROM pooja_coordinator_links WHERE pooja_id = ? AND (devotee_id = ? OR user_id = ?)', [row.id, devId || -1, uid || -1]);
        if (!now) throw e;
      }
    } else if (uid && !linked.user_id) {
      await run('UPDATE pooja_coordinator_links SET user_id = ? WHERE rowid = ?', [uid, linked.rid]);
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'GRANT', entityType: 'pooja_coordinator', entityId: String(uid || 'dev:' + devId), scopeId: row.code });
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/coordinators/:ref', adminTier, async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    const ref = req.params.ref;
    // ref may be a user id OR a devotee id/code
    const dev = await queryOne('SELECT id FROM devotees WHERE id = ? OR code = ?', [parseInt(ref, 10) || -1, ref]);
    const devId = dev ? dev.id : -1;
    const uid = parseInt(ref, 10) || -1;
    const links = await queryAll(
      'SELECT rowid AS rid, user_id FROM pooja_coordinator_links WHERE pooja_id = ? AND (user_id = ? OR devotee_id = ?)',
      [row.id, uid, devId]);
    for (const l of links) await run('DELETE FROM pooja_coordinator_links WHERE rowid = ?', [l.rid]);
    // drop the role for any freed account that now coordinates nothing
    for (const l of links) {
      if (!l.user_id) continue;
      const still = await queryOne('SELECT 1 AS x FROM pooja_coordinator_links WHERE user_id = ? LIMIT 1', [l.user_id]);
      if (!still) await run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', [l.user_id, 'pooja_coordinator']);
      await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [l.user_id]);
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'REVOKE', entityType: 'pooja_coordinator', entityId: String(ref), scopeId: row.code });
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

/* ---------- guests ---------- */
/* Returns { ok, guestId?, code?, reason? }. A guest is always a devotee (a real
   person invited to a pooja), so we require enough to resolve one — a 10-digit
   mobile OR a name+city — and never create an unlinked / un-dedupable row. */
async function addGuest(poojaId, g) {
  const mobile = digits(g.mobile);
  const city = String(g.city || '').trim();
  const rawName = String(g.name || '').trim();
  const parts = rawName.split(/\s+/).filter(Boolean);
  const first = g.firstName ? String(g.firstName).trim() : (parts.shift() || '');
  const last = g.lastName != null ? String(g.lastName).trim() : parts.join(' ');
  const fullName = `${first} ${last}`.trim() || rawName;
  if (!fullName) return { ok: false, reason: 'guest name is required' };
  if (!(mobile.length === 10 || city)) {
    return { ok: false, reason: 'a 10-digit mobile or a city is required to add a guest' };
  }

  const devoteeId = await ensureDevotee({
    firstName: first, lastName: last, name: fullName, mobile, city, state: g.state,
  });
  if (!devoteeId) return { ok: false, reason: 'could not resolve the guest to a person' };

  // ONE registry guest row per person (ux_guests_devotee) — reuse or create it
  let guest = await queryOne(
    'SELECT id, code FROM guests WHERE devotee_id = ? AND is_deleted = 0 LIMIT 1', [devoteeId]);
  if (!guest) {
    const code = await nextCode('guest');
    try {
      const r = await run(
        `INSERT INTO guests (code, devotee_id, first_name, last_name, mobile, city, state, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, devoteeId, first, last, mobile, city, g.state || 'Gujarat', g.notes || '']);
      guest = { id: r.lastInsertRowid, code };
    } catch (e) {
      guest = await queryOne('SELECT id, code FROM guests WHERE devotee_id = ? AND is_deleted = 0 LIMIT 1', [devoteeId]);
      if (!guest) throw e;
    }
  }

  // the per-pooja role lives on the link, not the registry row
  const role = g.role || g.title || '';
  const linked = await queryOne(
    'SELECT 1 AS x FROM pooja_guest_links WHERE pooja_id = ? AND guest_id = ?', [poojaId, guest.id]);
  if (linked) {
    await run('UPDATE pooja_guest_links SET role = ? WHERE pooja_id = ? AND guest_id = ?', [role, poojaId, guest.id]);
    return { ok: true, guestId: guest.id, code: guest.code, deduped: true };
  }
  await run('INSERT INTO pooja_guest_links (pooja_id, guest_id, role) VALUES (?, ?, ?)', [poojaId, guest.id, role]);
  return { ok: true, guestId: guest.id, code: guest.code };
}

router.post('/:id/guests', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const g = await addGuest(row.id, req.body);
    if (!g.ok) return res.status(400).json({ error: g.reason });
    if (!g.deduped) {
      await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
        action: 'CREATE', entityType: 'guest', entityId: g.code, scopeId: row.code });
    }
    res.status(201).json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/guests/:guestId', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    const g = await queryOne('SELECT id FROM guests WHERE code = ? OR id = ?', [req.params.guestId, parseInt(req.params.guestId, 10) || -1]);
    if (g) {
      await run('DELETE FROM pooja_guest_links WHERE pooja_id = ? AND guest_id = ?', [row.id, g.id]);
      await run('UPDATE guests SET is_deleted = 1 WHERE id = ?', [g.id]);
    }
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

module.exports = router;
