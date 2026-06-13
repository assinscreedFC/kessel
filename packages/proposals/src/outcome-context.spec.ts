import { describe, expect, it } from "vitest";
import { buildOutcomeContext } from "./outcome-context";

// buildOutcomeContext PUR (Phase 6, AI-01) — snapshot figé à la résolution, decimal exact, NO PII.
// Prouve : amount via grandTotal (decimal.js), counts, bodyTextLength via extraction texte locale,
// liste vide -> 0.00 / 0, clés EXACTES (whitelist RGPD, aucune PII), et pureté (2 appels identiques).

const WON_DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Périmètre" }] },
    { type: "paragraph", content: [{ type: "text", text: "Mission livrée." }] },
  ],
};

describe("buildOutcomeContext", () => {
  it("dérive amount decimal exact (2×500 + 3×12.35 = 1037.05) + counts + bodyTextLength", () => {
    const lines = [
      { quantity: "2", unitPrice: "500" },
      { quantity: "3", unitPrice: "12.35" },
    ];
    const ctx = buildOutcomeContext({ bodyJson: WON_DOC }, lines);
    expect(ctx.amount).toBe("1037.05");
    expect(ctx.lineCount).toBe(2);
    expect(ctx.deliverableCount).toBe(2); // A3 : faute de modèle Deliverable v0
    // bodyTextLength = longueur du texte extrait (non vide pour un corps réel).
    expect(ctx.bodyTextLength).toBeGreaterThan(0);
  });

  it("supporte des montants Decimal-like (toString)", () => {
    const lines = [
      { quantity: { toString: () => "0.5" }, unitPrice: { toString: () => "800" } },
      { quantity: { toString: () => "2" }, unitPrice: { toString: () => "150" } },
    ];
    const ctx = buildOutcomeContext({ bodyJson: WON_DOC }, lines);
    // 0.5*800 + 2*150 = 400 + 300 = 700.00
    expect(ctx.amount).toBe("700.00");
    expect(ctx.lineCount).toBe(2);
  });

  it("liste vide -> amount 0.00, counts 0, bodyTextLength 0 (corps vide)", () => {
    const ctx = buildOutcomeContext({ bodyJson: { type: "doc", content: [] } }, []);
    expect(ctx.amount).toBe("0.00");
    expect(ctx.lineCount).toBe(0);
    expect(ctx.deliverableCount).toBe(0);
    expect(ctx.bodyTextLength).toBe(0);
  });

  it("RGPD : clés EXACTES, AUCUNE PII (pas de nom/email/clientType par défaut)", () => {
    const ctx = buildOutcomeContext({ bodyJson: WON_DOC }, [{ quantity: "1", unitPrice: "100" }]);
    // Whitelist stricte : clientType OMIS par défaut (A1).
    expect(Object.keys(ctx).sort()).toEqual(
      ["amount", "bodyTextLength", "deliverableCount", "lineCount"].sort(),
    );
  });

  it("pureté : 2 appels avec les mêmes entrées -> objets égaux (pas d'I/O, pas d'horloge)", () => {
    const lines = [{ quantity: "2", unitPrice: "500" }];
    const a = buildOutcomeContext({ bodyJson: WON_DOC }, lines);
    const b = buildOutcomeContext({ bodyJson: WON_DOC }, lines);
    expect(a).toEqual(b);
  });

  it("bodyJson malformé/null -> bodyTextLength 0 (tolérant, pas d'exception)", () => {
    const ctx = buildOutcomeContext({ bodyJson: null }, [{ quantity: "1", unitPrice: "1" }]);
    expect(ctx.bodyTextLength).toBe(0);
    expect(ctx.amount).toBe("1.00");
  });
});
