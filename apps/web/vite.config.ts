import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// App web React/Vite (FSD + shadcn/ui) — scaffold sans feature métier (Plan 05, FOUND-04).
// Build statique (`dist/`) servi en prod par nginx (apps/web/Dockerfile) derrière Caddy.
// Tailwind v4 via @tailwindcss/vite : pas de tailwind.config.js ni postcss.config requis.
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Alias FSD : `@/shared/ui/button` -> src/shared/ui/button (convention shadcn).
      "@": resolve(__dirname, "src"),
      // Contrat partagé front/back (@kessel/shared, type:shared) — résolu vers sa source TS.
      // Le web ne dépend QUE de @kessel/shared (jamais d'un domaine comme @kessel/crm — FOUND-05).
      "@kessel/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // Dev : le web tourne sur un autre port que l'api (pas de enableCors côté NestJS).
    // On proxy /api -> l'api NestJS pour rester en same-origin (cookie de session envoyé).
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
