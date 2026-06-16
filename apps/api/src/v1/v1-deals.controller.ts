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
import { CrmService } from "@kessel/crm";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { ApiKeyThrottlerGuard } from "./guards/api-key-throttler.guard";
import { ApiOrg } from "./decorators/api-org.decorator";
import { V1ExceptionFilter } from "./v1-exception.filter";
import { PaginationDto } from "./dto/pagination.dto";
import { ok, paginated } from "./api-response";
import { CreateDealDto } from "../deals/dto/create-deal.dto";

// V1DealsController (API-02) — GET /api/v1/deals (list + detail) + POST /api/v1/deals.
//
// Authentification :
//   - @AllowAnonymous : bypass AuthGuard global Better Auth (clé API != session BA, Pitfall 1).
//   - @UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard) : ApiKeyGuard PREMIER → injecte apiKeyHash.
//   - @Throttle : 100 req/min par clé (via API_RATE_LIMIT_PER_MIN env, Pitfall 4).
//
// Isolation org (T-5-v1-xtenant) : @ApiOrg() extrait apiOrgId injecté par ApiKeyGuard → toutes
// les requêtes CrmService scoped orgId. getDeal cross-org → null → 404 (T-5-v1-enum).
//
// Pagination (T-5-v1-input) : PaginationDto @Max(100) → limit=500 → 400 ValidationPipe global.
// Slice in-memory sur la liste complète (KISS — datasets petits en self-host v0, Plan 03).
@Controller("api/v1/deals")
@AllowAnonymous()
@UseFilters(V1ExceptionFilter)
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: Number(process.env.API_RATE_LIMIT_PER_MIN ?? 100) } })
export class V1DealsController {
  constructor(@Inject(CrmService) private readonly crm: CrmService) {}

  @Get()
  async list(@ApiOrg() orgId: string, @Query() q: PaginationDto) {
    const all = await this.crm.listDeals(orgId);
    const start = (q.page - 1) * q.limit;
    return paginated(all.slice(start, start + q.limit), all.length, q.page, q.limit);
  }

  @Get(":id")
  async detail(@ApiOrg() orgId: string, @Param("id") id: string) {
    const deal = await this.crm.getDeal(orgId, id);
    if (!deal) throw new NotFoundException();
    return ok(deal);
  }

  @Post()
  async create(@ApiOrg() orgId: string, @Body() dto: CreateDealDto) {
    return ok(await this.crm.createDeal(orgId, dto));
  }
}
