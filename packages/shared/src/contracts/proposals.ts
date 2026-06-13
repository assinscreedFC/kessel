// @kessel/shared/contracts/proposals — CONTRAT PARTAGÉ front/back des propositions & tarifs (FOUND-05).
//
// SOURCE DE VÉRITÉ UNIQUE (anti-drift) : les shapes d'input/réponse vivent ICI, en TypeScript PUR —
// AUCUN import de framework (pas de class-validator, pas de zod, pas de @prisma, pas de Tiptap).
// Le serveur (apps/api) dérive ses DTO class-validator de ce contrat ; le web (apps/web) ses schémas zod.
// Montants Decimal mappés en string (précision monétaire — Pitfall 2) ; dates en string ISO.
// bodyJson = document ProseMirror/Tiptap : typé `unknown` (forme contrôlée par le schéma de l'éditeur,
// validé/borné côté serveur ; jamais exécuté).

// Statut volontairement réduit à DRAFT en Phase 3 (SENT/SIGNED viendront Phase 5).
export const ProposalStatus = { DRAFT: "DRAFT" } as const;
export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];

// === Grille de tarifs (PricingItem) ===
export interface PricingItemInput {
  name: string;
  unitPrice: number;
  unit?: string | null;
}
export interface PricingItemDto {
  id: string;
  name: string;
  unitPrice: string;
  unit: string | null;
  createdAt: string;
  updatedAt: string;
}

// === Ligne de devis (QuoteLine) — snapshot (description/unitPrice copiés à l'ajout) ===
export interface QuoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  position: number;
}
export interface QuoteLineDto {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string; // calculé serveur (decimal.js), non stocké
  position: number;
}

// === Templates de proposition ===
export interface ProposalTemplateInput {
  name: string;
  bodyJson: unknown;
}
export interface ProposalTemplateDto {
  id: string;
  name: string;
  bodyJson: unknown;
  createdAt: string;
  updatedAt: string;
}

// === Propositions ===
export interface CreateProposalInput {
  dealId: string;
  title: string;
  bodyJson: unknown;
  // OPTIONNEL (rétro-compatible) : lignes de devis pré-remplies, persistées atomiquement dans le
  // MÊME proposal.create (snapshot — mêmes règles que QuoteLineInput, quantity/unitPrice numériques).
  // Les appelants Phase 3 qui ne passent pas `lines` créent une proposition sans ligne (comportement
  // inchangé). Le moteur IA (Phase 4) passe les lignes générées ici.
  lines?: QuoteLineInput[];
}
export interface CreateFromTemplateInput {
  templateId: string;
  dealId: string;
  title: string;
}
export interface UpdateProposalInput {
  title?: string;
  bodyJson?: unknown;
}
export interface ProposalDto {
  id: string;
  dealId: string;
  title: string;
  bodyJson: unknown;
  status: ProposalStatus;
  lines: QuoteLineDto[];
  grandTotal: string; // calculé serveur (decimal.js), non stocké
  createdAt: string;
  updatedAt: string;
}
