/* Universal Calendar — sk's own grid + legend + agenda + "Up Next" table,
   fed from this app's poojas / visits / donations / payments, and the
   mandir's annual temple events (tithi dates resolved per year on the
   server — util/annual.js). */
(function (global) {
  'use strict';
  const { esc, attr, icon, money, num, fmtDate, fmtDateLong, monthISO, todayISO, MONTHS } = UI;

  const state = { month: monthISO(), filters: { annual: true, pooja: true, visit: true, donation: true, payment: true } };

  const TYPE_META = {
    annual:   { key: 'Temple Event', badge: 'badge-gold',   color: '#D9771F' },
    pooja:    { key: 'Pooja',    badge: 'badge-maroon',    color: '#6B1F2A' },
    visit:    { key: 'Padhramni', badge: 'badge-confirmed', color: '#4C8B5A' },
    donation: { key: 'Donation', badge: 'badge-pending',   color: '#C9A24A' },
    payment:  { key: 'Payment',  badge: 'badge-maroon',    color: '#8A2B39' },
  };

  async function render(host) {
    host.innerHTML = `<div id="calBody">${UI.loading(3)}</div>`;
    await load(host);
  }

  async function load(host) {
    const body = document.getElementById('calBody');
    try {
      const { entries: raw } = await API.calendar(state.month);
      /* Annual events carry their Gujarati names too; show them in ગુ. */
      const gu = global.Lang && Lang.lang() === 'gu';
      const entries = raw.filter((e) => state.filters[e.type] !== false)
        .map((e) => ({ ...e,
          title: (gu && e.title_gu) || e.title,
          sub: (gu && e.sub_gu) || e.sub,
          color: (TYPE_META[e.type] || {}).color || '#6B1F2A' }));

      const [y, mo0] = state.month.split('-').map(Number);
      const mo = mo0 - 1;
      const monthKey = state.month;
      const daysIn = new Date(y, mo + 1, 0).getDate();
      const startDow = (new Date(y, mo, 1).getDay() + 6) % 7;   // Monday-first
      const today = todayISO();
      const todayDow = today.slice(0, 7) === monthKey ? (new Date(today).getDay() + 6) % 7 : -1;

      const MAX_CHIPS = 3;
      let cells = '';
      for (let i = 0; i < startDow; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;
      for (let d = 1; d <= daysIn; d++) {
        const iso = `${monthKey}-${String(d).padStart(2, '0')}`;
        const dayE = entries.map((e, i) => ({ e, i })).filter((x) => x.e.date === iso);
        const shown = dayE.slice(0, MAX_CHIPS);
        const overflow = dayE.length - shown.length;
        /* The whole day jumps to that day in the agenda underneath.
           On a phone the chips are dots — far too small to aim at —
           so the cell has to be the target; on a desktop it is a
           useful extra on the blank part of a day. */
        cells += `<div class="mg-cal-cell ${iso === today ? 'mg-cal-today' : ''}${
            dayE.length ? ' has-entries' : ''}"${dayE.length ? ` data-jump="${attr(iso)}"` : ''}>
          <div class="mg-cal-date">${d}${iso === today ? `<span class="mg-cal-todaytag">Today</span>` : ''}</div>
          ${shown.map((x) => `<div class="mg-cal-event cal-ev-${attr(x.e.type)}" style="--c:${attr(x.e.color)}"
              data-goto="${attr(x.i)}" title="${attr(x.e.title || '')}">
            <div class="mg-ev-title">${esc(x.e.title)}</div>
            <div class="mg-ev-meta">${esc(x.e.sub || '')}</div>
          </div>`).join('')}
          ${overflow > 0 ? `<div class="cal-more-chip" data-jump="${attr(iso)}">+${num(overflow)}<span class="cmc-word"> more</span></div>` : ''}
        </div>`;
      }
      const trail = (7 - ((startDow + daysIn) % 7)) % 7;
      for (let i = 0; i < trail; i++) cells += `<div class="mg-cal-cell mg-cal-empty"></div>`;

      const legend = Object.keys(TYPE_META).map((type) => {
        const m = TYPE_META[type];
        /* The dot is coloured from TYPE_META, not from a .cal-ev-<type>
           class: styles.css only defines those for the original
           portal's event types, so 'payment' came out with no dot at
           all. Driving it from the same data the chips use keeps the
           legend and the calendar in agreement whatever types exist. */
        return `<button class="cal-legend-btn ${state.filters[type] ? 'on' : 'off'}" data-filter="${attr(type)}">
          <span class="cal-legend-dot" style="background:${attr(m.color)}"></span>${esc(m.key)}</button>`;
      }).join('');

      const upNext = entries.filter((e) => e.date >= today).slice(0, 6);

      const monthSorted = entries.map((e, i) => ({ e, i }))
        .sort((a, b) => (a.e.date + (a.e.time || '')).localeCompare(b.e.date + (b.e.time || '')));
      let agenda = '', lastDay = '';
      monthSorted.forEach(({ e, i }) => {
        if (e.date !== lastDay) {
          lastDay = e.date;
          const isT = e.date === today;
          agenda += `<li id="cal-day-${attr(e.date)}" class="cal-agenda-day${isT ? ' is-today' : ''}">
            ${esc(fmtDate(e.date))}${isT ? ' <span class="mg-cal-todaytag">Today</span>' : ''}</li>`;
        }
        const m = TYPE_META[e.type] || { badge: 'badge-maroon', key: e.type };
        agenda += `<li class="cal-agenda-item cal-ev-${attr(e.type)}" style="--c:${attr(e.color)}" data-goto="${attr(i)}">
          <span class="cal-agenda-dot"></span>
          <span class="cal-agenda-tx">
            <strong>${esc(e.title)}</strong>
            <span>${esc(e.sub || '')}</span>
            <span class="badge ${m.badge} cal-agenda-badge">${esc(m.key)}</span>
          </span>
        </li>`;
      });

      body.innerHTML = `
      <div class="flex justify-between items-center mg-page-head">
        <div>
          <h1 class="banner-title mg-page-title">Universal Calendar</h1>
          <p class="mg-page-sub">Temple events, poojas, padhramni, donations and payments — all in one place</p>
        </div>
        <div class="flex gap-2 items-center">
          <button class="icon-btn" data-nav="-1" aria-label="Previous month">${icon('chevron-left','ico-sm')}</button>
          <strong class="mg-cal-label">${esc(MONTHS[mo])} ${esc(y)}</strong>
          <button class="icon-btn" data-nav="1" aria-label="Next month">${icon('chevron-right','ico-sm')}</button>
        </div>
      </div>

      <div class="cal-legend">${legend}</div>

      <div class="card mg-mt cal-grid-view">
        <div class="card-body">
          <div class="mg-cal-head">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            .map((d, i) => `<div class="${i === todayDow ? 'mg-cal-dow-today' : ''}">${d}</div>`).join('')}</div>
          <div class="mg-cal-grid">${cells}</div>
        </div>
      </div>

      <div class="card mg-mt cal-agenda-view">
        <div class="card-header"><div class="card-title">This month <span class="mg-muted-xs">(${monthSorted.length})</span></div></div>
        <div class="card-body" style="padding:0">
          ${monthSorted.length ? `<ul class="cal-agenda">${agenda}</ul>`
            : `<div class="mg-pad-note">Nothing scheduled this month.</div>`}
        </div>
      </div>

      <div class="card mg-mt cal-upnext-view">
        <div class="card-header"><div class="card-title">Up Next</div></div>
        <div class="card-body" style="padding:0">
          ${upNext.length ? `<div class="mg-table-scroll"><table class="custom-table">
            <thead><tr><th>Date</th><th>Item</th><th>Type</th><th></th></tr></thead>
            <tbody>${upNext.map((e) => {
              const idx = entries.indexOf(e);
              const m = TYPE_META[e.type] || { badge: 'badge-maroon', key: e.type };
              return `<tr>
                <td>${esc(fmtDate(e.date))}</td>
                <td><strong>${esc(e.title)}</strong><div class="mg-muted-xs">${esc(e.sub || '')}</div></td>
                <td><span class="badge ${m.badge}">${esc(m.key)}</span></td>
                <td style="text-align:right"><button class="btn btn-outline mg-btn-xs" data-goto="${attr(idx)}">Open</button></td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>` : `<div class="mg-pad-note">Nothing coming up.</div>`}
        </div>
      </div>`;

      body.querySelectorAll('[data-nav]').forEach((b) =>
        b.addEventListener('click', () => {
          const d = new Date(y, mo + Number(b.getAttribute('data-nav')), 1);
          state.month = d.toLocaleDateString('en-CA').slice(0, 7);
          load(host);
        }));
      body.querySelectorAll('[data-filter]').forEach((b) =>
        b.addEventListener('click', () => {
          const t = b.getAttribute('data-filter');
          state.filters[t] = !state.filters[t];
          load(host);
        }));
      body.querySelectorAll('[data-jump]').forEach((b) =>
        b.addEventListener('click', () => {
          const el = document.getElementById('cal-day-' + b.getAttribute('data-jump'));
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
      body.querySelectorAll('[data-goto]').forEach((b) =>
        b.addEventListener('click', (e) => {
          /* The cell around it now jumps to the agenda, and opening an
             entry and scrolling the page under it at the same time is
             two answers to one tap. */
          e.stopPropagation();
          goto(entries[Number(b.getAttribute('data-goto'))]);
        }));
    } catch (e) {
      body.innerHTML = UI.errorState(e.message);
    }
  }

  function goto(entry) {
    if (!entry) return;
    if (entry.type === 'annual') annualSheet(entry);
    else if (entry.type === 'pooja') navigate('mahotsav', 'pooja', entry.ref_id);
    else if (entry.type === 'visit') navigate('visits');
    else if (entry.type === 'donation') navigate('donations');
    else if (entry.type === 'payment') navigate('payments');
  }

  /* An annual temple event: what it is, when it falls this year and why
     (calculated from the tithi, a fixed date, or pinned by an admin), and —
     for an administrator — the date to use this year when the temple's
     panchang says otherwise. The calculation takes the tithi at ~06:00 IST;
     observances decided by another rule, or an adhik-maas year, can differ. */
  const MASA_GU = { Chaitra: 'ચૈત્ર', Vaishakha: 'વૈશાખ', Jyeshtha: 'જેઠ', Ashadha: 'અષાઢ', Shravana: 'શ્રાવણ',
    Bhadrapada: 'ભાદરવો', Ashwin: 'આસો', Kartik: 'કારતક', Margashirsha: 'માગશર', Pausha: 'પોષ', Magha: 'મહા', Phalguna: 'ફાગણ' };
  async function annualSheet(entry) {
    let ev;
    try {
      ev = (await API.get('/annual-events', { year: entry.year })).find((x) => x.id === entry.ref_id);
    } catch (e) { UI.toast(e.message, 'err'); return; }
    if (!ev) return;
    const gu = global.Lang && Lang.lang() === 'gu';
    const when = ev.type === 'FIXED_DATE'
      ? `Every year on ${ev.fixed_day} ${MONTHS[ev.fixed_month - 1]}`
      : `${gu ? (MASA_GU[ev.masa] || ev.masa) : ev.masa} ${ev.paksha === 'shukla' ? (gu ? 'સુદ' : 'Sud') : (gu ? 'વદ' : 'Vad')} ${ev.tithi}`;
    const source = { pinned: 'Set by the temple for ' + ev.year, fixed: 'Fixed date',
      calculated: 'Calculated from the tithi' }[ev.source] || ev.source;
    const admin = UI.can('admin');
    UI.openSheet({
      title: (gu && ev.name_gu) || ev.name,
      body: `${UI.contextCard({
          title: (gu && ev.activity_gu) || ev.activity || ev.name,
          sub: gu ? ev.name : ev.name_gu,
          rows: [['Date in ' + ev.year, fmtDateLong(ev.date)], ['Tithi', when], ['Date from', source]],
        })}
        ${admin && ev.type === 'TITHI' ? `
        <form id="annualForm" novalidate style="margin-top:1rem">
          <div class="form-group"><label class="form-label" for="f_adate">Date to use in ${esc(ev.year)}</label>
            <input class="form-input" id="f_adate" name="date" type="date" value="${attr(ev.date)}"
                   min="${attr(ev.year + '-01-01')}" max="${attr(ev.year + '-12-31')}">
            <div class="form-hint">The date is calculated from the tithi. If the temple's panchang gives a different
              day this year, set it here — it is used on the calendar and in the announcements.</div></div>
        </form>` : ''}`,
      footer: `<button class="btn btn-outline" data-sheet-close>Close</button>
        ${admin && ev.source === 'pinned' ? '<button class="btn btn-outline" id="annualReset">Use calculated date</button>' : ''}
        ${admin && ev.type === 'TITHI' ? '<button class="btn btn-primary" id="annualSave">Save date</button>' : ''}`,
      onMount(sheet) {
        const save = sheet.querySelector('#annualSave');
        const reset = sheet.querySelector('#annualReset');
        const put = async (btn, date) => {
          btn.disabled = true;
          try {
            await API.put(`/annual-events/${ev.id}/date`, { year: ev.year, date });
            UI.closeSheet(); UI.toast('Date saved', 'ok'); refreshPage();
          } catch (err) { btn.disabled = false; UI.toast(err.message, 'err'); }
        };
        if (save) save.addEventListener('click', () => {
          const v = sheet.querySelector('#f_adate').value;
          if (!v) return UI.toast('Pick a date', 'err');
          put(save, v);
        });
        if (reset) reset.addEventListener('click', () => put(reset, null));
      },
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.calendar = { render };
})(window);
