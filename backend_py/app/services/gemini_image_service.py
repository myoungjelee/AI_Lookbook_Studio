from __future__ import annotations

import base64
import io
import os
import time
from typing import Any, Dict, List, Optional, Tuple


def _get_env(name: str, default: str | None = None) -> str:
    # Support both GEMINI_API_KEY and API_KEY for parity with Node code
    if name == "GEMINI_API_KEY":
        return os.getenv("GEMINI_API_KEY") or os.getenv("API_KEY") or (default or "")
    # Standard env with fallback to default or empty string
    return os.getenv(name) or (default or "")


class GeminiImageService:
    """
    Google Gemini image generation (virtual try-on) for Python.

    - Prefers the new `google-genai` client (`from google import genai`).
    - Falls back to legacy `google.generativeai` if available.
    - If no client is available, `available()` returns False.

    Env vars:
      GEMINI_API_KEY or API_KEY
      GEMINI_API_KEYS (optional, comma/semicolon/space-separated)
      GEMINI_MODEL (default: gemini-2.5-flash-image-preview)
      GEMINI_TIMEOUT_MS (default: 30000)
      GEMINI_MAX_RETRIES (default: 3)
      GEMINI_TEMPERATURE (default: 1.0)
      GEMINI_FIXED_PROMPT (optional baseline prompt)
    """

    def __init__(self) -> None:
        # Support multiple keys via GEMINI_API_KEYS (comma/semicolon/space-separated)
        multi = _get_env("GEMINI_API_KEYS")
        if multi:
            toks = [
                t.strip()
                for t in str(multi).replace(";", ",").replace(" ", ",").split(",")
                if t and t.strip()
            ]
            self.api_keys: List[str] = toks
        else:
            single = _get_env("GEMINI_API_KEY")
            if single:
                self.api_keys = [single]
            else:
                alt = _get_env("API_KEY")
                self.api_keys = [alt] if alt else []

        # Keep the first key as current for status reporting
        self.api_key: Optional[str] = self.api_keys[0] if self.api_keys else None
        self.model: str = _get_env(
            "GEMINI_MODEL", "gemini-2.5-flash-image-preview"
        )  # noqa: E501
        self.timeout_ms: int = int(_get_env("GEMINI_TIMEOUT_MS", "30000") or 30000)
        self.max_retries: int = int(_get_env("GEMINI_MAX_RETRIES", "3") or 3)
        # Unified temperature: single source of truth (default 1.0)
        self.temperature: float = float(_get_env("GEMINI_TEMPERATURE", "1") or 1)
        # Fixed(기본) 프롬프트: 사용자 프롬프트가 비었을 때 사용하고, 있으면 먼저 baseline으로 붙입니다.
        self.fixed_prompt: str = _get_env("GEMINI_FIXED_PROMPT")

        self._new_client = None  # type: ignore[var-annotated]
        self._legacy_model = None  # type: ignore[var-annotated]

        # Lazy import to avoid hard dependency during setup
        self._new_genai = None
        self._legacy_genai = None
        try:
            from google import genai as _new_genai  # type: ignore

            self._new_genai = _new_genai
        except Exception:
            self._new_genai = None
        try:
            import google.generativeai as _legacy_genai  # type: ignore

            self._legacy_genai = _legacy_genai
        except Exception:
            self._legacy_genai = None

    # ------------------------------- public API ------------------------------- #
    def available(self) -> bool:
        return bool(self.api_keys and (self._new_genai or self._legacy_genai))

    def generate_virtual_try_on_image(
        self,
        person: Optional[Dict] = None,
        clothing_items: Dict | None = None,
        prompt: Optional[str] = None,
    ) -> Optional[str]:
        """
        Returns a data URI (e.g., 'data:image/png;base64,....') of the generated image
        or None if generation succeeded but no image was returned.
        Raises on configuration or API errors.
        """
        if not self.available():
            raise RuntimeError(
                "Gemini service is not available (missing API key or client library)"
            )

        # Allow person-less generation (text-only or clothing-only) by relaxing validation
        if person is not None:
            if not person.get("base64") or not person.get("mimeType"):
                raise ValueError(
                    "Person image requires base64 and mimeType when provided"
                )

        clothing_items = clothing_items or {}
        parts = self._build_parts(person, clothing_items, prompt)

        last_error: Optional[Exception] = None
        # Iterate keys with per-key retries
        for key in self.api_keys:
            for attempt in range(1, self.max_retries + 1):
                try:
                    if self._new_genai:
                        image_data_uri = self._call_new_genai(parts, key)
                    else:
                        image_data_uri = self._call_legacy_genai(parts, key)
                    return image_data_uri
                except Exception as e:  # noqa: BLE001
                    last_error = e
                    # If this looks like an invalid API key, try next key immediately
                    msg = str(e).lower()
                    if (
                        "api key not valid" in msg
                        or "api_key_invalid" in msg
                        or "invalid api key" in msg
                    ):
                        break  # move to next key
                    if attempt < self.max_retries:
                        time.sleep(2**attempt)
            # next key
        # Exhausted keys / retries
        assert last_error is not None
        raise last_error

    # ----------------------------- internal helpers --------------------------- #
    def _build_parts(
        self, person: Optional[Dict], clothing_items: Dict, prompt: Optional[str]
    ) -> List[Dict[str, Any]]:
        parts: List[Dict[str, Any]] = []

        # Baseline 고정 프롬프트 먼저 추가, 사용자 프롬프트가 있으면 이어붙임
        if getattr(self, "fixed_prompt", None) and str(self.fixed_prompt).strip():
            parts.append({"text": str(self.fixed_prompt).strip()})
        if prompt and str(prompt).strip():
            parts.append({"text": str(prompt).strip()})

        # Person image (optional) with minimal role hint
        if person is not None:
            p_b64, p_mime = self._normalize_image(
                person.get("base64"), person.get("mimeType")
            )
            parts.append(
                {"text": "BASE PERSON: keep same person and face; keep background."}
            )
            parts.append(
                {
                    "inline_data": {
                        "data": p_b64,
                        "mime_type": p_mime,
                    }
                }
            )

        # Clothing images
        has_any_clothing = False
        for key in ("top", "pants", "shoes", "outer"):
            item = clothing_items.get(key)
            if item and item.get("base64"):
                b64, mime = self._normalize_image(
                    item.get("base64"), item.get("mimeType")
                )
                # Minimal role hint per garment image
                parts.append(
                    {
                        "text": f"GARMENT {key}: clothing only; ignore person and background."
                    }
                )
                parts.append(
                    {
                        "inline_data": {
                            "data": b64,
                            "mime_type": mime,
                        }
                    }
                )
                has_any_clothing = True

        # Allow text-only generation when neither person nor clothing is present

        return parts

    def _call_new_genai(self, parts: List[Dict[str, Any]], key: str) -> Optional[str]:
        # New client: from google import genai
        # Recreate client per-call to ensure session isolation; do not retain client across calls
        client = self._new_genai.Client(api_key=key)  # type: ignore[attr-defined]

        # Convert any base64 strings to raw bytes for the new SDK
        norm_parts: List[Dict[str, Any]] = []
        for p in parts:
            if "inline_data" in p and isinstance(p["inline_data"], dict):
                mime = p["inline_data"].get("mime_type", "image/jpeg")
                data = p["inline_data"].get("data")
                if isinstance(data, str):
                    try:
                        data_bytes = base64.b64decode(data)
                    except Exception:
                        data_bytes = b""
                else:
                    data_bytes = data or b""
                norm_parts.append(
                    {"inline_data": {"data": data_bytes, "mime_type": mime}}
                )
            else:
                # text parts or others as-is
                norm_parts.append(p)

        try:
            # The new API mirrors Node but uses snake_case fields
            resp = client.models.generate_content(
                model=self.model,
                contents=[{"role": "user", "parts": norm_parts}],
                config={
                    "response_modalities": ["IMAGE"],
                    "temperature": self.temperature,
                },
            )
            return self._extract_image_from_response(resp)
        finally:
            # Explicitly drop reference to avoid any implicit session reuse
            try:
                del client
            except Exception:
                pass
            self._new_client = None

    def _call_legacy_genai(
        self, parts: List[Dict[str, Any]], key: str
    ) -> Optional[str]:
        # Legacy client: import google.generativeai as genai
        # Configure per-call; avoid retaining model across calls
        self._legacy_genai.configure(api_key=key)  # type: ignore[attr-defined]
        model = self._legacy_genai.GenerativeModel(self.model)  # type: ignore[attr-defined]

        # Convert to legacy-friendly inputs: list where inline_data -> dict with mime_type, data
        legacy_inputs: List[Any] = []
        for p in parts:
            if "text" in p:
                legacy_inputs.append(p["text"])  # plain string is accepted
            elif "inline_data" in p:
                legacy_inputs.append(
                    {
                        "mime_type": p["inline_data"].get("mime_type", "image/jpeg"),
                        "data": p["inline_data"].get("data"),
                    }
                )

        try:
            try:
                resp = model.generate_content(  # type: ignore[assignment]
                    legacy_inputs,
                    generation_config={"temperature": self.temperature},
                )
            except TypeError:
                # For older SDKs without generation_config support
                resp = model.generate_content(legacy_inputs)
            return self._extract_image_from_response(resp)
        finally:
            # Explicitly drop reference to avoid any implicit session reuse
            try:
                del model
            except Exception:
                pass
            self._legacy_model = None

    @staticmethod
    def _extract_image_from_response(resp: Any) -> Optional[str]:
        # Try new/legacy response shapes defensively
        try:
            candidates = getattr(resp, "candidates", None) or resp.get("candidates")  # type: ignore[union-attr]
            if not candidates:
                return None
            content = getattr(candidates[0], "content", None) or candidates[0].get(
                "content"
            )
            if not content:
                return None
            parts = getattr(content, "parts", None) or content.get("parts")
            if not parts:
                return None
            for part in parts:
                # New client returns dict-like objects with inline_data
                inline = getattr(part, "inline_data", None) or part.get("inline_data")
                if inline and (
                    getattr(inline, "data", None)
                    or (isinstance(inline, dict) and inline.get("data"))
                ):
                    raw = (
                        inline.get("data")
                        if isinstance(inline, dict)
                        else getattr(inline, "data")
                    )
                    mime = (
                        inline.get("mime_type")
                        if isinstance(inline, dict)
                        else getattr(inline, "mime_type", "image/png")
                    )
                    if isinstance(raw, (bytes, bytearray)):
                        b64 = base64.b64encode(raw).decode("ascii")
                    else:
                        # assume already base64 string
                        b64 = str(raw)
                    return f"data:{mime};base64,{b64}"
            return None
        except Exception:
            return None

    # --------------------------- prompt helpers ------------------------------ #
    @staticmethod
    def _normalize_image(b64: Optional[str], mime: Optional[str]) -> Tuple[str, str]:
        """Ensure image MIME is supported by Gemini; convert AVIF/HEIC to PNG.

        Expects bare base64 (without data: prefix).
        Returns tuple of (base64, mime).
        """
        if not b64:
            raise ValueError("Image base64 is required")
        m = (mime or "image/jpeg").lower()
        supported = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        if m in supported:
            return b64, m

        # Convert problematic formats
        if m in {"image/avif", "image/heic", "image/heif"}:
            from PIL import Image  # type: ignore

            raw = base64.b64decode(b64)
            # Try pillow-heif first (robust AVIF/HEIC decoder)
            try:
                import pillow_heif  # type: ignore

                pillow_heif.register_heif_opener()
                im = Image.open(io.BytesIO(raw))
            except Exception:
                # Fallback to pillow-avif-plugin if available
                try:
                    import pillow_avif  # type: ignore  # noqa: F401

                    im = Image.open(io.BytesIO(raw))
                except Exception as e:
                    raise RuntimeError(
                        "Unsupported MIME type {}. Install pillow-heif (preferred) or pillow-avif-plugin to enable conversion, or upload PNG/JPEG/WebP/GIF.".format(
                            m
                        )
                    ) from e

            # Normalize mode for PNG
            if im.mode in ("P", "LA"):
                im = im.convert("RGBA")
            elif im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGB")
            out = io.BytesIO()
            im.save(out, format="PNG")
            out_b64 = base64.b64encode(out.getvalue()).decode("ascii")
            return out_b64, "image/png"

        # Fallback: unknown type, keep data but relabel to jpeg to attempt best-effort
        return b64, "image/jpeg"

    # --------------------------- prompt helpers (v2) ------------------------- #
    @staticmethod
    def _safety_directives_v2() -> str:
        return ""
        return "\n".join(
            [
                "CRITICAL SAFETY & CONSISTENCY DIRECTIVES:",
                "- The FIRST image is the definitive base for the PERSON’s facial identity, background, perspective, and lighting.",
                "- The face in the FIRST image must be preserved pixel-for-pixel, with absolutely no changes, retouching, or landmark adjustments.",
                "- No smoothing, beautification, or expression change is allowed.",
                "- The output must look indistinguishable from a real photo, as if only the clothing was changed in the original environment.",
                "- Background, shadows, and natural skin textures must be maintained exactly.",
                "- Remove all backgrounds from clothing product images; only segment the garment(s)—ignore any mannequin/person.",
                "- Fit each garment naturally to the body and pose, preserving original occlusion (e.g., arms/hands in front stay in front).",
                "- No text, logo, watermark, or accessories should be added/removed.",
                "- If there is any conflict, facial identity takes absolute priority.",
            ]
        )

    @staticmethod
    def _build_prompt_v2(clothing_pieces: List[str]) -> str:
        return ""
        return (
            "CRITICAL SAFETY & CONSISTENCY DIRECTIVES:\n\n"
            "The FIRST image is the definitive base for the person’s facial identity, background, perspective, and lighting.\n"
            "FACE PIXEL LOCK: Preserve the same face pixel-for-pixel — no changes, retouching, beautification, color shift, or landmark adjustments.\n"
            "The HEAD MUST REMAIN FULLY VISIBLE; do not crop above the forehead or remove/replace the head. Hair length/style/hairline must remain unchanged.\n"
            "The output must look indistinguishable from a real photo, as if only the clothing was changed in the original environment.\n"
            "Background, shadows, and natural skin textures must be maintained exactly.\n"
            "From each clothing product image: REMOVE background and ANY person/face/hair/skin; segment the garment ONLY.\n"
            "Fit each garment naturally to the body and pose, preserving original occlusion (e.g., arms/hands in front stay in front).\n"
            "No text, logo, watermark, or accessories should be added/removed.\n"
            "If there is any conflict, facial identity takes absolute priority.\n"
            "TASK (for realistic online fashion try-on):\n"
            "Step 1: Extract only the garments from product photos, ignoring all background and mannequins.\n"
            "Step 2: Seamlessly fit all garments to the PERSON’s body in the FIRST image, matching pose, proportions, and natural wrinkles/shading. Do not alter the head, face, or hair.\n"
            "Step 3: Ensure the output matches the original scene/framing, preserving environment and lighting.\n"
        )

    @staticmethod
    def _safety_directives() -> str:
        return ""
        return "\n".join(
            [
                "CRITICAL SAFETY AND CONSISTENCY DIRECTIVES:",
                "- The FIRST image MUST be used as the definitive source for the person's face and overall appearance.",
                "- ABSOLUTELY NO re-synthesis, redrawing, retouching, or alteration of the person's face is permitted.",
                "- The person's face, including but not limited to: facial structure, landmarks, skin texture, pores, moles, scars, facial hair (if any), hairline, eye shape, nose shape, mouth shape, and expression, MUST remain IDENTICAL and UNCHANGED.",
                "- Preserve the EXACT facial identity. NO beautification, smoothing, makeup application, or landmark adjustments.",
                "- DO NOT CHANGE THE PERSON'S FACE SHAPE OR FACIAL STRUCTURE.",
                "- Maintain the background, perspective, and lighting IDENTICALLY to the original person image.",
                "- REPLACE existing garments with the provided clothing: top replaces top layer, pants replace pants, shoes replace shoes.",
                "- Remove/ignore backgrounds from clothing product photos; segment garment only (no mannequin or logos).",
                "- Fit garments to the person's pose with correct scale/rotation/warping; align perspective and seams.",
                "- Respect occlusion: body parts (e.g., crossed arms/hands) naturally occlude garments when in front.",
                "- Ensure the ENTIRE PERSON is visible; garments must cover appropriate regions (top on torso/arms, pants on legs to ankles, shoes on feet).",
                "- Do NOT add or remove accessories or objects. No text, logos, or watermarks.",
                "- Treat the face region as STRICTLY PIXEL-LOCKED: identity-specific details MUST remain unchanged and untouched.",
                "- If any instruction conflicts with another, the preservation of the person's facial identity and the integrity of the face shape are the ABSOLUTE HIGHEST PRIORITIES.",
            ]
        )

    @staticmethod
    def _build_prompt(clothing_pieces: List[str]) -> str:
        """Single consolidated prompt used for generation (safety + task)."""
        return ""
        safety = "\n".join(
            [
                "CRITICAL SAFETY AND CONSISTENCY DIRECTIVES:",
                "- The FIRST image MUST be used as the base and definitive source for the person's identity and appearance.",
                "- FACE PIXEL LOCK: The face region from the FIRST image must be preserved PIXEL-FOR-PIXEL with ZERO changes.",
                "- Absolutely NO re-synthesis, redraw, retouch, beautification, color shift, smoothing, makeup, or landmark/shape adjustments to the face.",
                "- Preserve facial structure, landmarks, skin texture, pores, moles, scars, facial hair (if any), hairline, eye shape, nose shape, mouth shape, expression, skin tone, and lighting EXACTLY.",
                "- Do NOT crop out the head; keep the full head visible as in the FIRST image.",
                "- Clothing product photos may contain people or mannequins. IGNORE any person/skin/face/limbs from clothing photos; extract GARMENTS ONLY.",
                "- Remove backgrounds from clothing photos; segment garments only (no mannequin, no body parts, no logos, no watermarks).",
                "- Replace existing garments with the provided ones: top replaces top layer, pants replace pants, shoes replace shoes.",
                "- Fit garments to the person's pose with correct scale/rotation/warping; align perspective and seams; respect occlusion (hands/arms in front remain in front).",
                "- Maintain the original background, camera perspective, body shape, and scene lighting from the FIRST image.",
                "- Do NOT add or remove accessories or objects. No text, no extra graphics.",
                "- If any instruction conflicts with another, preserving the face from the FIRST image is the HIGHEST PRIORITY and MUST NOT be violated.",
                "- If preserving the face is not possible, return the same face unmodified and only change the garments.",
            ]
        )

        items = ", ".join(clothing_pieces)
        task = (
            "TASK:\n"
            "Use the FIRST image as the base. Remove backgrounds from the clothing product photos and extract ONLY the garments (no model body). "
            "Replace the person's garments with the provided items: top→torso/arms, pants→legs to ankles, shoes→feet. "
            f"Output a single photorealistic image of the SAME person wearing: {items}. "
            "Fit garments to the person's pose with correct scale/rotation/warping; match perspective and seam alignment; preserve wrinkles and natural shading. "
            "Handle occlusion correctly (e.g., crossed arms remain in front of the top where appropriate). "
            "Keep lighting and shadows consistent. Preserve the face and body shape EXACTLY as in the FIRST image. Do not alter the face. No text, logos, or watermarks."
        )
        return f"{safety}\n\n{task}"


gemini_image_service = GeminiImageService()
