# Frontend Dockerfile for AI Virtual Try-On application

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Accept build-time API URL for embedding into Vite build
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Copy package files
COPY package*.json ./

# Install dependencies (fallback if no lockfile)
RUN npm ci || npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build:prod

# Production stage - Use nginx to serve static files
FROM nginx:alpine AS production

# Select nginx config per environment (default: prod)
ARG NGINX_CONF=nginx.prod.conf

# Copy selected nginx configuration
COPY ${NGINX_CONF} /etc/nginx/nginx.conf

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S frontend && \
    adduser -S frontend -u 1001 -G frontend

# Set permissions
RUN chown -R frontend:frontend /usr/share/nginx/html && \
    chown -R frontend:frontend /var/cache/nginx && \
    chown -R frontend:frontend /var/log/nginx && \
    chown -R frontend:frontend /etc/nginx/conf.d

# Create nginx pid directory
RUN mkdir -p /var/run/nginx && \
    chown -R frontend:frontend /var/run/nginx

# Switch to non-root user
USER frontend

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
