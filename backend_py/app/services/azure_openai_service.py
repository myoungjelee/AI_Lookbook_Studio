from __future__ import annotations

import json
import os
from typing import Dict, List, Optional
import httpx

try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None  # type: ignore


class AzureOpenAIService:
    """Azure OpenAI helper for style analysis.

    Reads configuration from env:
      AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT_ID, AZURE_OPENAI_API_VERSION
    """

    def __init__(self) -> None:
        self.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.api_key = os.getenv("AZURE_OPENAI_KEY")
        self.deployment_id = os.getenv("AZURE_OPENAI_DEPLOYMENT_ID", "gpt-4o")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
        self.temperature = float(os.getenv("AZURE_OPENAI_TEMPERATURE", "0.1"))
        self.max_tokens = int(os.getenv("AZURE_OPENAI_MAX_TOKENS", "500"))

        self.client: Optional[OpenAI] = None
        self._http_fallback: bool = False
        if self.endpoint and self.api_key:
            if OpenAI is not None:
                try:
                    # Prefer SDK when available
                    self.client = OpenAI(
                        api_key=self.api_key,
                        base_url=f"{self.endpoint}/openai/deployments/{self.deployment_id}",
                        default_query={"api-version": self.api_version},
                        default_headers={"api-key": self.api_key},
                    )
                except Exception:
                    # If SDK import/runtime fails (e.g., missing binary deps on Windows), fall back to raw HTTP
                    self.client = None
                    self._http_fallback = True
            else:
                # No SDK -> use HTTP directly
                self._http_fallback = True

    def available(self) -> bool:
        return (self.client is not None) or self._http_fallback

    # ----------------------------- public API ----------------------------- #
    def analyze_style_from_images(self, person: Optional[Dict], clothing_items: Optional[Dict]) -> Dict:
        if not self.available():
            raise RuntimeError("Azure OpenAI is not configured")

        content: List[Dict] = [
            {"type": "text", "text": self._style_prompt()},
        ]

        def to_image_part(file_obj: Dict) -> Optional[Dict]:
            if not file_obj:
                return None
            base64 = file_obj.get("base64")
            mime = file_obj.get("mimeType") or "image/jpeg"
            if not base64:
                return None
            return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64}", "detail": "high"}}

        if person:
            part = to_image_part(person)
            if part:
                content.append(part)

        if clothing_items:
            for v in clothing_items.values():
                part = to_image_part(v)
                if part:
                    content.append(part)

        return self._chat_to_json(content)

    def analyze_virtual_try_on(self, generated_image_data_uri: str) -> Dict:
        if not self.available():
            raise RuntimeError("Azure OpenAI is not configured")
        content: List[Dict] = [
            {"type": "text", "text": self._vto_prompt()},
            {"type": "image_url", "image_url": {"url": generated_image_data_uri, "detail": "high"}},
        ]
        return self._chat_to_json(content)

    # --------------------------- internal helpers ------------------------ #
    def _chat_to_json(self, content: List[Dict]) -> Dict:
        if self.client is not None:
            # Prefer new param names first, then fall back
            try:
                resp = self.client.chat.completions.create(
                    model=self.deployment_id,
                    messages=[{"role": "user", "content": content}],
                    temperature=self.temperature,
                    max_completion_tokens=self.max_tokens,  # new style
                )
            except TypeError:
                # Older SDK signature
                resp = self.client.chat.completions.create(
                    model=self.deployment_id,
                    messages=[{"role": "user", "content": content}],
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                )
            except Exception as e:
                # Retry without temperature if model rejects custom values
                try:
                    resp = self.client.chat.completions.create(
                        model=self.deployment_id,
                        messages=[{"role": "user", "content": content}],
                        max_completion_tokens=self.max_tokens,
                    )
                except TypeError:
                    resp = self.client.chat.completions.create(
                        model=self.deployment_id,
                        messages=[{"role": "user", "content": content}],
                        max_tokens=self.max_tokens,
                    )
            text = resp.choices[0].message.content or ""
        else:
            # HTTP fallback for Azure Chat Completions
            url = f"{self.endpoint}/openai/deployments/{self.deployment_id}/chat/completions"
            params = {"api-version": self.api_version}
            headers = {
                "api-key": self.api_key or "",
                "content-type": "application/json",
            }
            # Try with new param name first
            payload_new = {
                "messages": [{"role": "user", "content": content}],
                "temperature": self.temperature,
                "max_completion_tokens": self.max_tokens,
            }
            with httpx.Client(timeout=30.0) as client:
                try:
                    r = client.post(url, params=params, headers=headers, json=payload_new)
                    r.raise_for_status()
                except httpx.HTTPStatusError as he:
                    body = he.response.text if he.response is not None else ""
                    if "max_completion_tokens" in body and "unsupported" in body.lower():
                        # Retry with legacy param
                        payload_old = {
                            "messages": [{"role": "user", "content": content}],
                            "temperature": self.temperature,
                            "max_tokens": self.max_tokens,
                        }
                        r = client.post(url, params=params, headers=headers, json=payload_old)
                        r.raise_for_status()
                    elif "temperature" in body.lower() and "unsupported" in body.lower():
                        # Retry without temperature
                        payload_no_temp = {
                            "messages": [{"role": "user", "content": content}],
                            "max_completion_tokens": self.max_tokens,
                        }
                        r = client.post(url, params=params, headers=headers, json=payload_no_temp)
                        r.raise_for_status()
                    else:
                        raise
                data = r.json()
                text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")

        json_str = self._extract_json(text)
        try:
            return json.loads(json_str)
        except Exception:
            return {"detected_style": [], "colors": [], "categories": [], "style_preference": []}

    @staticmethod
    def _extract_json(text: str) -> str:
        if "```" in text:
            chunk = text.split("```json")[-1].split("```")[0]
            if chunk.strip().startswith("{"):
                return chunk.strip()
        start = text.find("{"); end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return text[start:end+1]
        return "{}"

    @staticmethod
    def _style_prompt() -> str:
        return (
            "Analyze the provided person/clothing images and output ONLY JSON with keys: "
            "detected_style, colors, categories, style_preference, fit, silhouette. "
            "Where 'fit' is a short list like [slim, regular, relaxed, oversized, wide, straight, tapered], and "
            "'silhouette' are shape terms like [straight, bootcut, flare, skinny, baggy]. Be concise and consistent."
        )

    @staticmethod
    def _vto_prompt() -> str:
        return (
            "Analyze this virtual try-on image and output ONLY JSON with keys: "
            "top, pants, shoes, overall_style, colors, fit, silhouette (arrays of concise attributes)."
        )


azure_openai_service = AzureOpenAIService()
