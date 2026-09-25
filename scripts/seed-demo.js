'use strict';

/**
 * Tasarımı görebilmeniz için örnek ürünler ekler (görseller palete uygun, üretilmiş illüstrasyonlardır).
 *   npm run seed
 * Gerçek ürünlerinizi ekledikten sonra bu örnekleri panelden silebilirsiniz.
 */
const sharp = require('sharp');
const db = require('../src/db');
const { saveImage } = require('../src/upload');
const { uniqueSlug } = require('../src/utils');

const P = { cream: '#F8F4EE', linen: '#EFE7DC', sand: '#DCCBB5', clay: '#B8673F', claySoft: '#F1DFD3', olive: '#3E4A3D', oliveSoft: '#E3E6DC', ink: '#2A2520' };

const shapes = {
  vase: (a, b) => `<path d="M250 250c-40 60-70 120-70 210 0 110 60 190 120 190s120-80 120-190c0-90-30-150-70-210v-60h-100z" fill="${a}"/><rect x="235" y="170" width="130" height="30" rx="10" fill="${b}"/><path d="M300 190c0-60 20-110 60-140M300 190c-10-50-40-90-80-110" stroke="${P.olive}" stroke-width="6" fill="none"/><ellipse cx="360" cy="48" rx="26" ry="12" fill="${P.olive}" transform="rotate(-30 360 48)"/><ellipse cx="220" cy="78" rx="24" ry="11" fill="${P.olive}" transform="rotate(25 220 78)"/>`,
  candle: (a, b) => `<rect x="200" y="330" width="200" height="330" rx="18" fill="${a}"/><rect x="170" y="630" width="260" height="40" rx="12" fill="${b}"/><path d="M300 330v-40" stroke="${P.ink}" stroke-width="5"/><path d="M300 200c30 40 30 80 0 95-30-15-30-55 0-95z" fill="${P.clay}"/><circle cx="300" cy="260" r="80" fill="${P.clay}" opacity=".12"/>`,
  frame: (a, b) => `<rect x="130" y="150" width="340" height="440" rx="6" fill="${b}"/><rect x="160" y="180" width="280" height="380" fill="${P.cream}"/><path d="M160 560V420a140 140 0 0 1 280 0v140z" fill="${a}"/><circle cx="360" cy="270" r="40" fill="${P.clay}"/>`,
  mirror: (a, b) => `<path d="M160 660V330a140 140 0 0 1 280 0v330z" fill="${b}"/><path d="M185 640V335a115 115 0 0 1 230 0v305z" fill="${a}"/><path d="M230 300l60-60M250 360l90-90" stroke="${P.cream}" stroke-width="8" stroke-linecap="round" opacity=".7"/>`,
  bowl: (a, b) => `<path d="M140 420h320c0 110-70 190-160 190s-160-80-160-190z" fill="${a}"/><rect x="250" y="600" width="100" height="30" rx="8" fill="${b}"/><circle cx="240" cy="390" r="50" fill="${P.clay}"/><circle cx="330" cy="380" r="44" fill="${P.olive}"/><circle cx="290" cy="340" r="36" fill="${P.sand}"/>`,
  sign: (a, b) => `<path d="M300 140l-110 120M300 140l110 120" stroke="${P.ink}" stroke-width="4"/><circle cx="300" cy="140" r="10" fill="${P.ink}"/><rect x="140" y="260" width="320" height="200" rx="100" fill="${a}"/><text x="300" y="378" text-anchor="middle" font-family="Georgia, serif" font-size="56" font-style="italic" fill="${b}">Yuva</text>`,
};

function svg(shape, bg, a, b) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
    <rect width="600" height="750" fill="${bg}"/>
    <circle cx="470" cy="130" r="90" fill="${P.cream}" opacity=".55"/>
    <rect y="620" width="600" height="130" fill="${P.ink}" opacity=".05"/>
    ${shapes[shape](a, b)}
  </svg>`);
}

const demo = [
  { name: 'Kil Dokulu Seramik Vazo', cat: 'vazo-saksi', price: 649, compare: 790, featured: 1, custom: 0, desc: 'El şekillendirmesi mat seramik vazo. Kuru ve taze çiçekler için.', imgs: [['vase', P.linen, P.clay, P.olive], ['vase', P.oliveSoft, P.clay, P.sand]] },
  { name: 'Zeytin Yeşili Soya Mum', cat: 'mum-mumluk', price: 349, featured: 1, custom: 1, desc: 'Doğal soya mumu, pamuk fitil, 40 saat yanma süresi.', imgs: [['candle', P.claySoft, P.olive, P.sand], ['candle', P.linen, P.olive, P.clay]] },
  { name: 'Kemer Formlu Duvar Aynası', cat: 'duvar-dekoru', price: 1890, featured: 1, custom: 0, desc: 'Masif ahşap çerçeveli, kemer formlu dekoratif ayna.', imgs: [['mirror', P.sand, P.oliveSoft, P.olive]] },
  { name: 'İsme Özel Kapı Süsü', cat: 'kisiye-ozel', price: null, featured: 1, custom: 1, desc: 'Ailenizin adıyla hazırlanan el yapımı kapı süsü.', imgs: [['sign', P.oliveSoft, P.clay, P.cream]] },
  { name: 'Soyut Kemer Poster', cat: 'tablo-poster', price: 459, featured: 0, custom: 1, desc: 'Minimal çizgilerle toprak tonlarında poster, çerçeveli.', imgs: [['frame', P.claySoft, P.olive, P.sand]] },
  { name: 'Dekoratif Ahşap Kase', cat: 'vazo-saksi', price: 529, featured: 0, custom: 0, desc: 'Sehpa ve konsollar için el oyması ahşap kase.', imgs: [['bowl', P.linen, P.sand, P.olive]] },
  { name: 'Kil Rengi Silindir Mum', cat: 'mum-mumluk', price: 279, compare: 329, featured: 0, custom: 0, desc: 'Kokusuz, damlatmayan silindir sütun mum.', imgs: [['candle', P.oliveSoft, P.clay, P.olive]] },
  { name: 'Güneş Doğuşu Tablo', cat: 'tablo-poster', price: 899, featured: 0, custom: 1, desc: 'Tuval üzerine akrilik, el boyaması tablo.', imgs: [['frame', P.sand, P.clay, P.olive]] },
];

(async () => {
  const catId = (slug) => (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) || {}).id || null;
  const ins = db.prepare(`INSERT INTO products (name, slug, category_id, short_desc, description, price_cents, compare_price_cents, is_active, is_featured, is_customizable)
                          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
  const insImg = db.prepare('INSERT INTO product_images (product_id, filename, sort_order) VALUES (?, ?, ?)');

  for (const d of demo) {
    if (db.prepare('SELECT 1 FROM products WHERE name = ?').get(d.name)) continue;
    const info = ins.run(d.name, uniqueSlug(db, 'products', d.name), catId(d.cat), d.desc,
      `${d.desc}\n\nÖlçü, renk ve paketleme seçenekleri için bize WhatsApp üzerinden ulaşabilirsiniz.`,
      d.price != null ? d.price * 100 : null, d.compare ? d.compare * 100 : null, d.featured, d.custom);
    let i = 0;
    for (const [shape, bg, a, b] of d.imgs) {
      const png = await sharp(svg(shape, bg, a, b)).png().toBuffer();
      insImg.run(info.lastInsertRowid, await saveImage(png), i++);
    }
    console.log(`+ ${d.name}`);
  }
  console.log('Örnek ürünler hazır.');
})();
