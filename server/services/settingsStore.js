/* app_settings is a flat key→value table. This wraps the handful of keys the
   frontend needs into one JSON payload and back. (BACKEND_PLAN.md §10.3) */
const { queryAll, run } = require('../db/connection');

const DEFAULTS = {
  working_date: '2026-09-06',
  working_time: '18:30',
  default_language: 'gu',
};

async function getSettings() {
  const rows = await queryAll('SELECT key, value FROM app_settings');
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });

  let templeIdentity = {};
  try { templeIdentity = JSON.parse(map.temple_identity || '{}'); } catch (_) {}

  return {
    workingDate: map.working_date || DEFAULTS.working_date,
    workingTime: map.working_time || DEFAULTS.working_time,
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

module.exports = { getSettings, setSetting, setWorkingDate, setTempleIdentity, setDefaultLanguage };
