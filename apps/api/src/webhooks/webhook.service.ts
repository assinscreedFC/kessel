import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { basePrisma } from "@kessel/db";
import { forOrg } from "@kessel/db";
import { encryptWebhookSecret } from "./webhook-crypto";
import { WebhookDispatchListener } from "./webhook-dispatch.listener";
import type { CreateWebhookEndpointDto } from "./dto/create-webhook-endpoint.dto";

// WebhookService — CRUD WebhookEndpoint + list/replay WebhookDelivery (API-03/05).
//
// Sécurité (T-5-webhook-secret) :
//  - createEndpoint : génère un secret aléatoire 32 bytes, le chiffre AES-256-GCM, stocke chiffré.
//    Le secret en clair est retourné UNE SEULE FOIS dans la réponse create.
//  - listEndpoints : ne sélectionne JAMAIS le champ secret (plaintext secret jamais exposé après create).
//
// Pitfall 2 : listDeliveries + replayDelivery → basePrisma avec JOIN endpoint.orgId
//   (WebhookDelivery hors SCOPED_MODELS — pas de forOrg().webhookDelivery).
//
// T-5-replay-xtenant : replayDelivery vérifie que la delivery appartient à l'org via JOIN.
//   Cross-org → 404 (anti-énumération).

type AnyEndpoint = {
  id: string;
  url: string;
  secret: string;
  events: unknown;
  active: boolean;
  orgId: string;
};

@Injectable()
export class WebhookService {
  constructor(
    @Inject(WebhookDispatchListener)
    private readonly dispatcher: WebhookDispatchListener,
  ) {}

  /**
   * Crée un WebhookEndpoint avec un secret AES-256-GCM chiffré.
   * Retourne le plaintext secret UNE SEULE FOIS (T-5-webhook-secret).
   */
  async createEndpoint(
    orgId: string,
    dto: CreateWebhookEndpointDto,
  ): Promise<{ id: string; url: string; events: unknown; active: boolean; secret: string }> {
    const plainSecret = randomBytes(32).toString("hex");
    const encryptedSecret = encryptWebhookSecret(plainSecret);

    const row = await (forOrg(orgId).webhookEndpoint.create as (args: unknown) => Promise<unknown>)({
      data: {
        url: dto.url,
        events: dto.events,
        secret: encryptedSecret,
      },
    });

    return {
      id: (row as Record<string, unknown>)["id"] as string,
      url: (row as Record<string, unknown>)["url"] as string,
      events: (row as Record<string, unknown>)["events"],
      active: (row as Record<string, unknown>)["active"] as boolean,
      secret: plainSecret, // plaintext retourné UNE SEULE FOIS
    };
  }

  /**
   * Liste les endpoints de l'org (sans le champ secret — T-5-webhook-secret).
   */
  async listEndpoints(orgId: string) {
    return forOrg(orgId).webhookEndpoint.findMany({
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      } as never,
    });
  }

  /**
   * Active ou désactive un endpoint.
   */
  async setActive(orgId: string, id: string, active: boolean): Promise<void> {
    await forOrg(orgId).webhookEndpoint.updateMany({
      where: { id },
      data: { active },
    });
  }

  /**
   * Supprime un endpoint. Cross-org ou inexistant → NotFoundException (404, anti-énumération).
   */
  async deleteEndpoint(orgId: string, id: string): Promise<void> {
    const result = await forOrg(orgId).webhookEndpoint.deleteMany({
      where: { id },
    });
    if ((result as unknown as { count: number }).count === 0) {
      throw new NotFoundException();
    }
  }

  /**
   * Liste les livraisons de l'org (via JOIN endpoint.orgId — Pitfall 2).
   * Limite à 50 par défaut (KISS — pas de pagination en v1).
   */
  async listDeliveries(orgId: string, limit = 50) {
    return basePrisma.webhookDelivery.findMany({
      where: { endpoint: { orgId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        webhookEndpointId: true,
        event: true,
        status: true,
        responseCode: true,
        attemptCount: true,
        deliveredAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Re-POST le payload d'une livraison existante vers l'endpoint d'origine.
   * Incrémente attemptCount sur la livraison originale (T-5-replay-xtenant : vérifie orgId).
   * Cross-org ou inexistant → NotFoundException (404).
   */
  async replayDelivery(orgId: string, id: string): Promise<void> {
    // T-5-replay-xtenant : JOIN endpoint pour vérifier l'appartenance à l'org.
    const delivery = await basePrisma.webhookDelivery.findFirst({
      where: { id, endpoint: { orgId } },
      include: { endpoint: true },
    });

    if (!delivery) {
      throw new NotFoundException();
    }

    const endpoint = delivery.endpoint as AnyEndpoint;

    // Incrémenter attemptCount sur la livraison AVANT le re-POST (visible même si crash).
    await basePrisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { attemptCount: { increment: 1 } },
    });

    // Re-POST via le dispatcher (crée une NOUVELLE livraison tracée).
    // Le dispatcher appelle deliverOne qui trace la tentative dans une nouvelle WebhookDelivery row.
    // Note : on re-POST via deliverOne directement (pas de nouvel @OnEvent) — la livraison originale
    // a déjà été incrémentée ci-dessus ; deliverOne crée sa propre trace pour la nouvelle tentative.
    await this.dispatcher.deliverOne(endpoint, delivery.event, delivery.payload as object);
  }
}
