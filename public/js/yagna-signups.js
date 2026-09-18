/* ============================================================
   MAHA YAGNA SEVARTHI SIGNUPS — data layer
   Read-only register of the public registration form's submissions
   (server/routes/publicYagna.js -> yagna_sevarthi_signups). Admin reviews
   status/notes here; the public page itself never touches this module.
   Renders into #yagnaSignupsRoot (yagna-signups-ui.js). See MAHA_YAGNA_PLAN.md.
   ============================================================ */

if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
}

const YAGNA = {
  list: [],                                        // mapped rows from GET /yagna-signups
  settings: { enabled: false, opensAt: null, closesAt: null },
  filterStatus: 'all',
  search: '',
};

function yagnaByCode(code) { return YAGNA.list.find(x => x.id === code || x.code === code); }
function yagnaToast(m) { if (typeof showToast === 'function') showToast(m); }

const YAGNA_STATUS_BADGE = { submitted: 'badge-pending', reviewed: 'badge-confirmed', converted: 'badge-maroon', rejected: 'badge-cancelled' };
function yagnaStatusLabel(st) { return window.t('yagna_st_' + st, (st || '').charAt(0).toUpperCase() + (st || '').slice(1)); }

function yagnaMoney(n) { return '₹' + (Number(n) || 0).toLocaleString('en-IN'); }
function yagnaDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso; }
}

/** { total, byStatus:{submitted,reviewed,converted,rejected}, totalContribution } */
function yagnaSummary() {
  const byStatus = { submitted: 0, reviewed: 0, converted: 0, rejected: 0 };
  let totalContribution = 0;
  YAGNA.list.forEach(x => {
    if (byStatus[x.status] != null) byStatus[x.status]++;
    totalContribution += Number(x.expectedContribution) || 0;
  });
  return { total: YAGNA.list.length, byStatus, totalContribution };
}

/** Raw samaj names as submitted, grouped verbatim (case-sensitive, untrimmed
 * beyond what the form already trims) — deliberately NOT normalised here.
 * Staff eyeball this list to see "Rabari Samaj" / "rabari samaj" / "Rabari
 * Samaj Ahmedabad" as separate rows and decide which real committee(s) each
 * one maps to; nothing here creates or matches a committee automatically.
 * Sorted by count desc, so the biggest groups surface first. */
function yagnaSamajBreakdown() {
  const counts = {};
  YAGNA.list.forEach(x => {
    const name = (x.samajName || '').trim() || '(blank)';
    counts[name] = (counts[name] || 0) + 1;
  });
  return Object.keys(counts).map(name => ({ name, count: counts[name] })).sort((a, b) => b.count - a.count);
}
