import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { WebhookService } from "../webhooks/webhook.service";
import { CreateWebhookEndpointDto } from "../webhooks/dto/create-webhook-endpoint.dto";
import { requireOrg } from "../shared/require-org";

// SettingsWebhooksController — routes dashboard (session Better Auth) miroir de WebhookController.
//
// Contexte : WebhookController (/api/v1/webhooks) est API-key guarded (partenaires externes).
// Le navigateur dashboard n'a PAS de clé API — il a une session Better Auth (cookie httpOnly).
// Ce controller expose les MÊMES méthodes WebhookService sous une route session-guarded :
//  - POST   /api/settings/webhooks          → créer un endpoint
//  - GET    /api/settings/webhooks          → lister les endpoints
//  - PATCH  /api/settings/webhooks/:id      → activer/désactiver
//  - DELETE /api/settings/webhooks/:id      → supprimer
//  - GET    /api/settings/webhooks/deliveries → lister les livraisons (AVANT /:id)
//  - POST   /api/settings/webhooks/deliveries/:id/replay → rejouer
//
// RolesGuard (plan 05-05, APP_GUARD) applique automatiquement le role viewer (403 sur écriture).
// Pas de @AllowAnonymous — la session est requise (AuthGuard global).

@Controller("api/settings/webhooks")
export class SettingsWebhooksController {
  constructor(@Inject(WebhookService) private readonly svc: WebhookService) {}

  /** POST /api/settings/webhooks — crée un endpoint. Retourne le plaintext secret UNE FOIS. */
  @Post()
  @HttpCode(201)
  async create(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    return this.svc.createEndpoint(requireOrg(session), dto);
  }

  /** GET /api/settings/webhooks — liste les endpoints (sans secret). */
  @Get()
  async list(@Session() session: UserSession<typeof auth>) {
    return this.svc.listEndpoints(requireOrg(session));
  }

  // IMPORTANT: GET "deliveries" DOIT être déclaré AVANT GET ":id" pour éviter que NestJS
  // capture "deliveries" comme un param :id.

  /** GET /api/settings/webhooks/deliveries — liste les livraisons de l'org. */
  @Get("deliveries")
  async deliveries(@Session() session: UserSession<typeof auth>) {
    return this.svc.listDeliveries(requireOrg(session));
  }

  /** PATCH /api/settings/webhooks/:id — active/désactive un endpoint. */
  @Patch(":id")
  async toggle(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() body: { active: boolean },
  ) {
    await this.svc.setActive(requireOrg(session), id, body.active);
  }

  /** DELETE /api/settings/webhooks/:id — supprime. Cross-org → 404. */
  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<void> {
    await this.svc.deleteEndpoint(requireOrg(session), id);
  }

  /** POST /api/settings/webhooks/deliveries/:id/replay — rejoue une livraison. Cross-org → 404. */
  @Post("deliveries/:id/replay")
  @HttpCode(200)
  async replay(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ) {
    await this.svc.replayDelivery(requireOrg(session), id);
    return { success: true };
  }
}
