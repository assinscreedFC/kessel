// @kessel/shared — DTO partagés, types, utils communs (frontière posée, aucune feature en Phase 1).
export const SHARED_MODULE = { name: "shared" } as const;

// Contrats CRM (Phase 2) : DealStatus + input/dto shapes, framework-free, dépendables par api et web.
export * from "./contracts/crm";
