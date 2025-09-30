# python
# 파일: backend_py/app/routes/health.py
from fastapi import APIRouter, HTTPException
import asyncpg
import os
import asyncio
from datetime import datetime

router = APIRouter(tags=["health"])

async def check_database_connection():
    """PostgreSQL 데이터베이스 연결 상태를 확인합니다."""
    try:
        db_host = os.getenv('DB_HOST')
        db_user = os.getenv('DB_USER')
        db_password = os.getenv('DB_PASSWORD')
        db_name = os.getenv('DB_NAME')
        db_port = int(os.getenv('DB_PORT'))

        dsn = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}?sslmode=require"

        conn = await asyncio.wait_for(asyncpg.connect(dsn), timeout=10.0)
        try:
            result = await conn.fetchval("SELECT 1")
        finally:
            await conn.close()

        if result == 1:
            return {
                "status": "healthy",
                "connection": "successful",
                "query_test": "passed",
                "host": db_host,
                "database": db_name,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
        return {
            "status": "unhealthy",
            "connection": "successful",
            "query_test": "failed",
            "error": "Query did not return expected result",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    except asyncio.TimeoutError:
        return {
            "status": "unhealthy",
            "connection": "timeout",
            "error": "Database connection timeout (10s)",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "connection": "failed",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

@router.get("/health/database")
async def database_health():
    """데이터베이스 연결 상태만 확인하는 전용 엔드포인트"""
    db_status = await check_database_connection()
    if db_status["status"] == "healthy":
        return {
            "database": db_status,
            "overall_status": "healthy",
        }
    raise HTTPException(
        status_code=503,
        detail={
            "database": db_status,
            "overall_status": "unhealthy",
        },
    )

@router.get("/health")
async def enhanced_health_check():
    """전체 시스템 헬스체크 \(DB 포함\)"""
    try:
        health_info = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "AI Virtual Try-On Backend",
            "version": "1.0.0",
            "environment": os.getenv("NODE_ENV", "production"),
        }

        db_status = await check_database_connection()
        health_info["database"] = db_status

        if db_status["status"] == "unhealthy":
            health_info["status"] = "degraded"
            health_info["warnings"] = ["Database connection issues detected"]

        return health_info

    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
