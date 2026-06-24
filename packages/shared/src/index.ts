// @kessel/shared — DTO partagés, types, utils communs (frontière posée, aucune feature en Phase 1).
export const SHARED_MODULE = { name: "shared" } as const;

// Contrats CRM (Phase 2) : DealStatus + input/dto shapes, framework-free, dépendables par api et web.
export * from "./contracts/crm";

// Contrats propositions & tarifs (Phase 3) : ProposalDto/QuoteLineDto/PricingItemDto/TemplateDto + inputs.
export * from "./contracts/proposals";

// Liste d'extensions Tiptap PARTAGÉE éditeur(web)/generateHTML(serveur) — framework-agnostique (React-free).
export * from "./tiptap-extensions";

// Contrat de génération IA (Phase 4) : forme de la requête web (brief/dealId/templateId), framework-free.
export * from "./contracts/ai";

// Contrats de la boucle de données flywheel (Phase 6, AI-01) : OutcomeKind + ProposalOutcomeContext
// (snapshot non-PII) + ProposalOutcomeDto, framework-free.
export * from "./contracts/outcomes";

// Helpers monétaires partagés (Phase 1) : toCents/fromCents via decimal.js, zéro dérive float.
export * from "./money";

// Helper TVA partagé (Phase 1) : computeVat ROUND_HALF_UP par groupe — socle TVA UE Phase 7.
export * from "./vat";

// Contrats module Project (Phase 2) : ProjectStatus + BudgetSnapshot/ProjectDto/TaskDto + inputs,
// framework-free, dépendables par api ET web (FOUND-05).
export * from "./contracts/projects";

// Helper budget figé (PROJ-02, FOUND-05) : snapshot JSONB immuable calculé à la signature.
// Déplacé depuis @kessel/projects pour casser le cycle projects↔proposals.
export * from "./budget-snapshot";

// Branding partagé (PORT-07) : OrgBrandingDto + validation couleur hex + couleur par défaut,
// framework-free, source de vérité unique front/back (api, web, portal).
export * from "./branding";

// Contrats module time-tracking (FX-04) : validation SIREN/SIRET (Luhn + exception La Poste),
// TypeScript pur, source de vérité unique front/back.
export * from "./contracts/timetrack";
