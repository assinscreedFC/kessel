import { lineTotal, grandTotal } from "@kessel/proposals";
import type { BudgetSnapshot } from "@kessel/shared";

// buildBudgetSnapshot (PROJ-02) — snapshot JSONB immuable calculé à la signature.
//
// RÈGLES D'IMMUABILITÉ :
//  - [...lines] copie le tableau (sort() ne mute pas l'original)
//  - chaque champ est copié en string primitive (Pitfall 5 : jamais d'objet Decimal brut)
//  - total et lineTotals calculés via decimal.js (zéro dérive float IEEE-754)
//  - currency = "EUR" hardcodé v1.1 (pas de multi-devise encore)
//  - signedAt = Date.toISOString() string (sérialisable JSON, pas d'objet Date)

type SnapshotLineInput = {
  description: string;
  quantity: { toString(): string };
  unitPrice: { toString(): string };
  position: number;
};

export function buildBudgetSnapshot(lines: SnapshotLineInput[], signedAt: Date): BudgetSnapshot {
  // Trier par position croissante SANS muter le tableau d'entrée.
  const sorted = [...lines].sort((a, b) => a.position - b.position);

  // Mapper en BudgetSnapshotLine — toutes les valeurs monétaires en string (Pitfall 5).
  const snapshotLines = sorted.map((l) => {
    const qty = l.quantity.toString();
    const price = l.unitPrice.toString();
    return {
      label: l.description,
      qty,
      unitPrice: price,
      lineTotal: lineTotal(qty, price),
    };
  });

  return {
    total: grandTotal(snapshotLines.map((l) => ({ quantity: l.qty, unitPrice: l.unitPrice }))),
    currency: "EUR",
    signedAt: signedAt.toISOString(),
    lines: snapshotLines,
  };
}
