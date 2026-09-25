'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(process.env.DB_PATH || path.join(DATA_DIR, 'dekor.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fiyatlar kuruş cinsinden tutulur (ileride ödeme altyapısı için hassasiyet kaybı olmaz).
CREATE TABLE IF NOT EXISTS products (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  short_desc          TEXT NOT NULL DEFAULT '',
  description         TEXT NOT NULL DEFAULT '',
  price_cents         INTEGER,
  compare_price_cents INTEGER,
  sku                 TEXT,
  stock               INTEGER,
  is_active           INTEGER NOT NULL DEFAULT 1,
  is_featured         INTEGER NOT NULL DEFAULT 0,
  is_customizable     INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, is_featured);

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, sort_order);

CREATE TABLE IF NOT EXISTS custom_requests (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'done')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
`);

const DEFAULT_SETTINGS = {
  site_name: 'Dekorlayıcı',
  tagline: 'Evinize hikâye katan el yapımı dekorlar',
  announcement: 'Kişiye özel tasarım siparişleri için WhatsApp hattımızdan bize ulaşın',
  hero_title: 'Evinizin ruhunu yansıtan dekorlar',
  hero_text: 'Özenle seçilmiş dekoratif objeler ve size özel tasarlanan parçalarla yaşam alanlarınıza sıcaklık katın.',
  hero_image: '',
  whatsapp: '905000000000',
  instagram: 'dekorlayici',
  phone: '+90 500 000 00 00',
  email: 'merhaba@dekorlayici.com',
  address: 'İstanbul, Türkiye',
  about_text: 'Dekorlayıcı, yaşam alanlarını kişisel hikâyelerle buluşturmak için kuruldu. Her ürünümüzü malzeme seçiminden son rötuşa kadar özenle hazırlıyor, dilerseniz tamamen size özel tasarlıyoruz.',
};

const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertDefault.run(k, v);

if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) {
  const ins = db.prepare('INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)');
  [
    ['Duvar Dekoru', 'duvar-dekoru', 'Duvarlarınıza karakter katan parçalar', 1],
    ['Mum & Mumluk', 'mum-mumluk', 'Sıcak ışık, huzurlu atmosfer', 2],
    ['Vazo & Saksı', 'vazo-saksi', 'Doğayı içeri taşıyan formlar', 3],
    ['Tablo & Poster', 'tablo-poster', 'Duvarınız için seçilmiş eserler', 4],
    ['Kişiye Özel', 'kisiye-ozel', 'Size özel tasarlanan dekorlar', 5],
  ].forEach((c) => ins.run(...c));
}

module.exports = db;
module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
