const fs = require("fs");
const mysql = require("mysql2");

// Railway ortam değişkenlerini kullanıyoruz
const connection = mysql.createConnection({
    host:"crossover.proxy.rlwy.net",
    port:  3306,
    user: process.env.DB_USER,
    password: "ofljmHMoSHlqfAOWyjaZPyMadWoDODLS",
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  

// dump.sql içeriğini oku
const dump = fs.readFileSync("dump.sql", "utf8");

// dump’ı çalıştır
connection.query(dump, (err, results) => {
  if (err) {
    console.error("❌ Dump çalıştırma hatası:", err);
    process.exit(1);
  }
  console.log("✅ Dump başarıyla içeri aktarıldı!");
  process.exit(0);
});
