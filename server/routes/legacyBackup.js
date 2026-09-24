/* TEMPORARY — the old portal's data, kept by the 2026-09-24 Phase 1 cutover
   in the `p1_legacy_backup` table (one row per old table, rows as JSON).
   Super admin only: download it as a file, then delete the table so the
   database holds Phase 1 data alone. Remove this router (and its card on
   Accounts & Access) once the table is gone. */
const express = require('express');
const db = require('../db');
const { requireSuperadmin } = require('../middleware/authz');
const { logAudit } = require('../services/audit');
const { needsFreshAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireSuperadmin);

const exists = async () =>
  !!(await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='p1_legacy_backup'`));

router.get('/status', async (req, res) => {
  if (!(await exists())) return res.json({ exists: false });
  const s = await db.get(`SELECT COUNT(*) AS tables, IFNULL(SUM(row_count), 0) AS rows, MIN(taken_at) AS taken_at
                            FROM p1_legacy_backup`);
  res.json({ exists: true, ...s });
});

router.get('/download', needsFreshAuth('Downloading the old portal data'), async (req, res) => {
  if (!(await exists())) return res.status(404).json({ error: 'The old portal backup has already been deleted.' });
  const rows = await db.all(`SELECT table_name, row_count, rows_json, taken_at FROM p1_legacy_backup ORDER BY table_name`);
  const out = { source: 'Shri Vihat Meldi Dham — old portal data, kept at the Phase 1 cutover',
    taken_at: rows.length ? rows[0].taken_at + ' UTC' : null, tables: {} };
  for (const r of rows) out.tables[r.table_name] = JSON.parse(r.rows_json);
  await logAudit({ userId: req.user.id, userEmail: req.user.email, userName: req.user.name, module: 'Access',
    action: 'EXPORT', entityType: 'legacy_backup', details: { tables: rows.length } });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="old-portal-backup-2026-09-24.json"');
  res.send(JSON.stringify(out, null, 1));
});

/* Deliberate: the body must say DELETE, so a stray request cannot drop it. */
router.delete('/', needsFreshAuth('Deleting the old portal backup'), async (req, res) => {
  if (!req.body || req.body.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm — download the backup first.' });
  }
  if (!(await exists())) return res.json({ ok: true, alreadyGone: true });
  const s = await db.get(`SELECT COUNT(*) AS tables, IFNULL(SUM(row_count), 0) AS rows FROM p1_legacy_backup`);
  await db.run(`DROP TABLE p1_legacy_backup`);
  await logAudit({ userId: req.user.id, userEmail: req.user.email, userName: req.user.name, module: 'Access',
    action: 'DELETE', entityType: 'legacy_backup', details: { tables: s.tables, rows: s.rows } });
  res.json({ ok: true });
});

module.exports = router;
