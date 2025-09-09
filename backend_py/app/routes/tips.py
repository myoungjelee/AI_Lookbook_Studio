from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Dict

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..models import ApiFile, ClothingItems
from ..services.azure_openai_service import azure_openai_service


router = APIRouter(prefix="/api/tips", tags=["StyleTips"])


class StyleTipsOptions(BaseModel):
    tone: Optional[str] = Field(default=None, description="warm|cool|neutral 등 사용자 톤")
    occasion: Optional[str] = Field(default=None, description="e.g., casual, office, date")
    maxTips: int = Field(default=5, ge=1, le=8)


class StyleTipsRequest(BaseModel):
    # One of the following sources
    generatedImage: Optional[str] = None  # data URI
    person: Optional[ApiFile] = None
    clothingItems: Optional[ClothingItems] = None
    historyImages: Optional[List[str]] = None  # optional: 최근 히스토리 이미지 배열 (data URI)
    options: Optional[StyleTipsOptions] = None


class StyleTipsResponse(BaseModel):
    tips: List[str]
    tone: Optional[str] = None
    occasion: Optional[str] = None
    source: str  # ai | fallback
    requestId: str
    timestamp: str
    score: Optional[int] = None  # 0..100


def _fallback_tips(req: StyleTipsRequest) -> StyleTipsResponse:
    # 단순 휴리스틱: 이미지/톤/상황 유무에 따라 무난한 팁 생성
    tone = req.options.tone if req.options else None
    occasion = req.options.occasion if req.options else None
    base: List[str] = [
        "하의/상의 명도 대비를 1단계 이상 두어 실루엣을 분리해 주세요.",
        "신발 색을 상의/액세서리 중 하나와 맞추면 안정감이 생깁니다.",
        "로고나 프린트가 강한 아이템은 1개만 포인트로 사용하세요.",
    ]
    if tone == "warm":
        base.append("웜톤에는 베이지·브라운·올리브 계열이 안정적입니다.")
    elif tone == "cool":
        base.append("쿨톤에는 네이비·그레이·블랙 기반에 한 가지 포인트 컬러를 더해보세요.")
    if occasion == "office":
        base.append("오피스 룩은 2~3색 내로 제한하고 광택 소재는 최소화하세요.")
    elif occasion == "date":
        base.append("데이트 룩은 상의에 밝은 톤을 두고 하의는 뉴트럴 톤으로 균형을 잡아보세요.")

    # basic heuristic score around 78 with tiny adjustments
    score = 78
    if tone in {"warm", "cool"}:
        score += 2
    if occasion in {"office", "date"}:
        score += 2
    score = max(50, min(95, score))

    now = datetime.utcnow().isoformat() + "Z"
    return StyleTipsResponse(
        tips=base[: (req.options.maxTips if req.options else 5)],
        tone=tone,
        occasion=occasion,
        source="fallback",
        requestId=f"tips_{int(datetime.utcnow().timestamp())}",
        timestamp=now,
        score=score,
    )


def _build_content_for_llm(req: StyleTipsRequest) -> List[Dict]:
    content: List[Dict] = [
        {
            "type": "text",
            "text": (
                "You are a concise stylist. Generate 3-6 SHORT, actionable style tips in Korean.\n"
                "Focus on color pairing, fit/silhouette, proportion, and occasion.\n"
                "Also provide an overall AI score as an integer 0-100 summarizing outfit quality.\n"
                "Return ONLY JSON: {\"tips\":[string,...], \"tone\":string?, \"occasion\":string?, \"score\": number }."
            ),
        }
    ]
    if req.options and (req.options.tone or req.options.occasion):
        content.append({
            "type": "text",
            "text": f"CONTEXT: tone={req.options.tone or ''} occasion={req.options.occasion or ''}",
        })
    # Prefer the latest generated image if provided; otherwise include up to 2 history images
    def add_image(data_uri: Optional[str]):
        if data_uri:
            content.append({"type": "image_url", "image_url": {"url": data_uri, "detail": "high"}})

    if req.generatedImage:
        add_image(req.generatedImage)
    else:
        if req.historyImages:
            for u in req.historyImages[:2]:
                add_image(u)
    # If person/clothing items are provided, attach them too
    def to_image_part(file_obj: Optional[ApiFile]):
        if not file_obj:
            return
        if not file_obj.base64:
            return
        mime = file_obj.mimeType or "image/jpeg"
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{file_obj.base64}", "detail": "high"},
        })

    if req.person:
        to_image_part(req.person)
    if req.clothingItems:
        to_image_part(req.clothingItems.top)
        to_image_part(req.clothingItems.pants)
        to_image_part(req.clothingItems.shoes)

    return content


@router.post("")
def generate_style_tips(req: StyleTipsRequest) -> StyleTipsResponse:
    # Prefer Azure OpenAI if configured
    if not azure_openai_service.available():
        return _fallback_tips(req)

    content = _build_content_for_llm(req)
    try:
        client = azure_openai_service.client
        temperature = 0.2
        max_tokens = 300
        if client is not None:
            resp = client.chat.completions.create(
                model=azure_openai_service.deployment_id,
                messages=[{"role": "user", "content": content}],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            text = resp.choices[0].message.content or "{}"
        else:
            # HTTP fallback
            import httpx

            url = f"{azure_openai_service.endpoint}/openai/deployments/{azure_openai_service.deployment_id}/chat/completions"
            params = {"api-version": azure_openai_service.api_version}
            headers = {"api-key": azure_openai_service.api_key or "", "content-type": "application/json"}
            payload = {"messages": [{"role": "user", "content": content}], "temperature": temperature, "max_tokens": max_tokens}
            with httpx.Client(timeout=20.0) as http:
                r = http.post(url, params=params, headers=headers, json=payload)
                r.raise_for_status()
                data = r.json()
                text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "{}")

        # Extract JSON safely
        import json as _json

        if "```" in text:
            chunk = text.split("```json")[-1].split("```")[0]
            text = chunk if chunk.strip().startswith("{") else text
        # tolerate extra text
        start = text.find("{")
        end = text.rfind("}")
        obj: Dict = {}
        if start != -1 and end != -1 and end > start:
            obj = _json.loads(text[start : end + 1])
        tips = [str(t).strip() for t in (obj.get("tips") or []) if str(t).strip()]
        score_val = obj.get("score")
        try:
            score_int = None if score_val is None else int(score_val)
        except Exception:
            score_int = None
        if score_int is not None:
            score_int = max(0, min(100, score_int))
        if not tips:
            # fall back softly
            return _fallback_tips(req)

        now = datetime.utcnow().isoformat() + "Z"
        return StyleTipsResponse(
            tips=tips[: (req.options.maxTips if req.options else 5)],
            tone=(obj.get("tone") or (req.options.tone if req.options else None)),
            occasion=(obj.get("occasion") or (req.options.occasion if req.options else None)),
            source="ai",
            requestId=f"tips_{int(datetime.utcnow().timestamp())}",
            timestamp=now,
            score=score_int,
        )
    except Exception:
        return _fallback_tips(req)
