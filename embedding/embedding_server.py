"""
임베딩 서버
BAAI/bge-m3 모델을 사용한 텍스트 임베딩 서비스
"""
import os
import logging
from typing import List
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI 앱 생성
app = FastAPI(
    title="Embedding Server",
    description="BAAI/bge-m3 모델을 사용한 텍스트 임베딩 서비스",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 환경에서만 사용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 전역 변수
model = None
MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3")
PREFERRED_DEVICE = os.getenv("EMBEDDING_DEVICE", "auto").lower()  # auto|cuda|cpu
BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "8"))
MAX_SEQ_LENGTH = int(os.getenv("EMBEDDING_MAX_SEQ_LENGTH", "0"))  # 0이면 기본값 유지
MODEL_DEVICE = "unknown"

class EmbeddingRequest(BaseModel):
    text: str

class EmbeddingResponse(BaseModel):
    embedding: List[float]
    model_name: str
    text_length: int

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    device: str

def load_model():
    """모델 로드"""
    global model, MODEL_DEVICE
    try:
        # 디바이스 선택
        device = "cuda" if (PREFERRED_DEVICE in ["auto", "cuda"] and torch.cuda.is_available()) else "cpu"
        logger.info(f"Loading {MODEL_NAME} model on {device}...")
        try:
            model_local = SentenceTransformer(MODEL_NAME, device=device)
        except RuntimeError as e:
            # CUDA OOM 시 CPU 폴백
            if "CUDA out of memory" in str(e) and device == "cuda":
                logger.warning("CUDA OOM during load. Falling back to CPU...")
                device = "cpu"
                model_local = SentenceTransformer(MODEL_NAME, device=device)
            else:
                raise

        # 선택적 max_seq_length 조정
        if MAX_SEQ_LENGTH > 0:
            try:
                model_local.max_seq_length = MAX_SEQ_LENGTH
                logger.info(f"Set max_seq_length to {MAX_SEQ_LENGTH}")
            except Exception as _:
                pass

        model = model_local
        MODEL_DEVICE = device
        logger.info("Model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        MODEL_DEVICE = "unloaded"
        return False

@app.on_event("startup")
async def startup_event():
    """서버 시작 시 모델 로드"""
    success = load_model()
    if not success:
        logger.error("Failed to load model during startup")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """헬스 체크 엔드포인트"""
    return HealthResponse(
        status="healthy" if model is not None else "unhealthy",
        model_loaded=model is not None,
        model_name=MODEL_NAME if model is not None else "none",
        device=MODEL_DEVICE if model is not None else "none"
    )

@app.post("/embed", response_model=EmbeddingResponse)
async def get_embedding(request: EmbeddingRequest):
    """
    텍스트를 임베딩 벡터로 변환
    """
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Please check server logs."
        )

    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty"
        )

    try:
        text = request.text.strip()
        embedding = model.encode(text, normalize_embeddings=True)
        return EmbeddingResponse(
            embedding=embedding.tolist(),
            model_name=MODEL_NAME,
            text_length=len(text)
        )
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate embedding: {str(e)}"
        )

@app.post("/embed/batch", response_model=List[EmbeddingResponse])
async def get_embeddings_batch(texts: List[str]):
    """여러 텍스트를 배치로 임베딩 변환"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Please check server logs.")
    if not texts:
        return []
    try:
        embeddings = model.encode(texts, normalize_embeddings=True, batch_size=BATCH_SIZE)
        return [
            EmbeddingResponse(
                embedding=emb.tolist() if hasattr(emb, 'tolist') else list(emb),
                model_name=MODEL_NAME,
                text_length=len(txt)
            )
            for txt, emb in zip(texts, embeddings)
        ]
    except Exception as e:
        logger.error(f"Error generating batch embeddings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate batch embeddings: {str(e)}")

@app.get("/info")
async def get_server_info():
    return {
        "server": "Embedding Server",
        "version": "1.0.0",
        "model_loaded": model is not None,
        "model_name": MODEL_NAME if model is not None else "none",
        "device": MODEL_DEVICE if model is not None else "none",
        "batch_size": BATCH_SIZE,
        "endpoints": [
            "GET /health",
            "POST /embed",
            "POST /embed/batch",
            "GET /info"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("EMBEDDING_HOST", "0.0.0.0")
    port = int(os.getenv("EMBEDDING_PORT", "8001"))
    reload = os.getenv("EMBEDDING_RELOAD", "true").lower() == "true"
    log_level = os.getenv("EMBEDDING_LOG_LEVEL", "info")
    logger.info(f"Starting embedding server on {host}:{port}")
    uvicorn.run(
        "embedding_server:app",
        host=host,
        port=port,
        reload=reload,
        log_level=log_level
    )
