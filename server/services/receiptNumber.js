/* 80G receipt + appreciation-certificate numbers. Mirrors the client
   nextReceiptNo()/nextCertNo(): REC-<year>-<n> (n from 101) and
   CERT-<year>-<nnn> (3-padded), the year taken from the donation date.
   Derived from the donations table so it self-heals if a row is deleted. (§3.5) */
const { queryAll } = require('../db/connection');

function yearOf(dateISO) {
  const s = String(dateISO || '');
  return /^\d{4}/.test(s) ? s.slice(0, 4) : String(new Date().getFullYear());
}

async function nextReceiptNo(dateISO) {
  const yr = yearOf(dateISO);
  const rows = await queryAll(
    "SELECT receipt_no FROM donations WHERE receipt_no LIKE ?", [`REC-${yr}-%`]
  );
  let max = 100;
  rows.forEach(r => {
    const m = /REC-\d{4}-(\d+)/.exec(r.receipt_no || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `REC-${yr}-${max + 1}`;
}

async function nextCertNo(dateISO) {
  const yr = yearOf(dateISO);
  const rows = await queryAll(
    "SELECT cert_no FROM donations WHERE cert_no LIKE ?", [`CERT-${yr}-%`]
  );
  let max = 0;
  rows.forEach(r => {
    const m = /CERT-\d{4}-(\d+)/.exec(r.cert_no || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `CERT-${yr}-${String(max + 1).padStart(3, '0')}`;
}

module.exports = { nextReceiptNo, nextCertNo };
