import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Config vitest portail — tests unitaires avec jsdom (composants React, pas de Testcontainers).
export default defineConfig({
  plugins: [react()],
  test: {
    name: "portal",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.spec.tsx", "src/**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@kessel/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
