import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { CrmService } from "@kessel/crm";
import type { ClientOrgDto, ClientOrgOverviewDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateClientOrgDto } from "./dto/create-client-org.dto";
import { CrmOverviewService } from "../crm/crm-overview.service";

// GET/POST /api/client-orgs (CRM-05) — derrière l'AuthGuard global.
//
// Préfixe "api/" (Pitfall 1 Caddy) : Caddy route /api/* vers l'api SANS strip du préfixe.
// Scoping org : CrmService -> forOrg(requireOrg(session)) — l'org active de la session est l'unique source.
// T-6-04 : isolation cross-org garantie par forOrg (SCOPED_MODELS injecte orgId dans tout where).
// GET/POST /api/client-orgs (CRM-05) — derrière l'AuthGuard global.
//
// CRM-07 : GET :id/overview agrège contacts/deals/proposals/projects de la ClientOrg
// via CrmOverviewService (apps/api, FOUND-05). T-6-11 : cross-org → 404.
@Controller("api/client-orgs")
export class ClientOrgsController {
  // @Inject explicite (pas seulement le type du paramètre) : le bundle esbuild et le transform esbuild
  // de vitest n'émettent PAS design:paramtypes — sans @Inject le token DI serait Object -> non résolu.
  constructor(
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(CrmOverviewService) private readonly overview: CrmOverviewService,
  ) {}

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

  // CRM-07 : vue 360 d'une organisation cliente (contactCount/dealCount + listes).
  // T-6-11 : clientOrgId d'une autre org → 404 (double WHERE id+orgId Kysely dans CrmOverviewService).
  @Get(":id/overview")
  async getOverview(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<ClientOrgOverviewDto> {
    return this.overview.getClientOrgOverview(requireOrg(session), id);
  }
}
