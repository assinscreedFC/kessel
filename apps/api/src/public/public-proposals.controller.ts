import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import {
  DeliveryService,
  SigningCertNotConfiguredError,
  type PublicProposalDto,
  type SignProposalResult,
} from "@kessel/proposals";
import { SignProposalDto } from "./dto/sign-proposal.dto";

// Module PUBLIC token-gated (DELIV-01/02) — surface isolée du dashboard authentifié.
//
// SÉCURITÉ (T-5-authbypass) : chaque route porte @AllowAnonymous() (mécanisme ÉPROUVÉ par
// health.controller.ts) pour s'exclure de l'AuthGuard GLOBAL Better Auth. L'exclusion est limitée
// à CE contrôleur (api/public/proposals) — le reste du dashboard reste protégé.
//
// SÉCURITÉ (T-5-rate / T-5-enum) : @UseGuards(ThrottlerGuard) CIBLÉ sur ce contrôleur public
// (PAS un APP_GUARD global -> les routes authentifiées du dashboard ne sont pas throttlées).
// @Throttle au niveau contrôleur : 20 req/min/IP. Défense en profondeur contre le brute-force de
// tokens (256 bits = déjà inforçable) + anti-DoS (le PDF est coûteux).
//
// SÉCURITÉ (T-5-iso) : la résolution passe TOUJOURS par DeliveryService (basePrisma.findUnique par
// hash, jamais forOrg/findMany). null -> NotFoundException (404 indifférencié, anti-énumération).
// On ne renvoie QUE le DTO public minimal — jamais orgId/dealId bruts. Le token n'est JAMAIS loggé.

// Forme minimale de la requête Express dont on a besoin (IP) — évite d'importer @types/express
// (non résolu en dep directe, cf. décision Phase 3 StreamableFile). On lit l'IP pour la tronquer /24.
interface RequestWithIp {
  ip?: string;
  socket?: { remoteAddress?: string };
}

function clientIp(req: RequestWithIp): string | undefined {
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

@Controller("api/public/proposals")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class PublicProposalsController {
  constructor(@Inject(DeliveryService) private readonly delivery: DeliveryService) {}

  // GET :token/pdf — PDF NON signé public (bouton "Télécharger le PDF", état signable). Résolu STRICT
  // par hash (DeliveryService.renderPdfByToken -> basePrisma.findUnique). null -> 404 (token bidon,
  // pas de leak). Déclaré AVANT @Get(":token") pour que "pdf" ne soit pas capté comme un token.
  @AllowAnonymous()
  @Get(":token/pdf")
  async pdf(@Param("token") token: string): Promise<StreamableFile> {
    const buf = await this.delivery.renderPdfByToken(token);
    if (!buf) {
      throw new NotFoundException();
    }
    return new StreamableFile(buf, {
      type: "application/pdf",
      disposition: 'attachment; filename="proposition.pdf"',
    });
  }

  // GET :token/signed-pdf — re-download PUBLIC du PDF SIGNÉ (client cookie-less). Résolu STRICT par
  // hash + garde status SIGNED (DeliveryService.getSignedPdfByToken). null -> 404 (token bidon OU pas
  // encore signé : 404 indifférencié, anti-énumération). Déclaré AVANT @Get(":token"). Streamé MinIO.
  @AllowAnonymous()
  @Get(":token/signed-pdf")
  async signedPdf(@Param("token") token: string): Promise<StreamableFile> {
    const buf = await this.delivery.getSignedPdfByToken(token);
    if (!buf) {
      throw new NotFoundException();
    }
    return new StreamableFile(buf, {
      type: "application/pdf",
      disposition: 'attachment; filename="proposition-signee.pdf"',
    });
  }

  // POST :token/sign — SIGNATURE en ligne (DELIV-03/04). Throttle STRICT 5/min (sign = Chromium+crypto
  // coûteux, T-5-rate-sign). DTO validé (signerName/email/consent === true). Génère -> signe (PAdES
  // cert réel) -> stocke MinIO -> $transaction (SIGNED + Signature + deal WON), idempotent. Cert
  // absent -> SigningCertNotConfiguredError -> 503 (pas 500/stack). Token invalide -> 404.
  @AllowAnonymous()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(":token/sign")
  @HttpCode(200) // signature = action sur une ressource existante (200), pas une création (201) ;
  // le re-sign idempotent est aussi 200 (no-op propre). Contrat stable pour le client public.
  async sign(
    @Param("token") token: string,
    @Body() dto: SignProposalDto,
    @Req() req: RequestWithIp,
  ): Promise<SignProposalResult> {
    try {
      return await this.delivery.signProposal(
        token,
        { signerName: dto.signerName, signerEmail: dto.signerEmail },
        { ip: clientIp(req) },
      );
    } catch (err: unknown) {
      // Cert manquant -> 503 gracieux (configuration serveur), JAMAIS un 500/stack trace ENOENT.
      if (err instanceof SigningCertNotConfiguredError) {
        throw new ServiceUnavailableException("La signature est temporairement indisponible.");
      }
      throw err;
    }
  }

  // GET :token — rendu lecture seule public (corps + devis + total). Enregistre OPENED au 1er
  // chargement (une seule fois, DeliveryService.recordEvent). 404 si le token ne résout rien.
  @AllowAnonymous()
  @Get(":token")
  async view(
    @Param("token") token: string,
    @Req() req: RequestWithIp,
  ): Promise<PublicProposalDto> {
    const proposal = await this.delivery.getByToken(token);
    if (!proposal) {
      throw new NotFoundException();
    }
    // OPENED idempotent (le service ne crée pas un 2e OPENED). meta = ip tronquée /24 (RGPD).
    await this.delivery.recordEvent(token, "OPENED", { ip: clientIp(req) });
    return proposal;
  }

  // POST :token/view — VIEWED (consultation effective, déclenchée côté client). Peut être multiple.
  // 204 No Content (pas de corps). 404 si le token ne résout rien.
  @AllowAnonymous()
  @Post(":token/view")
  @HttpCode(204)
  async recordView(
    @Param("token") token: string,
    @Req() req: RequestWithIp,
  ): Promise<void> {
    await this.delivery.recordEvent(token, "VIEWED", { ip: clientIp(req) });
  }
}
