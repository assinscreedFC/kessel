import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { startPostgres } from "../../../../tests/setup/testcontainers";
import type { DB } from "./types";

// Test d'INTÉGRATION (real DB, pas de mock — règle projet). PROUVE que :
//  1. `prisma db push` crée réellement les tables sur un Postgres réel (les types qui compilent
//     sans DB sont un faux positif ; ce push crée les tables) ;
//  2. le FK OrgNote.orgId -> organization.id tient (un orgId orphelin est REJETÉ) ;
//  3. la table canonique `organization` (mappée Better Auth) + OrgNote existent et se joignent.

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, ".."); // packages/shared/db

describe("schema métier multi-tenant (FOUND-01, real Postgres)", () => {
  let pg: { uri: string; stop: () => Promise<void> };
  let db: Kysely<DB>;
  let pool: Pool;

  beforeAll(async () => {
    pg = await startPostgres();

    // BLOCKING : pousser le schéma métier sur le Postgres réel du conteneur.
    // prisma db push crée vraiment organization + OrgNote (et le FK).
    // On invoque le bin Prisma via `node <bin>` (cross-platform ; évite spawnSync npx.cmd EINVAL sur Windows).
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
      {
        cwd: packageDir,
        env: { ...process.env, DATABASE_URL: pg.uri },
        stdio: "inherit",
      },
    );

    pool = new Pool({ connectionString: pg.uri });
    db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  });

  afterAll(async () => {
    await db?.destroy();
    await pg?.stop();
  });

  it("crée la table canonique organization + OrgNote (le push a réellement appliqué le schéma)", async () => {
    await db
      .insertInto("organization")
      .values({ id: "org-A", name: "Org A", slug: "org-a" })
      .execute();

    const org = await db
      .selectFrom("organization")
      .selectAll()
      .where("id", "=", "org-A")
      .executeTakeFirst();

    expect(org).toBeDefined();
    expect(org?.name).toBe("Org A");
  });

  it("insère une OrgNote(orgId=org-A) et la relit jointe à son organization (FK tient)", async () => {
    await db
      .insertInto("OrgNote")
      .values({ id: "note-1", orgId: "org-A", body: "note de l'org A" })
      .execute();

    const row = await db
      .selectFrom("OrgNote")
      .innerJoin("organization", "organization.id", "OrgNote.orgId")
      .select([
        "OrgNote.id as noteId",
        "OrgNote.orgId as orgId",
        "OrgNote.body as body",
        "organization.name as orgName",
      ])
      .where("OrgNote.id", "=", "note-1")
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row?.orgId).toBe("org-A");
    expect(row?.body).toBe("note de l'org A");
    // L'orgId pointe une organization existante (jointure résolue) — un seul espace d'id.
    expect(row?.orgName).toBe("Org A");
  });

  it("rejette une OrgNote dont l'orgId ne référence aucune organization (FK orphelin impossible)", async () => {
    await expect(
      db
        .insertInto("OrgNote")
        .values({ id: "note-orphan", orgId: "org-INEXISTANT", body: "doit échouer" })
        .execute(),
    ).rejects.toThrow();
  });

  // === Smoke des 4 modèles Phase 3 (PROP-01/02/03) — prouve que le push a créé les tables ===
  // Le push (beforeAll) applique le schéma sur le Postgres réel : ces inserts/joins échoueraient si
  // une table manquait. Vérifie aussi : FK QuoteLine -> Proposal cascade ; dealId orphelin rejeté.
  //
  // NB : `@updatedAt` (Prisma) est géré par le client Prisma, PAS par un défaut DB. Comme ces smokes
  // insèrent via Kysely brut, on fournit `updatedAt` explicitement (colonne NOT NULL sans défaut DB).
  // En applicatif, c'est forOrg(...) (Prisma) qui le renseigne automatiquement.
  const now = new Date();

  it("crée une Proposal rattachée à un Deal (les tables Proposal/Deal/Contact existent réellement)", async () => {
    // Un Deal a besoin d'un Contact (FK Restrict). Contact a besoin d'une org (déjà org-A).
    await db
      .insertInto("Contact")
      .values({ id: "contact-p", orgId: "org-A", name: "Client A", email: "c@org-a.test", updatedAt: now })
      .execute();
    await db
      .insertInto("Deal")
      .values({ id: "deal-p", orgId: "org-A", contactId: "contact-p", title: "Deal P", updatedAt: now })
      .execute();
    await db
      .insertInto("Proposal")
      .values({
        id: "prop-1",
        orgId: "org-A",
        dealId: "deal-p",
        title: "Proposition 1",
        bodyJson: JSON.stringify({ type: "doc", content: [] }),
        updatedAt: now,
      })
      .execute();

    const prop = await db
      .selectFrom("Proposal")
      .selectAll()
      .where("id", "=", "prop-1")
      .executeTakeFirst();
    expect(prop).toBeDefined();
    expect(prop?.status).toBe("DRAFT"); // défaut de l'enum ProposalStatus
    expect(prop?.dealId).toBe("deal-p");
  });

  it("rejette une Proposal dont le dealId ne référence aucun Deal (FK orphelin impossible)", async () => {
    await expect(
      db
        .insertInto("Proposal")
        .values({
          id: "prop-orphan",
          orgId: "org-A",
          dealId: "deal-INEXISTANT",
          title: "orpheline",
          bodyJson: JSON.stringify({ type: "doc", content: [] }),
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("crée un ProposalTemplate (la table existe) et le relit", async () => {
    await db
      .insertInto("ProposalTemplate")
      .values({
        id: "tpl-1",
        orgId: "org-A",
        name: "Template offre",
        bodyJson: JSON.stringify({ type: "doc", content: [] }),
        updatedAt: now,
      })
      .execute();
    const tpl = await db
      .selectFrom("ProposalTemplate")
      .selectAll()
      .where("id", "=", "tpl-1")
      .executeTakeFirst();
    expect(tpl?.name).toBe("Template offre");
  });

  it("crée un PricingItem avec unitPrice Decimal (la table existe)", async () => {
    await db
      .insertInto("PricingItem")
      .values({ id: "pi-1", orgId: "org-A", name: "Jour de dev", unitPrice: "800.00", unit: "jour", updatedAt: now })
      .execute();
    const pi = await db
      .selectFrom("PricingItem")
      .selectAll()
      .where("id", "=", "pi-1")
      .executeTakeFirst();
    expect(pi?.name).toBe("Jour de dev");
    expect(Number(pi?.unitPrice)).toBe(800);
    expect(pi?.unit).toBe("jour");
  });

  it("crée une QuoteLine rattachée à la Proposal et la cascade delete suit la Proposal (FK + cascade)", async () => {
    // QuoteLine = snapshot (pas de FK vers PricingItem) : description/unitPrice copiés à la main.
    await db
      .insertInto("QuoteLine")
      .values({
        id: "ql-1",
        proposalId: "prop-1",
        description: "Jour de dev",
        quantity: "3",
        unitPrice: "800.00",
        position: 0,
      })
      .execute();

    const line = await db
      .selectFrom("QuoteLine")
      .selectAll()
      .where("id", "=", "ql-1")
      .executeTakeFirst();
    expect(line?.proposalId).toBe("prop-1");
    expect(Number(line?.quantity)).toBe(3);

    // Cascade : supprimer la Proposal supprime ses QuoteLine.
    await db.deleteFrom("Proposal").where("id", "=", "prop-1").execute();
    const afterCascade = await db
      .selectFrom("QuoteLine")
      .selectAll()
      .where("id", "=", "ql-1")
      .executeTakeFirst();
    expect(afterCascade).toBeUndefined();
  });
});
