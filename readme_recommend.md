# 추천 알고리즘 설계서 (Recommendation Algorithm)

본 문서는 본 레포지토리의 추천 시스템(백엔드 FastAPI, 일부 LLM 재랭크)의 전체 구조, 알고리즘, 점수 산식, API, 설정 항목을 정리합니다. 운영·개발자가 빠르게 이해하고 변경·확장할 수 있도록 코드 기준으로 설명합니다.

## TL;DR
- 두 가지 축의 추천을 제공합니다.
  1) 스타일 분석 기반 카탈로그 검색 + 선택적 LLM 재랭크: 업로드 이미지(사람/의류/결과 이미지)를 분석해 키워드를 얻고, 카탈로그에서 유사 항목을 뽑은 뒤 LLM이 최종 상위권을 재정렬합니다.
  2) 임베딩(포지션) 기반 유사도 추천: 선택된 상품 `positions`(0-based)을 쿼리로 하여 코사인 유사도(+가격 근접성)를 사용해 상위 K개를 반환합니다. 데이터 소스는 DB 또는 파일(npy), 없으면 외부 브릿지.
- 실패/미설정 시 폴백 경로를 갖습니다. Azure OpenAI 미설정 시 규칙 기반, 임베딩 미존재 시 외부/다른 경로.

---

## 시스템 구성(코드 기준)
- 추천 관련 주요 모듈
  - 카탈로그/텍스트 기반 후보 생성: `backend_py/app/services/catalog.py`
  - LLM 재랭크(선택): `backend_py/app/services/llm_ranker.py`
  - 포지션(임베딩) 기반: 파일형 `backend_py/app/services/pos_recommender.py`, DB형 `backend_py/app/services/db_recommender.py`
  - 외부 브릿지(옵션): `backend_py/app/services/external_recommender.py`
  - 스타일 분석(Azure OpenAI Vision): `backend_py/app/services/azure_openai_service.py`
- 엔드포인트(라우터)
  - 스타일 기반 추천: `backend_py/app/routes/recommend.py`
  - 포지션 기반 추천: `backend_py/app/routes/recommend_positions.py`
  - 랜덤 피드: `backend_py/app/routes/recommend.py` (`GET /api/recommend/random`)

---

## 데이터 소스
- 카탈로그(JSON): `data/catalog.json`
  - 필드(정규화): `id`, `title`, `price`, `tags: string[]`, `category`, `imageUrl?`, `productUrl?` 등
  - 로더/검색기: `CatalogService` (`catalog.py`)
  - 추천 설정 JSON(옵션): `config/recommendation.config.json`
    - `weights.exact`, `weights.partial`, `scoreThreshold`, `maxPerCategory` 등
- 임베딩(NxD float32)
  - 파일형: `data/embeddings.npy` (`PosRecommender`가 로드)
  - DB형: `public.embeddings` (열 이름 `col_0...` 또는 `value` JSON/배열)
  - 임베딩 행 순서는 카탈로그/DB의 상품 순서(`pos`)와 동일해야 합니다.
- DB(옵션)
  - `public.products(pos, "Product_U", "Product_img_U", "Product_N", "Product_Desc", "Product_P", "Category", "Product_B", "Product_G", "Image_P")`
  - `public.embeddings` (상동)

---

## API 개요
- 스타일 기반(업로드/결과 이미지):
  - `POST /api/recommend` → 카테고리별(top, pants, shoes, accessories) 추천 묶음 반환
  - `POST /api/recommend/from-fitting` → VTO 결과 이미지 기반
- 포지션 기반(임베딩):
  - `POST /api/recommend/by-positions` → 입력 `positions: number[]`로 유사 상품 리스트 반환
- 보조
  - `GET /api/recommend/random` → 카테고리/성별 조건으로 랜덤 샘플 반환

요청/응답 타입은 `backend_py/app/models.py` 참고. 주요 옵션:
- `RecommendationOptions.maxPerCategory`, `minPrice`, `maxPrice`, `excludeTags`, `useLLMRerank`(기본: Azure 설정 시 ON)
- 포지션 기반: `top_k`, `alpha`, `w1`, `w2`

---

## 알고리즘 상세

### 1) 스타일 분석 기반 카탈로그 검색 + LLM 재랭크
1. 스타일 분석
   - 우선순위: Azure OpenAI Vision (`azure_openai_service.analyze_style_from_images` / `analyze_virtual_try_on`).
   - 입력: 사람 이미지(`person`), 의류 조각(`clothingItems`), 또는 생성 결과(`generatedImage`).
   - 출력(JSON): `detected_style`, `colors`, `categories`, `style_preference`, `fit`, `silhouette` 등.
   - 미설정/오류 시 폴백: 간단한 기본 태그(예: overall_style: casual 등)를 생성.

2. 후보 생성(카탈로그 텍스트 매칭)
   - `CatalogService.find_similar(analysis)`가 분석 결과의 키워드(예: `tags`, `captions`, `top`, `pants`, `shoes`, `overall_style`, `detected_style`, `colors`, `categories`)를 수집.
   - 카테고리별(`top`, `pants`, `shoes`, `accessories`) 검색: `search(keywords)`
     - 스코어: 제목+태그 문자열 대상 정확 일치 가중치(`exact_weight`) + 토큰 단위 부분 일치 가중치(`partial_weight`).
     - `score_threshold` 필터 적용, 상위 N(카테고리별 `maxPerCategory`의 약 3~4배) 추출.
     - 가격 범위(`minPrice`, `maxPrice`), 태그 제외(`excludeTags`) 추가 필터 후 카테고리별 후보 목록 생성.

3. LLM 재랭크(옵션)
   - 사용 조건: `useLLMRerank=true` 혹은 옵션 미지정 시 Azure 설정 감지로 자동 ON.
   - 입력: 분석 JSON + 카테고리별 후보들(아이템별 `id, title, price, tags`와 색상/핏 추출 정보)을 프롬프트에 포함.
   - 규칙: 색상(Color)과 핏/실루엣(Fit/Silhouette) 일치 우선 → 스타일/카테고리 적합성 → 동률 시 합리적 가격/다양성.
   - 출력: 카테고리별 상위 `id` 리스트(JSON). 유효하지 않거나 부족하면 후보 순서로 채움.

4. 최종 결과
   - 카테고리별로 `maxPerCategory`만큼 잘라 `RecommendationItem` 배열로 응답.

요약: “이미지 → 키워드(LLM) → 카탈로그 텍스트 매칭 후보 → (선택) LLM 재선정 → 최종 카테고리별 추천”.

### 2) 포지션(임베딩) 기반 유사도 추천
입력: 사용자가 선택한 상품 인덱스 `positions: number[]`(0-based, 동일 데이터셋의 pos)

- 데이터 소스 선택 순서
  1. DB형 임베딩 + 상품(`DbPosRecommender`): DB 연결/로딩 성공 시 최우선
  2. 파일형 임베딩(`PosRecommender`): `data/embeddings.npy`와 `catalog.json` 길이/정렬 일치 시 사용
  3. 외부 브릿지(`ExternalRecommender`): 내부 경로 불가 시 `RECOMMENDER_URL`로 GET 호출

- 점수 산식(파일/DB형 동일)
  - 쿼리 임베딩: 선택한 위치들의 임베딩 평균을 L2 정규화 → `q`
  - 유사도: `sim = emb_norm @ q` (코사인)
  - 가격 근접성(로그 공간):
    - `qprice = mean(prices[positions])`
    - `price_score = exp(-alpha * abs(log1p(price_i) - log1p(qprice)))`
  - 최종 점수: `total = w1 * sim + w2 * price_score` (기본값: `w1=0.97`, `w2=0.03`, `alpha=0.38`)
  - 선택 아이템은 제외: `total[positions] = -inf`
  - Top-K: `argpartition` → `argsort`로 효율적 상위 K 추출

- 반환: 카탈로그(또는 DB) 상품 메타 + `score` 포함 리스트

---

## 점수/가중치 조정
- 텍스트 매칭(`CatalogService._score_product`)
  - `weights.exact`(기본 1.0), `weights.partial`(기본 0.5)로 구성 파일에서 조정 가능(`config/recommendation.config.json`).
  - `scoreThreshold`, `maxPerCategory`도 구성 가능.
- 임베딩 기반
  - `top_k`, `alpha`, `w1`, `w2`는 API 요청으로 조정 가능(`/api/recommend/by-positions`).
  - 로그 가격 근접성은 가격대가 크게 다른 항목을 억제하는 역할.

---

## 설정(환경 변수)
- 공통/카탈로그
  - `CATALOG_PATH`(기본 `data/catalog.json`), `REC_CONFIG_PATH`(기본 `config/recommendation.config.json`)
- Azure OpenAI(선택)
  - `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT_ID`(기본 `gpt-4o`), `AZURE_OPENAI_API_VERSION`
- 임베딩(파일형)
  - `POS_REC_EMBEDDINGS_PATH`(기본 `data/embeddings.npy`)
- DB(선택)
  - `DB_HOST`, `DB_PORT`(기본 5432), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE`(기본 `require`)
- 외부 추천기(옵션)
  - `RECOMMENDER_URL`(예 `http://localhost:8081`), `RECOMMENDER_TIMEOUT`(초)

---

## 실패/폴백 전략
- 스타일 분석 실패 또는 Azure 미설정 → 기본 분석 태그로 후보 생성(카탈로그 경로만으로도 동작)
- LLM 재랭크 실패 → 카탈로그 점수 순 후보를 그대로 사용
- 포지션 기반에서 DB/파일 불가 → 외부 추천 URL이 설정되어 있으면 브릿지 경유

---

## 예시 요청

### 스타일 기반 추천
```http
POST /api/recommend
Content-Type: application/json

{
  "person": { "base64": "...", "mimeType": "image/jpeg" },
  "clothingItems": {
    "top":   { "base64": "...", "mimeType": "image/png" },
    "pants": { "base64": "...", "mimeType": "image/png" },
    "shoes": { "base64": "...", "mimeType": "image/png" }
  },
  "options": {
    "maxPerCategory": 3,
    "minPrice": 20000,
    "maxPrice": 120000,
    "excludeTags": ["logo"],
    "useLLMRerank": true
  }
}
```

### 포지션 기반 추천
```http
POST /api/recommend/by-positions
Content-Type: application/json

{
  "positions": [12, 47],
  "top_k": 6,
  "alpha": 0.38,
  "w1": 0.97,
  "w2": 0.03
}
```

---

## 확장 포인트
- 카테고리 확장: `CatalogService.categories`에 추가 후, 프론트 표시 로직/타입도 확장
- 태그/정규화: 색상/핏 키워드 사전 확장(LLM 재랭크 입력에 색상/핏을 명시적으로 전달)
- 다목적 최적화: 가격/재고/신상품 가중치 항목을 추가해 `total` 가중합 확장 가능
- 하이브리드: 포지션 기반 후보를 카탈로그 후보에 병합한 다음 LLM 한 번으로 공동 재랭크

---

## 성능/운영 팁
- 임베딩/카탈로그는 프로세스 기동 시 로드되어 캐시됩니다(LRU 및 단일톤 인스턴스 활용).
- Top-K는 `argpartition`으로 부분 정렬해 대규모 데이터에서도 빠르게 동작.
- Azure 호출은 토큰/타임아웃 제한을 두고 실패 시 폴백 경로로 빠집니다.

---

## 코드 참조(핵심 지점)
- 스타일 기반 파이프라인
  - 라우터: `backend_py/app/routes/recommend.py`
  - 카탈로그 후보: `backend_py/app/services/catalog.py`
  - LLM 재랭크: `backend_py/app/services/llm_ranker.py`
  - 스타일 분석: `backend_py/app/services/azure_openai_service.py`
- 포지션 기반 파이프라인
  - 라우터: `backend_py/app/routes/recommend_positions.py`
  - 파일형 임베딩: `backend_py/app/services/pos_recommender.py`
  - DB형 임베딩: `backend_py/app/services/db_recommender.py`
  - 외부 브릿지: `backend_py/app/services/external_recommender.py`

---

## 트러블슈팅
- 포지션 기반 503: 임베딩 파일·DB·외부 URL 중 어떤 것도 유효하지 않은 경우 → 설정 확인
- 카탈로그 길이≠임베딩 길이: 파일형 포지션 추천이 자동 비활성화됨 → 데이터 정렬/길이 맞추기
- Azure 오류: 모델/버전/권한 문제일 수 있으니 `AZURE_OPENAI_*` 환경 변수와 배포 ID 점검

---

본 문서는 레포 기준 기본값과 현재 구현을 반영합니다. 모델·데이터·프롬프트 변경 시 해당 섹션을 업데이트하세요.

