// backend/models/index.js

const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();  // .env veya db.env dosyanı yükler

// 1) Sequelize örneğini oluştur
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: true,       // konsola SQL log'u basmasın istersen true yap
    define: {
      freezeTableName: true, // tablo isimlerini modeli çoğul hale getirmeden kullan
      timestamps: false      // createdAt/updatedAt otomatik eklemesin
    }
  }
);

// 2) DB objesini ve sequelize referansını hazırla
const db = {
  sequelize,
  Sequelize,
  DataTypes
};

// 3) Modelleri yükle
//db.User           = require('./user')(sequelize, DataTypes);
db.Book           = require('./book')(sequelize, DataTypes);
db.Rating         = require('./rating')(sequelize, DataTypes);
db.Favorite       = require('./favorite')(sequelize, DataTypes);
db.Library        = require('./library')(sequelize, DataTypes);
db.Recommendation = require('./recommendation')(sequelize, DataTypes);

// 4) Associate metodlarını çalıştır (ilişkileri kur)
Object.keys(db).forEach(modelName => {
  if (typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
});

// 5) Hazır db objesini dışa aktar
module.exports = db;
