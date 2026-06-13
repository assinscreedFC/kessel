import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../../../../tests/setup/testcontainers";

// Test d'ISOLATION CROSS-TENANT du modèle Contact (CRM-01/02, T-2-iso) — real Postgres, AUCUN mock.
// [BLOCKING] Le schéma est POUSSÉ sur un Postgres réel AVANT toute assertion : sans push, les types
// compilent mais les tables n'existent pas (faux positif). On prouve, sur Postgres réel, que :
//   - GARDE-FOU anti faux-vert : forOrg(org RÉEL).contact.findMany() renvoie >0 ligne (orgId réel,
//     pas fantôme — sinon l'isolation serait un artefact d'un org inexistant, T-1-10) ;
//   - l'Org B ne lit/maj/supprime JAMAIS un Contact d'Org A (isolation read + write) ;
//   - RESTRICT (T-2-restrict) : supprimer un Contact ayant des Deals liés ÉCHOUE (pas de cascade
//     silencieuse), l'erreur est surfacée et le contact reste intact.
//
// org-A / org-B sont les id CANONIQUES (= activeOrganizationId Better Auth). Contact.orgId et
// Deal.orgId sont des FK vers organization.id : un seul espace d'id.

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, ".."); // packages/shared/db

const ORG_A = "org-A";
const ORG_B = "org-B";

// Importés dynamiquement APRÈS avoir posé DATABASE_URL (le client Prisma lit l'URL à la
// construction du module — on la fixe après démarrage du conteneur).
type ForOrg = typeof import("./tenant-client").forOrg;
type BasePrisma = typeof import("./client").basePrisma;
type CloseDb = typeof import("./client").closeDb;

describe("contact-isolation: Org A cannot read/write Org B Contact + RESTRICT (real Postgres)", () => {
  let pg: { uri: string; stop: () => Promise<void> };
  let forOrg: ForOrg;
  let basePrisma: BasePrisma;
  let closeDb: CloseDb;
  let contactAId: string;
  let contactBId: string;

  beforeAll(async () => {
    pg = await startPostgres();

    // [BLOCKING] Pousser le schéma sur le Postgres réel du conteneur (crée vraiment les tables
    // Contact/Deal). Bin Prisma via `node <bin>` (cross-platform ; évite spawnSync npx.cmd EINVAL).
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

    // Fixer DATABASE_URL AVANT d'importer le client Prisma (lu à la construction du module).
    process.env.DATABASE_URL = pg.uri;
    ({ forOrg } = await import("./tenant-client"));
    ({ basePrisma, closeDb } = await import("./client"));

    // Setup NON scopé (basePrisma) : 2 orgs canoniques. Les contacts sont créés via forOrg
    // (anti faux-vert : le scoping injecte l'orgId réel).
    await basePrisma.organization.create({ data: { id: ORG_A, name: "Org A", slug: "org-a" } });
    await basePrisma.organization.create({ data: { id: ORG_B, name: "Org B", slug: "org-b" } });

    const contactA = await forOrg(ORG_A).contact.create({
      data: { name: "Alice A", email: "alice@org-a.test" } as never,
    });
    const contactB = await forOrg(ORG_B).contact.create({
      data: { name: "Bob B", email: "bob@org-b.test" } as never,
    });
    contactAId = contactA.id;
    contactBId = contactB.id;
  });

  afterAll(async () => {
    await closeDb?.();
    await pg?.stop();
  });

  it("anti faux-vert : forOrg(org RÉEL) voit ses propres contacts (>0) — orgId pas fantôme", async () => {
    const ownA = await forOrg(ORG_A).contact.findMany();
    expect(ownA.length).toBeGreaterThan(0);
    expect(ownA.every((c) => c.orgId === ORG_A)).toBe(true);
  });

  it("create injecte l'orgId du tenant (non fourni dans data)", async () => {
    const created = await forOrg(ORG_A).contact.create({
      data: { name: "Temp", email: "temp@org-a.test" } as never,
    });
    expect(created.orgId).toBe(ORG_A);
    await basePrisma.contact.delete({ where: { id: created.id } });
  });

  it("Org B ne lit JAMAIS un Contact d'Org A (findMany scopé)", async () => {
    const visibleToB = await forOrg(ORG_B).contact.findMany();
    expect(visibleToB.some((c) => c.id === contactAId)).toBe(false);
    expect(visibleToB.every((c) => c.orgId === ORG_B)).toBe(true);
  });

  it("Org B ne lit pas le Contact d'A par findFirst ciblé sur son id", async () => {
    const found = await forOrg(ORG_B).contact.findFirst({ where: { id: contactAId } });
    expect(found).toBeNull();
  });

  it("Org B ne peut PAS modifier un Contact d'Org A (updateMany affecte 0 ligne)", async () => {
    const res = await forOrg(ORG_B).contact.updateMany({
      where: { id: contactAId },
      data: { name: "hacked" },
    });
    expect(res.count).toBe(0);

    const stillA = await forOrg(ORG_A).contact.findFirst({ where: { id: contactAId } });
    expect(stillA?.name).toBe("Alice A");
  });

  it("Org B ne peut PAS supprimer un Contact d'Org A (deleteMany affecte 0 ligne)", async () => {
    const res = await forOrg(ORG_B).contact.deleteMany({ where: { id: contactAId } });
    expect(res.count).toBe(0);

    const total = await basePrisma.contact.count({ where: { id: contactAId } });
    expect(total).toBe(1);
  });

  it("réciprocité : Org A ne lit jamais le Contact d'Org B", async () => {
    const visibleToA = await forOrg(ORG_A).contact.findMany();
    expect(visibleToA.some((c) => c.id === contactBId)).toBe(false);
    expect(visibleToA.every((c) => c.orgId === ORG_A)).toBe(true);
  });

  it("RESTRICT (T-2-restrict) : supprimer un Contact ayant des Deals liés ÉCHOUE (pas de cascade)", async () => {
    // Créer un deal rattaché au contact d'A (via forOrg : orgId injecté ; contactId fourni).
    const deal = await forOrg(ORG_A).deal.create({
      data: { title: "Deal lié A", contactId: contactAId } as never,
    });
    expect(deal.contactId).toBe(contactAId);

    // La suppression du contact DOIT rejeter (FK Restrict — Prisma lève P2003/P2014).
    await expect(
      forOrg(ORG_A).contact.delete({ where: { id: contactAId } }),
    ).rejects.toThrow();

    // Le contact existe toujours (pas de cascade silencieuse).
    const stillExists = await basePrisma.contact.count({ where: { id: contactAId } });
    expect(stillExists).toBe(1);

    // Nettoyage : retirer le deal (basePrisma, non scopé) pour ne pas polluer les autres tests.
    await basePrisma.deal.delete({ where: { id: deal.id } });
  });
});
