import type { ProposalOutcomeContext } from "@kessel/shared";
import { grandTotal } from "./money";

// buildOutcomeContext — helper PUR de la boucle de données flywheel (Phase 6, AI-01).
// Dérive un SNAPSHOT figé du contexte d'une proposition résolue, réutilisé par les hooks WON/LOST
// (Plan 06-02). Pur (pas d'I/O, pas d'horloge) -> trivialement testable (figé vs recalculé).
//
// RGPD (T-6-pii) : whitelist STRICTE { amount, lineCount, deliverableCount, bodyTextLength }.
// AUCUNE donnee identifiante client n'est collectee. clientType (segment non-identifiant) est OMIS
// par defaut (A1).
//
// FRONTIERE (FOUND-05) : l'extraction texte ProseMirror vit dans le package ai (type:domain). Ce
// package (proposals) NE PEUT PAS importer le package ai (domain->domain interdit, sens de dependance
// inverse). On porte donc ici une extraction texte recursive locale et minimale (suffisante pour la
// longueur de corps du snapshot). Source unique pour ce calcul = ce module, local.

interface MaybeNode {
  type?: string;
  text?: string;
  content?: unknown[];
}

// Extraction texte récursive tolérante (toute entrée non-doc -> chaîne vide). Locale à @kessel/proposals.
function extractText(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as MaybeNode;
  if (n.type === "text" && typeof n.text === "string") {
    out.push(n.text);
    return;
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) extractText(child, out);
  }
}

function bodyTextOf(bodyJson: unknown): string {
  const out: string[] = [];
  extractText(bodyJson, out);
  return out.join("");
}

type DecimalLike = { toString(): string };

export function buildOutcomeContext(
  proposal: { bodyJson: unknown },
  lines: { quantity: DecimalLike; unitPrice: DecimalLike }[],
): ProposalOutcomeContext {
  const lineInputs = lines.map((l) => ({
    quantity: l.quantity.toString(),
    unitPrice: l.unitPrice.toString(),
  }));
  const bodyTextLength = bodyTextOf(proposal.bodyJson).length;
  return {
    amount: grandTotal(lineInputs), // decimal string exact (snapshot du total devis)
    lineCount: lines.length,
    deliverableCount: lines.length, // A3 : faute de modèle Deliverable en v0 — nb de lignes
    bodyTextLength,
  };
}
