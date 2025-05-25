# import os
# import pandas as pd
# import numpy as np
# from surprise import Dataset, Reader, SVD
# from surprise.model_selection import train_test_split
# from sklearn.metrics import mean_squared_error, mean_absolute_error
# from sklearn.metrics.pairwise import cosine_similarity
# from dotenv import load_dotenv
# from sqlalchemy import create_engine

# # Load environment
# load_dotenv(dotenv_path=".env")
# DB_HOST = os.getenv("DB_HOST")
# DB_PORT = int(os.getenv("DB_PORT"))
# DB_USER = os.getenv("DB_USER")
# DB_PASSWORD = os.getenv("DB_PASSWORD")
# DB_NAME = os.getenv("DB_NAME")

# # Connect and load ratings
# engine = create_engine(
#     f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
# )
# df_ratings = pd.read_sql("SELECT user_id, book_id, rating FROM ratings", engine)

# # Build Surprise dataset and split
# reader = Reader(rating_scale=(1, 5))
# data = Dataset.load_from_df(df_ratings[['user_id','book_id','rating']], reader)
# trainset, testset = train_test_split(data, test_size=0.2, random_state=42)

# # Train model
# algo = SVD(n_factors=50, n_epochs=20, random_state=42)
# algo.fit(trainset)

# # Global item popularity for novelty
# total_counts = df_ratings['book_id'].value_counts()
# total_ratings = total_counts.sum()
# item_prob = (total_counts / total_ratings).to_dict()

# # Precompute item latent vectors from CF component for ILD
# def get_item_vector(raw_iid):
#     try:
#         inner_iid = algo.trainset.to_inner_iid(str(raw_iid))
#         return algo.qi[inner_iid]
#     except ValueError:
#         return None

# # Metric functions
# from collections import defaultdict
# from math import log2

# # Precision@K

# def precision_at_k(algo, testset, k=10, threshold=3.5):
#     top_k = defaultdict(list)
#     for uid, iid, true_r in testset:
#         est = algo.predict(uid, iid).est
#         top_k[uid].append((iid, est, true_r))
#     precisions = []
#     for uid, items in top_k.items():
#         items.sort(key=lambda x: x[1], reverse=True)
#         topk = items[:k]
#         num_rel = sum(1 for (_,_,r) in topk if r >= threshold)
#         precisions.append(num_rel/k)
#     return np.mean(precisions)

# # Recall@K
# def recall_at_k(algo, testset, k=10, threshold=3.5):
#     top_k = defaultdict(list)
#     true_items = defaultdict(set)
#     for uid, iid, true_r in testset:
#         if true_r >= threshold:
#             true_items[uid].add(iid)
#         est = algo.predict(uid, iid).est
#         top_k[uid].append((iid, est))
#     recalls = []
#     for uid, preds in top_k.items():
#         preds.sort(key=lambda x: x[1], reverse=True)
#         rec_ids = [iid for iid,_ in preds[:k]]
#         if true_items[uid]:
#             recalls.append(sum(1 for i in rec_ids if i in true_items[uid]) / len(true_items[uid]))
#     return np.mean(recalls)

# # NDCG@K
# def ndcg_at_k(algo, testset, k=10, threshold=3.5):
#     top_k = defaultdict(list)
#     true_items = defaultdict(set)
#     for uid, iid, true_r in testset:
#         if true_r >= threshold:
#             true_items[uid].add(iid)
#         est = algo.predict(uid, iid).est
#         top_k[uid].append((iid, est))
#     ndcgs = []
#     for uid, preds in top_k.items():
#         preds.sort(key=lambda x: x[1], reverse=True)
#         rec_ids = [iid for iid,_ in preds[:k]]
#         dcg = 0.0
#         for idx, iid in enumerate(rec_ids):
#             rel = 1 if iid in true_items[uid] else 0
#             dcg += (2**rel -1) / log2(idx+2)
#         # IDCG
#         ideal_rels = min(len(true_items[uid]), k)
#         idcg = sum((2**1 -1)/log2(i+2) for i in range(ideal_rels))
#         if idcg>0:
#             ndcgs.append(dcg/idcg)
#     return np.mean(ndcgs)

# # ILD@K
# def ild_at_k(algo, trainset, k=10):
#     # For each user, compute average pairwise cosine distance of top-k
#     item_vecs = {iid: get_item_vector(iid) for iid in df_ratings['book_id'].unique()}
#     top_k = defaultdict(list)
#     # Build predictions for all
#     for uid in trainset.all_users():
#         raw_uid = trainset.to_raw_uid(uid)
#         # candidate items
#         seen = {iid for (u,i,r) in trainset.all_ratings() if u==uid}
#         candidates = [iid for iid in item_vecs if iid not in seen]
#         preds = [(iid, algo.predict(raw_uid, iid).est) for iid in candidates]
#         preds.sort(key=lambda x: x[1], reverse=True)
#         recs = [iid for iid,_ in preds[:k]]
#         # compute pairwise distances
#         vecs = [item_vecs[i] for i in recs if item_vecs[i] is not None]
#         if len(vecs)>1:
#             sim_mat = cosine_similarity(vecs)
#             # distance = 1 - sim
#             dist = 1 - sim_mat
#             # take upper triangle
#             n = len(vecs)
#             pairwise = [dist[i,j] for i in range(n) for j in range(i) ]
#             top_k[raw_uid] = np.mean(pairwise)
#     return np.mean(list(top_k.values()))

# # Novelty@K
# def novelty_at_k(algo, trainset, k=10):
#     pop = item_prob
#     top_k = defaultdict(list)
#     for uid in trainset.all_users():
#         raw_uid = trainset.to_raw_uid(uid)
#         seen = {iid for (u,i,r) in trainset.all_ratings() if u==uid}
#         candidates = [iid for iid in pop if iid not in seen]
#         preds = [(iid, algo.predict(raw_uid, iid).est) for iid in candidates]
#         preds.sort(key=lambda x: x[1], reverse=True)
#         recs = [iid for iid,_ in preds[:k]]
#         # novelty = average -log(probability)
#         nov = []
#         for iid in recs:
#             p = pop.get(iid, 1/total_ratings)
#             nov.append(-np.log(p))
#         top_k[raw_uid] = np.mean(nov)
#     return np.mean(list(top_k.values()))

# # Compute and print all metrics
# K=10
# print("========== ML Performans Değerlendirmesi ==========")
# print(f"RMSE         : {np.sqrt(mean_squared_error([r for (_,_,r) in testset], [algo.predict(u,i).est for (u,i,_) in testset]):.4f}")
# print(f"MAE          : {mean_absolute_error([r for (_,_,r) in testset], [algo.predict(u,i).est for (u,i,_) in testset]):.4f}")
# print(f"Precision@{K} : {precision_at_k(algo,testset,K):.4f}")
# print(f"Recall@{K}    : {recall_at_k(algo,testset,K):.4f}")
# print(f"NDCG@{K}      : {ndcg_at_k(algo,testset,K):.4f}")
# print(f"ILD@{K}       : {ild_at_k(algo, trainset, K):.4f}")
# print(f"Novelty@{K}   : {novelty_at_k(algo, trainset, K):.4f}")

# # Optionally, present in DataFrame
# metrics = [
#     ('RMSE', np.sqrt(mean_squared_error([r for (_,_,r) in testset],[algo.predict(u,i).est for (u,i,_) in testset]))),
#     ('MAE', mean_absolute_error([r for (_,_,r) in testset],[algo.predict(u,i).est for (u,i,_) in testset]))
# ]
# for name, func in [('Precision', precision_at_k), ('Recall', recall_at_k), ('NDCG', ndcg_at_k), ('ILD', ild_at_k), ('Novelty', novelty_at_k)]:
#     metrics.append((f"{name}@{K}", func(algo, testset if 'test' in name.lower() else trainset, K)))

# df = pd.DataFrame(metrics, columns=['Metrik','Değer'])
# print(df.to_markdown(index=False))
import os
import pandas as pd #type: ignore
import numpy as np #type: ignore
from surprise import Dataset, Reader, SVD #type: ignore
from surprise.model_selection import train_test_split #type: ignore 
from sklearn.metrics import mean_squared_error, mean_absolute_error #type: ignore
from sklearn.metrics.pairwise import cosine_similarity #type: ignore
from dotenv import load_dotenv #type: ignore
from sqlalchemy import create_engine #type: ignore

# Load environment
load_dotenv(dotenv_path=".env")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT"))
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

# Connect and load ratings
engine = create_engine(
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
df_ratings = pd.read_sql("SELECT user_id, book_id, rating FROM ratings", engine)

# Build Surprise dataset and split
reader = Reader(rating_scale=(1, 5))
data = Dataset.load_from_df(df_ratings[['user_id','book_id','rating']], reader)
trainset, testset = train_test_split(data, test_size=0.2, random_state=42)

# Train model
algo = SVD(n_factors=50, n_epochs=20, random_state=42)
algo.fit(trainset)

# Global item popularity for novelty
total_counts = df_ratings['book_id'].value_counts()
total_ratings = total_counts.sum()
item_prob = (total_counts / total_ratings).to_dict()

# Precompute item latent vectors from CF component for ILD
def get_item_vector(raw_iid):
    try:
        inner_iid = algo.trainset.to_inner_iid(str(raw_iid))
        return algo.qi[inner_iid]
    except ValueError:
        return None

# Metric functions
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
        dcg = 0.0
        for idx, iid in enumerate(rec_ids):
            rel = 1 if iid in true_items[uid] else 0
            dcg += (2**rel -1) / log2(idx+2)
        # IDCG
        ideal_rels = min(len(true_items[uid]), k)
        idcg = sum((2**1 -1)/log2(i+2) for i in range(ideal_rels))
        if idcg>0:
            ndcgs.append(dcg/idcg)
    return np.mean(ndcgs)

# ILD@K
def ild_at_k(algo, trainset, k=10):
    # For each user, compute average pairwise cosine distance of top-k
    item_vecs = {iid: get_item_vector(iid) for iid in df_ratings['book_id'].unique()}
    top_k = defaultdict(list)
    # Build predictions for all
    for uid in trainset.all_users():
        raw_uid = trainset.to_raw_uid(uid)
        # candidate items
        seen = {iid for (u,i,r) in trainset.all_ratings() if u==uid}
        candidates = [iid for iid in item_vecs if iid not in seen]
        preds = [(iid, algo.predict(raw_uid, iid).est) for iid in candidates]
        preds.sort(key=lambda x: x[1], reverse=True)
        recs = [iid for iid,_ in preds[:k]]
        # compute pairwise distances
        vecs = [item_vecs[i] for i in recs if item_vecs[i] is not None]
        if len(vecs)>1:
            sim_mat = cosine_similarity(vecs)
            # distance = 1 - sim
            dist = 1 - sim_mat
            # take upper triangle
            n = len(vecs)
            pairwise = [dist[i,j] for i in range(n) for j in range(i) ]
            top_k[raw_uid] = np.mean(pairwise)
    return np.mean(list(top_k.values()))

# Novelty@K
def novelty_at_k(algo, trainset, k=10):
    pop = item_prob
    top_k = defaultdict(list)
    for uid in trainset.all_users():
        raw_uid = trainset.to_raw_uid(uid)
        seen = {iid for (u,i,r) in trainset.all_ratings() if u==uid}
        candidates = [iid for iid in pop if iid not in seen]
        preds = [(iid, algo.predict(raw_uid, iid).est) for iid in candidates]
        preds.sort(key=lambda x: x[1], reverse=True)
        recs = [iid for iid,_ in preds[:k]]
        # novelty = average -log(probability)
        nov = []
        for iid in recs:
            p = pop.get(iid, 1/total_ratings)
            nov.append(-np.log(p))
        top_k[raw_uid] = np.mean(nov)
    return np.mean(list(top_k.values()))

# Compute and print all metrics
K=10
print("========== ML Performans Değerlendirmesi ==========")
print(f"RMSE         : {np.sqrt(mean_squared_error([r for (_,_,r) in testset], [algo.predict(u,i).est for (u,i,_) in testset])):.4f}")
print(f"MAE          : {mean_absolute_error([r for (_,_,r) in testset], [algo.predict(u,i).est for (u,i,_) in testset]):.4f}")
print(f"Precision@{K} : {precision_at_k(algo,testset,K):.4f}")
print(f"Recall@{K}    : {recall_at_k(algo,testset,K):.4f}")
print(f"NDCG@{K}      : {ndcg_at_k(algo,testset,K):.4f}")
print(f"ILD@{K}       : {ild_at_k(algo, trainset, K):.4f}")
print(f"Novelty@{K}   : {novelty_at_k(algo, trainset, K):.4f}")

# Optionally, present in DataFrame
metrics = [
    ('RMSE', np.sqrt(mean_squared_error([r for (_,_,r) in testset],[algo.predict(u,i).est for (u,i,_) in testset]))),
    ('MAE', mean_absolute_error([r for (_,_,r) in testset],[algo.predict(u,i).est for (u,i,_) in testset]))
]
for name, func in [('Precision', precision_at_k), ('Recall', recall_at_k), ('NDCG', ndcg_at_k), ('ILD', ild_at_k), ('Novelty', novelty_at_k)]:
    metrics.append((f"{name}@{K}", func(algo, testset if 'test' in name.lower() else trainset, K)))

df = pd.DataFrame(metrics, columns=['Metrik','Değer'])
print(df.to_markdown(index=False))
