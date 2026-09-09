/* ============================================================
   008_person_integrity.js  —  imperative migration

   Makes "one canonical Devotee per person" and "one relationship per
   (entity, person)" a SCHEMA guarantee instead of something only a
   hand-run maintenance script enforced.

   It runs the already-tested repairDatabase() once as part of the
   migration chain:
     1. merge any duplicate devotees / roster rows / sevarthi rows
        (repoint every FK to the canonical row first, then soft-delete)
     2. backfill users.devotee_id / leader-lead-incharge links
     3. CREATE the partial UNIQUE indexes that stop it recurring:
          ux_devotees_mobile        (mobile <> '' AND is_deleted = 0)
          ux_users_devotee          (one login account per person)
          ux_users_email_lower      (case-insensitive email)
          ux_committee_members_cd   (committee_id, devotee_id)
          ux_team_members_td        (team_id, devotee_id)
          ux_donors_mobile · ux_sevarthis_mobile
          ux_donations_receipt
          ux_pcoord_pd (pooja_id, devotee_id) · ux_pcoord_pu (pooja_id, user_id)

   Idempotent: every step is WHERE ... IS NULL / soft-delete-aware /
   CREATE ... IF NOT EXISTS, so re-running is a no-op. A group that two
   distinct live accounts point at is left alone and reported, never
   force-merged (that would need a human decision).

   If a UNIQUE index still can't be created because a duplicate the
   auto-merge could not resolve is present, repairDatabase records it in
   `indexesSkipped` and this migration STILL SUCCEEDS (the schema is as
   hardened as the data currently allows). Run `npm run db:repair` /
   inspect the reported rows, then a later boot creates the missing index.
   ============================================================ */
module.exports.up = async function up() {
  // counters must exist before any ensureDevotee() the repair might call
  await require('../seed/platform').seedPlatform();

  const { repairDatabase } = require('../repair');
  const summary = await repairDatabase({ dryRun: false });

  const changed = summary.devoteesMerged + summary.rosterRowsMerged
    + summary.usersDevoteeBackfilled + summary.leadersLinkedForward
    + summary.leadersLinkedReverse + summary.guestsBackfilled
    + summary.donorsBackfilled + summary.sevarthisBackfilled
    + summary.coordinatorDevoteeBackfilled;

  console.log(`  · 008 person-integrity: ${changed} row(s) reconciled, `
    + `${summary.indexesCreated.length} unique index(es) present`
    + (summary.indexesSkipped.length
        ? `, ${summary.indexesSkipped.length} deferred: ${summary.indexesSkipped.map(s => s.index).join(', ')}`
        : ''));
  if (summary.devoteeMergesSkipped.length) {
    console.warn('  ⚠ 008: devotee groups NOT merged (2+ live accounts) — needs a manual call:');
    summary.devoteeMergesSkipped.forEach(s => console.warn('      ', s.key, '·', s.reason));
  }
};
