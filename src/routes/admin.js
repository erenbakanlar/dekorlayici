'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { getSettings, saveSettings } = require('../settings');
const { upload, saveImage, validateImages, removeImage, MAX_FILES } = require('../upload');
const {
  verifyPassword, hashPassword, DUMMY_HASH, validatePasswordStrength, csrfProtect, requireAdmin,
} = require('../security');
const { uniqueSlug, slugify, parsePrice, centsToInput, cleanText, toInt, phoneWa } = require('../utils');

const router = express.Router();

// Panel sayfaları arama motorlarına kapalı ve tarayıcıda önbelleğe alınmaz.
router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  res.locals.phoneWa = phoneWa;
  res.locals.admin = req.session.adminId ? { id: req.session.adminId, username: req.session.adminName } : null;
  res.locals.newRequests = req.session.adminId
    ? db.prepare("SELECT COUNT(*) AS n FROM custom_requests WHERE status = 'new'").get().n
    : 0;
  next();
});

const flash = (req, type, msg) => { req.session.flash = { type, msg }; };

/** multipart formlar için: önce dosyaları ayrıştır, hatayı yakala, sonra CSRF doğrula. */
function withUpload(field, maxCount) {
  const mw = maxCount === 1 ? upload.single(field) : upload.array(field, maxCount);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) {
        req.uploadError = err.code === 'LIMIT_FILE_SIZE'
          ? 'Görsellerin her biri en fazla 8 MB olabilir.'
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Tek seferde en fazla ${MAX_FILES} görsel yükleyebilirsiniz.`
            : err.status === 400 ? err.message : 'Görsel yüklenemedi.';
        req.files = [];
        req.file = undefined;
        req.body = req.body || {};
      }
      csrfProtect(req, res, next);
    });
  };
}

// Tüm POST istekleri için CSRF. Yalnızca dosya yükleyen rotalar, gövde ayrıştırıldıktan sonra
// (withUpload içinde) doğrulanır; başka bir rotaya gönderilen multipart istek boş gövdeyle reddedilir.
const UPLOAD_ROUTES = [/^\/urunler\/(yeni|\d+)$/, /^\/ayarlar$/];
router.use((req, res, next) => {
  if (req.is('multipart/form-data') && UPLOAD_ROUTES.some((r) => r.test(req.path))) return next();
  return csrfProtect(req, res, next);
});

/* ================= Giriş / Çıkış ================= */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).render('admin/login', {
    title: 'Giriş', error: 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.', username: '',
  }),
});

router.get('/giris', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Giriş', error: null, username: '' });
});

router.post('/giris', loginLimiter, (req, res, next) => {
  const username = cleanText(req.body.username, 60);
  const password = String(req.body.password || '').slice(0, 200);
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  const ok = verifyPassword(password, admin ? admin.password_hash : DUMMY_HASH) && !!admin;

  if (!ok) {
    return res.status(401).render('admin/login', { title: 'Giriş', error: 'Kullanıcı adı veya parola hatalı.', username });
  }
  // Oturum sabitleme saldırılarına karşı yeni oturum kimliği
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.adminId = admin.id;
    req.session.adminName = admin.username;
    req.session.save((err2) => (err2 ? next(err2) : res.redirect('/admin')));
  });
});

router.post('/cikis', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('dk.sid');
    res.redirect('/admin/giris');
  });
});

// Buradan sonrası giriş gerektirir
router.use(requireAdmin);

/* ================= Özet ================= */
router.get('/', (req, res) => {
  const stats = {
    products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
    active: db.prepare('SELECT COUNT(*) AS n FROM products WHERE is_active = 1').get().n,
    categories: db.prepare('SELECT COUNT(*) AS n FROM categories').get().n,
    requests: db.prepare("SELECT COUNT(*) AS n FROM custom_requests WHERE status = 'new'").get().n,
  };
  const recentRequests = db.prepare('SELECT * FROM custom_requests ORDER BY created_at DESC LIMIT 5').all();
  const recentProducts = db
    .prepare(`SELECT p.id, p.name, p.price_cents, p.is_active, p.updated_at,
                (SELECT filename FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image
              FROM products p ORDER BY p.updated_at DESC LIMIT 5`)
    .all();
  res.render('admin/dashboard', { title: 'Genel Bakış', stats, recentRequests, recentProducts });
});

/* ================= Ürünler ================= */
router.get('/urunler', (req, res) => {
  const q = cleanText(req.query.q, 80);
  const categoryId = toInt(req.query.kategori);
  const where = [];
  const params = [];
  if (q) {
    where.push("(p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\')");
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    params.push(like, like);
  }
  if (categoryId) { where.push('p.category_id = ?'); params.push(categoryId); }

  const products = db
    .prepare(`SELECT p.*, c.name AS category_name,
                (SELECT filename FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image
              FROM products p LEFT JOIN categories c ON c.id = p.category_id
              ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
              ORDER BY p.updated_at DESC LIMIT 500`)
    .all(...params);
  const categories = db.prepare('SELECT id, name FROM categories ORDER BY sort_order, name').all();
  res.render('admin/products', { title: 'Ürünler', products, categories, q, categoryId });
});

function emptyProduct() {
  return {
    id: null, name: '', slug: '', category_id: null, short_desc: '', description: '', price: '', compare_price: '',
    sku: '', stock: '', is_active: 1, is_featured: 0, is_customizable: 0,
  };
}

function renderProductForm(res, product, images, errors = {}, status = 200) {
  const categories = db.prepare('SELECT id, name FROM categories ORDER BY sort_order, name').all();
  res.status(status).render('admin/product-form', {
    title: product.id ? 'Ürünü Düzenle' : 'Yeni Ürün', product, images, categories, errors, maxFiles: MAX_FILES,
  });
}

function readProductForm(body) {
  const values = {
    name: cleanText(body.name, 150),
    slug: slugify(cleanText(body.slug, 80)),
    category_id: toInt(body.category_id),
    short_desc: cleanText(body.short_desc, 300),
    description: cleanText(body.description, 8000),
    price: cleanText(body.price, 20),
    compare_price: cleanText(body.compare_price, 20),
    sku: cleanText(body.sku, 60),
    stock: cleanText(body.stock, 10),
    is_active: body.is_active ? 1 : 0,
    is_featured: body.is_featured ? 1 : 0,
    is_customizable: body.is_customizable ? 1 : 0,
  };
  const errors = {};
  if (values.name.length < 2) errors.name = 'Ürün adı en az 2 karakter olmalı.';
  const price = parsePrice(values.price);
  const compare = parsePrice(values.compare_price);
  if (price === undefined) errors.price = 'Fiyat geçersiz. Örnek: 1250 veya 1.250,90';
  if (compare === undefined) errors.compare_price = 'Eski fiyat geçersiz.';
  if (price != null && compare != null && compare <= price) errors.compare_price = 'Eski fiyat, satış fiyatından yüksek olmalı.';
  let stock = null;
  if (values.stock !== '') {
    stock = toInt(values.stock);
    if (stock === null || stock < 0) errors.stock = 'Stok 0 veya daha büyük bir tam sayı olmalı.';
  }
  if (values.category_id && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(values.category_id)) {
    errors.category_id = 'Kategori bulunamadı.';
  }
  return { values, errors, data: { price_cents: price ?? null, compare_price_cents: compare ?? null, stock } };
}

async function storeImages(productId, files) {
  let order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM product_images WHERE product_id = ?').get(productId).m;
  const ins = db.prepare('INSERT INTO product_images (product_id, filename, sort_order) VALUES (?, ?, ?)');
  for (const f of files || []) {
    const filename = await saveImage(f.buffer);
    ins.run(productId, filename, ++order);
  }
}

router.get('/urunler/yeni', (req, res) => renderProductForm(res, emptyProduct(), []));

router.post('/urunler/yeni', withUpload('images', MAX_FILES), async (req, res, next) => {
  try {
    const { values, errors, data } = readProductForm(req.body);
    if (req.uploadError) errors.images = req.uploadError;
    else { const bad = await validateImages(req.files); if (bad) errors.images = bad; }
    if (Object.keys(errors).length) return renderProductForm(res, { ...emptyProduct(), ...values }, [], errors, 422);

    const slug = uniqueSlug(db, 'products', values.slug || values.name);
    const info = db.prepare(`INSERT INTO products
        (name, slug, category_id, short_desc, description, price_cents, compare_price_cents, sku, stock, is_active, is_featured, is_customizable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(values.name, slug, values.category_id, values.short_desc, values.description, data.price_cents,
        data.compare_price_cents, values.sku || null, data.stock, values.is_active, values.is_featured, values.is_customizable);
    const id = Number(info.lastInsertRowid);

    try {
      await storeImages(id, req.files);
    } catch (e) {
      flash(req, 'error', 'Ürün kaydedildi fakat bazı görseller işlenemedi. Lütfen tekrar yükleyin.');
      return res.redirect(`/admin/urunler/${id}`);
    }
    flash(req, 'success', 'Ürün eklendi.');
    res.redirect(`/admin/urunler/${id}`);
  } catch (e) { next(e); }
});

function loadProduct(req, res, next) {
  const id = toInt(req.params.id);
  const product = id && db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return res.status(404).render('admin/not-found', { title: 'Bulunamadı' });
  req.product = product;
  next();
}

const productImages = (id) => db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id').all(id);

router.get('/urunler/:id', loadProduct, (req, res) => {
  const p = req.product;
  renderProductForm(res, {
    ...p, price: centsToInput(p.price_cents), compare_price: centsToInput(p.compare_price_cents),
    stock: p.stock ?? '', sku: p.sku ?? '',
  }, productImages(p.id));
});

router.post('/urunler/:id', loadProduct, withUpload('images', MAX_FILES), async (req, res, next) => {
  try {
    const id = req.product.id;
    const { values, errors, data } = readProductForm(req.body);
    if (req.uploadError) errors.images = req.uploadError;
    else { const bad = await validateImages(req.files); if (bad) errors.images = bad; }
    if (Object.keys(errors).length) return renderProductForm(res, { ...req.product, ...values }, productImages(id), errors, 422);

    const slug = uniqueSlug(db, 'products', values.slug || values.name, id);
    db.prepare(`UPDATE products SET name = ?, slug = ?, category_id = ?, short_desc = ?, description = ?, price_cents = ?,
        compare_price_cents = ?, sku = ?, stock = ?, is_active = ?, is_featured = ?, is_customizable = ?, updated_at = datetime('now')
        WHERE id = ?`)
      .run(values.name, slug, values.category_id, values.short_desc, values.description, data.price_cents,
        data.compare_price_cents, values.sku || null, data.stock, values.is_active, values.is_featured, values.is_customizable, id);

    try {
      await storeImages(id, req.files);
    } catch (e) {
      flash(req, 'error', 'Bilgiler kaydedildi fakat bazı görseller işlenemedi.');
      return res.redirect(`/admin/urunler/${id}`);
    }
    flash(req, 'success', 'Değişiklikler kaydedildi.');
    res.redirect(`/admin/urunler/${id}`);
  } catch (e) { next(e); }
});

router.post('/urunler/:id/sil', loadProduct, (req, res) => {
  const images = productImages(req.product.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.product.id);
  images.forEach((img) => removeImage(img.filename));
  flash(req, 'success', `"${req.product.name}" silindi.`);
  res.redirect('/admin/urunler');
});

router.post('/urunler/:id/durum', loadProduct, (req, res) => {
  db.prepare("UPDATE products SET is_active = 1 - is_active, updated_at = datetime('now') WHERE id = ?").run(req.product.id);
  res.redirect('/admin/urunler');
});

router.post('/urunler/:id/gorsel/:imageId/sil', loadProduct, (req, res) => {
  const img = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(toInt(req.params.imageId), req.product.id);
  if (img) {
    db.prepare('DELETE FROM product_images WHERE id = ?').run(img.id);
    removeImage(img.filename);
    flash(req, 'success', 'Görsel silindi.');
  }
  res.redirect(`/admin/urunler/${req.product.id}#gorseller`);
});

router.post('/urunler/:id/gorsel/:imageId/kapak', loadProduct, (req, res) => {
  const imgId = toInt(req.params.imageId);
  const images = productImages(req.product.id);
  if (images.some((i) => i.id === imgId)) {
    const upd = db.prepare('UPDATE product_images SET sort_order = ? WHERE id = ?');
    db.transaction(() => {
      upd.run(0, imgId);
      images.filter((i) => i.id !== imgId).forEach((i, idx) => upd.run(idx + 1, i.id));
    })();
    flash(req, 'success', 'Kapak görseli güncellendi.');
  }
  res.redirect(`/admin/urunler/${req.product.id}#gorseller`);
});

/* ================= Kategoriler ================= */
router.get('/kategoriler', (req, res) => {
  const categories = db
    .prepare(`SELECT c.*, COUNT(p.id) AS product_count FROM categories c
              LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.sort_order, c.name`)
    .all();
  res.render('admin/categories', { title: 'Kategoriler', categories });
});

function readCategory(body) {
  return {
    name: cleanText(body.name, 80),
    slug: slugify(cleanText(body.slug, 80)),
    description: cleanText(body.description, 300),
    sort_order: toInt(body.sort_order, 0),
  };
}

router.post('/kategoriler', (req, res) => {
  const v = readCategory(req.body);
  if (v.name.length < 2) {
    flash(req, 'error', 'Kategori adı en az 2 karakter olmalı.');
    return res.redirect('/admin/kategoriler');
  }
  db.prepare('INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)')
    .run(v.name, uniqueSlug(db, 'categories', v.slug || v.name), v.description, v.sort_order);
  flash(req, 'success', 'Kategori eklendi.');
  res.redirect('/admin/kategoriler');
});

router.post('/kategoriler/:id', (req, res) => {
  const id = toInt(req.params.id);
  const v = readCategory(req.body);
  if (!id || v.name.length < 2) {
    flash(req, 'error', 'Kategori adı en az 2 karakter olmalı.');
    return res.redirect('/admin/kategoriler');
  }
  db.prepare('UPDATE categories SET name = ?, slug = ?, description = ?, sort_order = ? WHERE id = ?')
    .run(v.name, uniqueSlug(db, 'categories', v.slug || v.name, id), v.description, v.sort_order, id);
  flash(req, 'success', 'Kategori güncellendi.');
  res.redirect('/admin/kategoriler');
});

router.post('/kategoriler/:id/sil', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(toInt(req.params.id));
  flash(req, 'success', 'Kategori silindi. Bu kategorideki ürünler "Kategorisiz" olarak kaldı.');
  res.redirect('/admin/kategoriler');
});

/* ================= Özel tasarım talepleri ================= */
const STATUS = { new: 'Yeni', read: 'İnceleniyor', done: 'Tamamlandı' };

router.get('/talepler', (req, res) => {
  const filter = STATUS[req.query.durum] ? req.query.durum : null;
  const requests = filter
    ? db.prepare('SELECT * FROM custom_requests WHERE status = ? ORDER BY created_at DESC').all(filter)
    : db.prepare('SELECT * FROM custom_requests ORDER BY created_at DESC LIMIT 500').all();
  res.render('admin/requests', { title: 'Özel Tasarım Talepleri', requests, STATUS, filter });
});

router.post('/talepler/:id/durum', (req, res) => {
  const status = STATUS[req.body.status] ? req.body.status : null;
  if (status) db.prepare('UPDATE custom_requests SET status = ? WHERE id = ?').run(status, toInt(req.params.id));
  res.redirect('/admin/talepler');
});

router.post('/talepler/:id/sil', (req, res) => {
  db.prepare('DELETE FROM custom_requests WHERE id = ?').run(toInt(req.params.id));
  flash(req, 'success', 'Talep silindi.');
  res.redirect('/admin/talepler');
});

/* ================= Site ayarları ================= */
router.get('/ayarlar', (req, res) => res.render('admin/settings', { title: 'Site Ayarları', values: getSettings(), errors: {} }));

router.post('/ayarlar', withUpload('hero_image', 1), async (req, res, next) => {
  try {
    const b = req.body;
    const current = getSettings();
    const values = {
      site_name: cleanText(b.site_name, 60),
      tagline: cleanText(b.tagline, 120),
      announcement: cleanText(b.announcement, 160),
      hero_title: cleanText(b.hero_title, 120),
      hero_text: cleanText(b.hero_text, 300),
      whatsapp: cleanText(b.whatsapp, 20).replace(/\D/g, ''),
      instagram: cleanText(b.instagram, 40).replace(/^@/, ''),
      phone: cleanText(b.phone, 30),
      email: cleanText(b.email, 120),
      address: cleanText(b.address, 200),
      about_text: cleanText(b.about_text, 3000),
    };
    const errors = {};
    if (!values.site_name) errors.site_name = 'Site adı boş olamaz.';
    if (values.whatsapp && !/^\d{10,15}$/.test(values.whatsapp)) errors.whatsapp = 'Ülke koduyla birlikte yazın. Örnek: 905321234567';
    if (values.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(values.instagram)) errors.instagram = 'Geçersiz Instagram kullanıcı adı.';
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = 'Geçersiz e-posta.';
    if (req.uploadError) errors.hero_image = req.uploadError;
    else if (req.file) { const bad = await validateImages([req.file]); if (bad) errors.hero_image = bad; }
    if (Object.keys(errors).length) {
      return res.status(422).render('admin/settings', { title: 'Site Ayarları', values: { ...current, ...values }, errors });
    }

    if (req.file) {
      values.hero_image = await saveImage(req.file.buffer, { width: 2000, height: 2000 });
      if (current.hero_image) removeImage(current.hero_image);
    } else if (b.remove_hero_image && current.hero_image) {
      values.hero_image = '';
      removeImage(current.hero_image);
    }
    saveSettings(values);
    flash(req, 'success', 'Ayarlar kaydedildi.');
    res.redirect('/admin/ayarlar');
  } catch (e) { next(e); }
});

/* ================= Parola ================= */
router.get('/parola', (req, res) => res.render('admin/password', { title: 'Parola Değiştir', error: null }));

router.post('/parola', (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  const current = String(req.body.current || '');
  const next1 = String(req.body.password || '');
  const next2 = String(req.body.password2 || '');
  let error = null;
  if (!admin || !verifyPassword(current, admin.password_hash)) error = 'Mevcut parola hatalı.';
  else if (next1 !== next2) error = 'Yeni parolalar eşleşmiyor.';
  else error = validatePasswordStrength(next1);
  if (error) return res.status(422).render('admin/password', { title: 'Parola Değiştir', error });

  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(next1), admin.id);
  // Bu kullanıcının diğer tüm oturumlarını kapat
  db.prepare('DELETE FROM sessions WHERE sid != ? AND sess LIKE ?').run(req.sessionID, `%"adminId":${admin.id},%`);
  flash(req, 'success', 'Parolanız güncellendi. Diğer cihazlardaki oturumlar kapatıldı.');
  res.redirect('/admin');
});

module.exports = router;
