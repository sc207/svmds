/* Boot-time hydration: when the backend is reachable (API.online), replace the
   in-memory seed data with real rows from the REST API and re-render.
   Runs on window.load, AFTER every module's own DOMContentLoaded render, so a
   failure here can never stop the app painting. Each store is hydrated in its
   own try/catch — one failing endpoint never blocks the others.

   Wired so far: settings (working-date clock, default language, temple
   identity), devotees, inventory, expenses, plus a dashboard/calendar refresh.
   The richer module stores (DON / POOJA / CMT / MG / EV / VISITS) still render
   from their seeds; wiring their reads + persistX() writes is the remaining
   frontend integration step (BACKEND_PLAN.md §10.1-10.2) and needs live
   browser verification. */
(function () {
  if (typeof window === 'undefined') return;

  function log(msg) { try { console.info('[hydrate] ' + msg); } catch (e) {} }

  async function hydrateSettings() {
    var s = await window.API.get('/settings');
    if (!s) return;
    // working-date clock — only when the admin hasn't set a local override
    var overridden = false;
    try { overridden = !!localStorage.getItem('svmmm_clock'); } catch (e) {}
    if (!overridden && s.workingDate) {
      if (typeof MG !== 'undefined') {
        MG.today = s.workingDate;
        if (/^\d{2}:\d{2}$/.test(s.workingTime || '')) MG.nowTime = s.workingTime;
      }
    }
    // temple identity — seed localStorage if the form was never filled
    try {
      var cur = JSON.parse(localStorage.getItem('svmmm_temple') || '{}');
      if ((!cur || !cur.name) && s.templeIdentity && s.templeIdentity.name) {
        localStorage.setItem('svmmm_temple', JSON.stringify(s.templeIdentity));
      }
    } catch (e) {}
    // default language — only if the visitor has no explicit choice
    try {
      var langChosen = !!localStorage.getItem('svmmm_lang');
      if (!langChosen && s.defaultLanguage && typeof window.setLanguage === 'function') {
        window.setLanguage(s.defaultLanguage, { announce: false });
      }
    } catch (e) {}
    log('settings applied (clock ' + (overridden ? 'kept local override' : s.workingDate) + ')');
  }

  function swap(arr, rows) {
    if (!Array.isArray(arr)) return;
    arr.length = 0;
    for (var i = 0; i < rows.length; i++) arr.push(rows[i]);
  }

  async function hydrateCore() {
    if (typeof state === 'undefined') return;

    try {
      var devotees = await window.API.get('/devotees');
      swap(state.devotees, devotees.map(function (d) {
        var mob = d.mobile || d.phone || '';
        return { id: d.code || d.id, name: d.name, phone: mob, mobile: mob,
                 city: d.city, samaj: d.samaj, status: d.status,
                 visits: d.visits || 0 };
      }));
      if (typeof renderDevotees === 'function') renderDevotees();
      log('devotees: ' + state.devotees.length);
    } catch (e) { log('devotees failed: ' + e.message); }

    try {
      var inv = await window.API.get('/inventory');
      swap(state.inventory, inv.map(function (x) {
        return { id: x.code || x.id, item: x.item, category: x.category,
                 stock: x.stock, minStock: x.minStock, status: x.status };
      }));
      if (typeof renderInventoryTable === 'function') renderInventoryTable();
      log('inventory: ' + state.inventory.length);
    } catch (e) { log('inventory failed: ' + e.message); }

    try {
      var exp = await window.API.get('/expenses');
      swap(state.expenses, exp.map(function (x) {
        return { id: x.code || x.id, title: x.title, category: x.category,
                 amount: x.amount, date: x.date, status: x.status };
      }));
      if (typeof renderExpensesTable === 'function') renderExpensesTable();
      log('expenses: ' + state.expenses.length);
    } catch (e) { log('expenses failed: ' + e.message); }
  }

  async function refreshViews() {
    try { if (typeof renderDashboard === 'function') renderDashboard(); } catch (e) {}
    try { if (typeof renderUnifiedCalendar === 'function') renderUnifiedCalendar(); } catch (e) {}
  }

  async function run() {
    if (!window.API || !window.API.online) { log('offline — keeping seed data'); return; }
    log('backend online — hydrating');
    try { await hydrateSettings(); } catch (e) { log('settings failed: ' + e.message); }
    await hydrateCore();
    await refreshViews();
    log('done');
  }

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
