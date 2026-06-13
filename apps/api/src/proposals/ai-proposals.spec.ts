import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ValidationPipe } from "@nestjs/common";
// IMPORTANT : @kessel/ai importe transitivement @kessel/db, dont client.ts lit DATABASE_URL au
// chargement du module. On n'importe donc ici que les TYPES (effacés à la compilation) ; les valeurs
// runtime (FakeProposalGenerator, PROPOSAL_GENERATOR) sont chargées DYNAMIQUEMENT dans beforeAll,
// APRÈS avoir fixé DATABASE_URL (même contrainte d'ordre que test-app.ts).
import type {
  GenerateProposalInput,
  GeneratedProposal,
  ProposalGenerator,
} from "@kessel/ai";
import { startPostgres } from "../../../../tests/setup/testcontainers";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// e2e GÉNÉRATION IA (PROP-04/05/06, AI-02) — Postgres RÉEL via Testcontainers, AUCUN mock DB.
// SEULE I/O fakée : le ProposalGenerator (frontière LLM), injecté via overrideProvider(PROPOSAL_GENERATOR).
//
// Prouve :
//  - Test 1 (PROP-04/05) : POST /generate -> 201 DRAFT, bodyJson doc valide, QuoteLine snapshot,
//    grandTotal decimal EXACT + lines.length = nb quoteLines de la sortie fake (persistance prouvée) ;
//  - Test 2 (PROP-06) : la Proposal générée est lisible/éditable par les endpoints Phase 3 (round-trip) ;
//  - Test 3 (T-4-idor) : dealId/templateId d'org-B -> 404 + 0 proposition créée (basePrisma.count) ;
//  - Test 4 (T-4-iso) : org A ne reçoit JAMAIS l'historique WON d'org B (fake capture wonExamples) ;
//  - Test 6 (AI-02) : org AVEC WON -> wonExamples[0].bodyText NON VIDE + Proposal DIFFÉRENTE de org SANS.
//
// (Test 5 dégradation sans clé est dans ai-degrade.spec.ts : il boote SANS le fake, env sans clé -> 503.)
//
// On ne réutilise PAS bootTestApp (qui n'override pas le provider) : on inline le même boot + override.

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

// Wrapper qui MÉMORISE le dernier input reçu (pour asserter wonExamples transmis) en déléguant à un
// generator de base (le vrai FakeProposalGenerator, chargé dynamiquement). Sa sortie DÉPEND donc de
// wonExamples.length (calibration AI-02 prouvable bout-en-bout).
class CapturingFakeGenerator implements ProposalGenerator {
  lastInput: GenerateProposalInput | null = null;
  constructor(private readonly base: ProposalGenerator) {}

  async generate(input: GenerateProposalInput): Promise<GeneratedProposal> {
    this.lastInput = input;
    return this.base.generate(input);
  }
}

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

const WON_DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Périmètre gagné" }] },
    { type: "paragraph", content: [{ type: "text", text: "Mission livrée avec succès l'an dernier." }] },
  ],
};
// Sortie fake FIXE déterministe -> grandTotal calculable exactement (Test 1).
const FIXED_OUTPUT: GeneratedProposal = {
  scope: "Proposition de refonte du site",
  deliverables: ["Maquette", "Intégration"],
  effortNotes: "Estimation fixe",
  bodySections: [
    { heading: "Périmètre", paragraphs: ["Refonte complète."], bullets: ["Responsive", "SEO"] },
  ],
  quoteLines: [
    { description: "Design", quantity: 2, unitPrice: 500 }, // 1000.00
    { description: "Dév", quantity: 3, unitPrice: 12.35 }, // 37.05
  ],
};
// grandTotal attendu : 2×500 + 3×12.35 = 1000 + 37.05 = 1037.05
const FIXED_GRAND_TOTAL = "1037.05";

describe("e2e /api/proposals/generate (PROP-04/05/06, AI-02 — real PG, generator fakée)", () => {
  let baseUrl: string;
  let stop: () => Promise<void>;
  let basePrisma: typeof import("@kessel/db").basePrisma;
  // Generators initialisés dans beforeAll (après le chargement dynamique de @kessel/ai).
  // - capturing : fake qui mémorise wonExamples reçu (Test 4 + 6), sortie dépendante de l'historique ;
  // - fixed : fake à sortie fixe -> grandTotal déterministe (Test 1).
  let capturing: CapturingFakeGenerator;
  let useFixed = false;
  let fixed: ProposalGenerator;
  // router : provider injecté (overrideProvider) ; bascule entre fixed (Test 1/2) et capturing.
  const router: ProposalGenerator = {
    async generate(input) {
      return useFixed ? fixed.generate(input) : capturing.generate(input);
    },
  };

  let cookieA: string;
  let cookieB: string;
  let dealAId: string;
  let dealBId: string;

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

  async function createDeal(cookie: string, status = "LEAD"): Promise<string> {
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
      body: JSON.stringify({ title: "Deal", contactId: contact.id, status }),
    });
    expect(dRes.status).toBe(201);
    const deal = (await dRes.json()) as { id: string };
    return deal.id;
  }

  // Crée une Proposal puis force son deal en WON (les deals se créent en LEAD ; on mute via PATCH).
  async function createWonProposal(cookie: string, bodyJson: unknown): Promise<void> {
    const dealId = await createDeal(cookie);
    const pRes = await fetch(`${baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Proposition gagnée", bodyJson }),
    });
    expect(pRes.status).toBe(201);
    // Le deal passe à WON (historique gagné qui alimente le few-shot AI-02).
    const patch = await fetch(`${baseUrl}/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ status: "WON" }),
    });
    expect(patch.status).toBe(200);
  }

  beforeAll(async () => {
    const pg = await startPostgres();
    process.env.DATABASE_URL = pg.uri;
    process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret-not-for-prod";
    process.env.BETTER_AUTH_URL = "http://localhost";

    pushPrismaSchema(pg.uri);

    const { runBetterAuthMigrations, closeAuthPool } = await import("@kessel/auth");
    await runBetterAuthMigrations();
    const db = await import("@kessel/db");
    basePrisma = db.basePrisma;

    // Chargement DYNAMIQUE de @kessel/ai (importe transitivement @kessel/db) APRÈS DATABASE_URL fixée.
    const { FakeProposalGenerator, PROPOSAL_GENERATOR } = await import("@kessel/ai");
    capturing = new CapturingFakeGenerator(new FakeProposalGenerator());
    fixed = new FakeProposalGenerator(FIXED_OUTPUT);

    const { AppModule } = await import("../app.module");
    // overrideProvider(PROPOSAL_GENERATOR) : la SEULE I/O fakée (la DB reste réelle Testcontainers).
    const { Test } = await import("@nestjs/testing");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PROPOSAL_GENERATOR)
      .useValue(router)
      .compile();
    const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 3000;
    baseUrl = `http://localhost:${port}`;

    stop = async () => {
      await app.close();
      await db.closeDb();
      await closeAuthPool();
      await pg.stop();
    };

    // Seed : org A AVEC historique WON (bodyJson non trivial), org B SANS.
    cookieA = await signup("ai-A");
    await setupOrg(cookieA, "OrgAiA");
    dealAId = await createDeal(cookieA);
    await createWonProposal(cookieA, WON_DOC);

    cookieB = await signup("ai-B");
    await setupOrg(cookieB, "OrgAiB");
    dealBId = await createDeal(cookieB);
  });

  afterAll(async () => {
    await stop?.();
  });

  it("Test 1 (PROP-04/05) : POST /generate -> 201 DRAFT, bodyJson doc, QuoteLine snapshot, grandTotal exact + lines.length", async () => {
    useFixed = true;
    const res = await fetch(`${baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, brief: "Refonte du site vitrine de l'entreprise." }),
    });
    useFixed = false;
    expect(res.status).toBe(201);
    const p = (await res.json()) as {
      id: string;
      status: string;
      bodyJson: { type: string };
      lines: { description: string; quantity: string; unitPrice: string }[];
      grandTotal: string;
    };
    expect(p.status).toBe("DRAFT");
    expect(p.bodyJson.type).toBe("doc");
    // Persistance des lignes : la sortie fixe a 2 quoteLines -> 2 QuoteLine snapshot persistées.
    expect(p.lines).toHaveLength(FIXED_OUTPUT.quoteLines.length);
    // grandTotal decimal EXACT (2×500 + 3×12.35 = 1037.05) — pas juste sa présence.
    expect(typeof p.grandTotal).toBe("string");
    expect(p.grandTotal).toBe(FIXED_GRAND_TOTAL);
    // Snapshot sans FK : les descriptions viennent de la sortie générée.
    expect(p.lines.map((l) => l.description)).toEqual(["Design", "Dév"]);
  });

  it("Test 2 (PROP-06) : la Proposal générée est lisible + éditable par les endpoints Phase 3 (round-trip)", async () => {
    useFixed = true;
    const genRes = await fetch(`${baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, brief: "Un autre brief." }),
    });
    useFixed = false;
    const gen = (await genRes.json()) as { id: string; lines: { id: string }[] };

    // Lisible via GET :id (Phase 3).
    const getRes = await fetch(`${baseUrl}/api/proposals/${gen.id}`, { headers: { cookie: cookieA } });
    expect(getRes.status).toBe(200);

    // Éditable : PATCH d'une ligne -> grandTotal recalculé par le service Phase 3.
    const lineId = gen.lines[0].id;
    const patchRes = await fetch(`${baseUrl}/api/proposals/${gen.id}/lines/${lineId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ quantity: 10 }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { grandTotal: string };
    // 10×500 + 3×12.35 = 5000 + 37.05 = 5037.05
    expect(patched.grandTotal).toBe("5037.05");
  });

  it("Test 3 (T-4-idor) : dealId d'org-B -> 404 + 0 proposition créée", async () => {
    const before = await basePrisma.proposal.count();
    const res = await fetch(`${baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealBId, brief: "Tentative IDOR." }),
    });
    expect(res.status).toBe(404);
    const after = await basePrisma.proposal.count();
    expect(after).toBe(before);
  });

  it("Test 4 (T-4-iso) : org B ne reçoit JAMAIS l'historique WON d'org A (isolation forOrg)", async () => {
    // Org B n'a AUCUN historique WON : le fake doit recevoir wonExamples vide (jamais le WON d'org A).
    const res = await fetch(`${baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ dealId: dealBId, brief: "Brief org B." }),
    });
    expect(res.status).toBe(201);
    expect(capturing.lastInput).not.toBeNull();
    expect(capturing.lastInput!.wonExamples).toHaveLength(0);
  });

  it("Test 6 (AI-02) : org A AVEC WON -> wonExamples[0].bodyText NON VIDE + Proposal DIFFÉRENTE de org B", async () => {
    // Génération org A (a 1 WON avec bodyJson non trivial).
    const resA = await fetch(`${baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, brief: "Même brief partagé." }),
    });
    expect(resA.status).toBe(201);
    const pA = (await resA.json()) as { title: string };
    const inputA = capturing.lastInput!;
    // (a) wonExamples reçu NON VIDE + bodyText extrait NON VIDE (proseMirrorToText a marché).
    expect(inputA.wonExamples.length).toBeGreaterThan(0);
    expect(typeof inputA.wonExamples[0].bodyText).toBe("string");
    expect(inputA.wonExamples[0].bodyText.length).toBeGreaterThan(0);
    expect(inputA.wonExamples[0].bodyText).toContain("Périmètre gagné");

    // Génération org B (aucun WON).
    const resB = await fetch(`${baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ dealId: dealBId, brief: "Même brief partagé." }),
    });
    expect(resB.status).toBe(201);
    const pB = (await resB.json()) as { title: string };

    // (b) Proposal d'org A DIFFÈRE de celle d'org B (le fake dépend de wonExamples.length).
    expect(pA.title).not.toBe(pB.title);
  });

  // Sanity isolation : l'historique gagné d'org A ne contient jamais de trace d'un autre tenant.
  it("isolation persistance : le few-shot WON d'org A reste scopé forOrg (aucune fuite cross-org)", async () => {
    await fetch(`${baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, brief: "Encore A." }),
    });
    const wonExamplesA = capturing.lastInput!.wonExamples;
    // Tous les exemples viennent du WON d'org A (contiennent son texte), aucun d'un autre tenant.
    expect(wonExamplesA.length).toBeGreaterThan(0);
    expect(wonExamplesA.every((e) => e.bodyText.includes("Périmètre gagné"))).toBe(true);
  });
});
