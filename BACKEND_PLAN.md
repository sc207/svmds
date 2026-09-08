# Backend Implementation Plan — Shri Vihat Meldi Mata Mandir

> **Status: written plan only. No application code is produced here.**
> The reference implementation this plan copies is **ChallanPro**
> (`C:\Users\chauh\Downloads\ChallanPro`). Every pattern below is lifted from
> that repo's `server/` tree and adapted to the temple domain. Where the
> reference has a known gap, this plan names it and fixes it (see §3 and §11).

The target app today: a static, no-build, vanilla-JS SPA on GitHub Pages.
All data is an in-memory seed in `js/*.js` that resets on reload; only the
temple-identity form, language and the working-date clock touch `localStorage`.
Personas are a **client-side role selector** with no real authentication.

The goal: a real Node/Express backend on Render with Turso (prod) / local SQLite
(dev), passwordless TOTP auth, revocable sessions, server-side authorization that
replaces the client persona guard, and per-resource REST APIs that the existing
modules hydrate from on boot — **keeping the fixed script load order and the
in-memory store objects (`MG` / `POOJA` / `DON` / `CMT` / `EV` / `VISITS` /
`state` / `ACCOUNTS`) intact** so the `-ui.js` render layer barely changes.

---

## 1. Deployment

### 1.1 Platform shift: GitHub Pages → Render

| Concern | GitHub Pages (today) | Render (target) |
| --- | --- | --- |
| Server | none (static host) | Node 20 web service, `node server/index.js` |
| Data | in-memory seed | Turso (libsql) in prod, `data/temple.db` (better-sqlite3) in dev |
| Auth | client role selector | httpOnly-cookie JWT + TOTP + revocable sessions |
| Base path | project sub-path `/<repo>/` | domain root `/` |
| `.nojekyll` | needed (disable Jekyll) | irrelevant — Render serves files verbatim. Leave it; harmless. |
| Relative paths (`css/`, `js/`, `assets/`) | required for sub-path | still work from domain root; the sub-path fallback in `assetURL()` becomes moot but stays (print popups still need an absolute URL). |
| Splash loader (`#appLoader` inline `<script>` + `<style>`) | unchanged | unchanged — still the first paint |
| `assetURL('css/styles.css')` in print popups | resolves via `document.baseURI` | resolves same-origin on Render — fine |
| Google Fonts `@import` in `css/styles.css` | allowed (no CSP) | **must be allowed by Helmet CSP** — see §7 |

**Static file serving.** Move the front-end into `public/` (`git mv index.html
css assets js public/`) so Express can `express.static('public')` **without ever
exposing `server/`, `.env`, `node_modules`, `data/` or `db/migrations`**. The
current flat repo-root layout would leak those if served directly. `login.html`
lives in `public/` too, served explicitly and outside the SPA script chain.

SPA fallback mirrors the reference:

```js
app.use(express.static(path.join(__dirname, '../public')));
app.get('/login', (r, s) => s.sendFile(path.join(__dirname, '../public/login.html')));
app.get('/login.html', (r, s) => s.sendFile(path.join(__dirname, '../public/login.html')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
```

### 1.2 Boot sequence (`server/index.js`, copied from reference)

1. `require('./config')` — the only file that reads `process.env`.
2. **Fail-fast on a weak secret** (reference does this; keep + strengthen):
   ```js
   if (config.isProd && (!process.env.JWT_SECRET
        || config.jwtSecret === 'dev-secret-change-in-production'
        || config.jwtSecret.length < 32)) {
     console.error('FATAL: JWT_SECRET must be a strong 32+ char value in production.');
     process.exit(1);
   }
   ```
3. `app.set('trust proxy', 1)` — Render terminates TLS at its proxy; needed for
   `secure` cookies and correct `req.ip` in the rate limiter.
4. Middleware stack: `helmet({ contentSecurityPolicy: … })` (§7) → `cors({ origin:
   ALLOWED_ORIGINS, credentials: true })` → `express.json({ limit: '1mb' })` →
   `express.urlencoded({ extended: true })` → `cookieParser()`.
5. `otpLimiter` (`express-rate-limit`, 10 / 15 min) mounted on
   `/api/auth/request-setup-otp`.
6. `GET /health` → `{ status: 'ok' }` (Render `healthCheckPath`).
7. Mount `/api/auth` (public), then `app.use('/api', authRequired)`, then every
   protected router, then `/api/backup/*` (admin), then static + SPA fallback,
   then the **global error handler** (hides messages when `config.isProd`).
8. `start()`:
   ```js
   await runMigrations();          // db/migrate.js — applies pending numbered migrations
   await seedReferenceData();      // idempotent upserts: catalogs + committees/samaj
   await ensureAdminUser();        // idempotent upsert from ADMIN_EMAIL  (reference GAP — added)
   if (process.argv.includes('--demo')) await seedDemoData();
   app.listen(process.env.PORT || config.port || 3000);
   ```

### 1.3 `render.yaml` (Blueprint)

```yaml
services:
  - type: web
    name: svmmm-temple
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: node server/index.js
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: ADMIN_EMAIL
        sync: false
      - key: APP_NAME
        value: Shri Vihat Meldi Mata Mandir
      - key: SMTP_USER
        sync: false
      - key: SMTP_APP_PASSWORD
        sync: false
      - key: TURSO_DATABASE_URL
        sync: false
      - key: TURSO_AUTH_TOKEN
        sync: false
      - key: ALLOWED_ORIGINS
        sync: false
```

No persistent disk is required — unlike ChallanPro there are no user file
uploads (temple/emblem images ship in `public/assets/`). If a logo-upload
feature is added later, add a disk mounted at `UPLOADS_DIR` exactly as the
reference `DEPLOY.md` describes.

### 1.4 `server/config.js` — every env var (single source of truth)

```js
require('dotenv').config();
module.exports = {
  nodeEnv:   process.env.NODE_ENV || 'development',
  isProd:    process.env.NODE_ENV === 'production',
  port:      parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  adminEmail:(process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  appName:   process.env.APP_NAME || 'Shri Vihat Meldi Mata Mandir',
  smtp: { user: process.env.SMTP_USER || '', pass: process.env.SMTP_APP_PASSWORD || '' },
  smtpFrom:  process.env.SMTP_FROM || process.env.SMTP_USER || '',
  turso: { url: process.env.TURSO_DATABASE_URL || '', token: process.env.TURSO_AUTH_TOKEN || '' },
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  otpTtlMin: parseInt(process.env.OTP_TTL_MIN || '10', 10),
  sessionDays: parseInt(process.env.SESSION_DAYS || '7', 10),
};
```

| Var | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` toggles secure cookies, CSP strictness, error masking, fail-fast |
| `PORT` | auto (Render) | listen port |
| `JWT_SECRET` | yes | HS256 signing key; boot aborts if weak/short in prod |
| `ADMIN_EMAIL` | yes | bootstrapped as the first `superadmin` user on every boot (idempotent) |
| `APP_NAME` | no | OTP email subject/body + TOTP issuer label shown in the authenticator app |
| `SMTP_USER` | prod | Gmail address for OTP mail |
| `SMTP_APP_PASSWORD` | prod | Gmail App Password (2FA required); missing ⇒ OTP printed to server log (dev) |
| `SMTP_FROM` | no | `From:` header; defaults to `SMTP_USER` |
| `TURSO_DATABASE_URL` | prod | libsql URL; empty ⇒ local `data/temple.db` via better-sqlite3 |
| `TURSO_AUTH_TOKEN` | prod | libsql token |
| `ALLOWED_ORIGINS` | prod | comma-separated origin allowlist for CORS; empty ⇒ all origins (dev only) |
| `OTP_TTL_MIN` | no | OTP lifetime, default 10 |
| `SESSION_DAYS` | no | JWT + cookie lifetime, default 7 |

### 1.5 Database driver abstraction (`server/db/connection.js`)

Copy the reference file **verbatim** — it already exposes async
`queryAll(sql, params)`, `queryOne(sql, params)`, `run(sql, params)` over
better-sqlite3 (local) and `@libsql/client` (Turso), coercing libsql's BigInt
`lastInsertRowid` to `Number`. **One improvement (reference gap):** enforce
foreign keys on *both* drivers. better-sqlite3 already runs
`pragma('foreign_keys = ON')`; for libsql, execute `PRAGMA foreign_keys=ON;`
immediately after `createClient(...)` in `getDb()`:

```js
if (config.turso.url && config.turso.token) {
  const { createClient } = require('@libsql/client');
  const client = createClient({ url: config.turso.url, authToken: config.turso.token });
  await client.execute('PRAGMA foreign_keys = ON');   // <-- added
  isTurso = true; db = wrapLibsql(client); return db;
}
```

---

## 2. Database design

### 2.1 Conventions (identical to the reference)

- **PK type:** `INTEGER PRIMARY KEY AUTOINCREMENT` for **registries / catalogs**
  (devotees, users, teams, team members, committees, committee members,
  sevarthis, guests, donors, catalogs, expenses, inventory). `TEXT PRIMARY KEY`
  holding a UUID for **transactions / events** (donations, poojas, pooja
  sessions, meetings, volunteering sessions, events, visits, public signups,
  sessions, audit_logs) — matches ChallanPro's `challans.id` / `payments.id`.
- **Human code:** registries also carry `code TEXT UNIQUE` (e.g. `MEM-0007`,
  `MGMT-003`, `DEV-101`) — the id the modules cross-link on today. Allocated by
  `services/entityCode.js` (see §3), never by the client. FKs always reference
  the integer `id`, never `code`.
- `is_deleted INTEGER NOT NULL DEFAULT 0` on every table; **every list `SELECT`
  filters `is_deleted = 0`.** Deletes are `UPDATE … SET is_deleted = 1`.
- `created_at TEXT NOT NULL DEFAULT (datetime('now'))`; mutable rows add
  `updated_at TEXT`.
- Money → `REAL`. Booleans → `INTEGER` 0/1. Dates/times → `TEXT` ISO
  (`YYYY-MM-DD`, `HH:MM`, `YYYY-MM-DDTHH:MM:SS`).
- Status / kind / type enums → `TEXT` **with a `CHECK` constraint** (reference
  has none — this is an improvement, see §3).
- Denormalized JSON columns **only for opaque, non-queried blobs**:
  `poojas.custom_json`, `poojas.invitation_json`,
  `volunteering_sessions.member_ids_json`, `meetings.member_ids_json` (the
  assigned roster — the *queryable* form of "who attended" is the `attendance`
  child table). Everything that is filtered, ranged or joined gets real columns
  / child tables: `pooja_sessions`, `event_days`, `attendance`,
  `pooja_sevarthi_links`, `pooja_coordinator_links`, `pooja_guest_links`.
- `app_settings(key, value)` KV replaces the three `localStorage` keys
  (`svmmm_temple`, `svmmm_lang`, `svmmm_clock`) as the **shared default**;
  `localStorage` stays only as an optional per-device override (see §10 and the
  open decision on the clock).
- **One** universal `audit_logs` table — not per-module `.activity` arrays.

### 2.2 In-memory store → table map

| Today (in-memory) | Table(s) |
| --- | --- |
| `people.js` `ACCOUNTS` + `ROLE_META` | `users`, `user_roles` (+ `ROLE_PAGES` map in code) |
| `app.js` `state.devotees` | `devotees` |
| `app.js` `state.expenses` | `expenses` |
| `app.js` `state.inventory` | `inventory` |
| `MG.managements` | `teams` |
| `MG.leads` | (none — `users` with role `management_lead`) |
| `MG.members` | `team_members` |
| `MG.volunteering` | `volunteering_sessions` (roster in `member_ids_json`) |
| `MG.attendance` | `attendance` (`context_type='volunteering'`) |
| `MG.communication` | `communication` (`context_type='team'`) |
| `MG.drafts` | `message_drafts` (`context_type='team'`) |
| `MG.publicPages` | `public_pages` |
| `MG.publicSignups` | `public_signups` |
| `MG.activity` | `audit_logs` (`module='Management'`, `scope_id=team.code`) |
| `POOJA.poojaTypes` | `pooja_types` (catalog, seeded) |
| `POOJA.poojas` | `poojas` (+ `custom_json`, `invitation_json`) |
| `POOJA.poojas[].sessions` | `pooja_sessions` |
| `POOJA.poojas[].sevarthiIds / coordinatorIds / guestIds` | `pooja_sevarthi_links` / `pooja_coordinator_links` / `pooja_guest_links` |
| `POOJA.sevarthis` | `sevarthis` |
| `POOJA.people` (Guests & Pandits) | `guests` |
| `POOJA.coordinators` | (none — `users` with role `pooja_coordinator`) |
| `POOJA.activity` | `audit_logs` (`module='Pooja'`, `scope_id=pooja.id`) |
| `DON.categories` | `donation_categories` (catalog, seeded) |
| `DON.donors` | `donors` |
| `DON.donations` | `donations` |
| `CMT.committees` | `committees` |
| `CMT.leaders` | (none — `users` with role `committee_leader`) |
| `CMT.members` | `committee_members` |
| `CMT.meetings` | `meetings` (roster in `member_ids_json`) |
| `CMT.attendance` | `attendance` (`context_type='meeting'`) |
| `CMT.communication` / `CMT.drafts` | `communication` / `message_drafts` (`context_type='committee'`) |
| `CMT.activity` | `audit_logs` (`module='Committee'`, `scope_id=committee.code`) |
| `EV.eventTypes` | `event_types` (catalog, seeded) |
| `EV.events` | `events` |
| `EV.events[].days` | `event_days` |
| `EV.activity` | `audit_logs` (`module='Event'`, `scope_id=event.id`) |
| `VISITS.list` | `visits` |
| `VISITS.purposes` / `VISITS.teams` | `app_settings` JSON lists (or hard-coded enums in code) |
| `calendar.js` `calEntries()` | `services/calendar.js` + SQL VIEWs (§3) |
| `dashboard.js` `dashFigures()` / `dashTodayItems()` | `services/dashboard.js` |
| `people.js` `mergedActivity()` / `access.js` `accessSummary()` | `GET /api/activity` / `services/authz.js` |

### 2.3 Multi-tenant decision — **no `temple_id` scope column**

**Recommendation: do not add a tenant column.** This is one temple, forever
(confirm — open decision). Adding `temple_id` to 25 tables and to every `WHERE`
clause buys nothing today and is not a rewrite to add later (it would be one
migration + one line in `attachScope`). ChallanPro *needs* `company_id` because
it is genuinely multi-company; the temple is not. The temple's "identity" is a
single `app_settings` row.

**Scope is purely persona/role + owned-entity id.** A restricted session is
bounded by:

- `teams.lead_id` — a `management_lead` sees only teams they lead;
- `committees.leader_id` — a `committee_leader` sees only their committees;
- `pooja_coordinator_links(pooja_id, user_id)` — a `pooja_coordinator` sees only
  linked poojas;
- `events.in_charge_id` — an `event_incharge` sees only their events;
- role alone for `accountant` (all donations/expenses/reports) and `superadmin`
  (everything).

This is the exact analogue of ChallanPro's `company_id` filter — just keyed on
an ownership column instead of a tenant column. `utils/mappers.js` gets a
`attachScope` middleware (see §4) that pre-computes the owned-id sets once per
request, the way `requireCompanyId` pulls `companyId` once.

### 2.4 Full proposed schema — `server/db/migrations/001_init.sql`

```sql
-- ============================================================
-- 001_init.sql  —  Shri Vihat Meldi Mata Mandir
-- Conventions: see BACKEND_PLAN.md §2.1
-- ============================================================
PRAGMA foreign_keys = ON;

-- ---------- platform ----------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- seeded keys: temple_identity(json), default_language, working_date,
--              working_time, visit_purposes(json), visit_teams(json)

CREATE TABLE IF NOT EXISTS counters (          -- backs services/entityCode.js
  name       TEXT PRIMARY KEY,                 -- 'devotee','team','member','pooja',...
  prefix     TEXT NOT NULL,                    -- 'DEV','MGMT','MEM','PJA',...
  pad        INTEGER NOT NULL DEFAULT 3,
  next_value INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- identity / auth --------------------------------
CREATE TABLE IF NOT EXISTS devotees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT UNIQUE,                   -- DEV-####
  name          TEXT NOT NULL,
  mobile        TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  state         TEXT NOT NULL DEFAULT 'Gujarat',
  samaj         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes         TEXT NOT NULL DEFAULT '',
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  devotee_id    INTEGER REFERENCES devotees(id),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  mobile        TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS user_roles (        -- multi-role (Amit Shah = lead + coordinator)
  user_id INTEGER NOT NULL REFERENCES users(id),
  role    TEXT NOT NULL CHECK (role IN
            ('superadmin','management_lead','pooja_coordinator',
             'committee_leader','event_incharge','accountant')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS sessions (          -- copied from reference
  id          TEXT PRIMARY KEY,                -- jti (uuid)
  user_id     INTEGER NOT NULL REFERENCES users(id),
  user_email  TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  impersonated_by INTEGER REFERENCES users(id), -- non-null on a superadmin "sign in as" session
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  revoked     INTEGER NOT NULL DEFAULT 0
);

-- ---------- Management module ------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT UNIQUE,             -- MGMT-###
  name               TEXT NOT NULL,
  lead_id            INTEGER REFERENCES users(id),
  description        TEXT NOT NULL DEFAULT '',
  color              TEXT NOT NULL DEFAULT '#6B1F2A',
  expected_team_size INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes              TEXT NOT NULL DEFAULT '',
  created_date       TEXT,
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);

CREATE TABLE IF NOT EXISTS team_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT UNIQUE,                    -- MEM-###
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  devotee_id   INTEGER REFERENCES devotees(id),
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT NOT NULL DEFAULT '',
  mobile       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  state        TEXT NOT NULL DEFAULT 'Gujarat',
  role         TEXT NOT NULL DEFAULT 'Volunteer',   -- free text (Volunteer/Coordinator/…)
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes        TEXT NOT NULL DEFAULT '',
  joined_date  TEXT,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS volunteering_sessions (
  id              TEXT PRIMARY KEY,            -- uuid (VOL-### kept in `code`)
  code            TEXT UNIQUE,
  team_id         INTEGER NOT NULL REFERENCES teams(id),
  title           TEXT NOT NULL,
  date            TEXT NOT NULL,
  start_time      TEXT NOT NULL DEFAULT '',
  end_time        TEXT NOT NULL DEFAULT '',
  location        TEXT NOT NULL DEFAULT '',
  member_ids_json TEXT NOT NULL DEFAULT '[]',  -- assigned roster (opaque)
  notes           TEXT NOT NULL DEFAULT '',
  completed       INTEGER NOT NULL DEFAULT 0,
  public_open     INTEGER NOT NULL DEFAULT 0,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS public_pages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id    INTEGER NOT NULL UNIQUE REFERENCES teams(id),
  enabled    INTEGER NOT NULL DEFAULT 0,
  intro      TEXT NOT NULL DEFAULT '',
  contact    TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS public_signups (
  id           TEXT PRIMARY KEY,               -- uuid (PUB-### in `code`)
  code         TEXT UNIQUE,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  session_id   TEXT NOT NULL REFERENCES volunteering_sessions(id),
  name         TEXT NOT NULL,
  mobile       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  is_deleted   INTEGER NOT NULL DEFAULT 0
);

-- ---------- Committee / Samaj module ----------------------
CREATE TABLE IF NOT EXISTS committees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT UNIQUE,                   -- CMT-###
  name          TEXT NOT NULL,
  leader_id     INTEGER REFERENCES users(id),
  samaj         TEXT NOT NULL DEFAULT '',
  purpose       TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#6B1F2A',
  expected_size INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes         TEXT NOT NULL DEFAULT '',
  created_date  TEXT,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS committee_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT UNIQUE,                    -- CMM-###
  committee_id INTEGER NOT NULL REFERENCES committees(id),
  devotee_id   INTEGER REFERENCES devotees(id),
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT NOT NULL DEFAULT '',
  mobile       TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  state        TEXT NOT NULL DEFAULT 'Gujarat',
  role         TEXT NOT NULL DEFAULT 'Member',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes        TEXT NOT NULL DEFAULT '',
  joined_date  TEXT,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS meetings (
  id              TEXT PRIMARY KEY,            -- uuid (MTG-### in `code`)
  code            TEXT UNIQUE,
  committee_id    INTEGER NOT NULL REFERENCES committees(id),
  title           TEXT NOT NULL,
  date            TEXT NOT NULL,
  start_time      TEXT NOT NULL DEFAULT '',
  end_time        TEXT NOT NULL DEFAULT '',
  venue           TEXT NOT NULL DEFAULT '',
  agenda          TEXT NOT NULL DEFAULT '',
  member_ids_json TEXT NOT NULL DEFAULT '[]',
  notes           TEXT NOT NULL DEFAULT '',
  completed       INTEGER NOT NULL DEFAULT 0,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

-- ---------- shared: attendance / comms / drafts ----------
CREATE TABLE IF NOT EXISTS attendance (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  context_type TEXT NOT NULL CHECK (context_type IN ('volunteering','meeting')),
  context_id   TEXT NOT NULL,                  -- volunteering_sessions.id | meetings.id
  member_id    INTEGER NOT NULL,              -- team_members.id | committee_members.id
  status       TEXT NOT NULL CHECK (status IN ('present','absent')),
  marked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (context_type, context_id, member_id)
);

CREATE TABLE IF NOT EXISTS communication (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  context_type   TEXT NOT NULL CHECK (context_type IN ('team','committee')),
  context_id     INTEGER NOT NULL,
  group_name     TEXT NOT NULL DEFAULT '',
  group_link     TEXT NOT NULL DEFAULT '',
  broadcast_name TEXT NOT NULL DEFAULT '',
  broadcast_link TEXT NOT NULL DEFAULT '',
  updated_at     TEXT,
  UNIQUE (context_type, context_id)
);

CREATE TABLE IF NOT EXISTS message_drafts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT UNIQUE,                    -- MSG-### / CDR-###
  context_type TEXT NOT NULL CHECK (context_type IN ('team','committee')),
  context_id   INTEGER NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL DEFAULT '',
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Pooja module ---------------------------------
CREATE TABLE IF NOT EXISTS pooja_types (        -- catalog (seeded, upsert on code)
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  code                 TEXT UNIQUE,            -- PTY-###
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  default_duration_min INTEGER NOT NULL DEFAULT 60,
  suggested_offerings  TEXT NOT NULL DEFAULT '',
  icon                 TEXT NOT NULL DEFAULT '',
  is_deleted           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS poojas (
  id                   TEXT PRIMARY KEY,       -- uuid (PJA-### in `code`)
  code                 TEXT UNIQUE,
  type_id              INTEGER REFERENCES pooja_types(id),
  name                 TEXT NOT NULL,
  schedule_mode        TEXT NOT NULL DEFAULT 'single' CHECK (schedule_mode IN ('single','multi')),
  default_venue        TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'planned'
                         CHECK (status IN ('planned','today','completed','done','extended','cancelled')),
  color                TEXT NOT NULL DEFAULT '#6B1F2A',
  estimated_seva_amount REAL NOT NULL DEFAULT 0,
  notes                TEXT NOT NULL DEFAULT '',
  custom_json          TEXT NOT NULL DEFAULT '[]',   -- arbitrary [{label,value}]
  invitation_json      TEXT NOT NULL DEFAULT '{}',   -- card designer settings
  extended_until       TEXT,
  completed_on         TEXT,
  created_date         TEXT,
  is_deleted           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT
);

CREATE TABLE IF NOT EXISTS pooja_sessions (
  id         TEXT PRIMARY KEY,                 -- PSN-###
  pooja_id   TEXT NOT NULL REFERENCES poojas(id),
  label      TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time   TEXT NOT NULL DEFAULT '',
  venue      TEXT NOT NULL DEFAULT '',
  is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sevarthis (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,                     -- SEV-###
  devotee_id  INTEGER REFERENCES devotees(id),
  first_name  TEXT NOT NULL DEFAULT '',
  last_name   TEXT NOT NULL DEFAULT '',
  mobile      TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL DEFAULT 'Gujarat',
  committee   TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes       TEXT NOT NULL DEFAULT '',
  added_date  TEXT,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guests (             -- Guests & Pandits registry
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,                     -- GST-###
  first_name  TEXT NOT NULL DEFAULT '',
  last_name   TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT '',
  mobile      TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  state       TEXT NOT NULL DEFAULT 'Gujarat',
  notes       TEXT NOT NULL DEFAULT '',
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pooja_sevarthi_links (
  pooja_id    TEXT NOT NULL REFERENCES poojas(id),
  sevarthi_id INTEGER NOT NULL REFERENCES sevarthis(id),
  PRIMARY KEY (pooja_id, sevarthi_id)
);
CREATE TABLE IF NOT EXISTS pooja_coordinator_links (
  pooja_id TEXT NOT NULL REFERENCES poojas(id),
  user_id  INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (pooja_id, user_id)
);
CREATE TABLE IF NOT EXISTS pooja_guest_links (
  pooja_id TEXT NOT NULL REFERENCES poojas(id),
  guest_id INTEGER NOT NULL REFERENCES guests(id),
  PRIMARY KEY (pooja_id, guest_id)
);

-- ---------- Donations module ----------------------------
CREATE TABLE IF NOT EXISTS donation_categories (   -- catalog (seeded)
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,                     -- DCT-###
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('cash','kind')),
  icon        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS donors (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE,                  -- DNR-###
  type           TEXT NOT NULL DEFAULT 'individual'
                   CHECK (type IN ('individual','organization','trust')),
  first_name     TEXT NOT NULL DEFAULT '',
  last_name      TEXT NOT NULL DEFAULT '',
  org_name       TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  mobile         TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL DEFAULT '',
  state          TEXT NOT NULL DEFAULT 'Gujarat',
  committee      TEXT NOT NULL DEFAULT '',
  pan            TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  added_date     TEXT,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT
);

CREATE TABLE IF NOT EXISTS donations (
  id                 TEXT PRIMARY KEY,         -- uuid (DON-### in `code`)
  code               TEXT UNIQUE,
  receipt_no         TEXT,                     -- REC-YYYY-NNN  (services/receiptNumber.js)
  cert_no            TEXT,                     -- CERT-YYYY-NNN
  donor_id           INTEGER NOT NULL REFERENCES donors(id),
  category_id        INTEGER NOT NULL REFERENCES donation_categories(id),
  mode               TEXT NOT NULL DEFAULT 'Cash',
  amount             REAL NOT NULL DEFAULT 0,  -- cash path
  item               TEXT NOT NULL DEFAULT '', -- in-kind path
  qty                TEXT NOT NULL DEFAULT '',
  valuation          REAL NOT NULL DEFAULT 0,
  date               TEXT NOT NULL,
  purpose            TEXT NOT NULL DEFAULT '',
  committee          TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','pledged')),
  certificate_issued INTEGER NOT NULL DEFAULT 0,
  notes              TEXT NOT NULL DEFAULT '',
  recorded_by        TEXT NOT NULL DEFAULT '',
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);

-- ---------- Events module -------------------------------
CREATE TABLE IF NOT EXISTS event_types (        -- catalog (seeded)
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT UNIQUE,                     -- EVT-###
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id                TEXT PRIMARY KEY,          -- uuid (EVN-### in `code`)
  code              TEXT UNIQUE,
  type_id           INTEGER REFERENCES event_types(id),
  name              TEXT NOT NULL,
  venue             TEXT NOT NULL DEFAULT '',
  in_charge_id      INTEGER REFERENCES users(id),
  expected_footfall INTEGER NOT NULL DEFAULT 0,
  budget            REAL NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'planning'
                      CHECK (status IN ('planning','confirmed','ongoing','completed','cancelled')),
  color             TEXT NOT NULL DEFAULT '#C96A20',
  notes             TEXT NOT NULL DEFAULT '',
  created_date      TEXT,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT
);

CREATE TABLE IF NOT EXISTS event_days (          -- child of events (mirrors pooja_sessions)
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   TEXT NOT NULL REFERENCES events(id),
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time   TEXT NOT NULL DEFAULT '',
  is_deleted INTEGER NOT NULL DEFAULT 0
);

-- ---------- Visits (padhramani) -------------------------
CREATE TABLE IF NOT EXISTS visits (
  id           TEXT PRIMARY KEY,               -- uuid (VIS-### in `code`)
  code         TEXT UNIQUE,
  devotee_name TEXT NOT NULL,
  devotee_id   INTEGER REFERENCES devotees(id),
  mobile       TEXT NOT NULL DEFAULT '',
  purpose      TEXT NOT NULL DEFAULT 'other'
                 CHECK (purpose IN ('home_inauguration','shop_opening','wedding_blessing',
                                    'health_blessing','business_puja','festival_padhramani','other')),
  address      TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  state        TEXT NOT NULL DEFAULT 'Gujarat',
  date         TEXT NOT NULL,
  time         TEXT NOT NULL DEFAULT '',
  escort_team  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'requested'
                 CHECK (status IN ('requested','scheduled','confirmed','completed','cancelled')),
  notes        TEXT NOT NULL DEFAULT '',
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);

-- ---------- core registers (app.js state) ---------------
CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,                      -- EXP-###
  title      TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT '',
  amount     REAL NOT NULL DEFAULT 0,
  date       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Paid','Pending')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE,                      -- INV-###
  item       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT '',
  stock      TEXT NOT NULL DEFAULT '',
  min_stock  TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'In Stock'
               CHECK (status IN ('In Stock','Low Stock','Out of Stock')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- universal audit log ------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,               -- uuid
  user_id      INTEGER,
  user_email   TEXT NOT NULL DEFAULT '',
  module       TEXT NOT NULL DEFAULT '',       -- 'Management'|'Pooja'|'Committee'|'Event'|'Donation'|'Visit'|'Auth'|'Admin'
  action       TEXT NOT NULL,                  -- CREATE|UPDATE|SOFT_DELETE|CONFIRM|CANCEL|LOGIN|LOGOUT|APPROVE|DECLINE|IMPERSONATE
  entity_type  TEXT NOT NULL DEFAULT '',
  entity_id    TEXT NOT NULL DEFAULT '',
  scope_id     TEXT NOT NULL DEFAULT '',       -- owned-entity id for persona filtering (team/committee code, pooja id, …)
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- indexes: the real query paths --------------
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_role    ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_sessions_user      ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_lead         ON teams(lead_id);              -- lead scope
CREATE INDEX IF NOT EXISTS idx_committees_leader  ON committees(leader_id);       -- leader scope
CREATE INDEX IF NOT EXISTS idx_events_incharge    ON events(in_charge_id);        -- incharge scope
CREATE INDEX IF NOT EXISTS idx_pcoord_user        ON pooja_coordinator_links(user_id); -- coordinator scope
CREATE INDEX IF NOT EXISTS idx_team_members_team  ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_cmt_members_cmt    ON committee_members(committee_id);
CREATE INDEX IF NOT EXISTS idx_vsessions_team     ON volunteering_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_vsessions_date     ON volunteering_sessions(date); -- calendar range
CREATE INDEX IF NOT EXISTS idx_meetings_cmt       ON meetings(committee_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date      ON meetings(date);              -- calendar range
CREATE INDEX IF NOT EXISTS idx_psessions_pooja    ON pooja_sessions(pooja_id);
CREATE INDEX IF NOT EXISTS idx_psessions_date     ON pooja_sessions(date);        -- calendar range
CREATE INDEX IF NOT EXISTS idx_event_days_event   ON event_days(event_id);
CREATE INDEX IF NOT EXISTS idx_event_days_date    ON event_days(date);            -- calendar range
CREATE INDEX IF NOT EXISTS idx_visits_date        ON visits(date);
CREATE INDEX IF NOT EXISTS idx_visits_status      ON visits(status);
CREATE INDEX IF NOT EXISTS idx_donations_date     ON donations(date);
CREATE INDEX IF NOT EXISTS idx_donations_status   ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_donor    ON donations(donor_id);
CREATE INDEX IF NOT EXISTS idx_attendance_ctx     ON attendance(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_audit_module_time  ON audit_logs(module, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_scope        ON audit_logs(scope_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity       ON audit_logs(entity_type, entity_id);
```

---

## 3. DB management & reuse — improvements over the reference

The reference uses **one static `schema.sql`** applied statement-by-statement on
every boot, plus an **append-only `safeAlter[]`** array of `ALTER TABLE … ADD
COLUMN` wrapped in `try{}catch(_){}`. That works but has no history, no
down-path, no way to change a column, and silently swallows every ALTER error.
This plan replaces it.

### 3.1 Numbered migrations + a tracking table

```
server/db/migrations/
  001_init.sql          -- the full schema in §2.4
  002_add_visit_devotee_fk.sql
  003_…                  -- one file per change, forward-only, never edited once shipped
```

`server/db/migrate.js`:

```js
async function runMigrations() {
  await run(`CREATE TABLE IF NOT EXISTS schema_migrations
             (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const done = new Set((await queryAll('SELECT version FROM schema_migrations')).map(r => r.version));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    await run('BEGIN');
    try {
      for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) await run(stmt);
      await run('INSERT INTO schema_migrations (version) VALUES (?)', [f]);
      await run('COMMIT');
      console.log('migrated', f);
    } catch (e) { await run('ROLLBACK'); throw e; }   // fail LOUD, unlike safeAlter
  }
}
```

`package.json` scripts: `"migrate": "node server/db/migrate.js"`,
`"seed": "node server/db/migrate.js --seed"`,
`"demo": "node server/db/migrate.js --seed --demo"`.

### 3.2 `CHECK` constraints on every enum

Already inlined in §2.4. The domain is enum-heavy — donation `status`
(received/pledged), donation category `kind` (cash/kind), donor `type`, visit
`status` (requested→scheduled→confirmed→completed/cancelled) and `purpose`,
event `status`, pooja `status`, session/meeting attendance `status`, member
`status`, signup `status`. Every one gets a `CHECK (col IN (...))` so a bad
write fails at the DB, not three screens later.

### 3.3 FK enforcement on both drivers

See §1.5 — `PRAGMA foreign_keys = ON` after connect for libsql too (the
reference only sets it for better-sqlite3). All FK columns declared `REFERENCES`
in §2.4.

### 3.4 Idempotent reference-data seed

`server/db/seed/reference-data.js` — safe to run on every boot:

```js
async function upsert(table, code, cols) {
  const keys = Object.keys(cols);
  await run(
    `INSERT INTO ${table} (code, ${keys.join(',')}) VALUES (?, ${keys.map(()=>'?').join(',')})
     ON CONFLICT(code) DO UPDATE SET ${keys.map(k => `${k}=excluded.${k}`).join(',')}`,
    [code, ...keys.map(k => cols[k])]
  );
}
// donation_categories (DCT-001..010), pooja_types (PTY-001..016),
// event_types (EVT-001..010)  — the exact seed arrays from donations.js /
// pooja.js / events.js.  committees (CMT-001..003 + samaj) created only if absent.
```

Demo data (devotees, members, sessions, donations, meetings, …) lives in a
**separate** `server/db/seed/demo-data.js` run only with `--demo`, and only when
the target table is empty — same guard as the reference `seed()`.

### 3.5 Server-authoritative derived reads

The front-end currently computes cross-module rollups in JS: `calEntries()`
(calendar.js), `dashFigures()` / `dashTodayItems()` (dashboard.js),
`mergedActivity()` (people.js), `accessSummary()` (people.js). These must become
server endpoints so they can't drift and can't be spoofed by a scoped client.

- **SQL VIEWs** for the single-source pieces:

  ```sql
  CREATE VIEW v_cal_pooja AS
    SELECT s.date, s.start_time AS time, 'pooja' AS type, p.id AS scope_id,
           p.name AS title, p.color, s.label, s.venue
    FROM pooja_sessions s JOIN poojas p ON p.id = s.pooja_id
    WHERE s.is_deleted = 0 AND p.is_deleted = 0;

  CREATE VIEW v_cal_meeting AS
    SELECT m.date, m.start_time AS time, 'committee' AS type, c.code AS scope_id,
           m.title, c.color, m.venue
    FROM meetings m JOIN committees c ON c.id = m.committee_id
    WHERE m.is_deleted = 0 AND c.is_deleted = 0;

  CREATE VIEW v_cal_event AS
    SELECT d.date, d.start_time AS time, 'event' AS type, e.id AS scope_id,
           e.name AS title, e.color, e.venue
    FROM event_days d JOIN events e ON e.id = d.event_id
    WHERE d.is_deleted = 0 AND e.is_deleted = 0;

  CREATE VIEW v_cal_visit AS
    SELECT date, time, 'visit' AS type, id AS scope_id,
           devotee_name AS title, '#4C8B5A' AS color, address AS venue
    FROM visits WHERE is_deleted = 0;

  CREATE VIEW v_cal_pledge AS
    SELECT date, '' AS time, 'donation' AS type, id AS scope_id,
           purpose AS title, '#C9A24A' AS color, '' AS venue
    FROM donations WHERE is_deleted = 0 AND status = 'pledged';
  ```

- **`server/services/calendar.js`** — `entriesForMonth(monthKey, scope)`
  `UNION ALL`s the five views with `date BETWEEN ? AND ?`, then, when `scope` is
  a restricted persona, filters `type`/`scope_id` exactly like
  `dashboard.js personaScope`. `GET /api/calendar?month=YYYY-MM`.
- **`server/services/dashboard.js`** — `figures(user)` returns the
  `dashFigures()` shape (poojaToday, donCash, donKind, meetings, events, visits,
  needSevarthi, unconfirmedVisits, …), scoped. `GET /api/dashboard`.
- **`server/services/reports.js`** — the month-summary rows from
  `access.js renderReports()`. `GET /api/reports?month=YYYY-MM`.
- **`GET /api/activity?module=&scopeId=&limit=`** — replaces `mergedActivity()`;
  now a single indexed table sort, no client merge.

SQLite has **no stored procedures** — so "procedure logic" stays in
`server/services/` exactly as the reference keeps it in `billNumber.js` /
`audit.js`:

- **`server/services/receiptNumber.js`** — mirrors `billNumber.js`.
  `nextReceiptNo(dateStr)` → `REC-YYYY-NNN`, `nextCertNo(dateStr)` →
  `CERT-YYYY-NNN`; both atomically `UPDATE counters SET next_value = next_value+1
  WHERE name = ?` then format. Called when a donation is saved / a certificate
  is issued. Replaces `nextReceiptNo()` / `nextCertNo()` in `donations.js`.
- **`server/services/entityCode.js`** — `allocate('member')` →
  `MEM-0031` from the `counters` row. Replaces the client `nextId()` /
  `cmtNextId()` / `evNextId()` in every module store.
- **`server/services/audit.js`** — copy the reference `logAudit()` and
  `formatActivity()`; extend the row with `module` + `scope_id`.

### 3.6 Exact table boilerplate (copy for any new table)

```sql
CREATE TABLE IF NOT EXISTS <plural> (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,       -- OR: id TEXT PRIMARY KEY (uuid) for a transaction/event
  code         TEXT UNIQUE,                             -- registries only; allocated by services/entityCode.js
  <owner>_id   INTEGER NOT NULL REFERENCES <parent>(id),-- the scope column; always indexed
  <text_col>   TEXT    NOT NULL DEFAULT '',
  <money_col>  REAL    NOT NULL DEFAULT 0,
  <bool_col>   INTEGER NOT NULL DEFAULT 0,              -- booleans as 0/1
  status       TEXT    NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','confirmed','cancelled')),
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_<plural>_<owner> ON <plural>(<owner>_id);
```

Then: add a `map<Entity>()` to `utils/mappers.js`, a `routes/<plural>.js`
Router, and — if it needs a code — a `counters` seed row.

---

## 4. Code & folder structure

### 4.1 Proposed `server/` tree (mirrors the reference)

```
server/
  index.js                  app entry — middleware, route mounts, boot sequence (§1.2)
  config.js                 the only reader of process.env (§1.4)
  middleware/
    auth.js                 authRequired (JWT + live-session jti check), signToken
    authz.js                requireRole(...roles), attachScope, ROLE_PAGES
    error.js                notFound + global error handler (masks messages in prod)
  routes/                   one Router per resource — HTTP only (parse req → call service/db → shape res)
    auth.js  sessions.js  users.js  devotees.js  settings.js
    teams.js  teamMembers.js  volunteeringSessions.js  attendance.js
    publicPages.js  publicSignups.js  messageDrafts.js  communication.js
    poojas.js  poojaTypes.js  poojaSessions.js  sevarthis.js  guests.js
    committees.js  committeeMembers.js  meetings.js
    donations.js  donors.js  donationCategories.js
    events.js  eventTypes.js
    visits.js  expenses.js  inventory.js
    calendar.js  dashboard.js  reports.js  activity.js  backup.js
  services/                 logic, no req/res
    otp.js  mailer.js  audit.js
    receiptNumber.js  entityCode.js
    calendar.js  dashboard.js  reports.js  authz.js
  utils/
    mappers.js              snake_case row → camelCase DTO (mapX); attachScope helper lives in middleware/authz.js
  db/
    connection.js           better-sqlite3 / libsql abstraction — queryAll/queryOne/run
    migrate.js              numbered-migration runner + seed entrypoints
    migrations/001_init.sql …
    seed/reference-data.js  seed/demo-data.js
public/                     the moved front-end
  index.html  login.html  css/  assets/
  js/  (existing modules, unchanged load order)  + api.js  store.js  boot.js
```

### 4.2 Layering rules (verbatim from the reference, adapted)

- **Routes call services and `db/connection.js` only** — never the reverse; a
  service never `require`s a route.
- **DB access only through `db/connection.js`** (`queryAll` / `queryOne` /
  `run`). Never call `better-sqlite3` or `@libsql/client` directly.
- **Env only through `config.js`.** No `process.env` in routes or services.
- **snake_case ↔ camelCase only in `utils/mappers.js`.** Every route returns
  `mapX(row)` / `rows.map(mapX)`; request bodies are camelCase. Keep legacy
  aliases when a module still reads an old field name (the reference does this
  for `phone`/`gst`/`proprietor`).
- **Soft delete** — `UPDATE … SET is_deleted = 1`; the only hard `DELETE` is
  `/api/backup/wipe` (admin).
- **Partial-PUT merge** — read the existing row first, then
  `b.field ?? existing.field` for every column so a partial body can't blank a
  `NOT NULL` column (copied straight from `clients.js`).
- **`logAudit()` on every mutation** — CREATE / UPDATE / SOFT_DELETE / CONFIRM /
  CANCEL / APPROVE / DECLINE / LOGIN / LOGOUT / IMPERSONATE.
- **Per-handler `try/catch`** returning `res.status(4xx|500).json({ error })`,
  plus a global error handler as the backstop.
- **No ORM, no TypeScript, no test runner** (matches the reference; verification
  is manual + `/health`).
- **One Router per resource**; routers are HTTP-only. Anything with no `req` /
  `res` (numbering, aggregation, code allocation, mail) is a `services/` module.

### 4.3 `req.user` and `req.scope`

`authRequired` sets `req.user = { id, email, roles: ['committee_leader', …],
jti, impersonatedBy }` from the JWT. `attachScope` (runs right after, on
`/api`) adds:

```js
req.scope = {
  isAdmin:      roles.includes('superadmin') || roles.includes('admin'),  // full unfiltered access
  isSuperadmin: roles.includes('superadmin'),                            // + the 4 privileged ops (§5.2a)
  roles,
  teamIds:      [...],   // teams.lead_id       = req.user.id
  committeeIds: [...],   // committees.leader_id = req.user.id
  poojaIds:     [...],   // pooja_coordinator_links.user_id = req.user.id
  eventIds:     [...],   // events.in_charge_id  = req.user.id
};
```

Every module route then filters with the same shape ChallanPro uses for
`company_id`, e.g. `teams.js` GET:

```js
const rows = req.scope.isAdmin
  ? await queryAll('SELECT * FROM teams WHERE is_deleted = 0 ORDER BY name')
  : await queryAll(
      `SELECT * FROM teams WHERE is_deleted = 0 AND id IN (${qmarks(req.scope.teamIds)}) ORDER BY name`,
      req.scope.teamIds);
res.json(rows.map(mapTeam));
```

…and on write, asserts the target's owner id ∈ the scope set before touching
the row (403 otherwise).

### 4.4 Route inventory (endpoints)

Standard CRUD shape unless noted. All under `/api`, all behind
`authRequired` + `attachScope` except `/api/auth/*`.

| Router | Endpoints | Notes |
| --- | --- | --- |
| `auth` | `POST /start-login` · `POST /request-setup-otp` · `POST /setup-authenticator` · `POST /verify-authenticator` · `GET /me` · `POST /logout` · `POST /impersonate` · `POST /stop-impersonate` | public; `/me` returns `{ user, pages }`; impersonation = superadmin only (§6) |
| `sessions` | `GET /` · `DELETE /:id` · `DELETE /?others=1` | own sessions always; all sessions if admin |
| `users` | `GET /` · `POST /` · `PUT /:id` · `PUT /:id/roles` · `PUT /:id/activate` · `DELETE /:id` | `superadmin` **+ `admin`** for non-privileged targets; `assertCanGrant` / `assertCanTouchUser` reserve `admin`/`superadmin` rows for `superadmin` (§5.2a). `DELETE` = `active=0` **+ revoke that user's sessions** |
| `devotees` | `GET /` · `POST /` · `PUT /:id` · `DELETE /:id` | shared registry |
| `settings` | `GET /` · `PUT /identity` · `PUT /language` · `PUT /working-date` | `app_settings` KV |
| `teams` | CRUD | list/read/write scoped to `req.scope.teamIds` |
| `teamMembers` | `GET /?teamId=` · `POST /` · `PUT /:id` · `DELETE /:id` | `requireTeamId` helper mirrors `requireCompanyId` |
| `volunteeringSessions` | CRUD · `POST /:id/complete` | roster in body → `member_ids_json` |
| `attendance` | `GET /?contextType=&contextId=` · `PUT /` (upsert one `{contextType,contextId,memberId,status}`) | used by both Management + Committee |
| `publicPages` | `GET /:teamId` · `PUT /:teamId` | |
| `publicSignups` | `GET /?teamId=` · `POST /` (public? see §8) · `PUT /:id/approve` · `PUT /:id/decline` | approve creates a `team_members` row + adds to the session roster |
| `messageDrafts` | `GET /?contextType=&contextId=` · CRUD | |
| `communication` | `GET /?contextType=&contextId=` · `PUT /` (upsert) | |
| `poojaTypes` | CRUD | catalog; admin only for write |
| `poojas` | CRUD · `PUT /:id/status` | write asserts `req.scope.poojaIds`; links passed in body |
| `poojaSessions` | `GET /?poojaId=` · `POST /` · `PUT /:id` · `DELETE /:id` | child of pooja |
| `sevarthis` | CRUD | module-local registry, dedupe by mobile |
| `guests` | CRUD | Guests & Pandits registry |
| `committees` | CRUD | scoped to `req.scope.committeeIds` |
| `committeeMembers` | `GET /?committeeId=` · CRUD | |
| `meetings` | CRUD · `POST /:id/complete` | |
| `donationCategories` | CRUD | catalog; accountant/admin |
| `donors` | CRUD | dedupe by mobile |
| `donations` | CRUD · `POST /:id/issue-certificate` | `receipt_no` via `receiptNumber.js` on create; `cert_no` on issue |
| `eventTypes` | CRUD | catalog |
| `events` | CRUD | `days` in body → `event_days`; scoped to `req.scope.eventIds` |
| `visits` | CRUD | |
| `expenses` | CRUD | accountant/admin |
| `inventory` | CRUD | admin |
| `calendar` | `GET /?month=YYYY-MM` | scoped aggregation |
| `dashboard` | `GET /` | scoped figures + today items |
| `reports` | `GET /?month=YYYY-MM` | month summary rows |
| `activity` | `GET /?module=&scopeId=&limit=` | audit feed |
| `backup` | `GET /export` · `POST /import` · `DELETE /wipe` | admin only, copied from reference `index.js` |

### 4.5 Request lifecycle — `POST /api/meetings` end to end

1. **Browser.** `committee-forms.js` `handleSaveMeeting(e)` builds
   `{ committeeId, title, date, startTime, endTime, venue, agenda, memberIds }`
   and calls `persistMeeting(payload)` (new helper in `store.js`), which routes
   to `API.post('/meetings', payload)` because there is no `id`.
2. **`api.js`.** `fetch('/api/meetings', { method:'POST', credentials:'include',
   headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })`.
   The httpOnly `token` cookie rides along automatically.
3. **Express stack.** `helmet` → `cors` (origin in `ALLOWED_ORIGINS`) →
   `express.json` parses the body → `cookieParser`.
4. **`app.use('/api', authRequired)`.** Reads `req.cookies.token`, `jwt.verify`
   with `config.jwtSecret`. Rejects `401` if absent/expired. Requires
   `payload.jti`; `SELECT revoked FROM sessions WHERE id = ?` — `401 "Session
   ended"` if missing or revoked. Fire-and-forget `UPDATE sessions SET last_seen
   = datetime('now')`. Sets `req.user`.
5. **`attachScope`.** `SELECT id FROM committees WHERE leader_id = ?` →
   `req.scope.committeeIds`; `req.scope.isAdmin` from roles.
6. **Router `routes/meetings.js`**, handler chain
   `requireRole('superadmin','admin','committee_leader')` → the `POST /` body.
   - Guard: `if (!req.scope.isAdmin &&
     !req.scope.committeeIds.includes(committeeId)) return res.status(403)…`.
   - Validate: `title` and `date` present, `date` matches `YYYY-MM-DD`, else
     `400`.
   - `const id = crypto.randomUUID();`
     `const code = await entityCode.allocate('meeting');` → `MTG-007`.
   - `await run('INSERT INTO meetings (id, code, committee_id, title, date,
     start_time, end_time, venue, agenda, member_ids_json, notes, completed)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,0)', [...])`.
   - `await logAudit({ userId: req.user.id, userEmail: req.user.email,
     module: 'Committee', action: 'CREATE', entityType: 'meeting',
     entityId: id, scopeId: committeeCode, details: { title } })`.
   - `const row = await queryOne('SELECT * FROM meetings WHERE id = ?', [id]);`
   - `res.status(201).json(mapMeeting(row));`
7. **Global error handler** catches anything thrown; returns
   `{ error: config.isProd ? 'Internal server error' : err.message }`.
8. **Browser.** `persistMeeting` resolves with the DTO; `store.js` pushes it
   into `CMT.meetings` (server is source of truth for `id`/`code`), then
   `renderCommittee()` + `renderUnifiedCalendar()` re-render.

---

## 5. Passwordless TOTP authentication

Copy the reference flow **exactly** (`speakeasy` + `qrcode`, `server/routes/auth.js`),
renaming the product string to `config.appName`.

### 5.1 Flow (unchanged from ChallanPro)

1. `POST /api/auth/start-login { email }` → `findUser` (`WHERE email = ? AND
   active = 1`); `403` if unknown/disabled; else `{ ok, totpEnabled, step:
   totpEnabled ? 'verify' : 'setup' }`.
2. First-time only: `POST /api/auth/request-setup-otp { email }` — always
   returns `{ ok: true }` (enumeration-safe); if the user exists and no live
   OTP, generate a 6-digit code (`services/otp.js`) and email it
   (`services/mailer.js`; console fallback in dev). Rate-limited 10 / 15 min.
3. `POST /api/auth/setup-authenticator { email, otp }` — `verifyOtp` gate;
   issue a fresh `speakeasy` secret (or reuse a pending one), store
   `totp_secret`, `totp_enabled = 0`; return `{ qr, secret }` — a
   `otpauth://totp/<APP_NAME>:<email>?secret=…&issuer=<APP_NAME>` data-URI QR.
4. `POST /api/auth/verify-authenticator { email, code }` — in-process
   `email:ip` attempt bucket (5 / 5 min → `429`); `speakeasy.totp.verify({
   window: 1 })`; on success `totp_enabled = 1`, **create a `sessions` row**
   (`jti = crypto.randomUUID()`), `signToken(user, jti)`, set the cookie,
   `logAudit LOGIN`, return `{ user: { id, email, roles } }`.
5. `GET /api/auth/me` — verify cookie; if `jti` revoked → `{ user: null }`;
   else `{ user, pages }` where `pages = authz.pagesForUser(user)`.
6. `POST /api/auth/logout` — `UPDATE sessions SET revoked = 1 WHERE id = jti`,
   clear cookie.

### 5.2 `people.js` → server

- `ACCOUNTS` becomes the `users` + `user_roles` tables. `email` unique,
  `active`, `totp_secret`, `totp_enabled`. `GET /api/users` feeds the existing
  **Accounts & Access** table.
- `ROLE_META` (role → pages) becomes `ROLE_PAGES` in `middleware/authz.js`,
  identical keys:

  ```js
  const ROLE_PAGES = {
    superadmin:        ['*'],
    admin:             ['*'],          // second tier — see §5.2a
    management_lead:   ['dashboard', 'management'],
    pooja_coordinator: ['dashboard', 'puja'],
    committee_leader:  ['dashboard', 'committees'],
    event_incharge:    ['dashboard', 'events', 'calendar'],
    accountant:        ['dashboard', 'donations', 'expenses', 'reports'],
  };

  // Roles only a superadmin may grant/revoke, and whose holders only a
  // superadmin may disable. Everything else about `admin` == `superadmin`.
  const PRIVILEGED_ROLES = ['superadmin', 'admin'];
  ```

### 5.2a The two-tier `admin` role

`admin` sits **directly below `superadmin`**: it opens every page and performs
every module operation a superadmin can — full CRUD across poojas, sevas,
donations (+ receipts + certificates), committees + meetings + attendance,
events, volunteer teams + volunteering + badges, Bhuvaji visits, devotees,
expenses, inventory and all catalogs; it sees the whole unscoped dashboard, the
Unified Calendar with every entry, Reports & Analytics, the Accounts & Access
page (full account list + live audit trail) and Settings.

Only **`superadmin`** keeps these four operations:

| Operation | Endpoint(s) | Guard |
| --- | --- | --- |
| Grant / revoke the `admin` or `superadmin` role | `POST /api/users`, `PUT /api/users/:id/roles` | `requireRole('superadmin','admin')` **+** `assertCanGrant()` |
| Disable / re-enable a user holding a privileged role | `DELETE /api/users/:id`, `PUT /api/users/:id/activate` | `requireRole('superadmin','admin')` **+** `assertCanTouchUser()` |
| Impersonate ("Sign in as") | `POST /api/auth/impersonate` · `POST /api/auth/stop-impersonate` | `requireRole('superadmin')` |
| Import a backup / wipe the database | `POST /api/backup/import` · `DELETE /api/backup/wipe` | `requireRole('superadmin')` |

`GET /api/backup/export` is read-only → `requireRole('superadmin','admin')`.

**`services/authz.js`:**

```js
function isFullAccess(roles)  { return roles.includes('superadmin') || roles.includes('admin'); }
function isSuperadmin(roles)  { return roles.includes('superadmin'); }

// throw {status:403} unless the actor may set exactly these roles on a target
function assertCanGrant(actorRoles, targetRoles) {
  if (isSuperadmin(actorRoles)) return;
  if (targetRoles.some(r => PRIVILEGED_ROLES.includes(r)))
    throw Object.assign(new Error('Only a Super Admin can assign the Admin or Super Admin role'), { status: 403 });
}

// throw unless the actor may disable / edit / re-enable this target user
async function assertCanTouchUser(actorRoles, targetUserId) {
  if (isSuperadmin(actorRoles)) return;
  const rows = await queryAll('SELECT role FROM user_roles WHERE user_id = ?', [targetUserId]);
  if (rows.some(r => PRIVILEGED_ROLES.includes(r.role)))
    throw Object.assign(new Error('Only a Super Admin can manage an Admin or Super Admin account'), { status: 403 });
}
```

Bootstrap is unchanged — `ensureAdminUser()` still creates the **one**
`superadmin` from `ADMIN_EMAIL`; that account then creates `admin` accounts
through the Accounts & Access UI. Provisioning flow: superadmin → **+ Add
Account** → email + name → tick **Administrator** → save; the person completes the
passwordless login (email OTP → authenticator) and now holds an `admin` session.

Frontend: `people.js` `ROLE_META.admin = { icon:'🛡️', pages:['*'] }`, i18n
`role_admin` = *Administrator / एडमिन / એડમિન*, `accountPages()` short-circuits to
`['*']` for `admin` too. `dashboard.js activePersona()` and `app.js
currentAllowedPages()` already treat "not a scoped module session" as
full-access, so an `admin` user gets the superadmin view unchanged. The
Accounts & Access page hides the **Sign in as** button and the Admin/Super Admin
role checkboxes when the logged-in user is not `superadmin` (`/me` returns
`isSuperadmin` for this).
- `accountPages(id)` (union of a user's roles' pages) → `authz.pagesForUser` —
  returned by `/me` so the SPA can hide nav (cosmetic; the API is the real
  gate). `accessSummary()` → `services/authz.js` from `SELECT role,
  COUNT(*) FROM user_roles GROUP BY role`.

### 5.3 Roles → `requireRole` + owned-entity scope

| Role | `requireRole` on | Scoped by |
| --- | --- | --- |
| `superadmin` | everything, and the **only** role for impersonation + `backup/import` + `backup/wipe` + granting privileged roles | no filter |
| `admin` | every module router + `users` (create/edit non-privileged) + `sessions` + `inventory` + catalog writes + `reports` + `backup/export` | no filter (`req.scope.isAdmin = true`) |
| `management_lead` | `teams`, `teamMembers`, `volunteeringSessions`, `attendance`, `publicPages`, `publicSignups`, `messageDrafts`, `communication` | `teams.lead_id = me` → `req.scope.teamIds` |
| `pooja_coordinator` | `poojas`, `poojaSessions`, `sevarthis`, `guests` (read), `attendance` (n/a) | `pooja_coordinator_links.user_id = me` → `req.scope.poojaIds` |
| `committee_leader` | `committees`, `committeeMembers`, `meetings`, `attendance`, `messageDrafts`, `communication` | `committees.leader_id = me` → `req.scope.committeeIds` |
| `event_incharge` | `events`, `eventTypes` (read), `calendar` | `events.in_charge_id = me` → `req.scope.eventIds` |
| `accountant` | `donations`, `donors`, `donationCategories`, `expenses`, `reports` | role only (all rows) |

`dashboard`, `calendar`, `activity` are readable by everyone but **return
scoped data** (services apply the same `req.scope`).

### 5.4 `login.html`

A standalone page in `public/`, adapted from the reference `login.html`
(4-step: email → email-OTP → QR → 6-digit code), restyled in the temple palette
(maroon `#6B1F2A` / saffron `#C96A20`, `Cinzel` heading). It is **outside** the
SPA — no `i18n.js` / module load order, no splash loader. `api.js` redirects
here on any `401`. On success it `window.location = '/'`.

---

## 6. Revocable sessions

Copy the reference `sessions` table, `middleware/auth.js` and
`routes/sessions.js` almost verbatim.

- **`sessions`** row per successful `verify-authenticator`
  (`id = jti`, `user_id`, `user_email`, `user_agent`, `ip`, `created_at`,
  `last_seen`, `revoked`, plus **`impersonated_by`** for §6.2).
- **`signToken(user, jti)`** puts `{ id, email, roles, jti }` in a 7-day HS256
  JWT (reference stores a single `role`; here `roles` is the array).
- **`authRequired`** on every `/api` request: `jwt.verify` → require `jti` →
  `SELECT revoked FROM sessions WHERE id = ?` → `401` if missing/revoked →
  bump `last_seen` (fire-and-forget) → `req.user = payload`.
- **`GET /api/sessions`** — a normal user sees their own rows
  (`WHERE user_id = ? AND revoked = 0`); a `superadmin` sees all. Each row is
  flagged `current: r.id === req.user.jti`.
- **`DELETE /api/sessions/:id`** — revoke one (own, or any if admin).
- **`DELETE /api/sessions?others=1`** — revoke all of the caller's other
  sessions, keep the current one.
- **`POST /api/auth/logout`** — revokes the current `jti`.
- **`GET /api/auth/me`** honours revocation (returns `{ user: null }`).

### 6.1 Replacing the client role selector

The top-bar **role selector** and `changeRoleScope()` / `signInAs()` in
`access.js` were a pure client-side pretend. They are removed. The active
persona is now **whatever roles the logged-in `users` row has** — `MG.session` /
`POOJA.session` / `CMT.session` are set once, on boot, from `/api/auth/me`
(`store.js` maps `roles` → the per-module `session.role` the `-ui.js` chrome
already keys on: `management_lead` → `MG.session = { role:'lead', userId }`,
etc.). A user with multiple roles gets multiple module sessions active (the app
already tolerates this via `resetOthers`).

### 6.2 "Sign in as" → real impersonation (recommended, gated)

Keep the training/support affordance, but make it a real, audited,
**superadmin-only** server action — a second-tier `admin` **cannot** impersonate
(that would let an admin act as a superadmin):

- `POST /api/auth/impersonate { userId }` — `requireRole('superadmin')`;
  creates a **new** `sessions` row with `impersonated_by = req.user.id`, issues a
  **short-lived** JWT (1 h) carrying the *target* user's `id`/`email`/`roles`
  plus `impersonating: true`; sets the cookie; `logAudit IMPERSONATE`.
- `POST /api/auth/stop-impersonate` — revokes the impersonation session; the
  admin's original session (still un-revoked) resumes on next login, or the
  endpoint re-issues the admin's own token if the original `jti` is passed
  back.
- Guards: no nested impersonation (`403` if `req.user.impersonating`); every
  mutation during impersonation is audited with both `user_id` (target) and
  `details.impersonatedBy`. `GET /api/sessions` shows impersonation rows
  distinctly so the admin can see and kill them.
- **Open decision:** ship this, or drop "Sign in as" entirely and rely on test
  accounts. Recommendation: ship it — it is genuinely useful for a temple
  helpdesk and the blast radius is contained.

---

## 7. Login hardening

All copied from the reference unless marked **new**.

- **OTP endpoint rate limit** — `express-rate-limit`, 10 / 15 min, on
  `/api/auth/request-setup-otp` (`app.set('trust proxy', 1)` makes `req.ip`
  correct behind Render).
- **Verify attempt bucket** — in-process `loginAttempts[`email`:`ip`]` array,
  5 attempts / 5 min → `429`, with `pruneLoginAttempts()` so the map can't grow
  unbounded (verbatim from `auth.js`).
- **Enumeration-safe OTP request** — `request-setup-otp` always returns
  `{ ok: true }`; it never reveals whether the email is registered.
- **Hashed OTPs** — `services/otp.js` stores `sha256(email + ':' + otp)` with a
  10-min TTL (`config.otpTtlMin`) and a 5-attempt cap; the plaintext code only
  ever lives in the email. In-memory `Map` — fine for a single Render instance;
  **new (note):** if the service is ever scaled to >1 instance, back it with an
  `otp` table (`email PK, hash, expires_at, attempts`) — same API.
- **Helmet CSP** — must permit the Google Fonts `@import` in `css/styles.css`
  and the app's pervasive inline `onclick=` / inline `<style>` / inline splash
  `<script>`:

  ```js
  helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],          // inline splash + inline handlers
      scriptSrcAttr: ["'unsafe-inline'"],                    // onclick= everywhere
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcAttr:  ["'unsafe-inline'"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:        ["'self'", "data:", "blob:"],            // inline SVG mandala, emblem data-URIs
      connectSrc:    ["'self'"],
      objectSrc:     ["'none'"],
      frameAncestors:["'self'"],
    }},
    crossOriginEmbedderPolicy: false,
  })
  ```
  Tighten `script-src` to nonces/hashes only after the inline handlers are moved
  to `addEventListener` (a later cleanup, same note the reference carries).
- **CORS** — `origin` callback allows a request only if `!origin` (same-origin /
  curl) or `config.allowedOrigins` is empty (dev) or the origin is listed;
  `credentials: true`. Set `ALLOWED_ORIGINS` to the Render URL (and any custom
  domain) in prod.
- **Global error handler** — `res.status(500).json({ error: config.isProd ?
  'Internal server error' : err.message })`; never leak stack traces or SQL in
  prod.
- **Fail-fast weak secret** — see §1.2 (also enforce length ≥ 32).
- **Cookie** — `httpOnly`, `secure: config.isProd`, `sameSite: 'strict'`,
  `maxAge: config.sessionDays * 86400_000`.
- `express.json({ limit: '1mb' })`; Helmet also strips `X-Powered-By`.

---

## 8. Multi-tenant / scoped data — client guard → server authorization

Today the SPA enforces scope **in the browser**:
`app.js currentAllowedPages()` / `canOpenPage()` / `switchPage()` bounce a scoped
persona to the dashboard; `dashboard.js personaScope()` filters the "Today" card
and activity to the persona's `calEntries` types + owned ids;
`access.js accGuard()` renders nothing into `#accessRoot` / `#reportsRoot` /
`#settingsRoot` for a persona that can't open them. **None of this is real** —
the data is all in the DOM already.

Re-expressed server-side:

| Client mechanism | Server replacement |
| --- | --- |
| `currentAllowedPages()` allow-list | `ROLE_PAGES` in `middleware/authz.js`; `/me` returns the union so the SPA can still hide nav — but it is cosmetic |
| `canOpenPage(id)` / `switchPage()` bounce | every route wrapped in `requireRole(...)`; a forbidden call is `403`, not a client redirect |
| `dashboard.js personaScope()` (types + owned ids) | `attachScope` → `req.scope`; `services/dashboard.js` and `services/calendar.js` apply exactly the same `type` + owned-id filter **before** serialising — the client never receives another persona's rows |
| `access.js accGuard()` empty-render | `GET /api/users`, `/api/reports`, `/api/settings` return `403` for a non-admin; the page renders empty because the fetch fails, same visible result, now enforced |
| `mergedActivity()` client merge | `GET /api/activity?scopeId=` — the server filters `audit_logs` by `req.scope` (its `scope_id` / `module` columns exist for exactly this) |

Every module route filters like `clients.js` filters on `company_id` — just on
the ownership column:

```js
// committees.js — GET  (mirrors clients.js GET with company_id)
router.get('/', requireRole('superadmin','admin','committee_leader'), async (req, res) => {
  try {
    const rows = req.scope.isAdmin
      ? await queryAll('SELECT * FROM committees WHERE is_deleted = 0 ORDER BY name')
      : await queryAll(
          `SELECT * FROM committees WHERE is_deleted = 0
             AND id IN (${req.scope.committeeIds.map(()=>'?').join(',') || 'NULL'}) ORDER BY name`,
          req.scope.committeeIds);
    res.json(rows.map(mapCommittee));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// …and POST/PUT/DELETE assert the target committee_id ∈ req.scope.committeeIds first.
```

**Public volunteering page** (`#/volunteer/<TEAM>`): the sign-up submission is
the one genuinely unauthenticated write. Expose it as a narrow, separate,
rate-limited route **outside** `app.use('/api', authRequired)` —
`POST /api/public/signups { teamCode, sessionCode, name, mobile, city, note }` —
that only inserts a `public_signups` row with `status = 'pending'` for a team
whose `public_pages.enabled = 1` and a session with `public_open = 1`. Nothing
else is readable or writable unauthenticated.

---

## 9. User lifecycle

- **No self-signup.** There is no `register` endpoint. `start-login` only
  succeeds for an existing `active = 1` user.
- **Admin bootstrap (reference GAP — added).** `ensureAdminUser()` runs on every
  boot, idempotent:

  ```js
  async function ensureAdminUser() {
    if (!config.adminEmail) { console.warn('ADMIN_EMAIL not set — no admin bootstrapped'); return; }
    let u = await queryOne('SELECT id FROM users WHERE email = ?', [config.adminEmail]);
    if (!u) {
      const r = await run('INSERT INTO users (email, name, active) VALUES (?,?,1)',
                          [config.adminEmail, 'Administrator']);
      u = { id: r.lastInsertRowid };
    } else {
      await run('UPDATE users SET active = 1 WHERE id = ?', [u.id]);
    }
    await run(`INSERT INTO user_roles (user_id, role) VALUES (?, 'superadmin')
               ON CONFLICT(user_id, role) DO NOTHING`, [u.id]);
  }
  ```
  (ChallanPro's `DEPLOY.md` claims first login "creates" the admin, but the code
  never does — `findUser` requires the row to already exist. This closes that
  gap.)
- **Admin (or superadmin) creates accounts** — `POST /api/users { email, name,
  mobile, roles: [] }` writes `users` + `user_roles`, running `assertCanGrant()`
  first so an `admin` cannot mint an `admin` / `superadmin` (§5.2a). The existing
  **Accounts & Access** UI (`access.js renderAccess()`, currently reading
  `ACCOUNTS`) is rewired to `GET`/`POST` `/api/users`; the Admin/Super Admin
  role checkboxes and the "Sign in as" button render only when `/me` reports
  `isSuperadmin`.
- **Disable = `active = 0` AND revoke sessions (reference GAP — added).**

  ```js
  router.delete('/:id', requireRole('superadmin', 'admin'), async (req, res) => {
    if (+req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot disable yourself' });
    await assertCanTouchUser(req.user.roles, req.params.id);   // 403 if target is admin|superadmin and actor isn't superadmin (§5.2a)
    await run('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
    await run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0', [req.params.id]); // <- added
    await logAudit({ userId: req.user.id, userEmail: req.user.email, module: 'Admin',
                     action: 'SOFT_DELETE', entityType: 'user', entityId: req.params.id });
    res.json({ ok: true });
  });
  ```
  (ChallanPro's `users.js DELETE` only sets `active = 0`; a disabled user with a
  live cookie keeps working until it expires. Revoking here makes disable
  immediate.)
- **`PUT /api/users/:id/activate`** — `active = 1`, audited.
- **`PUT /api/users/:id/roles`** — replace `user_roles` rows, audited; if a role
  that granted scope is removed, also revoke that user's sessions (they must
  re-login to get a token without the stale role).
- **Audit everything** — every users/roles/session mutation calls `logAudit`
  with `module: 'Admin'`.

---

## 10. Frontend integration plan

The front-end stays no-build vanilla JS with the **fixed script load order**.
Three new files slot in; the module stores and `-ui.js` renderers are untouched
in shape.

### 10.1 New files (load order)

```
js/i18n.js
js/api.js        ← NEW  (copy of ChallanPro public/js/api.js — fetch wrapper, base '/api', 401 → /login.html)
js/store.js      ← NEW  (the data.js analogue — hydrate every store from the API on boot)
js/people.js     (ACCOUNTS now filled by store.js from GET /api/users)
js/export.js
js/boot.js       ← NEW  (checkAuth → hydrateAll → dispatch 'temple:ready')
js/app.js
js/management.* … js/access.js   (unchanged files; bootstraps now wait for 'temple:ready')
```

`api.js` verbatim from the reference:

```js
const API = {
  async request(method, path, body) {
    const opts = { method, credentials:'include', headers:{} };
    if (body) { opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
    const res = await fetch('/api' + path, opts);
    if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  },
  get:(p)=>API.request('GET',p), post:(p,b)=>API.request('POST',p,b),
  put:(p,b)=>API.request('PUT',p,b), del:(p)=>API.request('DELETE',p),
};
```

`store.js` — the `data.js` analogue. `hydrateAll()`:

```js
async function hydrateAll() {
  const me = await API.get('/auth/me');            // { user, pages }
  if (!me.user) { location.href = '/login.html'; return; }
  CURRENT_USER = me.user;

  const s = await API.get('/settings');            // temple identity + language + working date
  if (s.workingDate && typeof MG !== 'undefined') { MG.today = s.workingDate; MG.nowTime = s.workingTime || MG.nowTime; }
  if (s.defaultLanguage && typeof setLanguage === 'function') setLanguage(s.defaultLanguage);

  const [teams, tmembers, vsessions, att1, comms, drafts, pubPages,
         poojaTypes, poojas, sevarthis, guests,
         committees, cmembers, meetings, att2,
         donCats, donors, donations,
         eventTypes, events, visits, devotees, expenses, inventory, accounts]
    = await Promise.all([
      API.get('/teams'), API.get('/team-members'), API.get('/volunteering-sessions'),
      API.get('/attendance?contextType=volunteering'), API.get('/communication?contextType=team'),
      API.get('/message-drafts?contextType=team'), API.get('/public-pages'),
      API.get('/pooja-types'), API.get('/poojas'), API.get('/sevarthis'), API.get('/guests'),
      API.get('/committees'), API.get('/committee-members'), API.get('/meetings'),
      API.get('/attendance?contextType=meeting'),
      API.get('/donation-categories'), API.get('/donors'), API.get('/donations'),
      API.get('/event-types'), API.get('/events'), API.get('/visits'),
      API.get('/devotees'), API.get('/expenses'), API.get('/inventory'), API.get('/users'),
    ]);

  Object.assign(MG,   { managements: teams, members: tmembers, volunteering: vsessions,
                        attendance: att1, communication: comms, drafts, /* publicPages… */ });
  Object.assign(POOJA,{ poojaTypes, poojas, sevarthis, people: guests });
  Object.assign(CMT,  { committees, members: cmembers, meetings, attendance: att2 });
  Object.assign(DON,  { categories: donCats, donors, donations });
  Object.assign(EV,   { eventTypes, events });
  VISITS.list = visits;
  state.devotees = devotees; state.expenses = expenses; state.inventory = inventory;
  ACCOUNTS.length = 0; accounts.forEach(a => ACCOUNTS.push(a));
}
```

`boot.js`:

```js
document.addEventListener('DOMContentLoaded', async () => {
  try { await hydrateAll(); }
  catch (e) { if (!/Unauthorized/.test(e.message)) console.error(e); return; }
  window.__templeReady = true;
  document.dispatchEvent(new Event('temple:ready'));
});
```

Each module's existing `DOMContentLoaded` bootstrap changes one line — instead
of rendering immediately, it waits:

```js
function boot() { renderCommittee(); onLanguageChange(() => renderCommittee()); }
if (window.__templeReady) boot(); else document.addEventListener('temple:ready', boot);
```

### 10.2 `persistX()` helpers (replace direct store mutation)

In every `-forms.js`, `handleSaveX(e)` currently does
`STORE.list.unshift(obj); renderX();`. It becomes:

```js
async function handleSaveMeeting(e) {
  e.preventDefault();
  const payload = { committeeId: …, title: …, date: …, /* … */ memberIds: [...] };
  try {
    const saved = CMT.editingMeetingId
      ? await API.put('/meetings/' + CMT.editingMeetingId, payload)
      : await API.post('/meetings', payload);          // server assigns id + code
    const i = CMT.meetings.findIndex(m => m.id === saved.id);
    if (i >= 0) CMT.meetings[i] = saved; else CMT.meetings.unshift(saved);
    closeSheet(); renderCommittee(); renderUnifiedCalendar();
  } catch (err) { cmtToast(err.message); }
}
```

POST-vs-PUT keyed on `editing*Id` / presence of `id`, exactly like
`data.js persistClient()`. Attendance toggles call
`API.put('/attendance', { contextType, contextId, memberId, status })` then
update the local `attendance` array. Soft-delete calls `API.del('/meetings/'+id)`
then splice locally.

### 10.3 Riskiest refactors (ranked)

1. **Boot sequencing.** Every module reads its seed synchronously at
   `DOMContentLoaded` and self-renders. All 6 modules + `calendar.js` +
   `dashboard.js` + `access.js` + `visits.js` must defer to `temple:ready`. This
   is the single structural change that touches every file. Mitigation: the
   one-line `if (window.__templeReady) boot(); else addEventListener(...)`
   pattern, applied mechanically.
2. **`calEntries()` / `dashFigures()` / `mergedActivity()`.** They read *every*
   store synchronously and assume all are populated (cross-module: pooja colour,
   committee name, donor name for pledges). Post-hydration they still work, but
   only if hydration fully completed — and they can't be trusted for a scoped
   persona. **Move to `GET /api/calendar`, `/api/dashboard`, `/api/reports`,
   `/api/activity`** (server applies scope). Keep the client functions as a
   render-time fallback if the fetch fails, reading whatever is hydrated.
3. **Working-date clock.** `management.js` reads `localStorage['svmmm_clock']` at
   *script-eval* time, before any render, to set `MG.today`. That timing is gone
   once the value comes from the API. `store.js` must `GET /api/settings`
   **first** (before the module bootstraps run) and set `MG.today` /
   `MG.nowTime`. `applyWorkingDate()` in `access.js` becomes
   `await API.put('/settings/working-date', { date, time })` then the existing
   re-render sweep. **Open decision:** global clock (one `app_settings` row,
   affects everyone) vs per-user. Recommendation: global default, with an
   optional admin-only per-device `localStorage` override kept purely for
   "what-if" exploration (never written back to the server).
4. **`export.js` builders.** They read stores synchronously on click and build
   `{ columns, rows }`. No change needed — post-hydration the stores are
   populated and stay populated; the CSV/Excel/PDF now simply reflects server
   data. `assetURL('css/styles.css')` still resolves (same origin on Render).
   The `acc-audit` / `rep-summary` builders should instead pull from
   `/api/activity` / `/api/reports` so a large history isn't capped at what's
   hydrated.
5. **Client ID generation.** `nextId()` / `cmtNextId()` / `evNextId()` /
   `nextReceiptNo()` / `nextCertNo()` must **not** mint ids anymore — the server
   returns `id` + `code` + `receiptNo`. `handleSaveX` uses the response object.
   Any code that pre-computes an id for optimistic rendering is removed.
6. **`changeRoleScope()` / `signInAs()` / the role selector.** Deleted (real
   login now). If impersonation ships, `signInAs(id)` →
   `await API.post('/auth/impersonate', { userId: id })` then `location.reload()`.
7. **`people.js` helpers.** `accountPages` / `accessSummary` / `mergedActivity`
   either move server-side (`/api/activity`, `services/authz.js`) or recompute
   from the hydrated `ACCOUNTS` + `/api/activity` payload.

### 10.4 Migration order (module by module)

1. **Auth + settings shell** — `login.html`, `api.js`, `store.js` (settings +
   `/me` only), `boot.js`; SPA loads but modules still use their seeds.
2. **Devotees** — shared registry, smallest surface, unblocks member pickers.
3. **Donations** — self-contained, high value, exercises the numbering service
   (`receiptNumber.js`) and a catalog (`donation_categories`).
4. **Pooja** — catalog + child `pooja_sessions` + three link tables + scoping.
5. **Committee** — committees / members / meetings / `attendance` (proves the
   shared attendance + communication + drafts tables).
6. **Management** — largest: teams, members, volunteering sessions, attendance,
   public pages + the unauthenticated signup route, badges (pure client render).
7. **Events** — events + `event_days` + in-charge scope.
8. **Visits** — single table, trivial.
9. **Calendar / Dashboard / Reports / Accounts & Access** — switch to
   `/api/calendar`, `/api/dashboard`, `/api/reports`, `/api/activity`,
   `/api/users`; delete the client aggregation fallbacks last.

---

## 11. Migration / rollout phases

**Phase 0 — scaffold.** `npm init`, add deps
(`express cors helmet cookie-parser express-rate-limit jsonwebtoken speakeasy
qrcode nodemailer dotenv better-sqlite3 @libsql/client`), `engines.node = 20`.
Create `server/` tree (§4.1), `config.js`, `db/connection.js` (copy + libsql FK
pragma), `.env.example`, `render.yaml`. `GET /health` + static `public/` +
`git mv` the front-end into `public/`.

**Phase 1 — schema + migrations.** Write `db/migrations/001_init.sql` (§2.4),
`db/migrate.js` (numbered runner + `schema_migrations`), `db/seed/reference-data.js`
(catalogs + committees, idempotent), `db/seed/demo-data.js` (`--demo`, empty-table
guarded). `npm run migrate` locally against `data/temple.db`; then against Turso
with `TURSO_*` set (per the reference `DEPLOY.md`).

**Phase 2 — auth + sessions.** `services/otp.js`, `services/mailer.js`,
`middleware/auth.js`, `middleware/authz.js` (`ROLE_PAGES`, `requireRole`,
`attachScope`), `routes/auth.js`, `routes/sessions.js`, `routes/users.js`,
`ensureAdminUser()` in boot. Build `public/login.html`. Verify the full TOTP
loop + remote session revoke + disabled-user-is-immediately-locked-out.

**Phase 3 — one module end to end as the template.** Do **Donations** fully:
`routes/donations.js` + `donors.js` + `donationCategories.js`,
`services/receiptNumber.js`, `services/entityCode.js`, `mapDonation` etc.,
`services/audit.js`. Wire `donations-*.js` to `api.js` / `store.js` /
`persistDonation`. This nails the CRUD + scope + numbering + audit + mapper
pattern every other router then copies.

**Phase 4 — remaining modules.** Devotees → Pooja → Committee → Management →
Events → Visits → Expenses/Inventory, in the §10.4 order. Each: one router file
(or a few), one `mapX`, `counters` seed rows, wire the `-forms.js`.

**Phase 5 — derived reads.** `services/calendar.js` + the `v_cal_*` VIEWs,
`services/dashboard.js`, `services/reports.js`, `routes/activity.js`. Switch
`calendar.js` / `dashboard.js` / `access.js` to the endpoints; remove client
fallbacks.

**Phase 6 — deploy + cutover.** Push to GitHub; Render **New → Blueprint** reads
`render.yaml`; set `sync:false` env vars (`ADMIN_EMAIL`, `SMTP_*`, `TURSO_*`,
`ALLOWED_ORIGINS`). Run `npm run migrate` from the Render shell. Smoke-test the
post-deploy checklist (login, dashboard, one CRUD per module, scoped-user
cannot see another's data, PDF/CSV export, working-date change). Keep the
GitHub Pages build alive as a read-only demo until the Render app is signed off,
then point the domain at Render and add `.nojekyll` removal / Pages disable to
the cleanup list.

### Reference gaps and how this plan fixes each

| ChallanPro gap | Fix here |
| --- | --- |
| No admin bootstrap — `DEPLOY.md` says first login creates the admin, code doesn't | `ensureAdminUser()` on every boot: idempotent `users` + `user_roles` upsert from `ADMIN_EMAIL` (§9) |
| Disabling a user (`active = 0`) doesn't revoke their live sessions | `DELETE /api/users/:id` also `UPDATE sessions SET revoked = 1 WHERE user_id = ?` (§9); same on role removal |
| Static `schema.sql` + append-only `safeAlter[]` swallowing every ALTER error | numbered `db/migrations/NNN_*.sql` + `schema_migrations` table + transactional runner that fails loud (§3.1) |
| FK enforcement only on better-sqlite3, not libsql | `PRAGMA foreign_keys = ON` after `createClient()` for Turso too (§1.5, §3.3) |
| No `CHECK` constraints — any string is a valid status | `CHECK (col IN (...))` on every status / kind / type / purpose column (§2.4, §3.2) |
| Derived reads (`calEntries`, `dashFigures`, `mergedActivity`, `accessSummary`) live only in the browser and can't be trusted for a scoped user | server VIEWs + `services/calendar.js` / `dashboard.js` / `reports.js` / `authz.js`, all scope-aware; endpoints `/api/calendar`, `/api/dashboard`, `/api/reports`, `/api/activity` (§3.5, §8) |
| `formatActivity()` guesses the entity from `details_json` | `audit_logs.module` + `audit_logs.scope_id` columns for reliable per-persona filtering (§2.4) |
| OTP store is process memory only (breaks with >1 instance) | fine for a single Render free instance; documented `otp` table fallback with the same API if scaled (§7) |
| Numbering logic (`billNumber.js`) exists but there's no code-allocation service for entity ids | `services/entityCode.js` backed by a `counters` table replaces the client `nextId()` family; `services/receiptNumber.js` mirrors `billNumber.js` for `REC-`/`CERT-` numbers (§3.5) |

---

## Open decisions for the owner

1. **DB engine.** Confirm **Turso (libsql) for prod, local better-sqlite3 file
   for dev**, so `db/connection.js` is reused verbatim. (Alternative — Postgres
   — would mean rewriting `connection.js` and every `datetime('now')` /
   `INSERT OR REPLACE`; not recommended.)
2. **Tenant scope column.** Recommendation: **no `temple_id`** anywhere — one
   temple, scope is role + owned-entity id (§2.3). Confirm the temple will never
   be multi-tenant, or accept that adding it later is a one-migration change.
3. **Working-date clock — global or per-user?** Recommendation: **global**
   (`app_settings.working_date` / `working_time`, set by an admin, drives every
   dashboard/report/status for everyone), with an optional admin-only per-device
   `localStorage` override for private "what-if" exploration that is never
   written back. Decide whether non-admins may change it at all.
4. **Impersonation endpoint.** Recommendation: **keep** "Sign in as" as a real,
   superadmin-only, short-TTL, fully-audited impersonation session (§6.2). Or
   drop it entirely in favour of dedicated test accounts.
5. **GitHub Pages → Render cutover.** Recommendation: **dual-run** — Pages stays
   as a read-only demo while Render is validated, then repoint the domain to
   Render and retire Pages. Confirm who controls the domain/DNS and the target
   cutover date.
6. **Multi-role users.** Recommendation: **`user_roles` join table** (the demo
   genuinely has multi-role accounts, e.g. Amit Shah = `management_lead` +
   `pooja_coordinator`). Confirm, vs. collapsing to one role per user like the
   reference.
7. **Devotee identity scheme.** The demo is inconsistent — `#DEV-1001`
   (`app.js state.devotees`) vs `DEV-001` (`people.js`, and the id every module
   cross-links on). Confirm **one canonical `devotees` registry** with a single
   `DEV-####` code scheme, and that `users.devotee_id` links an account to its
   person record.
