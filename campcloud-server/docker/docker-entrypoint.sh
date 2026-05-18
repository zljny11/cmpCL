#!/usr/bin/env sh

set -eu

echo "[campcloud-server] generating Prisma client"
npx prisma generate

echo "[campcloud-server] applying database migrations"
npx prisma migrate deploy

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[campcloud-server] seeding database"
  npm run prisma:seed
fi

echo "[campcloud-server] starting application"
exec node dist/src/main.js
