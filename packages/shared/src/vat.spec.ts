import { describe, expect, it } from "vitest";
import { computeVat } from "./vat";

// Wave 0 — RED stubs. vat.ts n'existe pas encore → ces tests DOIVENT échouer.
// L'implémentation est livrée en Wave 1, plan 03.

describe("computeVat — ROUND_HALF_UP par groupe", () => {
  it('computeVat(33.33, 0.20, 3) === "20.00" (33.33×3×0.20=19.998 → 20.00)', () => {
    // Arrange
    const lineBase = 33.33;
    const rate = 0.20;
    const n = 3;
    // Act
    const result = computeVat(lineBase, rate, n);
    // Assert
    expect(result).toBe("20.00");
  });

  it('computeVat(100, 0.20, 1) === "20.00"', () => {
    expect(computeVat(100, 0.20, 1)).toBe("20.00");
  });

  it('computeVat(33.33, 0.20, 1) === "6.67" (6.666 ROUND_HALF_UP → 6.67)', () => {
    expect(computeVat(33.33, 0.20, 1)).toBe("6.67");
  });

  it('computeVat("50", "0.055", 2) === "5.50" (taux réduit string inputs)', () => {
    expect(computeVat("50", "0.055", 2)).toBe("5.50");
  });
});
