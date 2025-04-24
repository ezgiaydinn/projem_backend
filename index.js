// database.js (mysql2 kullanarak)
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function query(sql, params) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('Veritabanı sorgusu sırasında hata:', error);
    throw error;
  }
}

module.exports = {
  query,
  pool // İhtiyaç duyulursa bağlantı havuzunu da dışa aktarabilirsiniz
};
/* Bağlantıyı test et
connection.connect((err) => {
  if (err) {
    console.error('MySQL bağlantı hatası:', err);
    return;
  }
  console.log('✅ MySQL bağlantısı başarılı!');

  // Basit bir sorgu çalıştıralım
  connection.query('SELECT * FROM users', (err, results) => {
    if (err) {
      console.error('Sorgu hatası:', err);
      return;
    }
    console.log('📦 Kullanıcılar:', results);
  });

  // Bağlantıyı kapat
  connection.end();
});*/
