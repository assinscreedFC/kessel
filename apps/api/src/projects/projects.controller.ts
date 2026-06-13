import { Controller, Get, Inject, Param } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { ProjectsService } from "@kessel/projects";
import type { ProjectDto, TaskDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";

// GET /api/projects + GET /api/projects/:id/tasks (PROJ-04) — derrière l'AuthGuard global.
// Scoping via ProjectsService → forOrg(orgId) (Project dans SCOPED_MODELS).
// Task hors SCOPED_MODELS : getProjectTasks vérifie l'appartenance org via le projet parent.
// Plan 02-02 : endpoints minimaux pour project-spin-up.spec.ts GREEN.
// Plan 03 : ajoutera GET /:id + PATCH /:id (statut) + PATCH /tasks/:taskId (done).
@Controller("api/projects")
export class ProjectsController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes → token DI requis.
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  async list(@Session() session: UserSession<typeof auth>): Promise<ProjectDto[]> {
    return this.projects.listProjects(requireOrg(session));
  }

  @Get(":id/tasks")
  async getTasks(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<TaskDto[]> {
    return this.projects.getProjectTasks(requireOrg(session), id);
  }
}
