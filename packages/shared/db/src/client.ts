import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
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

// Prisma 7 (prisma-client-js) exige un driver adapter : l'URL ne vit plus dans le client runtime.
// On donne à Prisma son PROPRE pool (via PrismaPg(connectionString)) et à Kysely le sien :
// chacun possède et ferme son pool indépendamment (teardown déterministe, pas de double-end).
export const basePrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const kyselyPool = new Pool({ connectionString: DATABASE_URL });

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool: kyselyPool }),
});

// Libère proprement TOUTES les ressources DB (Prisma + son pool, Kysely + son pool).
// À appeler en teardown (tests, arrêt applicatif) AVANT de couper le datastore, pour éviter
// qu'une connexion encore ouverte ne reçoive un 57P01 (terminating connection) à l'arrêt du serveur.
export async function closeDb(): Promise<void> {
  await basePrisma.$disconnect(); // ferme le pool interne de l'adapter Prisma
  await db.destroy(); // ferme le pool pg de Kysely
}
