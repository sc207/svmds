/* Card / calendar accent colours are assigned automatically, cycling a fixed
   temple palette in creation order — the user never picks one. Pass the count
   of rows that already exist in that table; you get the next colour. */
const { queryOne } = require('../db/connection');

const PALETTE = [
  '#6B1F2A', // royal maroon
  '#C96A20', // saffron
  '#C9A24A', // antique gold
  '#4C8B5A', // temple green
  '#7A3B62', // deep plum
  '#3B5C8A', // indigo
  '#A6432E', // terracotta
  '#2E7D6B', // teal
  '#8A6D3B', // bronze
  '#5A4B8A', // amethyst
];

function colorAt(n) {
  return PALETTE[((Number(n) || 0) % PALETTE.length + PALETTE.length) % PALETTE.length];
}

/** Next colour for a table, based on how many non-deleted rows it has. */
async function nextColorFor(table) {
  const safe = String(table).replace(/[^a-z_]/gi, '');
  let n = 0;
  try {
    const r = await queryOne(`SELECT COUNT(*) AS n FROM ${safe} WHERE is_deleted = 0`);
    n = r ? Number(r.n) : 0;
  } catch (_) { /* table without is_deleted, or missing — start at 0 */ }
  return colorAt(n);
}

module.exports = { PALETTE, colorAt, nextColorFor };
