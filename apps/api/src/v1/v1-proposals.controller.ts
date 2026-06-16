import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { UseFilters, UseGuards } from "@nestjs/common";
import { ProposalsService } from "@kessel/proposals";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { ApiKeyThrottlerGuard } from "./guards/api-key-throttler.guard";
import { ApiOrg } from "./decorators/api-org.decorator";
import { V1ExceptionFilter } from "./v1-exception.filter";
import { PaginationDto } from "./dto/pagination.dto";
import { ok, paginated } from "./api-response";
import { CreateProposalDto } from "../proposals/dto/create-proposal.dto";

// V1ProposalsController (API-02) — GET /api/v1/proposals (list + detail) + POST /api/v1/proposals.
//
// Même pattern que V1DealsController : @AllowAnonymous + ApiKeyGuard PREMIER + @Throttle par clé.
// Isolation org via @ApiOrg() → ProposalsService.listProposals/getProposal/createProposal(orgId, ...).
// getProposal cross-org → null → 404 (T-5-v1-xtenant / T-5-v1-enum).
@Controller("api/v1/proposals")
@AllowAnonymous()
@UseFilters(V1ExceptionFilter)
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: Number(process.env.API_RATE_LIMIT_PER_MIN ?? 100) } })
export class V1ProposalsController {
  constructor(@Inject(ProposalsService) private readonly proposals: ProposalsService) {}

  @Get()
  async list(@ApiOrg() orgId: string, @Query() q: PaginationDto) {
    const all = await this.proposals.listProposals(orgId);
    const start = (q.page - 1) * q.limit;
    return paginated(all.slice(start, start + q.limit), all.length, q.page, q.limit);
  }

  @Get(":id")
  async detail(@ApiOrg() orgId: string, @Param("id") id: string) {
    const proposal = await this.proposals.getProposal(orgId, id);
    if (!proposal) throw new NotFoundException();
    return ok(proposal);
  }

  @Post()
  async create(@ApiOrg() orgId: string, @Body() dto: CreateProposalDto) {
    return ok(await this.proposals.createProposal(orgId, dto));
  }
}
