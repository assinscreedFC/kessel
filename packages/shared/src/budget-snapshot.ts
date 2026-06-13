import Decimal from "decimal.js";
import type { BudgetSnapshot } from "./contracts/projects";

// buildBudgetSnapshot (PROJ-02) — snapshot JSONB immuable calculé à la signature.
// Déplacé dans @kessel/shared (FOUND-05) : casse le cycle projects↔proposals en rendant
// la fonction auto-suffisante (decimal.js inline, aucun import de @kessel/proposals).
//
// RÈGLES D'IMMUABILITÉ :
//  - [...lines] copie le tableau (sort() ne mute pas l'original)
//  - chaque champ est copié en string primitive (Pitfall 5 : jamais d'objet Decimal brut)
//  - total et lineTotals calculés via decimal.js (zéro dérive float IEEE-754)
//  - currency = "EUR" hardcodé v1.1 (pas de multi-devise encore)
//  - signedAt = Date.toISOString() string (sérialisable JSON, pas d'objet Date)

export type SnapshotLineInput = {
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
      lineTotal: new Decimal(qty).mul(new Decimal(price)).toFixed(2),
    };
  });

  const total = snapshotLines.length === 0
    ? "0.00"
    : snapshotLines
        .reduce((acc, l) => acc.plus(new Decimal(l.qty).mul(new Decimal(l.unitPrice))), new Decimal(0))
        .toFixed(2);

  return {
    total,
    currency: "EUR",
    signedAt: signedAt.toISOString(),
    lines: snapshotLines,
  };
}
