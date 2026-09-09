/* Donations — cash or in-kind, 80G receipt number allocated on create, optional
   appreciation certificate. This is the template module: CRUD + a catalog +
   a numbering service + audit + mappers. Reads + writes: any session
   (accountant included); soft delete: admin tier. (BACKEND_PLAN.md Phase 3) */
const express = require('express');
const crypto = require('crypto');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { nextReceiptNo, nextCertNo } = require('../services/receiptNumber');
const { logAudit } = require('../services/audit');
const { mapDonation } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

const SELECT = `
  SELECT dn.*,
         dr.code AS donor_code, dc.code AS category_code,
         COALESCE(NULLIF(dr.org_name,''), TRIM(dr.first_name || ' ' || dr.last_name)) AS donor_name,
         dc.name AS category_name, dc.kind AS category_kind
  FROM donations dn
  JOIN donors dr             ON dr.id = dn.donor_id
  JOIN donation_categories dc ON dc.id = dn.category_id
  WHERE dn.is_deleted = 0`;

/* GET /   ?status=received|pledged &donorId= &categoryId= &from= &to= &q= */
router.get('/', async (req, res, next) => {
  try {
    const where = [];
    const args = [];
    if (req.query.status) { where.push('dn.status = ?'); args.push(req.query.status); }
    if (req.query.donorId) { where.push('(dr.code = ? OR dr.id = ?)'); args.push(req.query.donorId, parseInt(req.query.donorId, 10) || -1); }
    if (req.query.categoryId) { where.push('(dc.code = ? OR dc.id = ?)'); args.push(req.query.categoryId, parseInt(req.query.categoryId, 10) || -1); }
    if (req.query.from) { where.push('dn.date >= ?'); args.push(req.query.from); }
    if (req.query.to) { where.push('dn.date <= ?'); args.push(req.query.to); }
    if (req.query.q) {
      where.push('(dn.receipt_no LIKE ? OR dn.cert_no LIKE ? OR dn.code LIKE ? OR dn.item LIKE ? OR dn.purpose LIKE ?)');
      const like = `%${req.query.q}%`;
      args.push(like, like, like, like, like);
    }
    const sql = SELECT + (where.length ? ' AND ' + where.join(' AND ') : '') + ' ORDER BY dn.date DESC, dn.created_at DESC';
    const rows = await queryAll(sql, args);
    res.json(rows.map(mapDonation));
  } catch (e) { next(e); }
});

async function oneByIdOrCode(v) {
  const rows = await queryAll(SELECT + ' AND (dn.id = ? OR dn.code = ?) LIMIT 1', [v, v]);
  return rows[0] || null;
}

router.get('/:id', async (req, res, next) => {
  try {
    const row = await oneByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Donation not found' });
    res.json(mapDonation(row));
  } catch (e) { next(e); }
});

async function resolveDonor(v) {
  return queryOne('SELECT * FROM donors WHERE (code = ? OR id = ?) AND is_deleted = 0', [v, parseInt(v, 10) || -1]);
}
async function resolveCategory(v) {
  return queryOne('SELECT * FROM donation_categories WHERE (code = ? OR id = ?) AND is_deleted = 0', [v, parseInt(v, 10) || -1]);
}

/* POST /   { donorId, categoryId, date, status?, mode?, amount?|item+qty+valuation, purpose?, committee?, notes? } */
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const donor = await resolveDonor(b.donorId);
    if (!donor) return res.status(400).json({ error: 'Unknown donorId' });
    const cat = await resolveCategory(b.categoryId);
    if (!cat) return res.status(400).json({ error: 'Unknown categoryId' });
    if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });

    const status = b.status === 'pledged' ? 'pledged' : 'received';
    const isKind = cat.kind === 'kind';
    let amount = 0, item = '', qty = '', valuation = 0, mode = b.mode || 'Cash';

    if (isKind) {
      item = String(b.item || '').trim();
      qty = String(b.qty || '').trim();
      valuation = Number(b.valuation || 0);
      mode = 'In-Kind';
      if (!item) return res.status(400).json({ error: 'item is required for an in-kind donation' });
      if (!(valuation > 0)) return res.status(400).json({ error: 'valuation must be > 0 for an in-kind donation' });
    } else {
      amount = Number(b.amount || 0);
      if (!(amount > 0)) return res.status(400).json({ error: 'amount must be > 0 for a cash donation' });
    }

    const id = crypto.randomUUID();
    const code = await nextCode('donation');
    const recordedBy = req.user.email || String(req.user.id);

    // nextReceiptNo() is a max()+1 scan, so two donations on the same date can
    // compute the same number. ux_donations_receipt is the hard stop — on a
    // collision, recompute and retry (a few times) so every 80G receipt is unique.
    let attempts = 0;
    while (true) {
      const receiptNo = status === 'received' ? await nextReceiptNo(b.date) : null;
      try {
        await run(
          `INSERT INTO donations
             (id, code, receipt_no, donor_id, category_id, mode, amount, item, qty, valuation,
              date, purpose, committee, status, notes, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, code, receiptNo, donor.id, cat.id, mode, amount, item, qty, valuation,
           b.date, b.purpose || '', b.committee || donor.committee || '', status, b.notes || '', recordedBy]
        );
        break;
      } catch (e) {
        if (++attempts >= 5 || !receiptNo) throw e;
        // small jitter so parallel writers don't lock-step onto the same next number
        await new Promise(r => setTimeout(r, 15 + Math.floor(Math.random() * 40)));
      }
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'CREATE', entityType: 'donation', entityId: code,
      details: { donor: donor.code, category: cat.code, amount: amount || valuation, status } });

    res.status(201).json(mapDonation(await oneByIdOrCode(id)));
  } catch (e) { next(e); }
});

/* PATCH /:id   — edit fields; flipping pledged -> received allocates a receipt */
router.patch('/:id', async (req, res, next) => {
  try {
    const row = await oneByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Donation not found' });
    const b = req.body || {};
    const sets = [], args = [];

    for (const [k, col] of Object.entries({
      mode: 'mode', item: 'item', qty: 'qty', purpose: 'purpose', committee: 'committee', notes: 'notes',
    })) {
      if (typeof b[k] === 'string') { sets.push(`${col} = ?`); args.push(b[k]); }
    }
    if (b.amount !== undefined) { sets.push('amount = ?'); args.push(Number(b.amount || 0)); }
    if (b.valuation !== undefined) { sets.push('valuation = ?'); args.push(Number(b.valuation || 0)); }
    if (b.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'bad date' });
      sets.push('date = ?'); args.push(b.date);
    }
    let allocReceipt = false;
    if (b.status !== undefined) {
      if (!['received', 'pledged'].includes(b.status)) return res.status(400).json({ error: 'bad status' });
      sets.push('status = ?'); args.push(b.status);
      allocReceipt = (b.status === 'received' && !row.receipt_no);
    }
    if (!sets.length) return res.json(mapDonation(row));
    sets.push(`updated_at = datetime('now')`);

    // allocate the receipt number inside a retry loop (ux_donations_receipt hard-stop)
    let attempts = 0;
    while (true) {
      const s2 = sets.slice(), a2 = args.slice();
      if (allocReceipt) { s2.splice(s2.length - 1, 0, 'receipt_no = ?'); a2.push(await nextReceiptNo(b.date || row.date)); }
      a2.push(row.id);
      try { await run(`UPDATE donations SET ${s2.join(', ')} WHERE id = ?`, a2); break; }
      catch (e) {
        if (!allocReceipt || ++attempts >= 5) throw e;
        await new Promise(r => setTimeout(r, 15 + Math.floor(Math.random() * 40)));
      }
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'UPDATE', entityType: 'donation', entityId: row.code });
    res.json(mapDonation(await oneByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

/* POST /:id/certificate   — issue the appreciation certificate (allocates CERT-…) */
router.post('/:id/certificate', async (req, res, next) => {
  try {
    const row = await oneByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Donation not found' });
    if (row.cert_no) return res.json(mapDonation(row));   // idempotent
    let certNo, attempts = 0;
    while (true) {
      certNo = await nextCertNo(row.date);
      try {
        await run(`UPDATE donations SET cert_no = ?, certificate_issued = 1, updated_at = datetime('now') WHERE id = ? AND cert_no IS NULL`,
          [certNo, row.id]);
        break;
      } catch (e) {
        if (++attempts >= 5) throw e;
        await new Promise(r => setTimeout(r, 15 + Math.floor(Math.random() * 40)));
      }
    }
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'CERTIFY', entityType: 'donation', entityId: row.code, details: { certNo } });
    res.json(mapDonation(await oneByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await oneByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Donation not found' });
    await run(`UPDATE donations SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'DELETE', entityType: 'donation', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
