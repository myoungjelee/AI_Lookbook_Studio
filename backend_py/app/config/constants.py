"""
애플리케이션 상수 정의
민감하지 않은 설정값들을 중앙에서 관리
"""

# AI 모델 기본 설정
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image-preview"
DEFAULT_GEMINI_TEMPERATURE = 0.2
DEFAULT_AZURE_OPENAI_API_VERSION = "2024-12-01-preview"

# 서버 기본 설정
DEFAULT_PORT = 3001
DEFAULT_HOST = "0.0.0.0"

# 데이터베이스 기본 설정
DEFAULT_DB_PORT = 5432
DEFAULT_DB_SSLMODE = "require"

# Gemini 고정 프롬프트
DEFAULT_GEMINI_FIXED_PROMPT = """
Wear these clothes naturally. If the image contains clothing with a person form or face integrated, 
extract the clothings design (pattern, texture, silhouette) ONLY, and apply it naturally onto a new, 
AI-generated model. Do not change the original models face/identity/skin tone IF the original model IS the focus. 
If no person is in the original image, or if the clothing is the sole focus, generate an AI model wearing the clothes naturally. 
Preserve natural fit, proportions, lighting, and shadows.
""".strip()

# 환경별 설정
ENVIRONMENT_CONFIGS = {
    "development": {
        "debug": True,
        "log_level": "DEBUG"
    },
    "test": {
        "debug": False,
        "log_level": "INFO"
    },
    "production": {
        "debug": False,
        "log_level": "WARNING"
    }
}
