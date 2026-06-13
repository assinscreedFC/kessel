import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../../../../tests/setup/testcontainers";

// Test d'ISOLATION CROSS-TENANT du modèle Deal (CRM-02, T-2-iso) — real Postgres, AUCUN mock.
// [BLOCKING] Schéma poussé sur Postgres réel AVANT assertions (sinon faux positif type-only).
// Prouve que l'Org B ne lit/maj/supprime JAMAIS un Deal d'Org A, avec garde-fou anti faux-vert
// (forOrg(org RÉEL).deal.findMany() > 0). orgId injecté par forOrg (non fourni au create).

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, ".."); // packages/shared/db

const ORG_A = "org-A";
const ORG_B = "org-B";

type ForOrg = typeof import("./tenant-client").forOrg;
type BasePrisma = typeof import("./client").basePrisma;
type CloseDb = typeof import("./client").closeDb;

describe("deal-isolation: Org A cannot read/write Org B Deal (real Postgres)", () => {
  let pg: { uri: string; stop: () => Promise<void> };
  let forOrg: ForOrg;
  let basePrisma: BasePrisma;
  let closeDb: CloseDb;
  let dealAId: string;
  let dealBId: string;

  beforeAll(async () => {
    pg = await startPostgres();

    // [BLOCKING] push du schéma sur le Postgres réel (crée les tables Contact/Deal).
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

    // Un contact + un deal par org (un deal appartient à exactement un contact).
    const contactA = await forOrg(ORG_A).contact.create({
      data: { name: "Alice A", email: "alice@org-a.test" } as never,
    });
    const contactB = await forOrg(ORG_B).contact.create({
      data: { name: "Bob B", email: "bob@org-b.test" } as never,
    });
    const dealA = await forOrg(ORG_A).deal.create({
      data: { title: "Deal A", contactId: contactA.id, status: "WON", amount: "1000.00" } as never,
    });
    const dealB = await forOrg(ORG_B).deal.create({
      data: { title: "Deal B", contactId: contactB.id } as never,
    });
    dealAId = dealA.id;
    dealBId = dealB.id;
  });

  afterAll(async () => {
    await closeDb?.();
    await pg?.stop();
  });

  it("anti faux-vert : forOrg(org RÉEL) voit ses propres deals (>0) — orgId pas fantôme", async () => {
    const ownA = await forOrg(ORG_A).deal.findMany();
    expect(ownA.length).toBeGreaterThan(0);
    expect(ownA.every((d) => d.orgId === ORG_A)).toBe(true);
  });

  it("create injecte l'orgId du tenant et applique le défaut status=LEAD", async () => {
    // Deal B a été créé sans status -> défaut LEAD ; orgId injecté par forOrg.
    const dealB = await forOrg(ORG_B).deal.findFirst({ where: { id: dealBId } });
    expect(dealB?.orgId).toBe(ORG_B);
    expect(dealB?.status).toBe("LEAD");
  });

  it("Org B ne lit JAMAIS un Deal d'Org A (findMany scopé)", async () => {
    const visibleToB = await forOrg(ORG_B).deal.findMany();
    expect(visibleToB.some((d) => d.id === dealAId)).toBe(false);
    expect(visibleToB.every((d) => d.orgId === ORG_B)).toBe(true);
  });

  it("Org B ne lit pas le Deal d'A par findFirst ciblé sur son id", async () => {
    const found = await forOrg(ORG_B).deal.findFirst({ where: { id: dealAId } });
    expect(found).toBeNull();
  });

  it("Org B ne peut PAS modifier un Deal d'Org A (updateMany affecte 0 ligne)", async () => {
    const res = await forOrg(ORG_B).deal.updateMany({
      where: { id: dealAId },
      data: { title: "hacked" },
    });
    expect(res.count).toBe(0);

    const stillA = await forOrg(ORG_A).deal.findFirst({ where: { id: dealAId } });
    expect(stillA?.title).toBe("Deal A");
  });

  it("Org B ne peut PAS supprimer un Deal d'Org A (deleteMany affecte 0 ligne)", async () => {
    const res = await forOrg(ORG_B).deal.deleteMany({ where: { id: dealAId } });
    expect(res.count).toBe(0);

    const total = await basePrisma.deal.count({ where: { id: dealAId } });
    expect(total).toBe(1);
  });

  it("réciprocité : Org A ne lit jamais le Deal d'Org B", async () => {
    const visibleToA = await forOrg(ORG_A).deal.findMany();
    expect(visibleToA.some((d) => d.id === dealBId)).toBe(false);
    expect(visibleToA.every((d) => d.orgId === ORG_A)).toBe(true);
  });
});
