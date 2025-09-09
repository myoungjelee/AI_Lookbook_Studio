Phase 1 Implementation Plan (Could → 1차)

Scope: Deliver three high‑impact “could” features with minimal risk using the existing FastAPI (backend_py) and React/Vite frontend.

Prioritized Features (순서)
1) 스타일링 팁 자동 생성 (Style Tips)
2) 결과 히스토리 LLM 평가/스코어링 (History Scoring)
3) 소셜 공유용 이미지 생성 (Share Image)

Guiding Principles
- Reuse current APIs and services where possible (AzureOpenAI/Gemini, catalog, VTO).
- Keep backend changes additive and simple; avoid breaking existing routes.
- Ship incrementally feature‑flagged in UI; degrade gracefully without AI keys.

System Context
- Backend: FastAPI under `backend_py/app`, Azure OpenAI helper (`azure_openai_service.py`), reranker (`llm_ranker.py`), catalog search.
- Frontend: React + Vite under `frontend`, services `virtualTryOn.service.ts`, recommendation components, try‑on UI.

---

1) 스타일링 팁 자동 생성

Goal
- Provide concise, actionable style tips alongside recommendations or try‑on results.

LLM Choice
- Azure OpenAI Chat Completions (vision) as primary. We already integrate Azure in `azure_openai_service.py` and `llm_ranker.py`.
- Fallback: rule‑based tips when Azure is not configured. (No OpenAI hosted, no Gemini for text in 1차.)

Input Basis
- 결과 히스토리 이미지 기반: `generatedImage` 또는 최근 히스토리(`historyImages[]`)를 전송해 시각적 컨텍스트로 팁 생성.

API
- New endpoint: `POST /api/tips`
  - Request (one of):
    - `{ generatedImage: string }` (data URI)
    - `{ historyImages: string[] }` (data URIs; latest 1~2장 활용)
    - `{ person: ApiFile, clothingItems?: ClothingItems }` (선택)
    - `options?: { tone?: 'warm'|'cool'|'neutral'; occasion?: string; maxTips?: number }`
  - Response: `{ tips: string[], score?: number(0-100), tone?: string, occasion?: string, source: 'ai'|'fallback', requestId: string, timestamp: string }`

Backend Design
- Router `backend_py/app/routes/tips.py` (added).
- Use `azure_openai_service` vision chat with strict JSON extraction; fallback to rule‑based concise tips.
- Rate‑limit guard (simple time window per process) and token/timeout bounds.

Frontend Design
- Show “Style Tips” card below `RecommendationDisplay` and in try‑on result pane.
- Add service method `virtualTryOnService.getStyleTips(...)` calling `/api/tips`.
- Lazy fetch on demand; render skeleton when loading; hide when empty.
- Display AI score with star emoji badge (e.g., `⭐ 87%`).

Acceptance Criteria
- Without AI keys, endpoint returns non‑empty but safe fallback tips for common inputs.
- With AI, returns 3–6 succinct bullet tips in < 1.2s median on warm path.
- No crashes if only person image or only generated image is provided.

---

2) 결과 히스토리 LLM 평가/스코어링

Goal
- 생성된 결과 히스토리에서 여러 이미지를 선택하고, LLM이 전체적 코디 품질을 0~100 점수(%)로 평가.

API
- `POST /api/evaluate` (added)
  - Request: `{ images: string[] (data URIs), options?: { occasion?, tone?, style? } }`
  - Response: `{ results: [{ index, score, reasoning? }...], source, requestId, timestamp }`

Backend Design
- `backend_py/app/routes/evaluate.py`: Azure OpenAI vision chat로 각 이미지에 대해 간단한 근거와 함께 정수 점수 산출. 미설정 시 규칙 기반 fallback.

Frontend Design
- `HistoryEvaluator.tsx`: 결과 히스토리에서 선택(체크박스) → “평가하기” 버튼 → 점수 도출 후 히스토리 항목에 오버레이로 표시.
- `tryon_history.service.ts`: output 아이템에 `evaluation` 저장 및 갱신 API 추가.
- `TryOnHistory.tsx`: 썸네일 좌상단(또는 우하단)에 점수 배지 노출.

Acceptance Criteria
- 최소 1장 선택 시 평가 가능, 결과는 0~100 정수 점수로 표시.
- Azure 미설정 시에도 fallback 점수 제공(고정/경미 변동), 오류 없이 완료.

---

3) 소셜 공유용 이미지 생성 (Share Image)

Goal
- Provide a one‑click way to export the result (and optional tips) as a shareable PNG.

Approach
- Client‑only using `html2canvas` to rasterize a dedicated share layout.
- Sizes: 1080×1080, 1080×1920, 1200×630. Watermark/timestamp optional.
- Offer: PNG 다운로드. (OG tags/hosted link는 범위 외)

Frontend Tasks
- `shareImage.ts` 유틸(완료) + `SnsShareDialog.tsx`(완료): 사이즈 선택, 팁/점수 포함한 카드 레이아웃 캡처.
- Try-On 패널에 “SNS 공유용 이미지 저장” 버튼 연결(완료).
- 워터마크/타임스탬프 간단 노출(완료).

Acceptance Criteria
- Generates a PNG ≥ 1024px on the long edge, readable text.
- Works across Chrome/Edge desktop; gracefully warns on Safari if unsupported.

---

Cross‑Cutting Tasks
- Types: extend `frontend/src/types.ts` with `StyleTipsResponse`.
- Feature flags: simple booleans in `vite` env (e.g., `VITE_FEATURE_TIPS`, `VITE_FEATURE_COMPARE`, `VITE_FEATURE_SHARE`). Default ON.
- Telemetry (optional): console timings and simple counters for success/failure.

Security & Safety
- Do not send PII beyond images provided by the user; redact metadata.
- Enforce JSON‑only outputs from LLM; robust JSON extraction.
- Respect current content policies in prompts; no identity claims about people in images; avoid generating personal attributes.

Dependencies
- Frontend: `html2canvas` (or `dom-to-image-more`) for capture.
- Backend: none beyond existing `openai/httpx` for Azure; reuse current requirements.

Rollout Plan
1) Tips API + UI (flagged) →
2) Compare panel (UI‑only) →
3) Share image (UI‑only) →
4) Polish: empty states, i18n strings, accessibility labels.

- [x] Backend: create `backend_py/app/routes/tips.py` with POST `/api/tips` and wire in `main.py`.
- [ ] Backend: add small unit tests for JSON extraction and fallback heuristics (optional).
- [ ] Frontend: add `getStyleTips` to `virtualTryOn.service.ts`.
- [ ] Frontend: new `ComparePanel.tsx` and A/B quick‑actions in `RecommendationDisplay.tsx`.
- [ ] Frontend: add `shareImage.ts` util and “Share” buttons.
- [ ] Frontend: add feature flags in `vite.config.ts` env and guard renders.
- [ ] Docs: update `README.md` usage section with flags, tips API.

Progress & Estimates
- 2025‑09‑09: LLM 결정(Azure OpenAI), Tips API/Router 구현, FE service + 카드 UI 완료.
- 2025‑09‑09: Share 유틸 및 버튼 연결, History 평가 기능(백엔드 `/api/evaluate`, `HistoryEvaluator.tsx`, 점수 오버레이) 완료. 플래그: `VITE_FEATURE_TIPS|EVALUATE|SHARE`(기본 ON). 이전 Compare A/B는 보류.
  - 남은 FE: i18n/문구 정리, 디자인 폴리시 정합성, 평가 기준 옵션(occasion/tone/style) 노출.
  - 간단 통합 테스트 필요.
  
Work Estimates (rough)
- Tips: BE 0.5d, FE 0.5d
- Compare: FE 1.0d
- Share: FE 0.5d
- Buffer/QA: 0.5d

How to Verify
- Start backend: `cd backend_py && uvicorn app.main:app --reload`
- Start frontend: `cd frontend && npm run dev`
- Manual flows: upload person + item(s) → generate → fetch tips → share → compare A/B.

Exit Criteria for Phase 1
- All acceptance criteria met; features guarded by flags; no regressions to existing try‑on and recommendations.
