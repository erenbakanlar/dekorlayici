'use strict';

/**
 * Yönetici oluşturur ya da mevcut yöneticinin parolasını sıfırlar.
 *   npm run admin:create -- <kullanici> [parola]
 * Parola verilmezse güçlü bir parola üretilip ekrana yazılır.
 */
const crypto = require('crypto');
const db = require('../src/db');
const { hashPassword, validatePasswordStrength } = require('../src/security');

const [username, givenPassword] = process.argv.slice(2);

if (!username || !/^[A-Za-z0-9._-]{3,60}$/.test(username)) {
  console.error('Kullanım: npm run admin:create -- <kullanici_adi> [parola]');
  console.error('Kullanıcı adı 3-60 karakter; harf, rakam, nokta, tire veya alt çizgi içerebilir.');
  process.exit(1);
}

const password = givenPassword || `${crypto.randomBytes(9).toString('base64url')}7a`;
const problem = validatePasswordStrength(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
if (existing) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(password), existing.id);
  db.prepare('DELETE FROM sessions WHERE sess LIKE ?').run(`%"adminId":${existing.id},%`);
  console.log(`"${username}" kullanıcısının parolası güncellendi.`);
} else {
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
  console.log(`"${username}" yöneticisi oluşturuldu.`);
}
if (!givenPassword) console.log(`Parola: ${password}\nGiriş yaptıktan sonra panelden değiştirmeniz önerilir.`);
