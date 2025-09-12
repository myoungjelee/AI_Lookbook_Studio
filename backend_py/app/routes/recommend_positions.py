from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models import RecommendationItem
from ..services.external_recommender import external_recommender


router = APIRouter(prefix="/api/recommend", tags=["Recommendations"])


class PositionsRequest(BaseModel):
    positions: List[int] = Field(..., description="Selected product positions (0-based)")
    top_k: int = Field(5, ge=1, le=50)
    alpha: float = Field(0.38, ge=0.0, le=10.0)
    w1: float = Field(0.97, ge=0.0, le=1.0)
    w2: float = Field(0.03, ge=0.0, le=1.0)


@router.post("/by-positions", response_model=List[RecommendationItem])
def recommend_by_positions(req: PositionsRequest) -> List[RecommendationItem]:
    if not external_recommender.available():
        raise HTTPException(status_code=503, detail="External recommender unavailable")
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

