FROM node:22-bookworm-slim AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app /app

RUN chmod +x ./docker/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker/docker-entrypoint.sh"]
