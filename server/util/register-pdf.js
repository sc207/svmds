/* A register (Payments, Devotees, Padhramni, Donations) as a password-protected
   PDF, drawn on the server.

   Why here and not the browser: "Save as PDF" from the print dialog cannot
   carry a password, and a PDF has to be built to be encrypted. pdfkit writes
   AES-256 (PDF 1.7 ext 3), so every reader — Adobe, Chrome, a phone — asks for
   the password before showing a page. Printing stays allowed (that is what a
   register is for); copying text out and editing do not.

   Two fonts share every line: Noto Serif Gujarati for Gujarati (and ₹, which
   only it has) and Inter for everything else — each character goes to the
   font that owns it. They are static TTF cuts of the app's own web fonts
   (server/fonts), because pdfkit cannot subset WOFF2 or variable fonts.
   Wrapping is done here, word by word across both fonts, since pdfkit can
   only measure one font at a time. */
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const FONTS = path.join(__dirname, '..', 'fonts');
const MAROON = '#6B1F2A';
const GUJ = /[઀-૿।॥₹‌‍]/;

const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const num = (n) => (Number(n) || 0).toLocaleString('en-IN');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : String(s == null ? '' : s);
};

function text(c, v) {
  if (v === null || v === undefined || v === '') return c.type === 'money' || c.type === 'num' ? (c.type === 'money' ? money(0) : '0') : '';
  if (c.type === 'money') return money(v);
  if (c.type === 'num') return num(v);
  if (c.type === 'date') return fmtDate(v);
  return String(v);
}

/** Split a string into [isGujarati, piece] runs; spaces stay with the run they are in. */
function runs(s) {
  const out = [];
  let cur = '', g = null;
  for (const ch of String(s)) {
    const isG = GUJ.test(ch);
    if (/\s/.test(ch) && g !== null) { cur += ch; continue; }
    if (g === null) g = isG;
    if (isG !== g) { out.push([g, cur]); cur = ''; g = isG; }
    cur += ch;
  }
  if (cur) out.push([g === true, cur]);
  return out;
}

function build(opt) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape', margins: { top: 34, bottom: 40, left: 28, right: 28 },
      bufferPages: true, pdfVersion: '1.7ext3',
      userPassword: opt.password,
      ownerPassword: crypto.randomBytes(24).toString('hex'),   // nobody can lift the restrictions
      permissions: { printing: 'highResolution', modifying: false, copying: false,
        annotating: false, fillingForms: false, contentAccessibility: true, documentAssembly: false },
      info: { Title: opt.title || 'Register', Author: 'Shri Vihat Meldi Dham', Subject: opt.stamp || '' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('lat', path.join(FONTS, 'Inter-400.ttf'));
    doc.registerFont('latb', path.join(FONTS, 'Inter-700.ttf'));
    doc.registerFont('guj', path.join(FONTS, 'NotoSerifGujarati-400.ttf'));
    doc.registerFont('gujb', path.join(FONTS, 'NotoSerifGujarati-700.ttf'));
    doc.registerFont('head', path.join(FONTS, 'Cinzel-700.ttf'));

    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const X0 = doc.page.margins.left;
    const bottom = () => doc.page.height - doc.page.margins.bottom;

    const width = (s, size, bold) => runs(s).reduce((a, [g, t]) =>
      a + doc.font(g ? (bold ? 'gujb' : 'guj') : (bold ? 'latb' : 'lat')).fontSize(size).widthOfString(t), 0);

    /** Greedy word wrap across both fonts; a word wider than the column is broken by character. */
    function wrap(s, w, size, bold) {
      const lines = [];
      for (const para of String(s).split(/\r?\n/)) {
        let line = '';
        for (const word of para.split(/(\s+)/).filter((x) => x !== '')) {
          const tryLine = line + word;
          if (width(tryLine, size, bold) <= w || !line.trim()) {
            if (width(tryLine, size, bold) <= w) { line = tryLine; continue; }
            // a single word too wide for the column: break it
            let piece = '';
            for (const ch of word) {
              if (width(line + piece + ch, size, bold) > w && (line + piece).trim()) { lines.push((line + piece).trimEnd()); line = ''; piece = ''; }
              piece += ch;
            }
            line += piece;
          } else { lines.push(line.trimEnd()); line = /^\s+$/.test(word) ? '' : word; }
        }
        lines.push(line.trimEnd());
      }
      return lines.length ? lines : [''];
    }

    function draw(s, x, y, size, bold, color, align, w) {
      let dx = x;
      if (align === 'right') dx = x + w - width(s, size, bold);
      doc.fillColor(color || '#2B1A12');
      for (const [g, t] of runs(s)) {
        doc.font(g ? (bold ? 'gujb' : 'guj') : (bold ? 'latb' : 'lat')).fontSize(size)
          .text(t, dx, y, { lineBreak: false });
        dx += doc.widthOfString(t);
      }
    }

    /* ---- the sheet header ---- */
    let y = doc.page.margins.top;
    doc.font('head').fontSize(18).fillColor(MAROON).text(String(opt.title || 'Register').toUpperCase(), X0, y, { width: W, lineBreak: false });
    y += 26;
    if (opt.subtitle) { draw(opt.subtitle, X0, y, 8.5, false, '#7A5C45'); y += 13; }
    const metaLine = (opt.meta || []).map(([k, v]) => `${k}: ${v}`).join('    ');
    for (const l of wrap(metaLine, W, 7.5, false)) { draw(l, X0, y, 7.5, false, '#4A3222'); y += 11; }
    y += 3;
    doc.moveTo(X0, y).lineTo(X0 + W, y).lineWidth(1.4).strokeColor(MAROON).stroke();
    y += 8;

    /* ---- columns: weighted by what they hold, measured on the content ---- */
    const cols = opt.columns;
    const n = cols.length;
    const size = n <= 9 ? 8 : Math.max(6, 8 - (n - 9) * 0.22);
    const pad = n > 10 ? 3 : 4;
    const numeric = (c) => c.type === 'money' || c.type === 'num';
    const cells = opt.rows.map((r) => cols.map((c, i) => text(c, r[i])));
    const totals = opt.totals ? cols.map((c, i) => {
      const t = opt.totals[i];
      return t === undefined || t === null ? '' : typeof t === 'number' ? (c.type === 'money' ? money(t) : num(t)) : String(t);
    }) : null;
    const weights = cols.map((c, i) => {
      const vals = cells.map((row) => row[i]).concat(totals ? [totals[i]] : []);
      const head = Math.max(...String(c.label).split(/\s+/).map((w) => width(w, size, true)));
      const atom = numeric(c) || c.type === 'date';
      const longest = Math.max(0, ...vals.map((v) => (atom ? width(v, size) : Math.max(0, ...String(v).split(/\s+/).map((w) => width(w, size))))));
      const avg = vals.length ? vals.reduce((a, v) => a + width(v, size), 0) / vals.length : 0;
      const empty = vals.every((v) => !String(v).trim() || v === money(0));
      if (empty && !numeric(c)) return head + pad * 2;
      return Math.max(head, atom ? longest : Math.min(longest, 120), atom ? 0 : Math.min(avg * 0.6, 150)) + pad * 2;
    });
    /* Too wide for the page: shrink every column in proportion. Room to
       spare: give it only to the columns holding words (names, addresses,
       seva) — an empty Time or Escort column stretched like the rest while
       the devotee's name beside it wrapped. */
    const sum = weights.reduce((a, b) => a + b, 0);
    const grows = cols.map((c, i) => !(numeric(c) || c.type === 'date') &&
      cells.some((row) => String(row[i]).trim()));
    const growSum = weights.reduce((a, w, i) => a + (grows[i] ? w : 0), 0);
    const widths = sum >= W || !growSum
      ? weights.map((w) => w * (W / sum))
      : weights.map((w, i) => w + (grows[i] ? (W - sum) * (w / growSum) : 0));
    const lh = size * 1.32;

    function headerRow() {
      const heads = cols.map((c, i) => wrap(c.label, widths[i] - pad * 2, size, true));
      const h = Math.max(...heads.map((l) => l.length)) * lh + pad * 2;
      doc.rect(X0, y, W, h).fill('#F7EFE0');
      let x = X0;
      cols.forEach((c, i) => {
        heads[i].forEach((l, k) => draw(l, x + pad, y + pad + k * lh, size, true, '#2B1A12', numeric(c) ? 'right' : 'left', widths[i] - pad * 2));
        x += widths[i];
      });
      y += h;
      doc.moveTo(X0, y).lineTo(X0 + W, y).lineWidth(1).strokeColor('#D9C7A8').stroke();
    }
    function newPage() { doc.addPage(); y = doc.page.margins.top; headerRow(); }

    headerRow();
    cells.forEach((row, ri) => {
      const lines = row.map((v, i) => (numeric(cols[i]) || cols[i].type === 'date') ? [v] : wrap(v, widths[i] - pad * 2, size, false));
      const h = Math.max(...lines.map((l) => l.length)) * lh + pad * 2;
      if (y + h > bottom()) newPage();
      if (ri % 2 === 1) doc.rect(X0, y, W, h).fill('#FCF8F0');
      let x = X0;
      cols.forEach((c, i) => {
        lines[i].forEach((l, k) => draw(l, x + pad, y + pad + k * lh, size, false, '#2B1A12', numeric(c) ? 'right' : 'left', widths[i] - pad * 2));
        x += widths[i];
      });
      y += h;
      doc.moveTo(X0, y).lineTo(X0 + W, y).lineWidth(0.5).strokeColor('#E6D8BF').stroke();
    });
    if (totals) {
      const h = lh + pad * 2 + 2;
      if (y + h > bottom()) newPage();
      doc.moveTo(X0, y).lineTo(X0 + W, y).lineWidth(1.5).strokeColor('#D9C7A8').stroke();
      let x = X0;
      cols.forEach((c, i) => { draw(totals[i], x + pad, y + pad + 1, size, true, '#2B1A12', numeric(c) ? 'right' : 'left', widths[i] - pad * 2); x += widths[i]; });
      y += h;
    }

    /* ---- footer on every page: who took it, what was left out, page x of y ---- */
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const fy = doc.page.height - doc.page.margins.bottom + 12;
      const left = [opt.footer || 'Shri Vihat Meldi Dham — Sanand', opt.stamp].filter(Boolean).join(' · ');
      const right = `${opt.dropped && opt.dropped.length ? 'Also in the Excel export: ' + opt.dropped.join(', ') + ' · ' : ''}` +
        `${num(opt.rows.length)} rows · page ${i + 1} of ${range.count}`;
      /* The footer sits in the bottom margin: without this pdfkit would
         see it past the bottom edge and open a new, empty page. */
      const keep = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      draw(left, X0, fy, 6.5, false, '#7A5C45');
      draw(right, X0, fy, 6.5, false, '#7A5C45', 'right', W);
      doc.page.margins.bottom = keep;
    }
    doc.end();
  });
}

module.exports = { build };
