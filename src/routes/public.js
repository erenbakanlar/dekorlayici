'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { csrfProtect } = require('../security');
const { cleanText, toInt, waLink, baseUrl } = require('../utils');

const router = express.Router();

const CARD_FIELDS = `
  p.id, p.name, p.slug, p.short_desc, p.price_cents, p.compare_price_cents, p.stock,
  p.is_customizable, p.is_featured, c.name AS category_name, c.slug AS category_slug,
  (SELECT filename FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1) AS image,
  (SELECT filename FROM product_images WHERE product_id = p.id ORDER BY sort_order, id LIMIT 1 OFFSET 1) AS image2`;

const PER_PAGE = 12;
const SORTS = {
  yeni: 'p.created_at DESC, p.id DESC',
  'fiyat-artan': 'p.price_cents IS NULL, p.price_cents ASC',
  'fiyat-azalan': 'p.price_cents IS NULL, p.price_cents DESC',
  ad: 'p.name COLLATE NOCASE ASC',
};

const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/* ---------------- Ana sayfa ---------------- */
router.get('/', (req, res) => {
  const featured = db
    .prepare(`SELECT ${CARD_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
              WHERE p.is_active = 1 AND p.is_featured = 1 ORDER BY p.updated_at DESC LIMIT 8`)
    .all();
  const latest = db
    .prepare(`SELECT ${CARD_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
              WHERE p.is_active = 1 ORDER BY p.created_at DESC, p.id DESC LIMIT 8`)
    .all();
  const categories = db
    .prepare(`SELECT c.*, COUNT(p.id) AS product_count,
                (SELECT pi.filename FROM products p2 JOIN product_images pi ON pi.product_id = p2.id
                  WHERE p2.category_id = c.id AND p2.is_active = 1 ORDER BY p2.is_featured DESC, pi.sort_order LIMIT 1) AS image
              FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
              GROUP BY c.id ORDER BY c.sort_order, c.name`)
    .all();

  res.render('public/home', { title: null, featured, latest, categories });
});

/* ---------------- Ürün listesi ---------------- */
router.get('/urunler', (req, res) => {
  const q = cleanText(req.query.q, 80);
  const sort = SORTS[req.query.sirala] ? req.query.sirala : 'yeni';
  const categorySlug = cleanText(req.query.kategori, 80);
  const onlyCustom = req.query.ozel === '1';

  const where = ['p.is_active = 1'];
  const params = [];
  let category = null;

  if (categorySlug) {
    category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(categorySlug);
    if (!category) return res.redirect('/urunler');
    where.push('p.category_id = ?');
    params.push(category.id);
  }
  if (q) {
    where.push("(p.name LIKE ? ESCAPE '\\' OR p.short_desc LIKE ? ESCAPE '\\')");
    const like = `%${likeEscape(q)}%`;
    params.push(like, like);
  }
  if (onlyCustom) where.push('p.is_customizable = 1');

  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${whereSql}`).get(...params).n;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(1, toInt(req.query.sayfa, 1)), pages);

  const products = db
    .prepare(`SELECT ${CARD_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
              WHERE ${whereSql} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`)
    .all(...params, PER_PAGE, (page - 1) * PER_PAGE);

  const buildUrl = (overrides) => {
    const sp = new URLSearchParams();
    const state = { kategori: categorySlug, q, sirala: sort === 'yeni' ? '' : sort, ozel: onlyCustom ? '1' : '', sayfa: '', ...overrides };
    for (const [k, v] of Object.entries(state)) if (v) sp.set(k, v);
    const s = sp.toString();
    return `/urunler${s ? `?${s}` : ''}`;
  };

  res.render('public/products', {
    title: category ? category.name : q ? `"${q}" için sonuçlar` : 'Tüm Ürünler',
    products, category, q, sort, onlyCustom, total, page, pages, buildUrl,
  });
});

/* ---------------- Ürün detay ---------------- */
router.get('/urun/:slug', (req, res, next) => {
  const product = db
    .prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug
              FROM products p LEFT JOIN categories c ON c.id = p.category_id
              WHERE p.slug = ? AND p.is_active = 1`)
    .get(String(req.params.slug));
  if (!product) return next();

  const images = db.prepare('SELECT filename FROM product_images WHERE product_id = ? ORDER BY sort_order, id').all(product.id);
  const related = db
    .prepare(`SELECT ${CARD_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
              WHERE p.is_active = 1 AND p.id != ? AND p.category_id IS ?
              ORDER BY RANDOM() LIMIT 4`)
    .all(product.id, product.category_id);

  const pageUrl = `${baseUrl(req)}/urun/${product.slug}`;
  const orderUrl = waLink(
    res.locals.settings.whatsapp,
    `Merhaba, "${product.name}" ürünü hakkında bilgi almak / sipariş vermek istiyorum.\n${pageUrl}`
  );

  res.render('public/product', { title: product.name, product, images, related, orderUrl, description: product.short_desc });
});

/* ---------------- Kişiye özel tasarım ---------------- */
const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  skipFailedRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    req.session.flash = { type: 'error', msg: 'Çok fazla talep gönderdiniz. Lütfen bir süre sonra tekrar deneyin veya WhatsApp üzerinden yazın.' };
    res.redirect('/kisiye-ozel#talep');
  },
});

function renderCustom(req, res, extra = {}) {
  const customProducts = db
    .prepare(`SELECT ${CARD_FIELDS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
              WHERE p.is_active = 1 AND p.is_customizable = 1 ORDER BY p.is_featured DESC, p.created_at DESC LIMIT 4`)
    .all();
  res.render('public/custom', {
    title: 'Kişiye Özel Tasarım',
    description: 'İsim, renk ve ölçüye göre size özel dekor tasarımları.',
    customProducts,
    values: {},
    errors: {},
    sent: req.query.gonderildi === '1',
    prefill: cleanText(req.query.urun, 100),
    ...extra,
  });
}

router.get('/kisiye-ozel', (req, res) => renderCustom(req, res));

router.post('/kisiye-ozel', requestLimiter, csrfProtect, (req, res) => {
  // Bal küpü alanı: gerçek kullanıcılar görmez, botlar doldurur.
  if (req.body.website) return res.redirect('/kisiye-ozel?gonderildi=1#talep');

  const values = {
    name: cleanText(req.body.name, 100),
    phone: cleanText(req.body.phone, 30),
    email: cleanText(req.body.email, 120),
    product_type: cleanText(req.body.product_type, 100),
    message: cleanText(req.body.message, 2000),
  };
  const errors = {};
  if (values.name.length < 2) errors.name = 'Lütfen adınızı yazın.';
  if (!/^[+\d][\d\s()-]{8,}$/.test(values.phone)) errors.phone = 'Geçerli bir telefon numarası yazın.';
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = 'E-posta adresi geçersiz.';
  if (values.message.length < 10) errors.message = 'Tasarımınızı biraz daha anlatır mısınız? (en az 10 karakter)';

  if (Object.keys(errors).length) {
    res.status(422);
    return renderCustom(req, res, { values, errors });
  }

  db.prepare('INSERT INTO custom_requests (name, phone, email, product_type, message) VALUES (?, ?, ?, ?, ?)')
    .run(values.name, values.phone, values.email, values.product_type, values.message);
  res.redirect('/kisiye-ozel?gonderildi=1#talep');
});

/* ---------------- Statik sayfalar ---------------- */
router.get('/hakkimizda', (req, res) => res.render('public/about', { title: 'Hakkımızda' }));

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (req, res) => {
  const base = baseUrl(req);
  const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const urls = ['/', '/urunler', '/kisiye-ozel', '/hakkimizda'];
  for (const c of db.prepare('SELECT slug FROM categories').all()) urls.push(`/urunler?kategori=${c.slug}`);
  for (const p of db.prepare('SELECT slug FROM products WHERE is_active = 1').all()) urls.push(`/urun/${p.slug}`);
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map((u) => `<url><loc>${esc(base + u)}</loc></url>`)
      .join('')}</urlset>`
  );
});

module.exports = router;
