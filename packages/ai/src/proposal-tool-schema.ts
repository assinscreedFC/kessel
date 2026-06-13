import type Anthropic from "@anthropic-ai/sdk";

// proposal-tool-schema.ts — l'UNIQUE outil Anthropic, schéma PLAT + strict.
//
// `strict: true` contraint l'échantillonnage à un JSON valide selon le schéma (grammar-constrained).
// Contrainte : strict INTERDIT les schémas récursifs -> on N'émet PAS de document ProseMirror récursif.
// Le corps est émis en `bodySections[]` PLATES (heading + paragraphs[] + bullets[]), assemblées
// côté serveur en un doc valide via sectionsToProseMirror (Déviation tracée vs CONTEXT, RESEARCH Pattern 2).
// `additionalProperties: false` est requis en strict ; `required` est complet sur chaque objet.

export const GENERATE_TOOL_NAME = "emit_proposal" as const;

export const GENERATE_TOOL: Anthropic.Tool = {
  name: GENERATE_TOOL_NAME,
  description:
    "Émet une proposition commerciale structurée et son devis chiffré à partir du brief, du template " +
    "et de la grille de tarifs de l'organisation. Utilise EXCLUSIVEMENT les prestations de la grille " +
    "fournie quand un livrable y correspond ; sinon propose une ligne libre avec un prix cohérent. " +
    "Les montants (quantity, unitPrice) sont des nombres en euros.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      scope: { type: "string", description: "Résumé du périmètre de la mission" },
      deliverables: {
        type: "array",
        items: { type: "string" },
        description: "Liste des livrables",
      },
      effortNotes: { type: "string", description: "Notes d'estimation de charge" },
      // Corps en SECTIONS PLATES (pas de document récursif — strict l'interdit).
      bodySections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            heading: { type: "string" },
            paragraphs: { type: "array", items: { type: "string" } },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["heading", "paragraphs", "bullets"],
        },
      },
      quoteLines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            quantity: { type: "number" },
            unitPrice: { type: "number" }, // euros ; le serveur recalcule les totaux via money.ts
          },
          required: ["description", "quantity", "unitPrice"],
        },
      },
    },
    required: ["scope", "deliverables", "effortNotes", "bodySections", "quoteLines"],
  },
};
