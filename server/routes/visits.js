/* Bappa / Bhuvaji Padhramni — home & shop visits.

   The person being visited links to the devotee register the same way a
   sevarthi booking does: pick an existing devotee, or type a new one and
   it upserts (mobile is the identity key). One or more devotees can be
   named as the escort leading the visit — a person, not a team, since
   there is no Management module in Phase 1 to hold a team roster. */
const express = require('express');
const db = require('../db');
const { log } = require('../middleware/audit');
const { upsertDevotee } = require('./devotees');

const router = express.Router();
const STATUSES = ['requested', 'confirmed', 'completed', 'cancelled'];

async function escortsOf(visitId) {
  return db.all(`
    SELECT d.id, d.full_name, d.mobile, d.city
      FROM visit_escorts ve JOIN devotees d ON d.id = ve.devotee_id
     WHERE ve.visit_id = ? ORDER BY d.full_name
  `, visitId);
}

/* Escorts for a whole list in ONE query — a per-row lookup is a network
   round trip each on Turso, and the list can be 500 rows. */
async function attachEscorts(rows) {
  if (!rows.length) return;
  const byVisit = new Map(rows.map((r) => [r.id, (r.escorts = [])]));
  const ids = [...byVisit.keys()];
  const found = await db.all(`
    SELECT ve.visit_id, d.id, d.full_name, d.mobile, d.city
      FROM visit_escorts ve JOIN devotees d ON d.id = ve.devotee_id
     WHERE ve.visit_id IN (${ids.map(() => '?').join(',')}) ORDER BY d.full_name
  `, ...ids);
  for (const { visit_id, ...e } of found) byVisit.get(visit_id).push(e);
}

async function setEscorts(visitId, ids) {
  await db.run(`DELETE FROM visit_escorts WHERE visit_id = ?`, visitId);
  for (const id of [...new Set((ids || []).filter(Boolean))]) {
    await db.run(`INSERT OR IGNORE INTO visit_escorts (visit_id, devotee_id) VALUES (?, ?)`, visitId, id);
  }
}

router.get('/', async (req, res) => {
  const { status, month, search, upcoming } = req.query;
  const where = [];
  const params = {};
  /* Qualified with v. because the join brings a second `mobile` and
     `city` into scope. */
  if (status) { where.push(`v.status = @status`); params.status = status; }
  if (month) { where.push(`substr(v.visit_date,1,7) = @month`); params.month = month; }
  if (upcoming === '1') {
    where.push(`v.visit_date >= date('now','+330 minutes') AND v.status <> 'cancelled'`);
  }
  if (search) {
    where.push(`(v.devotee_name LIKE @q OR v.mobile LIKE @q OR v.city LIKE @q
                 OR v.address LIKE @q OR d.full_name LIKE @q OR d.mobile LIKE @q
                 OR d.city LIKE @q)`);
    params.q = `%${String(search).trim()}%`;
  }

  /* A visit only stores mobile/city when this particular padhramni is
     somewhere other than the devotee's usual place. Picking a devotee
     from the register and leaving those blank is the normal case, so
     fall back to the register rather than showing a row with nothing
     on it but a date. `visit_*` keeps the visit's own value, which is
     what the edit form must not overwrite. */
  const rows = await db.all(
    `SELECT v.id, v.devotee_id, v.purpose, v.address, v.visit_date, v.visit_time,
            v.status, v.notes, v.created_at, v.updated_at,
            COALESCE(d.full_name, v.devotee_name) AS devotee_name,
            COALESCE(v.mobile, d.mobile)          AS mobile,
            COALESCE(v.city,   d.city)            AS city,
            v.mobile AS visit_mobile, v.city AS visit_city,
            d.state, d.mul_vatan,
            (SELECT value FROM lookups WHERE id = d.samaj_id) AS samaj
       FROM visits v LEFT JOIN devotees d ON d.id = v.devotee_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ${/* A view of visits still to happen is a queue to work through,
            so it reads soonest first. Completed visits, and "all", are
            a record, so they read newest first. */''}
      ORDER BY v.visit_date ${
        upcoming === '1' || status === 'requested' || status === 'confirmed' ? 'ASC' : 'DESC'
      }, v.visit_time, v.id
      LIMIT 500`,
    params);
  await attachEscorts(rows);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  /* The form edits the visit's own columns, so they come back raw —
     the devotee's details ride alongside as placeholders, so an
     operator can see what will be used without it being silently
     copied onto the visit. */
  const row = await db.get(`
    SELECT v.*, d.mobile AS devotee_mobile, d.city AS devotee_city
      FROM visits v LEFT JOIN devotees d ON d.id = v.devotee_id
     WHERE v.id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  row.escorts = await escortsOf(row.id);
  res.json(row);
});

router.post('/', async (req, res) => {
  const b = req.body;
  let name = String(b.devotee_name || '').trim();
  if (!b.visit_date) return res.status(400).json({ error: 'Visit date is required' });

  if (!name && !b.devotee_id) return res.status(400).json({ error: 'Pick or add the devotee being visited' });

  /* The devotee upsert, the visit and its escorts land together. */
  const id = await db.tx(async () => {
    // Pick an existing devotee, or upsert a new one from the typed name/mobile.
    let devoteeId = b.devotee_id || null;
    if (!devoteeId && name) {
      devoteeId = (await upsertDevotee(req, {
        full_name: name, mobile: b.mobile, city: b.city,
      })).id;
    }
    if (!name && devoteeId) {
      const d = await db.get(`SELECT full_name FROM devotees WHERE id = ?`, devoteeId);
      name = d ? d.full_name : '';
    }
    if (!name) throw Object.assign(new Error('Pick or add the devotee being visited'), { status: 400 });

    const info = await db.run(`
      INSERT INTO visits (devotee_id, devotee_name, mobile, purpose, address, city, visit_date, visit_time, status, notes)
      VALUES (@devotee_id, @devotee_name, @mobile, @purpose, @address, @city, @visit_date, @visit_time, @status, @notes)
    `, {
      devotee_id: devoteeId,
      devotee_name: name,
      mobile: (b.mobile || '').trim() || null,
      purpose: (b.purpose || '').trim() || null,
      address: (b.address || '').trim() || null,
      city: (b.city || '').trim() || null,
      visit_date: b.visit_date,
      visit_time: (b.visit_time || '').trim() || null,
      status: STATUSES.includes(b.status) ? b.status : 'requested',
      notes: (b.notes || '').trim() || null,
    });
    const newId = Number(info.lastInsertRowid);
    await setEscorts(newId, b.escort_ids);
    return newId;
  });

  const row = await db.get(`SELECT * FROM visits WHERE id = ?`, id);
  row.escorts = await escortsOf(id);
  await log(req, {
    action: 'create', entity: 'visit', entityId: row.id,
    summary: `Padhramni booked for ${name} on ${b.visit_date}` +
             (row.escorts.length ? ` — escort: ${row.escorts.map((e) => e.full_name).join(', ')}` : ''),
    details: row,
  });
  res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM visits WHERE id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const b = req.body;

  let devoteeId = b.devotee_id !== undefined ? b.devotee_id : row.devotee_id;
  let name = b.devotee_name !== undefined ? String(b.devotee_name).trim() : row.devotee_name;
  await db.tx(async () => {
    if (!devoteeId && name && b.devotee_name !== undefined) {
      devoteeId = (await upsertDevotee(req, { full_name: name, mobile: b.mobile, city: b.city })).id;
    }
    await db.run(`
      UPDATE visits SET devotee_id=@devotee_id, devotee_name=@devotee_name, mobile=@mobile, purpose=@purpose,
             address=@address, city=@city, visit_date=@visit_date, visit_time=@visit_time, status=@status,
             notes=@notes, updated_at=datetime('now','+330 minutes')
       WHERE id=@id
    `, {
      id: row.id,
      devotee_id: devoteeId,
      devotee_name: name,
      mobile: b.mobile ?? row.mobile,
      purpose: b.purpose ?? row.purpose,
      address: b.address ?? row.address,
      city: b.city ?? row.city,
      visit_date: b.visit_date ?? row.visit_date,
      visit_time: b.visit_time ?? row.visit_time,
      status: STATUSES.includes(b.status) ? b.status : row.status,
      notes: b.notes ?? row.notes,
    });
    if (b.escort_ids !== undefined) await setEscorts(row.id, b.escort_ids);
  });

  const updated = await db.get(`SELECT * FROM visits WHERE id = ?`, row.id);
  updated.escorts = await escortsOf(row.id);
  await log(req, {
    action: 'update', entity: 'visit', entityId: row.id,
    summary: `Padhramni for ${updated.devotee_name} — ${updated.status} (${updated.visit_date})`,
  });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM visits WHERE id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  /* Escorts explicitly — ON DELETE CASCADE needs foreign_keys, which is
     not guaranteed on every connection to Turso. */
  await db.tx(async () => {
    await db.run(`DELETE FROM visit_escorts WHERE visit_id = ?`, row.id);
    await db.run(`DELETE FROM visits WHERE id = ?`, row.id);
  });
  await log(req, {
    action: 'delete', entity: 'visit', entityId: row.id,
    summary: `Deleted padhramni for ${row.devotee_name} (${row.visit_date})`, details: row,
  });
  res.json({ ok: true });
});

module.exports = router;
