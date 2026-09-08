/* People registry glue — the devotee is the ONE person record every module
   links to. Committee members, team members, team leads and pooja sevarthis
   must all resolve to a `devotees` row (deduped by mobile) so the same person
   is never stored twice.  (BACKEND_PLAN.md §10.4 — universal person) */
const { queryOne, run } = require('../db/connection');
const { nextCode } = require('./entityCode');

const digits = (v) => String(v || '').replace(/\D/g, '');
const fullName = (first, last) => `${String(first || '').trim()} ${String(last || '').trim()}`.trim();

/**
 * Return the devotee id for this person, creating the devotee row if their
 * mobile is not already on file. Also backfills blank fields on an existing
 * devotee (city / samaj / name) so the master record stays complete.
 *
 * @returns {Promise<number|null>} devotee id, or null when there is nothing to
 *          key on (no mobile AND no name).
 */
async function ensureDevotee({ firstName, lastName, name, mobile, city, state, samaj, notes } = {}) {
  const mob = digits(mobile);
  const nm = (name && String(name).trim()) || fullName(firstName, lastName);

  if (mob) {
    const existing = await queryOne(
      'SELECT * FROM devotees WHERE mobile = ? AND is_deleted = 0 LIMIT 1', [mob]
    );
    if (existing) {
      // fill in anything we now know that was blank before
      const sets = [], args = [];
      if (!existing.name && nm) { sets.push('name = ?'); args.push(nm); }
      if (!existing.city && city) { sets.push('city = ?'); args.push(String(city).trim()); }
      if (!existing.samaj && samaj) { sets.push('samaj = ?'); args.push(String(samaj).trim()); }
      if (sets.length) {
        sets.push(`updated_at = datetime('now')`);
        args.push(existing.id);
        await run(`UPDATE devotees SET ${sets.join(', ')} WHERE id = ?`, args);
      }
      return existing.id;
    }
  }

  if (!nm && !mob) return null;   // nothing to identify the person by

  const code = await nextCode('devotee');
  const r = await run(
    `INSERT INTO devotees (code, name, mobile, city, state, samaj, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [code, nm || '(unnamed)', mob, String(city || '').trim(),
     String(state || 'Gujarat').trim(), String(samaj || '').trim(), String(notes || '').trim()]
  );
  return Number(r.lastInsertRowid);
}

module.exports = { ensureDevotee, digits, fullName };
