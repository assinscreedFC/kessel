import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { PortalAuthService } from "./portal-auth.service";
import { ClientPortalGuard, type PortalContact } from "./guards/client-portal.guard";
import { buildPortalCookie } from "./portal-cookie";
import { ExchangeTokenDto } from "./dto/exchange-token.dto";

// Forme minimale de la réponse — évite d'importer @types/express (non résolu en dep directe,
// pattern identique à RequestWithIp dans public-proposals.controller.ts).
interface MinimalResponse {
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

// POST /portal/auth/exchange — échange le magic link token contre un JWT cookie httpOnly.
// @AllowAnonymous : exclut de l'AuthGuard global Better Auth (pattern éprouvé, health.controller.ts).
// @UseGuards(ThrottlerGuard) + @Throttle ciblé : anti-brute-force (T-4-enum / T-5-rate).
// 401 uniforme si le token est invalide/expiré/utilisé (corps vide, anti-énumération T-4-enum).
@Controller("portal/auth")
@AllowAnonymous()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PortalAuthController {
  constructor(@Inject(PortalAuthService) private readonly portalAuth: PortalAuthService) {}

  @Post("exchange")
  @HttpCode(200)
  async exchange(
    @Body() dto: ExchangeTokenDto,
    @Res({ passthrough: false }) res: MinimalResponse,
  ): Promise<void> {
    const jwt = await this.portalAuth.exchangeToken(dto.token);
    if (!jwt) {
      throw new UnauthorizedException();
    }
    // Set-Cookie httpOnly (T-4-cookie-xss / T-4-csrf) + réponse JSON minimale.
    res.setHeader("Set-Cookie", buildPortalCookie(jwt));
    res.json({ ok: true });
  }
}

// GET /portal/me — retourne {contactId, orgId} du JWT portail.
// @AllowAnonymous : contourne l'AuthGuard global Better Auth (portal JWT ≠ Better Auth session).
// @UseGuards(ClientPortalGuard) : assure la vérification du JWT portail httpOnly (T-4-iso).
@Controller("portal")
@AllowAnonymous()
@UseGuards(ClientPortalGuard)
export class PortalMeController {
  @Get("me")
  me(@Req() req: { portalContact: PortalContact }): PortalContact {
    return req.portalContact;
  }
}
