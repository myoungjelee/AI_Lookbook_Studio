# Python 3.11+ 기반 이미지 사용
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 의존성 업데이트 및 설치
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt 복사 및 Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# Environment can be passed as build arg
ARG ENVIRONMENT=prod
ENV ENV_FILE=.env.${ENVIRONMENT}

# 포트 3001 노출
EXPOSE 3001

# 환경 변수 설정
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# FastAPI 애플리케이션 실행 (모듈 경로 수정)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3001"]
