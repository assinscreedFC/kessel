// PaymentService — domaine paiements Stripe (Phase 3, PAY-01..05).
// Wave 3 : handleWebhookEvent + createBalance + getPublicPaymentByToken implémentés (PAY-02..05).
//
// FOUND-05 : ce service importe UNIQUEMENT @kessel/db + @kessel/shared (+ node:crypto).
// L'orchestration cross-domaine (proposals → payments) est faite dans apps/api (Plan 02).
//
// T-3-card : client_secret JAMAIS loggé. STRIPE_SECRET_KEY lu uniquement depuis env (stripe.provider.ts).
// T-3-amount : amountCents calculé server-side via toCents(decimal) — jamais fourni par le client.
// T-3-resilience : Stripe call hors $transaction ; erreur Stripe → depositPending:true, aucun rollback.
// T-3-iso : org résolue UNIQUEMENT via Payment.stripePaymentIntentId (jamais metadata.orgId).
// T-3-replay : ProcessedStripeEvent.eventId @unique + forward-only status.
// T-3-enum : getPublicPaymentByToken → null retourné (anti-énumération, controller → 404).
import { Injectable, Inject, Logger } from "@nestjs/common";
import Decimal from "decimal.js";
import { toCents } from "@kessel/shared";
import { STRIPE_CLIENT, type StripeLike, generatePaymentToken, hashPaymentToken } from "./stripe.tokens";

// Chargement paresseux de basePrisma : @kessel/db/client.ts lit DATABASE_URL au chargement du
// module et lève une erreur si absent. En test, DATABASE_URL est fixé dynamiquement dans
// bootTestApp AVANT le premier appel aux méthodes async — le dynamic import() garantit que le
// module DB n'est chargé qu'à l'exécution, pas à la collecte des specs.
// Note : pas de cache module-level (_basePrisma singleton) pour éviter les problèmes d'isolation
// entre tests dans le même process vitest.
async function getBasePrisma(): Promise<typeof import("@kessel/db").basePrisma> {
  const mod = await import("@kessel/db");
  return mod.basePrisma;
}

async function getDb(): Promise<typeof import("@kessel/db").db> {
  const mod = await import("@kessel/db");
  return mod.db;
}

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
    const depositAmount = new Decimal(grandTotal).mul(depositPercent).div(100).toFixed(2);
    const amountCents = toCents(depositAmount);

    try {
      // Appel réseau Stripe HORS $transaction (PAY-01 resilience / T-3-resilience).
      const pi = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: "eur",
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { projectId, orgId },
      });

      const paymentToken = generatePaymentToken();
      const paymentTokenHash = hashPaymentToken(paymentToken);

      const db = await getBasePrisma();
      const payment = await db.payment.create({
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

      // T-3-card : client_secret JAMAIS loggé ni retourné ici.
      return { paymentId: (payment as unknown as { id: string }).id, paymentToken };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`createDeposit: Stripe error for project ${projectId} — ${message}`);
      return { depositPending: true };
    }
  }

  /**
   * Crée un PaymentIntent Stripe pour le solde (après acompte PAID) et persiste le Payment row.
   *
   * PAY-05 : appelé APRÈS le commit de la $transaction webhook (appel Stripe réseau hors tx —
   * Pitfall 4 RESEARCH.md). Génère un token de paiement public pour la page de paiement du solde.
   * T-3-card : client_secret jamais loggé.
   */
  async createBalance(args: CreateBalanceArgs): Promise<CreateBalanceResult> {
    const { orgId, projectId, balanceCents } = args;

    // Appel Stripe réseau HORS $transaction (Pitfall 4 — race condition DEPOSIT+BALANCE).
    const pi = await this.stripe.paymentIntents.create({
      amount: balanceCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { projectId, orgId },
    });

    const paymentToken = generatePaymentToken();
    const paymentTokenHash = hashPaymentToken(paymentToken);

    const prisma = await getBasePrisma();
    const payment = await prisma.payment.create({
      data: {
        orgId,
        projectId,
        kind: "BALANCE",
        status: "PENDING",
        amountCents: balanceCents,
        currency: "EUR",
        stripePaymentIntentId: pi.id,
        paymentTokenHash,
      } as never,
    });

    return { paymentId: (payment as unknown as { id: string }).id, paymentToken };
  }

  /**
   * Lookup public par payment token (SHA-256 hash → Payment.paymentTokenHash @unique).
   * Renvoie les données nécessaires à la page de paiement publique (client_secret + meta).
   * Token inconnu → null (anti-énumération, T-3-enum — le controller retourne 404 indifférencié).
   *
   * T-3-card : client_secret re-fetchés depuis Stripe (paymentIntents.retrieve) — jamais persisté.
   * T-3-card : client_secret JAMAIS loggé.
   */
  async getPublicPaymentByToken(
    token: string,
  ): Promise<PublicPaymentView | null> {
    const tokenHash = hashPaymentToken(token);

    // Kysely read — lookup O(1) par index unique (T-3-enum : findUnique, pas scan).
    const kysely = await getDb();
    const payment = await kysely
      .selectFrom("Payment")
      .where("paymentTokenHash", "=", tokenHash)
      .selectAll()
      .executeTakeFirst();

    if (!payment) return null;

    // Re-fetch client_secret depuis Stripe (T-3-card : jamais persisté en DB).
    const pi = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    if (!pi.client_secret) return null;

    // Lookup org name pour affichage sur la page de paiement publique.
    const orgRow = await kysely
      .selectFrom("organization")
      .where("id", "=", payment.orgId)
      .select("name")
      .executeTakeFirst();

    const orgName = orgRow?.name ?? "";

    // T-3-card : client_secret JAMAIS loggé (pas de this.logger.debug/log ici).
    return {
      clientSecret: pi.client_secret,
      kind: payment.kind,
      amountCents: payment.amountCents,
      currency: payment.currency,
      orgName,
    };
  }

  /**
   * Traite un événement Stripe webhook (déjà vérifié HMAC par le controller).
   *
   * Idempotence (T-3-replay) : ProcessedStripeEvent.eventId @unique — rejouer le même event.id = no-op.
   * Résolution org (T-3-iso) : UNIQUEMENT via Payment.stripePaymentIntentId — JAMAIS metadata.orgId.
   * Forward-only (T-3-replay) : si status déjà PAID|FAILED → aucune écriture.
   * Événements traités : payment_intent.succeeded → PAID ; payment_intent.payment_failed → FAILED.
   * PAY-05 : si DEPOSIT → PAID, crée le BALANCE PaymentIntent APRÈS le commit de la $transaction.
   */
  async handleWebhookEvent(event: unknown): Promise<void> {
    const ev = event as { id: string; type: string; data: { object: unknown } };

    // Idempotence : si cet eventId a déjà été traité → no-op (T-3-replay).
    const prisma = await getBasePrisma();
    const existing = await prisma.processedStripeEvent.findUnique({
      where: { eventId: ev.id },
    });
    if (existing) return;

    // Ne traiter que les deux types connus.
    if (
      ev.type !== "payment_intent.succeeded" &&
      ev.type !== "payment_intent.payment_failed"
    ) {
      return;
    }

    const pi = ev.data.object as { id: string; metadata?: Record<string, string> };

    // T-3-iso : résolution org UNIQUEMENT via table Payment (JAMAIS metadata.orgId).
    const kysely = await getDb();
    const payment = await kysely
      .selectFrom("Payment")
      .where("stripePaymentIntentId", "=", pi.id)
      .selectAll()
      .executeTakeFirst();

    // PI inconnu de Kessel (pas dans notre DB) → ignorer silencieusement.
    if (!payment) return;

    // Forward-only : si déjà dans un état terminal, pas de régression (T-3-replay).
    if (payment.status === "PAID" || payment.status === "FAILED") return;

    const newStatus = ev.type === "payment_intent.succeeded" ? "PAID" : "FAILED";

    // Write dans $transaction : payment.update + processedStripeEvent.create (atomique).
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: newStatus },
      });
      await tx.processedStripeEvent.create({
        data: { eventId: ev.id, type: ev.type },
      });
    });

    // PAY-05 : si DEPOSIT PAID → créer le BALANCE PaymentIntent APRÈS commit de la $transaction.
    // Appel Stripe réseau hors $transaction (Pitfall 4 RESEARCH.md — évite verrous + race condition).
    if (newStatus === "PAID" && payment.kind === "DEPOSIT") {
      try {
        // Lire le budgetSnapshot du projet pour calculer le solde.
        const project = await kysely
          .selectFrom("Project")
          .where("id", "=", payment.projectId)
          .select("budgetSnapshot")
          .executeTakeFirst();

        // BudgetSnapshot.total est une string EUR (decimal toFixed(2)) — convertir en centimes (T-3-amount).
        const snapshot = project?.budgetSnapshot as { total?: string } | null | undefined;
        const totalCents = snapshot?.total ? toCents(snapshot.total) : 0;
        const balanceCents = totalCents - payment.amountCents;

        if (balanceCents > 0) {
          await this.createBalance({
            orgId: payment.orgId,
            projectId: payment.projectId,
            balanceCents,
          });
        }
      } catch (err: unknown) {
        // Résilience : échec Stripe sur createBalance ne doit pas invalider le PAID du DEPOSIT.
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`handleWebhookEvent: createBalance failed for project ${payment.projectId} — ${message}`);
      }
    }
  }
}
