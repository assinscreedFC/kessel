// @kessel/proposals — domaine propositions & tarifs (PROP-01/02/03/07).
// money.ts (decimal.js) est posé en Plan 03-01 ; ProposalsService + PdfService viennent Plans 02/03.
export const PROPOSALS_MODULE = { name: "proposals" } as const;
export * from "./money";
export * from "./outcome-context";
// OutcomeService (hooks LOST + dataset forOrg, Plan 06-02) — re-export nommé explicite.
export { OutcomeService } from "./outcome.service";
export * from "./token";
export * from "./pdf-template";
export * from "./pdf.service";
export * from "./proposals.service";
export * from "./signing.service";
export * from "./storage.service";
export * from "./delivery.service";
