// @kessel/shared/contracts/ai — CONTRAT DE GÉNÉRATION IA framework-free (FOUND-05).
//
// SOURCE DE VÉRITÉ UNIQUE (anti-drift) de la forme envoyée par le web pour déclencher une génération.
// TypeScript PUR — AUCUN import de framework de validation, de schéma runtime, du SDK IA ni de l'ORM.
// Le serveur (apps/api) dérive son DTO de validation de ce contrat ; le web ses schémas de validation.
// Le brief est une donnée client CONFIDENTIELLE : il transite ici typé `string`, jamais loggé côté serveur.

// Requête de génération : ce que le web POST à /api/proposals/generate.
// - dealId : le deal auquel rattacher la proposition DRAFT générée.
// - templateId : template optionnel pour amorcer le corps (null/absent = pas de template).
// - brief : le texte brut collé par l'utilisateur (email, notes, transcript).
export interface GenerateProposalRequest {
  dealId: string;
  templateId?: string | null;
  brief: string;
}

// Résumé minimal renvoyé après génération (la Proposal DRAFT complète suit le contrat ProposalDto).
// Exposé ici pour que le web sache si la calibration flywheel a joué (nombre d'exemples gagnés utilisés).
export interface GeneratedProposalSummary {
  proposalId: string;
  calibratedFromWonCount: number;
}
