import type { OutcomeKind, ProposalOutcomeDto } from "@kessel/shared";

// Modèle de l'entité Outcome côté web (couche `entities`).
//
// Le TYPE vient du contrat partagé @kessel/shared (source de vérité unique — anti-drift front/back,
// FOUND-05 : le web ne dépend QUE de @kessel/shared). `Outcome` est un alias de `ProposalOutcomeDto`
// (issue read-only d'une proposition résolue : amount string snapshot, decidedAt ISO, reason | null,
// context whitelist non-PII). Aucune logique métier ici : le dataset est consommé tel quel (le flywheel
// s'alimente seul côté serveur — Plan 06-02 — il n'y a JAMAIS de saisie/mutation d'outcome côté web).
export type Outcome = ProposalOutcomeDto;
export type { OutcomeKind };
