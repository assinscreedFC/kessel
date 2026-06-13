import { describe, expect, it } from "vitest";
import { toCents, fromCents } from "./money";

// Wave 0 — RED stubs. money.ts n'existe pas encore → ces tests DOIVENT échouer.
// L'implémentation est livrée en Wave 1, plan 03.

describe("toCents — zéro dérive float (decimal.js)", () => {
  it("0.1 + 0.2 === 0.3 en centimes (pas de dérive float)", () => {
    // Arrange / Act / Assert
    expect(toCents(0.1) + toCents(0.2)).toBe(toCents(0.3));
  });

  it("toCents(33.33) === 3333", () => {
    expect(toCents(33.33)).toBe(3333);
  });

  it('toCents("19.99") === 1999 (string input)', () => {
    expect(toCents("19.99")).toBe(1999);
  });

  it("toCents(0.005) === 1 (ROUND_HALF_UP : 0.5 cent arrondi au supérieur)", () => {
    expect(toCents(0.005)).toBe(1);
  });
});

describe("fromCents — Decimal retourné", () => {
  it('fromCents(3333).toFixed(2) === "33.33"', () => {
    expect(fromCents(3333).toFixed(2)).toBe("33.33");
  });
});
