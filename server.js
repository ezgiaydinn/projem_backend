// ---------------------------  server.js  ---------------------------
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
// const multer = require("multer");
// const path   = require("path");
const bodyParser = require('body-parser');
const cors       = require('cors');
const router     = express.Router();
const app        = express();

app.use(cors());
app.use(bodyParser.json());

// ---------------- MySQL bağlantısı ----------------
const mysql = require('mysql2');
require('dotenv').config();

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


// -------------------- Login Route --------------------
app.post('/api/auth/login', (req, res) => {
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
      return res.status(200).json({
        message: 'Giriş başarılı!',
        user: { id: results[0].id, name: results[0].name, email: results[0].email }
      });
    } else {
      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
    }
  });
});


// -------------------- Signup Route -------------------
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur.' });
  }

  const checkUserSql = 'SELECT * FROM users WHERE email = ?';
  db.query(checkUserSql, [email], (err, results) => {
    if (err) {
      console.error('Kullanıcı kontrol hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }

    if (results.length > 0) {
      return res.status(409).json({ error: 'Bu e-posta zaten kullanılıyor.' });
    }

    const insertUserSql = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
    db.query(insertUserSql, [name, email, password], (err) => {
      if (err) {
        console.error('Kayıt hatası:', err);
        return res.status(500).json({ error: 'Kayıt yapılamadı.' });
      }
      return res.status(201).json({ message: 'Kullanıcı başarıyla kaydedildi.' });
    });
  });
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
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyorrr`);
});
