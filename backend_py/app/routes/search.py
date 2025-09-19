from __future__ import annotations

from functools import lru_cache
from typing import List, Optional, Dict, Tuple

import json
import os

import numpy as np
from fastapi import APIRouter, HTTPException, Query

from ..services.catalog import get_catalog_service

router = APIRouter(prefix="/api/search", tags=["Search"])


@lru_cache(maxsize=1)
def _load_text_index() -> Tuple[Optional[np.ndarray], List[str]]:
    """Load precomputed product text embeddings and ids.

    Returns (embeddings_matrix or None, ids list). If files are missing, embeddings is None.
    """
    try:
        from pathlib import Path

        root = Path(__file__).resolve().parents[3]
        emb_path = root / "data" / "text_embeddings.npy"
        ids_path = root / "data" / "text_ids.json"
        if not emb_path.exists() or not ids_path.exists():
            return None, []
        embs = np.load(str(emb_path))  # shape: (N, D)
        # L2 normalize for cosine similarity
        norms = np.linalg.norm(embs, axis=1, keepdims=True) + 1e-8
        embs = embs / norms
        ids: List[str] = json.loads(ids_path.read_text(encoding="utf-8"))
        if len(ids) != embs.shape[0]:
            # Mismatch; ignore embeddings
            return None, []
        return embs.astype(np.float32), ids
    except Exception:
        return None, []


def _embed_query(text: str) -> Optional[np.ndarray]:
    """Create embedding for the query using OpenAI API if available.
    Falls back to None if not configured.
    """
    try:
        import openai  # type: ignore

        api_key = os.getenv("OPENAI_API_KEY")
        model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        if not api_key:
            return None
        client = openai.OpenAI(api_key=api_key)  # type: ignore
        resp = client.embeddings.create(model=model, input=text)
        vec = np.array(resp.data[0].embedding, dtype=np.float32)
        # L2 normalize
        vec = vec / (np.linalg.norm(vec) + 1e-8)
        return vec
    except Exception:
        return None


def _filter_products(products: List[Dict], category: Optional[str], min_price: Optional[int], max_price: Optional[int]) -> List[Dict]:
    out = products
    if category:
        out = [p for p in out if str(p.get("category", "")).lower() == category.lower()]
    if min_price is not None:
        out = [p for p in out if int(p.get("price", 0)) >= int(min_price)]
    if max_price is not None:
        out = [p for p in out if int(p.get("price", 0)) <= int(max_price)]
    return out


@router.get("/semantic")
def semantic_search(
    q: str = Query("", description="Search query text"),
    limit: int = Query(24, ge=1, le=100),
    category: Optional[str] = None,
    minPrice: Optional[int] = None,
    maxPrice: Optional[int] = None,
) -> List[Dict]:
    """Semantic search over catalog.

    Tries vector similarity if precomputed embeddings + API key are available.
    Otherwise falls back to substring scoring via CatalogService.search.
    """
    svc = get_catalog_service()
    all_products = svc.get_all()
    # apply coarse filters first to shrink candidates
    filtered = _filter_products(all_products, category, minPrice, maxPrice)

    # Attempt vector search
    embs, ids = _load_text_index()
    q_vec = _embed_query(q) if q else None
    if embs is not None and q_vec is not None and len(ids) == embs.shape[0] and len(ids) > 0:
        # Map id -> product
        id_to_product = {str(p.get("id")): p for p in all_products}
        # Get candidate indices under current filters (if any), else all
        if filtered is not all_products:
            filtered_ids = set(str(p.get("id")) for p in filtered)
            mask = np.array([1 if pid in filtered_ids else 0 for pid in ids], dtype=bool)
            if mask.any():
                embs_view = embs[mask]
                ids_view = [pid for pid, m in zip(ids, mask) if m]
            else:
                embs_view = embs
                ids_view = ids
        else:
            embs_view = embs
            ids_view = ids

        # cosine similarity = q dot v (after L2 normalize)
        sims = embs_view @ q_vec.reshape(-1, 1)  # (N,1)
        top_k = int(min(limit * 4, sims.shape[0]))
        idx = np.argpartition(-sims.squeeze(1), top_k - 1)[:top_k]
        top_pairs = sorted(((float(sims[i]), ids_view[i]) for i in idx), reverse=True)
        results: List[Dict] = []
        for _score, pid in top_pairs:
            p = id_to_product.get(str(pid))
            if not p:
                continue
            copy = dict(p)
            copy["score"] = _score
            results.append(copy)
            if len(results) >= limit:
                break
        return results

    # Fallback: substring matching
    if not q.strip():
        # empty query -> return recent subset under filters
        return filtered[:limit]
    words = [w for w in q.strip().split() if w]
    res = svc.search(words, max_results=limit * 2, products=filtered)
    return res[:limit]

