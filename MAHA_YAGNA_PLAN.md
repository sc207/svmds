# Maha Yagna Sevarthi Registration — Plan

> Living document for the public Maha Yagna sevarthi sign-up feature. Phase 1
> (this phase) is the public form + token; Phase 2 (review/approve → link into
> `devotees`/`committee_members`/`sevarthis`/pooja) is deliberately deferred —
> see the last section.

## Context

The temple wants a public, no-login web page where anyone can register interest
in becoming a **sevarthi** (sponsor) for the upcoming **Maha Yagna**. The actual
Yagna poojas/quotas aren't built yet, so this phase is deliberately scoped to
**collecting clean-enough raw registrations and giving each person a token** —
not to assigning them a pooja or merging them into the canonical Devotee
register. That reconciliation (dedupe against `devotees`, decide categories from
the contribution amount, assign an actual Yagna pooja) is **explicitly
deferred** to a later phase once the Yagna poojas exist; this plan only builds
the schema hooks (`category`, `assigned_pooja_id`) so that phase doesn't need
another migration, not the UI/logic for it.

Fields collected: first name, last name, **Samaj name (free text, exactly as
typed — e.g. "Rabari Samaj")**, city, state, mobile, expected Yagna
contribution. On submit the person gets a **5-digit token** (`MYS-00001`, `MYS-00002`, …)
and an auto-downloaded PDF "token card" showing every detail they entered.
Later, entering the token **+ mobile number** (both required — see Security
below) re-shows that card and will eventually show their pooja assignment.

Admin/superadmin can turn the public page on/off, set an open/close window,
and see every submission.

**Data model decision (explicit, deliberate exception to the Universal
Devotee Rule):** this does **not** call `ensureDevotee`/write to `devotees`,
and does **not** write to `sevarthis` either. It's a brand-new, fully
separate staging table (`yagna_sevarthi_signups`) — a submission never
touches `devotees`/`committee_members`/`sevarthis` in this phase, full stop.
Temple staff will manually review, clean, and *approve* each row later
(that's what the `status` column's `submitted → reviewed → converted` states
are for), and only then — in a future phase, not built here — will an
approved row be copied into the real `devotees`/`committee_members`/
`sevarthis` tables. `FEATURE_INTEGRATION.md`'s canonical-person pattern
normally forbids a person living outside `devotees`; it's overridden here on
purpose, per explicit user instruction.

**Security decision (user-confirmed):** the public token lookup requires
**both** the token code AND the 10-digit mobile number — a bare sequential
token would let anyone enumerate other people's name/city/contribution by
guessing `MYS-00001`, `MYS-00002`, etc. Two-factor lookup closes that without
adding any new dependency (no OTP/CAPTCHA needed for this phase). On top of
that, `/yagna/verify` locks a device (IP) out for **1 hour after 3 wrong
attempts** — `express-rate-limit`'s `skipSuccessfulRequests: true` so a
correct check never counts against the limit, only failed ones do; once
locked out, even a subsequently-correct token+mobile stays blocked until
the hour passes (real lockout semantics, not "3 wrong then let the next
correct one through"). This is `verifyLockout` in
`server/routes/publicYagna.js`, separate from and stacked with the looser
general request-flood limiter (`verifyLimiter`, 20/15min) already on that
route.

**Samaj field decision (user-confirmed correction):** the committee field is
**free-text "Samaj name," not a dropdown, and not an FK to the `committees`
table.** The public form does not fetch or depend on `committees` at all.
Staff will see raw values as submitted (`"Rabari Samaj"`, `"rabari samaj"`,
`"Rabari Samaj Ahmedabad"`, …), group/count them, decide which real
Committee(s) each group maps to, and — in Phase 2 — create/map them
manually. **Nothing is auto-created or auto-matched against `committees` in
Phase 1.** The admin register shows a "Samaj names as submitted" breakdown
(grouped, counted, unnormalised) specifically to support this cleanup step.

**Duplicate-identity decision (user-confirmed, migration 017):** a
registration is a duplicate when **first name + last name + mobile number**
all match an existing live row (case/whitespace-insensitive) — not mobile
alone (a shared household phone can register more than one real sevarthi),
and not time-limited (a Yagna registration is a one-time thing, not a
"did they double-click" check). Enforced at the DB layer
(`ux_yagna_signups_identity`, a partial `UNIQUE` index on
`lower(trim(first_name)), lower(trim(last_name)), mobile` where
`is_deleted = 0`), not just an app-level pre-check, so two concurrent
identical submits can never both create a row — `POST /yagna/submit`
pre-checks (fast path), inserts, and on a `UNIQUE` violation re-selects and
returns the row that won the race, exactly the
"pre-check → INSERT → catch → re-select" pattern `FEATURE_INTEGRATION.md`
already uses everywhere else (e.g. `routes/devotees.js`). The response
carries `_duplicate: true` + a `message`; `yagna.html` shows an explicit
"you have already registered" banner above the token card instead of
silently treating it like a fresh submission, and skips the automatic PDF
download (they already have it — the Download button is still right there).

## Architecture — reusing existing patterns, not forking them

- **Public unauthenticated route precedent**: `server/routes/publicSignups.js`
  (the no-login volunteering signup) is mounted at `app.use('/api/public', …)`
  **before** `authRequired` in `server/index.js`. It already has the exact
  shapes needed: an `express-rate-limit` limiter, mobile-digit validation, and
  a double-submit dedupe guard that returns the existing reference instead of
  creating a duplicate row. The new public route (`server/routes/publicYagna.js`)
  mirrors this file closely, mounted the same way.
- **Standalone public page precedent**: `public/login.html` — its own
  `<head>` (no `<script src="js/app.js">` chain, no `/api/auth/me` gate),
  links `css/styles.css` directly. The new page (`public/yagna.html`) follows
  this shape: light, cacheable, no SPA bootstrap cost for an anonymous
  visitor. This is also the traffic/security answer to "keep it secure and
  responsive under heavy load" — nothing here touches the authenticated SPA,
  the auth endpoint, or session machinery; it's a static shell plus two tiny
  JSON calls (status, then submit **or** verify — no committees lookup, per
  the Samaj field decision above).
- **Splash loader**: copied verbatim from `public/index.html` (the
  self-contained `#appLoader` block) so the public page opens with the same
  loader the main app uses.
- **PDF token card**: reuses `public/js/export.js`'s already-loaded engine —
  `window.ensurePdfLibs()` (lazy-loads `html2canvas-pro` + `pdfMake` from
  CDN — do **not** revert to plain html2canvas 1.4.1, it throws on modern
  `color-mix()`/`oklch()` CSS values) and the same render-offscreen-node →
  `html2canvas` → `pdfMake.createPdf(...).download()` technique already used
  by `printReportPDF` in that file. `export.js` is a self-contained IIFE with
  no dependency on `state`/other modules, so `yagna.html` safely
  `<script src="js/export.js">`s it standalone. The token card's own HTML/CSS
  is hand-authored fresh in `yagna.html` (gold L-corners, `icon.png` emblem,
  faint `temple.png` watermark, Cinzel ribbon title — matching the donation
  certificate / badge / invitation aesthetic already established).
- **Admin module**: a new admin-only module mirroring **Dhaja Pooja** exactly
  (`public/js/dhaja.js` + `dhaja-ui.js` + `dhaja-forms.js` +
  `server/routes/dhaja.js` + `#page-dhaja` in `index.html`) — temple-wide PII,
  no coordinator role fits, so `yagna-signups` stays out of every scoped
  role's `ROLE_META`/`ROLE_PAGES` list, gated by
  `accGuard(root, 'yagna-signups')`.
- **Settings (enable + open/close window)**: extends
  `server/services/settingsStore.js` the same way `temple_identity` already
  works — a new `yagna_registration` JSON blob in `app_settings`.
- **Token codes**: `services/entityCode.js nextCode('yagna_sevarthi')` — the
  same atomic `UPDATE counters … RETURNING` every other ID in the app uses.
  Counter `('yagna_sevarthi', 'MYS', 5)` → codes come out `MYS-00001`, …

## Database — `server/db/migrations/016_yagna_sevarthi_signups.sql`

```sql
CREATE TABLE IF NOT EXISTS yagna_sevarthi_signups (
  id                     TEXT PRIMARY KEY,
  code                   TEXT UNIQUE,
  first_name             TEXT NOT NULL,
  last_name              TEXT NOT NULL DEFAULT '',
  samaj_name             TEXT NOT NULL,                -- free text, exactly as entered, no FK
  city                   TEXT NOT NULL DEFAULT '',
  state                  TEXT NOT NULL DEFAULT 'Gujarat',
  mobile                 TEXT NOT NULL,
  expected_contribution  REAL NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'submitted'
                           CHECK (status IN ('submitted','reviewed','converted','rejected')),
  category               TEXT,                         -- unused this phase, reserved
  assigned_pooja_id      TEXT REFERENCES poojas(id),    -- unused this phase, reserved
  notes                  TEXT NOT NULL DEFAULT '',
  submitted_ip           TEXT NOT NULL DEFAULT '',
  is_deleted             INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_yagna_signups_mobile ON yagna_sevarthi_signups(mobile);
CREATE INDEX IF NOT EXISTS idx_yagna_signups_samaj_name ON yagna_sevarthi_signups(samaj_name);
CREATE INDEX IF NOT EXISTS idx_yagna_signups_status ON yagna_sevarthi_signups(status);
```

`samaj_name` is deliberately plain `TEXT`, not a `committees` FK — see the
Samaj field decision above. No automatic committee creation or matching
happens anywhere in this phase.

## Backend

- **`server/routes/publicYagna.js`** (mounted at `/api/public`, before the
  auth guard):
  - `GET /yagna/status` → `{ enabled, open, opensAt, closesAt }`.
  - `POST /yagna/submit` — rate-limited, validates (`samajName` required,
    free text), 400/404s if not open, duplicate guard by first+last name+
    mobile (DB-enforced, see the Duplicate-identity decision above), returns
    the full mapped row so the client renders the token card without a
    second round trip.
  - `POST /yagna/verify` — body `{code, mobile}`, both required, rate-limited
    against request volume AND locked out for an hour after 3 wrong attempts
    (see the Security decision above), 404 on any mismatch (never reveals
    which field was wrong).
- **`server/routes/yagnaSignups.js`** (admin, `requireRole('superadmin','admin')`):
  `GET /`, `GET/PUT /settings`, `PATCH /:id`, `DELETE /:id`. Every write →
  `logAudit()`.
- **`server/utils/mappers.js`**: `mapYagnaSignup(row)`.
- **`server/services/settingsStore.js`**: `yagnaRegistration` blob,
  `setYagnaRegistration()`, `yagnaRegistrationStatus()` (IST-aware via the
  file's existing `istNow()`).
- **`server/db/seed/platform.js`**: counter `['yagna_sevarthi', 'MYS', 5]`.

## Frontend — admin module (mirrors Dhaja Pooja file-for-file)

`public/js/yagna-signups.js` (store) + `yagna-signups-ui.js` (render, KPIs,
settings panel, export) + `yagna-signups-forms.js` (status/notes edit,
settings save, bootstrap). Nav item under "Seva & Events", `#page-yagna-signups`
section, admin-only via `accGuard` + omission from `ROLE_META`. Hydrated via
`hydrate.js hydrateYagnaSignups()`. i18n keys follow the `nav_dhaja`/`dhaja_*`
precedent. The register table shows the raw `samajName` per row plus a
separate "Samaj names as submitted" breakdown (grouped + counted client-side
from the already-loaded list, unnormalised) — the tool staff use to plan
Phase 2's committee cleanup, without this phase doing any of that matching
itself.

## Frontend — public pages

`public/yagna.html` — one standalone file, two views toggled by a `#lookup`
hash:
1. **Register** (default): status check → form (if open) or a closed/window
   message → submit → token card rendered inline + auto-downloaded PDF.
2. **Check my token** (`#lookup`): token + mobile → same token card +
   re-download + a "pooja assignment announced later" placeholder.

## Verification run for Phase 1

Fresh-DB migration check, concurrency (`Promise.all` of identical submits →
1 row), full lifecycle (submit → verify → admin list/PATCH), rate-limit
burst → 429, and a real browser pass on `yagna.html` (loader, form, PDF
download, lookup).

## Phase 2 — explicitly deferred, not built in this phase

Once the Yagna poojas exist and staff have reviewed the raw submissions:

1. Staff use the samaj-name breakdown to decide which real `committees` each
   raw `samaj_name` value maps to — creating a new committee where needed,
   or mapping several spellings to one existing committee. This is a manual
   admin decision, not automatic string matching.
2. An admin marks a cleaned row `reviewed`, then **approves** it — at that
   point it gets copied forward through the app's existing canonical pattern
   (`FEATURE_INTEGRATION.md` §2, `ensureDevotee` etc.) into `devotees` (the
   person), `committee_members` (the committee decided in step 1),
   `sevarthis` (their sevarthi record), and finally linked to whichever
   pooja/Yagna session/Dhaja Pooja they end up assigned to — the same
   cross-module person-linking every other feature in this app already uses,
   not a new mechanism.
3. The row's `status` becomes `converted` and `assigned_pooja_id` gets set.

None of this — the committee-mapping UI, approval action, merge/dedupe
logic, category-from-contribution rules, or the pooja-assignment UI — exists
yet. The schema already leaves room (`category`, `assigned_pooja_id`,
`status IN ('reviewed','converted')`) so Phase 2 won't need another
migration for its core fields.
