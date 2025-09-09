from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .settings import settings
from .routes.health import router as health_router
from .routes.api import router as api_router
from .routes.generate import router as generate_router
from .routes.recommend import router as recommend_router
from .routes.proxy import router as proxy_router
from .routes.tips import router as tips_router
from .routes.evaluate import router as evaluate_router


app = FastAPI(title="AI Virtual Try-On API (Python)")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health_router)
app.include_router(api_router)
app.include_router(generate_router)
app.include_router(recommend_router)
app.include_router(proxy_router)
app.include_router(tips_router)
app.include_router(evaluate_router)


@app.get("/")
def root():
    return {"message": "AI Virtual Try-On (Python)"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.NODE_ENV != "production",
    )
