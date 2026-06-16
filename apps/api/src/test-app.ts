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

export async function bootTestApp(opts: { disableThrottle?: boolean; stripeClient?: object } = {}): Promise<BootedApp> {
  const pg = await startPostgres();

  // Fixer DATABASE_URL AVANT tout import des modules db/auth (URL lue à la construction du module).
  process.env.DATABASE_URL = pg.uri;
  // Secret de test déterministe (jamais un vrai secret ; CLAUDE.md security).
  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret-not-for-prod";
  // STRIPE_SECRET_KEY requis au boot par ConfigModule (env.validation, SC4). Clé factice de test
  // (jamais un vrai secret) pour que l'AppModule s'instancie en e2e — la prod l'exige toujours.
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_not_for_prod";
  // PORTAL_JWT_SECRET requis au boot par env.validation (Joi min 32 required). Secret de test
  // déterministe (jamais un vrai secret ; CLAUDE.md security) — distinct de BETTER_AUTH_SECRET.
  process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET ?? "test-portal-secret-32chars-minimum-ok";
  process.env.PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? "http://localhost:5174";
  // WEBHOOK_ENCRYPTION_KEY requis au boot (env.validation, T-5-02). Clé de test déterministe
  // (64 hex chars = 32 bytes 'aa...') — jamais une vraie clé ; uniquement pour les e2e.
  process.env.WEBHOOK_ENCRYPTION_KEY = process.env.WEBHOOK_ENCRYPTION_KEY ?? "a".repeat(64);
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
  const { STRIPE_CLIENT } = await import("@kessel/payments");
  const { Test } = await import("@nestjs/testing");
  const { default: Stripe } = await import("stripe");

  // Default e2e Stripe stub — couvre PAY-01/02/03/04/05 sans appel réseau réel.
  //
  // paymentIntents.create : retourne un PI fake (id + client_secret).
  //   deposit-resilience.spec.ts utilise vi.spyOn pour remplacer create par test (stripeClient option).
  //   PAY-05 : createBalance l'utilise après DEPOSIT PAID (webhook handler).
  //
  // paymentIntents.retrieve : retourne un client_secret fake déterministe (PAY-02 getPublicPaymentByToken).
  //
  // webhooks : instance réelle du SDK Stripe (AUCUN appel réseau — constructEvent est purement local :
  //   HMAC-SHA256 sur le payload + tolérance timestamp 5 min). Cela permet aux specs webhook d'utiliser
  //   generateTestHeaderString + constructEvent avec le même secret de test (WEBHOOK_SECRET).
  const stripeForWebhooks = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_not_for_prod");
  const defaultStripeStub = opts.stripeClient ?? {
    paymentIntents: {
      create: async (_params: unknown) => ({
        id: `pi_test_stub_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        client_secret: `pi_test_stub_secret_${Date.now()}`,
      }),
      retrieve: async (id: string) => ({
        id,
        client_secret: `pi_retrieved_secret_${id}`,
      }),
    },
    webhooks: stripeForWebhooks.webhooks,
  };

  // Stub MinIO en mémoire (putSignedPdf capture les bytes ; getSignedPdf les restitue).
  // Identical au StorageStub de sign-proposal.spec.ts — seul MinIO est substituée, la crypto reste réelle.
  // PORT-05/06 : putPortalFile + presignedGetObject stubs ajoutés (Phase 8 — MinIO indisponible en test).
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
    async putPortalFile(
      orgId: string,
      contactId: string,
      fileId: string,
      filename: string,
      data: Buffer,
      _contentType: string,
    ): Promise<string> {
      const key = `portal/${orgId}/${contactId}/${fileId}-${filename}`;
      this.store.set(key, data);
      return key;
    }
    async presignedGetObject(objectKey: string, _ttlSeconds = 300): Promise<string> {
      // Retourne une URL factice déterministe (MinIO indisponible en test). Non loggée.
      return `http://minio.test/kessel-portal-files/${objectKey}?X-Amz-Expires=300`;
    }
  }

  // ThrottlerGuard désactivé UNIQUEMENT si opts.disableThrottle === true (opt-in).
  // Par défaut le throttle reste actif — les specs qui testent le rate-limit (public-proposals
  // test 7) l'exigent. Seules les specs qui seedent > 5 requêtes sign (project-status.spec.ts)
  // doivent passer { disableThrottle: true }.
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(new StorageStub())
    // Override STRIPE_CLIENT : en e2e on ne fait jamais d'appel réseau Stripe réel.
    // opts.stripeClient permet aux specs de fournir leur propre stub (passing ou failing).
    // Défaut : stub no-op qui lève une erreur (sécurité — force les specs à fournir un stub explicite
    // si elles testent PAY-01, sinon createDeposit retourne depositPending:true sans ligne Payment).
    .overrideProvider(STRIPE_CLIENT)
    .useValue(defaultStripeStub);

  if (opts.disableThrottle) {
    const { ThrottlerGuard } = await import("@nestjs/throttler");
    builder.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true });
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
  // Même ValidationPipe global qu'en prod (main.ts).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Même middleware raw-body que main.ts (Pattern 3 RESEARCH.md) : capture req.rawBody = Buffer
  // pour stripe.webhooks.constructEvent dans StripeWebhookController.
  const { default: bodyParser } = await import("body-parser");
  const rawBodyBuffer = (
    req: { headers: Record<string, string | string[] | undefined>; rawBody?: Buffer },
    _res: unknown,
    buffer: Buffer,
  ) => {
    if (req.headers["stripe-signature"]) {
      req.rawBody = buffer;
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(bodyParser.json({ verify: rawBodyBuffer as any }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(bodyParser.urlencoded({ verify: rawBodyBuffer as any, extended: true }));

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
