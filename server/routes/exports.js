/* Password-protected exports — the register as an encrypted .xlsx or PDF.

   The page sends the rows it is showing (already filtered and sorted, the
   same values the printed sheet uses) and a password the person exporting
   has just typed. This builds a real workbook — numbers as numbers, dates
   as dates, the filters and "Exported by" stamp above the table — and
   encrypts it with Excel's own "Encrypt with Password" scheme (ECMA-376
   agile, AES), so Excel, LibreOffice and phone apps ask for the password
   before showing anything. The password is used once and never stored or
   logged; if it is lost, the file cannot be opened — export again.

   The export is recorded in the same request, so there is no file without
   an audit row. */
const express = require('express');
const XlsxPopulate = require('xlsx-populate');
const { log } = require('../middleware/audit');
const registerPdf = require('../util/register-pdf');
const { needsFreshAuth } = require('../middleware/auth');
const fresh = needsFreshAuth('A password-protected export');

const router = express.Router();
const LISTS = ['payments', 'devotees', 'visits', 'donations'];
const MAX_ROWS = 20000;

/* A leading = + - @ would make Excel run a devotee's note as a formula. */
const deFang = (s) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

/** What both formats need out of the request, checked once. Throws a 400. */
function readExport(req) {
  const b = req.body || {};
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  const list = String(b.list || '');
  if (!LISTS.includes(list)) throw bad('Unknown export');
  const password = String(b.password || '');
  if (password.length < 6) throw bad('The password must be at least 6 characters');
  if (password.length > 128) throw bad('That password is too long');
  const columns = (Array.isArray(b.columns) ? b.columns : []).slice(0, 60)
    .map((c) => ({ label: String((c && c.label) || '').slice(0, 80), type: String((c && c.type) || ''),
      print: !(c && c.print === false) }));
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!columns.length || !rows.length) throw bad('Nothing to export');
  if (rows.length > MAX_ROWS) throw bad(`At most ${MAX_ROWS} rows in one file — narrow the filter`);
  const meta = (Array.isArray(b.meta) ? b.meta : []).slice(0, 20)
    .map((m) => (Array.isArray(m) ? [String(m[0]).slice(0, 60), String(m[1]).slice(0, 200)] : null)).filter(Boolean)
    .filter(([k]) => k !== 'Taken' && k !== 'Exported by');
  const who = (req.user && (req.user.name || req.user.email)) || 'Unknown';
  const at = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
    year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return {
    list, password, columns, rows, meta,
    title: String(b.title || list).slice(0, 120),
    subtitle: String(b.subtitle || '').slice(0, 160),
    totals: Array.isArray(b.totals) ? b.totals.slice(0, 60) : null,
    filename: String(b.filename || list).replace(/[^\w.-]+/g, '-').slice(0, 80),
    stamp: `${who}${req.user && req.user.email && req.user.email !== who ? ' (' + req.user.email + ')' : ''} · ${at}`,
  };
}

const recordExport = (req, x, label) => log(req, {
  action: 'export', entity: 'export', entityId: null,
  summary: `${x.title} — ${x.rows.length} row${x.rows.length === 1 ? '' : 's'} exported as ${label}`,
  details: { list: x.list, format: label, rows: x.rows.length, filters: x.meta },
});

router.post('/xlsx', fresh, express.json({ limit: '8mb' }), async (req, res) => {
  let x;
  try { x = readExport(req); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const { columns, rows, meta, title, password, stamp } = x;

  const wb = await XlsxPopulate.fromBlankAsync();
  const sh = wb.sheet(0).name(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Export');
  let r = 1;
  sh.cell(r, 1).value(title).style({ bold: true, fontSize: 14, fontColor: '6B1F2A' });
  r++;
  for (const [k, v] of meta.concat([['Exported by', stamp]])) {
    sh.cell(r, 1).value(k).style({ bold: true });
    sh.cell(r, 2).value(v);
    r++;
  }
  r++;
  const head = r;
  columns.forEach((c, i) => sh.cell(r, i + 1).value(c.label)
    .style({ bold: true, fill: 'F7EFE0', bottomBorder: true }));
  r++;
  for (const row of rows) {
    columns.forEach((c, i) => {
      const v = Array.isArray(row) ? row[i] : undefined;
      if (v === null || v === undefined || v === '') return;
      const cell = sh.cell(r, i + 1);
      if (c.type === 'money' || c.type === 'num') {
        const n = Number(v);
        if (Number.isFinite(n)) { cell.value(n).style('numberFormat', c.type === 'money' ? '#,##,##0' : '0'); return; }
      }
      if (c.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
        const [y, m, d] = String(v).split('-').map(Number);
        cell.value(new Date(Date.UTC(y, m - 1, d))).style('numberFormat', 'dd/mm/yyyy');
        return;
      }
      cell.value(deFang(String(v).slice(0, 32000)));
    });
    r++;
  }
  columns.forEach((c, i) => sh.column(i + 1).width(Math.min(40, Math.max(10, c.label.length + 2))));
  sh.freezePanes(0, head);

  const buf = await wb.outputAsync({ password });
  await recordExport(req, x, 'password-protected Excel');
  const name = `${x.filename}-${new Date().toLocaleDateString('en-CA')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

/* The printable register as an AES-256 password-protected PDF
   (util/register-pdf.js). Columns marked print:false stay in the Excel file
   and the sheet's footer names them, as the browser print always did. */
router.post('/pdf', fresh, express.json({ limit: '8mb' }), async (req, res) => {
  let x;
  try { x = readExport(req); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const keep = x.columns.map((c, i) => (c.print ? i : -1)).filter((i) => i >= 0);
  const buf = await registerPdf.build({
    title: x.title, subtitle: x.subtitle, password: x.password, stamp: 'Exported by ' + x.stamp,
    meta: x.meta.concat([['Exported by', x.stamp]]),
    columns: keep.map((i) => x.columns[i]),
    rows: x.rows.map((r) => keep.map((i) => (Array.isArray(r) ? r[i] : null))),
    totals: x.totals ? keep.map((i) => x.totals[i]) : null,
    dropped: x.columns.filter((c) => !c.print).map((c) => c.label),
  });
  await recordExport(req, x, 'password-protected PDF');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${x.filename}-${new Date().toLocaleDateString('en-CA')}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

module.exports = router;
