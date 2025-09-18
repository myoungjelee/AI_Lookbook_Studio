#!/bin/bash
# GitHub Secrets 검증 스크립트

set -e

echo "🔍 Validating GitHub Secrets..."

# Required secrets 목록
REQUIRED_SECRETS=(
  "AZURE_CLIENT_ID"
  "AZURE_CLIENT_SECRET"
  "AZURE_TENANT_ID"
  "AZURE_SUBSCRIPTION_ID"
  "AZURE_RESOURCE_GROUP"
  "ACR_LOGIN_SERVER"
  "ACR_USERNAME"
  "ACR_PASSWORD"
  "BACKEND_WEBAPP_NAME"
  "FRONTEND_STATICAPP_NAME"
  "AZURE_STATIC_WEB_APPS_API_TOKEN"
)

TEST_SECRETS=(
  "TEST_AZURE_OPENAI_ENDPOINT"
  "TEST_AZURE_OPENAI_KEY"
  "TEST_AZURE_OPENAI_DEPLOYMENT_ID"
  "TEST_BACKEND_URL"
  "TEST_FRONTEND_URL"
  "TEST_GEMINI_API_KEY"
)

PROD_SECRETS=(
  "AZURE_OPENAI_ENDPOINT"
  "AZURE_OPENAI_KEY"
  "AZURE_OPENAI_DEPLOYMENT_ID"
  "FRONTEND_API_URL_PROD"
  "GEMINI_API_KEY"
)

MISSING_SECRETS=()

# 공통 secrets 검증
for secret in "${REQUIRED_SECRETS[@]}"; do
  if [[ -z "${!secret}" ]]; then
    MISSING_SECRETS+=("$secret")
  fi
done

# Test secrets 검증
for secret in "${TEST_SECRETS[@]}"; do
  if [[ -z "${!secret}" ]]; then
    MISSING_SECRETS+=("$secret")
  fi
done

# Production secrets 검증
for secret in "${PROD_SECRETS[@]}"; do
  if [[ -z "${!secret}" ]]; then
    MISSING_SECRETS+=("$secret")
  fi
done

# 결과 출력
if [ ${#MISSING_SECRETS[@]} -eq 0 ]; then
  echo "✅ All required secrets are configured"
else
  echo "❌ Missing secrets:"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo "  - $secret"
  done
  exit 1
fi

echo "🎯 Secrets validation completed successfully"
