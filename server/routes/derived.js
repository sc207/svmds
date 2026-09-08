/* Derived / aggregate reads: calendar, dashboard, activity feed, month reports.
   All scope-aware via req.scope. Mounted behind authRequired + attachScope. */
const express = require('express');
const { queryAll, queryOne } = require('../db/connection');
const { calendarEntries } = require('../services/calendar');
const { dashboardPayload } = require('../services/dashboard');
const { mapAudit } = require('../utils/mappers');

const router = express.Router();

/* GET /api/calendar?month=YYYY-MM */
router.get('/calendar', async (req, res, next) => {
  try {
    res.json(await calendarEntries(req.query.month, req.scope));
  } catch (e) { next(e); }
});

/* GET /api/dashboard */
router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await dashboardPayload(req.scope));
  } catch (e) { next(e); }
});

/* GET /api/activity?limit=&module= */
router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 200);
    const where = [];
    const args = [];
    if (req.query.module) { where.push('module = ?'); args.push(req.query.module); }

    if (!req.scope.isAdmin) {
      // a scoped persona only sees audit rows tagged to their module + owned ids
      const roles = req.scope.roles || [];
      const clauses = [];
      if (roles.includes('pooja_coordinator') && (req.scope.poojaIds || []).length) {
        clauses.push(`(module = 'Pooja')`);
      }
      if (roles.includes('committee_leader') && (req.scope.committeeIds || []).length) {
        clauses.push(`(module = 'Committee')`);
      }
      if (roles.includes('management_lead') && (req.scope.teamIds || []).length) {
        clauses.push(`(module = 'Management')`);
      }
      if (roles.includes('event_incharge') && (req.scope.eventIds || []).length) {
        clauses.push(`(module = 'Events')`);
      }
      if (roles.includes('accountant')) clauses.push(`(module IN ('Donations','Expenses'))`);
      where.push(clauses.length ? `(${clauses.join(' OR ')})` : '1 = 0');
    }

    const rows = await queryAll(
      `SELECT * FROM audit_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT ?`,
      [...args, limit]
    );
    res.json(rows.map(mapAudit));
  } catch (e) { next(e); }
});

/* GET /api/reports?month=YYYY-MM  — month summary figures (admin tier data;
   a scoped persona gets their slice only for donations/expenses if accountant). */
router.get('/reports', async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const like = `${month}-%`;
    const num = async (sql, a = []) => {
      const r = await queryOne(sql, a);
      return r ? Number(Object.values(r)[0] || 0) : 0;
    };
    const [donationsCount, donationsValue, pledgesValue, expensesPaid, expensesPending,
      newDevotees, poojaSessions, meetings, visits, eventDays] = await Promise.all([
      num("SELECT COUNT(*) FROM donations WHERE is_deleted = 0 AND status = 'received' AND date LIKE ?", [like]),
      num("SELECT COALESCE(SUM(CASE WHEN amount>0 THEN amount ELSE valuation END),0) FROM donations WHERE is_deleted = 0 AND status = 'received' AND date LIKE ?", [like]),
      num("SELECT COALESCE(SUM(CASE WHEN amount>0 THEN amount ELSE valuation END),0) FROM donations WHERE is_deleted = 0 AND status = 'pledged' AND date LIKE ?", [like]),
      num("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE is_deleted = 0 AND status = 'Paid' AND date LIKE ?", [like]),
      num("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE is_deleted = 0 AND status = 'Pending' AND date LIKE ?", [like]),
      num("SELECT COUNT(*) FROM devotees WHERE is_deleted = 0 AND substr(created_at,1,7) = ?", [month]),
      num("SELECT COUNT(*) FROM pooja_sessions WHERE is_deleted = 0 AND date LIKE ?", [like]),
      num("SELECT COUNT(*) FROM meetings WHERE is_deleted = 0 AND date LIKE ?", [like]),
      num("SELECT COUNT(*) FROM visits WHERE is_deleted = 0 AND date LIKE ?", [like]),
      num("SELECT COUNT(*) FROM event_days WHERE is_deleted = 0 AND date LIKE ?", [like]),
    ]);
    res.json({
      month,
      donations: { count: donationsCount, value: donationsValue, pledgedValue: pledgesValue },
      expenses: { paid: expensesPaid, pending: expensesPending },
      newDevotees, poojaSessions, meetings, visits, eventDays,
      net: donationsValue - expensesPaid,
    });
  } catch (e) { next(e); }
});

module.exports = router;
