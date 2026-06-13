import { Body, Controller, Inject, Param, Patch } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { ProjectsService } from "@kessel/projects";
import type { TaskDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { UpdateTaskDto } from "./dto/update-task.dto";

// PATCH /api/tasks/:id (PROJ-05, T-2-iso tâche, T-2-status-task) — derrière l'AuthGuard global.
// Task hors SCOPED_MODELS (pas d'orgId) → isolation via projet parent (ProjectsService.updateTask).
// Réutilise ProjectsService (même provider DI que ProjectsController — pas de doublon).
@Controller("api/tasks")
export class TasksController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes → token DI requis.
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Patch(":id")
  async update(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskDto> {
    return this.projects.updateTask(requireOrg(session), id, dto.done);
  }
}
