// @kessel/auth — SEUL point d'export public du domaine auth (FOUND-05).
//
// Better Auth est la SOURCE CANONIQUE de l'identité organisation (plugin organization :
// tables organization/member/role + activeOrganizationId en session). Le model Prisma
// Organization mappe cette table (Plan 02) ; forOrg filtre sur le MÊME id (Plan 03).
export { auth, type Auth, closeAuthPool } from "./auth";
export { runBetterAuthMigrations } from "./migrate";
