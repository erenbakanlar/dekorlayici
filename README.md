# Dekorlayıcı — Katalog Sitesi & Yönetim Paneli

Node.js + Express + SQLite ile yazılmış, ileride e-ticarete dönüştürülmeye hazır dekor katalog sitesi.

## Kurulum

```bash
npm install
cp .env.example .env          # SESSION_SECRET'i doldurun
npm run admin:create -- admin # parolayı ekrana yazar
npm run seed                  # (isteğe bağlı) örnek ürünler
npm start                     # http://localhost:3000
```

Yönetim paneli: `http://localhost:3000/admin`

## Sayfalar

| Yol | İçerik |
| --- | --- |
| `/` | Hero, kategoriler, öne çıkanlar, kişiye özel bandı, yeni gelenler, Instagram |
| `/urunler` | Kategori, arama, sıralama, “kişiye özel” filtresi, sayfalama |
| `/urun/:slug` | Galeri, fiyat/indirim, WhatsApp ile sipariş (ürün linkiyle hazır mesaj) |
| `/kisiye-ozel` | Süreç, talep formu (panelde “Özel Talepler”e düşer) |
| `/hakkimizda` | Panelden düzenlenen metin |

## Panel

- **Ürünler:** ekle / düzenle / sil, çoklu görsel, kapak seçimi, yayında–taslak, öne çıkar, kişiye özel, fiyat & eski fiyat, stok, ürün kodu
- **Kategoriler:** ekle / düzenle / sırala / sil
- **Özel Talepler:** durum takibi (Yeni / İnceleniyor / Tamamlandı), tek tıkla WhatsApp
- **Site Ayarları:** site adı, duyuru şeridi, hero metni ve görseli, WhatsApp, Instagram, iletişim, hakkımızda
- **Parola değiştirme**

## Güvenlik

- Parolalar `scrypt` ile hash'lenir; girişte zamanlama saldırısına karşı sabit süreli karşılaştırma
- Giriş denemesi sınırı (15 dk'da 10 başarısız), oturum sabitlemeye karşı oturum yenileme
- Tüm formlarda CSRF token; multipart istekler yalnızca yükleme rotalarında kabul edilir
- Sıkı Content-Security-Policy (satır içi script yok), `helmet` güvenlik başlıkları
- Çerezler `HttpOnly`, `SameSite=Lax`, üretimde `Secure`
- Yüklenen görseller bellekte doğrulanır, WEBP'ye yeniden kodlanır (EXIF/konum silinir), rastgele adla kaydedilir
- Tüm SQL sorguları parametreli; tüm çıktılar EJS ile kaçışlı
- Özel talep formunda hız sınırı + bal küpü (bot) alanı
- Panel `noindex` ve `no-store`

## Yayına alırken

1. `.env` içinde `NODE_ENV=production`, güçlü `SESSION_SECRET`, `SITE_URL=https://alanadiniz.com`
2. HTTPS arkasında (Nginx/Caddy/Cloudflare) çalıştırın ve `TRUST_PROXY=1` yapın
3. `data/` (veritabanı) ve `uploads/` (görseller) klasörlerini düzenli yedekleyin

## Ödeme altyapısına geçiş için hazırlık

- Fiyatlar veritabanında **kuruş** (tam sayı) olarak tutulur — yuvarlama hatası olmaz
- Ürünlerde `stock` ve `sku` alanları hazır
- Sonraki adımlar: sepet (oturum tabanlı), `orders` / `order_items` tabloları, iyzico/PayTR entegrasyonu ve ödeme bildirimi (webhook) doğrulaması
