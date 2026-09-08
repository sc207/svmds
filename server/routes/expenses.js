/* Temple expenses ledger. Any session reads + writes; delete is admin tier. */
const express = require('express');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { logAudit } = require('../services/audit');
const { mapExpense } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');
const STATUS = ['Paid', 'Pending'];
const byIdOrCode = v => queryOne('SELECT * FROM expenses WHERE (id = ? OR code = ?) AND is_deleted = 0', [parseInt(v, 10) || -1, v]);

router.get('/', async (req, res, next) => {
  try {
    const where = ['is_deleted = 0'];
    const args = [];
    if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
    if (req.query.category) { where.push('category = ?'); args.push(req.query.category); }
    if (req.query.from) { where.push('date >= ?'); args.push(req.query.from); }
    if (req.query.to) { where.push('date <= ?'); args.push(req.query.to); }
    const rows = await queryAll(`SELECT * FROM expenses WHERE ${where.join(' AND ')} ORDER BY date DESC`, args);
    res.json(rows.map(mapExpense));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const title = String(b.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    if (!(Number(b.amount) > 0)) return res.status(400).json({ error: 'amount must be > 0' });
    const code = await nextCode('expense');
    const r = await run(
      'INSERT INTO expenses (code, title, category, amount, date, status) VALUES (?, ?, ?, ?, ?, ?)',
      [code, title, b.category || '', Number(b.amount), b.date, STATUS.includes(b.status) ? b.status : 'Pending']
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Expenses',
      action: 'CREATE', entityType: 'expense', entityId: code, details: { title, amount: Number(b.amount) } });
    res.status(201).json(mapExpense(await queryOne('SELECT * FROM expenses WHERE id = ?', [r.lastInsertRowid])));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Expense not found' });
    const b = req.body || {};
    const sets = [], args = [];
    if (typeof b.title === 'string') { sets.push('title = ?'); args.push(b.title); }
    if (typeof b.category === 'string') { sets.push('category = ?'); args.push(b.category); }
    if (b.amount !== undefined) {
      if (!(Number(b.amount) > 0)) return res.status(400).json({ error: 'amount must be > 0' });
      sets.push('amount = ?'); args.push(Number(b.amount));
    }
    if (b.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'bad date' });
      sets.push('date = ?'); args.push(b.date);
    }
    if (b.status !== undefined) {
      if (!STATUS.includes(b.status)) return res.status(400).json({ error: 'bad status' });
      sets.push('status = ?'); args.push(b.status);
    }
    if (!sets.length) return res.json(mapExpense(row));
    args.push(row.id);
    await run(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`, args);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Expenses',
      action: 'UPDATE', entityType: 'expense', entityId: row.code });
    res.json(mapExpense(await queryOne('SELECT * FROM expenses WHERE id = ?', [row.id])));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await byIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Expense not found' });
    await run('UPDATE expenses SET is_deleted = 1 WHERE id = ?', [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Expenses',
      action: 'DELETE', entityType: 'expense', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
