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
    // Alias FSD : `@/shared/ui/button` -> src/shared/ui/button (convention shadcn).
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
