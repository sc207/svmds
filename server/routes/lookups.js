/* Samaj / Devotee category / Donation category / Payment method.
   One table, one `type` column — every "add new … " button in the UI
   comes back here, so a new kind of list never needs a new table. */
const express = require('express');
const db = require('../db');
const { log } = require('../middleware/audit');

const router = express.Router();

const LABEL = {
  samaj: 'Samaj',
  devotee_category: 'Devotee Category',
  donation_category: 'Donation Category',
};

router.get('/', async (req, res) => {
  const { type } = req.query;
  const rows = type
    ? await db.all(`SELECT * FROM lookups WHERE type = ? AND active = 1 ORDER BY sort_order, value`, type)
    : await db.all(`SELECT * FROM lookups WHERE active = 1 ORDER BY type, sort_order, value`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const type = String(req.body.type || '').trim();
  const value = String(req.body.value || '').trim();
  if (!LABEL[type]) return res.status(400).json({ error: 'Unknown list type' });
  if (!value) return res.status(400).json({ error: 'Value is required' });

  const existing = await db.get(`SELECT * FROM lookups WHERE type = ? AND value = ?`, type, value);
  if (existing) {
    if (!existing.active) await db.run(`UPDATE lookups SET active = 1 WHERE id = ?`, existing.id);
    return res.json({ ...existing, active: 1 });
  }

  const info = await db.run(`INSERT INTO lookups (type, value) VALUES (?, ?)`, type, value);
  const row = await db.get(`SELECT * FROM lookups WHERE id = ?`, info.lastInsertRowid);
  await log(req, {
    action: 'create', entity: 'lookup', entityId: row.id,
    summary: `Added ${LABEL[type]} "${value}"`, details: row,
  });
  res.status(201).json(row);
});

/** Rename a list entry. Devotees reference the row by id, so fixing a
    spelling here fixes it on every devotee at once — which is the point
    of the lookup table, and why renaming beats delete-and-re-add. */
router.put('/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM lookups WHERE id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const value = String(req.body.value || '').trim();
  if (!value) return res.status(400).json({ error: 'Value is required' });

  const clash = await db.get(`SELECT id FROM lookups WHERE type = ? AND value = ? AND id <> ?`,
    row.type, value, row.id);
  if (clash) return res.status(409).json({ error: `"${value}" is already in this list` });

  await db.run(`UPDATE lookups SET value = ?, sort_order = ? WHERE id = ?`,
    value, req.body.sort_order ?? row.sort_order, row.id);
  await log(req, {
    action: 'update', entity: 'lookup', entityId: row.id,
    summary: `Renamed ${LABEL[row.type] || row.type} "${row.value}" to "${value}"`,
  });
  res.json(await db.get(`SELECT * FROM lookups WHERE id = ?`, row.id));
});

router.delete('/:id', async (req, res) => {
  const row = await db.get(`SELECT * FROM lookups WHERE id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  await db.run(`UPDATE lookups SET active = 0 WHERE id = ?`, row.id);
  await log(req, {
    action: 'delete', entity: 'lookup', entityId: row.id,
    summary: `Removed ${LABEL[row.type] || row.type} "${row.value}"`,
  });
  res.json({ ok: true });
});

module.exports = router;
