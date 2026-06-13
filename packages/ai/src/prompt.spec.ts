import { describe, it, expect } from "vitest";
import { buildPrompt, BRIEF_MAX_CHARS, FEW_SHOT_MAX } from "./prompt";
import type { GenerateProposalInput } from "./proposal-generator";

const pricing: GenerateProposalInput["pricing"] = [
  { name: "Jour de conseil", unitPrice: "800", unit: "jour" },
  { name: "Maquette UI", unitPrice: "1200" },
];

const wonExample = {
  bodyText: "Proposition gagnée: refonte du site corporate avec calibrage premium.",
  lines: [{ description: "Refonte", quantity: "1", unitPrice: "5000" }],
};

describe("buildPrompt", () => {
  // Test 1 — AI-02 : LE cœur défensif. Même brief, prompt DIFFÉRENT selon l'historique WON.
  it("le system DIFFÈRE avec vs sans historique WON (calibration AI-02)", () => {
    const brief = "Brief client identique pour les deux orgs.";

    const without = buildPrompt({ brief, pricing, wonExamples: [] });
    const withHistory = buildPrompt({ brief, pricing, wonExamples: [wonExample] });

    // Sans historique : aucune section "GAGNÉES".
    expect(without.system).not.toContain("GAGNÉES");
    // Avec historique : la section est présente et le corps de l'exemple injecté.
    expect(withHistory.system).toContain("GAGNÉES");
    expect(withHistory.system).toContain("refonte du site corporate");
    // Les deux prompts diffèrent (preuve "pas stateless"), AUCUN appel réseau.
    expect(withHistory.system).not.toEqual(without.system);
  });

  // Test 2 — PROP-05 : la grille est dans le system assemblé.
  it("inclut la grille de tarifs dans le system (PROP-05)", () => {
    const { system } = buildPrompt({
      brief: "Un brief.",
      pricing,
      wonExamples: [],
    });
    expect(system).toContain("Jour de conseil");
    expect(system).toContain("800");
    expect(system).toContain("Maquette UI");
    expect(system).toContain("1200");
  });

  // Test 3 — dégradation : grille ET historique vides → pas d'erreur, system non vide, brief en user.
  it("ne lève pas avec grille et historique vides (dégradation gracieuse)", () => {
    const { system, messages } = buildPrompt({
      brief: "Brief minimal.",
      pricing: [],
      wonExamples: [],
    });
    expect(system.length).toBeGreaterThan(0);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("Brief minimal.");
  });

  // Test 4 — anti-DoS / discrétion : brief tronqué, few-shot borné.
  it("tronque un brief trop long et borne le few-shot", () => {
    const hugeBrief = "x".repeat(BRIEF_MAX_CHARS + 5000);
    const manyExamples = Array.from({ length: FEW_SHOT_MAX + 3 }, (_, i) => ({
      bodyText: `Exemple gagné unique numéro ${i}`,
      lines: [],
    }));

    const { system, messages } = buildPrompt({
      brief: hugeBrief,
      pricing,
      wonExamples: manyExamples,
    });

    // Brief tronqué à BRIEF_MAX_CHARS (le message user ne dépasse pas la limite).
    expect((messages[0].content as string).length).toBeLessThanOrEqual(BRIEF_MAX_CHARS);
    // Few-shot borné : le (FEW_SHOT_MAX+1)-ième exemple n'apparaît pas.
    expect(system).toContain("Exemple gagné unique numéro 0");
    expect(system).not.toContain(`Exemple gagné unique numéro ${FEW_SHOT_MAX}`);
  });
});
