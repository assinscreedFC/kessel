import { defineConfig } from "vitest/config";

// Config vitest du package proposals. money.spec.ts est PUR (decimal.js, pas de DB) — rapide.
export default defineConfig({
  test: {
    name: "proposals",
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
