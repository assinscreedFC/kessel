# syntax=docker/dockerfile:1
# Image de l'API NestJS (Plan 05, FOUND-04). Multi-stage : build (pnpm + esbuild + prisma generate)
# puis runtime alpine minimal exécutant le bundle `dist/apps/api/main.js`.

# ---- Stage build ----
FROM node:20-alpine AS build
WORKDIR /app

# corepack pour pnpm épinglé (package.json packageManager).
RUN corepack enable

# Manifeste + lockfile d'abord (cache des couches d'install). Le monorepo a des package.json
# par package/app — on copie tout le contexte (le .dockerignore exclut node_modules/dist/.git).
COPY . .

# Install déterministe de tout le workspace (frozen lockfile).
RUN pnpm install --frozen-lockfile

# Génère le client Prisma (requis au runtime : adapter + types) puis bundle l'api (main + migrate).
# prisma.config.ts résout env("DATABASE_URL") au CHARGEMENT — `generate` ne se connecte pas mais
# exige que la var soit définie. URL factice (build-time uniquement, jamais utilisée pour se connecter).
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
  pnpm --filter @kessel/db exec prisma generate \
  && node apps/api/esbuild.mjs

# ---- Stage runtime ----
# On copie tout l'arbre /app du stage build : node_modules racine + .pnpm store + les
# node_modules par-package (symlinks pnpm). Le bundle apps/api/dist/ résout ses externes en
# remontant apps/api/node_modules -> node_modules racine. C'est l'arbre pnpm intact qui garantit
# la résolution (notamment le client Prisma généré, à côté de @prisma/client, jamais hoisté).
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

# Tout l'espace de travail buildé (sources TS incluses : poids non critique en self-host ; garantit
# la résolution pnpm + le client Prisma généré + apps/api/dist + l'entrypoint).
COPY --from=build /app /app
RUN chmod +x apps/api/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["apps/api/docker-entrypoint.sh"]
