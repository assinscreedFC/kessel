// @kessel/shared/contracts/crm — CONTRAT PARTAGÉ front/back du CRM (FOUND-05).
//
// SOURCE DE VÉRITÉ UNIQUE (anti-drift) : DealStatus + les shapes d'input/réponse vivent ICI,
// en TypeScript PUR — AUCUN import de framework (pas de class-validator, pas de zod, pas de @prisma).
// Le serveur (apps/api) dérive ses DTO class-validator de ce contrat ; le web (apps/web) dérive ses
// schémas zod du même contrat. Les deux partent du même type => pas de divergence de champ.
// Ce package (type:shared) est dépendable par api ET web ; un domaine (crm) ne peut pas l'être.

// Enum DealStatus stable à 4 valeurs (ordre fixe — phases 5/6 en dépendent).
export const DealStatus = {
  LEAD: "LEAD",
  PROPOSAL_SENT: "PROPOSAL_SENT",
  WON: "WON",
  LOST: "LOST",
} as const;
export type DealStatus = (typeof DealStatus)[keyof typeof DealStatus];
export const DEAL_STATUS_VALUES = Object.values(DealStatus) as DealStatus[];

// Shapes d'input (boundary d'écriture) — validés côté serveur (class-validator) et web (zod).
export interface ContactInput {
  name: string;
  email: string;
  organizationName?: string | null;
}

export interface DealInput {
  title: string;
  contactId: string;
  status: DealStatus;
  amount?: number | null;
}

// Shapes de réponse au boundary API. amount mappé en string (précision Decimal — Pitfall 2),
// dates sérialisées en string ISO (JSON n'a pas de type Date natif).
export interface ContactDto {
  id: string;
  name: string;
  email: string;
  organizationName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealDto {
  id: string;
  title: string;
  contactId: string;
  status: DealStatus;
  amount: string | null;
  createdAt: string;
  updatedAt: string;
}
