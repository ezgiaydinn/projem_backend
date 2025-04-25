require('dotenv').config();
const fs = require("fs");
const mysql = require("mysql2");

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true, // Dump içindeki birden fazla SQL komutu için
});

const dump = fs.readFileSync("dump.sql", "utf8");

connection.query(dump, (err, results) => {
  if (err) {
    console.error("❌ Dump çalıştırma hatası:", err);
    process.exit(1);
  }
  console.log("✅ Dump başarıyla içeri aktarıldı!");
  process.exit(0);
});
