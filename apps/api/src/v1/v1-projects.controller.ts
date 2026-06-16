import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { UseFilters, UseGuards } from "@nestjs/common";
import { ProjectsService } from "@kessel/projects";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { ApiKeyThrottlerGuard } from "./guards/api-key-throttler.guard";
import { ApiOrg } from "./decorators/api-org.decorator";
import { V1ExceptionFilter } from "./v1-exception.filter";
import { PaginationDto } from "./dto/pagination.dto";
import { ok, paginated } from "./api-response";

// V1ProjectsController (API-02) — GET /api/v1/projects (list + detail). NO POST.
//
// Les projets sont créés par la signature d'une proposition (PROJ-01) — pas directement via l'API v1
// (per 05-CONTEXT.md surface). Lecture seule pour les partenaires.
//
// Même pattern que V1DealsController : @AllowAnonymous + ApiKeyGuard PREMIER + @Throttle par clé.
// Isolation org via @ApiOrg() → ProjectsService.listProjects/getProject(orgId, ...).
// getProject cross-org → null → 404 (T-5-v1-xtenant / T-5-v1-enum).
@Controller("api/v1/projects")
@AllowAnonymous()
@UseFilters(V1ExceptionFilter)
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: Number(process.env.API_RATE_LIMIT_PER_MIN ?? 100) } })
export class V1ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  async list(@ApiOrg() orgId: string, @Query() q: PaginationDto) {
    const all = await this.projects.listProjects(orgId);
    const start = (q.page - 1) * q.limit;
    return paginated(all.slice(start, start + q.limit), all.length, q.page, q.limit);
  }

  @Get(":id")
  async detail(@ApiOrg() orgId: string, @Param("id") id: string) {
    const project = await this.projects.getProject(orgId, id);
    if (!project) throw new NotFoundException();
    return ok(project);
  }
}
