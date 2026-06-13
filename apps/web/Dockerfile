# syntax=docker/dockerfile:1
# Image du front web (Plan 05, FOUND-04). Multi-stage : build Vite (statique) puis nginx:alpine
# servant `dist/` avec fallback SPA. Servi derrière Caddy (reverse-proxy /).

# ---- Stage build ----
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
# Build statique de l'app web (Vite). outDir = apps/web/dist. vite est hoisté à la racine (.npmrc).
RUN node node_modules/vite/bin/vite.js build --config apps/web/vite.config.ts

# ---- Stage runtime ----
FROM nginx:alpine AS runtime
# Config nginx avec fallback SPA (try_files -> /index.html).
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# Artefacts statiques Vite.
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
