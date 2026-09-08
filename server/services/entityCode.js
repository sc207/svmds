/* Human-facing entity codes (DEV-001, PJA-004 …) allocated from the `counters`
   table — the server-side replacement for the client nextId() family.
   Single Render instance + one DB connection, so the read-then-bump is safe
   enough; if this ever scales out, switch to `UPDATE … RETURNING`. (§3.5) */
const { queryOne, run } = require('../db/connection');

async function nextCode(name) {
  const row = await queryOne('SELECT prefix, pad, next_value FROM counters WHERE name = ?', [name]);
  if (!row) throw new Error(`entityCode: no counter named "${name}"`);
  const n = row.next_value;
  await run('UPDATE counters SET next_value = next_value + 1 WHERE name = ?', [name]);
  return `${row.prefix}-${String(n).padStart(row.pad, '0')}`;
}

/** Peek the next code without consuming it (for previews). */
async function peekCode(name) {
  const row = await queryOne('SELECT prefix, pad, next_value FROM counters WHERE name = ?', [name]);
  if (!row) throw new Error(`entityCode: no counter named "${name}"`);
  return `${row.prefix}-${String(row.next_value).padStart(row.pad, '0')}`;
}

module.exports = { nextCode, peekCode };
