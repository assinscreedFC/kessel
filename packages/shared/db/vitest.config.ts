import { defineConfig } from "vitest/config";

// Config vitest du package db. Tests d'INTÉGRATION sur Postgres réel (Testcontainers) — pas de mock DB.
// hookTimeout élevé : démarrage du conteneur Postgres + prisma db push (~30-60s la première fois).
export default defineConfig({
  test: {
    name: "shared-db",
    environment: "node",
    include: ["src/**/*.spec.ts"],
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
