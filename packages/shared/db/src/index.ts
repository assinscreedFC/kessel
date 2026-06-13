// @kessel/db — surface publique UNIQUE du package db (FOUND-05).
// Prisma + Kysely sont instanciés et confinés ICI ; les autres packages ne consomment que cette API.
export { basePrisma, db } from "./client";
export { forOrg } from "./tenant-client";
export type { DB } from "./types";
