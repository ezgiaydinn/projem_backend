const express = require('express');
const router  = express.Router();
const db      = require('../db');  // mysql2 pool

router.post('/save', async (req, res) => {
  const {
    userId, bookId, title, authors, thumbnailUrl,
    publishedDate, pageCount, publisher, description
  } = req.body;

  if (!userId || !bookId || !title) {
    return res.status(400).json({ error: 'userId, bookId, title zorunlu' });
  }

  try {
    /* 1. Kitap yoksa ekle (INSERT IGNORE) */
    await db.promise().query(`
      INSERT IGNORE INTO books
      (id,title,authors,thumbnailUrl,publishedDate,pageCount,publisher,description)
      VALUES (?,?,?,?,?,?,?,?)`,
      [ bookId, title, JSON.stringify(authors),
        thumbnailUrl, publishedDate, pageCount, publisher, description ]);

    /* 2. Favori kaydı ekle */
    await db.promise().query(`
      INSERT IGNORE INTO favorites (user_id, book_id)
      VALUES (?,?)`, [userId, bookId]);

    return res.json({ message: 'Favori kaydedildi' });
  } catch (e) {
    console.error('Fav hatası:', e);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
