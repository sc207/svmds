/* Server-side dashboard figures + "needs attention" + today list.
   Admin tier → global; a scoped persona → only their module. (BACKEND_PLAN.md §8) */
const { queryOne, queryAll } = require('../db/connection');
const { calendarEntries } = require('./calendar');

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function one(sql, args = []) {
  const r = await queryOne(sql, args);
  return r ? Number(Object.values(r)[0] || 0) : 0;
}

async function adminFigures() {
  const [devotees, donationsReceived, donationValue, pledged, poojasUpcoming, committees,
    teams, eventsUpcoming, visitsOpen, expensesPending, lowStock] = await Promise.all([
    one('SELECT COUNT(*) FROM devotees WHERE is_deleted = 0'),
    one("SELECT COUNT(*) FROM donations WHERE is_deleted = 0 AND status = 'received'"),
    one("SELECT COALESCE(SUM(CASE WHEN amount>0 THEN amount ELSE valuation END),0) FROM donations WHERE is_deleted = 0 AND status = 'received'"),
    one("SELECT COUNT(*) FROM donations WHERE is_deleted = 0 AND status = 'pledged'"),
    one("SELECT COUNT(DISTINCT p.id) FROM poojas p JOIN pooja_sessions s ON s.pooja_id = p.id WHERE p.is_deleted = 0 AND s.is_deleted = 0 AND s.date >= date('now')"),
    one('SELECT COUNT(*) FROM committees WHERE is_deleted = 0'),
    one('SELECT COUNT(*) FROM teams WHERE is_deleted = 0'),
    one("SELECT COUNT(DISTINCT e.id) FROM events e JOIN event_days d ON d.event_id = e.id WHERE e.is_deleted = 0 AND d.is_deleted = 0 AND d.date >= date('now')"),
    one("SELECT COUNT(*) FROM visits WHERE is_deleted = 0 AND status IN ('requested','scheduled','confirmed')"),
    one("SELECT COUNT(*) FROM expenses WHERE is_deleted = 0 AND status = 'Pending'"),
    one("SELECT COUNT(*) FROM inventory WHERE is_deleted = 0 AND status IN ('Low Stock','Out of Stock')"),
  ]);
  return {
    devotees, donationsReceived, donationValue, pledgedDonations: pledged,
    poojasUpcoming, committees, teams, eventsUpcoming,
    visitsOpen, expensesPending, lowStockItems: lowStock,
  };
}

async function needsAttention() {
  const alerts = [];
  const pendingSignups = await one("SELECT COUNT(*) FROM public_signups WHERE status = 'pending' AND is_deleted = 0");
  if (pendingSignups) alerts.push({ kind: 'signups', text: `${pendingSignups} volunteer signup(s) awaiting review`, page: 'management' });
  const pledged = await one("SELECT COUNT(*) FROM donations WHERE is_deleted = 0 AND status = 'pledged'");
  if (pledged) alerts.push({ kind: 'pledges', text: `${pledged} pledged donation(s) not yet received`, page: 'donations' });
  const lowStock = await one("SELECT COUNT(*) FROM inventory WHERE is_deleted = 0 AND status IN ('Low Stock','Out of Stock')");
  if (lowStock) alerts.push({ kind: 'inventory', text: `${lowStock} inventory item(s) low or out of stock`, page: 'inventory' });
  const openVisits = await one("SELECT COUNT(*) FROM visits WHERE is_deleted = 0 AND status = 'requested'");
  if (openVisits) alerts.push({ kind: 'visits', text: `${openVisits} padhramani request(s) not yet scheduled`, page: 'visits' });
  return alerts;
}

async function scopedFigures(scope) {
  const roles = scope.roles || [];
  const out = {};
  if (roles.includes('pooja_coordinator')) {
    const ids = scope.poojaIds || [];
    out.poojas = ids.length;
    out.sessionsUpcoming = ids.length ? await one(
      `SELECT COUNT(*) FROM pooja_sessions WHERE is_deleted = 0 AND date >= date('now') AND pooja_id IN (${ids.map(() => '?').join(',')})`, ids) : 0;
  }
  if (roles.includes('committee_leader')) {
    const ids = scope.committeeIds || [];
    out.committees = ids.length;
    out.members = ids.length ? await one(
      `SELECT COUNT(*) FROM committee_members WHERE is_deleted = 0 AND committee_id IN (${ids.map(() => '?').join(',')})`, ids) : 0;
  }
  if (roles.includes('management_lead')) {
    const ids = scope.teamIds || [];
    out.teams = ids.length;
    out.volunteers = ids.length ? await one(
      `SELECT COUNT(*) FROM team_members WHERE is_deleted = 0 AND team_id IN (${ids.map(() => '?').join(',')})`, ids) : 0;
    out.pendingSignups = ids.length ? await one(
      `SELECT COUNT(*) FROM public_signups WHERE status = 'pending' AND is_deleted = 0 AND team_id IN (${ids.map(() => '?').join(',')})`, ids) : 0;
  }
  if (roles.includes('event_incharge')) {
    const ids = scope.eventIds || [];
    out.events = ids.length;
  }
  return out;
}

async function dashboardPayload(scope) {
  const t = todayISO();
  const month = t.slice(0, 7);
  const cal = await calendarEntries(month, scope);
  const today = cal.filter(e => e.date === t);
  const upNext = cal.filter(e => e.date > t).slice(0, 8);

  if (scope.isAdmin) {
    return { persona: 'admin', figures: await adminFigures(), needsAttention: await needsAttention(), today, upNext };
  }
  return { persona: (scope.roles || [])[0] || 'user', figures: await scopedFigures(scope), needsAttention: [], today, upNext };
}

module.exports = { dashboardPayload };
