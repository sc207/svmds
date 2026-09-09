/* Human-facing entity codes (DEV-001, PJA-004 …) allocated from the `counters`
   table — the server-side replacement for the client nextId() family.
   Allocation is a single atomic `UPDATE … RETURNING`, so two concurrent
   callers can never mint the same code. (§3.5) */
const { queryOne } = require('../db/connection');

async function nextCode(name) {
  // atomic: bump and read the new value in one statement. `next_value` in the
  // returned row is post-increment, so the code we just claimed is next_value-1.
  const row = await queryOne(
    'UPDATE counters SET next_value = next_value + 1 WHERE name = ? RETURNING prefix, pad, next_value',
    [name]
  );
  if (!row) throw new Error(`entityCode: no counter named "${name}"`);
  return `${row.prefix}-${String(row.next_value - 1).padStart(row.pad, '0')}`;
}

/** Peek the next code without consuming it (for previews). */
async function peekCode(name) {
  const row = await queryOne('SELECT prefix, pad, next_value FROM counters WHERE name = ?', [name]);
  if (!row) throw new Error(`entityCode: no counter named "${name}"`);
  return `${row.prefix}-${String(row.next_value).padStart(row.pad, '0')}`;
}

module.exports = { nextCode, peekCode };
