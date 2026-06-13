// @kessel/shared/contracts/outcomes — CONTRAT PARTAGÉ de la boucle de données flywheel (AI-01, Phase 6).
//
// SOURCE DE VÉRITÉ UNIQUE (anti-drift), framework-free : AUCUN import de framework (ni schéma de
// validation, ni SDK IA, ni client ORM — TypeScript pur uniquement). Le serveur (apps/api) dérive ses
// DTO de ce contrat ; le web (apps/web) ses types/affichages.
//
// RGPD (T-6-pii) : le snapshot `context` est une WHITELIST STRICTE de features dérivées —
// montant, comptes, longueur — et un éventuel segment NON-identifiant. AUCUNE PII client
// (pas de nom, pas d'email). Le snapshot est figé à la résolution, jamais recalculé.

// Issue d'une proposition résolue (miroir de l'enum Prisma OutcomeKind).
export type OutcomeKind = "WON" | "LOST";

// Snapshot de contexte figé à la résolution (JSONB). Whitelist stricte — pas de PII.
export interface ProposalOutcomeContext {
  amount: string; // total devis snapshot (decimal string exact, ex. "1037.05")
  lineCount: number;
  deliverableCount: number;
  bodyTextLength: number;
  clientType?: string; // segment NON-identifiant — OMIS par défaut (RGPD : pas de PII)
}

// Vue read-only d'une issue, exposée par le dataset forOrg (Plan 06-03).
export interface ProposalOutcomeDto {
  proposalId: string;
  proposalTitle: string;
  outcome: OutcomeKind;
  decidedAt: string; // ISO
  reason: string | null;
  context: ProposalOutcomeContext;
}
