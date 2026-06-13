import type { ProposalDto, QuoteLineDto } from "@kessel/shared";

// Modèle de l'entité Proposal côté web (couche `entities`).
//
// Le TYPE vient du contrat partagé @kessel/shared (source de vérité unique — anti-drift front/back).
// `Proposal` est un alias de `ProposalDto` ; `QuoteLine` de `QuoteLineDto`. Montants en string (Decimal
// au boundary, Pitfall 2) — affichés via Intl, jamais recalculés en float pour faire autorité.
// bodyJson = document ProseMirror (unknown) ; il est initialisé UNE fois dans l'éditeur Tiptap.

export type Proposal = ProposalDto;
export type QuoteLine = QuoteLineDto;
