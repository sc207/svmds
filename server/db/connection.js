/* Compatibility shim for the auth / accounts code carried over from the
   portal (routes/auth.js, users.js, sessions.js, services/*), which calls
   queryAll / queryOne / run with an ARRAY of params. Everything goes
   through the one core in db/index.js, so these calls share its write
   queue and join an open db.tx() like any other. */
const db = require('./index');

const args = (params) => (Array.isArray(params) ? params : params == null ? [] : [params]);

async function queryAll(sql, params = []) { return db.all(sql, ...args(params)); }
async function queryOne(sql, params = []) { return (await db.get(sql, ...args(params))) || null; }
async function run(sql, params = []) { return db.run(sql, ...args(params)); }
async function getDb() { await db.init(); return db; }

module.exports = { getDb, queryAll, queryOne, run, isTurso: db.isTurso };
