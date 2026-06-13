import { describe, expect, it } from "vitest";
import { projectStatusFormSchema } from "./model";

// Schéma zod du formulaire projet (PROJ-04/05) — miroir web du contrat serveur UpdateProjectStatusInput.
// Ce fichier est RED jusqu'au Plan 04 (./model n'existe pas encore — l'import échoue, c'est attendu).
//
// Prouve (une fois GREEN) :
//  - accepte ACTIVE / COMPLETED / CANCELLED (enum ProjectStatus)
//  - rejette un statut hors enum (ex: "ARCHIVED", "")

describe("projectStatusFormSchema", () => {
  it("accepte ACTIVE", () => {
    const result = projectStatusFormSchema.safeParse({ status: "ACTIVE" });
    expect(result.success).toBe(true);
  });

  it("accepte COMPLETED", () => {
    const result = projectStatusFormSchema.safeParse({ status: "COMPLETED" });
    expect(result.success).toBe(true);
  });

  it("accepte CANCELLED", () => {
    const result = projectStatusFormSchema.safeParse({ status: "CANCELLED" });
    expect(result.success).toBe(true);
  });

  it("rejette un statut hors enum (ARCHIVED)", () => {
    const result = projectStatusFormSchema.safeParse({ status: "ARCHIVED" });
    expect(result.success).toBe(false);
  });

  it("rejette une chaîne vide", () => {
    const result = projectStatusFormSchema.safeParse({ status: "" });
    expect(result.success).toBe(false);
  });

  it("rejette undefined (champ obligatoire)", () => {
    const result = projectStatusFormSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
