import { describe, expect, it } from "vitest";
import { envValidationSchema } from "./env.validation";

// Wave 0 — RED stub. env.validation.ts n'existe pas encore → DOIT échouer.
// L'implémentation est livrée en Wave 1, plan 04.
// Valide : STRIPE_SECRET_KEY requis au boot, STRIPE_WEBHOOK_SECRET optionnel.

describe("envValidationSchema — validation Stripe au boot", () => {
  it("retourne une erreur si STRIPE_SECRET_KEY est absent", () => {
    // Arrange
    const input = { DATABASE_URL: "postgresql://localhost/test" };
    // Act
    const result = envValidationSchema.validate(input);
    // Assert
    expect(result.error).toBeDefined();
  });

  it("mentionne STRIPE_SECRET_KEY dans le message d'erreur", () => {
    const input = { DATABASE_URL: "postgresql://localhost/test" };
    const result = envValidationSchema.validate(input);
    expect(result.error?.message).toMatch(/STRIPE_SECRET_KEY/);
  });

  it("ne retourne pas d'erreur si tous les requis sont présents et les optionnels absents", () => {
    // Arrange — STRIPE_WEBHOOK_SECRET optionnel : ne crash pas.
    // PORTAL_JWT_SECRET (>=32) et WEBHOOK_ENCRYPTION_KEY (64 hex) sont devenus requis
    // en Phases 4/5 — le fixture "valide" doit les inclure.
    const input = {
      DATABASE_URL: "postgresql://localhost/test",
      STRIPE_SECRET_KEY: "sk_test_valid_key",
      PORTAL_JWT_SECRET: "a".repeat(32),
      WEBHOOK_ENCRYPTION_KEY: "a".repeat(64),
    };
    // Act
    const result = envValidationSchema.validate(input);
    // Assert
    expect(result.error).toBeUndefined();
  });
});
