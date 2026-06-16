import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

// Config vitest du package payments. Tests unitaires — payment.service.spec.ts (stub StripeLike, pas de DB réelle).
// alias : réplique les paths @kessel/* de tsconfig.base.json.
// DATABASE_URL stub : @kessel/db vérifie DATABASE_URL à l'init du module ; une URL factice suffit pour
// les tests purs via dynamic import() (chargement paresseux dans PaymentService).
export default defineConfig({
  resolve: {
    alias: {
      "@kessel/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
      "@kessel/db": resolve(repoRoot, "packages/shared/db/src/index.ts"),
    },
  },
  test: {
    name: "payments",
    environment: "node",
    include: ["src/**/*.spec.ts"],
    env: {
      DATABASE_URL: "postgresql://stub:stub@localhost:5432/stub",
    },
  },
});
