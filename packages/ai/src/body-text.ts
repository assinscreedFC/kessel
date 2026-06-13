// body-text.ts — extraction de texte brut depuis un document ProseMirror.
//
// Usage : dériver le `bodyText` des propositions GAGNÉES (bodyJson ProseMirror persisté Phase 3) pour
// les injecter en few-shot dans le prompt (AI-02, consommé par readWonProposals en Plan 02). Le texte
// extrait doit être NON VIDE pour les orgs avec historique réel — c'est ce qui calibre la génération.
//
// Pur, récursif, tolérant : toute entrée non-doc (null, string, objet malformé) -> chaîne vide.

interface MaybeNode {
  type?: string;
  text?: string;
  content?: unknown[];
}

// Sépare heading/paragraph/listItem par un saut de ligne pour préserver la lisibilité du few-shot.
const BLOCK_TYPES = new Set(["heading", "paragraph", "listItem"]);

function walk(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as MaybeNode;

  if (n.type === "text" && typeof n.text === "string") {
    out.push(n.text);
    return;
  }

  if (Array.isArray(n.content)) {
    for (const child of n.content) walk(child, out);
    if (n.type && BLOCK_TYPES.has(n.type)) out.push("\n");
  }
}

export function proseMirrorToText(doc: unknown): string {
  const out: string[] = [];
  walk(doc, out);
  // Normalise les sauts de ligne multiples et trim les bords ; espaces internes inchangés.
  return out.join("").replace(/\n{2,}/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/^\n+|\n+$/g, "");
}
