// routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../index');

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre zorunludur.' });
  }

  try {
    const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
    }

    const result = await db.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, password] // UYARI: Gerçek uygulamada şifreyi hashlemelisiniz!
    );

    if (result.affectedRows > 0) {
      return res.status(201).json({ message: 'Kayıt başarıyla oluşturuldu.' });
    } else {
      return res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu.' });
    }
  } catch (error) {
    console.error('Kayıt sırasında veritabanı hatası:', error);
    return res.status(500).json({ error: 'Kayıt sırasında bir sunucu hatası oluştu.' });
  }
});

module.exports = router;