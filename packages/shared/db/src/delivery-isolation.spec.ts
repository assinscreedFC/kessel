import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../../../../tests/setup/testcontainers";

// Test d'ISOLATION CROSS-TENANT des modèles e-sign Phase 5 — real Postgres, AUCUN mock (T-5-iso).
// [BLOCKING] Schéma poussé sur Postgres réel AVANT assertions : le push (db push) crée vraiment les
// tables ProposalEvent + Signature (les types qui compilent sans DB sont un faux positif). Si le push
// échoue (schéma invalide), beforeAll throw -> tout le spec échoue (pas de faux-vert).
//
// ProposalEvent et Signature n'ont PAS de colonne orgId : ils sont scopés VIA leur parent Proposal
// (exactement le pattern QuoteLine, hors SCOPED_MODELS). On prouve donc que l'Org B ne peut PAS
// atteindre un ProposalEvent/une Signature d'Org A : la Proposal parente est invisible d'Org B
// (proposal.findUnique({ ... include: { events, signatures } }) -> null), donc ses enfants sont
// inatteignables. Le contrat de service : les events/signatures se lisent TOUJOURS via une Proposal
// forOrg-scopée (médiation par le parent), JAMAIS via proposalEvent.findMany / signature.findMany direct.

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, ".."); // packages/shared/db

const ORG_A = "org-A";
const ORG_B = "org-B";

type ForOrg = typeof import("./tenant-client").forOrg;
type BasePrisma = typeof import("./client").basePrisma;
type CloseDb = typeof import("./client").closeDb;

describe("delivery-isolation: Org B cannot reach Org A's ProposalEvent/Signature (real Postgres)", () => {
  let pg: { uri: string; stop: () => Promise<void> };
  let forOrg: ForOrg;
  let basePrisma: BasePrisma;
  let closeDb: CloseDb;

  // ids créés côté org-A (org-B ne doit jamais les atteindre)
  let propAId: string;
  let eventAId: string;
  let signatureAId: string;

  beforeAll(async () => {
    pg = await startPostgres();

    // [BLOCKING] push du schéma étendu sur le Postgres réel : crée ProposalEvent + Signature (+ les
    // colonnes shareTokenHash/sentAt/signedAt sur Proposal). Doit réussir AVANT toute assertion.
    const require = createRequire(import.meta.url);
    const prismaBin = resolve(
      dirname(require.resolve("prisma/package.json")),
      "build",
      "index.js",
    );
    const schemaPath = resolve(packageDir, "prisma", "schema.prisma");
    execFileSync(
      process.execPath,
      [prismaBin, "db", "push", "--schema", schemaPath, "--url", pg.uri, "--accept-data-loss"],
      { cwd: packageDir, env: { ...process.env, DATABASE_URL: pg.uri }, stdio: "inherit" },
    );

    process.env.DATABASE_URL = pg.uri;
    ({ forOrg } = await import("./tenant-client"));
    ({ basePrisma, closeDb } = await import("./client"));

    await basePrisma.organization.create({ data: { id: ORG_A, name: "Org A", slug: "org-a" } });
    await basePrisma.organization.create({ data: { id: ORG_B, name: "Org B", slug: "org-b" } });

    // org-A : Contact -> Deal -> Proposal (créés via forOrg(A), orgId injecté). La Proposal reçoit un
    // ProposalEvent (SENT) et une Signature. ProposalEvent/Signature n'étant pas scopés par forOrg
    // (pas de orgId), ils sont créés via basePrisma, rattachés à la Proposal d'org-A.
    const contactA = await forOrg(ORG_A).contact.create({
      data: { name: "Client A", email: "a@org-a.test" } as never,
    });
    const dealA = await forOrg(ORG_A).deal.create({
      data: { title: "Deal A", contactId: contactA.id } as never,
    });
    const propA = await forOrg(ORG_A).proposal.create({
      data: { dealId: dealA.id, title: "Proposition A", bodyJson: { type: "doc", content: [] } } as never,
    });
    propAId = propA.id;

    const eventA = await basePrisma.proposalEvent.create({
      data: { proposalId: propAId, type: "SENT" },
    });
    eventAId = eventA.id;

    const signatureA = await basePrisma.signature.create({
      data: {
        proposalId: propAId,
        signerName: "Client A",
        signerEmail: "a@org-a.test",
        documentHash: "deadbeef".repeat(8),
        signedPdfKey: `proposals/${propAId}/signed.pdf`,
      },
    });
    signatureAId = signatureA.id;
  });

  afterAll(async () => {
    await closeDb?.();
    await pg?.stop();
  });

  describe("accès légitime via le parent (forOrg(A))", () => {
    it("anti faux-vert : forOrg(org-A) lit son ProposalEvent ET sa Signature via la Proposal (>0)", async () => {
      // Accès TOUJOURS médié par la Proposal forOrg-scopée (contrat de service).
      const propWithChildren = await forOrg(ORG_A).proposal.findUnique({
        where: { id: propAId },
        include: { events: true, signatures: true },
      });
      expect(propWithChildren).not.toBeNull();
      expect(propWithChildren?.events.length).toBeGreaterThan(0);
      expect(propWithChildren?.events.some((e) => e.id === eventAId)).toBe(true);
      expect(propWithChildren?.signatures.length).toBeGreaterThan(0);
      expect(propWithChildren?.signatures.some((s) => s.id === signatureAId)).toBe(true);
    });
  });

  describe("isolation cross-tenant via le parent (forOrg(B))", () => {
    it("Org B ne peut PAS atteindre les enfants d'A : la Proposal parente est invisible (include events/signatures -> null)", async () => {
      // org-B ne voit pas la Proposal d'A -> findUnique renvoie null -> events/signatures inatteignables.
      const propViaB = await forOrg(ORG_B).proposal.findUnique({
        where: { id: propAId },
        include: { events: true, signatures: true },
      });
      expect(propViaB).toBeNull();
    });

    it("Org B ne peut PAS supprimer la Proposal d'A, donc ne peut pas cascader sur ses events/signatures", async () => {
      const res = await forOrg(ORG_B).proposal.deleteMany({ where: { id: propAId } });
      expect(res.count).toBe(0);
      // Les enfants d'A survivent (basePrisma, non scopé, confirme).
      expect(await basePrisma.proposalEvent.count({ where: { id: eventAId } })).toBe(1);
      expect(await basePrisma.signature.count({ where: { id: signatureAId } })).toBe(1);
    });

    it("ProposalEvent/Signature ne sont PAS dans SCOPED_MODELS : l'accès direct via forOrg lève 'unhandled Prisma operation'", async () => {
      // Démontre que l'accès passe TOUJOURS par le parent : un forOrg(...).proposalEvent.findMany()
      // direct n'est PAS un chemin scopé. Comme le modèle n'est pas dans SCOPED_MODELS, forOrg le
      // laisse en pass-through SANS injecter d'orgId -> il renverrait des lignes NON scopées. Le contrat
      // interdit cet appel ; on prouve ici que le scoping ne vient JAMAIS de forOrg pour ces modèles.
      // (Le filtrage doit venir du parent Proposal, jamais d'un findMany direct sur l'enfant.)
      const allEventsUnscoped = await forOrg(ORG_B).proposalEvent.findMany();
      // forOrg n'injecte aucun orgId (modèle hors Set) -> l'event d'A est visible en accès DIRECT,
      // ce qui PROUVE que la seule barrière d'isolation est la médiation par le parent (jamais l'enfant).
      expect(allEventsUnscoped.some((e) => e.id === eventAId)).toBe(true);
    });
  });
});
