/* Donor registry glue — find-or-create the ONE `donors` row for a canonical
   devotee, so any module that needs an 80G receipt (donations) can attach one
   without re-implementing donor dedupe.

   Mirrors the individual-donor path in routes/donors.js POST /:
     1. a live donor already linked to this devotee            -> reuse
     2. else a live donor with the devotee's mobile            -> adopt the link
     3. else INSERT a new individual donor (nextCode('donor')) -> on a UNIQUE
        race (ux_donors_mobile), re-select the winner and reuse it.
   Never returns null — throws only if the devotee id is unknown. */
const { queryOne, run } = require('../db/connection');
const { nextCode } = require('./entityCode');

const digits = (v) => String(v || '').replace(/\D/g, '');

async function ensureDonorForDevotee(devoteeId) {
  const id = parseInt(devoteeId, 10);
  const dev = id ? await queryOne('SELECT * FROM devotees WHERE id = ? AND is_deleted = 0', [id]) : null;
  if (!dev) throw new Error('ensureDonorForDevotee: no such devotee ' + devoteeId);

  let d = await queryOne('SELECT * FROM donors WHERE devotee_id = ? AND is_deleted = 0', [dev.id]);
  if (d) return d;

  const mob = digits(dev.mobile);
  if (mob) {
    d = await queryOne('SELECT * FROM donors WHERE mobile = ? AND is_deleted = 0', [mob]);
    if (d) {
      if (!d.devotee_id) {
        await run(`UPDATE donors SET devotee_id = ?, updated_at = datetime('now') WHERE id = ?`, [dev.id, d.id]);
        d.devotee_id = dev.id;
      }
      return d;
    }
  }

  const parts = String(dev.name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() || dev.name || 'Devotee';
  const last = parts.join(' ');

  try {
    const code = await nextCode('donor');
    const r = await run(
      `INSERT INTO donors (code, type, first_name, last_name, mobile, city, state, committee, devotee_id, added_date)
       VALUES (?, 'individual', ?, ?, ?, ?, ?, ?, ?, date('now'))`,
      [code, first, last, mob, dev.city || '', dev.state || 'Gujarat', '', dev.id]
    );
    return await queryOne('SELECT * FROM donors WHERE id = ?', [r.lastInsertRowid]);
  } catch (e) {
    d = await queryOne('SELECT * FROM donors WHERE devotee_id = ? AND is_deleted = 0', [dev.id])
      || (mob ? await queryOne('SELECT * FROM donors WHERE mobile = ? AND is_deleted = 0', [mob]) : null);
    if (d) return d;
    throw e;
  }
}

module.exports = { ensureDonorForDevotee };
