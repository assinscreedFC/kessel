import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../../../../tests/setup/testcontainers";

// Test d'ISOLATION CROSS-TENANT pour Project et Payment (v1.1, FOUND-cross-cutting).
// Real DB via Testcontainers (AUCUN mock — règle projet). Prouve, sur un Postgres réel, que :
//   - forOrg(B).project.findMany() ne renvoie PAS les Projects d'A (isolation read) ;
//   - forOrg(B).project.updateMany({where:{id: projectAId}}) count===0 (isolation write) ;
//   - GARDE-FOU anti faux-vert : forOrg(org RÉEL).project.findMany().length > 0 ;
//   - Test STRUCTUREL : Task/PortalSession/WebhookDelivery N'ONT PAS de colonne orgId.
//
// Wave 0 — RED : les modèles Project/Payment/Task/etc. n'existent pas encore dans schema.prisma
// → db push échouera ou les modèles seront absents → tests RED.
// L'implémentation est livrée en Wave 1, plan 02.

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, ".."); // packages/shared/db

const ORG_A = "org-isolation-A";
const ORG_B = "org-isolation-B";

// Importés dynamiquement APRÈS avoir posé DATABASE_URL sur le conteneur (le client Prisma lit
// l'URL à la construction du module — on doit donc la fixer avant l'import).
type ForOrg = typeof import("./tenant-client").forOrg;
type BasePrisma = typeof import("./client").basePrisma;
type CloseDb = typeof import("./client").closeDb;

describe("project-isolation: Org A cannot read/write Org B projects/payments (FOUND-cross-cutting, real Postgres)", () => {
  let pg: { uri: string; stop: () => Promise<void> };
  let forOrg: ForOrg;
  let basePrisma: BasePrisma;
  let closeDb: CloseDb;
  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    pg = await startPostgres();

    // Pousser le schéma sur le Postgres réel du conteneur.
    // Bin Prisma invoqué via `node <bin>` (cross-platform ; évite spawnSync npx.cmd EINVAL Windows).
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

    // Fixer DATABASE_URL AVANT d'importer le client Prisma.
    process.env.DATABASE_URL = pg.uri;
    ({ forOrg } = await import("./tenant-client"));
    ({ basePrisma, closeDb } = await import("./client"));

    // Setup NON scopé (basePrisma) : 2 orgs + prérequis FK (Deal + Proposal) + 1 Project chacun.
    await basePrisma.organization.create({ data: { id: ORG_A, name: "Org Isolation A", slug: "org-isolation-a" } });
    await basePrisma.organization.create({ data: { id: ORG_B, name: "Org Isolation B", slug: "org-isolation-b" } });

    // Prérequis FK : Contact → Deal → Proposal avant Project.
    const contactA = await basePrisma.contact.create({
      data: { orgId: ORG_A, name: "Contact A", email: "a@test.com" },
    });
    const dealA = await basePrisma.deal.create({
      data: { orgId: ORG_A, contactId: contactA.id, title: "Deal A", status: "WON" },
    });
    const proposalA = await basePrisma.proposal.create({
      data: { orgId: ORG_A, dealId: dealA.id, title: "Proposal A", bodyJson: {}, status: "SIGNED" },
    });

    const contactB = await basePrisma.contact.create({
      data: { orgId: ORG_B, name: "Contact B", email: "b@test.com" },
    });
    const dealB = await basePrisma.deal.create({
      data: { orgId: ORG_B, contactId: contactB.id, title: "Deal B", status: "WON" },
    });
    const proposalB = await basePrisma.proposal.create({
      data: { orgId: ORG_B, dealId: dealB.id, title: "Proposal B", bodyJson: {}, status: "SIGNED" },
    });

    // Créer 1 Project par org (scopés via SCOPED_MODELS v1.1).
    const projectA = await basePrisma.project.create({
      data: {
        orgId: ORG_A,
        dealId: dealA.id,
        proposalId: proposalA.id,
        title: "Project A",
        budgetSnapshot: { total: 10000 },
      },
    });
    const projectB = await basePrisma.project.create({
      data: {
        orgId: ORG_B,
        dealId: dealB.id,
        proposalId: proposalB.id,
        title: "Project B",
        budgetSnapshot: { total: 20000 },
      },
    });
    projectAId = projectA.id;
    projectBId = projectB.id;
  });

  afterAll(async () => {
    // Fermer Prisma + le pool pg AVANT d'arrêter le conteneur (évite 57P01 sur connexion ouverte).
    await closeDb?.();
    await pg?.stop();
  });

  it("anti faux-vert : forOrg(org RÉEL) voit ses propres Projects (>0) — orgId pas fantôme", async () => {
    const ownA = await forOrg(ORG_A).project.findMany();
    expect(ownA.length).toBeGreaterThan(0);
    expect(ownA.every((p) => p.orgId === ORG_A)).toBe(true);

    const ownB = await forOrg(ORG_B).project.findMany();
    expect(ownB.length).toBeGreaterThan(0);
    expect(ownB.every((p) => p.orgId === ORG_B)).toBe(true);
  });

  it("Org B ne lit JAMAIS un Project d'Org A (findMany scopé)", async () => {
    const visibleToB = await forOrg(ORG_B).project.findMany();
    expect(visibleToB.some((p) => p.id === projectAId)).toBe(false);
    expect(visibleToB.every((p) => p.orgId === ORG_B)).toBe(true);
  });

  it("Org B ne lit pas le Project d'A par findFirst ciblé sur son id", async () => {
    const found = await forOrg(ORG_B).project.findFirst({ where: { id: projectAId } });
    expect(found).toBeNull();
  });

  it("Org B ne peut PAS modifier un Project d'Org A (updateMany affecte 0 ligne)", async () => {
    const res = await forOrg(ORG_B).project.updateMany({
      where: { id: projectAId },
      data: { title: "hacked" },
    });
    expect(res.count).toBe(0);
  });

  it("Org B ne peut PAS supprimer un Project d'Org A (deleteMany affecte 0 ligne)", async () => {
    const res = await forOrg(ORG_B).project.deleteMany({ where: { id: projectAId } });
    expect(res.count).toBe(0);
  });

  it("réciprocité : Org A ne lit jamais le Project d'Org B", async () => {
    const visibleToA = await forOrg(ORG_A).project.findMany();
    expect(visibleToA.some((p) => p.id === projectBId)).toBe(false);
    expect(visibleToA.every((p) => p.orgId === ORG_A)).toBe(true);
  });

  it("Payment isolation : Org B ne lit pas les Payments d'Org A", async () => {
    // Prérequis : Payment liés aux Projects créés en beforeAll.
    const paymentA = await basePrisma.payment.create({
      data: {
        orgId: ORG_A,
        projectId: projectAId,
        stripePaymentIntentId: "pi_test_A_isolation",
        amountCents: 5000,
      },
    });
    const visibleToB = await forOrg(ORG_B).payment.findMany();
    expect(visibleToB.some((p) => p.id === paymentA.id)).toBe(false);
    // Nettoyage
    await basePrisma.payment.delete({ where: { id: paymentA.id } });
  });

  it("test structurel : Task N'A PAS de colonne orgId (scopée via parent Project)", async () => {
    // Vérifie que la colonne orgId n'existe PAS sur la table Task.
    // Task est scopée via projectId → Project.orgId (hors SCOPED_MODELS).
    const rows = await basePrisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Task'
        AND column_name = 'orgId'
    `;
    expect(rows).toHaveLength(0);
  });

  it("test structurel : PortalSession N'A PAS de colonne orgId (scopée via parent Contact)", async () => {
    const rows = await basePrisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'PortalSession'
        AND column_name = 'orgId'
    `;
    expect(rows).toHaveLength(0);
  });

  it("test structurel : WebhookDelivery N'A PAS de colonne orgId (scopée via parent WebhookEndpoint)", async () => {
    const rows = await basePrisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'WebhookDelivery'
        AND column_name = 'orgId'
    `;
    expect(rows).toHaveLength(0);
  });
});
