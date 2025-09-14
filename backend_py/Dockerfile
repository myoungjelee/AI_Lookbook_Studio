# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# 환경변수 설정
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# package 파일들 복사
COPY package*.json ./
COPY .npmrc ./

# 호환 버전으로 임시 수정
RUN node -e "
const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
pkg.devDependencies.vite = '^5.4.0';
pkg.dependencies.react = '^18.2.0';
pkg.dependencies['react-dom'] = '^18.2.0';
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# 의존성 설치
RUN npm install --legacy-peer-deps

# 소스 코드 복사
COPY . .

# 빌드 실행 (직접 실행)
RUN ./node_modules/.bin/vite build

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
