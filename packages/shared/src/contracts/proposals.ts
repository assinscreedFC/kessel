// @kessel/shared/contracts/proposals — CONTRAT PARTAGÉ front/back des propositions & tarifs (FOUND-05).
//
// SOURCE DE VÉRITÉ UNIQUE (anti-drift) : les shapes d'input/réponse vivent ICI, en TypeScript PUR —
// AUCUN import de framework (pas de class-validator, pas de zod, pas de @prisma, pas de Tiptap).
// Le serveur (apps/api) dérive ses DTO class-validator de ce contrat ; le web (apps/web) ses schémas zod.
// Montants Decimal mappés en string (précision monétaire — Pitfall 2) ; dates en string ISO.
// bodyJson = document ProseMirror/Tiptap : typé `unknown` (forme contrôlée par le schéma de l'éditeur,
// validé/borné côté serveur ; jamais exécuté).

// === Totaux TVA (TVA-02/03/04) — calculés serveur, jamais stockés ===
// Forme miroir de VatTotals (vat.ts) pour le boundary DTO. Calculé via computeVatTotals dans les
// services (toProposalDto, getByToken, renderPdf) — jamais confiance au payload front.
export interface VatTotalsDto {
  ht: string;                              // "99.99"
  tva: { rate: number; amount: string }[]; // [{ rate: 20, amount: "20.00" }] — taux en %
  ttc: string;                             // "119.99"
  regime: "FRANCHISE" | "NORMAL" | "INTRACOM";
  legalMention: string | null;
}

// Statut de la proposition (miroir du schéma Prisma, Plan 05-01). Étendu en Phase 5 avec
// SENT (lien public généré, token hashé) et SIGNED (PAdES signé, deal WON). Enum stable à ces
// 3 valeurs (AI-01 Phase 6 lit ces statuts ; ordre fixe DRAFT -> SENT -> SIGNED).
export const ProposalStatus = { DRAFT: "DRAFT", SENT: "SENT", SIGNED: "SIGNED" } as const;
export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];

// === Suivi (tracking) — DELIV-02 ===
// Le serveur n'émet que SENT / OPENED / VIEWED comme ProposalEvent (Plan 05-01/05-02) ; la transition
// SIGNED est portée par Proposal.status (le record Signature n'est pas exposé au boundary web). Le web
// dérive la ligne "Signée" de la timeline depuis le statut SIGNED de la proposition.
export type ProposalEventType = "SENT" | "OPENED" | "VIEWED";

// Event de la timeline dashboard, renvoyé par GET /api/proposals/:id/events (forOrg). `meta` (ip /24 ou
// null, RGPD) n'est PAS surfacé dans l'UI v0. `signerName` est optionnel : non porté par les events
// SENT/OPENED/VIEWED, il n'est présent que si le serveur l'expose un jour (sinon la ligne Signée,
// dérivée du statut, s'affiche sans nom).
export interface ProposalEventDto {
  id: string;
  type: ProposalEventType;
  occurredAt: string; // ISO
  signerName?: string | null;
}

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
  vatRate?: number; // ex. 0.20 pour 20% — optionnel, défaut 0.20 côté serveur
}
export interface QuoteLineDto {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string; // calculé serveur (decimal.js), non stocké
  position: number;
  vatRate: string;   // ex. "0.2000" — Decimal->string au boundary
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
  grandTotal: string;      // calculé serveur (decimal.js), non stocké — gardé pour compat
  vatTotals: VatTotalsDto; // TVA calculée serveur (TVA-02/03/04), jamais depuis le front
  createdAt: string;
  updatedAt: string;
}
