import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Build de l'API NestJS pour l'image Docker (Plan 05, FOUND-04).
//
// Stratégie : esbuild bundle UNIQUEMENT le code workspace (`@kessel/*` + apps/api/src) en un
// seul `dist/apps/api/main.js` (ESM). Tous les paquets node_modules sont EXTERNES
// (--packages=external) : Prisma client généré, pg, better-auth, NestJS gardent leur résolution
// node normale au runtime (node_modules copié dans l'image). On évite ainsi de bundler le moteur
// Prisma natif et les imports dynamiques de better-auth (sources de casse en bundle).
//
// Les alias `@kessel/*` (tsconfig.base.json paths) sont résolus ICI vers les sources TS des
// packages, puis inlinés dans le bundle.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const alias = {
  "@kessel/db": resolve(repoRoot, "packages/shared/db/src/index.ts"),
  "@kessel/auth": resolve(repoRoot, "packages/auth/src/index.ts"),
  "@kessel/shared": resolve(repoRoot, "packages/shared/src/index.ts"),
};

const banner = {
  // Banner : shim require/__dirname pour les paquets CJS chargés depuis un bundle ESM (NestJS, pg).
  js: [
    "import { createRequire as __cr } from 'node:module';",
    "import { fileURLToPath as __ftp } from 'node:url';",
    "import { dirname as __dn } from 'node:path';",
    "const require = __cr(import.meta.url);",
    "const __filename = __ftp(import.meta.url);",
    "const __dirname = __dn(__filename);",
  ].join("\n"),
};

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external", // node_modules résolus au runtime (Prisma/pg/better-auth/NestJS)
  alias,
  sourcemap: true,
  banner,
};

// main.js : serveur NestJS. migrate.js : runner de migration additive Better Auth (entrypoint).
await build({
  ...common,
  entryPoints: [resolve(here, "src/main.ts")],
  outfile: resolve(repoRoot, "dist/apps/api/main.js"),
});
await build({
  ...common,
  entryPoints: [resolve(here, "src/migrate-entrypoint.ts")],
  outfile: resolve(repoRoot, "dist/apps/api/migrate.js"),
});

console.log("api build OK -> dist/apps/api/main.js + migrate.js");
