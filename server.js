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
// server.js

app.get('/api/favorites/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const sql = `
      SELECT 
        b.id,
        b.title,
        b.authors,
        b.description,
        b.thumbnail_url   AS thumbnailUrl,
        b.published_year  AS publishedYear,
        b.genre,
        b.page_count      AS pageCount,
        b.language
      FROM favorites f
      JOIN books b ON f.book_id = b.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `;
    const [rows] = await db.promise().query(sql, [userId]);

    const result = rows.map(r => {
      // Saf JS: önce JSON.parse dene, başarısızsa virgülle ayır ve boşları at
      let authorsList = [];
      if (r.authors) {
        try {
          authorsList = JSON.parse(r.authors);
        } catch (_) {
          authorsList = r.authors
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        }
      }

      return {
        id: r.id,
        title: r.title,
        authors: authorsList,
        description: r.description,
        thumbnailUrl: r.thumbnailUrl,
        publishedYear: r.publishedYear,
        genre: r.genre,
        pageCount: r.pageCount,
        language: r.language,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('🚨 GET /api/favorites error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

// Kullanıcının favori kitaplarını döner
//  app.get('/api/favorites/:userId', async (req, res) => {
//    const { userId } = req.params;
//    const sql = `
//      SELECT b.*
//      FROM favorites f
//      JOIN books b ON f.book_id = b.id
//      WHERE f.user_id = ?
//    `;
//    db.promise().query(sql, [userId])
//      .then(([rows]) => res.json(rows))
//      .catch(err => {
//        console.error('Favorites çekme hatası:', err);
//        res.status(500).json({ error: 'Veritabanı hatası.' });
//      });
//  });

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

// server.js içinde veya ayrı routes/favorites.js
app.post('/api/favorites/save', async (req, res) => {
  try {
    const {
      userId,
      bookId,
      title,            
      author,           
      thumbnailUrl      
    } = req.body;

    if (!userId || !bookId || !title) {
      return res.status(400).json({ error: 'Eksik parametreler.' });
    }

    // 1) Kitap daha önce favorites yoksa ekle, varsa güncelle
    const sql = `
      INSERT INTO favorites (user_id, book_id, title, author, thumbnail_url)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        author = VALUES(author),
        thumbnail_url = VALUES(thumbnail_url),
        created_at = CURRENT_TIMESTAMP
    `;

    await db.promise().query(sql, [
      userId,
      bookId,
      title,
      author,
      thumbnailUrl,
    ]);

    return res.json({ message: 'Favori kaydedildi.' });
  } catch (err) {
    console.error('Favori kaydederken hata:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});


  // =========================================================
//  FAVORİ KİTAP KAYDET  —  /api/favorites/save
// =========================================================
// app.post('/api/favorites/save', async (req, res) => {
//   const {
//     userId,
//     bookId,
//     title,
//     authors,
//     thumbnailUrl,
//     publishedDate,
//     pageCount,
//     publisher,
//     description
//   } = req.body;

//   if (!userId || !bookId || !title) {
//     return res.status(400).json({ error: 'userId, bookId, title zorunlu.' });
//   }

//   try {
//     /* 1) Kitabı books tablosuna ekle (yoksa) */
//     await db.promise().query(
//       `INSERT IGNORE INTO books
//        (id, title, authors, thumbnail_url, published_year, page_count, description)
//        VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       [
//         bookId,
//         title,
//         JSON.stringify(authors),      // authors dizisini stringle
//         thumbnailUrl,
//         publishedDate,
//         pageCount,
//         description
//       ]
//     );

//     /* 2) Favori kaydını favorites tablosuna ekle */
//     await db.promise().query(
//       `INSERT IGNORE INTO favorites (user_id, book_id)
//        VALUES (?, ?)`,
//       [userId, bookId]
//     );

//     return res.json({ message: 'Favori kitap başarıyla kaydedildi.' });
//   } catch (err) {
//     console.error('Favori kaydetme hatası:', err);
//     return res.status(500).json({ error: 'Sunucu hatası.' });
//   }
// });

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

// server.js (veya routes/library.js)

// app.post('/api/library/add', async (req, res) => {
//   try {
//     const {
//       userId,
//       bookId,
//       title,
//       authors,        // dizi şeklinde ["Yazar1","Yazar2"]
//       thumbnailUrl,
//       publisher,
//       publishedDate,
//       pageCount,
//       description
//     } = req.body;

//     if (!userId || !bookId || !title) {
//       return res.status(400).json({ error: 'userId, bookId ve title zorunlu.' });
//     }

//     // 1) librarys tablosuna kaydet (yoksa ekle / varsa güncelle)
//     const sql = `
//       INSERT INTO librarys 
//         (user_id, book_id, title, authors, thumbnail_url, publisher, published_date, page_count, description)
//       VALUES 
//         (?, ?, ?, ?, ?, ?, ?, ?, ?)
//       ON DUPLICATE KEY UPDATE
//         title = VALUES(title),
//         authors = VALUES(authors),
//         thumbnail_url = VALUES(thumbnail_url),
//         publisher = VALUES(publisher),
//         published_date = VALUES(published_date),
//         page_count = VALUES(page_count),
//         description = VALUES(description),
//         added_at = CURRENT_TIMESTAMP
//     `;

//     // authors dizisini virgülle birleştirelim
//     const authorsStr = Array.isArray(authors) ? authors.join(', ') : authors;

//     await db.promise().query(sql, [
//       userId,
//       bookId,
//       title,
//       authorsStr,
//       thumbnailUrl,
//       publisher,
//       publishedDate,
//       pageCount,
//       description,
//     ]);

//     return res.status(200).json({ message: 'Kitap kütüphaneye eklendi.' });
//   } catch (err) {
//     console.error('Kütüphane ekleme hatası:', err);
//     return res.status(500).json({ error: 'Sunucu hatası.' });
//   }
// });


// GET /api/library/:userId
app.get('/api/library/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await db.promise().query(
      'SELECT b.* FROM books b JOIN librarys l ON b.id = l.book_id WHERE l.user_id = ?',
      [userId]
    );
    return res.json(rows); // rows: [{ id, title, authors, thumbnail_url, … }, …]
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});
// Kütüphaneden kitap çıkarmak için endpoint
app.post('/api/library/remove', async (req, res) => {
  try {
    const { userId, bookId } = req.body;

    // Gerekli parametreler var mı kontrolü
    if (!userId || !bookId) {
      return res.status(400).json({ error: 'userId ve bookId gerekli.' });
    }

    // library tablosundan silme sorgusu
    const deleteSql = `
      DELETE FROM librarys
      WHERE user_id = ? AND book_id = ?
    `;
    const [result] = await db.promise().query(deleteSql, [userId, bookId]);

    // etkilenen satır yoksa 404 dönebilirsin, ama biz 200 ile dönüyoruz
    return res.status(200).json({ message: 'Kitap kütüphaneden çıkarıldı.' });
  } catch (err) {
    console.error('Kütüphaneden çıkarma hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
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
 console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
 });
