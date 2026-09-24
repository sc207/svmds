/* ============================================================
   DATABASE CORE — one async API over @libsql/client, for both
   drivers:
     local dev   file:data/temple.db   (or TEMPLE_DB=<path> for a
                                        throwaway test database)
     production  Turso                 (TURSO_DATABASE_URL + _AUTH_TOKEN)

   The Phase 1 app was written against synchronous better-sqlite3,
   where `db.transaction()` made "re-read the slot, insert the
   booking, bump booked_count" impossible to interleave. Turso is
   async, so the same guarantee is rebuilt here from two parts:

     1. db.tx(fn) opens a real write transaction (BEGIN IMMEDIATE
        locally, an interactive transaction on Turso), so the work is
        all-or-nothing.
     2. Every write in this process — every tx() and every db.run()
        outside one — goes through ONE queue. Render runs a single
        instance, so nothing in the app can interleave with a
        transaction. The local file driver also needs this: a plain
        write while a transaction is open fails with SQLITE_BUSY.

   Inside db.tx(), plain db.get / db.all / db.run automatically join
   the open transaction (AsyncLocalStorage). A helper such as
   upsertDevotee() or receipts.next() is therefore written once and is
   transactional whenever its caller is — the same property the sync
   code had. NEVER call db.tx() from code that must run outside the
   queue; a nested tx() simply joins the outer one.

   Params: positional (`db.get(sql, a, b)`) or ONE plain object for
   @name / :name placeholders (`db.run(sql, { name })`).
   ============================================================ */
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const { createClient } = require('@libsql/client');
const config = require('../config');

const als = new AsyncLocalStorage();
let client = null;
let turso = false;

function localPath() {
  if (process.env.TEMPLE_DB) return path.resolve(process.env.TEMPLE_DB);
  const dir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'temple.db');
}

let ready = null;
function init() {
  if (ready) return ready;
  ready = (async () => {
    if (config.turso.url && config.turso.token && !process.env.TEMPLE_DB) {
      client = createClient({ url: config.turso.url, authToken: config.turso.token });
      turso = true;
    } else {
      client = createClient({ url: 'file:' + localPath().replace(/\\/g, '/') });
      await client.execute('PRAGMA journal_mode = WAL');
      await client.execute('PRAGMA busy_timeout = 5000');
    }
  })();
  return ready;
}

/* ---- the write queue -------------------------------------- */
let tail = Promise.resolve();
function queued(fn) {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}

/* ---- statement helpers ------------------------------------ */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}
function stmt(sql, params) {
  if (params.length === 1 && isPlainObject(params[0])) {
    const args = {};
    for (const [k, v] of Object.entries(params[0])) args[k] = v === undefined ? null : v;
    return { sql, args };
  }
  return { sql, args: params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)) };
}
function toRows(rs) {
  return rs.rows.map((r) => {
    const o = {};
    rs.columns.forEach((c, i) => {
      const v = r[i];
      o[c] = typeof v === 'bigint' ? Number(v) : v;
    });
    return o;
  });
}
function toRun(rs) {
  return {
    changes: Number(rs.rowsAffected || 0),
    lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : undefined,
  };
}

async function execute(st) {
  const store = als.getStore();
  if (store) return store.tx.execute(st);
  await init();
  return client.execute(st);
}

async function all(sql, ...params) {
  return toRows(await execute(stmt(sql, params)));
}
async function get(sql, ...params) {
  return (await all(sql, ...params))[0];
}
async function run(sql, ...params) {
  const st = stmt(sql, params);
  if (als.getStore()) return toRun(await execute(st));
  await init();
  return queued(async () => toRun(await client.execute(st)));
}

/** Multi-statement SQL (schema). Not inside a transaction. */
async function exec(sql) {
  await init();
  return queued(() => client.executeMultiple(sql));
}

/** All-or-nothing unit of work. Returns whatever fn returns. */
async function tx(fn) {
  if (als.getStore()) return fn();           // nested: join the outer transaction
  await init();
  return queued(async () => {
    const t = await client.transaction('write');
    try {
      const out = await als.run({ tx: t }, fn);
      await t.commit();
      return out;
    } catch (e) {
      try { await t.rollback(); } catch { /* already closed */ }
      throw e;
    } finally {
      t.close();
    }
  });
}

/** True while running inside db.tx(). */
const inTx = () => !!als.getStore();

async function close() {
  if (client) { try { client.close(); } catch { /* already closed */ } client = null; ready = null; }
}

module.exports = {
  init, get, all, run, exec, tx, inTx, close,
  isTurso: () => turso,
  where: () => (turso ? 'turso' : localPath()),
};
