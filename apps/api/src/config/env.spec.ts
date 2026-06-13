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

  it("ne retourne pas d'erreur si STRIPE_SECRET_KEY présent et STRIPE_WEBHOOK_SECRET absent", () => {
    // Arrange — STRIPE_WEBHOOK_SECRET optionnel : ne crash pas
    const input = {
      DATABASE_URL: "postgresql://localhost/test",
      STRIPE_SECRET_KEY: "sk_test_valid_key",
    };
    // Act
    const result = envValidationSchema.validate(input);
    // Assert
    expect(result.error).toBeUndefined();
  });
});
