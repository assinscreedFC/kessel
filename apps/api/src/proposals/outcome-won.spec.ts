import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe } from "@nestjs/common";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { startPostgres } from "../../../../tests/setup/testcontainers";
import { generateTestP12 } from "../test-cert";

// e2e WON ATOMIQUE (AI-01, Phase 6) — Postgres RÉEL (Testcontainers) + signature PAdES RÉELLE (cert
// de TEST generateTestP12) + $transaction RÉEL. SEUL StorageService est stubbé (pattern Phase 5).
//
// Prouve :
//  1. À la signature, un ProposalOutcome(WON) est créé DANS la même $transaction que SIGNED + deal WON
//     (atomique) ; outcome.decidedAt == proposal.signedAt ; context.amount == grandTotal du devis.
//  2. SNAPSHOT IMMUABLE : muter une QuoteLine APRÈS signature (PATCH :id/lines/:lineId) change le
//     grandTotal du devis MAIS context.amount de l'outcome reste INCHANGÉ (figé à la résolution).
//  3. IDEMPOTENCE : re-POST /sign -> 1 SEUL ProposalOutcome (basePrisma.proposalOutcome.count == 1).
//  4. NO-PII : context contient EXACTEMENT { amount, lineCount, deliverableCount, bodyTextLength } —
//     aucune clé name/email (RGPD T-6-pii).

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";

const here = dirname(fileURLToPath(import.meta.url));
const dbPackageDir = resolve(here, "../../../../packages/shared/db");

function pushPrismaSchema(databaseUrl: string): void {
  const require = createRequire(resolve(dbPackageDir, "package.json"));
  const prismaBin = resolve(dirname(require.resolve("prisma/package.json")), "build", "index.js");
  const schemaPath = resolve(dbPackageDir, "prisma", "schema.prisma");
  execFileSync(
    process.execPath,
    [prismaBin, "db", "push", "--schema", schemaPath, "--url", databaseUrl, "--accept-data-loss"],
    { cwd: dbPackageDir, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" },
  );
}

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

// Stub StorageService (pattern Phase 5) : la signature PAdES + le $transaction restent RÉELS.
class StorageStub {
  readonly store = new Map<string, Buffer>();
  async onModuleInit(): Promise<void> {
    /* no-op : pas de MinIO en test */
  }
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

const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Proposition" }] },
    { type: "paragraph", content: [{ type: "text", text: "Voici notre offre à signer." }] },
  ],
};

describe("e2e WON atomique (AI-01) — ProposalOutcome(WON) dans la $transaction signature, snapshot immuable, idempotence, no-PII (real PG, StorageService stubbé)", () => {
  let baseUrl: string;
  let basePrisma: typeof import("@kessel/db").basePrisma;
  let storage: StorageStub;
  let stop: () => Promise<void>;
  let cookieA: string;
  let dealAId: string;
  let resetThrottle: () => void;

  async function signup(label: string): Promise<string> {
    const res = await fetch(`${baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `${label}+${Date.now()}-${Math.random().toString(36).slice(2)}@kessel.test`,
        password: "Sup3r-Secret-Pw!",
        name: label,
      }),
    });
    expect([200, 201]).toContain(res.status);
    return cookieFrom(res);
  }

  async function setupOrg(cookie: string, name: string): Promise<string> {
    const createRes = await fetch(`${baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name, slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
    });
    expect([200, 201]).toContain(createRes.status);
    const org = (await createRes.json()) as { id: string };
    await fetch(`${baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ organizationId: org.id }),
    });
    return org.id;
  }

  async function createDeal(cookie: string): Promise<string> {
    const cRes = await fetch(`${baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Client", email: `c+${Date.now()}-${Math.random().toString(36).slice(2)}@x.test` }),
    });
    expect(cRes.status).toBe(201);
    const contact = (await cRes.json()) as { id: string };
    const dRes = await fetch(`${baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Deal", contactId: contact.id, status: "LEAD" }),
    });
    expect(dRes.status).toBe(201);
    const deal = (await dRes.json()) as { id: string };
    return deal.id;
  }

  async function createProposal(cookie: string, dealId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Proposition à signer", bodyJson: DOC }),
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as { id: string };
    return p.id;
  }

  // Ajoute une ligne (2 × 50 = 100.00) et renvoie son id (pour le test snapshot immuable).
  async function addLine(cookie: string, proposalId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/proposals/${proposalId}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Prestation", quantity: 2, unitPrice: 50, position: 0 }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { lines: { id: string }[] };
    return body.lines[0].id;
  }

  async function send(cookie: string, proposalId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/proposals/${proposalId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as { token: string };
    return body.token;
  }

  async function preparedProposal(
    cookie: string,
    dealId: string,
  ): Promise<{ proposalId: string; token: string; lineId: string }> {
    const proposalId = await createProposal(cookie, dealId);
    const lineId = await addLine(cookie, proposalId);
    const token = await send(cookie, proposalId);
    return { proposalId, token, lineId };
  }

  async function sign(token: string, name: string): Promise<Response> {
    return fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: name, signerEmail: `${name.toLowerCase()}@client.test`, consent: true }),
    });
  }

  beforeAll(async () => {
    const pg = await startPostgres();
    process.env.DATABASE_URL = pg.uri;
    process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret-not-for-prod";
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_not_for_prod";
    process.env.BETTER_AUTH_URL = "http://localhost";

    const { p12Path, passphrase } = generateTestP12();
    process.env.SIGNING_P12_PATH = p12Path;
    process.env.SIGNING_P12_PASSPHRASE = passphrase;

    pushPrismaSchema(pg.uri);

    const { runBetterAuthMigrations, closeAuthPool } = await import("@kessel/auth");
    await runBetterAuthMigrations();
    const db = await import("@kessel/db");
    basePrisma = db.basePrisma;

    const { StorageService } = await import("@kessel/proposals");
    storage = new StorageStub();

    const { AppModule } = await import("../app.module");
    const { Test } = await import("@nestjs/testing");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 3000;
    baseUrl = `http://localhost:${port}`;

    const { getStorageToken } = await import("@nestjs/throttler");
    const throttlerStorage = app.get(getStorageToken(), { strict: false }) as {
      storage?: Map<string, unknown>;
    };
    resetThrottle = () => {
      throttlerStorage.storage?.clear();
    };

    stop = async () => {
      await app.close();
      await db.closeDb();
      await closeAuthPool();
      await pg.stop();
    };

    cookieA = await signup("won-A");
    await setupOrg(cookieA, "OrgWonA");
    dealAId = await createDeal(cookieA);
  });

  beforeEach(() => {
    resetThrottle?.();
  });

  afterAll(async () => {
    await stop?.();
  });

  it("1. WON atomique : signature -> ProposalOutcome(WON) dans la même $transaction (SIGNED + deal WON) ; decidedAt == signedAt ; context.amount == grandTotal", async () => {
    const { proposalId, token } = await preparedProposal(cookieA, dealAId);
    const res = await sign(token, "Alice");
    expect(res.status).toBe(200);

    // Proposal SIGNED + signedAt + deal WON (atomicité signature, déjà couvert Phase 5 ; re-asserté).
    const proposal = (await basePrisma.proposal.findUnique({ where: { id: proposalId } })) as {
      status: string;
      signedAt: Date | null;
      dealId: string;
    } | null;
    expect(proposal!.status).toBe("SIGNED");
    expect(proposal!.signedAt).not.toBeNull();
    const deal = (await basePrisma.deal.findUnique({ where: { id: proposal!.dealId } })) as { status: string } | null;
    expect(deal!.status).toBe("WON");

    // ProposalOutcome(WON) créé DANS la même transaction.
    const outcome = (await basePrisma.proposalOutcome.findUnique({ where: { proposalId } })) as {
      outcome: string;
      decidedAt: Date;
      context: Record<string, unknown>;
    } | null;
    expect(outcome).not.toBeNull();
    expect(outcome!.outcome).toBe("WON");
    // decidedAt == signedAt (l'outcome est figé au moment de la signature).
    expect(outcome!.decidedAt.getTime()).toBe(proposal!.signedAt!.getTime());
    // context.amount == grandTotal du devis (2 × 50 = 100.00).
    expect(outcome!.context.amount).toBe("100.00");
    expect(outcome!.context.lineCount).toBe(1);
  });

  it("2. SNAPSHOT IMMUABLE : muter une QuoteLine après signature change le grandTotal mais PAS context.amount de l'outcome", async () => {
    const { proposalId, token, lineId } = await preparedProposal(cookieA, dealAId);
    const signRes = await sign(token, "Bob");
    expect(signRes.status).toBe(200);

    // Outcome figé : amount == "100.00".
    const before = (await basePrisma.proposalOutcome.findUnique({ where: { proposalId } })) as {
      context: { amount: string };
    } | null;
    expect(before!.context.amount).toBe("100.00");

    // Muter la ligne APRÈS coup : quantity 2 -> 100 (100 × 50 = 5000.00).
    const patchRes = await fetch(`${baseUrl}/api/proposals/${proposalId}/lines/${lineId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ quantity: 100 }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { grandTotal: string };
    expect(patched.grandTotal).toBe("5000.00"); // le DEVIS a changé

    // L'OUTCOME n'a PAS changé : snapshot figé, recalculé jamais.
    const after = (await basePrisma.proposalOutcome.findUnique({ where: { proposalId } })) as {
      context: { amount: string };
    } | null;
    expect(after!.context.amount).toBe("100.00"); // INCHANGÉ
  });

  it("3. IDEMPOTENCE : re-sign -> 1 SEUL ProposalOutcome", async () => {
    const { proposalId, token } = await preparedProposal(cookieA, dealAId);
    const first = await sign(token, "Carol");
    expect(first.status).toBe(200);
    const second = await sign(token, "Carol");
    expect(second.status).toBe(200);
    const body = (await second.json()) as { alreadySigned: boolean };
    expect(body.alreadySigned).toBe(true);

    const count = await basePrisma.proposalOutcome.count({ where: { proposalId } });
    expect(count).toBe(1);
  });

  it("4. NO-PII : context contient EXACTEMENT { amount, lineCount, deliverableCount, bodyTextLength } — aucune clé name/email (RGPD)", async () => {
    const { proposalId, token } = await preparedProposal(cookieA, dealAId);
    const res = await sign(token, "Dan");
    expect(res.status).toBe(200);

    const outcome = (await basePrisma.proposalOutcome.findUnique({ where: { proposalId } })) as {
      context: Record<string, unknown>;
    } | null;
    const keys = Object.keys(outcome!.context).sort();
    // Clés EXACTES (whitelist RGPD) — pas de clientType par défaut (A1), aucune PII.
    expect(keys).toEqual(["amount", "bodyTextLength", "deliverableCount", "lineCount"]);
    // Aucune clé name/email dans le snapshot.
    expect(keys).not.toContain("name");
    expect(keys).not.toContain("email");
    const serialized = JSON.stringify(outcome!.context);
    expect(serialized).not.toMatch(/name|email/i);
  });
});
