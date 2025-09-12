from datetime import datetime
from fastapi import APIRouter
from ..models import (
    RecommendationRequest,
    RecommendationFromFittingRequest,
    RecommendationResponse,
    CategoryRecommendations,
    RecommendationItem,
)
from ..services.catalog import get_catalog_service
from ..services.db_recommender import db_pos_recommender
from ..services.llm_ranker import llm_ranker
from ..services.azure_openai_service import azure_openai_service


router = APIRouter(prefix="/api/recommend", tags=["Recommendations"])


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
def random_products(limit: int = 18, category: str | None = None):
    # Prefer DB-backed products when available, otherwise use catalog JSON
    if db_pos_recommender.available():
        products = list(db_pos_recommender.products)
    else:
        svc = get_catalog_service()
        products = svc.get_all()

    valid_cats = {"top", "pants", "shoes", "accessories"}
    if category:
        catq = (category or "").strip().lower()
        def slot_of(c: str) -> str:
            cl = (c or "").strip().lower()
            if any(k in cl for k in ["top", "상의", "outer", "자켓", "코트", "아우터"]):
                return "top"
            if any(k in cl for k in ["pant", "하의", "바지", "denim", "슬랙스"]):
                return "pants"
            if any(k in cl for k in ["shoe", "신발", "스니커", "부츠", "로퍼"]):
                return "shoes"
            return cl
        filtered = [p for p in products if slot_of(str(p.get("category") or "")) == slot_of(catq)]
        if filtered:
            products = filtered

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
    return result


@router.post("")
def recommend_from_upload(req: RecommendationRequest) -> RecommendationResponse:
    # Analyze style: prefer Azure OpenAI if available
    analysis = {}
    analysis_method = "fallback"
    if azure_openai_service.available():
        try:
            analysis = azure_openai_service.analyze_style_from_images(req.person, req.clothingItems)
            analysis_method = "ai"
        except Exception:
            analysis = {}
            analysis_method = "fallback"
    if not analysis:
        if req.person:
            analysis["overall_style"] = ["casual", "everyday"]
        if req.clothingItems:
            for k in ("top", "pants", "shoes"):
                if getattr(req.clothingItems, k) is not None:
                    analysis.setdefault(k, []).extend([k, "basic", "casual"])

    svc = get_catalog_service()
    opts = req.options or {}
    # get more candidates for potential LLM rerank
    candidate_recs = svc.find_similar(
        analysis,
        max_per_category=(opts.maxPerCategory or 3) * 4 if hasattr(opts, "maxPerCategory") else 12,
        include_score=True,
        min_price=getattr(opts, "minPrice", None),
        max_price=getattr(opts, "maxPrice", None),
        exclude_tags=getattr(opts, "excludeTags", None),
    )

    # Optional LLM rerank (default to Azure OpenAI when configured)
    max_k = (opts.maxPerCategory or 3) if hasattr(opts, "maxPerCategory") else 3
    user_llm_pref = getattr(opts, "useLLMRerank", None)
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
def recommend_from_fitting(req: RecommendationFromFittingRequest) -> RecommendationResponse:
    # For fitting: prefer Azure analysis on generated image
    analysis_method = "fallback"
    analysis = {"overall_style": ["casual", "relaxed"], "categories": ["top", "pants", "shoes"]}
    if azure_openai_service.available() and req.generatedImage:
        try:
            analysis = azure_openai_service.analyze_virtual_try_on(req.generatedImage)
            analysis_method = "ai"
        except Exception:
            analysis_method = "fallback"
    svc = get_catalog_service()
    opts = req.options or {}
    candidate_recs = svc.find_similar(
        analysis,
        max_per_category=(opts.maxPerCategory or 3) * 4 if hasattr(opts, "maxPerCategory") else 12,
        include_score=True,
        min_price=getattr(opts, "minPrice", None),
        max_price=getattr(opts, "maxPrice", None),
        exclude_tags=getattr(opts, "excludeTags", None),
    )

    max_k = (opts.maxPerCategory or 3) if hasattr(opts, "maxPerCategory") else 3
    user_llm_pref = getattr(opts, "useLLMRerank", None)
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
