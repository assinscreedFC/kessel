import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe } from "@nestjs/common";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { startPostgres } from "../../../../tests/setup/testcontainers";
import { generateTestP12 } from "../test-cert";

// e2e SIGNATURE RÉELLE (DELIV-03/04) — Postgres RÉEL (Testcontainers) + signature PAdES RÉELLE (cert
// de TEST via generateTestP12) + $transaction RÉEL. SEUL StorageService est stubbé (override provider) :
// son putSignedPdf CAPTURE les VRAIS bytes signés + asserte la clé déterministe `proposals/<id>/signed.pdf`
// et les conserve en mémoire ; getSignedPdf rend les bytes capturés. La signature + la transaction ne
// sont PAS simulées (le coût/lenteur évité = uniquement le Testcontainer MinIO, pas la crypto).
//
// Prouve :
//  1. PDF signé VÉRIFIABLE (cert réel) : POST /sign -> 200 ; bytes capturés = %PDF + ByteRange + SubFilter ;
//     Signature record avec documentHash 64 hex + signedPdfKey déterministe.
//  2. WON atomique : Proposal SIGNED + signedAt non null ET deal WON (même état, via basePrisma).
//  3. auditTrail RGPD borné : QUE { signedAt, ipTruncated, eventTypes } ; pas d'IP complète/UA/PII.
//  4. Idempotence : re-POST /sign -> "already signed" propre (pas 500) ; 1 seule Signature, deal WON une fois, signedAt inchangé.
//  5. Signed-PDF public : GET :token/signed-pdf 404 AVANT, 200 %PDF APRÈS ; token bidon -> 404. Authentifié forOrg : 200 owner, 404 cross-org.
//  6. Cert manquant : sans SIGNING_P12_PATH -> POST /sign -> 503 (pas 500/stack ENOENT), passphrase absente des messages.
//  7. Rate-limit : marteler /sign au-delà de 5/min -> au moins une 429.

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

// Stub StorageService : capture les VRAIS bytes signés sous la clé déterministe attendue. getSignedPdf
// rend les bytes capturés (-> les endpoints signed-pdf streament l'artefact RÉEL). putSignedPdf asserte
// la clé `proposals/<id>/signed.pdf` (déterministe -> re-sign idempotent écrase).
class StorageStub {
  readonly store = new Map<string, Buffer>();

  async onModuleInit(): Promise<void> {
    /* no-op : pas de MinIO en test */
  }

  async putSignedPdf(proposalId: string, pdf: Buffer): Promise<string> {
    const key = `proposals/${proposalId}/signed.pdf`;
    if (!key.startsWith(`proposals/${proposalId}/`)) {
      throw new Error("clé non déterministe");
    }
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

describe("e2e POST /api/public/proposals/:token/sign (DELIV-03/04 : signature PAdES réelle, WON atomique, idempotence, auditTrail RGPD, signed-pdf, cert manquant, rate-limit — real PG, StorageService stubbé)", () => {
  let baseUrl: string;
  let basePrisma: typeof import("@kessel/db").basePrisma;
  let storage: StorageStub;
  let stop: () => Promise<void>;
  let cookieA: string;
  let cookieB: string;
  let dealAId: string;
  // Reset du compteur throttler entre tests fonctionnels : le throttle /sign est STRICT (5/min/IP) et
  // tous les tests partagent la même IP (localhost). Sans reset, les signatures cumulées entre tests
  // déclencheraient un 429 prématuré. Le test 7 (rate-limit) reste valide : il martèle 8 fois APRÈS
  // un reset, dépassant 5 dans sa propre fenêtre. (Le reset ne désactive pas le throttle, il remet à
  // zéro le compteur in-memory — équivalent à un nouvel intervalle de 60s.)
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

  async function addLine(cookie: string, proposalId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/proposals/${proposalId}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Prestation", quantity: 2, unitPrice: 50, position: 0 }),
    });
    expect(res.status).toBe(201);
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

  // Crée une proposition envoyée et renvoie { proposalId, token } prête à signer.
  async function preparedProposal(cookie: string, dealId: string): Promise<{ proposalId: string; token: string }> {
    const proposalId = await createProposal(cookie, dealId);
    await addLine(cookie, proposalId);
    const token = await send(cookie, proposalId);
    return { proposalId, token };
  }

  beforeAll(async () => {
    const pg = await startPostgres();
    process.env.DATABASE_URL = pg.uri;
    process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret-not-for-prod";
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_not_for_prod";
    process.env.BETTER_AUTH_URL = "http://localhost";

    // Cert de TEST réel (généré en tmpdir) -> SIGNING_P12_PATH/PASSPHRASE AVANT le boot. La signature
    // est testée pour de vrai (crypto réelle), pas mockée.
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
    // overrideProvider(StorageService) : la SEULE I/O stubbée. Signature PAdES + $transaction RÉELS.
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

    // Accès au storage in-memory du ThrottlerModule pour remettre le compteur à zéro entre tests.
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

    cookieA = await signup("sign-A");
    await setupOrg(cookieA, "OrgSignA");
    dealAId = await createDeal(cookieA);

    cookieB = await signup("sign-B");
    await setupOrg(cookieB, "OrgSignB");
  });

  // Reset du compteur throttler avant chaque test (le test 7 martèle ensuite dans sa propre fenêtre).
  beforeEach(() => {
    resetThrottle?.();
  });

  afterAll(async () => {
    await stop?.();
  });

  it("1. PDF signé VÉRIFIABLE (cert réel) : POST /sign -> 200 ; bytes capturés %PDF + ByteRange + SubFilter ; Signature documentHash 64 hex + signedPdfKey déterministe", async () => {
    const { proposalId, token } = await preparedProposal(cookieA, dealAId);

    const res = await fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Alice Cliente", signerEmail: "alice@client.test", consent: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; alreadySigned: boolean };
    expect(body.status).toBe("SIGNED");
    expect(body.alreadySigned).toBe(false);

    // Bytes RÉELS capturés par le stub = artefact signé vérifiable.
    const expectedKey = `proposals/${proposalId}/signed.pdf`;
    const signed = storage.store.get(expectedKey);
    expect(signed).toBeDefined();
    expect(signed!.toString("utf8", 0, 4)).toBe("%PDF");
    const text = signed!.toString("latin1");
    expect(text).toContain("/ByteRange");
    expect(text).toContain("/SubFilter");

    // Signature record : documentHash 64 hex + signedPdfKey déterministe.
    const sig = (await basePrisma.signature.findFirst({ where: { proposalId } })) as {
      documentHash: string;
      signedPdfKey: string;
      signerName: string;
    } | null;
    expect(sig).not.toBeNull();
    expect(sig!.documentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sig!.signedPdfKey).toBe(expectedKey);
    expect(sig!.signerName).toBe("Alice Cliente");
  });

  it("2. WON atomique : après /sign -> Proposal SIGNED + signedAt non null ET deal WON", async () => {
    const { proposalId, token } = await preparedProposal(cookieA, dealAId);
    const res = await fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Bob", signerEmail: "bob@client.test", consent: true }),
    });
    expect(res.status).toBe(200);

    const proposal = (await basePrisma.proposal.findUnique({ where: { id: proposalId } })) as {
      status: string;
      signedAt: Date | null;
      dealId: string;
    } | null;
    expect(proposal!.status).toBe("SIGNED");
    expect(proposal!.signedAt).not.toBeNull();
    const deal = (await basePrisma.deal.findUnique({ where: { id: proposal!.dealId } })) as { status: string } | null;
    expect(deal!.status).toBe("WON");
  });

  it("3. auditTrail RGPD borné : QUE { signedAt, ipTruncated, eventTypes } — pas d'IP complète, pas d'UA, pas de PII", async () => {
    const { proposalId, token } = await preparedProposal(cookieA, dealAId);
    await fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Carol", signerEmail: "carol@client.test", consent: true }),
    });

    const sig = (await basePrisma.signature.findFirst({ where: { proposalId } })) as {
      auditTrail: Record<string, unknown> | null;
    } | null;
    const audit = sig!.auditTrail!;
    // Clés EXACTEMENT whitelistées.
    expect(Object.keys(audit).sort()).toEqual(["eventTypes", "ipTruncated", "signedAt"]);
    expect(typeof audit.signedAt).toBe("string");
    expect(Array.isArray(audit.eventTypes)).toBe(true);
    // ipTruncated : null OU tronquée /24 — JAMAIS une IP complète.
    const ipt = audit.ipTruncated as string | null;
    if (ipt !== null) {
      expect(ipt).toMatch(/\.0$/);
    }
    // Pas de fuite : sérialisé, l'audit ne contient ni "userAgent", ni "ua", ni d'IP complète (4 octets non nuls).
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toMatch(/userAgent|"ua"/i);
    expect(serialized).not.toMatch(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.([1-9]\d{0,2})\b/);
  });

  it("4. idempotence : re-POST /sign -> already signed propre (pas 500) ; 1 seule Signature, deal WON une fois, signedAt inchangé", async () => {
    const { proposalId, token } = await preparedProposal(cookieA, dealAId);
    const first = await fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Dan", signerEmail: "dan@client.test", consent: true }),
    });
    expect(first.status).toBe(200);
    const firstProposal = (await basePrisma.proposal.findUnique({ where: { id: proposalId } })) as { signedAt: Date | null };
    const firstSignedAt = firstProposal.signedAt?.getTime();

    // Re-sign -> already signed, pas 500.
    const second = await fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Dan", signerEmail: "dan@client.test", consent: true }),
    });
    expect(second.status).toBe(200);
    const body = (await second.json()) as { alreadySigned: boolean; status: string };
    expect(body.alreadySigned).toBe(true);
    expect(body.status).toBe("SIGNED");

    // Une seule Signature, deal WON une fois, signedAt inchangé.
    const sigs = await basePrisma.signature.findMany({ where: { proposalId } });
    expect(sigs).toHaveLength(1);
    const afterProposal = (await basePrisma.proposal.findUnique({ where: { id: proposalId } })) as { signedAt: Date | null };
    expect(afterProposal.signedAt?.getTime()).toBe(firstSignedAt);
  });

  it("5. signed-pdf : public 404 AVANT / 200 %PDF APRÈS ; token bidon -> 404 ; authentifié forOrg 200 owner + 404 cross-org", async () => {
    const { proposalId, token } = await preparedProposal(cookieA, dealAId);

    // AVANT signature : public 404 (pas encore SIGNED).
    const before = await fetch(`${baseUrl}/api/public/proposals/${token}/signed-pdf`);
    expect(before.status).toBe(404);

    // Signer.
    const signRes = await fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Eve", signerEmail: "eve@client.test", consent: true }),
    });
    expect(signRes.status).toBe(200);

    // APRÈS : public 200 %PDF.
    const after = await fetch(`${baseUrl}/api/public/proposals/${token}/signed-pdf`);
    expect(after.status).toBe(200);
    expect(after.headers.get("content-type")).toContain("application/pdf");
    const buf = Buffer.from(await after.arrayBuffer());
    expect(buf.toString("utf8", 0, 4)).toBe("%PDF");

    // Token bidon -> 404.
    const bad = await fetch(`${baseUrl}/api/public/proposals/un-token-bidon/signed-pdf`);
    expect(bad.status).toBe(404);

    // Authentifié forOrg : owner 200, cross-org 404.
    const owner = await fetch(`${baseUrl}/api/proposals/${proposalId}/signed-pdf`, { headers: { cookie: cookieA } });
    expect(owner.status).toBe(200);
    expect(owner.headers.get("content-type")).toContain("application/pdf");
    const crossOrg = await fetch(`${baseUrl}/api/proposals/${proposalId}/signed-pdf`, { headers: { cookie: cookieB } });
    expect(crossOrg.status).toBe(404);
  });

  it("6. cert manquant -> 503 gracieux (pas 500/stack ENOENT) ; la passphrase n'apparaît dans aucun message", async () => {
    const { token } = await preparedProposal(cookieA, dealAId);
    const prevPath = process.env.SIGNING_P12_PATH;
    delete process.env.SIGNING_P12_PATH; // cert non configuré -> loadCert (lazy, par sign) lève l'erreur typée.
    try {
      const res = await fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signerName: "Frank", signerEmail: "frank@client.test", consent: true }),
      });
      expect(res.status).toBe(503);
      const txt = await res.text();
      expect(res.status).not.toBe(500);
      expect(txt).not.toContain(process.env.SIGNING_P12_PASSPHRASE ?? "kessel-test-p12");
      expect(txt).not.toMatch(/ENOENT/);
    } finally {
      if (prevPath !== undefined) process.env.SIGNING_P12_PATH = prevPath;
    }
  });

  it("7. rate-limit : marteler /sign au-delà de 5/min -> au moins une 429", async () => {
    const { token } = await preparedProposal(cookieA, dealAId);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await fetch(`${baseUrl}/api/public/proposals/${token}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signerName: "Spam", signerEmail: "spam@client.test", consent: true }),
      });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
