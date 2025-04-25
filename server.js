const express = require('express');
const mysql = require('mysql2');
const multer = require("multer");
const path = require("path");
const bodyParser = require('body-parser');
const cors = require('cors');
const router = express.Router();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// MySQL bağlantısı
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

app.get("/ping", (req, res) => {
  res.send("pong!");
});


db.connect((err) => {
  if (err) {
    console.error('MySQL bağlantı hatası:', err);
    return;
  }
  console.log('✅ MySQL bağlantısı kuruldu.');
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});

const upload = multer({ storage: storage });

// app.use('/uploads', express.static('uploads')); // Fotoğraflara erişmek için

// // 🔽 Bu endpoint Flutter'dan gelen resmi karşılar
// app.post("/upload-profile-image", upload.single("profile_image"), (req, res) => {
//   const userId = req.body.userId;
//   const imagePath = req.file.path;

//   if (!userId) {
//     return res.status(400).json({ message: "Kullanıcı ID'si gerekli" });
//   }
  
//   const sql = "UPDATE users SET profile_image = ? WHERE id = ?";
//   db.query(sql, [imagePath, userId], (err, result) => {
//     if (err) {
//       console.error("Veritabanı hatası:", err);
//       return res.status(500).json({ message: "Veritabanı hatası" });
//     }
//   })
//   console.log(`Kullanıcı ${userId} için profil fotoğrafı güncellendi.`);
//   res.status(200).json({ message: "Resim yüklendi", imageUrl: imagePath });
// });

// app.get('/api/user/:id', async (req, res) => {
//   const userId = req.params.id;
//   const user = await db.query("SELECT * FROM users WHERE id = ?", [userId]);

//   if (user.length > 0) {
//     res.json(user[0]);
//   } else {
//     res.status(404).json({ error: "Kullanıcı bulunamadı" });
//   }
// });


// // Login Route
// app.post('/api/auth/login', (req, res) => {
//   const { email, password } = req.body;
//   const userId = req.params.id;

//   if (!email || !password) {
//     return res.status(400).json({ error: 'Email ve şifre zorunludur.' });
//   }

//   const sql = 'SELECT * FROM users WHERE email = ? AND password = ? AND id = ?';
//   db.query(sql, [email, password, userId], (err, results) => {//hata burda
//     if (err) {
//       console.error('Giriş hatası:', err);
//       return res.status(500).json({ error: 'Sunucu hatası.' });
//     }

//     if (results.length > 0) {
//       return res.status(200).json({ message: 'Giriş başarılı!', 
//         user: { 
//           name: results[0].name,
//           id: results[0].id,
//           email: results[0].email 
//         }
//       })
//     }
   
//     else 
//     {
//      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
//     }
//   });
// });

// // Signup Route
// app.post('/api/auth/signup', (req, res) => {
//   const { name, email, password } = req.body;

//   if (!name || !email || !password) {
//     return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur.' });
//   }

//   const sql = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';

//   db.query(sql, [name, email, password], (err, result) => {
//     if (err) {
//       console.error('Kayıt hatası:', err);
//       return res.status(500).json({ error: 'Kayıt yapılamadı.' });
//     }

//     return res.status(201).json({ message: 'Kullanıcı başarıyla kaydedildi.' });
//   });
// });

// // Kullanıcı bilgilerini getirme (Profil)
// /*app.get('/api/user/:id', (req, res) => {
//   const userId = req.params.id;

//   const query = 'SELECT email FROM users WHERE id = ?';
//   db.query(query, [userId], (err, results) => {
//     if (err) {
//       console.error('Kullanıcı bilgisi alınamadı:', err);
//       return res.status(500).json({ error: 'Sunucu hatası' });
//     }

//     if (results.length === 0) {
//       return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
//     }

//     const user = results[0];
//     res.json({
//       name: user.name, // Şimdilik sabit, istersen db'ye name sütunu da eklersin
//       email: user.email
//     });
//   });
// });*/
// app.get('/user/:id', (req, res) => {
//   const userId = req.params.id;

//   db.query('SELECT name, email, password FROM users WHERE id = ?', [userId], (err, results) => {
//     if (err) {
//       console.error('Veri getirme hatası:', err);
//       return res.status(500).json({ error: 'Server error' });
//     }

//     if (results.length === 0) {
//       return res.status(404).json({ error: 'User not found' });
//     }

//     res.json(results[0]);
//   });
// });

// module.exports = router;

// app.post('/updateProfile', (req, res) => {
//   const { userId, field, value } = req.body;

//   if (!userId || !field || !value) {
//     return res.status(400).json({ error: 'Missing data' });
//   }

//   const allowedFields = ['name', 'email', 'password'];
//   if (!allowedFields.includes(field)) {
//     return res.status(400).json({ error: 'Invalid field' });
//   }

//   const query = `UPDATE users SET \`${field}\` = ? WHERE id = ?`;
//   db.query(query, [value, userId], (err, result) => {
//     if (err) {
//       console.error('Veri güncelleme hatası:', err);
//       return res.status(500).json({ error: 'Database error' });
//     }

//     res.json({ success: true });
//   });
// });


// app.put('/api/user/:id', (req, res) => {
//   const userId = req.params.id;
//   const { name, email, password } = req.body;

//   const query = 'UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?';
//   db.query(query, [name, email, password, userId], (err, result) => {
//     if (err) {
//       console.error('Kullanıcı güncellenemedi:', err);
//       return res.status(500).json({ error: 'Güncelleme hatası' });
//     }

//     return res.status(200).json({ message: 'Kullanıcı başarıyla güncellendi' });
//   });
// });


// // Server başlat
// const PORT = 3000;
// app.listen(PORT,'0.0.0.0', () => {
//   console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
// });
// //////////////en son edit sayfasında kullanıcı görüntülemekte kaldım.///////////////