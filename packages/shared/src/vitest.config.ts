import { defineConfig } from "vitest/config";

// Config vitest du package shared/src. Tests unitaires purs — pas de Testcontainers.
export default defineConfig({
  test: { name: "shared", environment: "node", include: ["**/*.spec.ts"] },
});
