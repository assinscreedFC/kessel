import { runBetterAuthMigrations, closeAuthPool } from "@kessel/auth";

// Entrypoint de migration du conteneur api (Plan 05, FOUND-04).
//
// ORDRE CANONIQUE (prouvé en Wave 4, NE PAS inverser) :
//   1. `prisma db push` (lancé AVANT par le script entrypoint shell) crée la table `organization`
//      (miroir fidèle des colonnes Better Auth) + OrgNote + FK. `db push` est DESTRUCTIF (DROP des
//      tables hors schéma) -> il DOIT précéder Better Auth migrate.
//   2. CE script lance ENSUITE runBetterAuthMigrations() (ADDITIF) : crée user/session/account/
//      member/invitation/verification, respecte `organization` pré-créée. Inverser droperait
//      user/session/account.
//
// Idempotent : db push et Better Auth migrate sont des reconcile/diff — relançables au boot.

async function main(): Promise<void> {
  await runBetterAuthMigrations();
  await closeAuthPool();
  console.log("Better Auth migrations applied (auth tables additives).");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Better Auth migration failed:", err);
    process.exit(1);
  });
