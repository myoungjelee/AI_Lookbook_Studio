from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ApiFile(BaseModel):
    base64: str
    mimeType: str


class ClothingItems(BaseModel):
    top: Optional[ApiFile] = None
    pants: Optional[ApiFile] = None
    shoes: Optional[ApiFile] = None
    outer: Optional[ApiFile] = None


class VirtualTryOnRequest(BaseModel):
    # Person can be omitted to allow outfit-only composition
    person: Optional[ApiFile] = None
    clothingItems: ClothingItems
    prompt: Optional[str] = None


class VirtualTryOnResponse(BaseModel):
    generatedImage: str
    requestId: Optional[str] = None
    timestamp: Optional[str] = None


class RecommendationOptions(BaseModel):
    maxPerCategory: Optional[int] = Field(default=3, ge=1, le=20)
    minPrice: Optional[int] = Field(default=None, ge=0)
    maxPrice: Optional[int] = Field(default=None, ge=0)
    excludeTags: Optional[List[str]] = None
    # When True, uses Azure OpenAI LLM to rerank candidate recommendations.
    # When omitted (None), the backend will enable reranking by default if Azure OpenAI is configured.
    useLLMRerank: Optional[bool] = None


class RecommendationRequest(BaseModel):
    person: Optional[ApiFile] = None
    clothingItems: Optional[ClothingItems] = None
    generatedImage: Optional[str] = None
    options: Optional[RecommendationOptions] = None
    selectedProductIds: Optional[Dict[str, str]] = None


class RecommendationFromFittingRequest(BaseModel):
    generatedImage: str
    originalClothingItems: Optional[ClothingItems] = None
    options: Optional[RecommendationOptions] = None
    selectedProductIds: Optional[Dict[str, str]] = None


class RecommendationItem(BaseModel):
    id: str
    pos: Optional[int] = None
    title: str
    price: int
    tags: List[str]
    category: str
    imageUrl: Optional[str] = None
    productUrl: Optional[str] = None
    score: Optional[float] = None


class CategoryRecommendations(BaseModel):
    top: List[RecommendationItem]
    pants: List[RecommendationItem]
    shoes: List[RecommendationItem]
    outer: List[RecommendationItem]
    accessories: List[RecommendationItem]


class RecommendationResponse(BaseModel):
    recommendations: CategoryRecommendations | List[RecommendationItem]
    analysisMethod: Optional[str] = None
    styleAnalysis: Optional[Dict] = None
    requestId: Optional[str] = None
    timestamp: Optional[str] = None
