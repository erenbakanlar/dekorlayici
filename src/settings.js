'use strict';

const db = require('./db');

let cache = null;

function getSettings() {
  if (!cache) {
    cache = { ...db.DEFAULT_SETTINGS };
    for (const row of db.prepare('SELECT key, value FROM settings').all()) cache[row.key] = row.value;
  }
  return cache;
}

function saveSettings(values) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const [k, v] of Object.entries(values)) {
      if (k in db.DEFAULT_SETTINGS) stmt.run(k, String(v));
    }
  })();
  cache = null;
}

module.exports = { getSettings, saveSettings };
