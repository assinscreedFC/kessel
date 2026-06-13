import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { CrmService } from "@kessel/crm";
import { OutcomeService } from "@kessel/proposals";
import type { DealDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateDealDto } from "./dto/create-deal.dto";
import { GetDealsQueryDto } from "./dto/get-deals-query.dto";
import { UpdateDealDto } from "./dto/update-deal.dto";

// GET/POST/PATCH /api/deals (CRM-02/03) — derrière l'AuthGuard global, préfixe "api/" (Pitfall 1).
// AUCUNE restriction de rôle org (member autorisé). Scoping ORM via CrmService -> forOrg.
//
// ORCHESTRATION FLYWHEEL (AI-01, FOUND-05) : ce controller (couche app) injecte CrmService (@kessel/crm)
// ET OutcomeService (@kessel/proposals). Quand un deal passe à LOST, il enregistre le ProposalOutcome(LOST)
// EN EFFET DE BORD via OutcomeService — exactement comme AiProposalsController orchestre AiProposalService.
// @kessel/crm n'importe JAMAIS @kessel/proposals (domain->domain interdit) : l'orchestration vit ICI.
@Controller("api/deals")
export class DealsController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes -> token DI requis.
  constructor(
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(OutcomeService) private readonly outcome: OutcomeService,
  ) {}

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
    const orgId = requireOrg(session);
    const deal = await this.crm.updateDeal(orgId, id, dto);
    // EFFET DE BORD flywheel (AI-01) : la transition vers LOST enregistre un ProposalOutcome(LOST)
    // pour la proposition SENT/DRAFT du deal. GRACIEUX (pas de proposition -> no-op) + IDEMPOTENT.
    // Orchestré APRÈS updateDeal (le deal est déjà LOST) ; @kessel/crm n'a aucune dépendance proposals.
    if (dto.status === "LOST") {
      await this.outcome.recordLostForDeal(orgId, id, dto.reason);
    }
    return deal;
  }
}
