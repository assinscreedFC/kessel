import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

// Config vitest du package projects. Tests unitaires purs — budget-snapshot.spec.ts (decimal.js, pas de DB).
// alias : réplique les paths @kessel/* de tsconfig.base.json — nécessaire car le barrel @kessel/proposals
// importe transitivement @kessel/shared et @kessel/db (vitest ne lit pas tsconfig.base.json).
// DATABASE_URL stub : @kessel/db vérifie DATABASE_URL à l'init du module ; une URL factice suffit pour
// les tests purs qui n'ouvrent aucune connexion réelle.
export default defineConfig({
  resolve: {
    alias: {
      "@kessel/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
      "@kessel/db": resolve(repoRoot, "packages/shared/db/src/index.ts"),
      "@kessel/proposals": resolve(repoRoot, "packages/proposals/src/index.ts"),
      "@kessel/auth": resolve(repoRoot, "packages/auth/src/index.ts"),
      "@kessel/crm": resolve(repoRoot, "packages/crm/src/index.ts"),
      "@kessel/ai": resolve(repoRoot, "packages/ai/src/index.ts"),
    },
  },
  test: {
    name: "projects",
    environment: "node",
    include: ["src/**/*.spec.ts"],
    env: {
      DATABASE_URL: "postgresql://stub:stub@localhost:5432/stub",
    },
  },
});
