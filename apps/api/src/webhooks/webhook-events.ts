// webhook-events.ts — typed event contracts for outbound webhooks (API-04, T-5-leak).
//
// FOUND-05 : aucun import @nestjs/event-emitter ici. Ce fichier est partageable entre
// apps/api (émetteurs) et le listener (WebhookDispatchListener) sans dépendance EventEmitter2.
//
// Chaque payload ne contient QUE les champs whitelistés de l'org émettrice (T-5-leak) :
// jamais de données cross-tenant, jamais de champs internes (keyHash, secret, etc.).

/** Liste canonique des 4 noms d'événements webhook (utilisée aussi comme validateur DTO). */
export const WEBHOOK_EVENTS = [
  "deal.created",
  "proposal.signed",
  "project.created",
  "payment.received",
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

// ---------------------------------------------------------------------------
// Typed payload interfaces — champs whitelistés, aucune fuite cross-tenant
// ---------------------------------------------------------------------------

/** Payload émis après la création d'un deal (CRM-02). */
export interface DealCreatedEvent {
  dealId: string;
  orgId: string;
  title: string;
  status: string;
  createdAt: string | Date;
}

/** Payload émis après la signature d'une proposition (DELIV-03). */
export interface ProposalSignedEvent {
  proposalId: string;
  orgId: string;
  signedAt: string | Date;
}

/** Payload émis après la création d'un projet (PROJ-01) suite à la signature. */
export interface ProjectCreatedEvent {
  projectId: string;
  orgId: string;
  proposalId: string;
  title?: string;
  createdAt: string | Date;
}

/** Payload émis après qu'un paiement passe à l'état PAID (PAY-01/05). */
export interface PaymentReceivedEvent {
  paymentId: string;
  orgId: string;
  kind: string;
  amountCents: number;
  currency: string;
  projectId?: string;
}
