# Python Backend (FastAPI) – Dev Guide

This doc explains how to run the FastAPI backend alongside the current Node backend and how to point the frontend to it for testing.

## Quick Run (Monorepo Scripts)

Option A – Node backend + Frontend (default)

```bash
npm run dev
```

Option B – Python backend + Frontend

```bash
# First time only: create venv and install deps
cd backend_py
python -m venv .venv
./.venv/Scripts/python -m pip install --upgrade pip
./.venv/Scripts/python -m pip install -r requirements.txt
cd ..

# Then run both (FastAPI on 3001, frontend points to 3001)
npm run dev:py
```

Notes
- On macOS/Linux, replace `./.venv/Scripts/python` with `./.venv/bin/python`.
- The frontend will use `VITE_API_URL=http://localhost:3001` when started via `dev:frontend:py`.
- Endpoints available:
  - `GET /health`
  - `GET /api`
  - `POST /api/generate`, `GET /api/generate/status`
  - `POST /api/recommend`, `POST /api/recommend/from-fitting`, `GET /api/recommend/status`, `GET /api/recommend/catalog`

## Why This Setup

- Feature-first on Node while validating FastAPI in parallel.
- Minimal switching cost: just change which dev script you run.
- Safe: secrets remain only in backend env files or runtime env, not in the frontend.

---

## 한국어 안내

### 개요
이 문서는 FastAPI 백엔드를 기존 Node 백엔드와 병행하여 실행/검증하는 방법을 설명합니다. 프론트엔드는 필요 시 FastAPI로 프록시 전환하여 테스트합니다.

### 빠른 실행 (모노레포 스크립트)
- 옵션 A – Node 백엔드 + 프론트(기본)
```powershell
npm run dev
```

- 옵션 B – Python(FastAPI) 백엔드 + 프론트
```powershell
# 최초 1회: 가상환경 및 의존성 설치
cd backend_py
python -m venv .venv
./.venv/Scripts/python -m pip install --upgrade pip
./.venv/Scripts/python -m pip install -r requirements.txt
cd ..

# FastAPI(3001) + 프론트(5173) 동시 실행
npm run dev:py
```

### 엔드포인트
- GET `/health`
- GET `/api`
- POST `/api/generate`, GET `/api/generate/status`
- (옵션) 이미지 생성 프록시(레거시): `GENERATE_PROXY_TARGET`는 더 이상 사용하지 않습니다.
- POST `/api/recommend`, POST `/api/recommend/from-fitting`, GET `/api/recommend/status`, GET `/api/recommend/catalog`

### 왜 이 구성인가
- 기능 개발은 기존 Node에서 빠르게 진행하고, FastAPI는 병행 검증합니다.
- 개발자 경험: 어떤 스크립트를 실행하느냐만 바꾸면 됩니다.
- 보안: 키는 백엔드 환경변수로만 관리(프론트 번들에 포함 안 됨).

### Azure OpenAI 기반 추천 (고도화)

FastAPI 추천 엔드포인트는 Azure OpenAI가 설정되어 있으면 자동으로 두 단계를 사용합니다.

- 스타일 분석: 업로드 이미지(사람/의류) 또는 가상피팅 이미지에서 Azure OpenAI Vision 모델로 스타일/카테고리/색상을 추출합니다.
- LLM 재정렬: 카탈로그에서 찾은 후보를 Azure OpenAI로 재정렬합니다. 명시적으로 끄지 않으면 기본 활성화됩니다.

환경변수(.env 또는 실행 환경)

```
AZURE_OPENAI_ENDPOINT=<https://YOUR-RESOURCE.openai.azure.com>
AZURE_OPENAI_KEY=<your-key>
AZURE_OPENAI_DEPLOYMENT_ID=<gpt-4o or your deployment>
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

요청 옵션으로 LLM 재정렬 제어하기

- `options.useLLMRerank: true|false`  (생략 시, Azure OpenAI가 설정되어 있으면 기본 true)
- `options.maxPerCategory`, `minPrice`, `maxPrice`, `excludeTags` 지원
