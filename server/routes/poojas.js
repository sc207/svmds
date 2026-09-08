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
const { ensureDevotee } = require('../services/people');
const { nextColorFor } = require('../services/palette');
const { mapPooja, mapPoojaSession, mapSevarthi, mapGuest } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

/* ---------- hydration ---------- */
async function hydrate(poojaRow) {
  if (!poojaRow) return null;
  const [sessRows, sevRows, coordRows, guestRows] = await Promise.all([
    queryAll('SELECT * FROM pooja_sessions WHERE pooja_id = ? AND is_deleted = 0 ORDER BY date, start_time', [poojaRow.id]),
    queryAll(`SELECT s.* FROM sevarthis s JOIN pooja_sevarthi_links l ON l.sevarthi_id = s.id
              WHERE l.pooja_id = ? AND s.is_deleted = 0`, [poojaRow.id]),
    queryAll('SELECT user_id FROM pooja_coordinator_links WHERE pooja_id = ?', [poojaRow.id]),
    queryAll(`SELECT g.* FROM guests g JOIN pooja_guest_links l ON l.guest_id = g.id
              WHERE l.pooja_id = ? AND g.is_deleted = 0`, [poojaRow.id]),
  ]);
  return mapPooja(poojaRow, {
    sessions: sessRows.map(mapPoojaSession),
    sevarthiIds: sevRows.map(r => r.code || String(r.id)),
    coordinatorIds: coordRows.map(r => r.user_id),
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
    const link = await queryOne('SELECT 1 AS x FROM pooja_coordinator_links WHERE pooja_id = ? AND user_id = ?',
      [poojaRow.id, req.user.id]);
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
      const first = String(b.firstName || '').trim();
      const mobile = String(b.mobile || '').trim();
      if (!first) return res.status(400).json({ error: 'firstName is required' });
      if (mobile && !/^[0-9]{10}$/.test(mobile)) return res.status(400).json({ error: 'mobile must be 10 digits' });
      if (mobile) sev = await queryOne('SELECT * FROM sevarthis WHERE mobile = ? AND is_deleted = 0', [mobile]);
      if (!sev) {
        const devoteeId = await ensureDevotee({
          firstName: first, lastName: b.lastName, mobile,
          city: b.city, state: b.state, samaj: b.committee,
        });
        const code = await nextCode('sevarthi');
        const r = await run(
          `INSERT INTO sevarthis (code, devotee_id, first_name, last_name, mobile, city, state, committee, status, notes, added_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, date('now'))`,
          [code, devoteeId, first, b.lastName || '', mobile, b.city || '', b.state || 'Gujarat', b.committee || '', b.notes || '']
        );
        sev = await queryOne('SELECT * FROM sevarthis WHERE id = ?', [r.lastInsertRowid]);
      }
    }

    const linked = await queryOne('SELECT 1 AS x FROM pooja_sevarthi_links WHERE pooja_id = ? AND sevarthi_id = ?', [row.id, sev.id]);
    if (linked) return res.status(409).json({ error: 'Already a sevarthi of this pooja' });
    await run('INSERT INTO pooja_sevarthi_links (pooja_id, sevarthi_id) VALUES (?, ?)', [row.id, sev.id]);
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

/* ---------- coordinators (admin tier) ---------- */
router.post('/:id/coordinators', adminTier, async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    const uid = parseInt(req.body.userId, 10);
    const u = uid ? await queryOne('SELECT * FROM users WHERE id = ? AND is_deleted = 0', [uid]) : null;
    if (!u) return res.status(400).json({ error: 'Unknown userId' });
    const has = await queryOne('SELECT role FROM user_roles WHERE user_id = ? AND role = ?', [uid, 'pooja_coordinator']);
    if (!has) await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [uid, 'pooja_coordinator']);
    const linked = await queryOne('SELECT 1 AS x FROM pooja_coordinator_links WHERE pooja_id = ? AND user_id = ?', [row.id, uid]);
    if (!linked) await run('INSERT INTO pooja_coordinator_links (pooja_id, user_id) VALUES (?, ?)', [row.id, uid]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'GRANT', entityType: 'pooja_coordinator', entityId: String(uid), scopeId: row.code });
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id/coordinators/:userId', adminTier, async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    const uid = parseInt(req.params.userId, 10);
    await run('DELETE FROM pooja_coordinator_links WHERE pooja_id = ? AND user_id = ?', [row.id, uid]);
    // if this user now coordinates nothing, drop the role
    const still = await queryOne('SELECT 1 AS x FROM pooja_coordinator_links WHERE user_id = ? LIMIT 1', [uid]);
    if (!still) await run('DELETE FROM user_roles WHERE user_id = ? AND role = ?', [uid, 'pooja_coordinator']);
    await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [uid]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Pooja',
      action: 'REVOKE', entityType: 'pooja_coordinator', entityId: String(uid), scopeId: row.code });
    res.json(await hydrate(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

/* ---------- guests ---------- */
async function addGuest(poojaId, g) {
  const first = String(g.firstName || g.name || '').trim();
  if (!first) return;
  const code = await nextCode('guest');
  const r = await run(
    `INSERT INTO guests (code, first_name, last_name, role, mobile, city, state, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, first, g.lastName || '', g.role || g.title || '', g.mobile || '', g.city || '', g.state || 'Gujarat', g.notes || '']
  );
  await run('INSERT INTO pooja_guest_links (pooja_id, guest_id) VALUES (?, ?)', [poojaId, r.lastInsertRowid]);
}

router.post('/:id/guests', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Pooja not found' });
    if (!await canManage(req, row)) return res.status(403).json({ error: 'Forbidden' });
    if (!String(req.body.firstName || req.body.name || '').trim()) return res.status(400).json({ error: 'firstName is required' });
    await addGuest(row.id, req.body);
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
