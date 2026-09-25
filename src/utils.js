'use strict';

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };

function slugify(input) {
  return String(input || '')
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => TR_MAP[ch])
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Üretir: "ad", "ad-2", "ad-3" ... tablo içinde benzersiz slug. */
function uniqueSlug(db, table, base, excludeId = null) {
  if (!['products', 'categories'].includes(table)) throw new Error('invalid table');
  const root = slugify(base) || 'urun';
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id IS NOT ?`);
  let slug = root;
  for (let i = 2; stmt.get(slug, excludeId); i++) slug = `${root}-${i}`;
  return slug;
}

const priceFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 });

function formatPrice(cents) {
  if (cents === null || cents === undefined) return '';
  return priceFmt.format(cents / 100);
}

/** "1.250,50" / "1250.5" / "1250" → kuruş (int) ya da null. */
function parsePrice(value) {
  let s = String(value ?? '').trim().replace(/\s|₺|TL/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return undefined; // geçersiz
  return Math.round(parseFloat(s) * 100);
}

function centsToInput(cents) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
}

/** Kısıtlı uzunlukta, kontrol karakterlerinden arındırılmış metin. */
function cleanText(value, max = 255) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function toInt(value, fallback = null) {
  const n = Number.parseInt(value, 10);
  return Number.isSafeInteger(n) ? n : fallback;
}

function waLink(number, text) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Türkiye formatındaki telefonu (05xx..., 5xx..., +90...) WhatsApp bağlantısına çevirir. */
function phoneWa(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `9${d}`;
  else if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
  return d.length >= 10 && d.length <= 15 ? waLink(d, text) : null;
}

function igLink(username) {
  const u = String(username || '').replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(u) ? `https://instagram.com/${u}` : null;
}

/** Mutlak URL tabanı. Host başlığı istemci kontrolünde olduğundan üretimde SITE_URL tanımlanmalı. */
function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

module.exports = { phoneWa, baseUrl, slugify, uniqueSlug, formatPrice, parsePrice, centsToInput, cleanText, toInt, waLink, igLink };
