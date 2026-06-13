import { describe, expect, it } from "vitest";
import { buildBudgetSnapshot } from "./budget-snapshot";

// buildBudgetSnapshot (PROJ-02) — snapshot JSONB immuable calculé à la signature.
//
// Prouve :
//  - total = grandTotal exact decimal.js (2 décimales), jamais un objet Decimal (Pitfall 5)
//  - chaque ligne : label=description, qty/unitPrice/lineTotal en string
//  - lines triées par position croissante AVANT mapping
//  - currency = "EUR" (hardcodé v1.1)
//  - signedAt = ISO string de la Date passée en paramètre
//  - les valeurs string sont des primitives (typeof === "string"), JAMAIS des objets

const SIGNED_AT = new Date("2024-01-15T10:00:00.000Z");

const THREE_LINES = [
  { description: "Design", quantity: "2", unitPrice: "100", position: 2 },
  { description: "Dev", quantity: "1", unitPrice: "150", position: 1 },
  { description: "QA", quantity: "1", unitPrice: "50", position: 3 },
];

describe("buildBudgetSnapshot", () => {
  it("total exact decimal.js (2×100 + 1×150 + 1×50 = 400.00)", () => {
    const snap = buildBudgetSnapshot(THREE_LINES, SIGNED_AT);
    expect(snap.total).toBe("400.00");
  });

  it("total est un string, jamais un objet Decimal (Pitfall 5)", () => {
    const snap = buildBudgetSnapshot(THREE_LINES, SIGNED_AT);
    expect(typeof snap.total).toBe("string");
  });

  it("lineTotal de chaque ligne est un string (Pitfall 5)", () => {
    const snap = buildBudgetSnapshot(THREE_LINES, SIGNED_AT);
    for (const line of snap.lines) {
      expect(typeof line.lineTotal).toBe("string");
    }
  });

  it("lines triées par position croissante (Dev pos:1, Design pos:2, QA pos:3)", () => {
    const snap = buildBudgetSnapshot(THREE_LINES, SIGNED_AT);
    expect(snap.lines[0].label).toBe("Dev");
    expect(snap.lines[1].label).toBe("Design");
    expect(snap.lines[2].label).toBe("QA");
  });

  it("chaque ligne : label=description, qty=quantity.toString(), unitPrice=unitPrice.toString()", () => {
    const snap = buildBudgetSnapshot(THREE_LINES, SIGNED_AT);
    const devLine = snap.lines[0]; // position 1 = Dev
    expect(devLine.label).toBe("Dev");
    expect(devLine.qty).toBe("1");
    expect(devLine.unitPrice).toBe("150");
    expect(devLine.lineTotal).toBe("150.00");
  });

  it("lineTotal correct par ligne (1×150=150.00, 2×100=200.00, 1×50=50.00)", () => {
    const snap = buildBudgetSnapshot(THREE_LINES, SIGNED_AT);
    expect(snap.lines[0].lineTotal).toBe("150.00"); // Dev
    expect(snap.lines[1].lineTotal).toBe("200.00"); // Design
    expect(snap.lines[2].lineTotal).toBe("50.00");  // QA
  });

  it("currency = EUR (hardcodé v1.1)", () => {
    const snap = buildBudgetSnapshot(THREE_LINES, SIGNED_AT);
    expect(snap.currency).toBe("EUR");
  });

  it("signedAt = ISO string de la Date passée", () => {
    const snap = buildBudgetSnapshot(THREE_LINES, SIGNED_AT);
    expect(snap.signedAt).toBe("2024-01-15T10:00:00.000Z");
  });

  it("snapshot immuable : modifier l'input après coup ne change pas le snap (copie des valeurs)", () => {
    const lines = [{ description: "A", quantity: "2", unitPrice: "100", position: 1 }];
    const snap = buildBudgetSnapshot(lines, SIGNED_AT);
    // Muter le tableau d'entrée ne change pas le snapshot (buildBudgetSnapshot copie)
    lines[0].description = "MUTATED";
    expect(snap.lines[0].label).toBe("A");
  });

  it("liste vide -> total = 0.00, lines = []", () => {
    const snap = buildBudgetSnapshot([], SIGNED_AT);
    expect(snap.total).toBe("0.00");
    expect(snap.lines).toHaveLength(0);
  });

  it("qty/unitPrice avec Decimal-like .toString() (passage d'objets Prisma Decimal)", () => {
    // Simule la forme d'un Prisma Decimal : { toString() { return "3.5" } }
    const prismaLike = [
      {
        description: "Audit",
        quantity: { toString: () => "3.5" },
        unitPrice: { toString: () => "200" },
        position: 1,
      },
    ];
    const snap = buildBudgetSnapshot(prismaLike as Parameters<typeof buildBudgetSnapshot>[0], SIGNED_AT);
    expect(snap.total).toBe("700.00"); // 3.5 × 200
    expect(snap.lines[0].qty).toBe("3.5");
  });
});
