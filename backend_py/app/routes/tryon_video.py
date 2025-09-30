from __future__ import annotations

import base64
import binascii
from typing import Any, Dict, Optional, Literal, List

from fastapi import APIRouter, HTTPException, Response, Query
from pydantic import BaseModel, Field, conint, constr

from ..services.vertex_video_service import _extract_base64, vertex_video_service


router = APIRouter(prefix="/api/try-on/video", tags=["VirtualTryOnVideo"])


AllowedAspectRatios = Literal["1:1", "4:5", "16:9", "9:16"]
AllowedResolutions = Literal["540p", "720p", "1080p"]


class VideoParameters(BaseModel):
    aspectRatio: AllowedAspectRatios = "9:16"
    durationSeconds: conint(ge=2, le=12) = 4
    resolution: AllowedResolutions = "720p"
    generateAudio: bool = False

    def to_vertex_params(self) -> Dict[str, Any]:
        return {
            "aspectRatio": self.aspectRatio,
            "durationSeconds": int(self.durationSeconds),
            "resolution": self.resolution,
            "generateAudio": bool(self.generateAudio),
        }
class VideoGenerationRequest(BaseModel):
    prompt: constr(strip_whitespace=True, min_length=5, max_length=600)
    imageData: constr(strip_whitespace=True, min_length=32) = Field(..., description="Base64 string or data URI")
    mimeType: Optional[str] = Field(None, description="Optional MIME type if imageData is raw base64")
    parameters: VideoParameters = Field(default_factory=VideoParameters)


class OperationStatusRequest(BaseModel):
    operationName: constr(strip_whitespace=True, min_length=3, max_length=256)


def _validate_base64_payload(raw: str) -> None:
    try:
        base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="imageData must be valid base64") from exc


@router.post("", summary="Start Vertex AI video generation")
def start_video_generation(payload: VideoGenerationRequest) -> Dict[str, Any]:
    base64_data, mime = _extract_base64(payload.imageData, payload.mimeType or "image/png")
    _validate_base64_payload(base64_data)

    response = vertex_video_service.start_generation(
        prompt=payload.prompt,
        image_data=base64_data,
        mime_type=mime,
        parameters=payload.parameters.to_vertex_params(),
    )
    operation_name = response.get("name") or response.get("operation", {}).get("name")
    if not operation_name:
        raise HTTPException(status_code=502, detail="Vertex AI did not return an operation name")
    operation_name = str(operation_name).strip()

    if len(operation_name) < 3:
        raise HTTPException(status_code=502, detail="Invalid operation name returned by Vertex AI")

    return {
        "operationName": operation_name,
        "raw": response,
    }


@router.post("/status", summary="Fetch status for Vertex AI video generation job")
def fetch_video_status(payload: OperationStatusRequest) -> Dict[str, Any]:
    response = vertex_video_service.fetch_operation(operation_name=payload.operationName)
    operation = response.get("operation", response)
    done = bool(operation.get("done", False)) if isinstance(operation, dict) else False
    video_uris = vertex_video_service.collect_video_uris(response)
    # Extract inline base64-encoded videos if present
    inline_data_uris: List[str] = []
    resp_obj = operation.get("response") if isinstance(operation, dict) else {}
    vids = []
    if isinstance(resp_obj, dict):
        vids = resp_obj.get("videos") or []
    if not vids and isinstance(operation, dict):
        vids = operation.get("videos") or []
    if isinstance(vids, list):
        for v in vids:
            if isinstance(v, dict):
                b64 = v.get("bytesBase64Encoded") or v.get("bytes_base64_encoded") or v.get("base64") or v.get("bytes")
                mime = v.get("mimeType") or "video/mp4"
                if isinstance(b64, str) and b64:
                    inline_data_uris.append(f"data:{mime};base64,{b64}")
    metadata = operation.get("metadata") if isinstance(operation, dict) else {}
    progress = None
    if isinstance(metadata, dict):
        progress = metadata.get("progressPercent") or metadata.get("progress_percent")

    return {
        "done": done,
        "videoUris": video_uris,
        "videoDataUris": inline_data_uris,
        "operation": operation,
        "progressPercent": progress,
    }


@router.get("/stream", summary="Stream video by proxy (supports gs:// and http(s))")
def stream_video(uri: str = Query(..., description="gs:// or http(s) video URI")):
    resp = vertex_video_service.open_uri_stream(uri)
    media_type = resp.headers.get("Content-Type", "application/octet-stream")
    return Response(content=resp.content, media_type=media_type)
