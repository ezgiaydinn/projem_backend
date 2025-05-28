import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status, Request, Query
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from pydantic import BaseModel
import pandas as pd
from sqlalchemy import create_engine
from surprise import Dataset, Reader, SVD
from datetime import datetime, timedelta
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import random
import mysql.connector

load_dotenv(dotenv_path=".env")

DB_HOST     = os.getenv("DB_HOST")
DB_PORT     = int(os.getenv("DB_PORT"))
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME     = os.getenv("DB_NAME")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = 60
print("🧪 DB_HOST:", DB_HOST)
print("🧪 DB_PORT:", DB_PORT)
print("🧪 DB_USER:", DB_USER)
print("🧪 DB_PASSWORD:", DB_PASSWORD[:3] + "****")  
print("🧪 DB_NAME:", DB_NAME)

engine = create_engine(
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
)


app = FastAPI(title="Bookify Recommender Service")


limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

fake_users_db = {
    "dilara@example.com": {
        "id": 1,
        "name": "Dilara",
        "email": "dilara@example.com",
        "password": "1234"
    }
}

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: str | None = None


def create_access_token(user):
    to_encode = {
        "id":   user["id"],  
        "email": user.email,
        "name":  user.name,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=30)
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    print("📦 Token geldi mi?:", token)

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Geçersiz token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        print("📬 Payload çözüldü:", payload)

        user_id: int = payload.get("id")
        email: str = payload.get("email")
        name: str = payload.get("name")

        if user_id is None or email is None:
            raise credentials_exception

        
        return {"id": user_id, "email": email}

    except JWTError as e:
        print("❌ Token decode hatası:", str(e))
        raise credentials_exception

@app.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    user = fake_users_db.get(form_data.username)
    if not user or form_data.password != user["password"]:
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    access_token = create_access_token(user)
    return {"access_token": access_token, "token_type": "bearer"}

class RecRequest(BaseModel):
    user_id: int
    top_n: int = 10

class RatingInput(BaseModel):
    user_id: int
    book_id: str
    rating: float


def train_model():
    global algo, df_ratings, df_books
    df_ratings = pd.read_sql("SELECT user_id, book_id, rating FROM ratings", engine)
    df_books = pd.read_sql("""
    SELECT 
        id AS book_id,
        title,
        authors,          
        thumbnail_url AS thumbnailUrl,
        description,
        publisher,
        published_year,
        page_count
    FROM books
""", engine)
    reader = Reader(rating_scale=(1, 5))
    data = Dataset.load_from_df(df_ratings[['user_id', 'book_id', 'rating']], reader)
    trainset = data.build_full_trainset()
    algo = SVD(n_factors=50, n_epochs=20)
    algo.fit(trainset)
    return "Model retrained"


train_model()


def get_popular_books(top_n=10):
    popular = (df_ratings['book_id']
               .value_counts()
               .head(top_n)
               .reset_index())
    popular.columns = ['book_id', 'rating_count']
    return popular['book_id'].tolist()

def get_random_books(top_n=10):
    return random.sample(df_books['book_id'].tolist(), k=top_n)

def get_category_books(category: str, top_n=10):
    return random.sample(df_books['book_id'].tolist(), k=top_n)




@app.get("/recommend")
def recommend(
    request: Request,
    fallback: str = Query("popular", enum=["popular", "random", "category"]),
    top_n: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user)
):
    def fix(text):
        try:
            return text.encode("latin1").decode("utf-8") if isinstance(text, str) else text
        except:
            return text

    try:
        print("🚀 /recommend endpoint çağrıldı")
        print("🔐 Gelen Authorization:", request.headers.get("authorization"))

        user_id = current_user["id"]
        print(f"📌 Kullanıcı ID: {user_id}, Top N: {top_n}")

        df_user = df_ratings[df_ratings['user_id'] == user_id]

        if df_user.empty:
            print("🔁 Fallback önerisi çalışıyor...")

            if fallback == "popular":
                fallback_books = get_popular_books(top_n=top_n)
            elif fallback == "random":
                fallback_books = get_random_books(top_n=top_n)
            else:
                fallback_books = get_category_books(category="fiction", top_n=top_n)

            recommendations = []

            for bid in fallback_books:
                book_rows = df_books[df_books['book_id'] == bid]

                if book_rows.empty:
                    print(f"⚠️ fallback kitap ID'si bulunamadı: {bid}")
                    continue

                raw_book = book_rows.iloc[0].to_dict()
                book = {k: fix(v) for k, v in raw_book.items()}

                print("📦 book keys:", book.keys())
                recommendations.append({
                    "book_id": bid,
                    "score": None,
                    "source": f"fallback:{fallback}",
                    "title": book.get("title", "Bilinmeyen Kitap"),
                    "authors": book.get("authors", ""),
                    "thumbnail_url": book.get("thumbnail_url", "")
                })

            return { "recommendations": recommendations }

        
        seen = set(df_user['book_id'].tolist())
        candidates = [bid for bid in df_books['book_id'] if bid not in seen]

        preds = []
        for bid in candidates:
            try:
                est = algo.predict(uid=user_id, iid=bid).est
                preds.append((bid, est))
            except Exception as e:
                print(f"⚠️ Predict hatası (book_id={bid}):", e)

        preds.sort(key=lambda x: x[1], reverse=True)
        top_preds = preds[:top_n]

        try:
            db = mysql.connector.connect(
                host=os.getenv("DB_HOST"),
                port=int(os.getenv("DB_PORT")),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"),
                database=os.getenv("DB_NAME")
            )
            cursor = db.cursor()

            cursor.execute("DELETE FROM recommendations WHERE user_id = %s", (user_id,))
            now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

            for bid, score in top_preds:
                cursor.execute(
                    """
                    INSERT INTO recommendations (user_id, book_id, score, created_at, source)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (user_id, bid, round(score, 3), now, "svd")
                )

            db.commit()
            cursor.close()
            db.close()
        except Exception as e:
            print("⚠️ Veritabanı hatası:", e)

        
        recommendations = []
        for bid, score in top_preds:
            book_rows = df_books[df_books['book_id'] == bid]
            if book_rows.empty:
                print(f"⚠️ book_id {bid} için satır yok")
                continue
            raw_book = book_rows.iloc[0].to_dict()
            book = {k: fix(v) for k, v in raw_book.items()}
            recommendations.append({
                "book_id": bid,
                "score": round(score, 3),
                "title": book.get("title", ""),
                "authors": book.get("authors", ""),
                "thumbnail_url": book.get("thumbnail_url", ""),
                "description": book.get("description", ""),
                "publisher": book.get("publisher", ""),
                "publishedDate": book.get("publishedDate", ""),
                "pageCount": book.get("pageCount", 0),
            })

        return {"recommendations": recommendations}

    except Exception as e:
        print("❌ Genel Hata:", str(e))
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="İç hata: " + str(e))




@app.post("/rate")
def add_rating(data: RatingInput):
    query = """
    INSERT INTO ratings (user_id, book_id, rating)
    VALUES (%s, %s, %s)
    """
    with engine.begin() as conn:
        conn.execute(query, (data.user_id, data.book_id, data.rating))
    train_model()
    return {"message": "Rating added and model retrained."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print("✅ Bookify Recommender Service is starting on port", port)
    uvicorn.run("recommender:app", host="0.0.0.0", port=port, reload=False)




