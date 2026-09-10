/* ============================================================
   012_guests_registry.js  —  imperative, deterministic, STRICT

   Part 2 of the canonical-person refactor. Turns `guests` from a
   per-(pooja, person) row into a true one-row-per-person registry:

     A. pooja_guest_links.role  — the per-pooja guest role moves ONTO the
        link (a person can be "Chief Guest" at one pooja, "Trustee" at
        another with a single `guests` row).
     B. backfill link.role from guests.role.
     C. dedup `guests` by devotee_id — keep MIN(id), repoint
        pooja_guest_links.guest_id, carry a blank keeper role from the
        loser, soft-delete the loser (mirrors server/db/repair.js).
     D. ux_guests_devotee — CREATE, then VERIFY it persisted, else THROW.

   FAIL-HARD like 011: a throw aborts runMigrations() and schema_migrations
   is not written, so the next boot re-runs. Every write is idempotent
   (WHERE-guarded / merge-note). Does NOT call repairDatabase().
   Guests with devotee_id IS NULL (legacy free text) are left as-is — the
   index is partial (WHERE devotee_id IS NOT NULL).
   ============================================================ */
async function hasColumn(queryAll, table, col) {
  const rows = await queryAll(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === col);
}
async function indexExists(queryOne, name) {
  return !!(await queryOne(`SELECT 1 AS x FROM sqlite_master WHERE type = 'index' AND name = ?`, [name]));
}

module.exports.up = async function up({ queryAll, queryOne, run }) {
  /* ---- A: role column on the link ---- */
  if (!(await hasColumn(queryAll, 'pooja_guest_links', 'role'))) {
    await run(`ALTER TABLE pooja_guest_links ADD COLUMN role TEXT NOT NULL DEFAULT ''`);
  }

  /* ---- B: backfill link.role from guests.role (only where still blank) ---- */
  await run(
    `UPDATE pooja_guest_links
        SET role = COALESCE((SELECT g.role FROM guests g WHERE g.id = pooja_guest_links.guest_id), '')
      WHERE COALESCE(role, '') = ''`
  );

  /* ---- C: dedup guests by devotee_id ---- */
  let merged = 0;
  const dupes = await queryAll(
    `SELECT devotee_id AS did, MIN(id) AS keep, COUNT(*) AS n
       FROM guests WHERE devotee_id IS NOT NULL AND is_deleted = 0
      GROUP BY devotee_id HAVING COUNT(*) > 1`
  );
  for (const g of dupes) {
    const rows = await queryAll(
      `SELECT id FROM guests WHERE devotee_id = ? AND is_deleted = 0 ORDER BY id`, [g.did]);
    for (const r of rows) {
      if (r.id === g.keep) continue;
      const links = await queryAll(
        `SELECT pooja_id, role FROM pooja_guest_links WHERE guest_id = ?`, [r.id]);
      for (const l of links) {
        const has = await queryOne(
          `SELECT role FROM pooja_guest_links WHERE pooja_id = ? AND guest_id = ?`, [l.pooja_id, g.keep]);
        if (has) {
          if (!String(has.role || '').trim() && String(l.role || '').trim()) {
            await run(`UPDATE pooja_guest_links SET role = ? WHERE pooja_id = ? AND guest_id = ?`,
              [l.role, l.pooja_id, g.keep]);
          }
          await run(`DELETE FROM pooja_guest_links WHERE pooja_id = ? AND guest_id = ?`, [l.pooja_id, r.id]);
        } else {
          await run(`UPDATE pooja_guest_links SET guest_id = ? WHERE pooja_id = ? AND guest_id = ?`,
            [g.keep, l.pooja_id, r.id]);
        }
      }
      await run(
        `UPDATE guests SET is_deleted = 1
           WHERE id = ?`, [r.id]);
      merged++;
    }
  }

  /* ---- D: required constraint ---- */
  if (!(await indexExists(queryOne, 'ux_guests_devotee'))) {
    const bad = await queryAll(
      `SELECT devotee_id AS k FROM guests WHERE devotee_id IS NOT NULL AND is_deleted = 0
        GROUP BY devotee_id HAVING COUNT(*) > 1`);
    if (bad.length) {
      throw new Error(
        `012: cannot create ux_guests_devotee — ${bad.length} devotee_id(s) still doubled: ` +
        bad.slice(0, 10).map((r) => r.k).join(', ') + '. Dedupe on a copy of the DB, then redeploy.');
    }
    await run(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_guests_devotee
         ON guests(devotee_id) WHERE devotee_id IS NOT NULL AND is_deleted = 0`);
    if (!(await indexExists(queryOne, 'ux_guests_devotee'))) {
      throw new Error('012: ux_guests_devotee did not persist after CREATE.');
    }
  }

  console.log(`  · 012 guests-registry: ${merged} duplicate guest row(s) merged, ux_guests_devotee present`);
};
