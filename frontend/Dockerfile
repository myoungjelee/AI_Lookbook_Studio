# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# 환경변수 설정
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# 안정 버전 package.json 생성
COPY package*.json ./
COPY .npmrc ./

# 안정 버전으로 강제 설정
RUN cat > package.json << 'EOF'
{
  "name": "ai-virtual-try-on-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "html2canvas": "^1.4.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.2.2",
    "vite": "^5.4.8"
  }
}
EOF

RUN npm install --legacy-peer-deps

# 소스 복사 및 빌드
COPY . .
RUN npm run build

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
