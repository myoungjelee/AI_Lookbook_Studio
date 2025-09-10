from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Dict, Any

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
                # Instruction in Korean with a clear 0-100 rubric to avoid fixed scores
                "패션 스타일리스트로서 간결한 한국어 팁을 제시하세요. 3~6개의 짧고 실행 가능한 팁을 생성하고,\n"
                "색 조합, 핏/실루엣, 비율(상·하의 길이/허리선), TPO(상황 적합성)를 고려해 ‘종합 점수’를 0~100 범위의 정수로 산출하세요.\n"
                "점수 산정 규칙(가이드):\n"
                "- 기준점 60에서 시작.\n"
                "- 색 조화/톤 정합성 +0~+20,\n"
                "- 핏/실루엣 일치 +0~+10,\n"
                "- 비율/프로포션 +0~+5,\n"
                "- 상황 적합성(occasion) +0~+5,\n"
                "- 색 충돌/로고 과다/노이즈 요소는 -0~-20 감점.\n"
                "최종 점수는 0~100 정수로 반올림/절삭하여 반환하세요. 소수점/기호(%) 없이.\n"
                "반환 형식은 JSON만 허용합니다: {\"tips\":[string,...], \"tone\":string?, \"occasion\":string?, \"score\": number }"
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


@router.get("/status")
def status():
    """Lightweight status endpoint to verify Azure GPT deployment wiring.

    Returns availability and configured deployment info without secrets.
    """
    return {
        "azure": {
            "available": azure_openai_service.available(),
            "deploymentId": getattr(azure_openai_service, "deployment_id", None),
            "apiVersion": getattr(azure_openai_service, "api_version", None),
            "usingSdk": azure_openai_service.client is not None,
            "endpoint": (getattr(azure_openai_service, "endpoint", None) or "").rstrip("/") if getattr(azure_openai_service, "endpoint", None) else None,
        }
    }


@router.post("")
def generate_style_tips(req: StyleTipsRequest) -> StyleTipsResponse:
    # Prefer Azure OpenAI if configured
    if not azure_openai_service.available():
        return _fallback_tips(req)

    def _call_chat(parts: List[Dict[str, Any]]) -> str:
        client = azure_openai_service.client
        # Start with configured temperature; some preview models only allow default (1)
        base_temp = getattr(azure_openai_service, "temperature", 0.2) or 0.2
        temperature = base_temp
        max_tokens = 300
        if client is not None:
            print("[tips] calling Azure Chat via SDK", flush=True)
            try:
                resp = client.chat.completions.create(
                    model=azure_openai_service.deployment_id,
                    messages=[{"role": "user", "content": parts}],
                    temperature=temperature,
                    max_completion_tokens=max_tokens,
                )
            except TypeError:
                resp = client.chat.completions.create(
                    model=azure_openai_service.deployment_id,
                    messages=[{"role": "user", "content": parts}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
            except Exception as e:
                # Retry without temperature if model rejects custom values
                msg = str(e).lower()
                print(f"[tips] SDK call failed: {e}", flush=True)
                try:
                    resp = client.chat.completions.create(
                        model=azure_openai_service.deployment_id,
                        messages=[{"role": "user", "content": parts}],
                        # omit temperature to use model default
                        max_completion_tokens=max_tokens,
                    )
                except TypeError:
                    resp = client.chat.completions.create(
                        model=azure_openai_service.deployment_id,
                        messages=[{"role": "user", "content": parts}],
                        max_tokens=max_tokens,
                    )
            return resp.choices[0].message.content or "{}"
        else:
            print("[tips] calling Azure Chat via HTTP", flush=True)
            import httpx
            endpoint = (azure_openai_service.endpoint or "").rstrip("/")
            url = f"{endpoint}/openai/deployments/{azure_openai_service.deployment_id}/chat/completions"
            params = {"api-version": azure_openai_service.api_version}
            headers = {"api-key": azure_openai_service.api_key or "", "content-type": "application/json"}
            # Prefer new param name for latest preview models
            payload = {"messages": [{"role": "user", "content": parts}], "temperature": temperature, "max_completion_tokens": max_tokens}
            with httpx.Client(timeout=20.0) as http:
                try:
                    r = http.post(url, params=params, headers=headers, json=payload)
                    r.raise_for_status()
                except httpx.HTTPStatusError as he:
                    body = he.response.text[:800] if he.response is not None else ""
                    print(f"[tips] HTTP error {he.response.status_code if he.response else '??'}: {body}", flush=True)
                    # If server complains about max_completion_tokens, retry with legacy max_tokens
                    if "max_completion_tokens" in body and "unsupported" in body.lower():
                        legacy_payload = {"messages": [{"role": "user", "content": parts}], "temperature": temperature, "max_tokens": max_tokens}
                        r = http.post(url, params=params, headers=headers, json=legacy_payload)
                        r.raise_for_status()
                    # If temperature unsupported, retry without temperature (use model default)
                    elif "temperature" in body.lower() and "unsupported" in body.lower():
                        payload_no_temp = {"messages": [{"role": "user", "content": parts}], "max_completion_tokens": max_tokens}
                        r = http.post(url, params=params, headers=headers, json=payload_no_temp)
                        r.raise_for_status()
                    else:
                        raise
                data = r.json()
                return (data.get("choices") or [{}])[0].get("message", {}).get("content", "{}")

    def _strip_images(parts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for p in parts:
            if p.get("type") == "text":
                out.append(p)
        return out if out else parts

    def _parse_json(text: str) -> Dict[str, Any]:
        import json as _json
        if "```" in text:
            chunk = text.split("```json")[-1].split("```")[0]
            if chunk.strip().startswith("{"):
                text = chunk
        start = text.find("{"); end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return _json.loads(text[start:end+1])
            except Exception:
                return {}
        return {}

    content = _build_content_for_llm(req)
    text: str = "{}"
    try:
        text = _call_chat(content)
    except Exception as e:
        print(f"[tips] first chat call failed: {e}", flush=True)
        # Always try a text-only retry if any image parts were present
        try:
            text = _call_chat(_strip_images(content))
            print("[tips] succeeded on text-only retry", flush=True)
        except Exception as e2:
            print(f"[tips] text-only retry failed: {e2}", flush=True)
            return _fallback_tips(req)

    obj = _parse_json(text)
    tips = [str(t).strip() for t in (obj.get("tips") or []) if str(t).strip()]
    # Try to coerce scores like "87%" or "87.0"
    score_val = obj.get("score")
    score_int = None
    if score_val is not None:
        try:
            score_int = int(str(score_val).strip().rstrip('%').split('.')[0])
            score_int = max(0, min(100, score_int))
        except Exception:
            score_int = None
    if not tips:
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
