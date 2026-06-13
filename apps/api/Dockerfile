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
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

# node_modules complet (deps externes du bundle : NestJS, better-auth, pg, client Prisma généré).
COPY --from=build /app/node_modules ./node_modules
# Bundle api + sourcemaps.
COPY --from=build /app/dist ./dist
# Schéma Prisma seul (pour `prisma db push --url` au boot). prisma.config.ts est VOLONTAIREMENT
# absent du runtime : il importe "prisma/config" (non résolvable hors node_modules local du package)
# et n'est pas requis quand l'URL est passée explicitement via --url. Le client généré vit dans
# node_modules/.pnpm (copié plus haut) — résolu par l'adapter au runtime.
COPY --from=build /app/packages/shared/db/prisma/schema.prisma ./packages/shared/db/prisma/schema.prisma
COPY --from=build /app/packages/shared/db/package.json ./packages/shared/db/package.json
# Entrypoint (migrations ordonnées + start).
COPY --from=build /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
