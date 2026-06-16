import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { createHmac } from "node:crypto";
import { basePrisma, db } from "@kessel/db";
import { decryptWebhookSecret } from "./webhook-crypto";
import type {
  DealCreatedEvent,
  ProposalSignedEvent,
  ProjectCreatedEvent,
  PaymentReceivedEvent,
} from "./webhook-events";

// WebhookDispatchListener — consomme les 4 événements métier via @OnEvent et POST vers les
// WebhookEndpoint actifs souscrits (API-04/05).
//
// Sécurité (T-5-leak) : dispatch scopé par payload.orgId → seuls les endpoints de l'org émettrice
// reçoivent la livraison. Isolation croisée org-B/org-A vérifiée dans webhook-dispatch.spec.ts.
//
// Sécurité (T-5-webhook-secret) : secret déchiffré AES-256-GCM UNIQUEMENT dans deliverOne,
// immédiatement avant la signature HMAC. Jamais loggé, jamais retourné.
//
// Sécurité (T-5-spoof) : HMAC-SHA256 du body JSON → X-Kessel-Signature: sha256=<hmac>.
//
// Sécurité (T-5-dos-slow) : AbortSignal.timeout(10_000) — 10s timeout par requête.
//
// Pitfall 2 : WebhookDelivery hors SCOPED_MODELS → basePrisma direct (jamais forOrg().webhookDelivery).
//
// FOUND-05 : ce listener est dans apps/api — les packages domain ne connaissent pas ce module.

type AnyEndpoint = {
  id: string;
  url: string;
  secret: string;
  events: unknown;
  active: boolean;
  orgId: string;
};

@Injectable()
export class WebhookDispatchListener {
  // --- @OnEvent handlers (un par event, tous async) ---

  @OnEvent("deal.created")
  async handleDealCreated(payload: DealCreatedEvent): Promise<void> {
    await this.dispatch("deal.created", payload.orgId, payload);
  }

  @OnEvent("proposal.signed")
  async handleProposalSigned(payload: ProposalSignedEvent): Promise<void> {
    await this.dispatch("proposal.signed", payload.orgId, payload);
  }

  @OnEvent("project.created")
  async handleProjectCreated(payload: ProjectCreatedEvent): Promise<void> {
    await this.dispatch("project.created", payload.orgId, payload);
  }

  @OnEvent("payment.received")
  async handlePaymentReceived(payload: PaymentReceivedEvent): Promise<void> {
    await this.dispatch("payment.received", payload.orgId, payload);
  }

  // --- Core dispatch logic ---

  /**
   * Récupère les endpoints actifs souscrits à cet event pour l'org,
   * puis livre séquentiellement (for…of awaited).
   * Fire-and-forget relatif à la requête HTTP source (le handler @OnEvent est async
   * mais EventEmitter2 n'attend pas la résolution quand emit() est synchrone —
   * la résolution est découplée du cycle requête).
   */
  private async dispatch(
    event: string,
    orgId: string,
    payload: unknown,
  ): Promise<void> {
    // Kysely read + JS filter (events est un tableau JSON stocké comme JsonB).
    const endpoints = await db
      .selectFrom("WebhookEndpoint")
      .where("orgId", "=", orgId)
      .where("active", "=", true)
      .selectAll()
      .execute();

    const subscribed = (endpoints as AnyEndpoint[]).filter((e) =>
      (e.events as string[]).includes(event),
    );

    for (const endpoint of subscribed) {
      await this.deliverOne(endpoint, event, payload);
    }
  }

  /**
   * Crée une WebhookDelivery PENDING, POST le payload signé, puis met à jour le statut.
   * Exposé comme méthode publique pour que WebhookService.replayDelivery puisse l'appeler
   * avec l'endpoint et le payload stockés dans la livraison originale.
   */
  async deliverOne(
    endpoint: AnyEndpoint,
    event: string,
    payload: unknown,
  ): Promise<void> {
    // Créer la livraison PENDING AVANT le POST (Pitfall anti-pattern : jamais après).
    // Pitfall 2 : basePrisma direct — WebhookDelivery hors SCOPED_MODELS.
    const delivery = await basePrisma.webhookDelivery.create({
      data: {
        webhookEndpointId: endpoint.id,
        event,
        payload: payload as object,
        status: "PENDING",
        attemptCount: 0,
      },
    });

    const body = JSON.stringify(payload);
    const ts = Date.now().toString();

    // T-5-webhook-secret : déchiffrement AES-256-GCM uniquement ici, pour la signature.
    const secret = decryptWebhookSecret(endpoint.secret);
    const hmac = createHmac("sha256", secret).update(body).digest("hex");

    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Kessel-Event": event,
          "X-Kessel-Timestamp": ts,
          // T-5-spoof : signature Stripe-like (sha256=<hmac>)
          "X-Kessel-Signature": `sha256=${hmac}`,
        },
        body,
        // T-5-dos-slow : 10s timeout — le listener ne bloque pas la requête source.
        signal: AbortSignal.timeout(10_000),
      });

      await basePrisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: res.ok ? "DELIVERED" : "FAILED",
          responseCode: res.status,
          attemptCount: 1,
          deliveredAt: res.ok ? new Date() : null,
        },
      });
    } catch {
      // Timeout ou erreur réseau → FAILED (T-5-dos-slow).
      await basePrisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          attemptCount: 1,
        },
      });
    }
  }
}
