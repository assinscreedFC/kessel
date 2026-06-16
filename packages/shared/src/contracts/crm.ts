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

// === ActivityType (CRM-08) — enum des types d'activités sur un deal ===
export const ActivityType = {
  NOTE: "NOTE",
  CALL: "CALL",
  EMAIL: "EMAIL",
  MEETING: "MEETING",
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];
export const ACTIVITY_TYPE_VALUES = Object.values(ActivityType) as ActivityType[];

// Shapes d'input (boundary d'écriture) — validés côté serveur (class-validator) et web (zod).
export interface ContactInput {
  name: string;
  email: string;
  organizationName?: string | null;
  // CRM-06 : rattachement optionnel à une organisation cliente
  clientOrgId?: string | null;
}

export interface DealInput {
  title: string;
  contactId: string;
  status: DealStatus;
  amount?: number | null;
  // CRM-06 : rattachement direct optionnel à une organisation cliente
  clientOrgId?: string | null;
}

// CRM-04 : déplacer un deal dans le kanban (changement de colonne + position)
export interface MoveDealInput {
  status: DealStatus;
  position: number;
}

// CRM-08 : ajout d'une activité/note sur un deal
export interface DealActivityInput {
  type: ActivityType;
  content: string;
}

// CRM-05 : créer une organisation cliente
export interface ClientOrgInput {
  name: string;
}

// CRM-09 : résultat de l'import CSV de contacts
export interface CsvImportResultDto {
  imported: number;
  skipped: number;
  errors: string[];
}

// Shapes de réponse au boundary API. amount mappé en string (précision Decimal — Pitfall 2),
// dates sérialisées en string ISO (JSON n'a pas de type Date natif).
export interface ContactDto {
  id: string;
  name: string;
  email: string;
  organizationName: string | null;
  // CRM-06
  clientOrgId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealDto {
  id: string;
  title: string;
  contactId: string;
  status: DealStatus;
  amount: string | null;
  // CRM-04 kanban ordering
  position: number;
  // CRM-06
  clientOrgId: string | null;
  createdAt: string;
  updatedAt: string;
}

// CRM-08 : activité/note sur un deal
export interface DealActivityDto {
  id: string;
  dealId: string;
  type: ActivityType;
  content: string;
  createdAt: string;
}

// CRM-05 : organisation cliente
export interface ClientOrgDto {
  id: string;
  name: string;
  createdAt: string;
}

// CRM-07 : DTO overview agrégés pour la vue 360

export interface OverviewDealDto {
  id: string;
  title: string;
  status: DealStatus;
  amount: string | null;
}

export interface OverviewProposalDto {
  id: string;
  title: string;
  status: string;
}

export interface OverviewProjectDto {
  id: string;
  title: string;
  status: string;
}

// CRM-07 : vue 360 d'un contact (deals + propositions + projets agrégés)
export interface ContactOverviewDto {
  contact: ContactDto;
  deals: OverviewDealDto[];
  proposals: OverviewProposalDto[];
  projects: OverviewProjectDto[];
}

// CRM-07 : vue 360 d'une organisation cliente (contacts + deals + propositions + projets agrégés)
export interface ClientOrgOverviewDto {
  clientOrg: ClientOrgDto;
  contactCount: number;
  dealCount: number;
  deals: OverviewDealDto[];
  proposals: OverviewProposalDto[];
  projects: OverviewProjectDto[];
}
