# DB-Only 추천 전환 계획 (Plan & Implementation)

목표: 로컬 기반(카탈로그 JSON/파일 임베딩/외부 브릿지) 레거시 폴백을 제거하고, DB 기반 추천만 사용하도록 백엔드와 호출 경로를 정리한다. 배포 시 DB 비가용 상태에서는 명시적으로 503을 반환한다.

## 범위(Scope)
- 포함: FastAPI 백엔드 추천 경로/서비스 정리, 문서/런북 업데이트.
- 제외: 실제 DB 스키마 마이그레이션(별도 관리), 프론트엔드 전면 교체(연동 지침만 포함), 데이터 적재 파이프라인.

## 현재 상태(요약)
- 스타일 기반 추천: `backend_py/app/routes/recommend.py:1`
  - Azure Vision 분석 → `CatalogService.find_similar(...)` → (옵션) `LLMRanker.rerank(...)` → 결과
  - 로컬 JSON 카탈로그/가중치 기반 텍스트 매칭 사용
- 포지션 기반 추천: `backend_py/app/routes/recommend_positions.py:1`
  - 우선순위: DB(`DbPosRecommender`) → 파일(`PosRecommender`) → 외부(`ExternalRecommender`) 폴백
- 서비스들
  - 카탈로그: `backend_py/app/services/catalog.py:1`
  - 파일 임베딩: `backend_py/app/services/pos_recommender.py:1`
  - DB 임베딩: `backend_py/app/services/db_recommender.py:1`
  - 외부 브릿지: `backend_py/app/services/external_recommender.py:1`

## 전환 원칙
- 오직 DB 기반 추천(`DbPosRecommender`)만 허용
- DB 미가용 시 명시적으로 실패(503) → 조기 발견/관찰성 강화
- API를 단계적으로 정리하되, 프론트가 수정될 때까지는 최소한의 호환 경로 제공 또는 명시적 Deprecation 응답

---

## 아키텍처 변경안
1) 포지션 기반(by-positions) 단일화
- `POST /api/recommend/by-positions`만을 표준 추천 API로 사용
- 내부 구현은 `DbPosRecommender.recommend(...)`만 호출
- 파일형/외부형 폴백 코드 제거

2) 스타일 기반 추천 경로 축소/폐기
- `POST /api/recommend`, `POST /api/recommend/from-fitting`
  - 카탈로그/LLM 재랭크 기반 로직 제거
  - 옵션 A(권장): 410 Gone 또는 501 Not Implemented 반환 + 사용 안내(positions API로 이동)
  - 옵션 B(과도기): DB 기준의 단순 대체 로직 제공(예: 프론트에서 선택된 seed positions가 있을 때만 DB 추천 호출) — 단, 본 계획에서는 A를 기본값으로 제안

3) 랜덤 피드 정리
- `GET /api/recommend/random`은 DB 제품만 사용, DB 미가용 시 503
- 카탈로그 폴백 제거

4) 서비스/의존성 정리
- 미사용 경로 제거 대상
  - `CatalogService`의 추천 관련 사용처 제거(검색/유사도 매칭 기반 경로)
  - `PosRecommender`(파일 임베딩) 제거 또는 비노출
  - `ExternalRecommender` 폴백 제거
  - `LLMRanker`는 추천 재랭크 목적이라면 비활성화/제거(선택) — DB-only 정책에 맞춰 기본 비활성화 권장

---

## 구현 단계(체크리스트)
- [ ] 0. 사전 점검: DB 연결/로드 정상화
  - `.env` 설정: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE`
  - 시작 시 `DbPosRecommender.available()` 확인 및 로그 추가
- [ ] 1. by-positions 라우터 정리
  - 파일: `backend_py/app/routes/recommend_positions.py:1`
  - 작업: `db_pos_recommender` 경로만 남기고, 파일/외부 폴백 코드 삭제
  - DB 미가용 시 `HTTPException(503, "Db recommender unavailable")`
- [ ] 2. recommend 라우터 축소
  - 파일: `backend_py/app/routes/recommend.py:1`
  - 작업: `POST /api/recommend`, `POST /api/recommend/from-fitting`를 410/501로 변경하고 안내 메시지 반환
  - `GET /api/recommend/status`: DB 기준으로 응답 단순화(카탈로그/LLM 항목 제거 또는 비활성 표시)
  - `GET /api/recommend/catalog`: DB 제품 기반 간단 통계로 대체 또는 410/501
  - `GET /api/recommend/random`: DB만 사용, 카탈로그 폴백 제거
- [ ] 3. 서비스 의존성 제거/정리
  - 파일: `catalog.py`, `pos_recommender.py`, `external_recommender.py`, `llm_ranker.py`
  - 작업: import/참조 제거. 파일 자체 삭제는 최종 단계에서(회귀 시 되돌리기 용이하도록 초기엔 비노출)
- [ ] 4. 문서 업데이트
  - `README.md`의 Endpoints/설정/트러블슈팅 DB-only로 갱신
  - 운영 런북: DB 비가용 시 동작/알람/복구 지침
- [ ] 5. 검증
  - 단위: by-positions 정상 동작(경계값: 빈 positions, 범위 초과, 큰 top_k)
  - 통합: `GET /api/recommend/random` 카테고리/성별 필터 확인
  - 장애: DB 끊김 시 503 반환 확인

---

## 코드 변경 상세(안)
1) `backend_py/app/routes/recommend_positions.py:1`
- 기존: DB → 파일 → 외부 폴백
- 변경: DB만 호출, 예)
  - if not db_pos_recommender.available(): 503
  - return [RecommendationItem(**it) for it in db_pos_recommender.recommend(...)]

2) `backend_py/app/routes/recommend.py:1`
- `@router.post("")`, `@router.post("/from-fitting")`: 410/501 반환으로 전환
- `@router.get("/status")`: DB 제품 수/가용성만 표기
- `@router.get("/catalog")`: 제거 또는 410/501 (대신 DB 통계로 대체하려면 DbPosRecommender.products 집계)
- `@router.get("/random")`: DB만 사용(현 구현에 이미 DB 우선 로직 있음 — 카탈로그 폴백 제거)

3) 서비스들
- `catalog.py` 경로 제거(추천 검색 경로), `pos_recommender.py`, `external_recommender.py` 참조 제거
- `llm_ranker.py`(선택): 미사용이면 라우터에서 노출하지 않음

---

## 프론트엔드 연동 지침(요약)
- 추천 호출을 `POST /api/recommend/by-positions`로 통일
- 필요 파라미터: `{ positions: number[], top_k?, alpha?, w1?, w2? }`
- 랜덤 피드는 `GET /api/recommend/random` 유지(단, DB 없으면 503)
- (선택) 기존 스타일 기반 추천 호출 제거 및 UI에서 positions 기반 UX로 전환

---

## 롤백 전략
- 변경을 브랜치로 진행하고, 장애 시 기존 브랜치로 롤백
- 파일형/카탈로그/외부 경로의 소스는 초기 단계에서는 삭제 대신 비노출 → 문제가 없음을 확인한 후 최종 삭제

## 리스크 & 완화
- DB 가용성 문제 → 헬스체크/알람, 503 명시적 처리, 재시도 정책
- 프론트 미전환 → recommend 경로 410/501로 조기 신호, 과도기 배너/가이드 제공
- 데이터 정합성(embeddings vs products row 수) → 기동 시 검증, 미스매치 시 fail-fast + 관측

## 일정(대략)
- D0: 계획/승인
- D1: by-positions 정리(서버 코드), 랜덤 경로 정리
- D2: recommend 경로 410/501 전환, 문서 업데이트
- D3: 검증/QA, 프론트 연동 가이드 공유 → 릴리즈

## 수용 기준(AC)
- DB만으로 추천이 동작하고, DB 미가용 시 모든 추천 관련 API가 503을 반환
- 스타일 기반 추천/카탈로그 폴백/파일 임베딩/외부 브릿지는 더 이상 호출되지 않음
- README/런북에 DB-only 기준이 반영

---

## 운영 가이드(요약)
- 환경변수: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE`
- 기동: `cd backend_py && uvicorn app.main:app --reload`
- 헬스/상태 확인: `GET /api/recommend/status`, `GET /health`

