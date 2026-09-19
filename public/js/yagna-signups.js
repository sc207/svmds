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
  filterInterest: 'all',
  search: '',
};

function yagnaByCode(code) { return YAGNA.list.find(x => x.id === code || x.code === code); }
function yagnaToast(m) { if (typeof showToast === 'function') showToast(m); }

/* submitted -> {under_review, contacted, needs_follow_up} -> reviewed is the
   Phase-1 review workflow (MAHA_YAGNA_PLAN.md). 'converted' stays a valid
   status (DB CHECK, migration 018) for forward-compatibility with the not-
   yet-built Phase 2 approval step, but nothing in this UI sets it — see
   openYagnaReviewSheet, whose dropdown deliberately excludes it. */
const YAGNA_STATUSES = ['submitted', 'under_review', 'contacted', 'needs_follow_up', 'reviewed', 'converted', 'rejected'];
const YAGNA_STATUS_BADGE = {
  submitted: 'badge-pending', under_review: 'badge-pending', contacted: 'badge-confirmed',
  needs_follow_up: 'badge-cancelled', reviewed: 'badge-confirmed', converted: 'badge-maroon', rejected: 'badge-cancelled',
};
function yagnaStatusLabel(st) { return window.t('yagna_st_' + st, (st || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')); }

/* What the registrant is interested in becoming a sevarthi FOR — an interest,
   not a confirmed assignment (see server/routes/publicYagna.js). Every row
   that predates this field is 'yagna' (the only thing the old Yagna-only
   form could have collected). */
const YAGNA_INTEREST_TYPES = ['yagna', 'pooja_seva', 'dhaja_pooja', 'unassigned'];
const YAGNA_INTEREST_BADGE = {
  yagna: 'badge-maroon', pooja_seva: 'badge-confirmed', dhaja_pooja: 'badge-pending', unassigned: 'badge-cancelled',
};
function yagnaInterestLabel(it) {
  return window.t('yagna_interest_' + (it || 'yagna'), {
    yagna: 'Maha Yagna', pooja_seva: 'Pooja & Seva', dhaja_pooja: 'Dhaja Pooja', unassigned: 'Not Sure / Assign Later',
  }[it] || 'Maha Yagna');
}

function yagnaMoney(n) { return '₹' + (Number(n) || 0).toLocaleString('en-IN'); }
function yagnaDate(iso) {
  if (!iso) return '—';
  if (typeof window.fmtServerTimeIST === 'function') return window.fmtServerTimeIST(iso);
  try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso; }
}

/** { total, byStatus:{...every YAGNA_STATUSES key}, totalContribution } */
function yagnaSummary() {
  const byStatus = {}; YAGNA_STATUSES.forEach(st => { byStatus[st] = 0; });
  let totalContribution = 0;
  YAGNA.list.forEach(x => {
    if (byStatus[x.status] != null) byStatus[x.status]++;
    totalContribution += Number(x.expectedContribution) || 0;
  });
  return { total: YAGNA.list.length, byStatus, totalContribution };
}

/** digits-only mobile, for exact comparison regardless of formatting. */
function yagnaDigits(v) { return String(v || '').replace(/\D/g, ''); }
/** lowercased+trimmed, for case/whitespace-insensitive comparison. */
function yagnaNorm(v) { return String(v || '').trim().toLowerCase(); }

/** Review-only aid: which OTHER live registrations share this row's exact
 * mobile, or its normalised first+last name and city. Deliberately simple
 * and deterministic (no fuzzy/phonetic matching) — flags possible repeats
 * for a human to look at, never auto-merges or deletes anything.
 * Returns [] when nothing else matches. */
function yagnaSimilarTo(row) {
  if (!row) return [];
  const mob = yagnaDigits(row.mobile);
  const nameKey = yagnaNorm(row.firstName) + '|' + yagnaNorm(row.lastName) + '|' + yagnaNorm(row.city);
  return YAGNA.list.filter(other => {
    if (other.code === row.code) return false;
    if (mob && yagnaDigits(other.mobile) === mob) return true;
    const otherKey = yagnaNorm(other.firstName) + '|' + yagnaNorm(other.lastName) + '|' + yagnaNorm(other.city);
    return nameKey === otherKey && yagnaNorm(row.firstName);
  });
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
