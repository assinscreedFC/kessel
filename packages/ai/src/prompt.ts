import type Anthropic from "@anthropic-ai/sdk";
import type { GenerateProposalInput } from "./proposal-generator";

// prompt.ts — assemblage PUR du prompt de génération. AUCUN I/O réseau, AUCUN accès DB.
//
// C'est le cœur défensif testable d'AI-02 (flywheel) : le `system` DIFFÈRE selon que l'org a un
// historique de propositions GAGNÉES ou non. Cette différence est démontrable par un test unitaire
// pur, sans jamais appeler Claude — la preuve que la génération n'est PAS stateless.
//
// Sécurité (T-4-injection) : le brief vit dans le canal `user`, les instructions dans le `system` —
// jamais mélangés. Le brief est tronqué (anti-DoS / budget tokens) ; le few-shot est borné.

// Constantes nommées (pas de magic numbers inline).
export const FEW_SHOT_MAX = 5; // discrétion CONTEXT : 3-5 exemples gagnés en few-shot
export const BRIEF_MAX_CHARS = 12_000; // troncature anti-DoS / budget tokens
export const EXAMPLE_BODY_MAX_CHARS = 3_000; // corps d'exemple gagné borné

const BASE_RULES =
  "Tu génères des propositions commerciales pour une agence ou un freelance. " +
  "Tu produis un périmètre, des livrables, des notes de charge, un corps structuré et un devis chiffré. " +
  "Chiffre le devis EXCLUSIVEMENT avec la grille de tarifs fournie quand un livrable y correspond ; " +
  "sinon propose une ligne libre avec un prix cohérent. Les montants sont des nombres en euros.";

function formatPricing(pricing: GenerateProposalInput["pricing"]): string {
  if (pricing.length === 0) return "(aucune grille fournie)";
  return pricing
    .map((p) => `- ${p.name}: ${p.unitPrice}€${p.unit ? "/" + p.unit : ""}`)
    .join("\n");
}

function formatWonExamples(wonExamples: GenerateProposalInput["wonExamples"]): string {
  return wonExamples
    .slice(0, FEW_SHOT_MAX)
    .map((e, i) => {
      const lines = e.lines
        .map((l) => `  - ${l.description} ×${l.quantity} @ ${l.unitPrice}€`)
        .join("\n");
      const body = e.bodyText.slice(0, EXAMPLE_BODY_MAX_CHARS);
      return `### Exemple gagné ${i + 1}\n${body}${lines ? `\nLignes:\n${lines}` : ""}`;
    })
    .join("\n\n");
}

// buildPrompt — PUR : (brief + grille + few-shot WON) -> { system, messages }.
export function buildPrompt(args: GenerateProposalInput): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  const brief = args.brief.slice(0, BRIEF_MAX_CHARS);

  let system = `${BASE_RULES}\n\n## Grille de tarifs\n${formatPricing(args.pricing)}`;

  // CALIBRATION (AI-02) : la section few-shot n'est ajoutée QUE si un historique gagné existe.
  // C'est la branche qui fait DIFFÉRER le prompt selon l'historique de l'org.
  if (args.wonExamples.length > 0) {
    system +=
      "\n\n## Propositions GAGNÉES passées (calibre ton style, ta structure et tes prix là-dessus)\n" +
      formatWonExamples(args.wonExamples);
  }

  return { system, messages: [{ role: "user", content: brief }] };
}
