from __future__ import annotations

from typing import List, Optional, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models import RecommendationItem
from ..services.external_recommender import external_recommender
from ..services.pos_recommender import get_pos_recommender
from ..services.db_recommender import db_pos_recommender
from ..services.catalog import get_catalog_service
from ..services.llm_ranker import llm_ranker


router = APIRouter(prefix="/api/recommend", tags=["Recommendations"])


class SelectedItem(BaseModel):
    pos: int
    category: Optional[str] = None
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    price: Optional[int] = None
    brand: Optional[str] = None
    gender: Optional[str] = None
    productUrl: Optional[str] = None
    imageUrl: Optional[str] = None
    description: Optional[str] = None


class PositionsRequest(BaseModel):
    positions: List[int] = Field(..., description="Selected product positions (0-based)")
    top_k: int = Field(30, ge=1, le=200, description="Pool size before final cut")
    final_k: int = Field(3, ge=1, le=50, description="Final number of items to return")
    alpha: float = Field(0.38, ge=0.0, le=10.0)
    w1: float = Field(0.97, ge=0.0, le=1.0)
    w2: float = Field(0.03, ge=0.0, le=1.0)
    categories: Optional[List[str]] = Field(default=None, description="Restrict to these categories (e.g., ['top'])")
    use_llm_rerank: Optional[bool] = Field(default=None, description="Enable Azure LLM rerank when available")
    items: Optional[List[SelectedItem]] = Field(default=None, description="Optional: full metadata of selected products")


def _normalize_category(value: str | None) -> str:
    v = (value or "").strip().lower()
    if not v:
        return "unknown"
    if "outer" in v or "jacket" in v or "coat" in v:
        return "outer"
    if "top" in v or "shirt" in v or "tee" in v or "상의" in v:
        return "top"
    if (
        "pant" in v or "bottom" in v or "하의" in v or "denim" in v or "skirt" in v
    ):
        return "pants"
    if "shoe" in v or "sneaker" in v or "신발" in v:
        return "shoes"
    if "access" in v:
        return "accessories"
    return v


def _infer_target_categories_from_positions(positions: List[int]) -> List[str]:
    svc = get_catalog_service()
    catalog = svc.get_all()
    cats: List[str] = []
    for p in positions:
        if 0 <= p < len(catalog):
            cats.append(_normalize_category(str(catalog[p].get("category"))))
    if not cats:
        return []
    # majority category as first, keep unique order
    from collections import Counter

    cnt = Counter(cats)
    majority = max(cnt.items(), key=lambda kv: kv[1])[0]
    ordered_unique: List[str] = []
    for c in [majority] + cats:
        if c not in ordered_unique:
            ordered_unique.append(c)
    return ordered_unique


@router.post("/by-positions", response_model=List[RecommendationItem])
def recommend_by_positions(req: PositionsRequest) -> List[RecommendationItem]:
    # determine target categories (priority: explicit -> from items -> from positions)
    if req.categories:
        target_cats = [_normalize_category(c) for c in req.categories]
    elif req.items:
        target_cats = []
        for it in req.items:
            if it.category:
                c = _normalize_category(it.category)
                if c not in target_cats:
                    target_cats.append(c)
    else:
        target_cats = _infer_target_categories_from_positions(req.positions)
    target_cats = [c for c in target_cats if c in {"top", "pants", "shoes", "outer", "accessories"}] or []

    # Prefer DB recommender if available, then file-based, then external
    pool: List[Dict] | None = None
    if db_pos_recommender.available():
        try:
            items = db_pos_recommender.recommend(
                positions=req.positions,
                top_k=req.top_k,
                alpha=req.alpha,
                w1=req.w1,
                w2=req.w2,
            )
            pool = items
        except Exception as e:
            # fall through to file/external
            pass

    # Prefer internal (file-based) recommender when available
    if pool is None:
        pos_rec = get_pos_recommender()
        if pos_rec.available():
            try:
                items = pos_rec.recommend(
                    positions=req.positions,
                    top_k=req.top_k,
                    alpha=req.alpha,
                    w1=req.w1,
                    w2=req.w2,
                )
                pool = items
            except Exception as e:
                # fall back to external if configured
                if external_recommender.available():
                    try:
                        items = external_recommender.recommend_by_positions(
                            positions=req.positions,
                            top_k=req.top_k,
                            alpha=req.alpha,
                            w1=req.w1,
                            w2=req.w2,
                        )
                        pool = items
                    except Exception as e2:
                        raise HTTPException(status_code=500, detail=str(e2))
                else:
                    raise HTTPException(status_code=500, detail=str(e))

    # If internal not available, try external
    if pool is None and external_recommender.available():
        try:
            items = external_recommender.recommend_by_positions(
                positions=req.positions,
                top_k=req.top_k,
                alpha=req.alpha,
                w1=req.w1,
                w2=req.w2,
            )
            pool = items
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if pool is None:
        raise HTTPException(status_code=503, detail="No recommender available (internal/external)")

    # Filter by target categories if provided/inferred
    if target_cats:
        pool = [it for it in pool if _normalize_category(str(it.get("category"))) in target_cats]
    # Sort by score desc if present
    try:
        pool.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
    except Exception:
        pass

    # Optional LLM rerank per majority category
    use_llm = req.use_llm_rerank if req.use_llm_rerank is not None else llm_ranker.available()
    if use_llm and llm_ranker.available() and pool:
        # choose a focus category
        focus_cats = target_cats or _infer_target_categories_from_positions(req.positions)
        focus = focus_cats[0] if focus_cats else _normalize_category(str(pool[0].get("category")))
        # build analysis from provided items if available; otherwise from catalog
        if req.items:
            tags: List[str] = []
            for it in req.items:
                if it.brand:
                    tags.append(str(it.brand))
                if it.gender:
                    tags.append(str(it.gender))
                if it.tags:
                    tags.extend([str(t) for t in it.tags])
                if it.title:
                    tags.extend([w for w in str(it.title).split()[:8]])
                if it.description:
                    tags.extend([w for w in str(it.description).split()[:8]])
            analysis = {"categories": [focus], "tags": tags[:30]}
        else:
            svc = get_catalog_service()
            catalog = svc.get_all()
            tags = []
            for p in req.positions:
                if 0 <= p < len(catalog):
                    tags.extend(catalog[p].get("tags") or [])
            analysis = {"categories": [focus], "tags": tags[:20]}
        # candidates for the focus only
        cand = {focus: pool[: min(len(pool), max(req.final_k * 5, 20))]}
        ids_map = {str(it.get("id")): it for it in pool}
        picked = llm_ranker.rerank(analysis, cand, top_k=req.final_k) or {}
        order_ids = picked.get(focus) or []
        llm_ranked: List[Dict] = [ids_map[i] for i in order_ids if i in ids_map]
        # fill if not enough
        if len(llm_ranked) < req.final_k:
            for it in pool:
                if it not in llm_ranked:
                    llm_ranked.append(it)
                if len(llm_ranked) >= req.final_k:
                    break
        pool = llm_ranked

    # Final cut
    final_items = pool[: req.final_k]
    # Ensure 'pos' is populated when missing (derive from id when numeric)
    norm_items = []
    for it in final_items:
        d = dict(it)
        if d.get("pos") is None and d.get("id") is not None:
            try:
                d["pos"] = int(d.get("id"))
            except Exception:
                pass
        norm_items.append(RecommendationItem(**d))
    return norm_items

