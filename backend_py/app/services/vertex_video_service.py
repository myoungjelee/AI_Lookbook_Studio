import os
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException
from google.auth import default
from google.auth.transport.requests import Request


def _get_env(name: str, default_value: Optional[str] = None) -> str:
    value = os.getenv(name, default_value)
    if not value:
        raise HTTPException(status_code=500, detail=f"Missing required environment variable: {name}")
    return value


def _extract_base64(image_data: str, fallback_mime: str = "image/png") -> Tuple[str, str]:
    if image_data.startswith("data:"):
        try:
            header, b64 = image_data.split(",", 1)
            mime = header.split(";")[0].split(":")[1]
            return b64.strip(), mime
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail="Invalid data URI for imageData") from exc
    return image_data.strip(), fallback_mime


class VertexVideoService:
    def __init__(self) -> None:
        self._scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    def _get_access_token(self) -> str:
        credentials, _ = default(scopes=self._scopes)
        if not credentials.valid:
            credentials.refresh(Request())
        return credentials.token  # type: ignore[return-value]

    def _build_payload(
        self,
        *,
        prompt: str,
        image_data: str,
        mime_type: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "instances": [
                {
                    "prompt": {
                        "text": prompt,
                        "images": [
                            {
                                "mimeType": mime_type,
                                "imageBytes": image_data,
                            }
                        ],
                    }
                }
            ],
            "parameters": parameters or {},
        }
        return payload

    def start_generation(self, *, prompt: str, image_data: str, mime_type: str, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        project_id = _get_env("VERTEX_PROJECT_ID")
        location_id = _get_env("VERTEX_LOCATION", "us-central1")
        model_id = _get_env("VERTEX_MODEL_ID", "veo-3.0-generate-001")
        api_endpoint = os.getenv("VERTEX_API_ENDPOINT", f"{location_id}-aiplatform.googleapis.com")

        payload = self._build_payload(prompt=prompt, image_data=image_data, mime_type=mime_type, parameters=parameters)
        token = self._get_access_token()
        url = f"https://{api_endpoint}/v1/projects/{project_id}/locations/{location_id}/publishers/google/models/{model_id}:predictLongRunning"

        try:
            resp = httpx.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                timeout=120.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:  # noqa: BLE001
            detail = exc.response.text if exc.response is not None else str(exc)
            raise HTTPException(status_code=exc.response.status_code if exc.response else 502, detail=detail)
        except httpx.HTTPError as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=str(exc))

        return resp.json()

    def fetch_operation(self, *, operation_name: str) -> Dict[str, Any]:
        project_id = _get_env("VERTEX_PROJECT_ID")
        location_id = _get_env("VERTEX_LOCATION", "us-central1")
        model_id = _get_env("VERTEX_MODEL_ID", "veo-3.0-fast-generate-001")
        api_endpoint = os.getenv("VERTEX_API_ENDPOINT", f"{location_id}-aiplatform.googleapis.com")

        payload = {"operationName": operation_name}
        token = self._get_access_token()
        url = f"https://{api_endpoint}/v1/projects/{project_id}/locations/{location_id}/publishers/google/models/{model_id}:fetchPredictOperation"

        try:
            resp = httpx.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:  # noqa: BLE001
            detail = exc.response.text if exc.response is not None else str(exc)
            raise HTTPException(status_code=exc.response.status_code if exc.response else 502, detail=detail)
        except httpx.HTTPError as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=str(exc))

        return resp.json()

    @staticmethod
    def collect_video_uris(operation: Dict[str, Any]) -> List[str]:
        uris: List[str] = []
        op = operation.get("operation", operation)
        response = op.get("response", {}) if isinstance(op, dict) else {}
        predictions = response.get("predictions") or op.get("predictions") or []
        if not isinstance(predictions, list):
            return uris
        for pred in predictions:
            if not isinstance(pred, dict):
                continue
            candidates = [
                pred.get("videoUri"),
                pred.get("video_uri"),
                pred.get("outputUri"),
                pred.get("output_uri"),
            ]
            for val in candidates:
                if isinstance(val, str) and val:
                    uris.append(val)
            for key in ("videoUris", "video_uris"):
                val = pred.get(key)
                if isinstance(val, list):
                    uris.extend([v for v in val if isinstance(v, str)])
            for key in ("videos", "generatedVideos"):
                val = pred.get(key)
                if isinstance(val, list):
                    for item in val:
                        if isinstance(item, dict):
                            for k in ("uri", "gcsUri", "videoUri"):
                                maybe = item.get(k)
                                if isinstance(maybe, str) and maybe:
                                    uris.append(maybe)
        return list(dict.fromkeys(uris))


vertex_video_service = VertexVideoService()
