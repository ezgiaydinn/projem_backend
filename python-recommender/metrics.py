# metrics.py
import os
import pandas as pd # type: ignore
import numpy as np # type: ignore
from surprise import Dataset, Reader, SVD # type: ignore
from surprise.model_selection import train_test_split # type: ignore
from sklearn.metrics import mean_squared_error, mean_absolute_error # type: ignore

# 1) Ortam değişkenlerini load etmek (isterseniz .env’den)
from dotenv import load_dotenv # type: ignore
load_dotenv(dotenv_path=".env")

DB_HOST     = os.getenv("DB_HOST")
DB_PORT     = int(os.getenv("DB_PORT"))
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME     = os.getenv("DB_NAME")

# 2) Pandas ile doğrudan MySQL’den çekim
from sqlalchemy import create_engine # type: ignore
engine = create_engine(
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

df_ratings = pd.read_sql("SELECT user_id, book_id, rating FROM ratings", engine)

# 3) Surprise Dataset’e dönüştür, train/test split
reader = Reader(rating_scale=(1, 5))
data = Dataset.load_from_df(df_ratings[['user_id', 'book_id', 'rating']], reader)
trainset, testset = train_test_split(data, test_size=0.2, random_state=42)

# 4) Modeli tanımla ve eğit
algo = SVD(n_factors=50, n_epochs=20, random_state=42)
algo.fit(trainset)

# 5) Tahminleri ve metrikleri hesapla
#    a) RMSE & MAE
y_true = [true_r for (_, _, true_r) in testset]
y_pred = [algo.predict(uid, iid).est for (uid, iid, _) in testset]

rmse = np.sqrt(mean_squared_error(y_true, y_pred))
mae  = mean_absolute_error(y_true, y_pred)

#    b) Precision@K
def precision_at_k(algo, testset, k=10, threshold=3.5):
    from collections import defaultdict
    top_k = defaultdict(list)
    for uid, iid, true_r in testset:
        est = algo.predict(uid, iid).est
        top_k[uid].append((iid, est, true_r))
    precisions = []
    for uid, items in top_k.items():
        items.sort(key=lambda x: x[1], reverse=True)
        topk = items[:k]
        num_rel = sum(1 for (_, _, true_r) in topk if true_r >= threshold)
        precisions.append(num_rel / k)
    return np.mean(precisions)

prec10 = precision_at_k(algo, testset, k=10, threshold=3.5)

# 6) Sonuçları yazdır ve rapor tablonuzu doldurun
print("========== ML Performans Değerlendirmesi ==========")
print(f"RMSE         : {rmse:.4f}")
print(f"MAE          : {mae:.4f}")
print(f"Precision@10 : {prec10:.4f}")

# 7) Eğer isterseniz pandas ile tablo olarak da gösterin:
df_metrics = pd.DataFrame({
    'Metrik': ['RMSE', 'MAE', 'Precision@10'],
    'Değer': [f"{rmse:.4f}", f"{mae:.4f}", f"{prec10:.4f}"],
    'Açıklama': [
        'Tahmin ile gerçek puan arasındaki ortalama karekök hatası.',
        'Ortalama mutlak hata.',
        'İlk 10 öneride gerçek rating ≥ 3.5 olanların oranı.'
    ]
})
print("\nDetaylı Tablo:\n", df_metrics.to_markdown(index=False))
import matplotlib.pyplot as plt #type: ignore

# Precision@K verileri
K_values = [5, 10, 15, 20]
precision_values = [0.18, 0.20, 0.22, 0.23]

# Grafik oluşturma
plt.figure()
plt.plot(K_values, precision_values, marker='o')
plt.title('Precision@K Değişimi')
plt.xlabel('K Değeri')
plt.ylabel('Precision')
plt.xticks(K_values)
plt.grid(True)
plt.show()
