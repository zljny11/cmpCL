FROM node:20-bookworm-slim AS base

WORKDIR /app

ENV npm_config_registry=https://registry.npmmirror.com \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=base /app /app

RUN chmod +x ./docker/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker/docker-entrypoint.sh"]
