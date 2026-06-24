import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Migration DB pour dev local (host) — équivalent de apps/api/docker-entrypoint.sh mais ciblant
// le Postgres exposé sur localhost:5433 (docker-compose.override.yml) via .env.local.
//
// ORDRE CANONIQUE (NE PAS inverser — cf. docker-entrypoint.sh) :
//   1. prisma generate     -> génère le client Prisma + types Kysely (requis au runtime API).
//   2. prisma db push       -> crée `organization` (miroir Better Auth) + tables métier. DESTRUCTIF.
//   3. better-auth migrate  -> ADDITIF : user/session/account/member/invitation/verification.
//
// Usage : node scripts/dev-migrate.mjs   (ou : pnpm dev:db)

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
}

// .env.local gagne sur .env (DATABASE_URL -> localhost:5433).
loadEnvFile(resolve(repoRoot, ".env.local"));
loadEnvFile(resolve(repoRoot, ".env"));

if (!process.env.DATABASE_URL) {
  console.error("[dev-migrate] DATABASE_URL absent (.env.local / .env)");
  process.exit(1);
}
console.log(`[dev-migrate] cible: ${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}`);

const dbDir = resolve(repoRoot, "packages/shared/db");
const npx = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(label, args, cwd) {
  console.log(`\n[dev-migrate] ${label}`);
  const r = spawnSync(npx, args, { cwd, env: process.env, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`[dev-migrate] ÉCHEC: ${label}`);
    process.exit(r.status ?? 1);
  }
}

// 1. génère le client Prisma + types Kysely
run("1/3 prisma generate", ["exec", "prisma", "generate"], dbDir);

// 2. push schéma métier (destructif, crée organization miroir)
run("2/3 prisma db push", ["exec", "prisma", "db", "push", "--accept-data-loss"], dbDir);

// 3. better-auth migrate (additif). runMigrations() lance ses CREATE TABLE en parallèle : collision
// possible de type composite Postgres -> on relance jusqu'à 8 passes (idempotent), cf. entrypoint.
let ok = false;
for (let i = 1; i <= 8; i++) {
  console.log(`\n[dev-migrate] 3/3 better-auth migrate (passe ${i}/8)`);
  const r = spawnSync(npx, ["exec", "tsx", "packages/auth/src/migrate.ts"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: true,
  });
  if (r.status === 0) {
    ok = true;
    break;
  }
  console.log("[dev-migrate] passe incomplète (collision type parallèle), relance...");
}
if (!ok) {
  console.error("[dev-migrate] ÉCHEC: better-auth migrate n'a pas convergé en 8 passes");
  process.exit(1);
}

console.log("\n[dev-migrate] OK — DB prête (schéma métier + tables auth).");
