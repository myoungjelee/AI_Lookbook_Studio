# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# 환경변수 설정
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# package 파일들 복사
COPY package*.json ./
COPY .npmrc ./

# 의존성 설치
RUN npm install --legacy-peer-deps

# 소스 코드 복사
COPY . .

# 단순 빌드 (복잡한 스크립트 우회)
RUN npm run build:simple

# Production stage
FROM nginx:alpine AS production

# Nginx 설정
ARG NGINX_CONF=nginx.prod.conf
COPY ${NGINX_CONF} /etc/nginx/nginx.conf

# 빌드된 파일 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# 보안 설정
RUN addgroup -g 1001 -S frontend && \
    adduser -S frontend -u 1001 -G frontend && \
    chown -R frontend:frontend /usr/share/nginx/html && \
    chown -R frontend:frontend /var/cache/nginx && \
    chown -R frontend:frontend /var/run && \
    chown -R frontend:frontend /etc/nginx/conf.d

USER frontend

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
