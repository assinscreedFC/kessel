import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import swc from "unplugin-swc";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

// Config vitest de l'app api. Tests e2e/intégration sur Postgres réel (Testcontainers) — pas de mock.
// hookTimeout élevé : démarrage conteneur Postgres + migrations Better Auth + prisma db push (~30-90s).
// Tests séquentiels (singleFork) : chaque spec démarre son propre conteneur ; pas de partage d'état.
// alias : réplique les paths @kessel/* de tsconfig.base.json pour que vitest résolve les packages.
//
// SWC (unplugin-swc) remplace le transform esbuild par défaut de vitest : esbuild N'ÉMET PAS
// design:paramtypes (emitDecoratorMetadata non supporté) -> sans lui, le DI NestJS et le ValidationPipe
// (qui lisent le type réflexif des params) seraient cassés. SWC émet la métadonnée -> validation DTO réelle.
export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      "@kessel/auth": resolve(repoRoot, "packages/auth/src/index.ts"),
      "@kessel/db": resolve(repoRoot, "packages/shared/db/src/index.ts"),
      "@kessel/crm": resolve(repoRoot, "packages/crm/src/index.ts"),
      "@kessel/proposals": resolve(repoRoot, "packages/proposals/src/index.ts"),
      "@kessel/ai": resolve(repoRoot, "packages/ai/src/index.ts"),
      "@kessel/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
    },
  },
  test: {
    name: "api",
    environment: "node",
    include: ["src/**/*.{spec,e2e-spec}.ts"],
    hookTimeout: 180_000,
    testTimeout: 180_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
