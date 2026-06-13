import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { db, forOrg, basePrisma } from "@kessel/db";
import type { ProjectDto, TaskDto, ProjectStatus, BudgetSnapshot } from "@kessel/shared";

// ProjectsService — domaine Project (@kessel/projects, type:domain scope:projects).
//
// CONVENTION DE STACK (CLAUDE.md + RESEARCH.md, NON NÉGOCIABLE) :
//  - Kysely (`db` de "@kessel/db") = requêtes typées / LECTURES.
//    `db.selectFrom("Project")…` — tables en PascalCase (casing prisma-kysely).
//  - Prisma (`forOrg` / `basePrisma` de "@kessel/db") = migrations + ÉCRITURES + $transaction
//    + gardes nécessitant le scope auto org (forOrg).
//
// SCOPING :
//  - Project : dans SCOPED_MODELS (orgId direct) → forOrg(orgId) pour les ÉCRITURES/gardes ;
//    Kysely `db.selectFrom("Project").where("orgId","=",orgId)` pour les LECTURES.
//  - Task : HORS SCOPED_MODELS (pas de colonne orgId) → isolation via Project parent.
//    LECTURE : Kysely JOIN Project sur Project.orgId.
//    ÉCRITURE : garde forOrg(orgId).project.findFirst({ where: { tasks: { some: { id } } } })
//    puis basePrisma.task.update (Task hors forOrg — Pitfall 3 RESEARCH.md).

@Injectable()
export class ProjectsService {
  // PROJ-04 : liste des projets de l'org (table/cards dashboard agence).
  // LECTURE Kysely — convention de stack (Prisma=migrations+writes, Kysely=requêtes typées).
  async listProjects(orgId: string): Promise<ProjectDto[]> {
    const rows = await db
      .selectFrom("Project")
      .where("orgId", "=", orgId)
      .orderBy("createdAt", "desc")
      .selectAll()
      .execute();
    return rows.map(toProjectDto);
  }

  // PROJ-04 : un projet (détail) — null si cross-org (→ 404 au controller).
  // LECTURE Kysely : double WHERE orgId+id → cross-org renvoie undefined → null.
  async getProject(orgId: string, id: string): Promise<ProjectDto | null> {
    const row = await db
      .selectFrom("Project")
      .where("orgId", "=", orgId)
      .where("id", "=", id)
      .selectAll()
      .executeTakeFirst();
    return row ? toProjectDto(row) : null;
  }

  // PROJ-03/04 : tâches d'un projet — vérifie l'appartenance org via le projet parent.
  // Task hors SCOPED_MODELS : isolation via Project.orgId (JOIN Kysely — cf. schema.spec.ts innerJoin).
  // Distingue "projet inconnu/cross-org → 404" de "projet vide → []".
  async getProjectTasks(orgId: string, projectId: string): Promise<TaskDto[]> {
    // Vérifier que le projet appartient à l'org (anti-IDOR).
    const project = await db
      .selectFrom("Project")
      .where("orgId", "=", orgId)
      .where("id", "=", projectId)
      .select("id")
      .executeTakeFirst();
    if (!project) throw new NotFoundException("Projet introuvable dans l'organisation.");

    // Task hors SCOPED_MODELS : isolation via le projet parent (Project.orgId).
    // JOIN Project assure que seules les tâches du bon org remontent (T-2-iso tâche).
    const rows = await db
      .selectFrom("Task")
      .innerJoin("Project", "Project.id", "Task.projectId")
      .where("Project.orgId", "=", orgId)
      .where("Task.projectId", "=", projectId)
      .orderBy("Task.position", "asc")
      .selectAll("Task")
      .execute();
    return rows.map(toTaskDto);
  }

  // PROJ-05 : transition de statut (ACTIVE→COMPLETED|CANCELLED, sans retour).
  // ÉCRITURE Prisma — garde de transition + update atomique.
  async updateProjectStatus(orgId: string, id: string, status: ProjectStatus): Promise<ProjectDto> {
    // Charger via forOrg pour garantir l'appartenance org (T-2-iso).
    const project = await forOrg(orgId).project.findFirst({ where: { id } });
    if (!project) throw new NotFoundException("Projet introuvable.");

    // Garde de transition : seul un projet ACTIVE peut être fermé (T-2-transition).
    if (project.status !== "ACTIVE") {
      throw new ConflictException(
        "Seul un projet ACTIVE peut être fermé. Transition inverse interdite.",
      );
    }

    // Cible autorisée : COMPLETED ou CANCELLED uniquement (T-2-transition).
    if (status !== "COMPLETED" && status !== "CANCELLED") {
      throw new BadRequestException(
        `Statut cible "${status}" non autorisé. Valeurs acceptées : COMPLETED, CANCELLED.`,
      );
    }

    const updated = await forOrg(orgId).project.update({
      where: { id },
      data: { status },
    });

    return toProjectDto(updated as unknown as ProjectRow);
  }

  // PROJ-05 : cocher/décocher une tâche (projet ACTIVE uniquement, IDOR via projet parent).
  // Pitfall 3 (RESEARCH.md) : Task hors SCOPED_MODELS → `forOrg(orgId).task.update` ÉCHOUE.
  // Garde d'appartenance via parent : `forOrg(orgId).project.findFirst({ where: { tasks: { some: { id } } } })`.
  // Écriture via `basePrisma.task.update` (Task hors forOrg — seul chemin correct).
  async updateTask(orgId: string, taskId: string, done: boolean): Promise<TaskDto> {
    // Garde IDOR via projet parent (Pitfall 3 — forOrg garantit l'appartenance org).
    const project = await forOrg(orgId).project.findFirst({
      where: { tasks: { some: { id: taskId } } } as never,
    });
    if (!project) throw new NotFoundException("Tâche introuvable dans l'organisation.");

    // Une tâche ne peut être modifiée que si le projet est ACTIVE (T-2-status-task).
    if (project.status !== "ACTIVE") {
      throw new ConflictException(
        "Les tâches d'un projet terminé ou annulé ne peuvent pas être modifiées.",
      );
    }

    // Écriture via basePrisma (Task hors forOrg — l'appartenance est vérifiée ci-dessus).
    const updated = await basePrisma.task.update({
      where: { id: taskId },
      data: { done },
    });

    return toTaskDto(updated as unknown as TaskRow);
  }
}

// ─── Helpers de mapping ───────────────────────────────────────────────────────

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  budgetSnapshot: unknown;
  dealId: string;
  createdAt: Date;
  updatedAt: Date;
};

type TaskRow = {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
  position: number;
};

function toProjectDto(row: ProjectRow): ProjectDto {
  return {
    id: row.id,
    title: row.title,
    status: row.status as ProjectStatus,
    budgetSnapshot: row.budgetSnapshot as BudgetSnapshot,
    dealId: row.dealId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function toTaskDto(row: TaskRow): TaskDto {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    done: row.done,
    position: row.position,
  };
}
