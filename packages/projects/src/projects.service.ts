import { Injectable, NotFoundException } from "@nestjs/common";
import { basePrisma, forOrg } from "@kessel/db";
import type { ProjectDto, TaskDto, ProjectStatus } from "@kessel/shared";

// ProjectsService — domaine Project (@kessel/projects, type:domain scope:projects).
//
// FRONTIÈRES (FOUND-05) : consomme @kessel/db via forOrg(orgId) UNIQUEMENT — jamais le client
// Prisma brut non scopé pour les endpoints scopés org. Le contrat DTO vient de @kessel/shared.
// Aucun import d'un autre domaine (@kessel/proposals, @kessel/crm etc.).
// L'orgId reçu = session.activeOrganizationId (source canonique Better Auth).
//
// SCOPING :
//  - Project : dans SCOPED_MODELS (orgId direct) → forOrg(orgId).project.findMany/findUnique.
//  - Task : HORS SCOPED_MODELS (pas de colonne orgId) → scopée via Project parent.
//    Pour getTasks : on vérifie d'abord que le Project appartient à l'org via forOrg,
//    puis on charge les Task via basePrisma.task.findMany({ where: { projectId } }).

@Injectable()
export class ProjectsService {
  // PROJ-04 : liste des projets de l'org (table/cards dashboard agence).
  async listProjects(orgId: string): Promise<ProjectDto[]> {
    const rows = (await forOrg(orgId).project.findMany({
      orderBy: { createdAt: "desc" },
    })) as {
      id: string;
      title: string;
      status: string;
      budgetSnapshot: unknown;
      dealId: string;
      createdAt: Date;
      updatedAt: Date;
    }[];
    return rows.map(toProjectDto);
  }

  // PROJ-04 : un projet (détail) — 404 si cross-org.
  async getProject(orgId: string, id: string): Promise<ProjectDto | null> {
    const row = (await forOrg(orgId).project.findUnique({
      where: { id },
    })) as {
      id: string;
      title: string;
      status: string;
      budgetSnapshot: unknown;
      dealId: string;
      createdAt: Date;
      updatedAt: Date;
    } | null;
    return row ? toProjectDto(row) : null;
  }

  // PROJ-03/04 : tâches d'un projet — vérifie l'appartenance org via le projet parent (Task hors SCOPED_MODELS).
  async getProjectTasks(orgId: string, projectId: string): Promise<TaskDto[]> {
    // Vérifier que le projet appartient à l'org (anti-IDOR).
    const project = (await forOrg(orgId).project.findUnique({
      where: { id: projectId },
    })) as { id: string } | null;
    if (!project) throw new NotFoundException("Projet introuvable dans l'organisation.");

    const tasks = (await basePrisma.task.findMany({
      where: { projectId },
      orderBy: { position: "asc" },
    })) as { id: string; projectId: string; title: string; done: boolean; position: number }[];
    return tasks.map(toTaskDto);
  }

  // PROJ-05 : transition de statut (ACTIVE→COMPLETED|CANCELLED, sans retour).
  async updateProjectStatus(orgId: string, id: string, status: ProjectStatus): Promise<ProjectDto> {
    void orgId;
    void id;
    void status;
    throw new Error("Not implemented — Plan 03");
  }

  // PROJ-05 : cocher/décocher une tâche (projet ACTIVE uniquement, IDOR via projet parent).
  async updateTask(orgId: string, taskId: string, done: boolean): Promise<TaskDto> {
    void orgId;
    void taskId;
    void done;
    throw new Error("Not implemented — Plan 03");
  }
}

function toProjectDto(row: {
  id: string;
  title: string;
  status: string;
  budgetSnapshot: unknown;
  dealId: string;
  createdAt: Date;
  updatedAt: Date;
}): ProjectDto {
  return {
    id: row.id,
    title: row.title,
    status: row.status as ProjectStatus,
    budgetSnapshot: row.budgetSnapshot as ProjectDto["budgetSnapshot"],
    dealId: row.dealId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTaskDto(row: {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
  position: number;
}): TaskDto {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    done: row.done,
    position: row.position,
  };
}
