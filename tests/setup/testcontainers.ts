import { PostgreSqlContainer } from "@testcontainers/postgresql";

/**
 * Helper Wave 0 — démarre un conteneur Postgres jetable pour les tests d'intégration.
 * Consommé par les tests d'isolation tenant (Plan 03) et RBAC (Plan 04).
 * Règle projet : real I/O en test, PAS de mock de la DB.
 */
export async function startPostgres(): Promise<{
  uri: string;
  stop: () => Promise<void>;
}> {
  const container = await new PostgreSqlContainer("postgres:16").start();
  // testcontainers émet `postgres://` ; Prisma/Kysely (Plan 02) attendent le
  // schéma canonique `postgresql://`. On normalise ici, à la frontière du helper.
  const uri = container.getConnectionUri().replace(/^postgres:\/\//, "postgresql://");
  return {
    uri,
    stop: () => container.stop().then(() => undefined),
  };
}
