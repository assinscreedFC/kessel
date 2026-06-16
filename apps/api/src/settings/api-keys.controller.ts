import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { ApiKeyService } from "../v1/api-key.service";
import { CreateApiKeyDto } from "../v1/dto/create-api-key.dto";
import { requireOrg } from "../shared/require-org";

// ApiKeysController (API-01) — gestion des clés API depuis le dashboard (session Better Auth).
//
// Routes :
//  - POST   /api/settings/api-keys        → générer une nouvelle clé (clé brute retournée ONCE)
//  - GET    /api/settings/api-keys        → lister les clés (sans clé brute ni keyHash)
//  - DELETE /api/settings/api-keys/:id    → révoquer une clé
//
// Auth : session Better Auth (AuthGuard global). PAS @AllowAnonymous.
// Role : aucune restriction de rôle ici — RolesGuard (plan 05-05) wrappe ultérieurement.
// Isolation : scoping via ApiKeyService → forOrg(orgId) : org-A ne peut pas voir/modifier l'org-B.

@Controller("api/settings/api-keys")
export class ApiKeysController {
  constructor(@Inject(ApiKeyService) private readonly apiKeys: ApiKeyService) {}

  @Post()
  @HttpCode(201)
  async create(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: CreateApiKeyDto,
  ): Promise<{ id: string; key: string; prefix: string }> {
    return this.apiKeys.generateKey(requireOrg(session), dto.name);
  }

  @Get()
  async list(
    @Session() session: UserSession<typeof auth>,
  ): Promise<
    Array<{
      id: string;
      name: string;
      prefix: string;
      createdAt: Date;
      revokedAt: Date | null;
    }>
  > {
    return this.apiKeys.listKeys(requireOrg(session));
  }

  @Delete(":id")
  @HttpCode(204)
  async revoke(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<void> {
    await this.apiKeys.revokeKey(requireOrg(session), id);
  }
}
