import { Injectable } from "@nestjs/common";
import type { ProjectDto, TaskDto, ProjectStatus } from "@kessel/shared";

// ProjectsService — squelette domaine Project (@kessel/projects, type:domain scope:projects).
//
// FRONTIÈRES (FOUND-05) : ce service consommera @kessel/db via forOrg(orgId) UNIQUEMENT — jamais
// le client Prisma brut non scopé. Le contrat de DTO vient de @kessel/shared. Aucun import d'un
// autre domaine. L'orgId reçu = session.activeOrganizationId (source canonique Better Auth).
//
// Implémentation complète livrée Plan 03 (backend NestJS endpoints + $transaction spin-up).
// Corps : throw new Error("Not implemented — Plan 03") pour signaler clairement le placeholder.

@Injectable()
export class ProjectsService {
  async listProjects(orgId: string): Promise<ProjectDto[]> {
    void orgId;
    throw new Error("Not implemented — Plan 03");
  }

  async getProject(orgId: string, id: string): Promise<ProjectDto | null> {
    void orgId;
    void id;
    throw new Error("Not implemented — Plan 03");
  }

  async getProjectTasks(orgId: string, projectId: string): Promise<TaskDto[]> {
    void orgId;
    void projectId;
    throw new Error("Not implemented — Plan 03");
  }

  async updateProjectStatus(orgId: string, id: string, status: ProjectStatus): Promise<ProjectDto> {
    void orgId;
    void id;
    void status;
    throw new Error("Not implemented — Plan 03");
  }

  async updateTask(orgId: string, taskId: string, done: boolean): Promise<TaskDto> {
    void orgId;
    void taskId;
    void done;
    throw new Error("Not implemented — Plan 03");
  }
}
