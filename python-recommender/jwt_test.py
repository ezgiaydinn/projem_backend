# jwt_test.py

from jose import jwt  # PyJWT kütüphanesi
from datetime import datetime, timedelta

SECRET_KEY = "mysecretkey"
ALGORITHM = "HS256"

def manual_jwt_debug():
    payload = {
        "sub": "ezgi@example.com",
        "id": 8,
        "exp": datetime.utcnow() + timedelta(minutes=15)
    }

    print("🔮 Şifrelenmeden önce payload:", payload)

    # Encode token
    encoded = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    print("🔐 Şifrelenmiş token:", encoded)

    # Decode token
    decoded = jwt.decode(encoded, SECRET_KEY, algorithms=[ALGORITHM])
    print("🔎 Çözülen token payload:", decoded)

if __name__ == "__main__":
    manual_jwt_debug()
