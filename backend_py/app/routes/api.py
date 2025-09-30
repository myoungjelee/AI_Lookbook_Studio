from fastapi import APIRouter


router = APIRouter(prefix="/api")


@router.get("")
def api_info():
    return {
        "name": "AI Virtual Try-On API (Python)",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "generate": "/api/generate",
            "recommend": "/api/recommend",
            "tryOnVideo": "/api/try-on/video",
            "tryOnVideoStatus": "/api/try-on/video/status",
        },
    }
