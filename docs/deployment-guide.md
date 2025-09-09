# Deployment Guide

Comprehensive deployment guide for the AI Virtual Try-On application across different environments and platforms.

## Overview

Note: Backend is now Python FastAPI (`backend_py`). Any references to the legacy Node backend in this document are for historical context and will be revised. For current Docker Compose, see `docker-compose.yml` and `docker-compose.dev.yml` which build from `./backend_py`.

The AI Virtual Try-On application consists of two main components:
- **Backend**: Node.js API server with AI services
- **Frontend**: React application with static assets

Both components can be deployed independently, allowing for flexible scaling and deployment strategies.

## Prerequisites

### General Requirements
- Node.js 18+ (for building)
- Docker (for containerized deployment)
- Git (for source code management)

### Environment-Specific Requirements
- **Development**: Local development environment
- **Staging**: Testing environment with production-like setup
- **Production**: High-availability production environment

### API Keys and Services
- Google Gemini API key (required)
- Azure OpenAI credentials (optional, for enhanced recommendations)

## Environment Configuration

### Backend Environment Variables

Create `.env` files for each environment:

#### Development (`.env.development`)
```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# AI Services
GEMINI_API_KEY=your_development_gemini_key
AZURE_OPENAI_ENDPOINT=https://your-dev-resource.openai.azure.com
AZURE_OPENAI_KEY=your_development_azure_key
AZURE_OPENAI_DEPLOYMENT_ID=gpt-4-vision-preview

# CORS
FRONTEND_URL=http://localhost:5173
```

#### Staging (`.env.staging`)
```env
NODE_ENV=staging
PORT=3000
LOG_LEVEL=info

# AI Services
GEMINI_API_KEY=your_staging_gemini_key
AZURE_OPENAI_ENDPOINT=https://your-staging-resource.openai.azure.com
AZURE_OPENAI_KEY=your_staging_azure_key
AZURE_OPENAI_DEPLOYMENT_ID=gpt-4-vision-preview

# CORS
FRONTEND_URL=https://staging-frontend.example.com
```

#### Production (`.env.production`)
```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn

# AI Services
GEMINI_API_KEY=your_production_gemini_key
AZURE_OPENAI_ENDPOINT=https://your-prod-resource.openai.azure.com
AZURE_OPENAI_KEY=your_production_azure_key
AZURE_OPENAI_DEPLOYMENT_ID=gpt-4-vision-preview

# CORS
FRONTEND_URL=https://your-domain.com

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Frontend Environment Variables

#### Development (`.env.development`)
```env
VITE_API_URL=http://localhost:3001
VITE_DEBUG=true
```

#### Staging (`.env.staging`)
```env
VITE_API_URL=https://staging-api.example.com
VITE_DEBUG=false
```

#### Production (`.env.production`)
```env
VITE_API_URL=https://api.example.com
VITE_DEBUG=false
```

## Local Development Deployment

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-virtual-try-on
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd backend
   npm install
   
   # Frontend
   cd ../frontend
   npm install
   ```

3. **Configure environment**
   ```bash
   # Backend
   cd backend
   cp .env.example .env
   # Edit .env with your API keys
   
   # Frontend
   cd ../frontend
   cp .env.example .env
   # Edit .env with backend URL
   ```

4. **Start development servers**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - Health check: http://localhost:3001/health

## Docker Deployment

### Single Container Setup

#### Backend Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start application
CMD ["npm", "start"]
```

#### Frontend Dockerfile
```dockerfile
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

#### Frontend nginx.conf
```nginx
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    sendfile        on;
    keepalive_timeout  65;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    server {
        listen       80;
        server_name  localhost;
        
        root   /usr/share/nginx/html;
        index  index.html index.htm;
        
        # Handle client-side routing
        location / {
            try_files $uri $uri/ /index.html;
        }
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }
}
```

### Docker Compose Setup

#### docker-compose.yml
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - ./backend/.env.production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

  # Optional: Reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - backend
      - frontend
    restart: unless-stopped
```

#### Development docker-compose.dev.yml
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    env_file:
      - ./backend/.env.development
    
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://localhost:3001
```

### Running with Docker Compose

```bash
# Development
docker-compose -f docker-compose.dev.yml up --build

# Production
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Cloud Platform Deployment

### AWS Deployment

#### Using AWS ECS (Elastic Container Service)

1. **Build and push Docker images**
   ```bash
   # Build images
   docker build -t ai-virtual-try-on-backend ./backend
   docker build -t ai-virtual-try-on-frontend ./frontend
   
   # Tag for ECR
   docker tag ai-virtual-try-on-backend:latest 123456789012.dkr.ecr.us-west-2.amazonaws.com/ai-virtual-try-on-backend:latest
   docker tag ai-virtual-try-on-frontend:latest 123456789012.dkr.ecr.us-west-2.amazonaws.com/ai-virtual-try-on-frontend:latest
   
   # Push to ECR
   aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-west-2.amazonaws.com
   docker push 123456789012.dkr.ecr.us-west-2.amazonaws.com/ai-virtual-try-on-backend:latest
   docker push 123456789012.dkr.ecr.us-west-2.amazonaws.com/ai-virtual-try-on-frontend:latest
   ```

2. **Create ECS task definition**
   ```json
   {
     "family": "ai-virtual-try-on",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "1024",
     "memory": "2048",
     "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
     "containerDefinitions": [
       {
         "name": "backend",
         "image": "123456789012.dkr.ecr.us-west-2.amazonaws.com/ai-virtual-try-on-backend:latest",
         "portMappings": [
           {
             "containerPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {
             "name": "NODE_ENV",
             "value": "production"
           }
         ],
         "secrets": [
           {
             "name": "GEMINI_API_KEY",
             "valueFrom": "arn:aws:secretsmanager:us-west-2:123456789012:secret:gemini-api-key"
           }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/ai-virtual-try-on",
             "awslogs-region": "us-west-2",
             "awslogs-stream-prefix": "backend"
           }
         }
       }
     ]
   }
   ```

#### Using AWS Lambda (Serverless)

For the backend API, you can use AWS Lambda with API Gateway:

1. **Install Serverless Framework**
   ```bash
   npm install -g serverless
   ```

2. **Create serverless.yml**
   ```yaml
   service: ai-virtual-try-on-api
   
   provider:
     name: aws
     runtime: nodejs18.x
     region: us-west-2
     environment:
       NODE_ENV: production
       GEMINI_API_KEY: ${env:GEMINI_API_KEY}
     
   functions:
     api:
       handler: src/lambda.handler
       timeout: 30
       memorySize: 1024
       events:
         - http:
             path: /{proxy+}
             method: ANY
             cors: true
   
   plugins:
     - serverless-offline
   ```

3. **Create Lambda handler**
   ```javascript
   // src/lambda.js
   import serverless from 'serverless-http';
   import app from './app.js';
   
   export const handler = serverless(app);
   ```

#### Frontend on AWS S3 + CloudFront

1. **Build the frontend**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deploy to S3**
   ```bash
   aws s3 sync dist/ s3://your-bucket-name --delete
   ```

3. **Configure CloudFront distribution**
   ```json
   {
     "Origins": [
       {
         "DomainName": "your-bucket-name.s3.amazonaws.com",
         "Id": "S3-your-bucket-name",
         "S3OriginConfig": {
           "OriginAccessIdentity": ""
         }
       }
     ],
     "DefaultCacheBehavior": {
       "TargetOriginId": "S3-your-bucket-name",
       "ViewerProtocolPolicy": "redirect-to-https",
       "Compress": true,
       "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
     },
     "CustomErrorResponses": [
       {
         "ErrorCode": 404,
         "ResponseCode": 200,
         "ResponsePagePath": "/index.html"
       }
     ]
   }
   ```

### Google Cloud Platform (GCP)

#### Using Google Cloud Run

1. **Build and push to Container Registry**
   ```bash
   # Configure Docker for GCP
   gcloud auth configure-docker
   
   # Build and push backend
   docker build -t gcr.io/your-project-id/ai-virtual-try-on-backend ./backend
   docker push gcr.io/your-project-id/ai-virtual-try-on-backend
   
   # Build and push frontend
   docker build -t gcr.io/your-project-id/ai-virtual-try-on-frontend ./frontend
   docker push gcr.io/your-project-id/ai-virtual-try-on-frontend
   ```

2. **Deploy to Cloud Run**
   ```bash
   # Deploy backend
   gcloud run deploy ai-virtual-try-on-backend \
     --image gcr.io/your-project-id/ai-virtual-try-on-backend \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars NODE_ENV=production \
     --set-secrets GEMINI_API_KEY=gemini-api-key:latest
   
   # Deploy frontend
   gcloud run deploy ai-virtual-try-on-frontend \
     --image gcr.io/your-project-id/ai-virtual-try-on-frontend \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

### Microsoft Azure

#### Using Azure Container Instances

1. **Create resource group**
   ```bash
   az group create --name ai-virtual-try-on --location eastus
   ```

2. **Deploy containers**
   ```bash
   # Deploy backend
   az container create \
     --resource-group ai-virtual-try-on \
     --name backend \
     --image your-registry.azurecr.io/ai-virtual-try-on-backend:latest \
     --ports 3000 \
     --environment-variables NODE_ENV=production \
     --secure-environment-variables GEMINI_API_KEY=your-api-key
   
   # Deploy frontend
   az container create \
     --resource-group ai-virtual-try-on \
     --name frontend \
     --image your-registry.azurecr.io/ai-virtual-try-on-frontend:latest \
     --ports 80
   ```

## Static Hosting Platforms

### Vercel

#### Backend (API Routes)
```bash
cd backend
npm install -g vercel
vercel --prod
```

#### Frontend
```bash
cd frontend
vercel --prod
```

#### vercel.json (Frontend)
```json
{
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "env": {
    "VITE_API_URL": "https://your-backend.vercel.app"
  }
}
```

### Netlify

#### Frontend Deployment
```bash
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

#### netlify.toml
```toml
[build]
  publish = "dist"
  command = "npm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  VITE_API_URL = "https://your-backend-api.com"
```

### Railway

#### Deploy with Railway CLI
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy backend
cd backend
railway up

# Deploy frontend
cd ../frontend
railway up
```

## Production Considerations

### Security

1. **HTTPS/TLS Configuration**
   ```nginx
   server {
       listen 443 ssl http2;
       server_name your-domain.com;
       
       ssl_certificate /path/to/certificate.crt;
       ssl_certificate_key /path/to/private.key;
       
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
       ssl_prefer_server_ciphers off;
   }
   ```

2. **Environment Variable Security**
   - Use secret management services (AWS Secrets Manager, Azure Key Vault)
   - Never commit API keys to version control
   - Rotate API keys regularly

3. **Network Security**
   - Configure firewalls and security groups
   - Use VPCs/VNets for network isolation
   - Implement rate limiting and DDoS protection

### Monitoring and Logging

1. **Application Monitoring**
   ```javascript
   // Add to backend app.js
   import prometheus from 'prom-client';
   
   const httpRequestDuration = new prometheus.Histogram({
     name: 'http_request_duration_seconds',
     help: 'Duration of HTTP requests in seconds',
     labelNames: ['method', 'route', 'status']
   });
   ```

2. **Health Checks**
   ```javascript
   // Enhanced health check
   app.get('/health', async (req, res) => {
     const health = {
       status: 'ok',
       timestamp: new Date().toISOString(),
       uptime: process.uptime(),
       services: {
         gemini: geminiService.isAvailable(),
         azure: openaiService.isAvailable()
       }
     };
     
     const isHealthy = Object.values(health.services).every(Boolean);
     res.status(isHealthy ? 200 : 503).json(health);
   });
   ```

3. **Logging Configuration**
   ```javascript
   import winston from 'winston';
   
   const logger = winston.createLogger({
     level: process.env.LOG_LEVEL || 'info',
     format: winston.format.combine(
       winston.format.timestamp(),
       winston.format.errors({ stack: true }),
       winston.format.json()
     ),
     transports: [
       new winston.transports.File({ filename: 'error.log', level: 'error' }),
       new winston.transports.File({ filename: 'combined.log' })
     ]
   });
   ```

### Performance Optimization

1. **Caching Strategy**
   ```javascript
   // Redis caching
   import redis from 'redis';
   const client = redis.createClient();
   
   const cacheMiddleware = (duration) => {
     return async (req, res, next) => {
       const key = req.originalUrl;
       const cached = await client.get(key);
       
       if (cached) {
         return res.json(JSON.parse(cached));
       }
       
       res.sendResponse = res.json;
       res.json = (body) => {
         client.setex(key, duration, JSON.stringify(body));
         res.sendResponse(body);
       };
       
       next();
     };
   };
   ```

2. **Load Balancing**
   ```nginx
   upstream backend {
       server backend1:3000;
       server backend2:3000;
       server backend3:3000;
   }
   
   server {
       location /api/ {
           proxy_pass http://backend;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

### Scaling Considerations

1. **Horizontal Scaling**
   - Use container orchestration (Kubernetes, Docker Swarm)
   - Implement stateless application design
   - Use external session storage (Redis, database)

2. **Auto-scaling Configuration**
   ```yaml
   # Kubernetes HPA
   apiVersion: autoscaling/v2
   kind: HorizontalPodAutoscaler
   metadata:
     name: ai-virtual-try-on-hpa
   spec:
     scaleTargetRef:
       apiVersion: apps/v1
       kind: Deployment
       name: ai-virtual-try-on-backend
     minReplicas: 2
     maxReplicas: 10
     metrics:
     - type: Resource
       resource:
         name: cpu
         target:
           type: Utilization
           averageUtilization: 70
   ```

## Troubleshooting

### Common Deployment Issues

1. **Port binding errors**
   - Ensure ports are not already in use
   - Check firewall and security group settings
   - Verify container port mappings

2. **Environment variable issues**
   - Verify all required variables are set
   - Check variable names and values
   - Ensure secrets are properly configured

3. **API connectivity issues**
   - Verify network connectivity between services
   - Check CORS configuration
   - Validate API endpoints and routes

4. **Memory/CPU issues**
   - Monitor resource usage
   - Adjust container resource limits
   - Implement proper error handling

### Debugging Commands

```bash
# Docker debugging
docker logs <container-id>
docker exec -it <container-id> /bin/sh

# Kubernetes debugging
kubectl logs <pod-name>
kubectl describe pod <pod-name>
kubectl exec -it <pod-name> -- /bin/sh

# System monitoring
htop
docker stats
kubectl top pods
```

## Rollback Procedures

### Docker Deployment Rollback
```bash
# Tag current version
docker tag current-image:latest current-image:backup

# Pull previous version
docker pull previous-image:latest

# Stop current containers
docker-compose down

# Start with previous version
docker-compose up -d
```

### Kubernetes Rollback
```bash
# Check rollout history
kubectl rollout history deployment/ai-virtual-try-on-backend

# Rollback to previous version
kubectl rollout undo deployment/ai-virtual-try-on-backend

# Rollback to specific revision
kubectl rollout undo deployment/ai-virtual-try-on-backend --to-revision=2
```

This deployment guide provides comprehensive instructions for deploying the AI Virtual Try-On application across various environments and platforms. Choose the deployment strategy that best fits your requirements, infrastructure, and scaling needs.
