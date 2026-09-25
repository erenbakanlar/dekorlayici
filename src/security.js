'use strict';

const crypto = require('crypto');

/* ---------- Parola hash (scrypt, Node yerleşik) ---------- */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Kullanıcı bulunamasa da aynı sürede cevap vermek için sahte hash (kullanıcı adı tahminini zorlaştırır).
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

function validatePasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Parola en az 10 karakter olmalı.';
  if (pw.length > 200) return 'Parola çok uzun.';
  if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(pw) || !/\d/.test(pw)) return 'Parola en az bir harf ve bir rakam içermeli.';
  return null;
}

/* ---------- CSRF (senkronize token, oturuma bağlı) ---------- */
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.session && req.session.csrf;
  if (
    expected &&
    typeof sent === 'string' &&
    sent.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
  ) {
    return next();
  }
  const err = new Error('Geçersiz form anahtarı. Sayfayı yenileyip tekrar deneyin.');
  err.status = 403;
  return next(err);
}

/* ---------- Yetkilendirme ---------- */
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.redirect('/admin/giris');
}

module.exports = { hashPassword, verifyPassword, DUMMY_HASH, validatePasswordStrength, csrfToken, csrfProtect, requireAdmin };
