const express = require('express');

//const multer = require("multer");
//const path = require("path");
const bodyParser = require('body-parser');
const cors = require('cors');
const router = express.Router();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// MySQL bağlantısı
const mysql = require('mysql2');
require('dotenv').config(); 

const db = mysql.createConnection({
  host: process.env.DB_HOST,      
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true
});

// Güvenlik ve e-posta için
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const multer = require('multer');
const path = require('path');

// SendGrid konfigürasyonu
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

db.connect((err) => {
  if (err) {
    console.error('MySQL bağlantı hatası:', err);
    return;
  }
  console.log('✅ MySQL bağlantısı kuruldu.');
});


// Login Route
/*app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email ve şifre zorunludur.' });
  }

  const sql = 'SELECT * FROM users WHERE email = ? AND password = ?';
  db.query(sql, [email, password], (err, results) => {
    if (err) {
      console.error('Giriş hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }

    if (results.length > 0) {
      // Kullanıcı bulunduysa başarı cevabı dön
      return res.status(200).json({
        message: 'Giriş başarılı!',
        user: {
          id: results[0].id,
          name: results[0].name,
          email: results[0].email
        }
      });
    } else {
      // Kullanıcı bulunamadıysa hata dön
      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
    }
  });
});*/

// New Login Route
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  // 1) Gerekli alanlar kontrolü
  if (!email || !password) {
    return res.status(400).json({ error: 'Email ve şifre zorunludur.' });
  }

  try {
    // 2) Sadece e-posta ile kullanıcıyı çek
    const [rows] = await db.promise().query(
      'SELECT id, name, email, password FROM users WHERE email = ?',
      [email]
    );

    // 3) Kullanıcı yoksa
    if (!rows.length) {
      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
    }

    const user = rows[0];

    // 4) Bcrypt ile şifre karşılaştırması
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
    }

    // 5) Başarılı yanıt
    return res.status(200).json({
      message: 'Giriş başarılı!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


// Signup Route
/*app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur.' });
  }

  // Önce aynı email var mı kontrol et
  const checkUserSql = 'SELECT * FROM users WHERE email = ?';
  db.query(checkUserSql, [email], (err, results) => {
    if (err) {
      console.error('Kullanıcı kontrol hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }

    if (results.length > 0) {
      // Aynı email zaten kayıtlıysa hata döndür
      return res.status(409).json({ error: 'Bu e-posta zaten kullanılıyor.' });
    }

    // Email kullanılmıyorsa yeni kullanıcı ekle
    const insertUserSql = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
    db.query(insertUserSql, [name, email, password], (err, result) => {
      if (err) {
        console.error('Kayıt hatası:', err);
        return res.status(500).json({ error: 'Kayıt yapılamadı.' });
      }
      return res.status(201).json({ message: 'Kullanıcı başarıyla kaydedildi.' });
    });
  });
});*/

//New Signup Route
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;

  // 1) Gerekli alanlar kontrolü
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur.' });
  }

  try {
    // 2) Aynı e-posta zaten kayıtlı mı?
    const [existing] = await db.promise().query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Bu e-posta zaten kullanılıyor.' });
    }

    // 3) Şifreyi bcrypt ile hash’le
    const hashedPwd = await bcrypt.hash(password, 10);

    // 4) Yeni kullanıcıyı ekle
    await db.promise().execute(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPwd]
    );

    // 5) Başarı yanıtı
    return res.status(201).json({ message: 'Kullanıcı başarıyla kaydedildi.' });
  } catch (err) {
    console.error('Signup hatası:', err);
    return res.status(500).json({ error: 'Kayıt yapılamadı.' });
  }
});

// Forgot Password Route
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  // 1) Email alanı zorunlu
  if (!email) {
    return res.status(400).json({ error: 'Email zorunludur.' });
  }

  try {
    // 2) Veritabanından userId'yi al
    const [users] = await db.promise().query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (!users.length) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }
    const userId = users[0].id;

    // 3) Rastgele token ve SHA-256 hash'ini oluştur
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 saat geçerli

    // 4) password_resets tablosuna kaydet
    await db.promise().execute(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );

    // 5) Reset linkini hazırla ve e-posta gönder
    const resetLink = `${process.env.FRONTEND_URL}?token=${token}&id=${userId}`;
    await sgMail.send({
      to: email,
      from: process.env.SENDGRID_FROM,
      subject: 'Bookify Şifre Sıfırlama',
      html: `
        <p>Şifrenizi yenilemek için aşağıdaki linke tıklayın:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>Link 1 saat içinde geçerlidir.</p>
      `
    });

    // 6) İstemciye bilgi dön
    return res.json({ message: 'Sıfırlama linki e-postanıza gönderildi.' });
  } catch (err) {
    console.error('Forgot-password hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Reset Password Route
app.post('/api/auth/reset-password', async (req, res) => {
  const { userId, token, newPassword } = req.body;

  // 1) Gerekli alanlar kontrolü
  if (!userId || !token || !newPassword) {
    return res.status(400).json({ error: 'userId, token ve newPassword zorunludur.' });
  }

  try {
    // 2) Gönderilen token'ın SHA-256 hash’ini oluştur
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // 3) Bu hash ve userId için hâlâ geçerli bir kayıt var mı kontrol et
    const [rows] = await db.promise().query(
      `SELECT * FROM password_resets
       WHERE user_id = ? AND token_hash = ? AND expires_at > NOW()`,
      [userId, tokenHash]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş token.' });
    }

    // 4) Yeni şifreyi bcrypt ile hash’le ve users tablosunu güncelle
    const hashedPwd = await bcrypt.hash(newPassword, 10);
    await db.promise().execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPwd, userId]
    );

    // 5) Kullanılan token kaydını temizle
    await db.promise().execute(
      'DELETE FROM password_resets WHERE user_id = ?',
      [userId]
    );

    // 6) Başarı yanıtı
    return res.json({ message: 'Şifre başarıyla güncellendi.' });
  } catch (err) {
    console.error('Reset-password hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Kullanıcının favori kitaplarını döner
 app.get('/api/favorites/:userId', async (req, res) => {
   const { userId } = req.params;
   const sql = `
     SELECT b.*
     FROM favorites f
     JOIN books b ON f.book_id = b.id
     WHERE f.user_id = ?
   `;
   db.promise().query(sql, [userId])
     .then(([rows]) => res.json(rows))
     .catch(err => {
       console.error('Favorites çekme hatası:', err);
       res.status(500).json({ error: 'Veritabanı hatası.' });
     });
 });

// app.get('/api/favorites/:userId', async (req, res) => {
//   const { userId } = req.params;
//   try {
//     const [rows] = await db.query(
//       `SELECT
//          b.id,
//          b.title,
//          b.authors,
//          b.description,
//          b.thumbnail_url  AS thumbnailUrl,
//          b.published_date AS publishedDate,
//          b.page_count     AS pageCount,
//          b.publisher
//        FROM favorites f
//        JOIN books b ON f.book_id = b.id
//        WHERE f.user_id = ?`,
//       [userId]
//     );
//     return res.json(rows);
//   } catch (err) {
//     console.error('Favori çekme hatası:', err);
//     return res.status(500).json({ error: 'Sunucu hatası.' });
//   }
// });

// Kullanıcının puan verilerini döner
app.get('/api/ratings/:userId', async (req, res) => {
  const { userId } = req.params;
  const sql = `
    SELECT b.*, r.rating
    FROM ratings r
    JOIN books b ON r.book_id = b.id
    WHERE r.user_id = ?
  `;
  db.promise().query(sql, [userId])
    .then(([rows]) => res.json(rows))
    .catch(err => {
      console.error('Ratings çekme hatası:', err);
      res.status(500).json({ error: 'Veritabanı hatası.' });
    });
});


// Profile Route
app.get('/api/auth/profile/:userId', (req, res) => {
  const { userId } = req.params;

  const sql = 'SELECT id, name, email FROM users WHERE id = ?';

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Profil çekme hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }

    if (results.length > 0) {
      // Kullanıcı bulundu
      const user = results[0];
      return res.status(200).json({ user });
    } else {
      // Kullanıcı bulunamadı
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }
  });
});

// update profil route
/*app.put('/api/auth/updateProfile', (req, res) => {
  const { userId, field, value } = req.body;

  if (!userId || !field || !value) {
    return res.status(400).json({ error: 'Eksik veri gönderildi.' });
  }

  const allowedFields = ['name', 'email', 'password'];
  if (!allowedFields.includes(field)) {
    return res.status(400).json({ error: 'Güncellenmesi yasak bir alan seçildi.' });
  }

  const sql = `UPDATE users SET ${field} = ? WHERE id = ?`;
  db.query(sql, [value, userId], (err, result) => {
    if (err) {
      console.error('Bilgi güncelleme hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }
    return res.status(200).json({ message: 'Profil başarıyla güncellendi.' });
  });
});*/

// Update Profile Route
app.put('/api/auth/updateProfile', async (req, res) => {
  const { userId, field, value } = req.body;
  const allowedFields = ['name', 'email', 'password'];

  // 1) Gerekli alanlar kontrolü
  if (!userId || !field || !value) {
    return res.status(400).json({ error: 'userId, field ve value zorunludur.' });
  }
  if (!allowedFields.includes(field)) {
    return res.status(400).json({ error: 'Güncellenemez bir alan seçildi.' });
  }

  try {
    // 2) Şifre güncelleniyorsa bcrypt ile hash’le
    let newValue = value;
    if (field === 'password') {
      newValue = await bcrypt.hash(value, 10);
    }

    // 3) DB güncellemesi
    await db.promise().execute(
      `UPDATE users SET \`${field}\` = ? WHERE id = ?`,
      [newValue, userId]
    );

    // 4) Başarı yanıtı
    return res.json({ message: 'Profil başarıyla güncellendi.' });
  } catch (err) {
    console.error('Update-profile hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

//const multer = require('multer');
//const path = require('path');

// Fotoğraf yüklemek için multer ayarları
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // uploads klasörüne kaydedilecek
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// upload profil image
app.post('/api/auth/uploadProfileImage', upload.single('image'), (req, res) => {
  const { userId } = req.body;
  const imagePath = req.file.path;

  if (!userId || !req.file) {
    return res.status(400).json({ error: 'Eksik veri veya dosya gönderildi.' });
  }

  const sql = 'UPDATE users SET profile_image = ? WHERE id = ?';
  db.query(sql, [imagePath, userId], (err, result) => {
    if (err) {
      console.error('Profil fotoğrafı yükleme hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }
    return res.status(200).json({ message: 'Profil fotoğrafı güncellendi.' });
  });
});

// New Upload Profile Image Route
/*const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // uploads klasörüne kaydedecek
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Benzersiz bir dosya adı oluştur
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.post(
  '/api/auth/uploadProfileImage',
  upload.single('image'),
  async (req, res) => {
    const { userId } = req.body;
    // Dosya bilgisinin varlığı kontrolü
    if (!userId || !req.file) {
      return res.status(400).json({ error: 'userId ve image dosyası zorunludur.' });
    }

    const imagePath = req.file.path; // kaydedilen dosya yolu

    try {
      // Veritabanına yeni profil resmi yolunu kaydet
      await db.promise().execute(
        'UPDATE users SET profile_image = ? WHERE id = ?',
        [imagePath, userId]
      );

      // Başarı yanıtı
      return res.json({
        message: 'Profil fotoğrafı başarıyla yüklendi.',
        imageUrl: imagePath
      });
    } catch (err) {
      console.error('UploadProfileImage hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }
  }
);*/


  // =========================================================
//  FAVORİ KİTAP KAYDET  —  /api/favorites/save
// =========================================================
app.post('/api/favorites/save', async (req, res) => {
  const {
    userId,
    bookId,
    title,
    authors,
    thumbnailUrl,
    publishedDate,
    pageCount,
    publisher,
    description
  } = req.body;

  if (!userId || !bookId || !title) {
    return res.status(400).json({ error: 'userId, bookId, title zorunlu.' });
  }

  try {
    /* 1) Kitabı books tablosuna ekle (yoksa) */
    await db.promise().query(
      `INSERT IGNORE INTO books
       (id, title, authors, thumbnail_url, published_year, page_count, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        bookId,
        title,
        JSON.stringify(authors),      // authors dizisini stringle
        thumbnailUrl,
        publishedDate,
        pageCount,
        description
      ]
    );

    /* 2) Favori kaydını favorites tablosuna ekle */
    await db.promise().query(
      `INSERT IGNORE INTO favorites (user_id, book_id)
       VALUES (?, ?)`,
      [userId, bookId]
    );

    return res.json({ message: 'Favori kitap başarıyla kaydedildi.' });
  } catch (err) {
    console.error('Favori kaydetme hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// =========================================================
//  PUAN KAYDET / GÜNCELLE   —  POST /api/ratings/save
// =========================================================
app.post('/api/ratings/save', async (req, res) => {
  const {
    userId,
    bookId,
    rating,           // 1-5 arası
    // — opsiyonel kitap bilgisi (title, authors …) —
    title,
    authors,
    thumbnailUrl,
    publishedDate,
    pageCount,
    publisher,
    description
  } = req.body;

  if (!userId || !bookId || !rating) {
    return res.status(400).json({ error: 'userId, bookId, rating zorunlu.' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating 1-5 aralığında olmalı.' });
  }

  try {
    /* 1) Kitap DB’de yoksa ekle (opsiyonel alanlar varsa) */
    await db.promise().query(
      `INSERT IGNORE INTO books
       (id, title, authors, thumbnail_url, published_year, page_count, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        bookId,
        title ?? '',
        authors ? JSON.stringify(authors) : '',
        thumbnailUrl ?? '',
        publishedDate ?? null,
        pageCount ?? null,
        description ?? ''
      ]
    );

    /* 2) ratings tablosuna ekle / güncelle */
    await db.promise().query(
      `INSERT INTO ratings (user_id, book_id, rating)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = CURRENT_TIMESTAMP`,
      [userId, bookId, rating]
    );

    res.json({ message: 'Puan kaydedildi.' });
  } catch (err) {
    console.error('Puan kaydetme hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});



// // Server başlat
 const PORT = 3000;
 app.listen(PORT,'0.0.0.0', () => {
 console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
 });
// //////////////en son edit sayfasında kullanıcı görüntülemekte kaldım.///////////////