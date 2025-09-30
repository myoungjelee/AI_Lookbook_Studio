from __future__ import annotations

from fastapi import APIRouter

from ..services.azure_openai_service import azure_openai_service
from ..services.db_recommender import db_pos_recommender
from ..services.embedding_client import embedding_client

router = APIRouter(prefix="/api/recommend", tags=["External Recommendations"])


# 외부 데이터 추천 엔드포인트
@router.post("/external/{slot_name}")
async def recommend_external_slot(
    slot_name: str,
    request: dict
):
    """외부 업로드 이미지에 대한 추천을 제공합니다."""
    try:
        # 슬롯 이름 검증
        if slot_name not in ["top", "pants", "shoes", "outer"]:
            return {"error": "Invalid slot name", "recommendations": []}
        
        # 요청 데이터 검증
        image_data = request.get("image")
        if not image_data or not image_data.get("base64"):
            return {"error": "No image data provided", "recommendations": []}
        
        print(f"🔍 외부 데이터 추천 시작: {slot_name}")
        
        # 1. Azure OpenAI로 이미지 설명 추출
        try:
            description = azure_openai_service.analyze_clothing_item(image_data)
            print(f"🔍 이미지 설명 추출 완료: {description}")
        except Exception as e:
            print(f"❌ 이미지 설명 추출 실패: {e}")
            # 임시로 더미 설명 사용
            description = f"외부 업로드 {slot_name} 아이템"
        
        # 2. 임베딩 서버에서 벡터 생성
        try:
            embedding = embedding_client.get_embedding(description)
            print(f"🔍 임베딩 생성 완료: {len(embedding)}차원")
        except Exception as e:
            print(f"❌ 임베딩 생성 실패: {e}")
            return {"error": "Embedding generation failed", "recommendations": []}
        
        # 3. 벡터 기반 추천 생성
        try:
            recommendations = db_pos_recommender.recommend_by_embedding(
                query_embedding=embedding,
                category=slot_name,
                top_k=5
            )
            print(f"🔍 추천 생성 완료: {len(recommendations)}개")
            
            # RecommendationItem 형태로 변환
            formatted_recommendations = []
            for rec in recommendations:
                formatted_recommendations.append({
                    "id": str(rec.get("id", "")),
                    "pos": rec.get("pos", 0),
                    "title": rec.get("title", ""),
                    "price": rec.get("price", 0),
                    "category": rec.get("category", slot_name),
                    "imageUrl": rec.get("imageUrl", ""),
                    "productUrl": rec.get("productUrl", ""),
                    "tags": rec.get("tags", [])
                })
            
            return {
                "recommendations": formatted_recommendations,
                "description": description,
                "slot": slot_name
            }
            
        except Exception as e:
            print(f"❌ 추천 생성 실패: {e}")
            return {"error": "Recommendation generation failed", "recommendations": []}
            
    except Exception as e:
        print(f"❌ 외부 데이터 추천 전체 실패: {e}")
        return {"error": str(e), "recommendations": []}


