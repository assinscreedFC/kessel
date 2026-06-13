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
      .values({ id: "org-A", name: "Org A" })
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
});
