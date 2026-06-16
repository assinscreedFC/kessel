import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { PaymentService } from "@kessel/payments";
import { PaymentTokenResponseDto } from "./dto/payment-token-response.dto";

// PublicPaymentsController — GET /api/public/payments/:token
//
// SÉCURITÉ (T-3-enum) : route publique (@AllowAnonymous — bypasse le global Better Auth AuthGuard,
// identique au pattern PublicProposalsController / Pitfall 5 RESEARCH.md). Token inconnu → 404
// indifférencié (pas de 401/403/500 — anti-énumération T-3-enum). Le token n'est jamais loggé.
//
// SÉCURITÉ (T-5-rate) : @UseGuards(ThrottlerGuard) CIBLÉ sur ce contrôleur public (pas APP_GUARD
// global) + @Throttle 20 req/min — identique au pattern PublicProposalsController.
//
// T-3-card : le client_secret retourné transite uniquement via HTTPS et n'est jamais loggé côté
// serveur (PaymentService.getPublicPaymentByToken n'appelle pas logger.log sur client_secret).

@Controller("api/public/payments")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@AllowAnonymous()
export class PublicPaymentsController {
  constructor(
    @Inject(PaymentService) private readonly payments: PaymentService,
  ) {}

  // GET :token — retourne les données de paiement pour la page publique Payment Element embedded.
  // null depuis le service → 404 indifférencié (anti-énumération T-3-enum : pas de leak).
  // Le token n'est jamais loggé (T-3-card).
  @Get(":token")
  async getPaymentByToken(
    @Param("token") token: string,
  ): Promise<PaymentTokenResponseDto> {
    const view = await this.payments.getPublicPaymentByToken(token);
    if (!view) {
      throw new NotFoundException();
    }
    const dto = new PaymentTokenResponseDto();
    dto.clientSecret = view.clientSecret;
    dto.kind = view.kind;
    dto.amountCents = view.amountCents;
    dto.currency = view.currency;
    dto.orgName = view.orgName;
    return dto;
  }

  // POST :token/sepa-setup — crée un SetupIntent SEPA pour le token de paiement donné.
  //
  // SÉCURITÉ (T-3-enum) : token inconnu → 404 indifférencié (anti-énumération, même pattern GET).
  // SÉCURITÉ (T-8-sepa) : orgId résolu via table Payment (jamais metadata.orgId comme autorité).
  // T-3-card : setupClientSecret jamais loggé.
  @Post(":token/sepa-setup")
  async createSepaSetup(
    @Param("token") token: string,
  ): Promise<{ setupClientSecret: string }> {
    const view = await this.payments.getPublicPaymentByToken(token);
    if (!view) {
      throw new NotFoundException();
    }
    return this.payments.createSepaSetup({
      paymentId: view.paymentId,
      orgId: view.orgId,
    });
  }
}
