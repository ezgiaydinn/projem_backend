# recommender.py

import os
import json
import pandas as pd # type: ignore
from sqlalchemy import create_engine # type: ignore
import mysql.connector # type: ignore
from surprise import Dataset, Reader, SVD # type: ignore
from sklearn.feature_extraction.text import TfidfVectorizer # type: ignore
from sklearn.metrics.pairwise import cosine_similarity # type: ignore
from dotenv import load_dotenv # type: ignore

# ---- 1) Ortam değişkenlerini yükle ----
load_dotenv(dotenv_path=".env")

DB_HOST     = os.getenv("DB_HOST")
DB_PORT     = os.getenv("DB_PORT")
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME     = os.getenv("DB_NAME")

# ---- 2) SQLAlchemy engine (pandas.read_sql için) ----
engine = create_engine(
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# ---- 3) MySQL-Connector bağlantısı (yazma işlemleri için) ----
conn = mysql.connector.connect(
    host=DB_HOST,
    port=int(DB_PORT),
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    use_pure=True
)

# ---------- 4) Verileri oku (explicit + implicit feedback) ----------
ratings = pd.read_sql(
    "SELECT user_id, book_id, rating FROM ratings",
    engine
)
fav = pd.read_sql(
    "SELECT user_id, book_id FROM favorites",
    engine
)
fav["rating"] = 4.0

lib = pd.read_sql(
    "SELECT user_id, book_id FROM librarys",
    engine
)
lib["rating"] = 3.5

# Tüm geri bildirimleri birleştir
ratings_all = pd.concat([ratings, fav, lib], ignore_index=True)

# Kitap meta-verisi
books = pd.read_sql(
    "SELECT id AS book_id, title, genre, authors FROM books",
    engine
)

# ---------- 5) Content-based özellik çıkarımı ----------
books["genre_str"] = books["genre"].fillna("")
def parse_authors(a):
    try:
        return ", ".join(json.loads(a))
    except:
        return a or ""
books["authors_str"] = books["authors"].apply(parse_authors)

tfidf = TfidfVectorizer()
tfidf_mat = tfidf.fit_transform(books["genre_str"])

# ---------- 6) Collaborative Filtering (SVD) ----------
reader = Reader(rating_scale=(1, 5))
data   = Dataset.load_from_df(
    ratings_all[["user_id", "book_id", "rating"]],
    reader
)
train  = data.build_full_trainset()
svd    = SVD(n_factors=50, lr_all=0.005, reg_all=0.02)
svd.fit(train)

# ---------- 7) Hybrid öneri fonksiyonu ----------
def hybrid(user_id, top_n=10, alpha=0.7):
    all_ids = books["book_id"].tolist()

    # 7.1) CF skorları
    cf_scores = {bid: svd.predict(user_id, bid).est for bid in all_ids}

    # 7.2) CB skorları (son explicit puanlanan kitaba göre)
    user_hist = ratings[ratings.user_id == user_id]
    if not user_hist.empty:
        last_bid = user_hist.iloc[-1]["book_id"]
        mask     = books["book_id"] == last_bid
        if mask.any():
            idx = books.index[mask][0]
        else:
            idx = 0
    else:
        idx = 0

    sim       = cosine_similarity(tfidf_mat[idx], tfidf_mat)[0]
    cb_scores = {bid: sim[i] for i, bid in enumerate(all_ids)}

    # 7.3) Ağırlıklı birleşim
    final = {
        b: alpha * cf_scores.get(b, 0) + (1 - alpha) * cb_scores.get(b, 0)
        for b in all_ids
    }
    return sorted(final.items(), key=lambda x: x[1], reverse=True)[:top_n]

# ---------- 8) recommendations tablosunu oluştur (varsa pas geç) ----------
cursor = conn.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS recommendations (
  user_id    INT         NOT NULL,
  book_id    VARCHAR(50) NOT NULL,
  score      FLOAT       NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB;
""")

# ---------- 9) Her kullanıcı için öneri yaz ----------
for uid in ratings["user_id"].unique():
    for bid, score in hybrid(uid):
        cursor.execute("""
          INSERT INTO recommendations (user_id, book_id, score)
          VALUES (%s, %s, %s)
          ON DUPLICATE KEY UPDATE score=VALUES(score), created_at=NOW()
        """, (int(uid), bid, float(score)))

conn.commit()
cursor.close()
conn.close()

print("✅ Öneriler başarıyla güncellendi.")
