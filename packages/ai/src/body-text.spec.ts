import { describe, expect, it } from "vitest";
import { proseMirrorToText } from "./body-text";

// body-text.spec — extraction de texte d'un doc ProseMirror (alimente le few-shot WON, AI-02).
// Le bodyText extrait DOIT être NON VIDE pour un doc avec contenu réel (sinon le few-shot serait
// un placeholder vide — WARNING 2 du plan). Tolérance : entrée non-doc -> chaîne vide.

const docWithContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Périmètre du projet" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Refonte du site vitrine." }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Intégration responsive et SEO." }],
    },
  ],
};

describe("proseMirrorToText", () => {
  it("extrait un texte NON VIDE contenant les mots d'un doc heading + paragraphes", () => {
    const text = proseMirrorToText(docWithContent);

    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("Périmètre du projet");
    expect(text).toContain("Refonte du site vitrine.");
    expect(text).toContain("Intégration responsive et SEO.");
  });

  it("préserve la séparation par blocs (heading puis paragraphes séparés)", () => {
    const text = proseMirrorToText(docWithContent);
    // Heading et premier paragraphe sont sur des blocs distincts (saut de ligne entre eux).
    expect(text).toMatch(/Périmètre du projet\nRefonte du site vitrine\./);
  });

  it("rend une chaîne vide pour un doc sans contenu", () => {
    expect(proseMirrorToText({ type: "doc", content: [] })).toBe("");
    expect(proseMirrorToText({})).toBe("");
  });

  it("est tolérant : entrée null / scalaire / non-objet -> chaîne vide", () => {
    expect(proseMirrorToText(null)).toBe("");
    expect(proseMirrorToText(undefined)).toBe("");
    expect(proseMirrorToText("pas un doc")).toBe("");
    expect(proseMirrorToText(42)).toBe("");
  });
});
