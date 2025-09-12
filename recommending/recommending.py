import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from typing import List

def recommend(
    query_positions: List[int],
    df: pd.DataFrame,
    vecter: np.ndarray,
    top_k: int = 5,
    alpha: float = 0.38,
    w1: float = 0.97,
    w2: float = 0.03,
) -> pd.DataFrame:
    """
    하나 또는 여러 상품 인덱스(0-based)를 받아 평균 임베딩으로 유사 상품 추천
    """
    qpos = np.array(query_positions, dtype=int)
    query_vec = vecter[qpos].mean(axis=0, keepdims=True)
    qprice = float(df.iloc[qpos]["Product_P"].mean())

    sim = cosine_similarity(query_vec, vecter).flatten()

    cprices = df["Product_P"].to_numpy()
    qlog, clog = np.log1p(qprice), np.log1p(cprices)
    price_score = np.exp(-alpha * np.abs(clog - qlog))

    total_score = w1 * sim + w2 * price_score
    total_score[qpos] = -np.inf  # 자기 자신 제외

    top_idx = np.argpartition(-total_score, kth=min(top_k, len(df)-1))[:top_k]
    top_idx = top_idx[np.argsort(-total_score[top_idx])]

    recs = df.iloc[top_idx][["Product_U", "Product_Desc", "Product_P", "Category"]].copy()
    recs.insert(0, "pos", top_idx)
    recs["score"] = total_score[top_idx]
    return recs.reset_index(drop=True)
