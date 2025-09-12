<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Virtual Try‑On (FastAPI + React/Vite)

Monorepo with a Python FastAPI backend (`backend_py`) and a React + Vite + TypeScript frontend (`frontend`). The legacy Node backend has been removed to avoid confusion.

View in AI Studio: https://ai.studio/apps/drive/1ORGriwJMQVw1Sd-cSjddK7sGBrrm_B6D

## What’s Included
- Backend: FastAPI with routes for generate, recommendations, style tips, history evaluation, proxy/image tools
- Frontend: React 19 + Vite 6 + Tailwind
- Tools: CSV ingest to catalog, transparent‑background image selector
- Docker: Dev and Prod compose files

## Prerequisites
- Python 3.11+
- Node.js 18+ (frontend tooling only)

## Run Locally

Backend (FastAPI)
- Terminal A
  - `cd backend_py`
  - `python -m venv .venv`
  - Activate venv (Windows) `.venv\Scripts\activate` / (Linux/macOS) `source .venv/bin/activate`
  - `pip install -r requirements.txt`
  - `uvicorn app.main:app --reload --host 0.0.0.0 --port 3001`

Frontend (Vite)
- Terminal B
  - `cd frontend`
  - `npm install` (or `npm ci`)
  - `npm run dev` (opens on 5173)

Tip: `scripts/quickstart.ps1` installs frontend deps, prepares backend venv, ingests CSVs if present, and starts both.

## Endpoints
- `GET /health`
- `POST /api/generate`
- `POST /api/recommend`
- `POST /api/recommend/from-fitting`
- `POST /api/tips`
- `POST /api/evaluate`
- `POST /api/recommend/by-positions` (optional, external recommender bridge)

## Configuration
Copy `backend_py/.env.example` to `backend_py/.env` and set keys as needed.
- CORS: `FRONTEND_URL`
- Azure OpenAI (optional): `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT_ID`
- Gemini (optional): `GEMINI_API_KEY`, `GEMINI_FIXED_PROMPT`, `GEMINI_TEMPERATURE`
- External recommender (optional): `RECOMMENDER_URL`, `RECOMMENDER_TIMEOUT`

Frontend dev uses `VITE_API_URL` when provided; otherwise defaults to `http://localhost:3001` via `vite.config.ts`.

## Docker
- Dev: `docker compose -f docker-compose.dev.yml up`
- Prod: `docker compose up -d`

## Data Prep
- CSV → catalog.json: `python backend_py/tools/ingest_csv_to_catalog.py`
- Transparent‑only selection: `python backend_py/tools/select_transparent_images.py --input real_data/images --output real_data_no_bg --extensions .png .webp`
  - Details: `docs/data-prep-transparent-images.md`

## Troubleshooting
- Vite not found: `cd frontend && npm install`
- npm ERESOLVE: ensure `@testing-library/react@^16` then reinstall; as fallback use `npm install --legacy-peer-deps`
- Import error `ModuleNotFoundError: app`: run from `backend_py` or use `uvicorn backend_py.app.main:app` at repo root
- Windows EOL warning on `git add`: harmless; use `.gitattributes` to normalize
- Root Node workspace was removed — run all Node commands inside `frontend/`. Use `backend_py/.venv` only

