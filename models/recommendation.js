// models/recommendation.js
module.exports = (sequelize, DataTypes) => {
  const Recommendation = sequelize.define('Recommendation', {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    book_id: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    score: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'recommendations',
    timestamps: false
  });

  Recommendation.associate = models => {
    // Eğer Book model’in varsa:
    Recommendation.belongsTo(models.Book, {
      foreignKey: 'book_id',
      targetKey: 'id',
      as: 'Book'
    });
    // Kullanıcı ile ilişki gerekiyorsa:
    Recommendation.belongsTo(models.User, {
      foreignKey: 'user_id',
      targetKey: 'id',
      as: 'User'
    });
  };

  return Recommendation;
};
