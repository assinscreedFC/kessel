import {
  BadRequestException,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { PaymentService, STRIPE_CLIENT, type StripeLike } from "@kessel/payments";

// StripeWebhookController — POST /api/webhooks/stripe
//
// SÉCURITÉ (T-3-sig) : route publique (@AllowAnonymous — bypasse le global Better Auth AuthGuard,
// identique au pattern PublicProposalsController / Pitfall 5 RESEARCH.md). L'authentification de
// la requête est assurée EXCLUSIVEMENT par la vérification HMAC (stripe.webhooks.constructEvent
// sur le raw Buffer) — pas de session, pas de JWT.
//
// SÉCURITÉ (T-3-card) : rawBody (Buffer complet du payload) JAMAIS loggé.
//   stripe-signature header JAMAIS loggé. STRIPE_WEBHOOK_SECRET lu depuis env uniquement.
//
// Comportement guard secret absent : si STRIPE_WEBHOOK_SECRET manque en env → 400 immédiat
//   (pas de crash boot — SC4 Phase 1, secret optionnel dans env.validation.ts).
//
// 400 sans écriture DB : toute signature invalide (mauvais secret, payload altéré, timestamp
//   hors tolérance 5 min Stripe) → BadRequestException → 0 DB writes (T-3-sig).

interface RawBodyRequest {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

@Controller("api/webhooks/stripe")
@AllowAnonymous()
export class StripeWebhookController {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeLike,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(@Req() req: RawBodyRequest): Promise<void> {
    // Guard : STRIPE_WEBHOOK_SECRET doit être configuré en env.
    // Si absent → 400 ("Webhook secret not configured") — jamais de crash boot (SC4).
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException("Webhook secret not configured");
    }

    const sig = req.headers["stripe-signature"];
    const rawBody = req.rawBody;

    // rawBody absent signifie que le middleware verify n'a pas capturé le buffer
    // (ex: requête sans stripe-signature header sur une autre route). Guard défensif.
    if (!rawBody || !sig) {
      throw new BadRequestException("Webhook signature verification failed");
    }

    // T-3-sig : constructEvent vérifie le HMAC-SHA256 sur le raw Buffer + la tolérance temporelle
    // (5 min Stripe). Toute exception (StripeSignatureVerificationError ou autre) → 400, 0 DB writes.
    // T-3-card : rawBody et sig JAMAIS loggés ici.
    let event: ReturnType<StripeLike["webhooks"]["constructEvent"]>;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        typeof sig === "string" ? sig : sig[0],
        secret,
      );
    } catch {
      throw new BadRequestException("Webhook signature verification failed");
    }

    // Délègue le traitement idempotent à PaymentService (T-3-replay, T-3-iso).
    // WEBHOOKS (API-04, FOUND-05) : si PAID, PaymentService retourne le payload à émettre.
    // L'émission EventEmitter2 reste dans la couche apps/api — jamais dans @kessel/payments.
    const result = await this.payments.handleWebhookEvent(event);
    if (result) {
      this.events.emit(result.event, result.payload);
    }
  }
}
