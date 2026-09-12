/* app_settings is a flat key→value table. This wraps the handful of keys the
   frontend needs into one JSON payload and back. (BACKEND_PLAN.md §10.3) */
const { queryAll, run } = require('../db/connection');

const DEFAULTS = {
  default_language: 'gu',
};

/** Real current date/time in the temple's own timezone (Asia/Kolkata) —
    never the server host's timezone, which on Render is UTC and would be
    up to 5:30h off around midnight IST. */
function istNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const g = (type) => (parts.find((p) => p.type === type) || {}).value || '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

async function getSettings() {
  const rows = await queryAll('SELECT key, value FROM app_settings');
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });

  let templeIdentity = {};
  try { templeIdentity = JSON.parse(map.temple_identity || '{}'); } catch (_) {}

  // working_date/working_time are only trusted when an admin has explicitly
  // pinned them (working_date_pinned = '1'); otherwise always the real
  // current IST date/time. Without this flag a value only ever present
  // because seedPlatform() wrote "today" once, at first boot, would get
  // trusted forever afterwards and the platform's "today" would silently
  // freeze on its deploy date.
  const pinned = map.working_date_pinned === '1' && !!map.working_date;
  const now = istNow();

  return {
    workingDate: pinned ? map.working_date : now.date,
    workingTime: pinned ? (map.working_time || now.time) : now.time,
    workingDatePinned: pinned,
    defaultLanguage: map.default_language || DEFAULTS.default_language,
    templeIdentity,
  };
}

async function setSetting(key, value) {
  await run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

async function setWorkingDate(date, time) {
  if (date) await setSetting('working_date', String(date));
  if (time) await setSetting('working_time', String(time));
  await setSetting('working_date_pinned', '1');
  return getSettings();
}

/** Un-pin the working date — the clock goes back to tracking real IST time. */
async function clearWorkingDate() {
  await setSetting('working_date_pinned', '0');
  return getSettings();
}

async function setTempleIdentity(obj) {
  await setSetting('temple_identity', JSON.stringify(obj || {}));
  return getSettings();
}

async function setDefaultLanguage(lang) {
  await setSetting('default_language', String(lang || 'gu'));
  return getSettings();
}

module.exports = { getSettings, setSetting, setWorkingDate, clearWorkingDate, setTempleIdentity, setDefaultLanguage };
