import { describe, expect, it } from "vitest";
import { computeVat, computeVatTotals } from "./vat";

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

// RED — computeVatTotals n'existe pas encore (Wave 1, Plan 03).
// Ces tests DOIVENT échouer avec "computeVatTotals is not a function" ou import error.
// NE PAS implémenter computeVatTotals ici — c'est Plan 03.

describe("computeVatTotals — régimes TVA + calcul par groupe", () => {
  // Cas de référence légal : 3 lignes 33,33 € @20% → HT 99.99 / TVA 20.00 / TTC 119.99
  // Arrondi sur la SOMME du groupe (99.99 × 0.20 = 19.998 → ROUND_HALF_UP → 20.00),
  // pas ligne par ligne (3 × 6.67 = 20.01 — dérive de centime interdite).
  it("NORMAL 3×33.33@20% → ht:99.99, tva:[{rate:20,amount:20.00}], ttc:119.99, legalMention:null", () => {
    // Arrange
    const lines = [
      { unitPrice: 33.33, quantity: 1, vatRate: 0.20 },
      { unitPrice: 33.33, quantity: 1, vatRate: 0.20 },
      { unitPrice: 33.33, quantity: 1, vatRate: 0.20 },
    ];
    // Act
    const result = computeVatTotals(lines, "NORMAL");
    // Assert
    expect(result.ht).toBe("99.99");
    expect(result.tva).toEqual([{ rate: 20, amount: "20.00" }]);
    expect(result.ttc).toBe("119.99");
    expect(result.legalMention).toBeNull();
  });

  it("FRANCHISE → tva:[], ttc===ht, legalMention: 'Article 293B du CGI — TVA non applicable'", () => {
    // Arrange
    const lines = [{ unitPrice: 100, quantity: 1, vatRate: 0.20 }];
    // Act
    const result = computeVatTotals(lines, "FRANCHISE");
    // Assert
    expect(result.tva).toEqual([]);
    expect(result.ttc).toBe(result.ht);
    expect(result.legalMention).toBe("Article 293B du CGI — TVA non applicable");
  });

  it("INTRACOM → tva:[], ttc===ht, legalMention: 'Autoliquidation — TVA due par le preneur'", () => {
    // Arrange
    const lines = [{ unitPrice: 500, quantity: 2, vatRate: 0.20 }];
    // Act
    const result = computeVatTotals(lines, "INTRACOM");
    // Assert
    expect(result.tva).toEqual([]);
    expect(result.ttc).toBe(result.ht);
    expect(result.legalMention).toBe("Autoliquidation — TVA due par le preneur");
  });

  it("NORMAL lignes à 2 taux distincts (0.20 et 0.055) → 2 entrées tva, arrondies par groupe", () => {
    // Arrange — 2 groupes : 100€ @20% + 200€ @5.5%
    const lines = [
      { unitPrice: 100, quantity: 1, vatRate: 0.20 },
      { unitPrice: 200, quantity: 1, vatRate: 0.055 },
    ];
    // Act
    const result = computeVatTotals(lines, "NORMAL");
    // Assert — 2 entrées tva distinctes
    expect(result.tva).toHaveLength(2);
    // Groupe 20% : 100 × 0.20 = 20.00
    const tva20 = result.tva.find((t) => t.rate === 20);
    expect(tva20?.amount).toBe("20.00");
    // Groupe 5.5% : 200 × 0.055 = 11.00
    const tva55 = result.tva.find((t) => t.rate === 5.5);
    expect(tva55?.amount).toBe("11.00");
    expect(result.legalMention).toBeNull();
  });
});
