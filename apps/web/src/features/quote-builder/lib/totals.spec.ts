import { describe, expect, it } from "vitest";
import { formatEur, formatGrandTotal, formatLineTotal } from "./totals";

// Tests des helpers d'AFFICHAGE des totaux du devis (purs, Intl fr-FR EUR). Le calcul d'affichage est
// optimiste pendant l'édition ; l'autorité reste le serveur (grandTotal decimal.js renvoyé en string).
// Les espaces des montants fr-FR sont des espaces insécables (U+00A0 / U+202F) -> on normalise avant
// d'asserter pour rester robuste à la version d'ICU.

const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("totals (affichage devis)", () => {
  it("formatLineTotal multiplie qty x unitPrice et formate en EUR fr-FR", () => {
    expect(norm(formatLineTotal("3", "12.35"))).toBe("37,05 €");
  });

  it("formatLineTotal gere les decimales (0,5 x 800)", () => {
    expect(norm(formatLineTotal("0.5", "800"))).toBe("400,00 €");
  });

  it("formatGrandTotal somme les lignes [3x12.35, 1x0.10] = 37,15 €", () => {
    const total = formatGrandTotal([
      { quantity: "3", unitPrice: "12.35" },
      { quantity: "1", unitPrice: "0.10" },
    ]);
    expect(norm(total)).toBe("37,15 €");
  });

  it("formatGrandTotal d'une liste vide = 0,00 €", () => {
    expect(norm(formatGrandTotal([]))).toBe("0,00 €");
  });

  it("formatEur formate une string decimal serveur (autorite) telle quelle", () => {
    expect(norm(formatEur("37.15"))).toBe("37,15 €");
  });
});
