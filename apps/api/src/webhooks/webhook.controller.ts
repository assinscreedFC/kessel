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
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { ApiKeyGuard } from "../v1/guards/api-key.guard";
import { ApiKeyThrottlerGuard } from "../v1/guards/api-key-throttler.guard";
import { ApiOrg } from "../v1/decorators/api-org.decorator";
import { V1ExceptionFilter } from "../v1/v1-exception.filter";
import { WebhookService } from "./webhook.service";
import { CreateWebhookEndpointDto } from "./dto/create-webhook-endpoint.dto";

// WebhookController — POST/GET/PATCH/DELETE /api/v1/webhooks + GET deliveries + POST replay.
//
// Authentification (Pitfall 1) :
//   @AllowAnonymous : bypass AuthGuard global Better Auth (clé API != session BA).
//   @UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard) : ApiKeyGuard PREMIER → injecte apiOrgId.
//
// T-5-replay-xtenant : replay vérifie que la delivery.endpoint.orgId === apiOrgId (via JOIN).
//   Cross-org → 404 (anti-énumération — le WebhookService lève NotFoundException).
//
// Route ordering : GET "deliveries" AVANT GET ":id" pour éviter le conflit de route.

@Controller("api/v1/webhooks")
@AllowAnonymous()
@UseFilters(V1ExceptionFilter)
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
export class WebhookController {
  constructor(
    @Inject(WebhookService) private readonly svc: WebhookService,
  ) {}

  /** POST /api/v1/webhooks — crée un endpoint avec secret chiffré. 201 + plaintext secret once. */
  @Post()
  @HttpCode(201)
  async create(@ApiOrg() orgId: string, @Body() dto: CreateWebhookEndpointDto) {
    return this.svc.createEndpoint(orgId, dto);
  }

  /** GET /api/v1/webhooks — liste les endpoints (sans secret). */
  @Get()
  async list(@ApiOrg() orgId: string) {
    return this.svc.listEndpoints(orgId);
  }

  /** PATCH /api/v1/webhooks/:id — active/désactive un endpoint. */
  @Patch(":id")
  async toggle(
    @ApiOrg() orgId: string,
    @Param("id") id: string,
    @Body() body: { active: boolean },
  ) {
    await this.svc.setActive(orgId, id, body.active);
  }

  /** DELETE /api/v1/webhooks/:id — supprime un endpoint. Cross-org → 404. */
  @Delete(":id")
  @HttpCode(200)
  async remove(@ApiOrg() orgId: string, @Param("id") id: string) {
    await this.svc.deleteEndpoint(orgId, id);
    return { success: true };
  }

  // IMPORTANT: GET "deliveries" DOIT être déclaré AVANT GET ":id" pour éviter que NestJS
  // capture "deliveries" comme un param :id.

  /** GET /api/v1/webhooks/deliveries — liste les livraisons de l'org. */
  @Get("deliveries")
  async deliveries(@ApiOrg() orgId: string) {
    return this.svc.listDeliveries(orgId);
  }

  /** POST /api/v1/webhooks/deliveries/:id/replay — rejoue une livraison. Cross-org → 404. */
  @Post("deliveries/:id/replay")
  @HttpCode(200)
  async replay(@ApiOrg() orgId: string, @Param("id") id: string) {
    await this.svc.replayDelivery(orgId, id);
    return { success: true };
  }
}
