import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Config vitest de l'app web. Tests unitaires des modules purs (schémas zod miroir des DTO) —
// environnement node (pas de DOM : les composants React sont vérifiés au checkpoint visuel,
// pas de harness jsdom/RTL dans ce projet). Alias alignés sur vite.config.ts.
export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@kessel/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
