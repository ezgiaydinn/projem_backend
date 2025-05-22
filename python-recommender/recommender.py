# ✅ Bookify Recommender Service – Çok Kullanıcılı, Fallback Destekli ve Model Güncelleme Özellikli

import os
from dotenv import load_dotenv # type: ignore
from fastapi import FastAPI, HTTPException, Depends, status, Request, Query # type: ignore
from fastapi.responses import RedirectResponse # type: ignore
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from jose import JWTError, jwt # type: ignore
from pydantic import BaseModel # type: ignore
import pandas as pd # type: ignore
from sqlalchemy import create_engine # type: ignore
from surprise import Dataset, Reader, SVD # type: ignore
from datetime import datetime, timedelta # type: ignore
from slowapi import Limiter, _rate_limit_exceeded_handler # type: ignore
from slowapi.util import get_remote_address # type: ignore
from slowapi.errors import RateLimitExceeded # type: ignore
import random

# ---- Ortam değişkenlerini yükle ----
load_dotenv(dotenv_path=".env")

DB_HOST     = os.getenv("DB_HOST")
DB_PORT     = os.getenv("DB_PORT")
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME     = os.getenv("DB_NAME")
SECRET_KEY  = os.getenv("SECRET_KEY", "mysecretkey")
ALGORITHM   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# ---- SQLAlchemy engine ----
engine = create_engine(
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# ---- FastAPI Uygulaması ----
app = FastAPI(title="Bookify Recommender Service")

# ---- Rate Limiting ve CORS ----
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

# ---- Authentication ----
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

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception

    user = fake_users_db.get(token_data.email)
    if user is None:
        raise credentials_exception
    return user

@app.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    user = fake_users_db.get(form_data.username)
    if not user or form_data.password != user["password"]:
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    access_token = create_access_token(data={"sub": user["email"]}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {"access_token": access_token, "token_type": "bearer"}

class RecRequest(BaseModel):
    user_id: int
    top_n: int = 10

class RatingInput(BaseModel):
    user_id: int
    book_id: str
    rating: float

# ---- Modeli Eğit ----
def train_model():
    global algo, df_ratings, df_books
    df_ratings = pd.read_sql("SELECT user_id, book_id, rating FROM ratings", engine)
    df_books = pd.read_sql("SELECT id AS book_id, title, authors FROM books", engine)
    reader = Reader(rating_scale=(1, 5))
    data = Dataset.load_from_df(df_ratings[['user_id', 'book_id', 'rating']], reader)
    trainset = data.build_full_trainset()
    algo = SVD(n_factors=50, n_epochs=20)
    algo.fit(trainset)

train_model()

# ---- Yardımcı Fonksiyonlar ----
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

# ---- Öneri API'si ----
@app.post("/recommend")
@limiter.limit("10/minute")
def recommend(
    req: RecRequest,
    request: Request,
    fallback: str = Query("popular", enum=["popular", "random", "category"]),
    current_user: dict = Depends(get_current_user)
):
    user = req.user_id
    top_n = req.top_n

    df_user = df_ratings[df_ratings['user_id'] == user]
    if df_user.empty:
        if fallback == "popular":
            fallback_books = get_popular_books(top_n=top_n)
        elif fallback == "random":
            fallback_books = get_random_books(top_n=top_n)
        else:
            fallback_books = get_category_books(category="fiction", top_n=top_n)

        return {
            "recommendations": [
                {"book_id": bid, "score": None, "source": f"fallback:{fallback}"}
                for bid in fallback_books
            ]
        }

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

# ---- Oy Ekleyip Modeli Güncelle ----
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

# ---- Local veya Railway için ----
if __name__ == "__main__":
    import uvicorn # type: ignore
    port = int(os.environ.get("PORT", 8000))
    print("✅ Bookify Recommender Service is starting on port", port)
    uvicorn.run("recommender_full_cleaned:app", host="0.0.0.0", port=port, reload=False)