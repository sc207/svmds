/* People registry glue — the devotee is the ONE person record every module
   links to. Committee members, team members, team leads and pooja sevarthis
   must all resolve to a `devotees` row (deduped by mobile) so the same person
   is never stored twice.  (BACKEND_PLAN.md §10.4 — universal person) */
const { queryOne, run } = require('../db/connection');
const { nextCode } = require('./entityCode');

const digits = (v) => String(v || '').replace(/\D/g, '');
const fullName = (first, last) => `${String(first || '').trim()} ${String(last || '').trim()}`.trim();

/**
 * Return the devotee id for this person, reusing an existing row when we can
 * identify them (by mobile, or by exact name+city when there is no mobile) and
 * creating one otherwise. Blank fields on the reused row are backfilled so the
 * master record stays complete. Never returns null when a name is derivable.
 *
 * @returns {Promise<number|null>} devotee id, or null only when there is neither
 *          a name nor a mobile to key on.
 */
async function ensureDevotee({ firstName, lastName, name, mobile, city, state, notes } = {}) {
  const mob = digits(mobile);
  const nm = (name && String(name).trim()) || fullName(firstName, lastName);
  const cty = String(city || '').trim();

  async function backfill(existing) {
    const sets = [], args = [];
    if (!existing.name && nm) { sets.push('name = ?'); args.push(nm); }
    if (!existing.mobile && mob) { sets.push('mobile = ?'); args.push(mob); }
    if (!existing.city && cty) { sets.push('city = ?'); args.push(cty); }
    if (sets.length) {
      sets.push(`updated_at = datetime('now')`);
      args.push(existing.id);
      await run(`UPDATE devotees SET ${sets.join(', ')} WHERE id = ?`, args);
    }
    return existing.id;
  }
  const byMobile = () => mob
    ? queryOne('SELECT * FROM devotees WHERE mobile = ? AND is_deleted = 0 LIMIT 1', [mob])
    : Promise.resolve(null);
  const byNameCity = () => (!mob && nm && cty)
    ? queryOne(
        'SELECT * FROM devotees WHERE lower(trim(name)) = lower(trim(?)) AND lower(trim(city)) = lower(trim(?)) AND is_deleted = 0 LIMIT 1',
        [nm, cty])
    : Promise.resolve(null);

  let hit = await byMobile() || await byNameCity();
  if (hit) return backfill(hit);
  if (!nm && !mob) return null;   // nothing to identify the person by

  // a person that was soft-deleted (only possible once nothing referenced them)
  // and is now being re-added → revive the SAME devotee id, don't mint a new one.
  const dead = mob
    ? await queryOne('SELECT * FROM devotees WHERE mobile = ? AND is_deleted = 1 LIMIT 1', [mob])
    : (nm && cty
        ? await queryOne('SELECT * FROM devotees WHERE lower(trim(name)) = lower(trim(?)) AND lower(trim(city)) = lower(trim(?)) AND is_deleted = 1 LIMIT 1', [nm, cty])
        : null);
  if (dead) {
    await run(`UPDATE devotees SET is_deleted = 0, status = 'active', updated_at = datetime('now') WHERE id = ?`, [dead.id]);
    return backfill({ ...dead, is_deleted: 0 });
  }

  // create — if a partial UNIQUE index rejects a race, the row it collided with
  // now exists, so re-select and reuse it.
  try {
    const code = await nextCode('devotee');
    const r = await run(
      `INSERT INTO devotees (code, name, mobile, city, state, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [code, nm || '(unnamed)', mob, cty,
       String(state || 'Gujarat').trim(), String(notes || '').trim()]
    );
    return Number(r.lastInsertRowid);
  } catch (e) {
    hit = await byMobile() || await byNameCity();
    if (hit) return backfill(hit);
    throw e;
  }
}

/**
 * Put a devotee on a committee / team roster if they aren't already on it.
 * Used so a leader is always also a member of what they lead.
 * @param {'committee'|'team'} kind
 */
async function addAsMember({ kind, entityId, devoteeId, role }) {
  if (!devoteeId || !entityId) return;
  const table   = kind === 'committee' ? 'committee_members' : 'team_members';
  const col     = kind === 'committee' ? 'committee_id'      : 'team_id';
  const counter = kind === 'committee' ? 'committee_member'   : 'team_member';

  // one row per (entity, person): reactivate a soft-deleted link, never re-insert
  const prior = await queryOne(
    `SELECT id, is_deleted FROM ${table} WHERE ${col} = ? AND devotee_id = ? ORDER BY is_deleted ASC LIMIT 1`,
    [entityId, devoteeId]
  );
  if (prior && !prior.is_deleted) return;
  if (prior && prior.is_deleted) {
    await run(
      `UPDATE ${table} SET is_deleted = 0, role = COALESCE(NULLIF(?, ''), role), updated_at = datetime('now') WHERE id = ?`,
      [role || '', prior.id]
    );
    return;
  }

  const dev = await queryOne('SELECT * FROM devotees WHERE id = ?', [devoteeId]);
  if (!dev) return;
  const parts = String(dev.name || '').trim().split(/\s+/);
  const first = parts.shift() || dev.name || '';
  const code = await nextCode(counter);
  await run(
    `INSERT INTO ${table} (code, ${col}, devotee_id, first_name, last_name, mobile, city, state, role, status, notes, joined_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', '', date('now'))`,
    [code, entityId, devoteeId, first, parts.join(' '),
     dev.mobile || '', dev.city || '', dev.state || 'Gujarat', role || 'Member']
  );
}

module.exports = { ensureDevotee, addAsMember, digits, fullName };
