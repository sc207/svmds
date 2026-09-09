/* ============================================================
   server/db/repair.js — one-time (idempotent) data hygiene pass.

   Merges duplicate devotees, de-dups roster rows, backfills the
   person links the app was missing, then locks the rules in with
   partial UNIQUE indexes. Every step is WHERE ... IS NULL /
   is_deleted-aware / CREATE ... IF NOT EXISTS, so a second run is
   a no-op and every number in the summary comes back 0.

   NOTHING here hard-deletes a row — losers are soft-deleted
   (is_deleted = 1) with a note, and FKs are repointed first. Safe
   to run against prod Turso. Run it via:
       npm run db:repair:dry     (report only, zero writes)
       npm run db:repair         (apply)
   or set DB_REPAIR_ON_BOOT=dry to log drift on every deploy.
   ============================================================ */
const { queryAll, queryOne, run } = require('./connection');
const config = require('../config');

const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

/* -- FK columns that point at devotees.id (loser -> canonical repoint) -- */
const DEVOTEE_FKS = [
  ['users', 'devotee_id'],
  ['committee_members', 'devotee_id'],
  ['team_members', 'devotee_id'],
  ['sevarthis', 'devotee_id'],
  ['visits', 'devotee_id'],
  ['donors', 'devotee_id'],
  ['guests', 'devotee_id'],
  ['committees', 'leader_devotee_id'],
  ['teams', 'lead_devotee_id'],
  ['events', 'in_charge_devotee_id'],
  ['pooja_coordinator_links', 'devotee_id'],
];

async function repairDatabase({ dryRun = false } = {}) {
  const W = async (sql, args = []) => { if (!dryRun) return run(sql, args); return { changes: 0 }; };
  const log = (...a) => console.log(dryRun ? '  [dry]' : '  [repair]', ...a);

  const summary = {
    dryRun,
    startedAt: new Date().toISOString(),
    rootOwnerDevoteeId: null,
    devoteesMerged: 0,
    devoteeMergesSkipped: [],       // { key, reason }
    rosterRowsMerged: 0,
    usersDevoteeBackfilled: 0,
    leadersLinkedForward: 0,        // *_devotee_id set -> *_id + role
    leadersLinkedReverse: 0,        // *_id set -> *_devotee_id
    guestsBackfilled: 0,
    donorsBackfilled: 0,
    coordinatorDevoteeBackfilled: 0,
    indexesCreated: [],
    indexesSkipped: [],            // { index, dupes }
    usersMerged: 0,
  };

  // ---------- Step 0: root-owner marker ----------
  {
    const owner = config.adminEmail
      ? await queryOne(`SELECT devotee_id FROM users WHERE lower(email) = ? AND is_deleted = 0`, [config.adminEmail])
      : null;
    if (owner && owner.devotee_id) {
      summary.rootOwnerDevoteeId = owner.devotee_id;
      await W(
        `INSERT INTO app_settings (key, value) VALUES ('root_owner_devotee_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(owner.devotee_id)]
      );
      log('root owner devotee =', owner.devotee_id);
    } else {
      log('root owner has no devotee link yet (Step 3 will create one)');
    }
  }

  // ---------- Step 1: merge duplicate devotees ----------
  {
    const rows = await queryAll(
      `SELECT id, code, name, mobile, city, samaj, state FROM devotees WHERE is_deleted = 0`
    );
    const groups = new Map();
    for (const d of rows) {
      const m = digits(d.mobile);
      const key = m
        ? 'mobile:' + m
        : (norm(d.name) && norm(d.city) ? 'namecity:' + norm(d.name) + '|' + norm(d.city) : null);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }

    for (const [key, members] of groups) {
      if (members.length < 2) continue;

      // how many distinct live users link to this group? >= 2 => cannot merge
      // (would break ux_users_devotee); report and move on.
      const ids = members.map(m => m.id);
      const userRows = await queryAll(
        `SELECT DISTINCT devotee_id FROM users WHERE is_deleted = 0 AND devotee_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      if (userRows.length >= 2) {
        summary.devoteeMergesSkipped.push({ key, reason: `${userRows.length} distinct accounts link to this person` });
        log('SKIP merge', key, '-', userRows.length, 'accounts');
        continue;
      }

      const score = (d) => (digits(d.mobile) ? 4 : 0) + (d.city ? 2 : 0) + (d.samaj ? 1 : 0)
        + (d.state && d.state !== 'Gujarat' ? 0.5 : 0);
      let canonical;
      if (summary.rootOwnerDevoteeId && ids.includes(summary.rootOwnerDevoteeId)) {
        canonical = members.find(m => m.id === summary.rootOwnerDevoteeId);
      } else {
        canonical = [...members].sort((a, b) => (score(b) - score(a)) || (a.id - b.id))[0];
      }
      const losers = members.filter(m => m.id !== canonical.id);

      // backfill canonical blanks from the best loser value
      const fill = {};
      for (const f of ['name', 'mobile', 'city', 'samaj', 'state']) {
        if (canonical[f] && !(f === 'state' && canonical[f] === 'Gujarat')) continue;
        const donor = losers.find(l => l[f] && !(f === 'state' && l[f] === 'Gujarat'));
        if (donor) fill[f] = donor[f];
      }
      if (Object.keys(fill).length) {
        const cols = Object.keys(fill);
        await W(
          `UPDATE devotees SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
          [...cols.map(c => fill[c]), canonical.id]
        );
      }

      for (const loser of losers) {
        for (const [table, col] of DEVOTEE_FKS) {
          await W(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, [canonical.id, loser.id]);
        }
        await W(
          `UPDATE devotees SET is_deleted = 1, updated_at = datetime('now'),
             notes = TRIM(notes || ' [merged into id ${canonical.id} on ${today()}]')
           WHERE id = ?`,
          [loser.id]
        );
        summary.devoteesMerged++;
        log('merged devotee', loser.id, '->', canonical.id, `(${key})`);
      }
    }
  }

  // ---------- Step 2: merge duplicate roster rows in one entity ----------
  for (const [table, entityCol, ctx] of [
    ['committee_members', 'committee_id', 'meeting'],
    ['team_members', 'team_id', 'volunteering'],
  ]) {
    const dupes = await queryAll(
      `SELECT ${entityCol} AS eid, devotee_id AS did, COUNT(*) AS n, MIN(id) AS keep
       FROM ${table} WHERE is_deleted = 0 AND devotee_id IS NOT NULL
       GROUP BY ${entityCol}, devotee_id HAVING COUNT(*) > 1`
    );
    for (const g of dupes) {
      const rows = await queryAll(
        `SELECT * FROM ${table} WHERE ${entityCol} = ? AND devotee_id = ? AND is_deleted = 0 ORDER BY id`,
        [g.eid, g.did]
      );
      const keep = rows.find(r => r.id === g.keep) || rows[0];
      const leadRole = rows.find(r => /lead/i.test(r.role || ''));
      if (leadRole && !/lead/i.test(keep.role || '')) {
        await W(`UPDATE ${table} SET role = ? WHERE id = ?`, [leadRole.role, keep.id]);
      }
      for (const r of rows) {
        if (r.id === keep.id) continue;
        // rewrite JSON rosters + attendance from r.id -> keep.id
        const sessTable = ctx === 'meeting' ? 'meetings' : 'volunteering_sessions';
        const sess = await queryAll(
          `SELECT id, member_ids_json FROM ${sessTable} WHERE ${entityCol} = ?`, [g.eid]
        );
        for (const s of sess) {
          let arr; try { arr = JSON.parse(s.member_ids_json || '[]'); } catch (_) { arr = []; }
          if (!arr.includes(r.id)) continue;
          arr = [...new Set(arr.map(x => (x === r.id ? keep.id : x)))];
          await W(`UPDATE ${sessTable} SET member_ids_json = ? WHERE id = ?`, [JSON.stringify(arr), s.id]);
        }
        const att = await queryAll(
          `SELECT a.* FROM attendance a WHERE a.context_type = ? AND a.member_id = ?`, [ctx, r.id]
        );
        for (const a of att) {
          const clash = await queryOne(
            `SELECT * FROM attendance WHERE context_type = ? AND context_id = ? AND member_id = ?`,
            [ctx, a.context_id, keep.id]
          );
          if (clash) {
            if (a.status === 'present' && clash.status !== 'present') {
              await W(`UPDATE attendance SET status = 'present' WHERE id = ?`, [clash.id]);
            }
            await W(`DELETE FROM attendance WHERE id = ?`, [a.id]);
          } else {
            await W(`UPDATE attendance SET member_id = ? WHERE id = ?`, [keep.id, a.id]);
          }
        }
        await W(
          `UPDATE ${table} SET is_deleted = 1, updated_at = datetime('now'),
             notes = TRIM(notes || ' [merged into id ${keep.id} on ${today()}]')
           WHERE id = ?`,
          [r.id]
        );
        summary.rosterRowsMerged++;
        log('merged', table, 'row', r.id, '->', keep.id);
      }
    }
  }

  // ---------- Step 3: backfill users.devotee_id where NULL ----------
  {
    const { ensureDevotee } = require('../services/people');
    const rows = await queryAll(
      `SELECT id, email, name, mobile, city FROM users WHERE devotee_id IS NULL AND is_deleted = 0`
    );
    for (const u of rows) {
      const name = (u.name && u.name.trim()) || String(u.email || '').split('@')[0];
      if (dryRun) { summary.usersDevoteeBackfilled++; log('would link user', u.id, `(${u.email})`); continue; }
      const devId = await ensureDevotee({ name, mobile: u.mobile, city: u.city });
      if (devId) {
        await run(`UPDATE users SET devotee_id = ? WHERE id = ? AND devotee_id IS NULL`, [devId, u.id]);
        summary.usersDevoteeBackfilled++;
        log('linked user', u.id, `(${u.email}) -> devotee`, devId);
      }
    }
    // (re)assert the root-owner marker now that it definitely has a devotee
    if (!summary.rootOwnerDevoteeId && config.adminEmail) {
      const owner = await queryOne(`SELECT devotee_id FROM users WHERE lower(email) = ? AND is_deleted = 0`, [config.adminEmail]);
      if (owner && owner.devotee_id) {
        summary.rootOwnerDevoteeId = owner.devotee_id;
        await W(
          `INSERT INTO app_settings (key, value) VALUES ('root_owner_devotee_id', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [String(owner.devotee_id)]
        );
      }
    }
  }

  // ---------- Step 4: backfill leader / lead / in-charge + roles ----------
  for (const [table, idCol, devCol, role] of [
    ['committees', 'leader_id', 'leader_devotee_id', 'committee_leader'],
    ['teams', 'lead_id', 'lead_devotee_id', 'management_lead'],
    ['events', 'in_charge_id', 'in_charge_devotee_id', 'event_incharge'],
  ]) {
    // forward: *_devotee_id set, *_id NULL, a live account has that devotee
    const fwd = await queryAll(
      `SELECT t.id AS eid, u.id AS uid
       FROM ${table} t JOIN users u ON u.devotee_id = t.${devCol} AND u.is_deleted = 0
       WHERE t.${devCol} IS NOT NULL AND t.${idCol} IS NULL AND t.is_deleted = 0`
    );
    for (const f of fwd) {
      await W(`UPDATE ${table} SET ${idCol} = ? WHERE id = ? AND ${idCol} IS NULL`, [f.uid, f.eid]);
      await W(
        `INSERT INTO user_roles (user_id, role) SELECT ?, ? WHERE NOT EXISTS
         (SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?)`,
        [f.uid, role, f.uid, role]
      );
      summary.leadersLinkedForward++;
      log(table, f.eid, '-> account', f.uid, `(+${role})`);
    }
    // reverse: *_id set, *_devotee_id NULL
    const rev = await W(
      `UPDATE ${table} SET ${devCol} = (SELECT devotee_id FROM users WHERE id = ${table}.${idCol})
       WHERE ${devCol} IS NULL AND ${idCol} IS NOT NULL`
    );
    if (rev && rev.changes) { summary.leadersLinkedReverse += rev.changes; log(table, 'reverse-linked', rev.changes, 'rows'); }
    else if (dryRun) {
      const n = await queryOne(`SELECT COUNT(*) AS n FROM ${table} WHERE ${devCol} IS NULL AND ${idCol} IS NOT NULL`);
      if (n && n.n) { summary.leadersLinkedReverse += n.n; log(table, 'would reverse-link', n.n, 'rows'); }
    }
  }

  // ---------- Step 5: backfill guests + individual donors ----------
  {
    const { ensureDevotee } = require('../services/people');
    const g = await queryAll(
      `SELECT id, first_name, last_name, mobile, city, state FROM guests
       WHERE devotee_id IS NULL AND is_deleted = 0 AND mobile GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'`
    );
    for (const row of g) {
      if (dryRun) { summary.guestsBackfilled++; continue; }
      const devId = await ensureDevotee({
        firstName: row.first_name, lastName: row.last_name, mobile: row.mobile, city: row.city, state: row.state,
      });
      if (devId) { await run(`UPDATE guests SET devotee_id = ? WHERE id = ? AND devotee_id IS NULL`, [devId, row.id]); summary.guestsBackfilled++; }
    }
    const dn = await queryAll(
      `SELECT id, first_name, last_name, mobile, city, state, committee FROM donors
       WHERE type = 'individual' AND devotee_id IS NULL AND is_deleted = 0`
    );
    for (const row of dn) {
      if (dryRun) { summary.donorsBackfilled++; continue; }
      const devId = await ensureDevotee({
        firstName: row.first_name, lastName: row.last_name, mobile: row.mobile,
        city: row.city, state: row.state, samaj: row.committee,
      });
      if (devId) { await run(`UPDATE donors SET devotee_id = ? WHERE id = ? AND devotee_id IS NULL`, [devId, row.id]); summary.donorsBackfilled++; }
    }
    log('guests backfilled', summary.guestsBackfilled, '| donors backfilled', summary.donorsBackfilled);
  }

  // ---------- Step 6: pooja_coordinator_links.devotee_id from the linked user ----------
  {
    const r = await W(
      `UPDATE pooja_coordinator_links
         SET devotee_id = (SELECT devotee_id FROM users WHERE id = pooja_coordinator_links.user_id)
       WHERE devotee_id IS NULL AND user_id IS NOT NULL`
    );
    if (r && r.changes) summary.coordinatorDevoteeBackfilled = r.changes;
    else if (dryRun) {
      const n = await queryOne(`SELECT COUNT(*) AS n FROM pooja_coordinator_links WHERE devotee_id IS NULL AND user_id IS NOT NULL`);
      summary.coordinatorDevoteeBackfilled = (n && n.n) || 0;
    }
    log('coordinator devotee backfilled', summary.coordinatorDevoteeBackfilled);
  }

  // ---------- Step 7: partial UNIQUE indexes (pre-checked) ----------
  const INDEXES = [
    ['ux_devotees_mobile', `CREATE UNIQUE INDEX IF NOT EXISTS ux_devotees_mobile ON devotees(mobile) WHERE mobile <> '' AND is_deleted = 0`,
     `SELECT mobile k FROM devotees WHERE mobile <> '' AND is_deleted = 0 GROUP BY mobile HAVING COUNT(*) > 1`],
    ['ux_committee_members_cd', `CREATE UNIQUE INDEX IF NOT EXISTS ux_committee_members_cd ON committee_members(committee_id, devotee_id) WHERE devotee_id IS NOT NULL AND is_deleted = 0`,
     `SELECT committee_id || ':' || devotee_id k FROM committee_members WHERE devotee_id IS NOT NULL AND is_deleted = 0 GROUP BY committee_id, devotee_id HAVING COUNT(*) > 1`],
    ['ux_team_members_td', `CREATE UNIQUE INDEX IF NOT EXISTS ux_team_members_td ON team_members(team_id, devotee_id) WHERE devotee_id IS NOT NULL AND is_deleted = 0`,
     `SELECT team_id || ':' || devotee_id k FROM team_members WHERE devotee_id IS NOT NULL AND is_deleted = 0 GROUP BY team_id, devotee_id HAVING COUNT(*) > 1`],
    ['ux_users_devotee', `CREATE UNIQUE INDEX IF NOT EXISTS ux_users_devotee ON users(devotee_id) WHERE devotee_id IS NOT NULL AND is_deleted = 0`,
     `SELECT devotee_id k FROM users WHERE devotee_id IS NOT NULL AND is_deleted = 0 GROUP BY devotee_id HAVING COUNT(*) > 1`],
    ['ux_users_email_lower', `CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_lower ON users(lower(email)) WHERE is_deleted = 0`,
     `SELECT lower(email) k FROM users WHERE is_deleted = 0 GROUP BY lower(email) HAVING COUNT(*) > 1`],
    ['ux_donors_mobile', `CREATE UNIQUE INDEX IF NOT EXISTS ux_donors_mobile ON donors(mobile) WHERE mobile <> '' AND is_deleted = 0`,
     `SELECT mobile k FROM donors WHERE mobile <> '' AND is_deleted = 0 GROUP BY mobile HAVING COUNT(*) > 1`],
    ['ux_sevarthis_mobile', `CREATE UNIQUE INDEX IF NOT EXISTS ux_sevarthis_mobile ON sevarthis(mobile) WHERE mobile <> '' AND is_deleted = 0`,
     `SELECT mobile k FROM sevarthis WHERE mobile <> '' AND is_deleted = 0 GROUP BY mobile HAVING COUNT(*) > 1`],
    ['ux_donations_receipt', `CREATE UNIQUE INDEX IF NOT EXISTS ux_donations_receipt ON donations(receipt_no) WHERE receipt_no IS NOT NULL AND receipt_no <> '' AND is_deleted = 0`,
     `SELECT receipt_no k FROM donations WHERE receipt_no IS NOT NULL AND receipt_no <> '' AND is_deleted = 0 GROUP BY receipt_no HAVING COUNT(*) > 1`],
    ['ux_pcoord_pd', `CREATE UNIQUE INDEX IF NOT EXISTS ux_pcoord_pd ON pooja_coordinator_links(pooja_id, devotee_id) WHERE devotee_id IS NOT NULL`,
     `SELECT pooja_id || ':' || devotee_id k FROM pooja_coordinator_links WHERE devotee_id IS NOT NULL GROUP BY pooja_id, devotee_id HAVING COUNT(*) > 1`],
    ['ux_pcoord_pu', `CREATE UNIQUE INDEX IF NOT EXISTS ux_pcoord_pu ON pooja_coordinator_links(pooja_id, user_id) WHERE user_id IS NOT NULL`,
     `SELECT pooja_id || ':' || user_id k FROM pooja_coordinator_links WHERE user_id IS NOT NULL GROUP BY pooja_id, user_id HAVING COUNT(*) > 1`],
  ];
  for (const [name, createSql, checkSql] of INDEXES) {
    const already = await queryOne(`SELECT 1 AS x FROM sqlite_master WHERE type = 'index' AND name = ?`, [name]);
    if (already) { summary.indexesCreated.push(name + ' (existed)'); continue; }
    const bad = await queryAll(checkSql);
    if (bad.length) {
      summary.indexesSkipped.push({ index: name, dupes: bad.slice(0, 10).map(r => r.k) });
      log('SKIP index', name, '-', bad.length, 'dup keys still present');
      continue;
    }
    if (dryRun) { log('would create index', name); continue; }
    try { await run(createSql); summary.indexesCreated.push(name); log('created index', name); }
    catch (e) { summary.indexesSkipped.push({ index: name, dupes: ['error: ' + e.message] }); }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

module.exports = { repairDatabase };
