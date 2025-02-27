# Build stage
FROM node:16-alpine as build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy build files from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q --spider http://localhost/ || exit 1

# Labels
LABEL maintainer="RS Legal Solutions <tech@rslegalsolutions.com>"
LABEL version="1.0"
LABEL description="RS Legal Solutions Frontend Application"

# Environment variables
ENV NODE_ENV=production
ENV REACT_APP_API_URL=http://api.rslegalsolutions.com

# Set user
USER nginx

# Set working directory
WORKDIR /usr/share/nginx/html

# Optimize for production
RUN rm -rf /var/cache/apk/* && \
    rm -rf /tmp/*

# Security headers
RUN echo "add_header X-Frame-Options DENY;" >> /etc/nginx/conf.d/default.conf && \
    echo "add_header X-Content-Type-Options nosniff;" >> /etc/nginx/conf.d/default.conf && \
    echo "add_header X-XSS-Protection \"1; mode=block\";" >> /etc/nginx/conf.d/default.conf && \
    echo "add_header Content-Security-Policy \"default-src 'self';\";" >> /etc/nginx/conf.d/default.conf

# Cache control
RUN echo "location ~* \\.(?:css|js|jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc)$ {" >> /etc/nginx/conf.d/default.conf && \
    echo "    expires 1M;" >> /etc/nginx/conf.d/default.conf && \
    echo "    access_log off;" >> /etc/nginx/conf.d/default.conf && \
    echo "    add_header Cache-Control \"public\";" >> /etc/nginx/conf.d/default.conf && \
    echo "}" >> /etc/nginx/conf.d/default.conf

# Gzip compression
RUN echo "gzip on;" >> /etc/nginx/conf.d/default.conf && \
    echo "gzip_vary on;" >> /etc/nginx/conf.d/default.conf && \
    echo "gzip_min_length 10240;" >> /etc/nginx/conf.d/default.conf && \
    echo "gzip_proxied expired no-cache no-store private auth;" >> /etc/nginx/conf.d/default.conf && \
    echo "gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml;" >> /etc/nginx/conf.d/default.conf
