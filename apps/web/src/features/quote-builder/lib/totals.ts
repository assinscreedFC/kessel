// Helpers d'AFFICHAGE des totaux du devis (couche `features/quote-builder/lib`).
//
// Les montants sont des string decimal au boundary (Pitfall 2). Pendant l'édition, l'affichage est
// OPTIMISTE : on calcule qty × unitPrice en number pour un feedback live. L'AUTORITÉ reste le serveur
// (grandTotal decimal.js, money.ts) — `formatEur` affiche le total serveur tel quel quand disponible.
// On ne recalcule jamais en float pour faire autorité (T-3-web-total : accept).

const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

// Formate une string decimal (ex. le grandTotal serveur) en EUR fr-FR.
export function formatEur(amount: string): string {
  return EUR.format(Number(amount));
}

// Total d'une ligne (affichage optimiste) : qty × unitPrice.
export function formatLineTotal(quantity: string, unitPrice: string): string {
  return EUR.format(Number(quantity) * Number(unitPrice));
}

export interface QuoteLineAmounts {
  quantity: string;
  unitPrice: string;
}

// Grand total optimiste : somme des qty × unitPrice (affichage live pendant l'édition).
export function formatGrandTotal(lines: QuoteLineAmounts[]): string {
  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.unitPrice),
    0,
  );
  return EUR.format(total);
}
