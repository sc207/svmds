/* ============================================================
   EXPORT — the list you are looking at, as a file
   ------------------------------------------------------------
   Two outputs, one definition. A page declares its columns once
   (`{ key, label, value(row), type }`) and both the spreadsheet and the
   printed sheet are built from that list, so they can never disagree
   about what a report contains.

   Three rules, learned from doing this badly elsewhere:

   1. **Export what the filter says, not what the screen shows.** The
      lists page at 25 rows; an export that stopped at the page boundary
      would quietly hand the trust a quarter of the answer. Pages keep
      their fetched rows in module state, so the export takes all of
      them — filtered and sorted as the operator left them.
   2. **Say what it was filtered by.** A printed sheet that says
      "15 sevarthi" without saying "still to collect" is a sheet nobody
      can check a month later. Every export stamps its filters, its
      totals and when it was taken.
   3. **Amounts are numbers, not text.** ₹21,00,000 in a CSV cell is a
      string Excel cannot sum. The formatted form belongs on the printed
      sheet; the spreadsheet gets 2100000.
   ============================================================ */
(function (global) {
  'use strict';
  const { esc, attr, money, num, fmtDate, icon } = UI;

  /* ---------- CSV ----------
     Excel opens a .csv natively, which is why this is the "Excel"
     export: it needs no library, and nothing is fetched at runtime —
     the app has to work at the mandir with no connection. */

  /** A leading = + - @ makes Excel treat the cell as a formula, so a
      devotee's note could execute when the file is opened. Prefix it
      with an apostrophe, which Excel strips on display. */
  function deFang(s) {
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }

  function csvCell(v, type) {
    if (v === null || v === undefined) return '';
    if (type === 'money' || type === 'num') {
      const n = Number(v);
      return Number.isFinite(n) ? String(n) : '';   // bare, so SUM() works
    }
    const s = deFang(String(v));
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(columns, rows, meta) {
    const lines = [];
    /* Meta rides above the header as its own rows. Excel shows them as
       ordinary cells and they survive a re-save, unlike a comment. */
    (meta || []).forEach(([k, v]) => lines.push(csvCell(k) + ',' + csvCell(v)));
    if (meta && meta.length) lines.push('');
    lines.push(columns.map((c) => csvCell(c.label)).join(','));
    rows.forEach((r) => {
      lines.push(columns.map((c) => csvCell(c.value(r), c.type)).join(','));
    });
    return lines.join('\r\n');
  }

  /** Save a string as a file. The BOM matters: without it Excel reads
      the bytes as the system codepage and every Gujarati name becomes
      mojibake. */
  function download(name, text, mime) {
    const blob = new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const stamp = () => new Date().toLocaleDateString('en-CA');
  const safeName = (s) => String(s).replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '-');

  function csv(opt) {
    const rows = opt.rows || [];
    if (!rows.length) { UI.toast('Nothing to export in this view.', 'err'); return; }
    download(`${safeName(opt.filename || 'export')}-${stamp()}.csv`,
      toCsv(opt.columns, rows, opt.meta), 'text/csv');
    UI.toast(`${num(rows.length)} row${rows.length === 1 ? '' : 's'} exported`, 'ok');
  }

  /* ---------- printed sheet / PDF ----------
     openPrintDoc links the real stylesheets, so the print dialog's
     "Save as PDF" produces something that matches the app rather than a
     bare table. No PDF library is involved, and none can be: the
     browser's own print engine is the only one available offline. */

  function cell(c, r) {
    const v = c.value(r);
    if (c.type === 'money') return esc(money(Number(v) || 0));
    if (c.type === 'num') return esc(num(Number(v) || 0));
    /* The spreadsheet keeps 2027-02-04 (it sorts); the printed sheet says
       "4 Feb 2027", the way every screen does. Anything that is not an
       ISO date ("Date to be announced") prints as it is. */
    if (c.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return esc(fmtDate(String(v)));
    return esc(v == null ? '' : String(v));
  }

  /* A4 landscape at these margins is about 277mm of printable width. A
     table with 15–17 columns wants half as much again, and a normal
     (auto) table layout cannot shrink below its min-content width — so
     it simply ran off the right edge and the last columns were cut off
     the page with nothing to say they existed.

     Three things together fix it, and all three are needed:
       1. `table-layout: fixed` — the width is decided by the colgroup,
          not the content, so the table can never exceed the page.
       2. cells wrap. Under a fixed layout a `nowrap` cell still spills
          out of its own column, so wide tables drop nowrap and break
          long values instead.
       3. the type scales down with the column count, so wrapping does
          not turn every row into four lines. */
  const PRINT_CSS = `
  @page { size: A4 landscape; margin: 12mm 10mm; }
  .ex-doc { padding: 0; }
  .ex-head { border-bottom: 2px solid var(--primary-maroon); padding-bottom: .6rem; margin-bottom: .9rem; }
  .ex-title { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800;
              color: var(--primary-maroon); margin: 0; }
  .ex-sub { font-size: .85rem; color: var(--muted-brown); margin: .2rem 0 0; }
  .ex-meta { display: flex; flex-wrap: wrap; gap: .3rem 1.4rem; margin: .55rem 0 0;
             font-size: .78rem; color: var(--dark-brown); }
  .ex-meta b { color: var(--primary-maroon); }
  table.ex {
    width: 100%; table-layout: fixed; border-collapse: collapse;
    font-size: var(--ex-fs, .76rem);
  }
  table.ex th {
    text-align: left; padding: .4rem var(--ex-pad, .5rem); background: var(--warm-ivory);
    border-bottom: 1.5px solid var(--warm-border); font-weight: 700; color: var(--dark-brown);
  }
  table.ex td {
    padding: .34rem var(--ex-pad, .5rem); border-bottom: 1px solid var(--warm-border);
    vertical-align: top;
  }
  /* Free text may break mid-word to fit its column. Numbers and dates
     may NOT: an amount split as 11,00,0 / 00 across two lines is worse
     than not printing it, so those keep nowrap however tight it gets
     and the colgroup gives them room instead.
     (No backticks in here: this whole block is a template literal, and
     one inside a CSS comment ends the string. That is how this rule
     broke the first time — everything after it parsed as JS.) */
  table.ex td { overflow-wrap: anywhere; }
  table.ex td.n, table.ex th.n { text-align: right; }
  /* nowrap is for the VALUES, never the headings: "Paid by devotee" is
     a phrase and must be allowed onto a second line, or it runs into
     the next column's heading. */
  table.ex td.n { font-variant-numeric: tabular-nums; white-space: nowrap; overflow-wrap: normal; }
  table.ex td.w { white-space: nowrap; overflow-wrap: normal; }
  /* Headings break between words, never inside one ("Contributio / n"):
     the colgroup reserves each column at least its longest heading word. */
  table.ex th { overflow-wrap: normal; word-break: normal; hyphens: none; }
  table.ex tbody tr:nth-child(even) td { background: #FCF8F0; }
  .ex-foot { margin-top: .8rem; font-size: .72rem; color: var(--muted-brown);
             display: flex; justify-content: space-between; gap: 1rem; }
  /* A long report must not lose its column headings on page two. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }`;

  function pdf(opt) {
    const rows = opt.rows || [];
    if (!rows.length) { UI.toast('Nothing to print in this view.', 'err'); return; }

    /* A sheet of paper is not a spreadsheet. The devotee register has
       seventeen columns; on A4 landscape that is about 60px each, which
       is narrower than a name or an amount, and the result fits only by
       becoming unreadable. Columns marked `print: false` stay in the
       CSV and leave the printed copy — and the sheet says so, so nobody
       reads it as the whole record. */
    const cols = opt.columns.filter((c) => c.print !== false);
    const dropped = opt.columns.filter((c) => c.print === false).map((c) => c.label);
    const numeric = (c) => c.type === 'money' || c.type === 'num';
    /* Dates and short labels must not break across lines — "2027-02-" on
       one row and "04" on the next is unreadable on a printed sheet.
       Long free text (address, note, seva name) is left to wrap. */
    /* nowrap is decided per cell, not per column. "2027-02-04" must not
       break; "Date to be announced" lives in the same column and must,
       or it runs straight over the next one. A value with no space is
       an atom; anything else is a phrase. */
    const headCls = (c) => numeric(c) ? 'n' : '';
    const cls = (c, r) => {
      if (numeric(c)) return 'n';
      if (!(c.type === 'date' || c.nowrap)) return '';
      const v = String(c.value(r) == null ? '' : c.value(r));
      return /\s/.test(v) ? '' : 'w';
    };

    /* Under a fixed layout every column would otherwise get an equal
       share — starving a name to give a one-digit count the same width.
       Each column gets a base weight for the kind of thing it holds,
       raised to fit its widest *unbreakable* run: the whole value in a
       nowrap column, the longest word elsewhere. Hand-tuned weights
       were always one dataset away from being a pixel too narrow;
       measuring the content is self-correcting. */
    const WEIGHT = { num: 0.6, money: 0.95, date: 0.85 };
    /* The totals row is part of the column too — "₹1,28,07,334" in a
       column sized for "₹3,66,667" ran into its neighbour. */
    const totalText = (c) => {
      const t = opt.totals && opt.totals[c.key];
      if (t === undefined || t === null) return '';
      return typeof t === 'number' ? (c.type === 'money' ? money(t) : num(t)) : String(t);
    };
    const measure = (c) => {
      const unbreakable = numeric(c) || c.type === 'date' || c.nowrap;
      /* Headings are bold and never break inside a word, so they count
         a little wider than body text. */
      const head = String(c.label || '').split(/\s+/)
        .reduce((a, w) => Math.max(a, Math.ceil(w.length * 1.15)), 0);
      let longest = 0, total = 0, filled = 0, maxLen = 0;
      const values = rows.map((r) => String(cell(c, r)).replace(/<[^>]*>/g, ''));
      const tt = totalText(c);
      if (tt) values.push(tt);
      for (const v of values) {
        /* Digits are the widest glyphs at print size: a mobile number
           counts ~15% wider than its length, or it kisses the next column. */
        const wide = /^[+\d][\d\s,.₹-]*$/.test(v.trim()) ? 1.15 : 1;
        const n = Math.ceil(wide * (unbreakable ? v.length
          : v.split(/\s+/).reduce((a, w) => Math.max(a, w.length), 0)));
        if (n > longest) longest = n;
        if (v.trim()) { total += v.length; filled++; if (v.length > maxLen) maxLen = v.length; }
      }
      return { head, longest, maxLen, avg: filled ? total / filled : 0, empty: !filled };
    };
    const weightOf = (c) => {
      const m = measure(c);
      /* ~8 characters per unit of weight (digits and bold headings are
         wide at print size), plus the cell's own padding. */
      const wraps = !(numeric(c) || c.type === 'date' || c.nowrap);
      /* A text cell may break inside a word (overflow-wrap: anywhere), so
         one freak 28-letter word must not size the whole column and
         squeeze every neighbour onto two lines — cap what it can claim. */
      const fit = Math.max(m.head / 8, wraps ? Math.min(m.longest / 8, 2.2) : m.longest / 8) + 0.2;
      /* A column with nothing in it on this sheet takes only its heading's
         width — Time / Samaj / Escort left blank were each holding a full
         share while the address beside them wrapped into seven lines. */
      if (m.empty) return Math.max(0.55, m.head / 8 + 0.2);
      const base = c.weight || WEIGHT[c.type] || (c.nowrap ? 1 : 1.35);
      /* Free text that wraps also earns width for how much of it there
         is, so a long address is a few lines, not a column of words. */
      /* Short phrases (a samaj, a category, a city) read best on one line —
         "Marvadi / Samaj" on two doubled every row's height and the page
         count with it — so they get room for the whole phrase. */
      const bulk = !wraps ? 0
        : m.avg <= 16 ? Math.min(m.maxLen, 18) / 8.5 + 0.2
        : Math.min(m.avg / 14, 3.2);
      return Math.max(base, fit, bulk);
    };
    const totalWeight = cols.reduce((a, c) => a + weightOf(c), 0);
    const colgroup = `<colgroup>${cols.map((c) =>
      `<col style="width:${(weightOf(c) / totalWeight * 100).toFixed(3)}%">`).join('')}</colgroup>`;

    /* Shrink the type as the table gets busier, so wrapping does not
       turn every row into a paragraph. 9 columns keeps the comfortable
       size; 17 lands near .6rem, which is still readable in print. */
    const n = cols.length;
    const tight = n > 10;
    const fs = n <= 9 ? 0.76 : Math.max(0.6, 0.76 - (n - 9) * 0.02);
    const pad = tight ? 0.32 : 0.5;

    const inner = `
      <div class="ex-doc">
        <div class="ex-head">
          <h1 class="ex-title">${esc(opt.title || 'Report')}</h1>
          ${opt.subtitle ? `<p class="ex-sub">${esc(opt.subtitle)}</p>` : ''}
          <div class="ex-meta">
            ${(opt.meta || []).map(([k, v]) =>
              `<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join('')}
          </div>
        </div>
        <table class="ex ${tight ? 'ex-tight' : ''}"
               style="--ex-fs:${fs}rem;--ex-pad:${pad}rem">
          ${colgroup}
          <thead><tr>${cols.map((c) =>
            `<th class="${headCls(c)}">${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((r) => `<tr>${cols.map((c) =>
              `<td class="${cls(c, r)}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}
          </tbody>
          ${opt.totals ? `<tfoot><tr>${cols.map((c) => {
            const t = opt.totals[c.key];
            /* A totals row carries both sums and a label ("Total (28)"),
               so format by the value's own type, not the column's —
               num() over a label produced a cell reading "NaN". */
            const text = t === undefined || t === null ? ''
              : typeof t === 'number' ? (c.type === 'money' ? money(t) : num(t))
              : String(t);
            return `<td class="${headCls(c)}" style="font-weight:800;border-top:2px solid var(--warm-border)">${
              esc(text)}</td>`;
          }).join('')}</tr></tfoot>` : ''}
        </table>
        <div class="ex-foot">
          <span>${esc(opt.footer || 'Shri Vihat Meldi Dham — Sanand')}</span>
          <span>${dropped.length
            ? esc('Also in the Excel export: ' + dropped.join(', ')) + ' · '
            : ''}${esc(num(rows.length))} row${rows.length === 1 ? '' : 's'}</span>
        </div>
      </div>`;

    global.openPrintDoc({ title: opt.title || 'Report', wrapClass: 'ex-wrap', inner, css: PRINT_CSS, win: opt.win });
  }

  /* ---------- the toolbar ----------
     One pair of buttons, identical on every page, so an operator who
     finds the export once finds it everywhere. */
  function toolbar(id) {
    /* The words are wrapped so a phone can drop them and keep the two
       marks, which lets both buttons share a row with the page's own
       primary action instead of taking a row of their own above the
       list. `title` and `aria-label` carry the name either way, so the
       button is never a bare icon to a screen reader or a long press. */
    return `<div class="ex-bar" id="${attr(id || 'exportBar')}">
      <button type="button" class="btn btn-outline mg-btn-xs" data-export="pdf"
              title="PDF — password protected" aria-label="PDF, password protected">
        ${icon('print', 'ico-sm')}<span class="ex-label">PDF 🔒</span></button>
      <button type="button" class="btn btn-outline mg-btn-xs" data-export="xlsx"
              title="Excel — password protected" aria-label="Excel, password protected">
        ${icon('sheet', 'ico-sm')}<span class="ex-label">Excel 🔒</span></button>
    </div>`;
  }

  /** Wire the toolbar. `build()` is called at click time, not at render
      time, so the export always reflects the filters as they are now. */
  /* Every export is recorded on the server BEFORE the file is made — who,
     which register, how many rows, under which filters — and if it cannot
     be recorded, no file is made. The stamp the server returns ("Exported
     by <account> · <date>") goes on the file itself: a meta row in the
     spreadsheet, the header and footer of the printed sheet — so a copy
     that leaks says whose it was. */
  async function record(spec, format) {
    const r = await API.post('/exports', {
      list: spec.list, format, rows: (spec.rows || []).length, title: spec.title,
      filters: (spec.meta || []).filter(([k]) => k !== 'Taken'),
    });
    return r.stamp;
  }

  function stamped(spec, stamp) {
    return { ...spec,
      meta: (spec.meta || []).filter(([k]) => k !== 'Taken')
        .concat([['Exported by', stamp.replace(/^Exported by /, '')]]),
      footer: (spec.footer || 'Shri Vihat Meldi Dham — Sanand') + ' · ' + stamp };
  }

  /* ---------- password-protected Excel ----------
     The register as an encrypted .xlsx, built on the server
     (routes/exports.js) with Excel's own "Encrypt with Password". The
     password is typed here for this one file, sent once, and never
     stored — so a copy forwarded on WhatsApp is useless without it. The
     CSV download is gone from the toolbar for the same reason: an
     unprotected copy would defeat the point. */
  function askPassword(spec, kind) {
    const what = kind === 'pdf' ? 'PDF' : 'Excel';
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      UI.openSheet({
        title: `Password for this ${what} file`,
        body: `${UI.contextCard({ title: spec.title || 'Export', sub: `${num((spec.rows || []).length)} rows` })}
          <form id="xpwForm" novalidate style="margin-top:.9rem" autocomplete="off">
            <div class="form-group"><label class="form-label req" for="f_xpw">Password</label>
              <input class="form-input" id="f_xpw" name="pw" type="password" autocomplete="new-password" minlength="6"></div>
            <div class="form-group"><label class="form-label req" for="f_xpw2">Type it again</label>
              <input class="form-input" id="f_xpw2" name="pw2" type="password" autocomplete="new-password"></div>
            <label class="small" style="display:flex;gap:.45rem;align-items:center;font-weight:500">
              <input type="checkbox" id="f_xpwShow" style="width:auto;min-height:0"> Show password</label>
            <p class="form-hint" style="margin-top:.7rem">At least 6 characters — 8 or more mixing letters and numbers is much harder to guess. ${what === 'PDF' ? 'Any PDF reader' : 'Excel'} asks for it before opening the file.
              Share it separately from the file — a phone call, not the same WhatsApp message. It is not stored
              anywhere: if it is forgotten, export the file again.</p>
          </form>`,
        footer: `<button class="btn btn-outline" data-sheet-close>Cancel</button>
                 <button class="btn btn-primary" id="xpwGo">Download ${what}</button>`,
        onMount(sheet) {
          sheet.addEventListener('close', () => finish(null), { once: true });
          const f = document.getElementById('xpwForm');
          document.getElementById('f_xpwShow').addEventListener('change', (e) => {
            f.querySelectorAll('input[name^="pw"]').forEach((i) => { i.type = e.target.checked ? 'text' : 'password'; });
          });
          const go = () => {
            UI.clearFieldErrors(f);
            const pw = f.pw.value, pw2 = f.pw2.value;
            if (pw.length < 6) return UI.showFieldError(f, 'pw', 'At least 6 characters');
            if (pw !== pw2) return UI.showFieldError(f, 'pw2', 'The two passwords are not the same');
            finish(pw);
            UI.closeSheet();
          };
          sheet.querySelector('#xpwGo').addEventListener('click', go);
          UI.bindEnterFlow(f, go);
        },
      });
    });
  }

  /* Both protected formats are built on the server from the same values the
     page shows (routes/exports.js); the page sends its filtered, sorted rows
     and the password for this one file. */
  async function protectedExport(kind, spec, password, retried) {
    const cols = spec.columns;
    const body = {
      list: spec.list, title: spec.title, subtitle: spec.subtitle, filename: spec.filename, password,
      meta: (spec.meta || []).filter(([k]) => k !== 'Taken'),
      columns: cols.map((c) => ({ label: c.label, type: c.type || '', print: c.print !== false })),
      rows: spec.rows.map((r) => cols.map((c) => { const v = c.value(r); return v === undefined ? null : v; })),
      totals: spec.totals ? cols.map((c) => (spec.totals[c.key] === undefined ? null : spec.totals[c.key])) : null,
    };
    const res = await fetch('/api/exports/' + kind, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' }, body: JSON.stringify(body),
    });
    if (res.status === 401) { location.replace('/login'); return; }
    /* A protected export is a risky action: confirm with Google, then once more. */
    if (res.status === 403 && !retried) {
      const e = await res.clone().json().catch(() => ({}));
      if (e.reauth && global.Reauth && await global.Reauth.confirm(e.error)) return protectedExport(kind, spec, password, true);
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'export.xlsx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    UI.toast(`${num(spec.rows.length)} rows saved as a password-protected ${kind === 'pdf' ? 'PDF' : 'Excel file'}`, 'ok');
  }
  const xlsx = (spec, password) => protectedExport('xlsx', spec, password);

  function bindToolbar(root, build) {
    if (!root) return;
    root.querySelectorAll('[data-export]').forEach((b) =>
      b.addEventListener('click', async () => {
        const spec = build();
        if (!spec) return;
        if (!(spec.rows || []).length) { UI.toast('Nothing to export in this view.', 'err'); return; }
        const kind = b.getAttribute('data-export');
        if (kind === 'xlsx' || kind === 'pdf') {
          /* Recorded on the server in the same request that builds the file. */
          const password = await askPassword(spec, kind);
          if (!password) return;
          b.disabled = true;
          try { await protectedExport(kind, spec, password); }
          catch (err) { UI.toast(`The ${kind === 'pdf' ? 'PDF' : 'Excel file'} was not made — ` + err.message, 'err'); }
          finally { b.disabled = false; }
          return;
        }
        const format = b.getAttribute('data-export') === 'csv' ? 'csv' : 'pdf';
        /* Opened now, inside the tap, or Safari blocks it (see print.js). */
        const win = format === 'pdf' ? global.openPrintHolder() : null;
        if (format === 'pdf' && !win) return;
        b.disabled = true;
        try {
          const stamp = await record(spec, format);
          if (format === 'csv') csv(stamped(spec, stamp));
          else pdf({ ...stamped(spec, stamp), win });
        } catch (err) {
          if (win) try { win.close(); } catch (e) { /* already gone */ }
          UI.toast('The export could not be recorded, so it was not made — ' + err.message, 'err');
        } finally {
          b.disabled = false;
        }
      }));
  }

  global.Export = { csv, pdf, xlsx, toolbar, bindToolbar, toCsv, download };
})(window);
