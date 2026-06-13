import type { GeneratedBodySection } from "./proposal-generator";

// body-doc.ts — assemblage DÉTERMINISTE de sections plates -> document ProseMirror.
//
// Pourquoi côté serveur (et non émis par l'IA) : le schéma `strict` d'Anthropic INTERDIT les schémas
// récursifs, or un doc ProseMirror est récursif. L'IA émet donc des `bodySections[]` PLATES, et le
// serveur les assemble ici en un doc garanti valide pour PROPOSAL_EXTENSIONS (T-4-bodydoc).
//
// Garanties (Pitfall 1) :
//  - seuls les nœuds doc/heading/paragraph/bulletList/listItem/text sont émis (jamais table/image/codeBlock) ;
//  - le doc n'est JAMAIS vide (Tiptap exige ≥1 bloc) — fallback paragraphe vide ;
//  - les contenus blancs sont filtrés (pas de nœud heading/paragraph/bullet vide).

interface ProseMirrorTextNode {
  type: "text";
  text: string;
}
interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: (ProseMirrorNode | ProseMirrorTextNode)[];
}
export interface ProseMirrorDoc {
  type: "doc";
  content: (ProseMirrorNode | ProseMirrorTextNode)[];
}

const HEADING_LEVEL = 2; // sections -> titres niveau 2 (autorisé par heading levels [1,2,3])

function textNode(text: string): ProseMirrorTextNode {
  return { type: "text", text };
}

function paragraph(text: string): ProseMirrorNode {
  return { type: "paragraph", content: [textNode(text)] };
}

export function sectionsToProseMirror(sections: GeneratedBodySection[]): ProseMirrorDoc {
  const content: (ProseMirrorNode | ProseMirrorTextNode)[] = [];

  for (const section of sections ?? []) {
    if (section.heading?.trim()) {
      content.push({
        type: "heading",
        attrs: { level: HEADING_LEVEL },
        content: [textNode(section.heading.trim())],
      });
    }

    for (const p of section.paragraphs ?? []) {
      if (p?.trim()) content.push(paragraph(p.trim()));
    }

    const bullets = (section.bullets ?? []).filter((b) => b?.trim());
    if (bullets.length > 0) {
      content.push({
        type: "bulletList",
        content: bullets.map((b) => ({
          type: "listItem",
          content: [paragraph(b.trim())],
        })),
      });
    }
  }

  // Doc jamais vide : Tiptap exige ≥1 bloc, sinon l'éditeur Phase 3 casse au chargement.
  if (content.length === 0) content.push({ type: "paragraph" });

  return { type: "doc", content };
}
