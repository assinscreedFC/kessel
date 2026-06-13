// @kessel/projects — SEUL point d'export public du domaine projects (FOUND-05).
// La logique domaine (ProjectsService, buildBudgetSnapshot) consomme @kessel/db (forOrg) +
// le contrat @kessel/shared ; les controllers de l'app api l'injectent via le DI NestJS.

// Helper budget figé (PROJ-02) : snapshot JSONB immuable calculé à la signature.
export { buildBudgetSnapshot } from "./budget-snapshot";

// Squelette ProjectsService (implémentation complète Plan 03).
export { ProjectsService } from "./projects.service";

export const PROJECTS_MODULE = { name: "projects" } as const;
