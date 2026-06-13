// @kessel/crm — SEUL point d'export public du domaine crm (FOUND-05).
// La logique domaine (CrmService) consomme @kessel/db (forOrg) + le contrat @kessel/shared ;
// les controllers de l'app api l'injectent via le DI NestJS (@Injectable).
export { CrmService } from "./crm.service";

export const CRM_MODULE = { name: "crm" } as const;
