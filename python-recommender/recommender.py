import os
import pandas as pd
import mysql.connector
from surprise import Dataset, Reader, SVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from dotenv import load_dotenv

# ---- 1) Ortam değişkenlerini yükle ----
load_dotenv(dotenv_path=".env")

DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

# ---- 2) MySQL bağlantısı ----
conn = mysql.connector.connect(
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME
)

# ---- 3) Verileri çek ----
# Yeni: ratings + favorites + librarys birleştirildi
query = """
    SELECT user_id, book_id, rating FROM ratings
    UNION
    SELECT user_id, book_id, 5 as rating FROM favorites
    UNION
    SELECT user_id, book_id, 4 as rating FROM librarys
"""
df_ratings = pd.read_sql(query, conn)
df_books = pd.read_sql("SELECT * FROM books", conn)
df_users = pd.read_sql("SELECT DISTINCT user_id FROM ratings", conn)

# ---- 4) SVD modelini eğit ----
reader = Reader(rating_scale=(1, 5))
data = Dataset.load_from_df(df_ratings[['user_id', 'book_id', 'rating']], reader)
trainset = data.build_full_trainset()
algo = SVD()
algo.fit(trainset)

# ---- 5) Content-based filtering (TF-IDF + Cosine Similarity) ----
tfidf = TfidfVectorizer(stop_words='english')
tfidf_matrix = tfidf.fit_transform(df_books['title'].fillna(""))
cosine_sim = cosine_similarity(tfidf_matrix, tfidf_matrix)

# ---- 6) Öneri hesaplama ----
recommendations = []

for user_id in df_users['user_id']:
    rated_books = df_ratings[df_ratings['user_id'] == user_id]['book_id'].tolist()
    all_books = df_books['id'].tolist()
    candidate_books = [b for b in all_books if b not in rated_books]

    preds = [(book_id, algo.predict(user_id, book_id).est) for book_id in candidate_books]
    preds.sort(key=lambda x: x[1], reverse=True)
    top_books = preds[:10]

    for book_id, est_rating in top_books:
        recommendations.append((user_id, book_id, est_rating))

# ---- 7) Recommendations tablosunu güncelle ----
cursor = conn.cursor()
cursor.execute("DELETE FROM recommendations")
cursor.executemany(
    "INSERT INTO recommendations (user_id, book_id, predicted_rating) VALUES (%s, %s, %s)",
    recommendations
)
conn.commit()

print("✅ Öneriler başarıyla güncellendi.")

# ---- 8) Bağlantıyı kapat ----
cursor.close()
conn.close()
