import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// App portail React/Vite — espace client séparé (Phase 4).
// Auth : JWT cookie (portail), PAS de Better Auth. Port dev 5174.
// Proxy UNIQUEMENT /portal -> API (pas /api — research Pitfall 5).
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@kessel/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/portal": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
