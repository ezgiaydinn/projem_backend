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


db.connect((err) => {
  if (err) {
    console.error('MySQL bağlantı hatası:', err);
    return;
  }
  console.log('✅ MySQL bağlantısı kuruldu.');
});


// Login Route
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
});

// Signup Route
app.post('/api/auth/signup', (req, res) => {
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
});

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
  db.query(sql, [value, userId], (err, result) => {
    if (err) {
      console.error('Bilgi güncelleme hatası:', err);
      return res.status(500).json({ error: 'Sunucu hatası.' });
    }
    return res.status(200).json({ message: 'Profil başarıyla güncellendi.' });
  });
});

const multer = require('multer');
const path = require('path');

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

// -------------------------
// POST /api/favorites/save
// -------------------------
app.post('/api/favorites/save', async (req, res) => {
  try {
    const {
      userId,
      bookId,
      title,
      authors,              // dizi: ["Yazar1","Yazar2"]
      thumbnailUrl,
      description,
      publisher,
      publishedDate,        // örn. "2022-07-15"
      pageCount,
      genre,
      language,
      industryIdentifiers,  // dizi: [{ type, identifier }, …]
      averageRating,
      ratingsCount
    } = req.body;

    if (!userId || !bookId || !title) {
      return res.status(400).json({ error: 'userId, bookId ve title zorunlu.' });
    }

    // 1) Kitabı books tablosuna ekle veya güncelle
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
        thumbnailUrl       || '',
        description        || '',
        publisher          || '',
        publishedDate      || null,
        pageCount          || null,
        genre              || '',
        language           || '',
        JSON.stringify(industryIdentifiers || []),
        averageRating      || null,
        ratingsCount       || 0
      ]
    );

    // 2) favorites tablosuna ekle veya güncelle
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
        // favorites.author tek bir string tuttuğun için ilk author’ı alıyoruz:
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

// DELETE /api/favorites
app.delete('/api/favorites/:userId/:bookId', async (req, res) => {
  try {
    const { userId, bookId } = req.params;
    await db.promise().query(
      'DELETE FROM favorites WHERE user_id = ? AND book_id = ?',
      [userId, bookId]
    );
    return res.json({ message: 'Favoriden çıkarıldı.' });
  } catch (err) {
    console.error('Favoriden çıkartırken hata:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});



// ---------------------------------------
// GET /api/favorites/:userId  (tek kopya!)
// ---------------------------------------
// --- server.js içinde, diğer kodlardan sonra tek seferlik ekleyin ---
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
      // authors JSON dizisini parse et
      let authors = [];
      if (r.authorsJson) {
        try { authors = JSON.parse(r.authorsJson); } catch (_) {}
      }
      // boşsa favori tablosundaki tek yazarı al
      if (!authors.length && r.favAuthor) {
        authors = [r.favAuthor];
      }
      // hâlâ yoksa default
      if (!authors.length) {
        authors = ['Bilinmeyen yazar'];
      }

      return {
        id:             r.id,
        title:          r.title,
        authors,        // dizi
        thumbnailUrl:   r.thumbnailUrl  || '',
        publishedYear:  r.publishedYear || null,
        publisher:      r.publisher     || '',
        publishedDate:  r.publishedDate || null,
        genre:          r.genre         || '',
        pageCount:      r.pageCount     || 0,
        language:       r.language      || '',
        createdAt:      r.createdAt
      };
    });

    res.json(result);
  } catch (err) {
    console.error('GET /api/favorites error:', err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


app.post('/api/favorite-to-library', async (req, res) => {
  try {
    const { userId, bookId } = req.body;
    if (!userId || !bookId) {
      return res.status(400).json({ error: 'userId ve bookId gerekli.' });
    }

    // 1) librarys tablosuna ekle (yoksa güncelle):
    const insertLibSql = `
      INSERT INTO librarys (user_id, book_id, title)
      SELECT ?, b.id, b.title
      FROM books b
      WHERE b.id = ?
      ON DUPLICATE KEY UPDATE added_at = CURRENT_TIMESTAMP
    `;
    await db.promise().query(insertLibSql, [ userId, bookId ]);

    // 2) favorites tablosundan sil
    const deleteFavSql = `
      DELETE FROM favorites
      WHERE user_id = ? AND book_id = ?
    `;
    await db.promise().query(deleteFavSql, [ userId, bookId ]);

    return res.status(200).json({ message: 'Kitap kütüphaneye taşındı.' });
  } catch (err) {
    console.error('🔴 Favoriyi kütüphaneye taşıma hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası.', detail: err.message });
  }
});



// // Server başlat
 const PORT = 3000;
 app.listen(PORT,'0.0.0.0', () => {
 console.log(`🚀 Sunucu ${PORT} portunda çalışıyorrr`);
 });
