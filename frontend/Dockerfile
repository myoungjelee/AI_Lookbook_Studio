# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# 환경변수 설정
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# package.json 복사 및 의존성 설치
COPY package*.json ./
COPY .npmrc ./

# 호환 버전으로 수정 (Docker 내에서만)
RUN sed -i 's/"vite": ".*"/"vite": "^5.4.0"/' package.json && \
    sed -i 's/"react": ".*"/"react": "^18.2.0"/' package.json && \
    sed -i 's/"react-dom": ".*"/"react-dom": "^18.2.0"/' package.json

RUN npm install --legacy-peer-deps

# 소스 복사 및 빌드
COPY . .
# cross-env 우회하고 직접 빌드
RUN NODE_ENV=production npx vite build

# Production stage
FROM nginx:alpine AS production
ARG NGINX_CONF=nginx.prod.conf
COPY ${NGINX_CONF} /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# 보안 설정
RUN addgroup -g 1001 -S frontend && \
    adduser -S frontend -u 1001 -G frontend && \
    chown -R frontend:frontend /usr/share/nginx/html
USER frontend

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
