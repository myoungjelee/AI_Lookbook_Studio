from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models import RecommendationItem
from ..services.external_recommender import external_recommender
from ..services.pos_recommender import get_pos_recommender
from ..services.db_recommender import db_pos_recommender


router = APIRouter(prefix="/api/recommend", tags=["Recommendations"])


class PositionsRequest(BaseModel):
    positions: List[int] = Field(..., description="Selected product positions (0-based)")
    top_k: int = Field(5, ge=1, le=50)
    alpha: float = Field(0.38, ge=0.0, le=10.0)
    w1: float = Field(0.97, ge=0.0, le=1.0)
    w2: float = Field(0.03, ge=0.0, le=1.0)


@router.post("/by-positions", response_model=List[RecommendationItem])
def recommend_by_positions(req: PositionsRequest) -> List[RecommendationItem]:
    # Prefer DB recommender if available, then file-based, then external
    if db_pos_recommender.available():
        try:
            items = db_pos_recommender.recommend(
                positions=req.positions,
                top_k=req.top_k,
                alpha=req.alpha,
                w1=req.w1,
                w2=req.w2,
            )
            return [RecommendationItem(**it) for it in items]
        except Exception as e:
            # fall through to file/external
            pass

    # Prefer internal (file-based) recommender when available
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
            return [RecommendationItem(**it) for it in items]
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
                    return [RecommendationItem(**it) for it in items]
                except Exception as e2:
                    raise HTTPException(status_code=500, detail=str(e2))
            raise HTTPException(status_code=500, detail=str(e))

    # If internal not available, try external
    if external_recommender.available():
        try:
            items = external_recommender.recommend_by_positions(
                positions=req.positions,
                top_k=req.top_k,
                alpha=req.alpha,
                w1=req.w1,
                w2=req.w2,
            )
            return [RecommendationItem(**it) for it in items]
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    raise HTTPException(status_code=503, detail="No recommender available (internal/external)")

