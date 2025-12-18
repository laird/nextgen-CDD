# =============================================================================
# Dashboard UI - Multi-stage Dockerfile
# =============================================================================
# Builds and serves the React frontend using nginx
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build argument for API URL
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production Stage
# -----------------------------------------------------------------------------
FROM nginx:alpine AS production

# Copy custom nginx config template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Make config.js writable for runtime substitution
RUN chmod 666 /usr/share/nginx/html/config.js

# Default backend URL (can be overridden at runtime)
ENV BACKEND_URL=https://thesis-validator-792842314050.us-central1.run.app
# API_URL for browser-side API calls (set this when using gcloud run services proxy)
ENV API_URL=

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Create startup script that:
# 1. Substitutes BACKEND_URL in nginx config
# 2. Substitutes API_URL in config.js (in-place replacement)
# 3. Starts nginx
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'sed "s|BACKEND_URL_PLACEHOLDER|${BACKEND_URL}|g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'sed -i "s|API_URL_PLACEHOLDER|${API_URL}|g" /usr/share/nginx/html/config.js' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
