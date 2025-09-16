#!/bin/bash
# 환경별 변수 매핑 헬퍼 스크립트

set -e

ENVIRONMENT=${1:-"test"}

echo "🔧 Environment Variable Mapper for: $ENVIRONMENT"

case $ENVIRONMENT in
  "test")
    echo "📋 Test Environment Variables:"
    echo "BACKEND_APP_NAME=7ai-team1-backend-test"
    echo "BACKEND_URL=$TEST_BACKEND_URL"
    echo "FRONTEND_URL=$TEST_FRONTEND_URL"
    echo "AZURE_OPENAI_ENDPOINT=$TEST_AZURE_OPENAI_ENDPOINT"
    echo "AZURE_OPENAI_KEY=$TEST_AZURE_OPENAI_KEY"
    echo "AZURE_OPENAI_DEPLOYMENT_ID=$TEST_AZURE_OPENAI_DEPLOYMENT_ID"
    echo "GEMINI_API_KEY=$TEST_GEMINI_API_KEY"
    echo "NODE_ENV=test"
    ;;
  "production")
    echo "📋 Production Environment Variables:"
    echo "BACKEND_APP_NAME=$BACKEND_WEBAPP_NAME"
    echo "BACKEND_URL=$FRONTEND_API_URL_PROD"
    echo "FRONTEND_URL=https://$FRONTEND_STATICAPP_NAME.azurestaticapps.net"
    echo "AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT"
    echo "AZURE_OPENAI_KEY=$AZURE_OPENAI_KEY"
    echo "AZURE_OPENAI_DEPLOYMENT_ID=$AZURE_OPENAI_DEPLOYMENT_ID"
    echo "GEMINI_API_KEY=$GEMINI_API_KEY"
    echo "NODE_ENV=production"
    ;;
  "local")
    echo "📋 Local Development Environment Variables:"
    echo "BACKEND_APP_NAME=localhost"
    echo "BACKEND_URL=http://localhost:3001"
    echo "FRONTEND_URL=http://localhost:5173"
    echo "AZURE_OPENAI_ENDPOINT=your-dev-endpoint"
    echo "AZURE_OPENAI_KEY=your-dev-key"
    echo "AZURE_OPENAI_DEPLOYMENT_ID=your-dev-model"
    echo "GEMINI_API_KEY=your-dev-gemini-key"
    echo "NODE_ENV=development"
    ;;
  *)
    echo "❌ Unknown environment: $ENVIRONMENT"
    echo "Valid options: test, production, local"
    exit 1
    ;;
esac

echo "✅ Environment mapping completed for: $ENVIRONMENT"
