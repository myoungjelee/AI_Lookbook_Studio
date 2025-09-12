# back_min.py
from __future__ import annotations
import os
from typing import List

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import create_engine, text

# ✅ 네가 준 함수 그대로 사용 (파일명/함수명 동일하게 둬야 함)
from recommending import recommend  # def recommend(query_positions, df, vecter, top_k=5, alpha=..., w1=..., w2=...)

# ========= DB 설정 (환경변수 권장) =========
DB_HOST = os.getenv("DB_HOST", "ai-final-team1-db.postgres.database.azure.com")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "adminDB")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_SSLMODE = os.getenv("DB_SSLMODE", "require")  # Azure 권장

ENGINE_URL = (
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    f"?sslmode={DB_SSLMODE}"
)

# ========= DB → 메모리 캐시 =========
def fetch_products(engine) -> pd.DataFrame:
    sql = """
    SELECT pos, "Product_U", "Product_Desc", "Product_P", "Category"
    FROM public.products
    ORDER BY pos ASC;
    """
    df = pd.read_sql(sql, engine)
    if "pos" not in df.columns:
        df.insert(0, "pos", range(len(df)))  # 안전장치
    return df.reset_index(drop=True)

def fetch_embeddings(engine) -> np.ndarray:
    # 임베딩 칼럼 자동 탐지 (col_0.. or value)
    with engine.connect() as conn:
        cols = pd.read_sql(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name='embeddings'
            ORDER BY ordinal_position
            """,
            conn,
        )["column_name"].tolist()

    vector_cols = [c for c in cols if c.startswith("col_")]
    if vector_cols:
        col_list = ", ".join(['pos'] + vector_cols)
        sql = f"SELECT {col_list} FROM public.embeddings ORDER BY pos ASC;"
        df = pd.read_sql(sql, engine)
        arr = df[vector_cols].to_numpy()
    else:
        sql = 'SELECT pos, "value" FROM public.embeddings ORDER BY pos ASC;'
        df = pd.read_sql(sql, engine)
        arr = np.array([np.array(v, dtype=np.float32) for v in df["value"]])

    if arr.dtype != np.float32:
        arr = arr.astype(np.float32, copy=False)
    return arr

# 엔진 & 캐시 로드 (서버 기동 시 1회)
engine = create_engine(
    ENGINE_URL,
    pool_pre_ping=True,
    connect_args={
        "keepalives": 1, "keepalives_idle": 30, "keepalives_interval": 10, "keepalives_count": 5
    },
)
with engine.connect() as conn:
    conn.execute(text("SELECT 1;"))

PRODUCTS_DF = fetch_products(engine)
EMBEDDINGS = fetch_embeddings(engine)
if len(PRODUCTS_DF) != len(EMBEDDINGS):
    raise RuntimeError(f"정합성 오류: products={len(PRODUCTS_DF)} vs embeddings={len(EMBEDDINGS)}")

# ========= FastAPI =========
app = FastAPI(title="Fashion Recommender (pos-based)", version="1.0.0")

class RecItem(BaseModel):
    pos: int
    Product_U: str | None = None
    Product_Desc: str | None = None
    Product_P: float | int | None = None
    Category: str | None = None
    score: float | None = None

@app.get("/health")
def health():
    return {"status": "ok", "items": len(PRODUCTS_DF), "embedding_dim": int(EMBEDDINGS.shape[1])}

@app.get("/recommend", response_model=List[RecItem])
def api_recommend(
    query_positions: List[int] = Query(..., description="선택한 상품 pos(0-based). 예: ?query_positions=12&query_positions=37"),
    top_k: int = Query(5, ge=1, le=50),
    alpha: float = Query(0.38, ge=0.0, le=10.0),
    w1: float = Query(0.97, ge=0.0, le=1.0),
    w2: float = Query(0.03, ge=0.0, le=1.0),
):
    # 범위 체크
    if any(p < 0 or p >= len(PRODUCTS_DF) for p in query_positions):
        raise HTTPException(status_code=400, detail="query_positions 중 범위를 벗어난 값이 있습니다.")

    try:
        # ✅ 네가 준 recommend() 그대로 호출 (여러 pos → 평균 임베딩)
        recs = recommend(
            query_positions=query_positions,
            df=PRODUCTS_DF,
            vecter=EMBEDDINGS,
            top_k=top_k,
            alpha=alpha,
            w1=w1,
            w2=w2,
        )
        # recs: ['pos','Product_U','Product_Desc','Product_P','Category','score']
        return recs.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
