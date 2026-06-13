import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { CrmService } from "@kessel/crm";
import type { DealDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateDealDto } from "./dto/create-deal.dto";
import { GetDealsQueryDto } from "./dto/get-deals-query.dto";
import { UpdateDealDto } from "./dto/update-deal.dto";

// GET/POST/PATCH /api/deals (CRM-02/03) — derrière l'AuthGuard global, préfixe "api/" (Pitfall 1).
// AUCUNE restriction de rôle org (member autorisé). Scoping ORM via CrmService -> forOrg.
@Controller("api/deals")
export class DealsController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes -> token DI requis.
  constructor(@Inject(CrmService) private readonly crm: CrmService) {}

  // CRM-03 : filtre statut CÔTÉ SERVEUR. query.status (validé enum) est passé au service qui
  // ajoute where.status au findMany scopé. Sans param -> tous les deals de l'org.
  @Get()
  async list(
    @Session() session: UserSession<typeof auth>,
    @Query() query: GetDealsQueryDto,
  ): Promise<DealDto[]> {
    return this.crm.listDeals(requireOrg(session), query.status);
  }

  @Get(":id")
  async getOne(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<DealDto | null> {
    return this.crm.getDeal(requireOrg(session), id);
  }

  @Post()
  async create(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: CreateDealDto,
  ): Promise<DealDto> {
    return this.crm.createDeal(requireOrg(session), dto);
  }

  @Patch(":id")
  async update(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: UpdateDealDto,
  ): Promise<DealDto> {
    return this.crm.updateDeal(requireOrg(session), id, dto);
  }
}
