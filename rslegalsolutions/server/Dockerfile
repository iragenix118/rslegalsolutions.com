# Build stage
FROM node:16-alpine as builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application (if using TypeScript or other build steps)
# RUN npm run build

# Production stage
FROM node:16-alpine

# Install production dependencies only
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/src ./src

# Create necessary directories
RUN mkdir -p /app/uploads /app/logs /app/backups

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5000

# Environment variables
ENV NODE_ENV=production \
    PORT=5000 \
    TZ=UTC

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q --spider http://localhost:5000/health || exit 1

# Labels
LABEL maintainer="RS Legal Solutions <tech@rslegalsolutions.com>"
LABEL version="1.0"
LABEL description="RS Legal Solutions Backend API"

# Start the application
CMD ["node", "src/index.js"]

# Set stop signal
STOPSIGNAL SIGTERM

# Set working directory permissions
RUN chmod 755 /app

# Security hardening
RUN npm audit fix

# Clean up
RUN npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# Set Node.js configurations for production
ENV NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384"

# Enable source maps support
ENV NODE_ENV=production \
    ENABLE_SOURCE_MAPS=true \
    SOURCE_MAP_SUPPORT=true

# Configure logging
ENV LOG_LEVEL=info \
    LOG_FORMAT=json \
    ENABLE_ACCESS_LOG=true

# Performance tuning
ENV NODE_CLUSTER_WORKERS=4 \
    NODE_CLUSTER_ENABLED=true \
    NODE_HEAP_SIZE_MB=2048

# Security configurations
ENV ENABLE_HELMET=true \
    ENABLE_CORS=true \
    ENABLE_RATE_LIMIT=true \
    TRUST_PROXY=true

# Monitoring configurations
ENV ENABLE_METRICS=true \
    METRICS_PORT=9100 \
    ENABLE_HEALTH_CHECK=true

# Volume configuration
VOLUME ["/app/uploads", "/app/logs", "/app/backups"]

# Set locale
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Set timezone
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/UTC /etc/localtime && \
    echo "UTC" > /etc/timezone && \
    apk del tzdata
