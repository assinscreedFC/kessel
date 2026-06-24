import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

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
//   1. Prisma db push : crée `organization` (MIROIR FIDÈLE des colonnes canoniques Better Auth :
//      id/name/slug/logo/metadata/createdAt) + OrgNote + le FK. `db push` est un reconcile DESTRUCTIF
//      (il DROP toute table absente du schéma Prisma) → il doit passer EN PREMIER.
//   2. PUIS Better Auth migrate (runBetterAuthMigrations) : ADDITIF — voit `organization` déjà
//      complète, ne crée QUE user/session/account/member/invitation/verification.
// Inverser l'ordre ferait droper user/session/account par le push Prisma. Un seul espace d'id org.

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not configured. Set it in your environment (.env) — see .env.example.",
  );
}

// BETTER_AUTH_SECRET : clé de signature des sessions/cookies. JAMAIS hardcodée (CLAUDE.md security).
// En dev/test, Better Auth génère une clé éphémère si absente ; en prod elle DOIT être fournie.
const authPool = new Pool({ connectionString: DATABASE_URL });

// Origines de confiance (anti-CSRF Better Auth). L'origine de BETTER_AUTH_URL est TOUJOURS fiable.
// En prod, Caddy sert web + /api en same-origin (http://localhost) -> rien à ajouter. En DEV, le web
// (Vite) tourne sur :5173 et le portail sur :5174 : leur Origin diffère de BETTER_AUTH_URL -> sans
// les déclarer, signup/login renvoient 403 "Invalid origin". Surchargeable via env (CSV).
const trustedOrigins = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: authPool, // MÊME Postgres que Prisma (un seul datastore, un seul espace d'id org)
  secret: process.env.BETTER_AUTH_SECRET, // via env uniquement, jamais en clair
  trustedOrigins, // origines dev (Vite 5173/5174) en plus de l'origine baseURL toujours fiable
  emailAndPassword: { enabled: true }, // FOUND-02 : signup/login email+password, sessions DB
  plugins: [organization()], // FOUND-01/03 : source canonique org + rôles owner/admin/member
  databaseHooks: {
    // Bootstrap org (FOUND-01/03) : chaque nouvel utilisateur reçoit SON organisation + membership
    // owner. Les 2 INSERT (organization + member) s'exécutent dans une transaction atomique : si le
    // 2e INSERT échoue, ROLLBACK garantit qu'aucune org orpheline n'est laissée en base. Le slug
    // dérive de l'id user (unicité garantie par la contrainte user.id). Fail-closed : l'erreur est
    // re-propagée pour que le signup échoue proprement plutôt que de créer un user sans membership.
    // Colonnes Better Auth en camelCase -> identifiants SQL quotés.
    user: {
      create: {
        after: async (user) => {
          const orgId = randomUUID();
          const slug = `org-${String(user.id).slice(0, 12).toLowerCase()}`;
          const name = user.name?.trim() || user.email;
          const client = await authPool.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              `INSERT INTO organization (id, name, slug) VALUES ($1, $2, $3)`,
              [orgId, name, slug],
            );
            await client.query(
              `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
               VALUES ($1, $2, $3, $4, now())`,
              [randomUUID(), orgId, user.id, "owner"],
            );
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }
        },
      },
    },
    // Injecte activeOrganizationId dans la session à sa création : 1ère org du membre (ordre createdAt).
    // C'est cet id que forOrg(session.activeOrganizationId) (Plan 03) filtre côté requêtes métier.
    session: {
      create: {
        before: async (session) => {
          const res = await authPool.query<{ organizationId: string }>(
            `SELECT "organizationId" FROM member WHERE "userId" = $1 ORDER BY "createdAt" ASC LIMIT 1`,
            [session.userId],
          );
          return { data: { ...session, activeOrganizationId: res.rows[0]?.organizationId ?? null } };
        },
      },
    },
  },
});

export type Auth = typeof auth;

// Ferme le pool pg de Better Auth (teardown déterministe en test/arrêt applicatif).
export async function closeAuthPool(): Promise<void> {
  await authPool.end();
}
