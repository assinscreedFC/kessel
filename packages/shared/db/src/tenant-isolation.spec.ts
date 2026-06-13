import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../../../../tests/setup/testcontainers";

// Test d'ISOLATION CROSS-TENANT (FOUND-01, T-1-01) — LE test le plus critique de la phase.
// Real DB via Testcontainers (AUCUN mock — règle projet). Prouve, sur un Postgres réel, que :
//   - l'Org A ne peut NI lire NI écrire les lignes de l'Org B via forOrg() (isolation read + write) ;
//   - GARDE-FOU anti faux-vert : forOrg(org RÉEL) renvoie >0 ligne pour ses propres données —
//     l'isolation n'est pas un artefact d'un orgId fantôme (mitigation T-1-10).
//
// Les orgId A et B sont les id CANONIQUES (= ceux que Better Auth utilisera comme
// activeOrganizationId). OrgNote.orgId est un FK vers organization.id : un seul espace d'id.

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, ".."); // packages/shared/db

const ORG_A = "org-A";
const ORG_B = "org-B";

// Importés dynamiquement APRÈS avoir posé DATABASE_URL sur le conteneur (le client Prisma lit
// l'URL à la construction du module — on doit donc la fixer avant l'import).
type ForOrg = typeof import("./tenant-client").forOrg;
type BasePrisma = typeof import("./client").basePrisma;
type CloseDb = typeof import("./client").closeDb;

describe("tenant-isolation: Org A cannot read/write Org B (FOUND-01, real Postgres)", () => {
  let pg: { uri: string; stop: () => Promise<void> };
  let forOrg: ForOrg;
  let basePrisma: BasePrisma;
  let closeDb: CloseDb;
  let noteAId: string;
  let noteBId: string;

  beforeAll(async () => {
    pg = await startPostgres();

    // Pousser le schéma sur le Postgres réel du conteneur (le push crée vraiment les tables).
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

    // Fixer DATABASE_URL AVANT d'importer le client Prisma (lu à la construction du module).
    process.env.DATABASE_URL = pg.uri;
    ({ forOrg } = await import("./tenant-client"));
    ({ basePrisma, closeDb } = await import("./client"));

    // Setup NON scopé (basePrisma) : 2 orgs canoniques + 1 OrgNote chacune.
    // Les orgId des notes RÉFÈRENT organization.id (FK valide) — pas d'org fantôme.
    // slug est requis (colonne canonique Better Auth, contrainte unique).
    await basePrisma.organization.create({ data: { id: ORG_A, name: "Org A", slug: "org-a" } });
    await basePrisma.organization.create({ data: { id: ORG_B, name: "Org B", slug: "org-b" } });
    const noteA = await basePrisma.orgNote.create({
      data: { orgId: ORG_A, body: "secret A" },
    });
    const noteB = await basePrisma.orgNote.create({
      data: { orgId: ORG_B, body: "secret B" },
    });
    noteAId = noteA.id;
    noteBId = noteB.id;
  });

  afterAll(async () => {
    // Fermer Prisma + le pool pg AVANT d'arrêter le conteneur (évite 57P01 sur connexion ouverte).
    await closeDb?.();
    await pg?.stop();
  });

  it("anti faux-vert : forOrg(org RÉEL) voit ses propres lignes (>0) — orgId pas fantôme", async () => {
    const ownA = await forOrg(ORG_A).orgNote.findMany();
    expect(ownA.length).toBeGreaterThan(0);
    expect(ownA.every((n) => n.orgId === ORG_A)).toBe(true);

    const ownB = await forOrg(ORG_B).orgNote.findMany();
    expect(ownB.length).toBeGreaterThan(0);
    expect(ownB.every((n) => n.orgId === ORG_B)).toBe(true);
  });

  it("create injecte l'orgId du tenant (non fourni dans data)", async () => {
    const created = await forOrg(ORG_A).orgNote.create({ data: { body: "x" } as never });
    expect(created.orgId).toBe(ORG_A);
    // nettoyage
    await basePrisma.orgNote.delete({ where: { id: created.id } });
  });

  it("Org B ne lit JAMAIS une ligne d'Org A (findMany scopé)", async () => {
    const visibleToB = await forOrg(ORG_B).orgNote.findMany();
    expect(visibleToB.some((n) => n.id === noteAId)).toBe(false);
    expect(visibleToB.every((n) => n.orgId === ORG_B)).toBe(true);
  });

  it("Org B ne lit pas la note d'A par findFirst ciblé sur son id", async () => {
    const found = await forOrg(ORG_B).orgNote.findFirst({ where: { id: noteAId } });
    expect(found).toBeNull();
  });

  it("Org B ne peut PAS modifier une ligne d'Org A (updateMany affecte 0 ligne)", async () => {
    const res = await forOrg(ORG_B).orgNote.updateMany({
      where: { id: noteAId },
      data: { body: "hacked" },
    });
    expect(res.count).toBe(0);

    // La note d'A est intacte et toujours lisible via forOrg(A).
    const stillA = await forOrg(ORG_A).orgNote.findFirst({ where: { id: noteAId } });
    expect(stillA?.body).toBe("secret A");
  });

  it("Org B ne peut PAS supprimer une ligne d'Org A (deleteMany affecte 0 ligne)", async () => {
    const res = await forOrg(ORG_B).orgNote.deleteMany({ where: { id: noteAId } });
    expect(res.count).toBe(0);

    // basePrisma (non scopé) confirme que la ligne d'A existe toujours.
    const total = await basePrisma.orgNote.count({ where: { id: noteAId } });
    expect(total).toBe(1);
  });

  it("réciprocité : Org A ne lit jamais la note d'Org B", async () => {
    const visibleToA = await forOrg(ORG_A).orgNote.findMany();
    expect(visibleToA.some((n) => n.id === noteBId)).toBe(false);
    expect(visibleToA.every((n) => n.orgId === ORG_A)).toBe(true);
  });
});
