import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")  # Veya .env

conn = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT")),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASS"),
    database=os.getenv("DB_NAME"),
    use_pure=True,       # TCP/IP kullansın, named pipe yerine
)


# ---- 3) Verileri oku ----
# Explicit feedback
ratings = pd.read_sql("SELECT user_id, book_id, rating FROM ratings", conn)
# Implicit: favorites (+4 puan)
fav     = pd.read_sql("SELECT user_id, book_id FROM favorites", conn)
fav["rating"] = 4.0
# Implicit: librarys (+3.5 puan)
lib     = pd.read_sql("SELECT user_id, book_id FROM librarys", conn)
lib["rating"] = 3.5

# Tüm geri bildirimleri birleştir
ratings_all = pd.concat([ratings, fav, lib], ignore_index=True)

# Kitap meta-verisi
books = pd.read_sql(
    "SELECT id AS book_id, title, genre, authors FROM books", conn
)

# ---- 4) Content-based özellik çıkarımı ----
# genre ve authors metinlerini hazırla
books["genre_str"] = books["genre"].fillna("")
def parse_authors(a):
    try:
        return ", ".join(json.loads(a))
    except:
        return a or ""
books["authors_str"] = books["authors"].apply(parse_authors)

tfidf = TfidfVectorizer()
tfidf_mat = tfidf.fit_transform(books["genre_str"])

# ---- 5) Collaborative Filtering (SVD) ----
reader = Reader(rating_scale=(1,5))
data   = Dataset.load_from_df(ratings_all[["user_id","book_id","rating"]], reader)
train  = data.build_full_trainset()
svd    = SVD(n_factors=50, lr_all=0.005, reg_all=0.02)
svd.fit(train)

# ---- 6) Hybrid öneri fonksiyonu ----
def hybrid(user_id, top_n=10, alpha=0.7):
    all_ids = books["book_id"].tolist()
    # 6.1) CF skorları
    cf_scores = {bid: svd.predict(user_id, bid).est for bid in all_ids}
    # 6.2) CB skorları (son puanlanan kitaba göre)
    user_hist = ratings[ratings.user_id==user_id]
    if not user_hist.empty:
        last_bid = user_hist.sort_values("book_id").iloc[-1]["book_id"]
        idx      = books.index[books.book_id==last_bid][0]
    else:
        idx = 0
    sim = cosine_similarity(tfidf_mat[idx], tfidf_mat)[0]
    cb_scores = {bid: sim[i] for i,bid in enumerate(all_ids)}
    # 6.3) Ağırlıklı birleşim
    final = {b: alpha*cf_scores[b] + (1-alpha)*cb_scores.get(b,0) for b in all_ids}
    return sorted(final.items(), key=lambda x: x[1], reverse=True)[:top_n]

# ---- 7) recommendations tablosunu oluştur (varsa pas geç) ----
cursor = conn.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS recommendations (
  user_id INT NOT NULL,
  book_id VARCHAR(50) NOT NULL,
  score   FLOAT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, book_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB;
""")

# ---- 8) Her kullanıcı için öneri yaz ----
for uid in ratings["user_id"].unique():
    recs = hybrid(uid)
    for bid, score in recs:
        cursor.execute("""
          INSERT INTO recommendations (user_id, book_id, score)
          VALUES (%s, %s, %s)
          ON DUPLICATE KEY UPDATE score=VALUES(score), created_at=NOW()
        """, (int(uid), bid, float(score)))

conn.commit()
cursor.close()
conn.close()
print("✅ Öneriler başarıyla güncellendi.")
