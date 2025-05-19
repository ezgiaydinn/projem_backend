// ---------------------------  server.js  ---------------------------
const express = require('express');

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ---------- Token & Şifre Yardımcıları ----------
function newToken() {
  return crypto.randomBytes(32).toString('hex');     // Kullanıcıya gidecek RAW token
}
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');  // DB'de tutulacak hash
}
function hashPwd(pwd)  { return bcrypt.hash(pwd, 12); }          // Promise<string>
function cmpPwd(pwd,h) { return bcrypt.compare(pwd, h); }        // Promise<boolean>

// const multer = require("multer");
// const path   = require("path");
const bodyParser = require('body-parser');
const cors       = require('cors');
//const router     = express.Router(); 
const app        = express();

app.use(cors());
app.use(bodyParser.json());

// ---------------- MySQL bağlantısı ----------------
const mysql = require('mysql2');
require('dotenv').config();

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);   // .env’deki anahtar

// ►►► TEKİL createConnection yerine H A V U Z ◄◄◄
const db = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,      // Railway idle-timeout’a karşı
  keepAliveInitialDelay: 10000
});

/* -------------- legacy: eskiden böyleydi --------------
db.connect((err) => {
  if (err) { console.error('MySQL bağlantı hatası:', err); return; }
  console.log('✅ MySQL bağlantısı kuruldu.');
});
-------------------------------------------------------- */

// ➜ Havuzun hazır olup olmadığını tek satır PING ile gösterelim
db.query('SELECT 1', (err) => {
  if (err) console.error('MySQL havuzu açılamadı:', err);
  else     console.log('✅ MySQL havuzu hazır.');
});

// -------------------- Forgot Password --------------------
app.post('/api/auth/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'E-posta gerekli' });

    const [[user]] = await db.promise().query(
      'SELECT id FROM users WHERE email = ?', [email]
    );
    if (!user) return res.json({ ok: true });      // aynı cevabı döneriz

    const raw  = newToken();
    const hash = sha256(raw);

    await db.promise().query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
      [user.id, hash]
    );

    const deepLink = `bookifyapp://reset?token=${raw}`;
    const webLink  = `https://projembackend-production-4549.up.railway.app/reset?token=${raw}`;

    await sgMail.send({
      to: email,
      from: process.env.SENDGRID_FROM,
      subject: 'Şifre Sıfırlama Bağlantınız',
      text:
`Merhaba,

Şifrenizi 30 dk içinde sıfırlamak için bu linki açın:
${webLink}

Uygulamada otomatik açmak isterseniz:
${deepLink}`,
      html:
`<p>Merhaba,</p>
<p>Şifrenizi 30&nbsp;dk içinde sıfırlamak için
<a href="${webLink}">buraya tıklayın</a>.</p>
<p><strong>Uygulamada açmak için:</strong><br>
<code>${deepLink}</code></p>`
    });

    console.log(`🔗 Reset link (web):  ${webLink}`);
    console.log(`🔗 Reset link (deep): ${deepLink}`);

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/forgot error:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

/* 🔹 YENİ: Tarayıcı linki uygulama şemasına yönlendirir */
app.get('/reset', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token eksik');

  const deep = `bookifyapp://reset?token=${token}`;

  res.send(`<!DOCTYPE html>
<html lang="tr"><head>
<meta charset="utf-8"/>
<meta http-equiv="refresh" content="0;url=${deep}">
<title>Bookify – Şifre Sıfırla</title>
<style>body{font-family:sans-serif;text-align:center;margin-top:50px}a{color:#0066cc;font-size:18px}</style>
</head><body>
<p>Uygulama açılmazsa <a href="${deep}">buraya dokun</a>.</p>
</body></html>`);
});

// -------------------- Reset Password --------------------
app.post('/api/auth/reset', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token ve yeni şifre gerekli.' });
    }

    const tokenHash = sha256(token);

    /* 1) Token geçerli mi? */
    const [[row]] = await db.promise().query(
      `SELECT user_id
         FROM password_resets
        WHERE token_hash = ?
          AND expires_at > NOW()`,
      [tokenHash]
    );
    if (!row) {
      return res.status(400).json({ error: 'Token geçersiz veya süresi dolmuş.' });
    }

    /* 2) Mevcut şifre hash’ini al */
    const [[u]] = await db.promise().query(
      'SELECT password FROM users WHERE id = ?',
      [row.user_id]
    );

    /* 3) Yeni şifre eskiyle aynı mı? */
    const same = await cmpPwd(password, u.password);   // bcrypt.compare
    if (same) {
      return res.status(400).json({ error: 'Yeni şifre, mevcut şifrenizle aynı olamaz.' });
    }

    /* 4) Yeni şifreyi hash’le ve güncelle */
    const pwdHash = await hashPwd(password);           // bcrypt.hash
    await db.promise().query(
      'UPDATE users SET password = ? WHERE id = ?',
      [pwdHash, row.user_id]
    );

    /* 5) Token’i sil (tek kullanımlık) */
    await db.promise().query(
      'DELETE FROM password_resets WHERE token_hash = ?',
      [tokenHash]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/reset error:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

app.get('/api/recommendations/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  try {
    const [rows] = await db.promise().query(
      'SELECT book_id, score FROM recommendations WHERE user_id = ? ORDER BY score DESC',
      [userId]
    );
    res.json({ ok: true, recommendations: rows });
  } catch (err) {
    console.error('DB hatası:', err);
    res.status(500).json({ ok: false, error: 'Veritabanı okunamadı.' });
  }
});

// -------------------- Login Route (bcrypt ile) --------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-posta ve şifre zorunludur.' });
    }

    /* 1) Kullanıcıyı e-posta ile çek */
    const [[user]] = await db.promise().query(
      'SELECT id, name, email, password AS pwdHash FROM users WHERE email = ?',
      [email]
    );
    if (!user) {
      // E-posta yoksa yine aynı hatayı döneriz: bilgi sızdırmıyoruz
      return res.status(401).json({ error: 'Geçersiz e-posta veya şifre.' });
    }

    /* 2) Şifreyi doğrula (bcryptjs) */
    const isMatch = await cmpPwd(password, user.pwdHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Geçersiz e-posta veya şifre.' });
    }

    /* 3) Başarılı giriş – şifre hash’ini response’a koymuyoruz */
    return res.status(200).json({
      message: 'Giriş başarılı!',
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// -------------------- Signup Route (bcrypt) --------------------
app.post('/api/auth/signup', async (req, res) => {  
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur.' });
    }

    /* 1) E-posta kullanımda mı? */
    const [[exists]] = await db.promise().query(
      'SELECT 1 FROM users WHERE email = ?',
      [email]
    );
    if (exists) {
      return res.status(409).json({ error: 'Bu e-posta zaten kullanılıyor.' });
    }

    /* 2) Şifreyi hash’le */
    const pwdHash = await hashPwd(password);   // bcrypt.hash(pwd, 12)

    /* 3) Kullanıcıyı ekle */
    await db.promise().query(
      'INSERT INTO users (name, email, password) VALUES (?,?,?)',
      [name, email, pwdHash]
    );

    return res.status(201).json({ message: 'Kullanıcı başarıyla kaydedildi.' });
  } catch (err) {
    console.error('POST /api/auth/signup error:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// ----------- Kullanıcının puan verilerini döner -----------
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

// ------------------- Profile Route -------------------
app.get('/api/auth/profile/:userId', (req, res) => {
  const { userId } = req.params;
  const sql = 'SELECT id, name, email FROM users WHERE id = ?';

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Profil çekme hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }

    if (results.length > 0) {
      return res.status(200).json({ user: results[0] });
    } else {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }
  });
});

// --------------- Update profil route ------------------
app.put('/api/auth/updateProfile', (req, res) => {
  const { userId, field, value } = req.body;

  if (!userId || !field || !value) {
    return res.status(400).json({ error: 'Eksik veri gönderildi.' });
  }

  const allowedFields = ['name', 'email', 'password'];
  if (!allowedFields.includes(field)) {
    return res.status(400).json({ error: 'Güncellenmesi yasak bir alan seçildi.' });
  }

  const sql = `UPDATE users SET ${field} = ? WHERE id = ?`;
  db.query(sql, [value, userId], (err) => {
    if (err) {
      console.error('Bilgi güncelleme hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }
    return res.status(200).json({ message: 'Profil başarıyla güncellendi.' });
  });
});

// ------------------- Profil fotoğrafı ------------------
const multer = require('multer');
const path   = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.post('/api/auth/uploadProfileImage', upload.single('image'), (req, res) => {
  const { userId } = req.body;
  const imagePath  = req.file?.path;

  if (!userId || !imagePath) {
    return res.status(400).json({ error: 'Eksik veri veya dosya gönderildi.' });
  }

  const sql = 'UPDATE users SET profile_image = ? WHERE id = ?';
  db.query(sql, [imagePath, userId], (err) => {
    if (err) {
      console.error('Profil fotoğrafı yükleme hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }
    return res.status(200).json({ message: 'Profil fotoğrafı güncellendi.' });
  });
});

// -------------------- FAVORITES ------------------------
app.post('/api/favorites/save', async (req, res) => {
  try {
    const {
      userId, bookId, title, authors,
      thumbnailUrl, description, publisher,
      publishedDate, pageCount, categories = [], language,
      industryIdentifiers, averageRating, ratingsCount
    } = req.body;

    if (!userId || !bookId || !title) {
      return res.status(400).json({ error: 'userId, bookId ve title zorunlu.' });
    }

    await db.promise().query(
      `INSERT INTO books
         (id, title, authors, thumbnail_url,
          description, publisher, published_year,
          page_count, genre, language,
          industry_identifiers, average_rating, ratings_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title                = VALUES(title),
         authors              = VALUES(authors),
         thumbnail_url        = VALUES(thumbnail_url),
         description          = VALUES(description),
         publisher            = VALUES(publisher),
         published_year       = VALUES(published_year),
         page_count           = VALUES(page_count),
         genre                = VALUES(genre),
         language             = VALUES(language),
         industry_identifiers = VALUES(industry_identifiers),
         average_rating       = VALUES(average_rating),
         ratings_count        = VALUES(ratings_count)`,
      [
        bookId,
        title,
        JSON.stringify(authors),
        thumbnailUrl || '',
        description  || '',
        publisher    || '',
        publishedDate|| null,
        pageCount    || null,
        Array.isArray(categories) && categories.length > 0
            ? categories[0]
            : '',
        language     || '',
        JSON.stringify(industryIdentifiers || []),
        averageRating|| null,
        ratingsCount || 0
      ]
    );

    await db.promise().query(
      `INSERT INTO favorites
         (user_id, book_id, title, author, thumbnail_url)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title         = VALUES(title),
         author        = VALUES(author),
         thumbnail_url = VALUES(thumbnail_url),
         created_at    = CURRENT_TIMESTAMP`,
      [
        userId,
        bookId,
        title,
        Array.isArray(authors) ? authors[0] : author,
        thumbnailUrl || ''
      ]
    );

    return res.json({ message: 'Favori kaydedildi.' });
  } catch (err) {
    console.error('Favori kaydederken hata:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

app.post('/api/favorites/remove', async (req, res) => {
  const { userId, bookId } = req.body;
  if (!userId || !bookId) {
    return res.status(400).json({ error: 'userId ve bookId gerekli.' });
  }
  try {
    await db.promise().query(
      'DELETE FROM favorites WHERE user_id = ? AND book_id = ?',
      [userId, bookId]
    );
    res.json({ message: 'Favori silindi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

app.get('/api/favorites/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const sql = `
      SELECT
        f.book_id        AS id,
        f.title          AS title,
        b.authors        AS authorsJson,
        f.author         AS favAuthor,
        b.thumbnail_url  AS thumbnailUrl,
        b.published_year AS publishedYear,
        b.publisher      AS publisher,
        b.published_date AS publishedDate,
        b.genre          AS genre,
        b.page_count     AS pageCount,
        b.language       AS language,
        f.created_at     AS createdAt
      FROM favorites f
      JOIN books b ON f.book_id = b.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `;
    const [rows] = await db.promise().query(sql, [userId]);

    const result = rows.map(r => {
      let authors = [];
      if (r.authorsJson) {
        try { authors = JSON.parse(r.authorsJson); } catch (_) {}
      }
      if (!authors.length && r.favAuthor) authors = [r.favAuthor];
      if (!authors.length) authors = ['Bilinmeyen yazar'];

      return {
        id:            r.id,
        title:         r.title,
        authors,
        thumbnailUrl:  r.thumbnailUrl || '',
        publishedYear: r.publishedYear || null,
        publisher:     r.publisher || '',
        publishedDate: r.publishedDate || null,
        genre:         r.genre || '',
        pageCount:     r.pageCount || 0,
        language:      r.language || '',
        createdAt:     r.createdAt
      };
    });

    res.json(result);
  } catch (err) {
    console.error('GET /api/favorites error:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


// -------------- Favorite → Library taşıma --------------
app.post('/api/favorite-to-library', async (req, res) => {
  try {
    const { userId, bookId } = req.body;
    if (!userId || !bookId) {
      return res.status(400).json({ error: 'userId ve bookId gerekli.' });
    }

    const insertLibSql = `
      INSERT INTO librarys
        (user_id, book_id, title,
         author, genre, thumbnail_url)
      SELECT
        ?, b.id, b.title,
        JSON_UNQUOTE(JSON_EXTRACT(b.authors, '$[0]')),
        b.genre, b.thumbnail_url
        
      FROM books b
      WHERE b.id = ?
      ON DUPLICATE KEY UPDATE
        added_at      = CURRENT_TIMESTAMP,
        title         = VALUES(title),
        author        = VALUES(author),
        genre         = VALUES(genre),
        thumbnail_url = VALUES(thumbnail_url)
      
    `;
    await db.promise().query(insertLibSql, [userId, bookId]);

    await db.promise().query(
      'DELETE FROM favorites WHERE user_id = ? AND book_id = ?',
      [userId, bookId]
    );

    return res.status(200).json({ message: 'Kitap kütüphaneye taşındı.' });
  } catch (err) {
    console.error('🔴 Favoriyi kütüphaneye taşıma hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası.', detail: err.message });
  }
});

// -------------------- LIBRARY -------------------------
app.get('/api/library/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const sql = `
      SELECT
        l.book_id        AS id,
        l.title          AS title,
        l.author         AS libAuthor,
        l.genre          AS genre,
        b.thumbnail_url  AS thumbnailUrl,
        l.added_at       AS addedAt,
        b.authors        AS authorsJson,
        b.published_year AS publishedYear,
        b.publisher      AS publisher,
        b.published_date AS publishedDate,
        b.page_count     AS pageCount,
        b.language       AS language
      FROM librarys l
      JOIN books b ON l.book_id = b.id
      WHERE l.user_id = ?
      ORDER BY l.added_at DESC
    `;
    const [rows] = await db.promise().query(sql, [userId]);

    const result = rows.map(r => {
      let authors = [];
      if (r.authorsJson) {
        try { authors = JSON.parse(r.authorsJson); } catch (_) {}
      }
      if (!authors.length && r.libAuthor) authors = [r.libAuthor];
      if (!authors.length) authors = ['Bilinmeyen yazar'];

      return {
        id:            r.id,
        title:         r.title,
        authors,
        thumbnailUrl:  r.thumbnailUrl || '',
        genre:         r.genre || '',
        publishedYear: r.publishedYear || null,
        publisher:     r.publisher || '',
        publishedDate: r.publishedDate || null,
        pageCount:     r.pageCount || 0,
        language:      r.language || '',
        addedAt:       r.addedAt
      };
    });

    res.json(result);
  } catch (err) {
    console.error('GET /api/library error:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

app.post('/api/library/remove', async (req, res) => {
  const { userId, bookId } = req.body;
  if (!userId || !bookId) {
    return res.status(400).json({ error: 'userId ve bookId gerekli.' });
  }
  try {
    await db.promise().query(
      'DELETE FROM librarys WHERE user_id = ? AND book_id = ?',
      [userId, bookId]
    );
    res.json({ message: 'Kütüphaneden çıkarıldı.' });
  } catch (err) {
    console.error('POST /api/library/remove error:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// ----------------- Sunucuyu başlat --------------------
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor.`);
});
