'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Plesk/Passenger gibi ortamlar server.js'i doğrudan çalıştırır; .env varsa burada yüklenir.
const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE) && typeof process.loadEnvFile === 'function') process.loadEnvFile(ENV_FILE);

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');

const db = require('./src/db');
const SqliteStore = require('./src/session-store');
const { getSettings } = require('./src/settings');
const { csrfToken } = require('./src/security');
const { formatPrice, waLink, igLink } = require('./src/utils');

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

/**
 * Oturum anahtarı: SESSION_SECRET tanımlıysa o kullanılır. Değilse bir kez rastgele üretilip
 * data/ klasöründe (web kökü dışında, yalnızca sahibi okuyabilir) saklanır; yeniden başlatmada oturumlar korunur.
 */
function loadSessionSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  const file = path.join(__dirname, 'data', '.session-secret');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return saved;
  } catch { /* ilk çalıştırma */ }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  console.warn('Bilgi: SESSION_SECRET tanımlı olmadığından data/.session-secret dosyasında yeni bir anahtar oluşturuldu.');
  return secret;
}
const sessionSecret = loadSessionSecret();

const app = express();
app.disable('x-powered-by');
// Üretimde site Plesk'in Nginx/Apache vekili arkasında çalışır: HTTPS ve IP bilgisini vekilden al.
const trustProxy = process.env.TRUST_PROXY || (isProd ? '1' : '');
if (trustProxy) app.set('trust proxy', Number(trustProxy) || 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (isProd) app.set('view cache', true);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'upgrade-insecure-requests': isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(compression());

app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    maxAge: '30d',
    immutable: true,
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('Content-Disposition', 'inline'),
  })
);

app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 100 }));

app.use(
  session({
    name: 'dk.sid',
    secret: sessionSecret,
    store: new SqliteStore(db),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProd ? 'auto' : false, maxAge: 1000 * 60 * 60 * 8 },
  })
);

const navCategoriesStmt = db.prepare('SELECT id, name, slug FROM categories ORDER BY sort_order, name');

// Tüm şablonlarda kullanılan ortak değişkenler
app.use((req, res, next) => {
  const settings = getSettings();
  res.locals.settings = settings;
  res.locals.path = req.path;
  res.locals.formatPrice = formatPrice;
  res.locals.waLink = waLink;
  res.locals.waUrl = waLink(settings.whatsapp, 'Merhaba, ürünleriniz hakkında bilgi almak istiyorum.');
  res.locals.igUrl = igLink(settings.instagram);
  res.locals.csrf = () => csrfToken(req);
  res.locals.year = new Date().getFullYear();
  res.locals.navCategories = navCategoriesStmt.all();
  res.locals.flash = req.session && req.session.flash;
  if (req.session && req.session.flash) delete req.session.flash;
  next();
});

app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/public'));

// 404
app.use((req, res) => {
  res.status(404).render('public/error', { title: 'Sayfa bulunamadı', code: 404, message: 'Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.' });
});

// Hata yakalayıcı: ayrıntılar sadece sunucu loguna yazılır, kullanıcıya genel mesaj gösterilir.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || (err.code && String(err.code).startsWith('LIMIT_') ? 400 : 500);
  if (status >= 500) console.error(err);
  const message = status < 500 ? err.message : 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.';
  if (res.headersSent) return req.socket.destroy();
  res.status(status);
  if (!res.locals.settings) return res.type('text/plain').send(message);
  res.render('public/error', { title: 'Bir sorun oluştu', code: status, message }, (renderErr, html) => {
    if (renderErr) {
      console.error(renderErr);
      return res.type('text/plain').send(message);
    }
    res.send(html);
  });
});

app.listen(PORT, () => console.log(`Dekorlayıcı çalışıyor → http://localhost:${PORT}`));
