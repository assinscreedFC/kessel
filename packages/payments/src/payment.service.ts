// PaymentService — domaine paiements Stripe (Phase 3, PAY-01..05).
// Squelette Wave 0 : toutes les méthodes lèvent "not implemented" → RED specs pinned.
// Plans 02 et 03 implémentent createDeposit/createBalance/getPublicPaymentByToken/handleWebhookEvent.
//
// FOUND-05 : ce service importe UNIQUEMENT @kessel/db + @kessel/shared.
// L'orchestration cross-domaine (proposals → payments) est faite dans apps/api (Plan 02).
import { Injectable, Inject } from "@nestjs/common";
import { basePrisma } from "@kessel/db";
import { STRIPE_CLIENT, type StripeLike } from "./stripe.tokens";

export interface CreateDepositArgs {
  orgId: string;
  projectId: string;
  grandTotal: string; // Decimal string — toCents calcule les centimes exacts
  depositPercent: number; // % acompte effectif (proposal.depositPercent ?? org.defaultDepositPercent)
}

export interface CreateDepositResult {
  paymentId: string;
  paymentToken: string;
}

export interface CreateDepositPending {
  depositPending: true;
}

export interface CreateBalanceArgs {
  orgId: string;
  projectId: string;
  balanceCents: number;
}

export interface CreateBalanceResult {
  paymentId: string;
  paymentToken: string;
}

export interface PublicPaymentView {
  clientSecret: string;
  kind: string;
  amountCents: number;
  currency: string;
  orgName: string;
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeLike,
    // basePrisma injected via module-level import (not DI) — same pattern as @kessel/proposals
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly _db: typeof basePrisma = basePrisma,
  ) {}

  /**
   * Crée un PaymentIntent Stripe pour l'acompte et persiste le Payment row.
   * Résistant aux erreurs Stripe : si le PI échoue, la signature reste valide (PAY-01 resilience).
   * Stub Wave 0 — implémenté Plan 02.
   */
  async createDeposit(
    _args: CreateDepositArgs,
  ): Promise<CreateDepositResult | CreateDepositPending> {
    throw new Error("not implemented — PaymentService.createDeposit (Plan 02)");
  }

  /**
   * Crée un PaymentIntent Stripe pour le solde (après acompte PAID) et persiste le Payment row.
   * Stub Wave 0 — implémenté Plan 02.
   */
  async createBalance(_args: CreateBalanceArgs): Promise<CreateBalanceResult> {
    throw new Error("not implemented — PaymentService.createBalance (Plan 02)");
  }

  /**
   * Lookup public par payment token (SHA-256 hash → Payment.paymentTokenHash @unique).
   * Renvoie les données nécessaires à la page de paiement publique (client_secret + meta).
   * Token inconnu → null (anti-énumération, T-3-enum).
   * Stub Wave 0 — implémenté Plan 02.
   */
  async getPublicPaymentByToken(
    _token: string,
  ): Promise<PublicPaymentView | null> {
    throw new Error(
      "not implemented — PaymentService.getPublicPaymentByToken (Plan 02)",
    );
  }

  /**
   * Traite un événement Stripe webhook (déjà vérifié HMAC par le controller).
   * Idempotent : ProcessedStripeEvent.eventId @unique empêche le double-traitement.
   * payment_intent.succeeded → PENDING→PAID + si DEPOSIT, crée BALANCE Payment.
   * payment_intent.payment_failed → PENDING→FAILED.
   * Stub Wave 0 — implémenté Plan 03.
   */
  async handleWebhookEvent(_event: unknown): Promise<void> {
    throw new Error(
      "not implemented — PaymentService.handleWebhookEvent (Plan 03)",
    );
  }
}
