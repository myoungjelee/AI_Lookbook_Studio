from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Response

from ..models import (
    CategoryRecommendations,
    RecommendationFromFittingRequest,
    RecommendationItem,
    RecommendationOptions,
    RecommendationRequest,
    RecommendationResponse,
)
from ..services.azure_openai_service import azure_openai_service
from ..services.catalog import get_catalog_service
from ..services.db_recommender import db_pos_recommender, _normalize_gender as _db_norm_gender
from ..services.llm_ranker import llm_ranker

router = APIRouter(prefix="/api/recommend", tags=["Recommendations"])


def _candidate_budget(opts: RecommendationOptions) -> int:
    base = opts.maxPerCategory if opts.maxPerCategory is not None else 3
    return base * 4


def _db_products() -> list[dict] | None:
    if not db_pos_recommender.available():
        return None
    db_products = list(db_pos_recommender.products)
    return db_products if db_products else None


def _candidate_kwargs(opts: RecommendationOptions) -> dict:
    return {
        "max_per_category": _candidate_budget(opts),
        "include_score": True,
        "min_price": opts.minPrice,
        "max_price": opts.maxPrice,
        "exclude_tags": opts.excludeTags,
    }


def _build_candidates(
    analysis: dict,
    svc,
    opts: RecommendationOptions,
) -> dict[str, list[dict]]:
    kwargs = _candidate_kwargs(opts)
    products_override = _db_products()
    if products_override is None:
        raise HTTPException(
            status_code=503, detail="Recommendation database unavailable"
        )

    return svc.find_similar(
        analysis,
        products=products_override,
        **kwargs,
    )


@router.get("/status")
def status():
    stats = get_catalog_service().stats()
    return {
        "aiService": {
            "azureOpenAI": {
                "available": azure_openai_service.available(),
                "deploymentId": getattr(azure_openai_service, "deployment_id", None),
                "apiVersion": getattr(azure_openai_service, "api_version", None),
            },
            "llmReranker": {
                "available": llm_ranker.available(),
                "deploymentId": getattr(llm_ranker, "deployment_id", None),
            },
        },
        "catalogService": {
            "available": stats.get("totalProducts", 0) > 0,
            "productCount": stats.get("totalProducts", 0),
        },
    }


@router.get("/catalog")
def catalog_stats():
    return get_catalog_service().stats()


@router.get("/random")
def random_products(
    limit: int = 18,
    category: str | None = None,
    gender: str | None = None,
    response: Response = None,
):
    # Prefer DB-backed products when available, otherwise use catalog JSON
    if db_pos_recommender.available():
        products = list(db_pos_recommender.products)
        source = "db"
    else:
        svc = get_catalog_service()
        products = svc.get_all()
        source = "catalog"

    def norm_slot(s: str) -> str:
        c = (s or "").strip().lower()
        if not c:
            return "unknown"

        # DB 카테고리 매핑만 사용
        if c in ["man_outer", "woman_outer"]:
            return "outer"
        elif c in ["man_top", "woman_top"]:
            return "top"
        elif c in ["man_bottom", "woman_bottom"]:
            return "pants"
        elif c in ["man_shoes", "woman_shoes"]:
            return "shoes"
        elif c == "woman_dress_skirt":
            return "pants"  # 드레스/스커트는 하의로 분류

        # 알 수 없는 카테고리는 그대로 반환
        return c

    if category:
        req_slot = norm_slot(category)
        products = [
            p for p in products if norm_slot(str(p.get("category") or "")) == req_slot
        ]

    if gender:
        gq = (gender or "").strip().lower()
        want = _db_norm_gender(gq)
        # 남/여 요청 시 공용도 함께 포함
        def match(prod_gender: str) -> bool:
            ng = _db_norm_gender(prod_gender)
            if want == "male":
                return ng in {"male", "unisex"}
            if want == "female":
                return ng in {"female", "unisex"}
            return ng == want

        products = [p for p in products if match(str(p.get("gender") or ""))]

    import random

    random.shuffle(products)
    result = []
    for p in products[: min(max(limit, 1), 100)]:
        item = {
            "id": str(p.get("id")),
            "title": p.get("title") or "",
            "price": int(p.get("price") or 0),
            "imageUrl": p.get("imageUrl"),
            "productUrl": p.get("productUrl"),
            "tags": p.get("tags") or [],
            "category": p.get("category") or "top",
        }
        result.append(item)
    try:
        if response is not None:
            response.headers["X-Rec-Source"] = source
            if gender:
                response.headers["X-Rec-Gender"] = (gender or "").lower()
    except Exception:
        pass
    return result


@router.post("")
def recommend_from_upload(req: RecommendationRequest) -> RecommendationResponse:
    # Analyze style: prefer Azure OpenAI if available
    analysis = {}
    analysis_method = "fallback"
    if azure_openai_service.available():
        try:
            analysis = azure_openai_service.analyze_style_from_images(
                req.person, req.clothingItems
            )
            analysis_method = "ai"
        except Exception:
            analysis = {}
            analysis_method = "fallback"
    if not analysis:
        if req.person:
            analysis["overall_style"] = ["casual", "everyday"]
        if req.clothingItems:
            for k in ("top", "pants", "shoes", "outer"):
                if getattr(req.clothingItems, k) is not None:
                    analysis.setdefault(k, []).extend([k, "basic", "casual"])

    svc = get_catalog_service()
    opts = req.options if req.options is not None else RecommendationOptions()
    candidate_recs = _build_candidates(analysis, svc, opts)

    # Optional LLM rerank (default to Azure OpenAI when configured)
    max_k = opts.maxPerCategory or 3
    user_llm_pref = opts.useLLMRerank
    use_llm = user_llm_pref if user_llm_pref is not None else llm_ranker.available()
    if use_llm and llm_ranker.available():
        ids = llm_ranker.rerank(analysis, candidate_recs, top_k=max_k)
        if ids:
            # reorder by ids
            recs = {cat: [] for cat in candidate_recs.keys()}
            for cat in candidate_recs.keys():
                # map id->item
                idx = {str(p["id"]): p for p in candidate_recs[cat]}
                for _id in ids.get(cat, []):
                    if _id in idx:
                        recs[cat].append(idx[_id])
            # fill if not enough
            for cat in recs.keys():
                if len(recs[cat]) < max_k:
                    for p in candidate_recs[cat]:
                        if p not in recs[cat]:
                            recs[cat].append(p)
                        if len(recs[cat]) >= max_k:
                            break
        else:
            recs = {cat: (candidate_recs[cat][:max_k]) for cat in candidate_recs.keys()}
    else:
        recs = {cat: (candidate_recs[cat][:max_k]) for cat in candidate_recs.keys()}

    # Convert lists of dicts to CategoryRecommendations model
    as_model = CategoryRecommendations(
        top=[RecommendationItem(**p) for p in recs.get("top", [])],
        pants=[RecommendationItem(**p) for p in recs.get("pants", [])],
        shoes=[RecommendationItem(**p) for p in recs.get("shoes", [])],
        accessories=[RecommendationItem(**p) for p in recs.get("accessories", [])],
    )

    return RecommendationResponse(
        recommendations=as_model,
        analysisMethod=analysis_method,
        styleAnalysis=analysis if analysis_method == "ai" else None,
        requestId=f"req_{int(datetime.utcnow().timestamp())}",
        timestamp=datetime.utcnow().isoformat() + "Z",
    )


@router.post("/from-fitting")
def recommend_from_fitting(
    req: RecommendationFromFittingRequest,
) -> RecommendationResponse:
    # For fitting: prefer Azure analysis on generated image
    analysis_method = "fallback"
    analysis = {
        "overall_style": ["casual", "relaxed"],
        "categories": ["top", "pants", "shoes", "outer"],
    }
    if azure_openai_service.available() and req.generatedImage:
        try:
            analysis = azure_openai_service.analyze_virtual_try_on(req.generatedImage)
            analysis_method = "ai"
        except Exception:
            analysis_method = "fallback"
    svc = get_catalog_service()
    opts = req.options if req.options is not None else RecommendationOptions()
    candidate_recs = _build_candidates(analysis, svc, opts)

    max_k = opts.maxPerCategory or 3
    user_llm_pref = opts.useLLMRerank
    use_llm = user_llm_pref if user_llm_pref is not None else llm_ranker.available()
    if use_llm and llm_ranker.available():
        ids = llm_ranker.rerank(analysis, candidate_recs, top_k=max_k)
        if ids:
            recs = {cat: [] for cat in candidate_recs.keys()}
            for cat in candidate_recs.keys():
                idx = {str(p["id"]): p for p in candidate_recs[cat]}
                for _id in ids.get(cat, []):
                    if _id in idx:
                        recs[cat].append(idx[_id])
                for p in candidate_recs[cat]:
                    if len(recs[cat]) >= max_k:
                        break
                    if p not in recs[cat]:
                        recs[cat].append(p)
        else:
            recs = {cat: (candidate_recs[cat][:max_k]) for cat in candidate_recs.keys()}
    else:
        recs = {cat: (candidate_recs[cat][:max_k]) for cat in candidate_recs.keys()}

    as_model = CategoryRecommendations(
        top=[RecommendationItem(**p) for p in recs.get("top", [])],
        pants=[RecommendationItem(**p) for p in recs.get("pants", [])],
        shoes=[RecommendationItem(**p) for p in recs.get("shoes", [])],
        accessories=[RecommendationItem(**p) for p in recs.get("accessories", [])],
    )

    return RecommendationResponse(
        recommendations=as_model,
        analysisMethod=analysis_method,
        styleAnalysis=analysis if analysis_method == "ai" else None,
        requestId=f"req_{int(datetime.utcnow().timestamp())}",
        timestamp=datetime.utcnow().isoformat() + "Z",
    )
