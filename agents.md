# Repository Guidelines

## Project Structure & Module Organization
- `backend_py/app` — FastAPI service: routes in `routes/`, request models in `models.py`, shared logic under `services/` (Azure OpenAI, catalog, reranker).
- `frontend/src` — React + Vite: feature components in `components/`, hooks in `hooks/`, API shims in `services/`, shared types in `types.ts`.
- Data: source assets in `real_data/`; derived catalogs in `data/`; docs and design notes in `docs/`; automation in `scripts/`.

## Build, Test & Development Commands
- Backend dev server: `cd backend_py && uvicorn app.main:app --reload --host 0.0.0.0 --port 3001` — runs the API.
- Backend deps: `cd backend_py && pip install -r requirements.txt` — install into the project `.venv` (see README).
- Frontend dev: `cd frontend && npm install && npm run dev` — opens on `http://localhost:5173`.
- Frontend build: `cd frontend && npm run build` — emits Vite `dist/` bundle.
- Frontend lint/tests: `cd frontend && npm run lint` / `npm run test` (Vitest + Testing Library).

## Coding Style & Naming Conventions
- Python: 4‑space indentation; type‑annotated FastAPI endpoints; keep business logic in `services/`; reuse Pydantic models; prefer `Path(...)` constants under `config/`.
- TypeScript: ESLint defaults; functional components `PascalCase`; hooks `camelCase`; derive API types from `frontend/src/types.ts`; avoid ambient `any`.
- Styling: Tailwind utilities grouped layout → color → state; shared tokens in `tailwind.config.js`.

## Testing Guidelines
- Frontend: tests live beside features (e.g., `frontend/src/hooks/__tests__/foo.test.tsx`). Cover loading and feature‑flag states. Run: `cd frontend && npm run test -- --watch`.
- Backend: no pytest suite yet. If adding, mirror route modules under `backend_py/tests/` and run `pytest` from `backend_py/`.

## Commit & Pull Request Guidelines
- Commits: prefer Conventional Commits (e.g., `feat(tips): add Azure vision prompt`); concise Korean summaries are acceptable when scoped.
- PRs: link issues/tickets; list validation steps (commands run, scripts touched); attach UI screenshots or share‑image outputs for visual changes; ensure feature flags `VITE_FEATURE_TIPS`, `VITE_FEATURE_EVALUATE`, `VITE_FEATURE_SHARE` default correctly.

## Security & Configuration Tips
- Store secrets in `backend_py/.env`; never commit overrides. Keep Azure/Gemini keys optional so fallbacks work.
- Do not persist user‑uploaded images; rely on provided data URIs and strip metadata before logging.
- Verify CORS origin via `FRONTEND_URL` when testing new environments.

