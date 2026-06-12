import { defineWorkspace } from "vitest/config";

// Configuration vitest racine multi-package (Wave 0).
// Liste les configs vitest des packages + les tests d'infra racine (tests/).
export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "packages/shared/*/vitest.config.ts",
  {
    test: {
      name: "root",
      include: ["tests/**/*.spec.ts"],
      coverage: { provider: "v8" },
    },
  },
]);
