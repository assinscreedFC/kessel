import { describe, it, expect } from "vitest";
import { sectionsToProseMirror } from "./body-doc";
import { proseMirrorToText } from "./body-text";

// Nœuds autorisés par PROPOSAL_EXTENSIONS (StarterKit heading levels [1,2,3], link).
const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "text",
]);

function collectTypes(node: unknown, acc: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const n = node as { type?: string; content?: unknown[] };
  if (typeof n.type === "string") acc.add(n.type);
  if (Array.isArray(n.content)) for (const c of n.content) collectTypes(c, acc);
}

describe("sectionsToProseMirror", () => {
  // Test 1 — PROP-04 : seuls les nœuds autorisés par PROPOSAL_EXTENSIONS sont émis.
  it("n'émet QUE des nœuds autorisés par PROPOSAL_EXTENSIONS", () => {
    const doc = sectionsToProseMirror([
      { heading: "Périmètre", paragraphs: ["Un paragraphe."], bullets: ["A", "B"] },
    ]) as { type: string };
    expect(doc.type).toBe("doc");
    const types = new Set<string>();
    collectTypes(doc, types);
    for (const t of types) expect(ALLOWED_NODES.has(t)).toBe(true);
  });

  // Test 2 — réparation/non-vide : entrée vide → doc avec ≥1 bloc, JAMAIS content vide.
  it("produit un doc non vide même avec une entrée vide", () => {
    const empty = sectionsToProseMirror([]) as { type: string; content: unknown[] };
    expect(empty.type).toBe("doc");
    expect(empty.content.length).toBeGreaterThanOrEqual(1);

    const allBlank = sectionsToProseMirror([
      { heading: "  ", paragraphs: ["   ", ""], bullets: ["  "] },
    ]) as { content: unknown[] };
    expect(allBlank.content.length).toBeGreaterThanOrEqual(1);
  });

  // Test 3 — filtrage : blancs ignorés, heading vide → pas de nœud heading.
  it("ignore les paragraphes/bullets blancs et le heading vide", () => {
    const doc = sectionsToProseMirror([
      { heading: "", paragraphs: ["   ", "Vrai paragraphe"], bullets: ["  ", "Vrai bullet"] },
    ]) as { content: { type: string }[] };
    const headings = doc.content.filter((n) => n.type === "heading");
    expect(headings).toHaveLength(0);
    const paragraphs = doc.content.filter((n) => n.type === "paragraph");
    expect(paragraphs).toHaveLength(1);
  });

  // Test 4 — structure : 1 heading + 2 paragraphes + 3 bullets.
  it("assemble 1 heading(level 2) + 2 paragraphes + 1 bulletList(3 items)", () => {
    const doc = sectionsToProseMirror([
      {
        heading: "Titre",
        paragraphs: ["P1", "P2"],
        bullets: ["b1", "b2", "b3"],
      },
    ]) as { content: { type: string; attrs?: { level: number }; content?: unknown[] }[] };

    const headings = doc.content.filter((n) => n.type === "heading");
    expect(headings).toHaveLength(1);
    expect(headings[0].attrs?.level).toBe(2);

    const paragraphs = doc.content.filter((n) => n.type === "paragraph");
    expect(paragraphs).toHaveLength(2);

    const lists = doc.content.filter((n) => n.type === "bulletList");
    expect(lists).toHaveLength(1);
    expect(lists[0].content).toHaveLength(3);
  });
});

describe("proseMirrorToText", () => {
  // Extraction de texte récursive (alimente bodyText des exemples WON few-shot, Plan 02).
  it("extrait le texte concaténé d'un doc ProseMirror", () => {
    const doc = sectionsToProseMirror([
      { heading: "Titre", paragraphs: ["Bonjour"], bullets: ["Item"] },
    ]);
    const text = proseMirrorToText(doc);
    expect(text).toContain("Titre");
    expect(text).toContain("Bonjour");
    expect(text).toContain("Item");
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it("renvoie une chaîne vide pour un doc vide ou invalide", () => {
    expect(proseMirrorToText({ type: "doc", content: [{ type: "paragraph" }] }).trim()).toBe("");
    expect(proseMirrorToText(null)).toBe("");
    expect(proseMirrorToText("pas un doc")).toBe("");
  });
});
