# backend_py/app/middleware/logging.py
import logging
import time
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# 애플리케이션 레벨(main.py)에서 로깅 설정을 수행하므로 여기서는 로거만 참조
logger = logging.getLogger(__name__)

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Log request
        logger.info(f"Request: {request.method} {request.url.path}")

        response = await call_next(request)

        # Log response
        process_time = time.time() - start_time
        logger.info(f"Response: {response.status_code} - {process_time:.4f}s")

        return response
