// PaymentService — domaine paiements Stripe (Phase 3, PAY-01..05).
// Wave 2 : createDeposit implémenté (PAY-01). createBalance/getPublicPaymentByToken/handleWebhookEvent
// restent stub → Plans 02 (balance/public) et 03 (webhook).
//
// FOUND-05 : ce service importe UNIQUEMENT @kessel/db + @kessel/shared (+ node:crypto).
// L'orchestration cross-domaine (proposals → payments) est faite dans apps/api (Plan 02).
//
// T-3-card : client_secret JAMAIS loggé. STRIPE_SECRET_KEY lu uniquement depuis env (stripe.provider.ts).
// T-3-amount : amountCents calculé server-side via toCents(decimal) — jamais fourni par le client.
// T-3-resilience : Stripe call hors $transaction ; erreur Stripe → depositPending:true, aucun rollback.
import { Injectable, Inject, Logger } from "@nestjs/common";
import Decimal from "decimal.js";
import { basePrisma } from "@kessel/db";
import { toCents } from "@kessel/shared";
import { STRIPE_CLIENT, type StripeLike, generatePaymentToken, hashPaymentToken } from "./stripe.tokens";

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
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeLike,
    // basePrisma injected via module-level import (not DI) — same pattern as @kessel/proposals
  ) {}

  /**
   * Crée un PaymentIntent Stripe pour l'acompte et persiste le Payment row.
   *
   * Flux (PAY-01) :
   *   1. Calcule amountCents = toCents(grandTotal × depositPercent / 100) — server-side exact (T-3-amount).
   *   2. Crée le PaymentIntent Stripe (appel réseau HORS $transaction — T-3-resilience).
   *   3. Persiste Payment(kind=DEPOSIT, status=PENDING, orgId, projectId, stripePaymentIntentId,
   *      amountCents, currency='EUR', paymentTokenHash).
   *   4. Retourne { paymentId, paymentToken } — le token clair n'est exposé qu'ici une seule fois.
   *
   * Résilience : si Stripe échoue, log sanitisé + retourne { depositPending: true } sans Payment row.
   * La signature/projet restent valides — aucun rollback (T-3-resilience).
   */
  async createDeposit(
    args: CreateDepositArgs,
  ): Promise<CreateDepositResult | CreateDepositPending> {
    const { orgId, projectId, grandTotal, depositPercent } = args;

    // T-3-amount : calcul exact en centimes via decimal.js (jamais float).
    const amountCents = toCents(new Decimal(grandTotal).mul(depositPercent).div(100));

    try {
      // Appel réseau Stripe HORS $transaction (PAY-01 resilience / T-3-resilience).
      // allow_redirects:'never' = embedded Payment Element uniquement (pas de redirect Checkout).
      const pi = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: "eur",
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { projectId, orgId },
      });

      // Générer le payment token (256 bits, base64url) — seul le hash est persisté (T-3-card pattern).
      const paymentToken = generatePaymentToken();
      const paymentTokenHash = hashPaymentToken(paymentToken);

      // Persister le Payment row (hors $transaction — la signature a déjà committé).
      const payment = await basePrisma.payment.create({
        data: {
          orgId,
          projectId,
          kind: "DEPOSIT",
          status: "PENDING",
          amountCents,
          currency: "EUR",
          stripePaymentIntentId: pi.id,
          paymentTokenHash,
        } as never,
      });

      // T-3-card : client_secret JAMAIS loggé ni retourné ici (exposé uniquement à la page paiement public).
      return { paymentId: (payment as unknown as { id: string }).id, paymentToken };
    } catch (err: unknown) {
      // Résilience T-3-resilience : toute erreur Stripe (réseau, auth, validation) est absorbée.
      // Log sanitisé : message d'erreur uniquement, JAMAIS de client_secret, JAMAIS de clé API.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`createDeposit: Stripe error for project ${projectId} — ${message}`);
      return { depositPending: true };
    }
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
