import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { CrmService } from "@kessel/crm";
import { OutcomeService } from "@kessel/proposals";
import type { DealDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateDealDto } from "./dto/create-deal.dto";
import { GetDealsQueryDto } from "./dto/get-deals-query.dto";
import { UpdateDealDto } from "./dto/update-deal.dto";
import type { DealCreatedEvent } from "../webhooks/webhook-events";

// GET/POST/PATCH /api/deals (CRM-02/03) — derrière l'AuthGuard global, préfixe "api/" (Pitfall 1).
// AUCUNE restriction de rôle org (member autorisé). Scoping ORM via CrmService -> forOrg.
//
// ORCHESTRATION FLYWHEEL (AI-01, FOUND-05) : ce controller (couche app) injecte CrmService (@kessel/crm)
// ET OutcomeService (@kessel/proposals). Quand un deal passe à LOST, il enregistre le ProposalOutcome(LOST)
// EN EFFET DE BORD via OutcomeService — exactement comme AiProposalsController orchestre AiProposalService.
// @kessel/crm n'importe JAMAIS @kessel/proposals (domain->domain interdit) : l'orchestration vit ICI.
//
// WEBHOOKS (API-04, FOUND-05) : emission de deal.created ICI (couche orchestration apps/api) après
// createDeal() — JAMAIS depuis @kessel/crm (domain->infrastructure interdit).
@Controller("api/deals")
export class DealsController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes -> token DI requis.
  constructor(
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(OutcomeService) private readonly outcome: OutcomeService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
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
    const orgId = requireOrg(session);
    const deal = await this.crm.createDeal(orgId, dto);
    // WEBHOOKS (API-04, FOUND-05) : émission deal.created depuis la couche orchestration apps/api.
    // @kessel/crm ne connaît pas EventEmitter2 (domain->infrastructure interdit).
    // emitAsync() attend la résolution de tous les handlers async (@OnEvent) avant de retourner,
    // ce qui garantit que la WebhookDelivery est tracée avant la réponse HTTP (comportement attendu
    // par webhook-dispatch.spec.ts test 1 qui vérifie le statut sans sleep après waitForRequest).
    // Timeout implicite via AbortSignal.timeout(10_000) dans deliverOne — le handler ne bloque pas
    // indéfiniment même si l'endpoint cible est lent.
    await this.events.emitAsync("deal.created", {
      dealId: deal.id,
      orgId,
      title: deal.title,
      status: deal.status,
      createdAt: deal.createdAt,
    } satisfies DealCreatedEvent);
    return deal;
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
