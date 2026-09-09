/* Opening announcement — one full-screen temple notification per user per day
   for upcoming activities relevant to their role & relationships.

   Source of truth: GET /api/reminders (server derives it live from the
   canonical pooja / meeting / session / event / annual-event / visit rows —
   NOT a separate notice store). This file only presents it and records
   "seen today" via POST /api/reminders/seen. localStorage is a same-device
   fast-path only; the server's per-user seenToday flag is authoritative
   across browsers / devices. */
(function () {
  if (typeof window === 'undefined') return;
  if (!(window.API && window.API.online)) return;      // demo / logged-out → nothing

  var LS_KEY = 'svmmm_annc_shown_on';
  var overlay, listEl, shownKeys = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function T(k, f) { return (typeof window.t === 'function') ? window.t(k, f) : (f != null ? f : k); }

  var ICON = { pooja: '🪔', meeting: '👥', session: '🤝', event: '🎪', annual: '📿', visit: '🙏', dhaja: '🚩' };

  function countdown(d) {
    if (d <= 0) return T('annc_today', 'Today');
    if (d === 1) return T('annc_tomorrow', 'Tomorrow');
    return T('annc_in_days', 'In {n} days').replace('{n}', d);
  }
  function fmtDate(iso) {
    if (typeof window.locDate === 'function') { try { return window.locDate(iso); } catch (e) {} }
    return iso;
  }
  function fmtTime(t) {
    if (!t) return '';
    if (typeof window.locTime === 'function') { try { return window.locTime(t); } catch (e) {} }
    return t;
  }

  function card(it) {
    var when = '<span class="annc-chip" style="--c:' + esc(it.color) + '">' + esc(countdown(it.daysUntil)) + '</span>';
    var line2 = [fmtDate(it.date), fmtTime(it.time), it.venue].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
    return '' +
      '<div class="annc-item" style="--c:' + esc(it.color) + '">' +
        '<div class="annc-ico" aria-hidden="true">' + (ICON[it.kind] || '🔔') + '</div>' +
        '<div class="annc-body">' +
          '<div class="annc-item-top">' + when + '<span class="annc-reason">' + esc(it.reasonRole || '') + '</span></div>' +
          '<div class="annc-name">' + esc(it.title) + '</div>' +
          '<div class="annc-sub">' + esc(it.subtitle) + '</div>' +
          (line2 ? '<div class="annc-meta">' + line2 + '</div>' : '') +
          (it.deepLink ? '<button type="button" class="annc-view" data-page="' + esc(it.deepLink) + '">' + esc(T('annc_view', 'View details')) + ' →</button>' : '') +
        '</div>' +
      '</div>';
  }

  function dismiss() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('annc-open');
    if (shownKeys.length) {
      window.API.post('/reminders/seen', { keys: shownKeys }).catch(function () {});
    }
  }

  // put the dim veil up immediately (empty) so the dashboard never flashes while
  // /api/reminders is still in flight; fill or drop it when the answer arrives.
  function preveil() {
    overlay = document.getElementById('openingAnnounce');
    listEl = document.getElementById('anncList');
    if (!overlay || !listEl) return false;
    listEl.innerHTML = '<div class="annc-loading" aria-hidden="true"></div>';
    document.body.classList.add('annc-open');
    overlay.hidden = false;
    return true;
  }
  function dropveil() {
    if (overlay && !shownKeys.length) { overlay.hidden = true; document.body.classList.remove('annc-open'); }
  }

  function open(data) {
    overlay = document.getElementById('openingAnnounce');
    listEl = document.getElementById('anncList');
    if (!overlay || !listEl) return;

    var items = (data.items || []).filter(function (it) { return !it.seenToday; });
    if (!items.length) { dropveil(); return; }
    shownKeys = items.map(function (it) { return it.key; });

    var kicker = document.getElementById('anncKicker');
    if (kicker) kicker.textContent = T('annc_kicker', "Today's Temple Updates") +
      '  ·  ' + items.length + ' ' + (items.length === 1 ? T('annc_update', 'update') : T('annc_updates', 'updates'));

    listEl.innerHTML = items.map(card).join('');
    listEl.querySelectorAll('.annc-view').forEach(function (b) {
      b.addEventListener('click', function () {
        var page = b.getAttribute('data-page') || '';
        dismiss();
        if (page && typeof window.switchPage === 'function') {
          try { window.switchPage(page); } catch (e) {}
        }
      });
    });

    var cont = document.getElementById('anncContinue');
    var x = document.getElementById('anncClose');
    if (cont) { cont.textContent = T('annc_continue', 'Continue to Dashboard'); cont.onclick = dismiss; }
    if (x) x.onclick = dismiss;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', function esckey(e) {
      if (e.key === 'Escape' && !overlay.hidden) { dismiss(); document.removeEventListener('keydown', esckey); }
    });

    document.body.classList.add('annc-open');
    overlay.hidden = false;
    try { localStorage.setItem(LS_KEY, data.today); } catch (e) {}
  }

  // fire the request straight away — while the splash is still up, so the
  // splash → announcement transition is seamless and the dashboard never flashes.
  var pending = window.API.get('/reminders').catch(function () { return null; });

  function run() {
    var veiled = false;
    // don't pre-veil if this device already did the announcement today
    var already = false;
    try { already = localStorage.getItem(LS_KEY) === (window.MG && window.MG.today); } catch (e) {}
    if (!already) veiled = preveil();

    pending.then(function (data) {
      if (!data || !data.showOpening) { if (veiled) dropveil(); return; }
      var seenHere = false;
      try { seenHere = localStorage.getItem(LS_KEY) === data.today; } catch (e) {}
      if (seenHere) { if (veiled) dropveil(); return; }   // same device already did it today
      if (!veiled && !preveil()) return;
      open(data);
    }, function () { if (veiled) dropveil(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
