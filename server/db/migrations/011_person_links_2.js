/* ============================================================
   011_person_links_2.js  —  imperative, deterministic, STRICT

   Part 1 of the "canonical person + real relationships" refactor
   (see .claude/plans/pooja-module-is-basically-cheerful-lobster.md).

   What it does, in order:
     A. additive columns  donations.recorded_by_user_id, visits.escort_team_id
     B. read-only validation + single-match resolution:
          donations.recorded_by  -> the ONE live user (name / email local-part)
          visits.escort_team     -> the ONE live team (name)
          devotees.samaj         -> the ONE committee (name / samaj label)
        0 or >1 match for recorded_by / escort_team  -> leave the FK NULL (text kept)
        0 or >1 match for a devotees.samaj value     -> MIGRATION FAILS (nothing lost)
     C. idempotent writes: backfill the two FKs; ensure a committee_members row
        for each matched samaj (reactivate-or-insert, mirroring
        routes/committees.js POST /:id/members); blank the migrated devotees.samaj;
        merge donor rows that share a devotee_id (repoint donations.donor_id).
     D. create ux_donors_devotee and re-assert the person-integrity ux_* this
        migration depends on — CREATE, then VERIFY it persisted, else THROW.

   FAIL-HARD: any throw here aborts runMigrations() (process exits non-zero) and
   schema_migrations is NOT written, so the next boot re-runs 011 in full. Every
   write is idempotent (WHERE-guarded / reactivate), so a re-run after a human
   fixes the data completes cleanly. Turso has no session BEGIN/COMMIT, so
   "validate before writing" + idempotency is the rollback-equivalent guarantee.

   This migration does NOT call repairDatabase(); repair.js stays the separate
   `npm run db:repair` maintenance tool.
   ============================================================ */
const { nextCode } = require('../../services/entityCode');

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
function core(s) {
  let n = norm(s), prev;
  do { prev = n; n = n.replace(/\s+(temple|samaj|committee|mandal|group)$/, ''); } while (n !== prev);
  return n.trim();
}
function pushMap(m, k, v) { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
function only(arr) { return arr && arr.length === 1 ? arr[0] : null; }

async function hasColumn(queryAll, table, col) {
  const rows = await queryAll(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === col);
}
async function indexExists(queryOne, name) {
  return !!(await queryOne(`SELECT 1 AS x FROM sqlite_master WHERE type = 'index' AND name = ?`, [name]));
}

module.exports.up = async function up({ queryAll, queryOne, run, runBatch }) {
  await require('../seed/platform').seedPlatform(); // counters (nextCode) must exist

  /* ---------- Phase A: additive columns (idempotent) ---------- */
  if (!(await hasColumn(queryAll, 'donations', 'recorded_by_user_id'))) {
    await run('ALTER TABLE donations ADD COLUMN recorded_by_user_id INTEGER REFERENCES users(id)');
  }
  if (!(await hasColumn(queryAll, 'visits', 'escort_team_id'))) {
    await run('ALTER TABLE visits ADD COLUMN escort_team_id INTEGER REFERENCES teams(id)');
  }

  /* ---------- Phase B: read-only validation ---------- */
  // users: name / email-local-part -> [id]
  const users = await queryAll(`SELECT id, name, email FROM users WHERE is_deleted = 0`);
  const uByName = new Map(), uByLocal = new Map();
  for (const u of users) {
    pushMap(uByName, norm(u.name), u.id);
    pushMap(uByLocal, norm(String(u.email || '').split('@')[0]), u.id);
  }

  // teams: name -> [id]
  const teams = await queryAll(`SELECT id, name FROM teams WHERE is_deleted = 0`);
  const tByName = new Map();
  for (const t of teams) pushMap(tByName, norm(t.name), t.id);

  // committees: every normalised/core form of name & samaj -> [id]
  const committees = await queryAll(`SELECT id, code, name, samaj FROM committees WHERE is_deleted = 0`);
  const cForms = new Map();
  for (const c of committees) {
    for (const f of new Set([norm(c.name), norm(c.samaj), core(c.name), core(c.samaj)])) {
      pushMap(cForms, f, c.id);
    }
  }
  const matchCommittee = (text) => {
    const ids = new Set([...(cForms.get(norm(text)) || []), ...(cForms.get(core(text)) || [])]);
    return ids.size === 1 ? [...ids][0] : null;
  };

  // recorded_by -> user (single match only; else leave NULL)
  const recRows = await queryAll(
    `SELECT id, recorded_by FROM donations
     WHERE COALESCE(recorded_by, '') <> '' AND recorded_by_user_id IS NULL AND is_deleted = 0`
  );
  const recFix = [];
  for (const d of recRows) {
    const k = norm(d.recorded_by);
    const uid = only(uByName.get(k)) || only(uByLocal.get(k));
    if (uid) recFix.push([uid, d.id]);
  }

  // escort_team -> team (single match only; else leave NULL, text kept)
  const escRows = await queryAll(
    `SELECT id, escort_team FROM visits
     WHERE COALESCE(escort_team, '') <> '' AND escort_team_id IS NULL AND is_deleted = 0`
  );
  const escFix = [];
  for (const v of escRows) {
    const tid = only(tByName.get(norm(v.escort_team)));
    if (tid) escFix.push([tid, v.id]);
  }

  // devotees.samaj -> committee (single match REQUIRED; else the migration fails)
  const samajRows = await queryAll(
    `SELECT id, code, name, mobile, city, state, samaj FROM devotees
     WHERE is_deleted = 0 AND COALESCE(samaj, '') <> ''`
  );
  const samajMigrate = [];      // { dev, committeeId }
  const samajUnmatched = [];    // { code, samaj }
  for (const dev of samajRows) {
    const cid = matchCommittee(dev.samaj);
    if (cid) samajMigrate.push({ dev, committeeId: cid });
    else samajUnmatched.push({ code: dev.code || dev.id, samaj: dev.samaj });
  }
  if (samajUnmatched.length) {
    const list = samajUnmatched.slice(0, 20).map((s) => `${s.code}="${s.samaj}"`).join(', ');
    throw new Error(
      `011: ${samajUnmatched.length} devotees.samaj value(s) match 0 or >1 committees: ${list}. ` +
      `Fix the samaj text or add the missing committee (on a copy of the DB), then redeploy.`
    );
  }

  /* ---------- Phase C: idempotent writes ---------- */
  const writes = [];
  for (const [uid, id] of recFix) {
    writes.push({ sql: `UPDATE donations SET recorded_by_user_id = ? WHERE id = ? AND recorded_by_user_id IS NULL`, args: [uid, id] });
  }
  for (const [tid, id] of escFix) {
    writes.push({ sql: `UPDATE visits SET escort_team_id = ? WHERE id = ? AND escort_team_id IS NULL`, args: [tid, id] });
  }
  if (writes.length) await runBatch(writes);

  // samaj -> committee_members (reactivate-or-insert), then blank devotees.samaj
  let membersCreated = 0, membersReactivated = 0, samajCleared = 0;
  for (const { dev, committeeId } of samajMigrate) {
    const prior = await queryOne(
      `SELECT id, is_deleted FROM committee_members
       WHERE committee_id = ? AND devotee_id = ? ORDER BY is_deleted ASC LIMIT 1`,
      [committeeId, dev.id]
    );
    if (prior && !prior.is_deleted) {
      // already a member — nothing to do
    } else if (prior && prior.is_deleted) {
      await run(
        `UPDATE committee_members SET is_deleted = 0, status = 'active', updated_at = datetime('now') WHERE id = ?`,
        [prior.id]
      );
      membersReactivated++;
    } else {
      const parts = String(dev.name || '').trim().split(/\s+/);
      const first = parts.shift() || '';
      const last = parts.join(' ');
      const code = await nextCode('committee_member');
      await run(
        `INSERT INTO committee_members
           (code, committee_id, devotee_id, first_name, last_name, mobile, city, state, role, status, notes, joined_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Member', 'active', '', date('now'))`,
        [code, committeeId, dev.id, first, last, dev.mobile || '', dev.city || '', dev.state || 'Gujarat']
      );
      membersCreated++;
    }
    const r = await run(
      `UPDATE devotees SET samaj = '', updated_at = datetime('now')
       WHERE id = ? AND COALESCE(samaj, '') <> ''`,
      [dev.id]
    );
    samajCleared += (r && r.changes) || 0;
  }

  // merge donor rows sharing a devotee_id (keep MIN(id), repoint donations)
  const donorDupes = await queryAll(
    `SELECT devotee_id AS did, MIN(id) AS keep, COUNT(*) AS n
     FROM donors WHERE devotee_id IS NOT NULL AND is_deleted = 0
     GROUP BY devotee_id HAVING COUNT(*) > 1`
  );
  let donorsMerged = 0;
  for (const g of donorDupes) {
    const rows = await queryAll(
      `SELECT id FROM donors WHERE devotee_id = ? AND is_deleted = 0 ORDER BY id`, [g.did]
    );
    for (const r of rows) {
      if (r.id === g.keep) continue;
      await run(`UPDATE donations SET donor_id = ? WHERE donor_id = ?`, [g.keep, r.id]);
      await run(
        `UPDATE donors SET is_deleted = 1, updated_at = datetime('now'),
           notes = TRIM(COALESCE(notes, '') || ' [merged into donor id ${g.keep} by 011]')
         WHERE id = ?`,
        [r.id]
      );
      donorsMerged++;
    }
  }

  /* ---------- Phase D: required constraints (create -> verify -> or THROW) ---------- */
  const REQUIRED = [
    ['ux_donors_devotee',
     `CREATE UNIQUE INDEX IF NOT EXISTS ux_donors_devotee ON donors(devotee_id) WHERE devotee_id IS NOT NULL AND is_deleted = 0`,
     `SELECT devotee_id AS k FROM donors WHERE devotee_id IS NOT NULL AND is_deleted = 0 GROUP BY devotee_id HAVING COUNT(*) > 1`],
    ['ux_committee_members_cd',
     `CREATE UNIQUE INDEX IF NOT EXISTS ux_committee_members_cd ON committee_members(committee_id, devotee_id) WHERE devotee_id IS NOT NULL AND is_deleted = 0`,
     `SELECT committee_id || ':' || devotee_id AS k FROM committee_members WHERE devotee_id IS NOT NULL AND is_deleted = 0 GROUP BY committee_id, devotee_id HAVING COUNT(*) > 1`],
    ['ux_devotees_mobile',
     `CREATE UNIQUE INDEX IF NOT EXISTS ux_devotees_mobile ON devotees(mobile) WHERE mobile <> '' AND is_deleted = 0`,
     `SELECT mobile AS k FROM devotees WHERE mobile <> '' AND is_deleted = 0 GROUP BY mobile HAVING COUNT(*) > 1`],
    ['ux_users_devotee',
     `CREATE UNIQUE INDEX IF NOT EXISTS ux_users_devotee ON users(devotee_id) WHERE devotee_id IS NOT NULL AND is_deleted = 0`,
     `SELECT devotee_id AS k FROM users WHERE devotee_id IS NOT NULL AND is_deleted = 0 GROUP BY devotee_id HAVING COUNT(*) > 1`],
  ];
  const idxCreated = [], idxExisting = [];
  for (const [name, createSql, checkSql] of REQUIRED) {
    if (await indexExists(queryOne, name)) { idxExisting.push(name); continue; }
    const bad = await queryAll(checkSql);
    if (bad.length) {
      const keys = bad.slice(0, 10).map((r) => r.k).join(', ');
      throw new Error(
        `011: cannot create ${name} — ${bad.length} duplicate key(s): ${keys}. ` +
        `Dedupe (run \`npm run db:repair\` on a copy of the DB), then redeploy.`
      );
    }
    await run(createSql);
    if (!(await indexExists(queryOne, name))) {
      throw new Error(`011: ${name} did not persist after CREATE.`);
    }
    idxCreated.push(name);
  }

  console.log(
    `  · 011 person-links-2: recorded_by ${recFix.length}, escort_team ${escFix.length}, ` +
    `samaj→member ${membersCreated}c/${membersReactivated}r (${samajCleared} cleared), ` +
    `donors merged ${donorsMerged}; indexes ${idxCreated.length ? 'created [' + idxCreated.join(', ') + ']' : 'created 0'}` +
    (idxExisting.length ? `, present [${idxExisting.join(', ')}]` : '')
  );
};
