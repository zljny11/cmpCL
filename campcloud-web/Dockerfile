FROM node:20-bookworm-slim AS build

WORKDIR /app/campcloud-web

ENV npm_config_registry=https://registry.npmmirror.com \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY campcloud-web/package.json campcloud-web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY campcloud-web/ ./
COPY license/ ../license/

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY campcloud-web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/campcloud-web/dist /usr/share/nginx/html

EXPOSE 80
