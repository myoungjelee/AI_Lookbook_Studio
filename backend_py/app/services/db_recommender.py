from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np

try:
    from sqlalchemy import create_engine, text  # type: ignore
    from sqlalchemy.engine import Engine  # type: ignore
except Exception:  # Optional dependency
    create_engine = None  # type: ignore
    text = None  # type: ignore
    class Engine:  # type: ignore
        pass


@dataclass
class DbConfig:
    host: str = os.getenv("DB_HOST", "")
    port: int = int(os.getenv("DB_PORT", "5432"))
    name: str = os.getenv("DB_NAME", "")
    user: str = os.getenv("DB_USER", "")
    password: str = os.getenv("DB_PASSWORD", "")
    sslmode: str = os.getenv("DB_SSLMODE", "require")

    @property
    def url(self) -> str:
        if not (self.host and self.user):
            return ""
        return (
            f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}?sslmode={self.sslmode}"
        )


def _normalize_slot(raw: Optional[str]) -> str:
    c = (str(raw or "").strip().lower())
    if not c:
        return "unknown"
    
    # DB 카테고리 매핑만 사용
    if c in ["man_outer", "woman_outer"]:
        return "outer"
    elif c in ["man_top", "woman_top"]:
        return "top"
    elif c in ["man_bottom", "woman_bottom"]:
        return "pants"
    elif c in ["man_shoes", "woman_shoes"]:
        return "shoes"
    elif c == "woman_dress_skirt":
        return "pants"  # 드레스/스커트는 하의로 분류
    
    # 알 수 없는 카테고리는 그대로 반환
    return c


def _normalize_gender(raw: Optional[str]) -> str:
    g = (str(raw or "").strip().lower())
    if not g:
        return "unknown"
    male_kw = ["male", "man", "men", "m", "남", "남성", "남자"]
    female_kw = ["female", "woman", "women", "w", "여", "여성", "여자"]
    unisex_kw = ["unisex", "uni", "男女", "공용", "공용/유니섹스", "유니섹스"]
    kids_kw = ["kid", "kids", "child", "children", "아동", "키즈"]
    if any(k in g for k in male_kw):
        return "male"
    if any(k in g for k in female_kw):
        return "female"
    if any(k in g for k in unisex_kw):
        return "unisex"
    if any(k in g for k in kids_kw):
        return "kids"
    return g


class DbPosRecommender:
    """
    DB-backed recommender. Loads products and embeddings into memory (NumPy) and
    performs cosine similarity + price weighting, similar to PosRecommender.
    Tables expected:
      public.products(pos, "Product_U", "Product_Desc", "Product_P", "Category")
      public.embeddings(pos, col_0.. or value JSON/array)
    """

    def __init__(self, cfg: Optional[DbConfig] = None) -> None:
        self.cfg = cfg or DbConfig()
        self.logger = logging.getLogger(__name__)
        self.engine: Optional[Engine] = None
        self.products: List[Dict] = []
        self.emb: Optional[np.ndarray] = None
        self.emb_norm: Optional[np.ndarray] = None
        self.prices: Optional[np.ndarray] = None

        if self.cfg.url and create_engine is not None and text is not None:
            try:
                self.engine = create_engine(
                    self.cfg.url,
                    pool_pre_ping=True,
                    connect_args={
                        "keepalives": 1,
                        "keepalives_idle": 30,
                        "keepalives_interval": 10,
                        "keepalives_count": 5,
                    },
                )
                with self.engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                self.logger.info("[DbPosRecommender] Connected to DB host=%s db=%s", self.cfg.host, self.cfg.name)
                self._load_all()
                if self.available():
                    self.logger.info(
                        "[DbPosRecommender] Loaded %d products and embeddings", len(self.products)
                    )
                else:
                    self.logger.warning("[DbPosRecommender] Loaded data but recommender marked unavailable")
            except Exception as exc:
                self.logger.exception("[DbPosRecommender] Initialization failed: %s", exc)
                # Leave unavailable; route will fall back
                self.engine = None

    def _load_all(self) -> None:
        assert self.engine is not None and text is not None
        # Load products
        with self.engine.begin() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT pos,
                           "Product_U",
                           "Product_img_U",
                           "Product_N",
                           "Product_Desc",
                           "Product_P",
                           "Category",
                           "Product_B",
                           "Product_G",
                           "Image_P"
                    FROM public.products
                    ORDER BY pos ASC
                    """
                )
            ).mappings().all()
        self.products = []
        for r in rows:
            title = r.get("Product_N") or r.get("Product_Desc") or ""
            brand = r.get("Product_B")
            gender_raw = r.get("Product_G")
            tags: List[str] = []
            if brand:
                tags.append(str(brand))
            if gender_raw:
                tags.append(str(gender_raw))
            image_url = r.get("Product_img_U") or r.get("Image_P") or None
            product_url = r.get("Product_U")
            category_raw = r.get("Category")
            norm_cat = _normalize_slot(category_raw)
            gender_norm = _normalize_gender(gender_raw)
            self.products.append(
                {
                    "id": str(r.get("pos")),
                    "title": str(title),
                    "price": int(r.get("Product_P") or 0),
                    "tags": tags,
                    "category": norm_cat,
                    "gender": gender_norm,
                    "imageUrl": image_url,
                    "productUrl": product_url,
                }
            )

        # Load embeddings (supports col_0.. or value)
        with self.engine.begin() as conn:
            cols = [c[0] for c in conn.execute(
                text(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='embeddings'
                    ORDER BY ordinal_position
                    """
                )
            ).all()]

        vector_cols = [c for c in cols if c.startswith("col_")]
        if vector_cols:
            with self.engine.begin() as conn:
                col_list = ", ".join(['pos'] + vector_cols)
                data = conn.execute(text(f"SELECT {col_list} FROM public.embeddings ORDER BY pos ASC")).all()
            mat = np.array([list(row)[1:] for row in data], dtype=np.float32)
        else:
            with self.engine.begin() as conn:
                data = conn.execute(text('SELECT pos, "value" FROM public.embeddings ORDER BY pos ASC')).all()
            # Assume DB driver returns Python list/JSON for value
            mat = np.array([np.array(row[1], dtype=np.float32) for row in data], dtype=np.float32)

        # Sanity check
        if len(self.products) != mat.shape[0]:
            # mismatch: mark unavailable
            self.logger.error(
                "[DbPosRecommender] Product/embedding count mismatch: products=%d, embeddings_rows=%d",
                len(self.products),
                mat.shape[0],
            )
            self.products = []
            self.emb = None
            self.emb_norm = None
            self.prices = None
            return

        self.emb = mat.astype(np.float32, copy=False)
        norms = np.linalg.norm(self.emb, axis=1)
        norms[norms == 0] = 1e-8
        self.emb_norm = self.emb / norms[:, None]
        self.prices = np.array([p["price"] for p in self.products], dtype=np.float32)

    def available(self) -> bool:
        return self.emb_norm is not None and len(self.products) > 0

    def recommend(
        self,
        positions: List[int],
        *,
        top_k: int = 5,
        alpha: float = 0.38,
        w1: float = 0.97,
        w2: float = 0.03,
    ) -> List[Dict]:
        if not self.available():
            raise RuntimeError("DbPosRecommender unavailable")

        n = len(self.products)
        if any(p < 0 or p >= n for p in positions):
            raise ValueError("positions out of range")

        k = max(1, min(int(top_k), n))
        emb_norm = self.emb_norm  # type: ignore[assignment]
        prices = self.prices  # type: ignore[assignment]

        q = emb_norm[positions].mean(axis=0)
        qn = np.linalg.norm(q)
        if qn == 0:
            qn = 1e-8
        q = q / qn

        sim = emb_norm @ q
        qprice = float(prices[positions].mean())
        clog = np.log1p(prices)
        qlog = np.log1p(qprice)
        price_score = np.exp(-alpha * np.abs(clog - qlog))
        total = w1 * sim + w2 * price_score
        total[np.array(positions, dtype=int)] = -np.inf

        if k >= n:
            top_idx = np.argsort(-total)
        else:
            part = np.argpartition(-total, kth=k - 1)[:k]
            top_idx = part[np.argsort(-total[part])]

        out: List[Dict] = []
        for i in top_idx.tolist():
            p = dict(self.products[i])
            p["score"] = float(total[i])
            out.append(p)
        return out


db_pos_recommender = DbPosRecommender()
