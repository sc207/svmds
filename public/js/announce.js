/* Opening announcement — the mandir's annual temple events, put in front of
   everyone who opens the app from 3 days before an event through the day
   itself. Once a day per person: dismissing records the events as seen
   (POST /api/reminders/seen), so the same person is not shown them again
   that day on this or any other device.

   Source of truth is GET /api/reminders, derived live from annual_events
   on the server — this file only presents it. It opens after the splash has
   gone and the first page has drawn, never over them, and a slow or failed
   request simply means no announcement: it never blocks the app.
   app.js calls Announce.run() once the signed-in account is known. */
(function (global) {
  'use strict';

  let overlay = null;
  let shownKeys = [];
  let opened = false;

  const tr = (s) => (global.Lang ? Lang.t(s) : s);
  const gu = () => global.Lang && Lang.lang() === 'gu';

  function countdown(d) {
    if (d <= 0) return gu() ? 'આજે' : 'Today';
    if (d === 1) return gu() ? 'આવતીકાલે' : 'Tomorrow';
    return gu() ? `${d} દિવસ પછી` : `In ${d} days`;
  }

  function card(it) {
    const { esc, attr, fmtDateLong, icon } = UI;
    const name = (gu() && it.name_gu) || it.name;
    const other = gu() ? it.name : it.name_gu;
    const activity = (gu() && it.activity_gu) || it.activity;
    return `
      <div class="annc-item" style="--c:#D9771F">
        <div class="annc-ico" aria-hidden="true">${icon('diya')}</div>
        <div class="annc-body">
          <div class="annc-item-top">
            <span class="annc-chip" style="--c:#D9771F">${esc(countdown(it.daysUntil))}</span>
            <span class="annc-reason">${esc(tr('Temple Event'))}</span>
          </div>
          <div class="annc-name">${esc(name)}</div>
          ${activity ? `<div class="annc-sub">${esc(activity)}</div>` : ''}
          <div class="annc-meta">${esc(fmtDateLong(it.date))}${other ? ' &nbsp;·&nbsp; ' + esc(other) : ''}</div>
          <button type="button" class="annc-view" data-cal="${attr(it.date.slice(0, 7))}">${esc(tr('View in calendar'))} →</button>
        </div>
      </div>`;
  }

  function dismiss() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('annc-open');
    const keys = shownKeys;
    shownKeys = [];
    if (keys.length) API.post('/reminders/seen', { keys }).catch(() => {});
  }

  function open(items) {
    if (opened) return;
    overlay = document.getElementById('openingAnnounce');
    const list = document.getElementById('anncList');
    if (!overlay || !list) return;
    opened = true;
    shownKeys = items.map((it) => it.key);

    const kicker = document.getElementById('anncKicker');
    if (kicker) kicker.textContent = tr('Coming up at the mandir');
    list.innerHTML = items.map(card).join('');
    list.querySelectorAll('[data-cal]').forEach((b) => b.addEventListener('click', () => {
      dismiss();
      navigate('calendar');
    }));
    document.getElementById('anncContinue').onclick = dismiss;
    document.getElementById('anncClose').onclick = dismiss;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dismiss(); });

    document.body.classList.add('annc-open');
    overlay.hidden = false;
    document.getElementById('anncContinue').focus();
  }

  /* The announcement is the second screen, never layered over the splash:
     wait until #appLoader has removed itself (it always does — it has its
     own guard), then a beat for the first page to paint. */
  function afterSplash(cb) {
    const start = Date.now();
    (function tick() {
      if (!document.getElementById('appLoader') || Date.now() - start > 15000) setTimeout(cb, 300);
      else setTimeout(tick, 120);
    })();
  }

  function run() {
    const me = API.currentUser();
    if (!me || me.rank === 'none') return;
    /* Ask early so the answer is usually ready when the splash lifts. */
    const pending = Promise.race([
      API.get('/reminders').catch(() => null),
      new Promise((r) => setTimeout(() => r(null), 10000)),
    ]);
    afterSplash(() => pending.then((data) => {
      if (!data || !data.showOpening) return;
      const unseen = (data.items || []).filter((it) => !it.seenToday);
      if (unseen.length) open(unseen);
    }).catch(() => { /* never block the app */ }));
  }

  global.Announce = { run };
})(window);
