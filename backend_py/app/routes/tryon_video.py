from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.vertex_video_service import _extract_base64, vertex_video_service


router = APIRouter(prefix="/api/try-on/video", tags=["VirtualTryOnVideo"])


class VideoGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=600)
    imageData: str = Field(..., description="Base64 string or data URI")
    mimeType: Optional[str] = Field(None, description="Optional MIME type if imageData is raw base64")
    parameters: Dict[str, Any] = Field(default_factory=dict)


class OperationStatusRequest(BaseModel):
    operationName: str = Field(..., description="Long-running operation name returned by Vertex AI")


@router.post("", summary="Start Vertex AI video generation")
def start_video_generation(payload: VideoGenerationRequest) -> Dict[str, Any]:
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    base64_data, mime = _extract_base64(payload.imageData, payload.mimeType or "image/png")
    response = vertex_video_service.start_generation(
        prompt=payload.prompt.strip(),
        image_data=base64_data,
        mime_type=mime,
        parameters=payload.parameters,
    )
    operation_name = response.get("name") or response.get("operation", {}).get("name")
    if not operation_name:
        raise HTTPException(status_code=502, detail="Vertex AI did not return an operation name")
    operation_name = str(operation_name).strip()

    return {
        "operationName": operation_name,
        "raw": response,
    }


@router.post("/status", summary="Fetch status for Vertex AI video generation job")
def fetch_video_status(payload: OperationStatusRequest) -> Dict[str, Any]:
    if not payload.operationName:
        raise HTTPException(status_code=400, detail="operationName is required")

    response = vertex_video_service.fetch_operation(operation_name=payload.operationName)
    operation = response.get("operation", response)
    done = bool(operation.get("done", False))
    video_uris = vertex_video_service.collect_video_uris(response)

    return {
        "done": done,
        "videoUris": video_uris,
        "operation": operation,
    }
