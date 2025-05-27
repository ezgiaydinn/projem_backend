import os
import pandas as pd
import numpy as np
from surprise import Dataset, Reader, SVD, accuracy
from surprise.model_selection import train_test_split
from sklearn.metrics.pairwise import cosine_similarity
from dotenv import load_dotenv
from sqlalchemy import create_engine

# Load environment variables
load_dotenv(dotenv_path=".env")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT"))
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

# Database connection and data load
engine = create_engine(
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
df_ratings = pd.read_sql("SELECT user_id, book_id, rating FROM ratings", engine)

total_counts = df_ratings['book_id'].value_counts()
total_ratings = total_counts.sum()
item_prob = (total_counts / total_ratings).to_dict()

# Surprise dataset
reader = Reader(rating_scale=(1, 5))
data = Dataset.load_from_df(df_ratings[['user_id','book_id','rating']], reader)
trainset, testset = train_test_split(data, test_size=0.2, random_state=42)

# Train SVD model
algo = SVD(n_factors=50, n_epochs=20, random_state=42)
algo.fit(trainset)

# Helper to get item latent vector
def get_item_vector(raw_iid):
    try:
        inner_iid = algo.trainset.to_inner_iid(str(raw_iid))
        return algo.qi[inner_iid]
    except ValueError:
        return None

from collections import defaultdict
from math import log2

# Precision@K
def precision_at_k(algo, testset, k=10, threshold=3.5):
    top_k = defaultdict(list)
    for uid, iid, true_r in testset:
        est = algo.predict(uid, iid).est
        top_k[uid].append((iid, est, true_r))
    precisions = []
    for uid, items in top_k.items():
        items.sort(key=lambda x: x[1], reverse=True)
        topk = items[:k]
        num_rel = sum(1 for (_,_,r) in topk if r >= threshold)
        precisions.append(num_rel/k)
    return np.mean(precisions)

# Recall@K
def recall_at_k(algo, testset, k=10, threshold=3.5):
    top_k = defaultdict(list)
    true_items = defaultdict(set)
    for uid, iid, true_r in testset:
        if true_r >= threshold:
            true_items[uid].add(iid)
        est = algo.predict(uid, iid).est
        top_k[uid].append((iid, est))
    recalls = []
    for uid, preds in top_k.items():
        preds.sort(key=lambda x: x[1], reverse=True)
        rec_ids = [iid for iid,_ in preds[:k]]
        if true_items[uid]:
            recalls.append(sum(1 for i in rec_ids if i in true_items[uid]) / len(true_items[uid]))
    return np.mean(recalls)

# NDCG@K
def ndcg_at_k(algo, testset, k=10, threshold=3.5):
    top_k = defaultdict(list)
    true_items = defaultdict(set)
    for uid, iid, true_r in testset:
        if true_r >= threshold:
            true_items[uid].add(iid)
        est = algo.predict(uid, iid).est
        top_k[uid].append((iid, est))
    ndcgs = []
    for uid, preds in top_k.items():
        preds.sort(key=lambda x: x[1], reverse=True)
        rec_ids = [iid for iid,_ in preds[:k]]
        dcg = sum(((2**(1 if iid in true_items[uid] else 0) -1) / log2(idx+2)) for idx, iid in enumerate(rec_ids))
        ideal_rels = min(len(true_items[uid]), k)
        idcg = sum((1) / log2(i+2) for i in range(ideal_rels))
        if idcg > 0:
            ndcgs.append(dcg/idcg)
    return np.mean(ndcgs)

# ILD@K
def ild_at_k(algo, trainset, k=10):
    item_vecs = {iid: get_item_vector(iid) for iid in df_ratings['book_id'].unique()}
    user_ild = []
    for uid in trainset.all_users():
        raw_uid = trainset.to_raw_uid(uid)
        seen = {i for (u,i,_) in trainset.all_ratings() if u == uid}
        candidates = [iid for iid in item_vecs if iid not in seen]
        preds = [(iid, algo.predict(raw_uid, iid).est) for iid in candidates]
        preds.sort(key=lambda x: x[1], reverse=True)
        recs = [iid for iid,_ in preds[:k]]
        vecs = [item_vecs[i] for i in recs if item_vecs[i] is not None]
        if len(vecs) > 1:
            sim_mat = cosine_similarity(vecs)
            dist = 1 - sim_mat
            n = len(vecs)
            pairwise = [dist[i,j] for i in range(n) for j in range(i)]
            user_ild.append(np.mean(pairwise))
    return np.mean(user_ild)

# Novelty@K
def novelty_at_k(algo, trainset, k=10):
    user_nov = []
    for uid in trainset.all_users():
        raw_uid = trainset.to_raw_uid(uid)
        seen = {i for (u,i,_) in trainset.all_ratings() if u == uid}
        candidates = [iid for iid in item_prob if iid not in seen]
        preds = [(iid, algo.predict(raw_uid, iid).est) for iid in candidates]
        preds.sort(key=lambda x: x[1], reverse=True)
        recs = [iid for iid,_ in preds[:k]]
        nov = [-np.log(item_prob.get(i,1/total_ratings)) for i in recs]
        user_nov.append(np.mean(nov))
    return np.mean(user_nov)

# Compute and print all metrics
K = 10
print("========== ML Performans Değerlendirmesi ==========")
print(f"RMSE       : {accuracy.rmse(algo.test(testset), verbose=False):.4f}")
print(f"MAE        : {accuracy.mae(algo.test(testset), verbose=False):.4f}")
print(f"Precision@{K} : {precision_at_k(algo, testset, K):.4f}")
print(f"Recall@{K}    : {recall_at_k(algo, testset, K):.4f}")
print(f"NDCG@{K}      : {ndcg_at_k(algo, testset, K):.4f}")
print(f"ILD@{K}       : {ild_at_k(algo, trainset, K):.4f}")
print(f"Novelty@{K}   : {novelty_at_k(algo, trainset, K):.4f}")

# Tabulate
metrics = [
    ('RMSE', accuracy.rmse(algo.test(testset), verbose=False)),
    ('MAE', accuracy.mae(algo.test(testset), verbose=False)),
    ('Precision@'+str(K), precision_at_k(algo, testset, K)),
    ('Recall@'+str(K), recall_at_k(algo, testset, K)),
    ('NDCG@'+str(K), ndcg_at_k(algo, testset, K)),
    ('ILD@'+str(K), ild_at_k(algo, trainset, K)),
    ('Novelty@'+str(K), novelty_at_k(algo, trainset, K))
]
df = pd.DataFrame(metrics, columns=['Metrik','Değer'])
print(df.to_markdown(index=False))