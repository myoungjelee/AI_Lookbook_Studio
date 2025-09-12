from __future__ import annotations

import os
from typing import Dict, List, Optional

import httpx


class ExternalRecommender:
    """
    Thin HTTP client for an external recommending service (e.g., recommending/back_example.py).

    Expects an environment variable RECOMMENDER_URL like:
      RECOMMENDER_URL=http://localhost:8081
    and the service to expose:
      GET /health
      GET /recommend?query_positions=1&query_positions=2&top_k=5&alpha=0.38&w1=0.97&w2=0.03
    """

    def __init__(self) -> None:
        self.base_url = os.getenv("RECOMMENDER_URL", "").rstrip("/")
        self.timeout = float(os.getenv("RECOMMENDER_TIMEOUT", "10"))

    def available(self) -> bool:
        if not self.base_url:
            return False
        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(f"{self.base_url}/health")
                r.raise_for_status()
                return True
        except Exception:
            return False

    def recommend_by_positions(
        self,
        positions: List[int],
        top_k: int = 5,
        alpha: float = 0.38,
        w1: float = 0.97,
        w2: float = 0.03,
    ) -> List[Dict]:
        if not self.base_url:
            raise RuntimeError("RECOMMENDER_URL is not configured")
        params: List[tuple[str, str]] = [("query_positions", str(p)) for p in positions]
        params += [("top_k", str(top_k)), ("alpha", str(alpha)), ("w1", str(w1)), ("w2", str(w2))]
        with httpx.Client(timeout=self.timeout) as client:
            r = client.get(f"{self.base_url}/recommend", params=params)
            r.raise_for_status()
            data = r.json()

        # Map external schema -> internal RecommendationItem-ish dict
        items: List[Dict] = []
        for row in data:
            # External fields: pos, Product_U, Product_Desc, Product_P, Category, score
            pos = row.get("pos")
            items.append({
                "id": str(pos) if pos is not None else "",
                "title": row.get("Product_Desc") or "",
                "price": int(row.get("Product_P") or 0),
                "tags": [],
                "category": str(row.get("Category") or "top"),
                "imageUrl": None,
                "productUrl": row.get("Product_U"),
                "score": float(row.get("score") or 0.0),
            })
        return items


external_recommender = ExternalRecommender()

