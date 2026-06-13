import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../../../../tests/setup/testcontainers";

// Test d'ISOLATION CROSS-TENANT des 4 modèles Phase 3 (PROP-03/iso, T-3-iso) — real Postgres, AUCUN mock.
// [BLOCKING] Schéma poussé sur Postgres réel AVANT assertions (sinon faux positif type-only).
// Prouve, pour CHAQUE modèle scopé, que l'Org B ne lit/maj/supprime JAMAIS une ligne d'Org A, avec
// garde-fou anti faux-vert (forOrg(org RÉEL).<model>.findMany() > 0). orgId injecté par forOrg.
//
// Les 3 modèles directement scopés (Proposal, ProposalTemplate, PricingItem) sont dans SCOPED_MODELS.
// QuoteLine n'a PAS de colonne orgId : il est scopé VIA son parent Proposal. On prouve donc qu'org-B
// ne peut PAS atteindre une QuoteLine d'org-A : la Proposal parente est invisible d'org-B
// (proposal.findUnique(... include: { lines }) -> null), donc ses lignes sont inaccessibles. Le contrat
// de service est : les lignes ne se lisent JAMAIS via QuoteLine.findMany direct, TOUJOURS via une
// Proposal forOrg-scopée (medié par le parent).

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, ".."); // packages/shared/db

const ORG_A = "org-A";
const ORG_B = "org-B";

type ForOrg = typeof import("./tenant-client").forOrg;
type BasePrisma = typeof import("./client").basePrisma;
type CloseDb = typeof import("./client").closeDb;

describe("proposals-isolation: Org A cannot read/write Org B (4 modèles, real Postgres)", () => {
  let pg: { uri: string; stop: () => Promise<void> };
  let forOrg: ForOrg;
  let basePrisma: BasePrisma;
  let closeDb: CloseDb;

  // ids créés côté org-A (org-B ne doit jamais les atteindre)
  let propAId: string;
  let templateAId: string;
  let pricingAId: string;
  let quoteLineAId: string;

  beforeAll(async () => {
    pg = await startPostgres();

    // [BLOCKING] push du schéma sur le Postgres réel (crée les 4 tables Phase 3).
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

    // org-A : un Deal (prérequis Proposal), une Proposal, un ProposalTemplate, un PricingItem,
    // une QuoteLine sous la Proposal. Tout créé via forOrg(A) (orgId injecté, pas fourni à la main).
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

    const templateA = await forOrg(ORG_A).proposalTemplate.create({
      data: { name: "Template A", bodyJson: { type: "doc", content: [] } } as never,
    });
    templateAId = templateA.id;

    const pricingA = await forOrg(ORG_A).pricingItem.create({
      data: { name: "Jour de dev A", unitPrice: "800.00", unit: "jour" } as never,
    });
    pricingAId = pricingA.id;

    // QuoteLine n'est pas scopée par forOrg (pas de orgId) : on la crée via basePrisma, rattachée
    // à la Proposal d'org-A. L'isolation se prouve par l'inaccessibilité du parent côté org-B.
    const quoteLineA = await basePrisma.quoteLine.create({
      data: {
        proposalId: propAId,
        description: "Jour de dev A",
        quantity: "3",
        unitPrice: "800.00",
        position: 0,
      },
    });
    quoteLineAId = quoteLineA.id;
  });

  afterAll(async () => {
    await closeDb?.();
    await pg?.stop();
  });

  // === Proposal ===
  describe("Proposal", () => {
    it("anti faux-vert : forOrg(org-A) voit sa propre Proposal (>0) — orgId pas fantôme", async () => {
      const ownA = await forOrg(ORG_A).proposal.findMany();
      expect(ownA.length).toBeGreaterThan(0);
      expect(ownA.every((p) => p.orgId === ORG_A)).toBe(true);
    });

    it("Org B ne lit JAMAIS une Proposal d'Org A (findMany scopé)", async () => {
      const visibleToB = await forOrg(ORG_B).proposal.findMany();
      expect(visibleToB.some((p) => p.id === propAId)).toBe(false);
    });

    it("Org B ne lit pas la Proposal d'A par findFirst ciblé sur son id", async () => {
      const found = await forOrg(ORG_B).proposal.findFirst({ where: { id: propAId } });
      expect(found).toBeNull();
    });

    it("Org B ne peut PAS modifier une Proposal d'Org A (updateMany affecte 0 ligne)", async () => {
      const res = await forOrg(ORG_B).proposal.updateMany({
        where: { id: propAId },
        data: { title: "hacked" },
      });
      expect(res.count).toBe(0);
      const stillA = await forOrg(ORG_A).proposal.findFirst({ where: { id: propAId } });
      expect(stillA?.title).toBe("Proposition A");
    });

    it("Org B ne peut PAS supprimer une Proposal d'Org A (deleteMany affecte 0 ligne)", async () => {
      const res = await forOrg(ORG_B).proposal.deleteMany({ where: { id: propAId } });
      expect(res.count).toBe(0);
      const total = await basePrisma.proposal.count({ where: { id: propAId } });
      expect(total).toBe(1);
    });
  });

  // === ProposalTemplate ===
  describe("ProposalTemplate", () => {
    it("anti faux-vert : forOrg(org-A) voit son propre Template (>0)", async () => {
      const ownA = await forOrg(ORG_A).proposalTemplate.findMany();
      expect(ownA.length).toBeGreaterThan(0);
      expect(ownA.every((t) => t.orgId === ORG_A)).toBe(true);
    });

    it("Org B ne lit JAMAIS un Template d'Org A", async () => {
      const visibleToB = await forOrg(ORG_B).proposalTemplate.findMany();
      expect(visibleToB.some((t) => t.id === templateAId)).toBe(false);
      const found = await forOrg(ORG_B).proposalTemplate.findFirst({ where: { id: templateAId } });
      expect(found).toBeNull();
    });

    it("Org B ne peut PAS modifier/supprimer un Template d'Org A (count 0)", async () => {
      const upd = await forOrg(ORG_B).proposalTemplate.updateMany({
        where: { id: templateAId },
        data: { name: "hacked" },
      });
      expect(upd.count).toBe(0);
      const del = await forOrg(ORG_B).proposalTemplate.deleteMany({ where: { id: templateAId } });
      expect(del.count).toBe(0);
      const total = await basePrisma.proposalTemplate.count({ where: { id: templateAId } });
      expect(total).toBe(1);
    });
  });

  // === PricingItem ===
  describe("PricingItem", () => {
    it("anti faux-vert : forOrg(org-A) voit son propre PricingItem (>0)", async () => {
      const ownA = await forOrg(ORG_A).pricingItem.findMany();
      expect(ownA.length).toBeGreaterThan(0);
      expect(ownA.every((p) => p.orgId === ORG_A)).toBe(true);
    });

    it("Org B ne lit JAMAIS un PricingItem d'Org A", async () => {
      const visibleToB = await forOrg(ORG_B).pricingItem.findMany();
      expect(visibleToB.some((p) => p.id === pricingAId)).toBe(false);
      const found = await forOrg(ORG_B).pricingItem.findFirst({ where: { id: pricingAId } });
      expect(found).toBeNull();
    });

    it("Org B ne peut PAS modifier/supprimer un PricingItem d'Org A (count 0)", async () => {
      const upd = await forOrg(ORG_B).pricingItem.updateMany({
        where: { id: pricingAId },
        data: { name: "hacked" },
      });
      expect(upd.count).toBe(0);
      const del = await forOrg(ORG_B).pricingItem.deleteMany({ where: { id: pricingAId } });
      expect(del.count).toBe(0);
      const total = await basePrisma.pricingItem.count({ where: { id: pricingAId } });
      expect(total).toBe(1);
    });
  });

  // === QuoteLine (scopée VIA le parent Proposal) ===
  describe("QuoteLine (via parent Proposal)", () => {
    it("la QuoteLine d'org-A existe bien (anti faux-vert) et est lisible via la Proposal forOrg(A)", async () => {
      // Accès TOUJOURS médié par la Proposal forOrg-scopée (contrat de service).
      const propWithLines = await forOrg(ORG_A).proposal.findUnique({
        where: { id: propAId },
        include: { lines: true },
      });
      expect(propWithLines).not.toBeNull();
      expect(propWithLines?.lines.length).toBeGreaterThan(0);
      expect(propWithLines?.lines.some((l) => l.id === quoteLineAId)).toBe(true);
    });

    it("Org B ne peut PAS atteindre la QuoteLine d'A : la Proposal parente est invisible (include.lines)", async () => {
      // org-B ne voit pas la Proposal d'A -> findUnique renvoie null -> ses lignes sont inatteignables.
      const propViaB = await forOrg(ORG_B).proposal.findUnique({
        where: { id: propAId },
        include: { lines: true },
      });
      expect(propViaB).toBeNull();
    });

    it("Org B ne peut PAS supprimer la Proposal d'A, donc ne peut pas cascader sur ses QuoteLine", async () => {
      const res = await forOrg(ORG_B).proposal.deleteMany({ where: { id: propAId } });
      expect(res.count).toBe(0);
      // La QuoteLine d'A survit (basePrisma, non scopé, confirme).
      const total = await basePrisma.quoteLine.count({ where: { id: quoteLineAId } });
      expect(total).toBe(1);
    });
  });
});
