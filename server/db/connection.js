/* Driver abstraction: better-sqlite3 (local dev file) or @libsql/client (Turso, prod).
   Adapted from the ChallanPro reference; adds `PRAGMA foreign_keys = ON` for libsql too. */
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
let isTurso = false;
let rawClient = null;   // libsql client (for atomic .batch); null on better-sqlite3
let rawNative = null;   // better-sqlite3 Database (for .transaction); null on libsql

function wrapLibsql(client) {
  return {
    exec(sql) { return client.executeMultiple(sql); },
    prepare(sql) {
      return {
        run(...params) { return client.execute({ sql, args: params }); },
        get(...params) { return client.execute({ sql, args: params }).then(r => r.rows[0] || null); },
        all(...params) { return client.execute({ sql, args: params }).then(r => r.rows); },
      };
    },
  };
}

function wrapSqlite(native) {
  return {
    exec(sql) { native.exec(sql); },
    prepare(sql) { return native.prepare(sql); },
  };
}

async function getDb() {
  if (db) return db;

  if (config.turso.url && config.turso.token) {
    const { createClient } = require('@libsql/client');
    const client = createClient({ url: config.turso.url, authToken: config.turso.token });
    await client.execute('PRAGMA foreign_keys = ON');   // added vs. reference
    isTurso = true;
    rawClient = client;
    db = wrapLibsql(client);
    return db;
  }

  const Database = require('better-sqlite3');
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const native = new Database(path.join(dataDir, 'svmds.db'));
  native.pragma('journal_mode = WAL');
  native.pragma('foreign_keys = ON');
  rawNative = native;
  db = wrapSqlite(native);
  return db;
}

/* Run several statements atomically (all-or-nothing).
   libsql over HTTP has no BEGIN/COMMIT session, so use client.batch();
   better-sqlite3 uses a real transaction. `stmts` = array of SQL strings or
   { sql, args } objects. Used by the migration runner (§3.1). */
async function runBatch(stmts) {
  await getDb();
  const norm = stmts.map(s => (typeof s === 'string' ? { sql: s, args: [] } : { sql: s.sql, args: s.args || [] }));
  if (isTurso) {
    await rawClient.batch(norm, 'write');
    return;
  }
  const tx = rawNative.transaction(list => {
    for (const s of list) rawNative.prepare(s.sql).run(...s.args);
  });
  tx(norm);
}

async function queryAll(sql, params = []) {
  const database = await getDb();
  if (isTurso) {
    const rows = await database.prepare(sql).all(...params);
    return rows.map(r => { const o = {}; for (const [k, v] of Object.entries(r)) o[k] = v; return o; });
  }
  return database.prepare(sql).all(...params);
}

async function queryOne(sql, params = []) {
  const database = await getDb();
  if (isTurso) {
    const row = await database.prepare(sql).get(...params);
    if (!row) return null;
    const o = {}; for (const [k, v] of Object.entries(row)) o[k] = v; return o;
  }
  return database.prepare(sql).get(...params) || null;
}

async function run(sql, params = []) {
  const database = await getDb();
  if (isTurso) {
    const r = await database.prepare(sql).run(...params);
    // libsql hands lastInsertRowid back as a BigInt — coerce so it JSON-serialises
    // and matches in follow-up SELECTs.
    const rowid = r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined;
    return { lastInsertRowid: rowid, changes: Number(r.rowsAffected || 0) };
  }
  const nr = database.prepare(sql).run(...params);
  return {
    lastInsertRowid: nr.lastInsertRowid != null ? Number(nr.lastInsertRowid) : undefined,
    changes: nr.changes,
  };
}

module.exports = { getDb, queryAll, queryOne, run, runBatch, isTurso: () => isTurso };
