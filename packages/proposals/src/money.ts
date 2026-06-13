import Decimal from "decimal.js";

// Money math (PROP-03). TOUT calcul monétaire passe par decimal.js — JAMAIS par l'arithmétique
// float JS (0.1 + 0.2 !== 0.3 en IEEE-754). Le calcul fait AUTORITÉ côté serveur (totaux non stockés,
// le client AFFICHE seulement). Entrées et sorties en string (Decimal->string au boundary, comme les
// montants Prisma) : le DTO renvoie quantity/unitPrice/lineTotal/grandTotal en string 2 décimales.

/** Total d'une ligne = quantity × unitPrice, en string à 2 décimales. */
export function lineTotal(quantity: string, unitPrice: string): string {
  return new Decimal(quantity).mul(new Decimal(unitPrice)).toFixed(2);
}

/** Total du devis = somme des (quantity × unitPrice), en string à 2 décimales. */
export function grandTotal(lines: { quantity: string; unitPrice: string }[]): string {
  return lines
    .reduce((acc, l) => acc.plus(new Decimal(l.quantity).mul(new Decimal(l.unitPrice))), new Decimal(0))
    .toFixed(2);
}
