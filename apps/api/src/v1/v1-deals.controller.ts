import { Controller, Get, UseFilters, UseGuards } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { ApiKeyThrottlerGuard } from "./guards/api-key-throttler.guard";
import { ApiOrg } from "./decorators/api-org.decorator";
import { ApiExceptionFilter } from "./filters/api-exception.filter";
import { forOrg } from "@kessel/db";

// V1DealsController (API-02) — GET /api/v1/deals (liste paginée scopée org via clé API).
//
// Authentification : @AllowAnonymous + @UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
//   - @AllowAnonymous : bypass de l'AuthGuard global Better Auth (clé API != session BA).
//   - ApiKeyGuard : vérifie Bearer ksl_live_* → injecte req.apiOrgId + req.apiKeyHash.
//   - ApiKeyThrottlerGuard : rate-limit par keyHash (limite configurée via ThrottlerModule en V1Module).
//
// Enveloppe : { success, data, meta } (patterns.md / API-02).
// Plan 03 enrichira ce controller (POST, pagination complète, proposals, projects, query params).

@AllowAnonymous()
@UseFilters(ApiExceptionFilter)
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Controller("api/v1")
export class V1DealsController {
  @Get("deals")
  async listDeals(
    @ApiOrg() orgId: string,
  ): Promise<{
    success: boolean;
    data: unknown[];
    meta: { total: number; page: number; limit: number };
  }> {
    const page = 1;
    const limit = 20;

    const [deals, total] = await Promise.all([
      forOrg(orgId).deal.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          amount: true,
          createdAt: true,
        },
      }),
      forOrg(orgId).deal.count(),
    ]);

    return {
      success: true,
      data: deals,
      meta: { total, page, limit },
    };
  }
}
