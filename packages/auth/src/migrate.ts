import { getMigrations } from "better-auth/db/migration";
import { auth } from "./auth";

// Migration programmatique des tables Better Auth (source canonique org).
//
// Pourquoi pas la CLI `@better-auth/cli migrate` : ce package n'est pas publié à la version
// alignée (1.6.18) ; `getMigrations(options)` est l'API programmatique officielle équivalente,
// exposée par `better-auth/db`. Elle crée user/session/account + organization/member/role
// (plugin organization) sur le Postgres ciblé par DATABASE_URL.
//
// ORDRE (recréation de DB) : `prisma db push` D'ABORD (crée `organization` miroir + OrgNote + FK ;
// db push est destructif, il DROP les tables hors schéma), PUIS runBetterAuthMigrations() qui est
// ADDITIF (ne crée que les tables manquantes : user/session/account/member/invitation/verification ;
// respecte `organization` pré-créée). L'inverse ferait effacer user/session/account par le push.

export async function runBetterAuthMigrations(): Promise<void> {
  // auth.options porte la config résolue (database, plugins) consommée par getMigrations.
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

// Permet d'exécuter la migration en CLI : `tsx src/migrate.ts`.
if (process.argv[1] && process.argv[1].includes("migrate")) {
  runBetterAuthMigrations()
    .then(() => {
      console.log("Better Auth migrations applied (organization/member/role + auth tables).");
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Better Auth migration failed:", err);
      process.exit(1);
    });
}
