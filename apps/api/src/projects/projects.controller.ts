import { Body, Controller, Get, Inject, NotFoundException, Param, Patch } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { ProjectsService } from "@kessel/projects";
import type { ProjectDto, TaskDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { UpdateProjectStatusDto } from "./dto/update-project-status.dto";

// GET /api/projects, GET /:id, GET /:id/tasks, PATCH /:id (PROJ-04/05) — derrière l'AuthGuard global.
// Scoping via ProjectsService → Kysely reads (orgId WHERE clause) + forOrg writes.
// Task hors SCOPED_MODELS : getProjectTasks + updateTask vérifient l'appartenance org via le parent.
// Plan 02-02 : GET /api/projects + GET /:id/tasks (minimaux, spin-up GREEN).
// Plan 02-03 : ajout GET /:id + PATCH /:id (statut) — contrat complet 4 endpoints.
@Controller("api/projects")
export class ProjectsController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes → token DI requis.
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  async list(@Session() session: UserSession<typeof auth>): Promise<ProjectDto[]> {
    return this.projects.listProjects(requireOrg(session));
  }

  @Get(":id")
  async getOne(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<ProjectDto> {
    const project = await this.projects.getProject(requireOrg(session), id);
    if (!project) throw new NotFoundException("Projet introuvable.");
    return project;
  }

  @Get(":id/tasks")
  async getTasks(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<TaskDto[]> {
    return this.projects.getProjectTasks(requireOrg(session), id);
  }

  @Patch(":id")
  async updateStatus(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: UpdateProjectStatusDto,
  ): Promise<ProjectDto> {
    return this.projects.updateProjectStatus(requireOrg(session), id, dto.status);
  }
}
