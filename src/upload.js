'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
const MAX_FILES = 10;

// Dosyalar diske ham olarak yazılmaz: bellekte doğrulanır, yeniden kodlanır, sonra kaydedilir.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_FILES, fields: 40, fieldSize: 64 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    const err = new Error('Yalnızca JPG, PNG, WEBP, AVIF veya GIF görsel yükleyebilirsiniz.');
    err.status = 400;
    return cb(err);
  },
});

/**
 * Görseli sharp ile gerçekten çözümleyip WEBP olarak yeniden kodlar.
 * Bu sayede görsel kılığındaki zararlı dosyalar ve EXIF/konum verisi elenir.
 */
async function saveImage(buffer, { width = 1600, height = 1600 } = {}) {
  const meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  if (!meta.format || !['jpeg', 'png', 'webp', 'avif', 'gif', 'heif'].includes(meta.format)) {
    const err = new Error('Görsel dosyası okunamadı.');
    err.status = 400;
    throw err;
  }
  const filename = `${crypto.randomBytes(16).toString('hex')}.webp`;
  await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(UPLOAD_DIR, filename));
  return filename;
}

/** Kayıttan önce tüm dosyaların gerçekten okunabilir görsel olduğunu doğrular. Hata mesajı ya da null döner. */
async function validateImages(files) {
  for (const f of files || []) {
    try {
      const meta = await sharp(f.buffer, { limitInputPixels: 40_000_000 }).metadata();
      if (!meta.format || !meta.width || !meta.height) throw new Error('bad');
    } catch {
      return `"${String(f.originalname).slice(0, 60)}" geçerli bir görsel dosyası değil.`;
    }
  }
  return null;
}

function removeImage(filename) {
  if (!/^[a-f0-9]{32}\.webp$/.test(String(filename))) return;
  fs.unlink(path.join(UPLOAD_DIR, filename), () => {});
}

module.exports = { upload, saveImage, validateImages, removeImage, UPLOAD_DIR, MAX_FILES };
