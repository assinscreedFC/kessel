import { describe, it, expect } from "vitest";
import { startPostgres } from "./setup/testcontainers";

// Test 2 (Wave 0): le helper startPostgres() démarre un Postgres jetable
// et retourne une connection string postgresql:// valide (real I/O, pas de mock).
describe("startPostgres helper", () => {
  it(
    "starts a Postgres container and returns a postgresql:// uri",
    async () => {
      const { uri, stop } = await startPostgres();
      try {
        expect(uri.startsWith("postgresql://")).toBe(true);
      } finally {
        await stop();
      }
    },
    120_000,
  );
});
