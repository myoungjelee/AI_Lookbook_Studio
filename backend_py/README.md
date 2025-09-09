# Python Backend (FastAPI) Skeleton

This is a minimal FastAPI skeleton to prepare a migration path from the Node.js backend. It provides a health endpoint and routes that mirror the current API surface.

## Endpoints

- GET `/health` — service health
- GET `/api` — API info
- POST `/api/generate` — virtual try-on generation (Python Gemini if available, else proxy/stub)
- GET `/api/generate/status` — generator service status (Gemini/proxy flags)
- POST `/api/recommend` — recommendation from uploads
- POST `/api/recommend/from-fitting` — recommendation from generated image
- GET `/api/recommend/status` — recommendation service status
- GET `/api/recommend/catalog` — catalog stats

## Quick Start

```bash
cd backend_py
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run (env vars optional via .env)
uvicorn app.main:app --reload --host 0.0.0.0 --port 3001
```

## Environment

Copy `.env.example` to `.env` if needed.

```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Optional: enable native Python Gemini generation
# GEMINI_API_KEY=your_api_key_here  # or API_KEY
# GEMINI_MODEL=gemini-2.5-flash-image-preview
# GEMINI_TIMEOUT_MS=30000
# GEMINI_MAX_RETRIES=3

# Optional: during migration, proxy to Node backend generate endpoint
# GENERATE_PROXY_TARGET=
```

## Notes

- CORS allows `FRONTEND_URL` for local dev.
- Models align with the Node backend types.
- When ready, incrementally port real logic (catalog/search, AI calls) and swap the frontend proxy to point here.

## Gemini (Python) Setup

Two compatible clients are supported. Install either one:

```bash
pip install google-genai  # preferred new SDK
# or
pip install google-generativeai  # legacy SDK
```

Configure your key in `.env`:

```
GEMINI_API_KEY=your_key_here   # or API_KEY
```

The `/api/generate` route will use Python Gemini when available; otherwise it will proxy to `GENERATE_PROXY_TARGET` if set, or return a tiny placeholder PNG.

---

## 한국어 안내

### 개요
이 디렉터리는 기존 Node.js 백엔드를 Python(FastAPI)로 단계적으로 이전하기 위한 스켈레톤입니다. 헬스 체크, API 정보, 가상 피팅/추천 라우트를 제공합니다.

### 빠른 실행
```powershell
cd backend_py
python -m venv .venv
.\.venv\Scripts\activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 3001
```

### 라우트 개요
- GET `/health`: 서비스 체크
- GET `/api`: API 정보
- POST `/api/generate`, GET `/api/generate/status`: 가상 피팅(파이썬 Gemini 사용 가능 시), 상태
  - `GENERATE_PROXY_TARGET` 환경변수가 설정되어 있으면 기존 Node 백엔드의 `/api/generate`로 프록시합니다.
- POST `/api/recommend`, POST `/api/recommend/from-fitting`: 추천
- GET `/api/recommend/status`, GET `/api/recommend/catalog`: 상태/카탈로그 통계

### 환경변수(.env)
```
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
# (선택) 파이썬 Gemini 활성화
# GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-2.5-flash-image-preview
# GEMINI_TIMEOUT_MS=30000
# GEMINI_MAX_RETRIES=3
# (선택) 마이그레이션 동안 프록시 사용
# GENERATE_PROXY_TARGET=
```

### 비고
- 로컬 개발을 위해 `FRONTEND_URL` CORS 허용.
- 현재는 단계적 이전을 위한 구조이며, 실제 로직은 점진적으로 이관합니다.
