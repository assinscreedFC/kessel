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
# prisma est un devDep de @kessel/db confine dans le store .pnpm (pas de symlink top-level sous
# l'isolement strict pnpm). On localise son entree CLI dans le store au boot (pas de chemin code en dur).
cd /app/packages/shared/db
PRISMA_BIN=$(find /app/node_modules/.pnpm -path "*/prisma/build/index.js" 2>/dev/null | head -n 1)
if [ -z "$PRISMA_BIN" ]; then
  echo "[entrypoint] ERREUR : binaire prisma introuvable dans /app/node_modules/.pnpm" >&2
  exit 1
fi
# --url passe la connexion directement : pas besoin de prisma.config.ts (absent du runtime,
# il importe "prisma/config" non resolvable ici). DATABASE_URL fourni par l'env compose.
node "$PRISMA_BIN" db push \
  --schema prisma/schema.prisma \
  --url "$DATABASE_URL" \
  --accept-data-loss

echo "[entrypoint] 2/3 better-auth migrate (additif, idempotent)"
cd /app
# better-auth runMigrations() lance ses CREATE TABLE en PARALLELE (Promise.all). Postgres cree un
# type composite par table : deux CREATE concurrents entrent en collision sur le type partage `user`
# (pg_type_typname_nsp_index) et la batch avorte. Chaque passe est ADDITIVE (le diff better-auth
# saute les tables deja creees) -> on relance jusqu'a convergence (toutes les tables auth presentes).
# Borne a 8 tentatives (les 7 tables auth convergent en <=5 passes en pratique).
migrate_ok=0
for attempt in 1 2 3 4 5 6 7 8; do
  if node dist/apps/api/migrate.js; then
    echo "[entrypoint] better-auth migrate convergee (tentative $attempt)"
    migrate_ok=1
    break
  fi
  echo "[entrypoint] passe additive $attempt incomplete (collision type parallele), relance..."
done
if [ "$migrate_ok" != "1" ]; then
  echo "[entrypoint] ERREUR : better-auth migrate n'a pas converge en 8 passes" >&2
  exit 1
fi

echo "[entrypoint] 3/3 start NestJS api"
exec node dist/apps/api/main.js
