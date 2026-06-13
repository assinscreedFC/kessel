# syntax=docker/dockerfile:1
# Image de l'API NestJS (Plan 05 FOUND-04 ; Plan 03-03 PROP-07 PDF). Multi-stage : build (pnpm +
# esbuild + prisma generate) puis runtime Debian slim avec Chromium SYSTÈME (apt) pour Puppeteer.
#
# MIGRATION Alpine -> Debian slim (Plan 03-03) : l'export PDF rend du HTML via Puppeteer (Chromium
# headless). Chromium sur Alpine (musl) est notoirement fragile ; Debian slim + le paquet apt
# `chromium` est l'option fiable pour le self-host. On NE télécharge JAMAIS le Chromium glibc de
# Puppeteer (PUPPETEER_SKIP_DOWNLOAD=true) — on pointe PUPPETEER_EXECUTABLE_PATH sur le binaire apt.

# ---- Stage build ----
FROM node:20-slim AS build
WORKDIR /app

# Puppeteer NE DOIT PAS télécharger son Chromium bundlé (~150 Mo glibc inutile : on utilise le
# Chromium système apt au runtime). Posé AVANT pnpm install pour court-circuiter le postinstall.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# ca-certificates pour les téléchargements TLS (pnpm/corepack) sur l'image slim minimale.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Chromium système pour Puppeteer (PROP-07). fonts-liberation pour le rendu typographique du PDF ;
# findutils pour `find` (l'entrypoint localise le binaire prisma dans .pnpm via `find`). On NE
# télécharge PAS le Chromium de Puppeteer : il pointe sur /usr/bin/chromium (paquet apt ci-dessous).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    findutils \
  && rm -rf /var/lib/apt/lists/*

# PUPPETEER_SKIP_DOWNLOAD : aucune tentative de download au runtime.
# PUPPETEER_EXECUTABLE_PATH : chemin du Chromium apt (PAS un secret — un chemin de binaire système).
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN corepack enable

# Tout l'espace de travail buildé (sources TS incluses : poids non critique en self-host ; garantit
# la résolution pnpm + le client Prisma généré + apps/api/dist + l'entrypoint).
COPY --from=build /app /app
RUN chmod +x apps/api/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["apps/api/docker-entrypoint.sh"]
