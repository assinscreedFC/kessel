#!/bin/sh
set -e

# Entrypoint du conteneur api (Plan 05, FOUND-04).
#
# ORDRE DE MIGRATION CANONIQUE (prouvé Wave 4, NE PAS inverser) :
#   1. prisma db push  -> cree `organization` (miroir Better Auth) + OrgNote + FK.
#      db push est DESTRUCTIF (DROP des tables hors schema Prisma) -> EN PREMIER.
#   2. node migrate.js -> runBetterAuthMigrations() ADDITIF : cree user/session/account/
#      member/invitation/verification ; respecte `organization` pre-creee.
#   Inverser droperait user/session/account.
#
# DATABASE_URL et BETTER_AUTH_SECRET sont fournis par l'environnement (compose .env) — jamais hardcodes.

echo "[entrypoint] 1/3 prisma db push (schema metier, destructif, en premier)"
cd /app/packages/shared/db
node /app/node_modules/prisma/build/index.js db push \
  --schema prisma/schema.prisma \
  --skip-generate \
  --accept-data-loss

echo "[entrypoint] 2/3 better-auth migrate (additif)"
cd /app
node dist/apps/api/migrate.js

echo "[entrypoint] 3/3 start NestJS api"
exec node dist/apps/api/main.js
