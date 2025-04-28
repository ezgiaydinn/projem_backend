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

app.get("/", (req, res) => {
  res.send("pong!");
});

app.get('/check_users', (req, res) => {
  db.query("SELECT * FROM users LIMIT 5", (err, results) => {
    if (err) {
      console.error("Hata:", err);
      return res.status(500).json({ error: "Veritabanı hatası", detay: err });
    }
    res.json(results);
  });
});

app.get('/tables', (req, res) => {
  db.query("SHOW TABLES", (err, results) => {
    if (err) return res.status(500).json({ error: "Sorgu hatası", detay: err });
    res.json(results);
  });
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


// // Kitabı kaydetme veya güncelleme
// router.post('/api/books/save', async (req, res) => {
//   const {
//     userId,
//     bookId,
//     title,
//     authors,
//     thumbnailUrl,
//     publishedDate,
//     pageCount,
//     publisher,
//     description,
//     isFavorite,
//     rating
//   } = req.body;

//   if (!userId || !bookId || !title) {
//     return res.status(400).json({ error: 'Eksik parametreler.' });
//   }

//   try {
//     //  Kitap var mı kontrol et
//     const [bookRows] = await db.promise().query(
//       'SELECT * FROM books WHERE book_id = ?',
//       [bookId]
//     );

//     if (bookRows.length === 0) {
//       // Kitap veritabanında yoksa ekle
//       await db.promise().query(
//         'INSERT INTO books (book_id, title, authors, thumbnail_url, published_date, page_count, publisher, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
//         [
//           bookId,
//           title,
//           authors.join(', '),
//           thumbnailUrl,
//           publishedDate,
//           pageCount,
//           publisher,
//           description
//         ]
//       );
//     }

//     //  Favori tablosuna kaydet/güncelle
//     if (isFavorite) {
//       await db.promise().query(
//         'INSERT IGNORE INTO favorites (user_id, book_id) VALUES (?, ?)',
//         [userId, bookId]
//       );
//     } else {
//       await db.promise().query(
//         'DELETE FROM favorites WHERE user_id = ? AND book_id = ?',
//         [userId, bookId]
//       );
//     }

//     //  Puan tablosuna kaydet/güncelle
//     if (rating > 0) {
//       await db.promise().query(
//         'INSERT INTO ratings (user_id, book_id, rating) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rating = ?',
//         [userId, bookId, rating, rating]
//       );
//     } else {
//       await db.promise().query(
//         'DELETE FROM ratings WHERE user_id = ? AND book_id = ?',
//         [userId, bookId]
//       );
//     }

//     res.json({ message: 'Kitap ve kullanıcı bilgisi başarıyla kaydedildi.' });
//   } catch (error) {
//     console.error('Kitap kaydederken hata:', error);
//     res.status(500).json({ error: 'Sunucu hatası.' });
//   }
// });

// // Favorites kaydetmek icin endpoint
// app.post('/api/favorites/add', (req, res) => {
//   const { userId, bookId } = req.body;

//   if (!userId || !bookId) {
//     return res.status(400).json({ error: 'Kullanıcı ID ve Kitap ID gerekli.' });
//   }

//   const sql = `
//     INSERT INTO favorites (user_id, book_id)
//     VALUES (?, ?)
//     ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP
//   `;

//   db.query(sql, [userId, bookId], (err, result) => {
//     if (err) {
//       console.error('Favori ekleme hatası:', err);
//       return res.status(500).json({ error: 'Favori eklenemedi.' });
//     }

//     return res.status(200).json({ message: 'Favori başarıyla kaydedildi.' });
//   });
// });


// // Server başlat
 const PORT = 3000;
 app.listen(PORT,'0.0.0.0', () => {
 console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
 });
// //////////////en son edit sayfasında kullanıcı görüntülemekte kaldım.///////////////