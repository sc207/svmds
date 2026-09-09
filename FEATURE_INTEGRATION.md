# Feature Integration Guide

> **"Create a new page"** means: *integrate a new feature into the existing
> architecture without breaking data integrity, API contracts, frontend state,
> auth, or existing modules.* Never build an island.

The order is always: **Inspect → Understand → Impact analysis → Design → Implement → Test → Re-audit.**
Start from the database and the data relationships, not the HTML.

---

## 1. Trace the full data flow before writing code

```
UI page ─ index.html  (static markup for a core page)  OR  <mod>-ui.js (module render)
  ↓ form handler ─ <mod>-forms.js  (handleSaveX / confirmDeleteX)
  ↓ store ─ the module global (state / MG / CMT / POOJA / EV / VISITS / DON)
  ↓ API client ─ public/js/api.js  (window.API.get/post/put/patch/del, in-flight de-dupe, postReconcile)
  ↓ route ─ server/routes/<x>.js  (mounted in server/index.js below authRequired + attachScope)
  ↓ authorization ─ middleware/authz.js (requireRole, attachScope, req.scope) + services/authz.js
  ↓ service / business rules ─ server/services/*  (people.js, entityCode.js, sharedTables.js, …)
  ↓ database ─ server/db/migrations/NNN_*.(sql|js)  ·  queryAll/queryOne/run/runBatch
  ↓ FK + UNIQUE constraints ─ 001_init.sql + 007 + 008
  ↑ mapper ─ server/utils/mappers.js  (snake_case row → camelCase DTO)
  ↑ hydration ─ public/js/hydrate.js  (GET every module on window.load, swap() into the store, re-render)
  ↑ reconcile ─ window.__rehydrate() after a mutation
```

If the new feature touches a person, it touches **all** of these. Plan every layer.

---

## 2. Canonical pattern map — reuse these, never fork them

| Concern | The one correct implementation |
|---|---|
| A person | `devotees` table. `services/people.js ensureDevotee({name/firstName/lastName, mobile, city, …})` — dedupes by mobile, else exact `lower(name)+lower(city)`; revives a soft-deleted match; catches the UNIQUE race. **Never** `INSERT INTO devotees` directly from a route without this (except `routes/devotees.js POST`, which re-implements the same dedupe + revive + race-catch). |
| Person → module link | Add a `devotee_id INTEGER REFERENCES devotees(id)` column + a partial `UNIQUE (entity_id, devotee_id) WHERE devotee_id IS NOT NULL AND is_deleted = 0` index (in a migration). Route accepts `{devoteeId}` (id **or** `DEV-###` code), resolves it, and on the INSERT does *catch → re-select → return the canonical row* (200/201), never a 500. See `routes/committees.js` / `routes/teams.js` `POST /:id/members`. |
| Leader / in-charge / coordinator (person may have no login) | Store **both** `*_id` (→ `users`, when an account exists) **and** `*_devotee_id` (→ `devotees`, always). `attachScope` unions both. Grant the scoped role only for a real account, with `INSERT INTO user_roles … WHERE NOT EXISTS`. See `routes/committees.js POST /:id/leader`. |
| Human ID / code | `services/entityCode.js nextCode('<counter>')` — atomic `UPDATE counters … RETURNING`. Add the counter to `db/seed/platform.js COUNTERS`. Codes are `PREFIX-NNN`. **The frontend never invents a DB id** — optimistic rows use a local key that `__rehydrate()` replaces. |
| Route mount | `server/routes/<x>.js` → `server/index.js` below `app.use('/api', authRequired)` + `attachScope`. Read/write open to any session unless the resource says otherwise; catalog + create + delete are usually `adminTier = requireRole('superadmin','admin')`. |
| Authorization | `requireRole(...)`, `req.scope.{teamIds,committeeIds,poojaIds,eventIds}`, `services/authz.js assertCanGrant / assertCanTouchUser`. Two-tier admin: `admin` ≠ `superadmin` for role grants / touching privileged accounts / impersonation. Never invent a parallel role. |
| Audit | every mutation → `services/audit.js logAudit({ userId, userEmail, module, action, entityType, entityId, scopeId, details })`. |
| Mapper | one `mapX(row)` in `utils/mappers.js`, pure (no db, no req). Person links come out as the **numeric** `devotee_id`; `hydrate.js devCode()` converts to `DEV-###` — that is the single conversion point. If a DTO is consumed **outside** hydrate (e.g. `access-api.js`), also emit `devoteeCode` via a `⋈ devotees` join in the store query (see `services/userStore.js`). |
| Frontend store hydration | add a `hydrateX()` to `public/js/hydrate.js`: GET the endpoint(s), map each DTO to the store's existing field shape, `swap()` the array, call the module's `renderX()`. Carry `code` on every sub-entity so "is this synced?" checks key on `!!row.code`, never on an id prefix (local optimistic ids share the server prefix). |
| Person picker in a form | `devoteeLinkField({selId, …})` + `devoteeLinkValue(selId)` (single link), or `personCheckList(allPeople(), …)` + `checkedPeople()` (roster). "Add new devotee" opens the shared `openDevoteeSheet({onSaved})` which `POST`s `/devotees`, gets the canonical `DEV-###`, and calls back. **Never write a second person form.** |
| Person dropdown data | `window.templePeople()` / `allPeople()` (from `state.devotees` + module members, deduped by mobile) or a module store hydrated from its API. Never a hardcoded name/id list. |
| Optimistic write | mutate the store locally → fire `window.API.post/patch/del` → on success `__rehydrate()` (or `API.postReconcile`) → on 4xx toast + revert/keep-open → on offline/5xx keep the row, `_syncFailed = true`. Guarded `if (window.API && window.API.online)`; offline keeps the pure in-memory path. Lock the submit button in `finally`. |
| Soft delete | `is_deleted 0/1`; a delete is `UPDATE … SET is_deleted = 1`. Deleting a parent cascades: soft-delete children **and** purge `attendance` rows + strip the id from any `member_ids_json`. `DELETE /devotees/:id` → 409 with `v_person_links` unless `?force=1`. Re-adding a soft-deleted person **revives the same row**. |
| Reports / PDF / print | `public/js/export.js` — `registerExport(key, builder)` + `exportBar(key)`; print goes through `openPrintDoc(...)`. |
| Calendar | dated rows are aggregated server-side into `v_cal_*` views + client `calEntries()`; add a `v_cal_<x>` view if the feature has dates. |

---

## 3. Database rules

- **Migration for every schema change.** Next number, forward-only, never edit a shipped one. `NNN_*.sql` = atomic single-statement DDL (the runner strips `--` and splits on `;` — no triggers, no `;`/`--` in string literals). `NNN_*.js` = imperative (`module.exports.up = async ({queryAll,queryOne,run,runBatch}) => {…}`), self-manages atomicity, use it when you need a dedup-then-constrain pass. Both are ordered by the numeric prefix.
- **Enforce logically-unique relationships at the DB.** Determine the business rule first. "A person can be on a committee once" → partial `UNIQUE (committee_id, devotee_id)`. "A person leads many committees" → **do not** make `devotee_id` global-unique. Add the index in a migration; if existing data might violate it, dedup **in the same migration** first (see `008` / `repairDatabase`).
- **The DB is the final safety layer.** Frontend + service checks are not enough. Every person/relationship create must survive N simultaneous identical requests → exactly one row, no 5xx. Pattern: pre-check (fast path) → INSERT → `catch` → re-select the canonical row → return it.
- **Don't store derivable data.** If it follows from a canonical relationship, join for it.

---

## 4. Definition of done

A page is **not** done because it renders and the API returns 200. It is done when
every layer above stays consistent **and** this passes against a DB that already
has devotees, relationships, and soft-deleted rows:

```
Create → Save → Refresh(GET from server) → still correct
       → Edit → Save → Refresh → still correct
       → Delete → Refresh → correct state (gone / soft-deleted, no orphans)
```

Cross-module: if Devotee A is assigned in the new feature, the new feature shows A,
**and** A's other modules + the Devotee 360 view still show A correctly — from both directions.

---

## 5. Tests to run (throwaway harnesses live in the session scratchpad; keep the shapes)

- **fresh-DB migrate** → `npm run migrate` on an empty `data/svmds.db` → all `ux_*` indexes present, no manual repair.
- **dirty-DB upgrade** → migrate to N-1, insert every dirty shape, apply the new migration → merged/backfilled/constrained, re-run drift = 0.
- **concurrency** → `Promise.all` of 8–10 identical `POST`s for each new create path → exactly 1 row, zero 5xx, all responses point at the same id.
- **lifecycle** → the Create→Refresh→Edit→Refresh→Delete→Refresh loop above, hitting real endpoints.
- **regression** → the existing route + repair suites still green.
- **prod** → `npm run db:repair:dry` (read-only) and review the summary **before** any real repair. `DB_REPAIR_ON_BOOT=dry` in Render logs drift on every deploy.

---

## 6. Before touching an existing table / route / mapper / component

Walk the chain and update every consumer together:
`column → service → route → mapper → store → form → detail page → list page → report → PDF → export → tests`.
Don't rename/remove a field that another layer reads without updating that layer or adding an explicit compatibility alias.
