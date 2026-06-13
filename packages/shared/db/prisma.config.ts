import { defineConfig, env } from "prisma/config";

// Prisma 7 : la configuration (schéma + URL de connexion pour migrate/push/introspection)
// vit ICI, plus dans le bloc datasource du schema.prisma (breaking change Prisma 7).
// L'URL pointe le MÊME Postgres que Better Auth (Plan 04) — un seul datastore, un seul espace d'id org.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
