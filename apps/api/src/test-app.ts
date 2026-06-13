import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { startPostgres } from "../../../tests/setup/testcontainers";

// Helper de boot e2e (FOUND-02/03) — démarre la stack COMPLÈTE sur un Postgres réel :
//   1. conteneur Postgres jetable (Testcontainers, AUCUN mock) ;
//   2. ORDRE de migration : prisma db push (crée la table `organization` — MIROIR FIDÈLE des
//      colonnes canoniques Better Auth — + OrgNote + le FK) PUIS Better Auth migrate (ADDITIF :
//      voit `organization` déjà complète, ne crée QUE les tables manquantes user/session/account/
//      member/invitation/verification). Cet ordre est requis car `prisma db push` est un reconcile
//      DESTRUCTIF (il DROP toute table absente du schéma Prisma) : le lancer APRÈS Better Auth
//      effacerait user/session/account. Better Auth migrate, lui, est purement additif (toBeCreated/
//      toBeAdded sur le diff) — il respecte la table `organization` pré-créée par Prisma. Un seul
//      espace d'id org : organization.id (Prisma) === organization.id (Better Auth) === FK OrgNote.orgId.
//   3. import dynamique des modules (auth/db lisent DATABASE_URL à la construction — on la fixe avant) ;
//   4. boot de l'app NestJS sur un port éphémère, exposée par fetch.
//
// Renvoie l'URL de base + une fonction de teardown déterministe (ferme app + pools + conteneur).

type BootedApp = {
  baseUrl: string;
  // Modules importés dynamiquement (après DATABASE_URL fixée) — réutilisés par les specs.
  forOrg: typeof import("@kessel/db").forOrg;
  basePrisma: typeof import("@kessel/db").basePrisma;
  auth: typeof import("@kessel/auth").auth;
  stop: () => Promise<void>;
};

const here = dirname(fileURLToPath(import.meta.url));
const dbPackageDir = resolve(here, "../../../packages/shared/db");

function pushPrismaSchema(databaseUrl: string): void {
  // Bin Prisma via `node <bin>` (cross-platform ; évite spawnSync npx.cmd EINVAL Windows).
  // Résolution ANCRÉE au package db (qui dépend de prisma) plutôt qu'à import.meta.url : sous le
  // transform SWC (vitest) import.meta.url pointe le source apps/api d'où prisma n'est pas résoluble
  // (il vit dans packages/shared/db/node_modules). On résout donc depuis dbPackageDir.
  const require = createRequire(resolve(dbPackageDir, "package.json"));
  const prismaBin = resolve(
    dirname(require.resolve("prisma/package.json")),
    "build",
    "index.js",
  );
  const schemaPath = resolve(dbPackageDir, "prisma", "schema.prisma");
  execFileSync(
    process.execPath,
    [prismaBin, "db", "push", "--schema", schemaPath, "--url", databaseUrl, "--accept-data-loss"],
    { cwd: dbPackageDir, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" },
  );
}

export async function bootTestApp(): Promise<BootedApp> {
  const pg = await startPostgres();

  // Fixer DATABASE_URL AVANT tout import des modules db/auth (URL lue à la construction du module).
  process.env.DATABASE_URL = pg.uri;
  // Secret de test déterministe (jamais un vrai secret ; CLAUDE.md security).
  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret-not-for-prod";
  // STRIPE_SECRET_KEY requis au boot par ConfigModule (env.validation, SC4). Clé factice de test
  // (jamais un vrai secret) pour que l'AppModule s'instancie en e2e — la prod l'exige toujours.
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_not_for_prod";
  // baseURL trusted par Better Auth pour les cookies/CSRF en test.
  process.env.BETTER_AUTH_URL = "http://localhost";

  // 1. Prisma db push D'ABORD : crée `organization` (miroir des colonnes canoniques Better Auth)
  //    + OrgNote + FK. db push est destructif (DROP des tables hors schéma) — il doit donc précéder
  //    Better Auth migrate, pas le suivre.
  pushPrismaSchema(pg.uri);

  // 2. PUIS Better Auth migrate (ADDITIF) : crée user/session/account/member/invitation/verification
  //    ; voit `organization` déjà complète et ne la touche pas (toBeCreated/toBeAdded uniquement).
  //    Import dynamique : ces modules lisent DATABASE_URL à la construction — chargés APRÈS l'env.
  const { auth, runBetterAuthMigrations, closeAuthPool } = await import("@kessel/auth");
  await runBetterAuthMigrations();

  const { forOrg, basePrisma, closeDb } = await import("@kessel/db");

  // 3. Boot NestJS (bodyParser:false). Import dynamique pour respecter l'ordre DATABASE_URL.
  const { NestFactory } = await import("@nestjs/core");
  const { ValidationPipe } = await import("@nestjs/common");
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  // Même ValidationPipe global qu'en prod (main.ts) — sinon les specs DTO ne testeraient pas le
  // comportement réel (Pitfall 3 : un payload invalide passerait au lieu de renvoyer 400).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0); // port éphémère
  const server = app.getHttpServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3000;
  const baseUrl = `http://localhost:${port}`;

  return {
    baseUrl,
    forOrg,
    basePrisma,
    auth,
    stop: async () => {
      await app.close();
      await closeDb();
      await closeAuthPool();
      await pg.stop();
    },
  };
}
