import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { startPostgres } from "../../../tests/setup/testcontainers";
import { generateTestP12 } from "./test-cert";

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
  // Exposé pour les specs qui accèdent au DI NestJS (ex: reset throttler via getStorageToken).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _nestApp: any;
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
  // Cert de signature PAdES (DELIV-03) : généré une fois en tmpdir, réutilisé (idempotent).
  // Requis par SigningService — sans lui, POST /sign -> 503. bootTestApp intègre la signature
  // réelle (pas mockée) exactement comme sign-proposal.spec.ts.
  if (!process.env.SIGNING_P12_PATH) {
    const { p12Path, passphrase } = generateTestP12();
    process.env.SIGNING_P12_PATH = p12Path;
    process.env.SIGNING_P12_PASSPHRASE = passphrase;
  }

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

  // 3. Boot NestJS via Test.createTestingModule (comme sign-proposal.spec.ts) pour pouvoir
  //    stubbé StorageService (MinIO indisponible en e2e léger). La signature PAdES reste RÉELLE ;
  //    seul le stockage objet est intercepté en mémoire.
  const { ValidationPipe } = await import("@nestjs/common");
  const { AppModule } = await import("./app.module");
  const { StorageService } = await import("@kessel/proposals");
  const { Test } = await import("@nestjs/testing");

  // Stub MinIO en mémoire (putSignedPdf capture les bytes ; getSignedPdf les restitue).
  // Identical au StorageStub de sign-proposal.spec.ts — seul MockIO est substituée, la crypto reste réelle.
  class StorageStub {
    readonly store = new Map<string, Buffer>();
    async onModuleInit(): Promise<void> { /* pas de MinIO en test */ }
    async putSignedPdf(proposalId: string, pdf: Buffer): Promise<string> {
      const key = `proposals/${proposalId}/signed.pdf`;
      this.store.set(key, pdf);
      return key;
    }
    async getSignedPdf(key: string): Promise<Buffer> {
      const buf = this.store.get(key);
      if (!buf) throw new Error(`objet absent: ${key}`);
      return buf;
    }
  }

  // ThrottlerGuard désactivé en e2e : les specs seedent plusieurs projets via la route sign
  // publique (limit=5/min) — le throttle teste la sécurité rate-limit, pas la logique métier.
  // Les specs de throttling dédiées (si elles existent) bootent leur propre app sans ce stub.
  const { ThrottlerGuard } = await import("@nestjs/throttler");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(new StorageStub())
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
  // Même ValidationPipe global qu'en prod (main.ts).
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
    _nestApp: app,
    stop: async () => {
      await app.close();
      await closeDb();
      await closeAuthPool();
      await pg.stop();
    },
  };
}
