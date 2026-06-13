// @kessel/shared — DTO partagés, types, utils communs (frontière posée, aucune feature en Phase 1).
export const SHARED_MODULE = { name: "shared" } as const;

// Contrats CRM (Phase 2) : DealStatus + input/dto shapes, framework-free, dépendables par api et web.
export * from "./contracts/crm";

// Contrats propositions & tarifs (Phase 3) : ProposalDto/QuoteLineDto/PricingItemDto/TemplateDto + inputs.
export * from "./contracts/proposals";

// Liste d'extensions Tiptap PARTAGÉE éditeur(web)/generateHTML(serveur) — framework-agnostique (React-free).
export * from "./tiptap-extensions";
