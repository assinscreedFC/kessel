import { describe, expect, it } from "vitest";
import { grandTotal, lineTotal } from "./money";

// Money math PUR (decimal.js) — PROP-03. Entrées/sorties en string (Decimal->string au boundary).
// Prouve l'absence de dérive float IEEE-754 (0.1 + 0.2 !== 0.3 en number JS) et le format 2 décimales.

describe("lineTotal", () => {
  it("3 × 12.35 = 37.05 (pas de dérive float)", () => {
    expect(lineTotal("3", "12.35")).toBe("37.05");
  });

  it("0.5 × 800 = 400.00 (quantité décimale, format 2 décimales)", () => {
    expect(lineTotal("0.5", "800")).toBe("400.00");
  });

  it("1 × 0 = 0.00", () => {
    expect(lineTotal("1", "0")).toBe("0.00");
  });
});

describe("grandTotal", () => {
  it("somme sans dérive IEEE-754 : 37.05 + 0.10 + 0.20 = 37.35", () => {
    const total = grandTotal([
      { quantity: "3", unitPrice: "12.35" },
      { quantity: "1", unitPrice: "0.1" },
      { quantity: "1", unitPrice: "0.2" },
    ]);
    expect(total).toBe("37.35");
  });

  it("liste vide -> 0.00", () => {
    expect(grandTotal([])).toBe("0.00");
  });

  it("plusieurs lignes avec quantités décimales", () => {
    // 0.5*800 + 2*150 = 400 + 300 = 700.00
    const total = grandTotal([
      { quantity: "0.5", unitPrice: "800" },
      { quantity: "2", unitPrice: "150" },
    ]);
    expect(total).toBe("700.00");
  });
});
