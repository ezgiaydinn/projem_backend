import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import pandas as pd
from sqlalchemy import create_engine
from surprise import Dataset, Reader, SVD

# ---- 1) Ortam değişkenlerini yükle ----
load_dotenv(dotenv_path=".env")

DB_HOST     = os.getenv("DB_HOST")
DB_PORT     = os.getenv("DB_PORT")
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME     = os.getenv("DB_NAME")

# ---- 2) SQLAlchemy engine ----
engine = create_engine(
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# ---- 3) Verileri çek ----
df_ratings = pd.read_sql("SELECT user_id, book_id, rating FROM ratings", engine)
df_books = pd.read_sql("SELECT id AS book_id FROM books", engine)

# ---- 4) Surprise dataset ----
reader = Reader(rating_scale=(1, 5))
data = Dataset.load_from_df(df_ratings[['user_id', 'book_id', 'rating']], reader)
trainset = data.build_full_trainset()

# ---- 5) Modeli eğit ----
algo = SVD(n_factors=50, n_epochs=20)
algo.fit(trainset)

# ---- 6) FastAPI uygulaması ----
app = FastAPI(title="Bookify Recommender Service")

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")

class RecRequest(BaseModel):
    user_id: int
    top_n: int = 10

# ---- 7) Yardımcı fonksiyonlar ----
def get_popular_books(top_n=10):
    popular = (df_ratings['book_id']
               .value_counts()
               .head(top_n)
               .reset_index())
    popular.columns = ['book_id', 'rating_count']
    return popular['book_id'].tolist()

def get_random_books(top_n=10):
    return df_books['book_id'].sample(top_n).tolist()

# ---- 8) API endpoint ----
@app.post("/recommend")
def recommend(req: RecRequest):
    user = req.user_id
    top_n = req.top_n

    # Kullanıcının puan verdiği kitaplar
    df_user = df_ratings[df_ratings['user_id'] == user]

    if df_user.empty:
        fallback_books = get_popular_books(top_n=top_n)
        return {"recommendations": [{"book_id": bid, "score": None} for bid in fallback_books]}

    seen = set(df_user['book_id'].tolist())
    candidates = [bid for bid in df_books['book_id'] if bid not in seen]

    preds = []
    for bid in candidates:
        est = algo.predict(uid=user, iid=bid).est
        preds.append((bid, est))
    preds.sort(key=lambda x: x[1], reverse=True)
    top_preds = preds[:top_n]

    recommendations = [{"book_id": bid, "score": round(score, 3)} for bid, score in top_preds]
    return {"recommendations": recommendations}

# ---- 9) Local veya Railway test için ----
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print("✅ Bookify Recommender Service is starting on port", port)
    uvicorn.run("recommender:app", host="0.0.0.0", port=port, reload=False)
