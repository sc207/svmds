/* Dhaja Pooja — campaigns (the February 108 + one occasion per special temple
   day) and the sponsorship register.

   A sponsorship is: a canonical devotee (services/people.ensureDevotee) -> a
   donor (services/donorStore.ensureDonorForDevotee) -> a cash `donations` row
   (category DCT-011 "Dhaja Pooja Seva", status received, REC-YYYY-N receipt via
   the existing retry loop) linked back here through dhaja_poojas.donation_id.
   The donation flows into every existing donation total / report / certificate
   path unchanged.

   Reads: any session. Writes: admin tier. Every write returns the fully
   hydrated row. (FEATURE_INTEGRATION.md — person = ensureDevotee, codes =
   nextCode, DB is the final safety layer.) */
const express = require('express');
const crypto = require('crypto');
const { queryAll, queryOne, run } = require('../db/connection');
const { requireRole } = require('../middleware/authz');
const { nextCode } = require('../services/entityCode');
const { nextReceiptNo } = require('../services/receiptNumber');
const { logAudit } = require('../services/audit');
const { ensureDevotee, digits } = require('../services/people');
const { ensureDonorForDevotee } = require('../services/donorStore');
const { getSettings } = require('../services/settingsStore');
const { mapAnnualEvent, mapDhajaCampaign, mapDhajaPooja } = require('../utils/mappers');

const router = express.Router();
const adminTier = requireRole('superadmin', 'admin');

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = () => 15 + Math.floor(Math.random() * 40);

/* ---------- shared SELECTs ---------- */
const CAMP_SELECT = `
  SELECT c.*, ae.code AS annual_event_code,
    (SELECT COUNT(*) FROM dhaja_poojas p
      WHERE p.campaign_id = c.id AND p.is_deleted = 0 AND p.status <> 'cancelled') AS sponsored_count,
    (SELECT COALESCE(SUM(CASE WHEN dn.amount > 0 THEN dn.amount ELSE dn.valuation END), 0)
       FROM dhaja_poojas p JOIN donations dn ON dn.id = p.donation_id
      WHERE p.campaign_id = c.id AND p.is_deleted = 0 AND p.status <> 'cancelled' AND dn.is_deleted = 0) AS raised_amount
  FROM dhaja_campaigns c
  LEFT JOIN annual_events ae ON ae.id = c.annual_event_id
  WHERE c.is_deleted = 0`;

const POOJA_SELECT = `
  SELECT dp.*, c.code AS campaign_code, d.code AS devotee_code,
         ae.code AS annual_event_code, dn.code AS donation_code, dn.receipt_no AS receipt_no
  FROM dhaja_poojas dp
  LEFT JOIN dhaja_campaigns c ON c.id = dp.campaign_id
  LEFT JOIN devotees d        ON d.id = dp.devotee_id
  LEFT JOIN annual_events ae  ON ae.id = dp.annual_event_id
  LEFT JOIN donations dn      ON dn.id = dp.donation_id
  WHERE dp.is_deleted = 0`;

function mapCamp(row) {
  return mapDhajaCampaign(row, {
    sponsoredCount: row.sponsored_count,
    raisedAmount: row.raised_amount,
    remaining: Number(row.target_count || 0) > 0
      ? Math.max(0, Number(row.target_count) - Number(row.sponsored_count || 0))
      : null,
  });
}

async function campaignByIdOrCode(v) {
  const rows = await queryAll(CAMP_SELECT + ' AND (c.id = ? OR c.code = ?) LIMIT 1', [v, v]);
  return rows[0] || null;
}
async function poojaByIdOrCode(v) {
  const rows = await queryAll(POOJA_SELECT + ' AND (dp.id = ? OR dp.code = ?) LIMIT 1', [v, v]);
  return rows[0] || null;
}
async function rawCampaign(id) {
  return queryOne('SELECT * FROM dhaja_campaigns WHERE id = ? AND is_deleted = 0', [id]);
}
async function liveCount(campaignId) {
  const r = await queryOne(
    `SELECT COUNT(*) AS n FROM dhaja_poojas
      WHERE campaign_id = ? AND is_deleted = 0 AND status <> 'cancelled'`, [campaignId]);
  return Number(r.n || 0);
}
/* close/reopen a bounded campaign to match its live count */
async function syncCampaignStatus(campaignId) {
  const c = await rawCampaign(campaignId);
  if (!c || !(Number(c.target_count) > 0)) return;
  const n = await liveCount(campaignId);
  if (n >= c.target_count && c.status !== 'closed') {
    await run(`UPDATE dhaja_campaigns SET status = 'closed', updated_at = datetime('now') WHERE id = ?`, [campaignId]);
  } else if (n < c.target_count && c.status === 'closed') {
    await run(`UPDATE dhaja_campaigns SET status = 'open', updated_at = datetime('now') WHERE id = ?`, [campaignId]);
  }
}
async function resolveAnnualEvent(v) {
  if (v == null || String(v).trim() === '') return null;
  return queryOne('SELECT * FROM annual_events WHERE (id = ? OR code = ?) AND is_deleted = 0',
    [parseInt(v, 10) || -1, String(v)]);
}

/* ============================================================ CAMPAIGNS */

router.get('/campaigns', async (req, res, next) => {
  try {
    const rows = await queryAll(CAMP_SELECT + ' ORDER BY c.created_at DESC');
    res.json(rows.map(mapCamp));
  } catch (e) { next(e); }
});

router.get('/campaigns/:id', async (req, res, next) => {
  try {
    const row = await campaignByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Campaign not found' });
    res.json(mapCamp(row));
  } catch (e) { next(e); }
});

/* POST /campaigns  { name, nameGu?, targetCount?, startDate?, endDate?, annualEventId? } */
router.post('/campaigns', adminTier, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const ae = await resolveAnnualEvent(b.annualEventId);
    if (b.annualEventId != null && String(b.annualEventId).trim() && !ae) {
      return res.status(400).json({ error: 'Unknown annualEventId' });
    }
    // one live campaign per annual event — the "Open Dhaja sponsorship" click is idempotent
    if (ae) {
      const existing = await queryAll(CAMP_SELECT + ' AND c.annual_event_id = ? ORDER BY c.created_at DESC LIMIT 1', [ae.id]);
      if (existing[0]) return res.status(200).json({ ...mapCamp(existing[0]), _deduped: true });
    }

    let startDate = ISO.test(b.startDate || '') ? b.startDate : null;
    if (!startDate && ae) {
      try {
        const yr = new Date().getFullYear();
        const resolved = mapAnnualEvent(ae, yr);
        if (resolved && ISO.test(resolved.gregorianDate || '')) startDate = resolved.gregorianDate;
      } catch (_) {}
    }
    const endDate = ISO.test(b.endDate || '') ? b.endDate : null;
    const target = Math.max(0, parseInt(b.targetCount, 10) || 0);

    const id = crypto.randomUUID();
    const code = await nextCode('dhaja_campaign');
    await run(
      `INSERT INTO dhaja_campaigns (id, code, name, name_gu, target_count, start_date, end_date, annual_event_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, String(b.nameGu || '').trim(), target, startDate, endDate, ae ? ae.id : null, String(b.notes || '').trim()]
    );
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Dhaja Pooja',
      action: 'CREATE', entityType: 'dhaja_campaign', entityId: code,
      details: { name, target, annualEvent: ae ? ae.code : null } });

    res.status(201).json(mapCamp(await campaignByIdOrCode(id)));
  } catch (e) { next(e); }
});

/* PATCH /campaigns/:id  { name?, nameGu?, targetCount?, status?, startDate?, endDate?, notes? } */
router.patch('/campaigns/:id', adminTier, async (req, res, next) => {
  try {
    const row = await campaignByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Campaign not found' });
    const b = req.body || {};
    const sets = [], args = [];

    if (typeof b.name === 'string' && b.name.trim()) { sets.push('name = ?'); args.push(b.name.trim()); }
    if (typeof b.nameGu === 'string') { sets.push('name_gu = ?'); args.push(b.nameGu.trim()); }
    if (typeof b.notes === 'string') { sets.push('notes = ?'); args.push(b.notes.trim()); }
    if (b.targetCount !== undefined) { sets.push('target_count = ?'); args.push(Math.max(0, parseInt(b.targetCount, 10) || 0)); }
    if (b.status !== undefined) {
      if (!['open', 'closed'].includes(b.status)) return res.status(400).json({ error: 'bad status' });
      sets.push('status = ?'); args.push(b.status);
    }
    for (const [k, col] of [['startDate', 'start_date'], ['endDate', 'end_date']]) {
      if (b[k] !== undefined) {
        if (b[k] !== null && b[k] !== '' && !ISO.test(b[k])) return res.status(400).json({ error: `${k} must be YYYY-MM-DD` });
        sets.push(`${col} = ?`); args.push(b[k] || null);
      }
    }
    if (!sets.length) return res.json(mapCamp(row));
    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE dhaja_campaigns SET ${sets.join(', ')} WHERE id = ?`, args);
    if (b.targetCount !== undefined) await syncCampaignStatus(row.id);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Dhaja Pooja',
      action: 'UPDATE', entityType: 'dhaja_campaign', entityId: row.code });
    res.json(mapCamp(await campaignByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/campaigns/:id', adminTier, async (req, res, next) => {
  try {
    const row = await campaignByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Campaign not found' });
    const kids = await queryAll(
      'SELECT id, code, donation_id FROM dhaja_poojas WHERE campaign_id = ? AND is_deleted = 0', [row.id]);
    if (kids.length && !req.query.force) {
      return res.status(409).json({ error: 'Campaign has sponsorships', count: kids.length });
    }
    for (const k of kids) {
      await run(`UPDATE dhaja_poojas SET is_deleted = 1, seq_no = NULL, updated_at = datetime('now') WHERE id = ?`, [k.id]);
      if (k.donation_id) {
        await run(`UPDATE donations SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [k.donation_id]);
        await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
          action: 'DELETE', entityType: 'donation', entityId: k.donation_id, details: { via: 'dhaja', dhaja: k.code } });
      }
    }
    await run(`UPDATE dhaja_campaigns SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Dhaja Pooja',
      action: 'DELETE', entityType: 'dhaja_campaign', entityId: row.code, details: { sponsorships: kids.length } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ============================================================ SPONSORSHIPS */

router.get('/', async (req, res, next) => {
  try {
    const where = [], args = [];
    if (req.query.campaignId) {
      where.push('(c.id = ? OR c.code = ?)'); args.push(req.query.campaignId, req.query.campaignId);
    }
    if (req.query.status) { where.push('dp.status = ?'); args.push(req.query.status); }
    if (req.query.q) {
      where.push('(dp.sponsor_name LIKE ? OR dp.sponsor_mobile LIKE ? OR dp.code LIKE ? OR dn.receipt_no LIKE ?)');
      const like = `%${req.query.q}%`;
      args.push(like, like, like, like);
    }
    const sql = POOJA_SELECT + (where.length ? ' AND ' + where.join(' AND ') : '') + ' ORDER BY dp.created_at DESC';
    const rows = await queryAll(sql, args);
    res.json(rows.map(mapDhajaPooja));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Sponsorship not found' });
    res.json(mapDhajaPooja(row));
  } catch (e) { next(e); }
});

async function resolveCategory() {
  return queryOne(
    `SELECT * FROM donation_categories WHERE (code = 'DCT-011' OR name = 'Dhaja Pooja Seva') AND is_deleted = 0 LIMIT 1`);
}

/* POST /
   { campaignId? | annualEventId?, devoteeId? | firstName,lastName,mobile,city,state?,
     amount, date?, scheduledDate?, notes? } */
router.post('/', adminTier, async (req, res, next) => {
  try {
    const b = req.body || {};
    const amount = Number(b.amount || 0);
    if (!(amount > 0)) return res.status(400).json({ error: 'amount must be > 0' });

    const settings = await getSettings();
    const date = ISO.test(b.date || '') ? b.date : settings.workingDate;

    /* 1 — campaign */
    let campaign = null;
    if (b.campaignId != null && String(b.campaignId).trim()) {
      campaign = await rawCampaign(
        (await queryOne('SELECT id FROM dhaja_campaigns WHERE (id = ? OR code = ?) AND is_deleted = 0',
          [String(b.campaignId), String(b.campaignId)]) || {}).id || -1);
    } else if (b.annualEventId != null && String(b.annualEventId).trim()) {
      const ae = await resolveAnnualEvent(b.annualEventId);
      if (ae) {
        const c = await queryOne(
          `SELECT * FROM dhaja_campaigns WHERE annual_event_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1`,
          [ae.id]);
        campaign = c || null;
      }
    }
    if (!campaign) return res.status(400).json({ error: 'unknown campaign' });
    if (campaign.status === 'closed') return res.status(409).json({ error: 'This dhaja campaign is closed', closed: true });

    /* 2 — person (never INSERT INTO devotees here) */
    let devoteeId;
    if (b.devoteeId != null && String(b.devoteeId).trim()) {
      const d = await queryOne('SELECT id FROM devotees WHERE (id = ? OR code = ?) AND is_deleted = 0',
        [parseInt(b.devoteeId, 10) || -1, String(b.devoteeId)]);
      if (!d) return res.status(400).json({ error: 'That devotee no longer exists' });
      devoteeId = d.id;
    } else {
      const mob = digits(b.mobile);
      if (mob && mob.length !== 10) return res.status(400).json({ error: 'mobile must be 10 digits' });
      devoteeId = await ensureDevotee({
        firstName: b.firstName, lastName: b.lastName, name: b.name,
        mobile: mob, city: b.city, state: b.state, samaj: b.committee,
      });
      if (!devoteeId) return res.status(400).json({ error: 'a name or mobile is required' });
    }

    /* 3 — donor + category + snapshot */
    const donor = await ensureDonorForDevotee(devoteeId);
    const cat = await resolveCategory();
    if (!cat) return res.status(500).json({ error: 'Dhaja Pooja Seva donation category missing — run npm run seed' });
    const devRow = await queryOne('SELECT name, mobile FROM devotees WHERE id = ?', [devoteeId]);
    const sponsorName = (devRow && devRow.name && devRow.name !== '(unnamed)')
      ? devRow.name
      : `${String(b.firstName || '').trim()} ${String(b.lastName || '').trim()}`.trim() || 'Dhaja Pooja';
    const sponsorMobile = (devRow && devRow.mobile) || digits(b.mobile);
    const scheduledDate = ISO.test(b.scheduledDate || '') ? b.scheduledDate
      : (ISO.test(campaign.start_date || '') ? campaign.start_date : null);

    /* 4 — own a seq number (ux_dhaja_seq is the hard stop) */
    const dhajaId = crypto.randomUUID();
    const dhajaCode = await nextCode('dhaja_pooja');
    let seqNo = null, attempts = 0;
    while (true) {
      const r = await queryOne(
        `SELECT COALESCE(MAX(seq_no), 0) + 1 AS next FROM dhaja_poojas
          WHERE campaign_id = ? AND is_deleted = 0 AND status <> 'cancelled'`, [campaign.id]);
      seqNo = Number(r.next);
      if (Number(campaign.target_count) > 0 && seqNo > Number(campaign.target_count)) {
        await run(`UPDATE dhaja_campaigns SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND status <> 'closed'`,
          [campaign.id]);
        return res.status(409).json({ error: 'This dhaja campaign is already full', full: true });
      }
      try {
        await run(
          `INSERT INTO dhaja_poojas
             (id, code, campaign_id, seq_no, devotee_id, sponsor_name, sponsor_mobile,
              annual_event_id, scheduled_date, pledge_amount, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sponsored', ?)`,
          [dhajaId, dhajaCode, campaign.id, seqNo, devoteeId, sponsorName, sponsorMobile,
           campaign.annual_event_id, scheduledDate, amount, String(b.notes || '').trim()]
        );
        break;
      } catch (e) {
        if (++attempts >= 8) throw e;
        await sleep(jitter());
      }
    }

    /* 5 — the cash donation (existing receipt retry loop, ux_donations_receipt) */
    const donId = crypto.randomUUID();
    const donCode = await nextCode('donation');
    const purpose = `Dhaja Pooja #${seqNo} — ${campaign.name}`;
    const recordedBy = req.user.email || String(req.user.id);
    let rAttempts = 0;
    while (true) {
      const receiptNo = await nextReceiptNo(date);
      try {
        await run(
          `INSERT INTO donations
             (id, code, receipt_no, donor_id, category_id, mode, amount, item, qty, valuation,
              date, purpose, committee, status, notes, recorded_by)
           VALUES (?, ?, ?, ?, ?, 'Cash', ?, '', '', 0, ?, ?, ?, 'received', ?, ?)`,
          [donId, donCode, receiptNo, donor.id, cat.id, amount, date, purpose,
           donor.committee || '', String(b.notes || '').trim(), recordedBy]
        );
        break;
      } catch (e) {
        if (++rAttempts >= 5) throw e;
        await sleep(jitter());
      }
    }

    /* 6 — link + auto-close */
    await run(`UPDATE dhaja_poojas SET donation_id = ?, updated_at = datetime('now') WHERE id = ?`, [donId, dhajaId]);
    await syncCampaignStatus(campaign.id);

    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Dhaja Pooja',
      action: 'CREATE', entityType: 'dhaja_pooja', entityId: dhajaCode,
      details: { campaign: campaign.code, seq: seqNo, donation: donCode, amount } });
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
      action: 'CREATE', entityType: 'donation', entityId: donCode, details: { via: 'dhaja', dhaja: dhajaCode } });

    res.status(201).json(mapDhajaPooja(await poojaByIdOrCode(dhajaId)));
  } catch (e) { next(e); }
});

/* PATCH /:id  { status?, performedDate?, scheduledDate?, notes? } */
router.patch('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Sponsorship not found' });
    const b = req.body || {};
    const sets = [], args = [];
    let cancelling = false;

    if (b.status !== undefined) {
      if (!['reserved', 'sponsored', 'performed', 'cancelled'].includes(b.status)) {
        return res.status(400).json({ error: 'bad status' });
      }
      sets.push('status = ?'); args.push(b.status);
      cancelling = b.status === 'cancelled' && row.status !== 'cancelled';
      if (cancelling) { sets.push('seq_no = NULL'); }
      if (b.status === 'performed' && !row.performed_date && !b.performedDate) {
        const s = await getSettings();
        sets.push('performed_date = ?'); args.push(s.workingDate);
      }
    }
    for (const [k, col] of [['performedDate', 'performed_date'], ['scheduledDate', 'scheduled_date']]) {
      if (b[k] !== undefined) {
        if (b[k] !== null && b[k] !== '' && !ISO.test(b[k])) return res.status(400).json({ error: `${k} must be YYYY-MM-DD` });
        sets.push(`${col} = ?`); args.push(b[k] || null);
      }
    }
    if (typeof b.notes === 'string') { sets.push('notes = ?'); args.push(b.notes.trim()); }
    if (!sets.length) return res.json(mapDhajaPooja(row));
    sets.push(`updated_at = datetime('now')`);
    args.push(row.id);
    await run(`UPDATE dhaja_poojas SET ${sets.join(', ')} WHERE id = ?`, args);

    if (cancelling && row.donation_id) {
      await run(`UPDATE donations SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.donation_id]);
      await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
        action: 'DELETE', entityType: 'donation', entityId: row.donation_code || row.donation_id,
        details: { via: 'dhaja', dhaja: row.code } });
    }
    if (row.campaign_id) await syncCampaignStatus(row.campaign_id);

    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Dhaja Pooja',
      action: 'UPDATE', entityType: 'dhaja_pooja', entityId: row.code, details: b.status ? { status: b.status } : undefined });
    res.json(mapDhajaPooja(await poojaByIdOrCode(row.id)));
  } catch (e) { next(e); }
});

router.delete('/:id', adminTier, async (req, res, next) => {
  try {
    const row = await poojaByIdOrCode(req.params.id);
    if (!row) return res.status(404).json({ error: 'Sponsorship not found' });
    await run(`UPDATE dhaja_poojas SET is_deleted = 1, seq_no = NULL, updated_at = datetime('now') WHERE id = ?`, [row.id]);
    if (row.donation_id) {
      await run(`UPDATE donations SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`, [row.donation_id]);
      await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Donations',
        action: 'DELETE', entityType: 'donation', entityId: row.donation_code || row.donation_id,
        details: { via: 'dhaja', dhaja: row.code } });
    }
    if (row.campaign_id) await syncCampaignStatus(row.campaign_id);
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Dhaja Pooja',
      action: 'DELETE', entityType: 'dhaja_pooja', entityId: row.code });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
