import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { Pool } from "pg";

// Instance Better Auth — SOURCE CANONIQUE de l'identité organisation (FOUND-01/02/03).
//
// Le plugin `organization` POSSÈDE et crée les tables `organization` / `member` / `role`
// et expose `activeOrganizationId` en session. C'est CET id (`organization.id`) que le model
// Prisma Organization MAPPE (@@map, Plan 02) et que `forOrg(session.activeOrganizationId)`
// (Plan 03) filtre — un seul espace d'id org (mitigation T-1-10, pas d'isolation fantôme).
//
// Better Auth pointe le MÊME Postgres que Prisma (DATABASE_URL — A1) : un seul datastore.
// On lui passe directement un pool `pg` ; Better Auth détecte le dialecte Postgres (Kysely interne)
// et stocke les sessions en DB (string, pas JWT vendor — V3 session management).
//
// ORDRE DE MIGRATION (recréation de DB, ex. tests / CI) :
//   1. Better Auth migrate (crée organization/member/role + user/session/account) — runBetterAuthMigrations().
//   2. PUIS Prisma db push des tables métier (OrgNote.orgId est un FK vers organization.id).
// Inverser l'ordre casse le FK (organization n'existe pas encore). Voir runBetterAuthMigrations.

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not configured. Set it in your environment (.env) — see .env.example.",
  );
}

// BETTER_AUTH_SECRET : clé de signature des sessions/cookies. JAMAIS hardcodée (CLAUDE.md security).
// En dev/test, Better Auth génère une clé éphémère si absente ; en prod elle DOIT être fournie.
const authPool = new Pool({ connectionString: DATABASE_URL });

export const auth = betterAuth({
  database: authPool, // MÊME Postgres que Prisma (un seul datastore, un seul espace d'id org)
  secret: process.env.BETTER_AUTH_SECRET, // via env uniquement, jamais en clair
  emailAndPassword: { enabled: true }, // FOUND-02 : signup/login email+password, sessions DB
  plugins: [organization()], // FOUND-01/03 : source canonique org + rôles owner/admin/member
});

export type Auth = typeof auth;

// Ferme le pool pg de Better Auth (teardown déterministe en test/arrêt applicatif).
export async function closeAuthPool(): Promise<void> {
  await authPool.end();
}
