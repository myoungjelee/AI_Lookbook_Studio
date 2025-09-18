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
ROLE: virtual try-on stylist.
RULES (HIGH PRIORITY):
1. When PERSON image is provided, use that exact person – same face, skin tone, body proportions, background, and pose. No new model generation.
2. For each garment image, isolate only the garment pixels. Remove/ignore any people, body parts, or unrelated background inside the garment reference.
3. Preserve every provided garment completely (no cropping sleeves/hem). Fit it realistically onto the BASE PERSON in the correct category slot.
4. Layer order must be: TOP → OUTER (over the top) → PANTS → SHOES. Accessories go outside clothing if present.
5. Maintain realistic lighting/shadows and prevent garment collisions or missing layers.
6. If a garment cannot be applied without inventing a new human, fail gracefully (do not fabricate).
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
