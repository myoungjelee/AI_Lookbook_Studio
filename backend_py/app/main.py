from .settings import settings
from .routes.health import router as health_router
from .routes.api import router as api_router
from .routes.generate import router as generate_router
from .routes.recommend import router as recommend_router
from .routes.recommend_positions import router as recommend_positions_router
from .routes.proxy import router as proxy_router
from .routes.tips import router as tips_router
from .routes.evaluate import router as evaluate_router
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import logging

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv('LOG_LEVEL', 'INFO').upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Virtual Try-On API (Python)", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register custom middleware
from .middleware.logging import LoggingMiddleware
app.add_middleware(LoggingMiddleware)

# Routers
app.include_router(health_router)
app.include_router(api_router)
app.include_router(generate_router)
app.include_router(recommend_router)
app.include_router(recommend_positions_router)
app.include_router(proxy_router)
app.include_router(tips_router)
app.include_router(evaluate_router)


@app.get("/")
def root():
    return {"message": "AI Virtual Try-On (Python)"}

# Add startup event
@app.on_event("startup")
async def startup_event():
    logger.info("Application startup completed")

# Add shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Application shutdown")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.NODE_ENV != "production",
    )
