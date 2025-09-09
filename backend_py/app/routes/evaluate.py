from __future__ import annotations

from datetime import datetime
from typing import List, Dict, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services.azure_openai_service import azure_openai_service


router = APIRouter(prefix="/api/evaluate", tags=["OutfitEvaluate"])


class EvaluateOptions(BaseModel):
    occasion: Optional[str] = Field(default=None, description="e.g., casual, office, date, interview")
    tone: Optional[str] = Field(default=None, description="warm|cool|neutral")
    style: Optional[str] = Field(default=None, description="keywords like minimal, street, classic")


class EvaluateRequest(BaseModel):
    images: List[str]  # data URIs of generated results
    options: Optional[EvaluateOptions] = None


class EvaluationItem(BaseModel):
    index: int
    score: int  # 0..100
    reasoning: Optional[str] = None


class EvaluateResponse(BaseModel):
    results: List[EvaluationItem]
    source: str  # ai|fallback
    requestId: str
    timestamp: str


@router.post("")
def evaluate_outfits(req: EvaluateRequest) -> EvaluateResponse:
    imgs = [u for u in (req.images or []) if isinstance(u, str) and u.strip().startswith("data:")]
    if not imgs:
        return EvaluateResponse(
            results=[],
            source="fallback",
            requestId=f"eval_{int(datetime.utcnow().timestamp())}",
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    if not azure_openai_service.available():
        # simple fallback: middle score with slight decay by order
        base = 80
        out = [EvaluationItem(index=i, score=max(50, base - i * 3), reasoning=None) for i in range(len(imgs))]
        return EvaluateResponse(
            results=out,
            source="fallback",
            requestId=f"eval_{int(datetime.utcnow().timestamp())}",
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    # Build vision chat prompt
    content: List[Dict] = [
        {
            "type": "text",
            "text": (
                "You are a fashion stylist. Evaluate each outfit IMAGE independently. "
                "Score 0-100 (integer) for OVERALL OUTFIT QUALITY considering color harmony, fit/silhouette, proportion, and occasion suitability. "
                "Keep face identity and background irrelevant for the score. "
                "Return ONLY JSON as {\"results\":[{\"index\":number,\"score\":number,\"reasoning\":string}...]}."
            ),
        }
    ]
    if req.options and (req.options.occasion or req.options.tone or req.options.style):
        content.append({
            "type": "text",
            "text": f"CONTEXT: occasion={req.options.occasion or ''} tone={req.options.tone or ''} style={req.options.style or ''}",
        })
    for u in imgs:
        content.append({"type": "image_url", "image_url": {"url": u, "detail": "high"}})

    try:
        client = azure_openai_service.client
        temperature = 0.1
        max_tokens = 400
        if client is not None:
            resp = client.chat.completions.create(
                model=azure_openai_service.deployment_id,
                messages=[{"role": "user", "content": content}],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            text = resp.choices[0].message.content or "{}"
        else:
            import httpx

            url = f"{azure_openai_service.endpoint}/openai/deployments/{azure_openai_service.deployment_id}/chat/completions"
            params = {"api-version": azure_openai_service.api_version}
            headers = {"api-key": azure_openai_service.api_key or "", "content-type": "application/json"}
            payload = {"messages": [{"role": "user", "content": content}], "temperature": temperature, "max_tokens": max_tokens}
            with httpx.Client(timeout=25.0) as http:
                r = http.post(url, params=params, headers=headers, json=payload)
                r.raise_for_status()
                data = r.json()
                text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "{}")

        # Extract JSON
        if "```" in text:
            chunk = text.split("```json")[-1].split("```")[0]
            text = chunk if chunk.strip().startswith("{") else text
        import json as _json
        start = text.find("{"); end = text.rfind("}")
        obj: Dict = {}
        if start != -1 and end != -1 and end > start:
            obj = _json.loads(text[start : end + 1])
        arr = obj.get("results") or []
        results: List[EvaluationItem] = []
        for i, item in enumerate(arr):
            try:
                idx = int(item.get("index", i))
                score = int(item.get("score", 70))
                score = max(0, min(100, score))
                reasoning = str(item.get("reasoning")) if item.get("reasoning") is not None else None
                results.append(EvaluationItem(index=idx, score=score, reasoning=reasoning))
            except Exception:
                pass
        if not results:
            results = [EvaluationItem(index=i, score=70, reasoning=None) for i in range(len(imgs))]

        return EvaluateResponse(
            results=results,
            source="ai",
            requestId=f"eval_{int(datetime.utcnow().timestamp())}",
            timestamp=datetime.utcnow().isoformat() + "Z",
        )
    except Exception:
        out = [EvaluationItem(index=i, score=75, reasoning=None) for i in range(len(imgs))]
        return EvaluateResponse(
            results=out,
            source="fallback",
            requestId=f"eval_{int(datetime.utcnow().timestamp())}",
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

