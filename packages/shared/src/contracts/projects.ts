// @kessel/shared/contracts/projects — CONTRAT PARTAGÉ front/back du module Project (FOUND-05).
//
// SOURCE DE VÉRITÉ UNIQUE (anti-drift) : ProjectStatus + shapes d'input/réponse vivent ICI,
// en TypeScript PUR — AUCUN import de framework (pas de class-validator, pas de zod, pas de @prisma).
// Le serveur (apps/api) dérive ses DTO class-validator de ce contrat ; le web (apps/web) dérive ses
// schémas zod du même contrat. Les deux partent du même type => pas de divergence de champ.
// Ce package (type:shared) est dépendable par api ET web ; un domaine (projects) ne peut pas l'être.

// Enum ProjectStatus stable à 3 valeurs (ordre fixe — transitions ACTIVE→COMPLETED|CANCELLED, sans retour).
export const ProjectStatus = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];
export const PROJECT_STATUS_VALUES = Object.values(ProjectStatus) as ProjectStatus[];

// Shape d'une ligne du budget figé (JSONB snapshot) — immuable après signature.
export interface BudgetSnapshotLine {
  label: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
}

// Budget figé au moment de la signature — snapshot JSONB auto-suffisant.
// total, qty, unitPrice, lineTotal : tous string (decimal.js toFixed(2), Pitfall 5 jamais Decimal brut).
export interface BudgetSnapshot {
  total: string;
  currency: string;
  signedAt: string;
  lines: BudgetSnapshotLine[];
}

// Shape d'un paiement dans le détail projet (PAY-05, dashboard agence).
// Exposé uniquement sur GET /api/projects/:id (détail) — pas sur la liste.
export interface PaymentDto {
  id: string;
  kind: "DEPOSIT" | "BALANCE";
  status: "PENDING" | "PAID" | "FAILED";
  amountCents: number;
  currency: string;
}

// Shape de réponse projet au boundary API.
export interface ProjectDto {
  id: string;
  title: string;
  status: ProjectStatus;
  budgetSnapshot: BudgetSnapshot;
  dealId: string;
  createdAt: string;
  updatedAt: string;
  payments: PaymentDto[]; // PAY-05 : statuts de paiement pour le dashboard agence
}

// Shape de réponse tâche au boundary API.
export interface TaskDto {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
  position: number;
}

// Shapes d'input (boundary d'écriture) — validés côté serveur (class-validator) et web (zod).
export interface UpdateProjectStatusInput {
  status: ProjectStatus;
}

export interface UpdateTaskInput {
  done: boolean;
}
