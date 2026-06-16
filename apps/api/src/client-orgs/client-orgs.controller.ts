import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { CrmService } from "@kessel/crm";
import type { ClientOrgDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateClientOrgDto } from "./dto/create-client-org.dto";

// GET/POST /api/client-orgs (CRM-05) — derrière l'AuthGuard global.
//
// Préfixe "api/" (Pitfall 1 Caddy) : Caddy route /api/* vers l'api SANS strip du préfixe.
// Scoping org : CrmService -> forOrg(requireOrg(session)) — l'org active de la session est l'unique source.
// T-6-04 : isolation cross-org garantie par forOrg (SCOPED_MODELS injecte orgId dans tout where).
@Controller("api/client-orgs")
export class ClientOrgsController {
  // @Inject explicite (pas seulement le type du paramètre) : le bundle esbuild et le transform esbuild
  // de vitest n'émettent PAS design:paramtypes — sans @Inject le token DI serait Object -> non résolu.
  constructor(@Inject(CrmService) private readonly crm: CrmService) {}

  @Post()
  async create(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: CreateClientOrgDto,
  ): Promise<ClientOrgDto> {
    return this.crm.createClientOrg(requireOrg(session), dto);
  }

  @Get()
  async list(@Session() session: UserSession<typeof auth>): Promise<ClientOrgDto[]> {
    return this.crm.listClientOrgs(requireOrg(session));
  }

  @Get(":id")
  async getOne(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<ClientOrgDto> {
    const result = await this.crm.getClientOrg(requireOrg(session), id);
    if (!result) throw new NotFoundException("ClientOrg introuvable.");
    return result;
  }
}
