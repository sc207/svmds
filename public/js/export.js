/* ============================================================
   EXPORT SERVICE  —  one place for every "save as ..." action
   ------------------------------------------------------------
   Loaded right after people.js so every module can call it.

   Public API (all global):
     registerExport(key, builderFn)   builderFn -> { filename, title,
                                       subtitle?, columns:[], rows:[[]],
                                       meta?:[] }  (called fresh on click)
     exportBar(key, opts?)            -> HTML for a CSV / Excel / PDF pill
     runExport(key, kind)             kind = 'csv' | 'xls' | 'pdf'
     downloadCSV(filename, rows)      rows = [[...header], [...], ...]
     downloadXLS(filename, rows, sheetName?)
     printReportPDF({title, subtitle, columns, rows, meta})
                                      certificate-grade A4 report window
   ============================================================ */

(function () {
  'use strict';

  var _EXPORTS = {};

  function xesc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Absolute URL for a bundled asset — works from the main document AND from
     the about:blank print windows, and under a GitHub Pages sub-path. */
  function assetURL(file) {
    try {
      var u = new URL(file, document.baseURI).href;
      if (u) return u;
    } catch (e) {}
    try {
      var base = String(document.baseURI || location.href).replace(/[?#].*$/, '').replace(/[^/]*$/, '');
      return base + String(file).replace(/^\.?\//, '');
    } catch (e2) { return file; }
  }
  window.assetURL = assetURL;

  function toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
    else if (typeof window.mgToast === 'function') window.mgToast(msg);
  }

  var FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800;900&family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&family=Inter:wght@300;400;500;600;700&family=Noto+Serif+Devanagari:wght@400;600;700&family=Noto+Serif+Gujarati:wght@400;600;700&family=Noto+Sans+Gujarati:wght@400;600;700&display=swap');";

  /* Open a print / save-as-PDF window that actually carries the app's styles.
     We LINK css/styles.css (a stylesheet <link> always applies, even on file://
     — only JS reading of .cssRules is blocked, which is why the old
     serialise-every-rule approach produced an unstyled page), and we wait for
     `window.load` (fonts + images ready) before calling print(). */
  window.openPrintDoc = function (opt) {
    opt = opt || {};
    var w = window.open('', '_blank');
    if (!w) { toast('Please allow pop-ups to print / save as PDF.'); return null; }
    var href = assetURL('css/styles.css');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      xesc(opt.title || 'Temple Document') + '</title>' +
      '<link rel="stylesheet" href="' + href + '">' +
      '<style>' + FONT_IMPORT +
      'html,body{background:#fff;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}' +
      'body{font-family:Inter,system-ui,sans-serif}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '@media print{html,body{background:#fff}}' +
      (opt.css || '') + '</style></head><body>' +
      '<div class="' + (opt.wrapClass || 'tpl-print-wrap') + '">' + (opt.inner || '') + '</div>' +
      /* Only print once styles, fonts AND images are really ready — a fixed
         timer used to fire window.print() before the linked stylesheet had
         parsed, so the page printed unstyled and every sheet collapsed onto
         one printed page. */
      '<' + 'script>(function(){var d=false;' +
      'function go(){if(d)return;d=true;try{window.focus()}catch(e){}try{window.print()}catch(e){}}' +
      'function cssReady(){var ls=document.querySelectorAll(\'link[rel="stylesheet"]\');' +
      'for(var i=0;i<ls.length;i++){var s;try{s=ls[i].sheet}catch(e){return false}' +
      'if(!s)return false;try{if(!s.cssRules||!s.cssRules.length)return false}catch(e){}}return true}' +
      'function imgReady(){var im=document.images;for(var i=0;i<im.length;i++){if(!im[i].complete)return false}return true}' +
      'if(document.fonts&&document.fonts.ready){try{document.fonts.ready.then(function(){},function(){})}catch(e){}}' +
      'function whenReady(){var n=0;(function poll(){n++;' +
      'var fontsOk=(!document.fonts)||document.fonts.status==="loaded"||n>40;' +
      'if((cssReady()&&imgReady()&&fontsOk)||n>60){setTimeout(go,250)}else{setTimeout(poll,100)}})()}' +
      'if(document.readyState==="complete"){whenReady()}else{window.addEventListener("load",whenReady)}' +
      'setTimeout(go,9000);})();<' + '/script></body></html>';
    w.document.open(); w.document.write(html); w.document.close();
    return w;
  };

  function templeInfo() {
    var d = {
      name: 'Shri Vihat Meldi Mata Mandir', loc: 'Sanand, Gujarat, India',
      founder: 'Bhagwan Bhuvaji Karamshi Bapa', head: 'Bhuvaji Suresh Bapa'
    };
    try {
      var c = JSON.parse(localStorage.getItem('svmmm_temple') || '{}');
      if (c.name) d.name = c.name;
      if (c.loc) d.loc = c.loc;
      if (c.founder) d.founder = c.founder;
      if (c.head) d.head = c.head;
    } catch (e) {}
    return d;
  }

  function stamp() {
    var dt = new Date();
    try {
      return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return dt.toISOString().slice(0, 16).replace('T', ' '); }
  }

  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* ---- CSV ---- */
  function downloadCSV(filename, rows) {
    var csv = (rows || []).map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    downloadBlob(
      /\.csv$/i.test(filename) ? filename : filename + '.csv',
      new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    );
    toast((filename.replace(/\.csv$/i, '')) + '.csv exported.');
  }

  /* ---- Excel (.xls, Excel-openable HTML workbook) ---- */
  function downloadXLS(filename, rows, sheetName) {
    sheetName = (sheetName || 'Sheet1').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 28) || 'Sheet1';
    var body = (rows || []).map(function (r, i) {
      var tag = i === 0 ? 'th' : 'td';
      return '<tr>' + r.map(function (c) {
        var v = String(c == null ? '' : c);
        var isNum = v !== '' && /^-?[₹]?\s?[\d,]+(\.\d+)?%?$/.test(v);
        return '<' + tag + (isNum ? ' style="mso-number-format:\'\\@\'"' : '') + '>' + xesc(v) + '</' + tag + '>';
      }).join('') + '</tr>';
    }).join('');
    var html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      '<head><meta charset="utf-8">' +
      '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
      '<x:Name>' + xesc(sheetName) + '</x:Name>' +
      '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>' +
      '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
      '<style>' +
      'table{border-collapse:collapse}' +
      'th{background:#6B1F2A;color:#fff;font-family:Calibri,Arial,sans-serif;font-size:11pt;padding:5px 8px;border:1px solid #b98;text-align:left}' +
      'td{font-family:Calibri,Arial,sans-serif;font-size:11pt;padding:4px 8px;border:1px solid #d9c7ad}' +
      '</style></head><body><table>' + body + '</table></body></html>';
    downloadBlob(
      /\.xls$/i.test(filename) ? filename : filename + '.xls',
      new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    );
    toast((filename.replace(/\.xls$/i, '')) + '.xls exported.');
  }

  /* ---- Certificate-grade PDF report (print window) ---- */
  function printReportPDF(opt) {
    opt = opt || {};
    var cols = opt.columns || [];
    var rows = opt.rows || [];
    var tpl = templeInfo();
    var wide = cols.length >= 8;                    // many columns -> A4 landscape
    var pageW = wide ? '297mm' : '210mm';
    var tblFont = cols.length >= 11 ? '8px' : (wide ? '8.6px' : '10px');
    var w = window.open('', '_blank');
    if (!w) { toast('Please allow pop-ups to save as PDF.'); return; }

    var metaBits = ['Generated <strong>' + xesc(stamp()) + '</strong>',
      'Records <strong>' + rows.length + '</strong>'].concat((opt.meta || []).map(xesc));

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      xesc(opt.title || 'Temple Report') + '</title><style>' +
      "@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Cormorant+Garamond:ital@0;1&family=Inter:wght@400;600;700&family=Noto+Serif+Gujarati:wght@400;600;700&display=swap');" +
      '*{box-sizing:border-box}' +
      'html,body{margin:0;padding:0;background:#efe7d7;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.rpt{position:relative;width:' + pageW + ';min-height:297mm;margin:14px auto;background:#fff;overflow:hidden;box-shadow:0 12px 40px rgba(59,20,23,.25)}' +
      '.rc{position:absolute;width:60px;height:60px;pointer-events:none;background:linear-gradient(#b8892f,#b8892f) left top/100% 3px no-repeat,linear-gradient(#b8892f,#b8892f) left top/3px 100% no-repeat}' +
      '.rc.tl{top:16px;left:16px}.rc.tr{top:16px;right:16px;transform:scaleX(-1)}.rc.bl{bottom:16px;left:16px;transform:scaleY(-1)}.rc.br{bottom:16px;right:16px;transform:scale(-1)}' +
      '.rpt-hero{position:absolute;right:-28px;bottom:-24px;width:44%;opacity:.06;pointer-events:none}' +
      '.rpt-in{position:relative;padding:22mm 17mm 18mm}' +
      '.rpt-head{text-align:center;border-bottom:2px solid #6B1F2A;padding-bottom:12px}' +
      '.rpt-emblem{width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #C9A24A}' +
      '.rpt-temple{font-family:"Cinzel",serif;font-weight:800;font-size:17px;color:#6B1F2A;letter-spacing:.5px;margin-top:6px}' +
      '.rpt-loc{font-size:9.5px;letter-spacing:2px;text-transform:uppercase;color:#8a7a5c;margin-top:2px}' +
      '.rpt-dign{font-size:9px;color:#8a7a5c;margin-top:4px;font-style:italic}' +
      '.rpt-ribbon{text-align:center;font-family:"Cinzel","Noto Serif Gujarati",serif;letter-spacing:2.5px;text-transform:uppercase;font-size:13px;color:#6B1F2A;margin:14px 0 2px;font-weight:700}' +
      '.rpt-ribbon i{color:#C9A24A;font-style:normal;margin:0 10px;font-size:9px;vertical-align:middle}' +
      '.rpt-sub{text-align:center;font-family:"Cormorant Garamond",serif;font-style:italic;color:#5b4a37;font-size:13px;margin-bottom:12px}' +
      '.rpt-meta{display:flex;flex-wrap:wrap;justify-content:center;gap:5px 16px;font-size:9.5px;color:#8a7a5c;margin-bottom:14px}' +
      '.rpt-meta strong{color:#3B2418}' +
      'table.rpt-t{width:100%;border-collapse:collapse;font-family:"Inter",sans-serif;font-size:' + tblFont + ';table-layout:fixed}' +
      '.rpt-t th,.rpt-t td{overflow-wrap:anywhere;word-break:break-word;white-space:normal}' +
      '.rpt-t thead th{background:#6B1F2A;color:#fff;text-align:left;padding:7px 9px;font-weight:700;font-size:8.5px;letter-spacing:.5px;text-transform:uppercase}' +
      '.rpt-t tbody td{padding:6px 9px;border-bottom:1px solid #e5d5c0;color:#3B2418;vertical-align:top}' +
      '.rpt-t tbody tr:nth-child(even) td{background:#faf6ec}' +
      '.rpt-foot{margin-top:16px;border-top:1px solid #C9A24A;padding-top:9px;display:flex;justify-content:space-between;align-items:flex-end;font-size:8.5px;color:#8a7a5c}' +
      '.rpt-sign{text-align:center}.rpt-sign span{display:block;width:150px;border-top:1px solid #3B2418;margin-bottom:3px}' +
      '@media print{' +
        '@page{size:A4 ' + (wide ? 'landscape' : 'portrait') + ';margin:12mm}' +
        'html,body{background:#fff}' +
        /* overflow:visible is critical — with overflow:hidden Chrome treats .rpt
           as one unbreakable block and clips every row past page 1 */
        '.rpt{width:auto;min-height:0;margin:0;box-shadow:none;overflow:visible;position:static}' +
        '.rpt-in{padding:0}' +
        '.rc,.rpt-hero{display:none}' +
        '.rpt-t{page-break-inside:auto}' +
        '.rpt-t thead{display:table-header-group}' +
        '.rpt-t tr{page-break-inside:avoid}' +
        '.rpt-foot{page-break-inside:avoid}' +
      '}' +
      '</style></head><body><div class="rpt">' +
      '<span class="rc tl"></span><span class="rc tr"></span><span class="rc bl"></span><span class="rc br"></span>' +
      '<img class="rpt-hero" src="' + assetURL('assets/temple.png') + '" alt="" onerror="this.style.display=\'none\'">' +
      '<div class="rpt-in">' +
      '<div class="rpt-head"><img class="rpt-emblem" src="' + assetURL('assets/icon.png') + '" alt="" onerror="this.style.display=\'none\'">' +
      '<div class="rpt-temple">' + xesc(tpl.name) + '</div><div class="rpt-loc">' + xesc(tpl.loc) + '</div>' +
      '<div class="rpt-dign">Founder: ' + xesc(tpl.founder) + ' &nbsp;·&nbsp; Head: ' + xesc(tpl.head) + '</div></div>' +
      '<div class="rpt-ribbon"><i>&#9670;</i>' + xesc(opt.title || 'Report') + '<i>&#9670;</i></div>' +
      (opt.subtitle ? '<div class="rpt-sub">' + xesc(opt.subtitle) + '</div>' : '') +
      '<div class="rpt-meta">' + metaBits.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div>' +
      '<table class="rpt-t"><thead><tr>' + cols.map(function (c) { return '<th>' + xesc(c) + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + (rows.length
        ? rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + xesc(c) + '</td>'; }).join('') + '</tr>'; }).join('')
        : '<tr><td colspan="' + Math.max(cols.length, 1) + '" style="text-align:center;color:#8a7a5c;padding:18px">No records.</td></tr>') +
      '</tbody></table>' +
      '<div class="rpt-foot"><div>System-generated report &middot; ' + xesc(tpl.name) + '<br>' +
      xesc(String(location.href).split('#')[0]) + '</div>' +
      '<div class="rpt-sign"><span></span>Authorised Signatory / Trustee</div></div>' +
      '</div></div>' +
      '<' + 'script>(function(){var d=false;' +
      'function go(){if(d)return;d=true;try{window.focus()}catch(e){}try{window.print()}catch(e){}}' +
      'function imgReady(){var im=document.images;for(var i=0;i<im.length;i++){if(!im[i].complete)return false}return true}' +
      'if(document.fonts&&document.fonts.ready){try{document.fonts.ready.then(function(){},function(){})}catch(e){}}' +
      'function whenReady(){var n=0;(function poll(){n++;' +
      'var fontsOk=(!document.fonts)||document.fonts.status==="loaded"||n>40;' +
      'if((imgReady()&&fontsOk)||n>60){setTimeout(go,250)}else{setTimeout(poll,100)}})()}' +
      'if(document.readyState==="complete"){whenReady()}else{window.addEventListener("load",whenReady)}' +
      'setTimeout(go,9000);})();<' + '/script>' +
      '</body></html>';

    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ---- registry + UI ---- */
  function registerExport(key, builder) { _EXPORTS[key] = builder; }

  function runExport(key, kind) {
    var b = _EXPORTS[key];
    if (typeof b !== 'function') { toast('Nothing to export here yet.'); return; }
    var d;
    try { d = b() || {}; } catch (e) { toast('Export failed: ' + e.message); return; }
    var cols = d.columns || [];
    var rows = d.rows || [];
    var fname = d.filename || key;
    if (kind === 'xls') downloadXLS(fname, [cols].concat(rows), d.title || key);
    else if (kind === 'pdf') printReportPDF(d);
    else downloadCSV(fname, [cols].concat(rows));
  }

  function exportBar(key, opts) {
    opts = opts || {};
    var label = opts.label || 'Export';
    return '<span class="export-bar" role="group" aria-label="Export">' +
      '<span class="export-bar-label">' + xesc(label) + '</span>' +
      '<button type="button" class="export-bar-btn" onclick="runExport(\'' + key + '\',\'csv\')" title="Comma-separated values">CSV</button>' +
      '<button type="button" class="export-bar-btn" onclick="runExport(\'' + key + '\',\'xls\')" title="Excel workbook">Excel</button>' +
      '<button type="button" class="export-bar-btn export-bar-pdf" onclick="runExport(\'' + key + '\',\'pdf\')" title="Print / Save as PDF">PDF</button>' +
      '</span>';
  }

  /* ---- lazy PDF engine (pdfmake + html2canvas from cdnjs) ----
     Same technique the AdminLTE / DataTables "PDF" button uses: build the
     document with pdfMake and call .download().  html2canvas rasterises each
     invitation card to an image, pdfMake places one image per page with an
     explicit `pageBreak:'before'` so page N+1 always starts a fresh sheet.
     Loaded only on first use so the app stays lean / offline-friendly for
     everyone who never exports. Resolves with { pdfMake, html2canvas }. */
  var _pdfLibs = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('load failed: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensurePdfLibs() {
    if (_pdfLibs) return _pdfLibs;
    var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
    _pdfLibs = Promise.resolve()
      .then(function () {
        // html2canvas-pro (maintained fork) — the original 1.4.1 THROWS on the
        // modern color(srgb …) / color-mix() / oklch() values Chrome now returns
        // from getComputedStyle, which killed every invitation capture.
        return window.html2canvas ? null
          : loadScript('https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.8/dist/html2canvas-pro.min.js');
      })
      .then(function () {
        return (window.pdfMake && window.pdfMake.createPdf) ? null
          : loadScript(CDN + 'pdfmake/0.2.7/pdfmake.min.js');
      })
      .then(function () {
        // vfs_fonts registers pdfMake.vfs (the default Roboto font data)
        return (window.pdfMake && window.pdfMake.vfs) ? null
          : loadScript(CDN + 'pdfmake/0.2.7/vfs_fonts.js');
      })
      .then(function () {
        if (!window.pdfMake || !window.pdfMake.createPdf || !window.html2canvas)
          throw new Error('PDF engine unavailable');
        return { pdfMake: window.pdfMake, html2canvas: window.html2canvas };
      });
    _pdfLibs.catch(function () { _pdfLibs = null; });   // allow retry after a failure
    return _pdfLibs;
  }
  window.ensurePdfLibs = ensurePdfLibs;

  /* lazy JSZip (cdnjs) — for bundling individual invitation PDFs into one .zip */
  var _zipLib = null;
  function ensureZipLib() {
    if (_zipLib) return _zipLib;
    _zipLib = (window.JSZip ? Promise.resolve()
      : loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'))
      .then(function () {
        if (!window.JSZip) throw new Error('ZIP engine unavailable');
        return window.JSZip;
      });
    _zipLib.catch(function () { _zipLib = null; });
    return _zipLib;
  }
  window.ensureZipLib = ensureZipLib;

  window.registerExport = registerExport;
  window.runExport = runExport;
  window.exportBar = exportBar;
  window.downloadCSV = downloadCSV;
  window.downloadXLS = downloadXLS;
  window.printReportPDF = printReportPDF;
  window.exportKeys = function () { return Object.keys(_EXPORTS); };
  window.buildExport = function (key) {   /* dev/debug: run one builder, no download */
    var b = _EXPORTS[key];
    return typeof b === 'function' ? b() : null;
  };
})();
