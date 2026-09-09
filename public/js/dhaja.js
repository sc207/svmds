/* ============================================================
   DHAJA POOJA MODULE — data layer
   A sevarthi sponsors a dhaja; the server records a cash donation
   ("Dhaja Pooja Seva", DCT-011) with an 80G receipt and links it here.
     - February 108 campaign: one campaign, target 108, running count.
     - Special days: one campaign opened from an Annual Temple Event.
   Renders into #dhajaRoot (dhaja-ui.js). Forms in dhaja-forms.js.
   ============================================================ */

if (typeof window !== 'undefined' && typeof window.t !== 'function') {
  window.t = function (k, f) { return f != null ? f : k; };
  window.tData = function (v) { return v == null ? '' : v; };
  window.onLanguageChange = function () {};
}

const DHAJA = {
  campaigns: [],       // { id(code), uuid, code, name, nameGu, targetCount, startDate, endDate,
                       //   annualEventId, annualEventCode, status, notes,
                       //   sponsoredCount, raisedAmount, remaining }
  sponsorships: [],    // { id(code), code, campaignId(code), seqNo, devoteeId(DEV-###),
                       //   sponsorName, sponsorMobile, scheduledDate, performedDate,
                       //   pledgeAmount, donationId(DON-###), receiptNo, status, notes }
  view: 'board',       // 'board' | 'register'
  activeCampaignId: null,
  filterStatus: 'all',
  search: '',
  today: '2026-09-06',
};

function dhajaToday() { return (typeof MG !== 'undefined' && MG.today) ? MG.today : DHAJA.today; }
function dhajaToast(m) { if (typeof showToast === 'function') showToast(m); }
function dhajaIsAdmin() {
  return !((typeof currentAllowedPages === 'function') && currentAllowedPages() !== null);
}

const dhajaCampaignById = id => DHAJA.campaigns.find(c => c && (c.id === id || c.code === id));
const dhajaSponsorshipByCode = code => DHAJA.sponsorships.find(s => s && s.code === code);

/** live (non-cancelled) sponsorships of a campaign */
function dhajaSponsorshipsOf(campaignId) {
  return DHAJA.sponsorships.filter(s => s.campaignId === campaignId && s.status !== 'cancelled');
}

/** { n, target, remaining, pct, raised } — prefers the server-computed figures */
function dhajaProgress(c) {
  if (!c) return { n: 0, target: 0, remaining: null, pct: null, raised: 0 };
  const local = dhajaSponsorshipsOf(c.id);
  const n = c.sponsoredCount != null ? c.sponsoredCount : local.length;
  const target = c.targetCount || 0;
  const raised = c.raisedAmount != null && c.raisedAmount > 0
    ? c.raisedAmount
    : local.reduce((a, s) => a + (Number(s.pledgeAmount) || 0), 0);
  return {
    n, target, raised,
    remaining: target > 0 ? Math.max(0, target - n) : null,
    pct: target > 0 ? Math.min(100, Math.round((n / target) * 100)) : null,
  };
}

function dhajaMoney(n) {
  n = Number(n) || 0;
  if (typeof locNum === 'function') return '₹ ' + locNum(n);
  try { return '₹ ' + n.toLocaleString('en-IN'); } catch (e) { return '₹ ' + n; }
}
function dhajaDate(iso) {
  if (!iso) return '—';
  if (typeof locDate === 'function') { try { return locDate(iso); } catch (e) {} }
  return iso;
}

const DHAJA_STATUS_BADGE = {
  reserved: 'badge-pending', sponsored: 'badge-confirmed',
  performed: 'badge-maroon', cancelled: 'badge-cancelled',
};
function dhajaStatusLabel(st) {
  return window.t('dhaja_status_' + st, st.charAt(0).toUpperCase() + st.slice(1));
}
