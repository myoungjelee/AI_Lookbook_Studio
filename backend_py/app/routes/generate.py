import base64
import io
import os
from datetime import datetime
from typing import Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException

from ..models import VirtualTryOnRequest, VirtualTryOnResponse
from ..services.gemini_image_service import gemini_image_service

router = APIRouter(prefix="/api/generate", tags=["VirtualTryOn"])


@router.get("/status")
def status():
    proxy_target = os.getenv("GENERATE_PROXY_TARGET")
    return {
        "available": True,
        "pythonGemini": {
            "available": gemini_image_service.available(),
            "model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash-image-preview"),
        },
        "proxy": {
            "target": proxy_target,
            "enabled": bool(proxy_target),
        },
        "config": {
            "timeout": int(os.getenv("GEMINI_TIMEOUT_MS", "30000")),
            "maxRetries": int(os.getenv("GEMINI_MAX_RETRIES", "3")),
        },
    }


def _compose_outfit_collage(items: Dict[str, Optional[Dict]]) -> Optional[str]:
    """Compose a simple collage image from clothing items when no person is provided.

    Returns a data URI string or None on failure.
    """
    try:
        from PIL import Image, ImageOps  # type: ignore
    except Exception as e:  # noqa: BLE001
        print(f"[generate] PIL not available for collage fallback: {e}")
        return None
    # Collect present images in display order (outer should be outermost)
    order = ["outer", "top", "pants", "shoes"]
    present: list[Image.Image] = []
    try:
        for key in order:
            f = items.get(key) or None
            if not f:
                continue
            b64 = f.get("base64") if isinstance(f, dict) else None  # type: ignore[assignment]
            _ = (f.get("mimeType") if isinstance(f, dict) else None) or "image/jpeg"
            if not b64:
                continue
            raw = base64.b64decode(b64)
            im = Image.open(io.BytesIO(raw)).convert("RGBA")
            # Best-effort normalize HEIC/AVIF already handled upstream; just continue
            present.append(im)
        if not present:
            return None

        n = len(present)
        # Canvas: square for 1, vertical stack for 2-3
        W = 1080
        H = 1080 if n == 1 else 1080 * n
        bg = Image.new("RGBA", (W, H), (255, 255, 255, 255))

        tile_h = H // n
        pad = 48
        for i, im in enumerate(present):
            box_w = W - pad * 2
            box_h = tile_h - pad * 2
            # Contain within the tile box
            fitted = ImageOps.contain(im, (box_w, box_h))
            # Center position
            x = (W - fitted.width) // 2
            y = i * tile_h + (tile_h - fitted.height) // 2
            # Use paste with alpha mask for broad Pillow compatibility
            bg.paste(fitted, (x, y), fitted)

        # Encode as PNG data URI
        out = io.BytesIO()
        bg.convert("RGBA").save(out, format="PNG")
        b64out = base64.b64encode(out.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64out}"
    except Exception as e:  # noqa: BLE001
        print(f"[generate] collage fallback error: {e}")
        return None


@router.post("")
def generate(req: VirtualTryOnRequest) -> VirtualTryOnResponse:
    # 디버깅: 요청 데이터 로그
    print("[generate] 요청 수신:")
    print(f"  - person: {'있음' if req.person else '없음'}")
    if req.clothingItems:
        print("  - clothingItems:")
        for key in ["top", "pants", "shoes", "outer"]:
            item = getattr(req.clothingItems, key, None)
            print(f"    - {key}: {'있음' if item else '없음'}")
            if item:
                print(
                    f"      - base64 길이: {len(item.base64) if hasattr(item, 'base64') else 'N/A'}"
                )
                print(f"      - mimeType: {getattr(item, 'mimeType', 'N/A')}")
    else:
        print("  - clothingItems: 없음")
    # Option A: Use native Python Gemini service if available
    if gemini_image_service.available():
        try:
            # 호환성: 혹시 클라이언트가 prprompt로 보낸 경우 대비
            user_prompt = getattr(req, "prompt", None) or getattr(req, "prprompt", None)

            # 디버깅: Gemini 서비스 호출 전 데이터 확인
            person_data = req.person.model_dump() if req.person else None
            clothing_data = req.clothingItems.model_dump() if req.clothingItems else {}
            print("[generate] Gemini 서비스 호출 데이터:")
            print(f"  - person: {'있음' if person_data else '없음'}")
            print(f"  - clothing_items: {clothing_data}")
            print(f"  - prompt: {user_prompt}")

            result = gemini_image_service.generate_virtual_try_on_image(
                person=person_data,
                clothing_items=clothing_data,
                prompt=(user_prompt or None),
            )
            if result:
                return VirtualTryOnResponse(
                    generatedImage=result,
                    requestId=f"req_{int(datetime.utcnow().timestamp())}",
                    timestamp=datetime.utcnow().isoformat() + "Z",
                )
            else:
                # No image returned: log and gracefully fall back
                print(
                    "[generate] Gemini returned no image; falling back to proxy/placeholder"
                )
        except Exception as e:
            # Log and fall back (do not surface 502 from this stage)
            print(f"[generate] Python Gemini error, falling back: {e}")

    # Option A1: If person is not provided, still attempt Gemini using prompt/clothing-only
    if gemini_image_service.available() and req.person is None:
        try:
            user_prompt = getattr(req, "prompt", None) or getattr(req, "prprompt", None)
            clothing_dict = req.clothingItems.model_dump() if req.clothingItems else {}
            result = gemini_image_service.generate_virtual_try_on_image(
                person=None,
                clothing_items=clothing_dict,
                prompt=(user_prompt or None),
            )
            if result:
                return VirtualTryOnResponse(
                    generatedImage=result,
                    requestId=f"req_{int(datetime.utcnow().timestamp())}",
                    timestamp=datetime.utcnow().isoformat() + "Z",
                )
        except Exception as e:
            print(f"[generate] person-less Gemini path failed: {e}")

    # Option A2: If no person provided, attempt local collage composition from clothing items
    if req.person is None and req.clothingItems:
        clothing = (
            req.clothingItems.model_dump()
            if hasattr(req.clothingItems, "model_dump")
            else dict(req.clothingItems)
        )
        # Require at least three items for person-less composition (ideal)
        present = [k for k in ("top", "pants", "shoes", "outer") if clothing.get(k)]
        present_count = len(present)
        print(f"[generate] no-person path: clothing present={present}")
        if present_count >= 3:
            collaged = _compose_outfit_collage(clothing)
            if collaged:
                return VirtualTryOnResponse(
                    generatedImage=collaged,
                    requestId=f"req_{int(datetime.utcnow().timestamp())}",
                    timestamp=datetime.utcnow().isoformat() + "Z",
                )
            else:
                print("[generate] collage failed, falling back to single item data URI")
        # Last-resort: return the first available clothing image as the result
        for k in ("top", "pants", "shoes", "outer"):
            f = clothing.get(k)
            if f and isinstance(f, dict) and f.get("base64"):
                mime = f.get("mimeType") or "image/jpeg"
                data_uri = f"data:{mime};base64,{f.get('base64')}"
                return VirtualTryOnResponse(
                    generatedImage=data_uri,
                    requestId=f"req_{int(datetime.utcnow().timestamp())}",
                    timestamp=datetime.utcnow().isoformat() + "Z",
                )

    # Option B: Proxy to existing Node backend if configured (recommended during migration)
    proxy_target = os.getenv("GENERATE_PROXY_TARGET")
    if proxy_target:
        try:
            url = proxy_target.rstrip("/") + "/api/generate"
            resp = httpx.post(url, json=req.model_dump(), timeout=60)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("generatedImage"):
                raise HTTPException(
                    status_code=502, detail="Proxy responded without generatedImage"
                )
            return VirtualTryOnResponse(
                generatedImage=data["generatedImage"],
                requestId=data.get("requestId"),
                timestamp=data.get("timestamp") or datetime.utcnow().isoformat() + "Z",
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Proxy error: {str(e)}")

    # Option C: Stub fallback
    placeholder = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
    )
    return VirtualTryOnResponse(
        generatedImage=placeholder,
        requestId=f"req_{int(datetime.utcnow().timestamp())}",
        timestamp=datetime.utcnow().isoformat() + "Z",
    )
