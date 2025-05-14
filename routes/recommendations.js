// routes/recommendations.js
const express = require('express');
const router  = express.Router();
const { Recommendation, Book } = require('../models');

router.get('/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  try {
    const recs = await Recommendation.findAll({
      where: { user_id: userId },
      include: [{
        model: Book,
        as: 'Book',
        attributes: ['title','authors','thumbnail_url']
      }],
      order: [['score','DESC']],
      limit: 10
    });

    const payload = recs.map(r => ({
      bookId: r.book_id,
      title:  r.Book.title,
      authors:r.Book.authors,
      thumb:  r.Book.thumbnail_url,
      score:  r.score
    }));

    res.json(payload);
  } catch (err) {
    console.error('Recommendation route error', err);
    res.status(500).json({ error: 'Öneri alınırken hata oluştu.' });
  }
});

module.exports = router;
