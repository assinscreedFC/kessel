import { defineConfig } from "vitest/config";

// Config vitest du package ai. Les specs (prompt.spec.ts, body-doc.spec.ts) sont PURES :
// assemblage de prompt + assemblage ProseMirror déterministe, AUCUN appel LLM, AUCUNE DB. Rapides.
// La frontière LLM (ProposalGenerator) est fakée ; l'impl Anthropic n'est exercée qu'en e2e (Plan 02).
export default defineConfig({
  test: {
    name: "ai",
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
