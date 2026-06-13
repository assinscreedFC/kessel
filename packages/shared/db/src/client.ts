import { PrismaClient } from "@prisma/client";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "./types";

// Client DB central — Prisma confiné à packages/shared/db (FOUND-05). Instancié ICI uniquement.
//
// basePrisma : instance NON scopée. La version scopée org_id (forOrg, extension $extends)
// est ajoutée en Plan 03. Ne pas consommer basePrisma directement pour des requêtes tenant.
//
// db (Kysely) : query builder typé depuis les types générés par prisma-kysely (DB).
// Requêtes complexes / JSONB+GIN (pattern Documenso). Requêtes paramétrées => pas d'injection SQL (T-1-04).

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not configured. Set it in your environment (.env) — see .env.example.",
  );
}

export const basePrisma = new PrismaClient();

const pool = new Pool({ connectionString: DATABASE_URL });

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});
