import Decimal from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/** Convertit un montant en unité monétaire (ex. 33.33) en centimes entiers, sans dérive float. */
export function toCents(amount: number | string | Decimal): number {
  return new Decimal(amount).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Convertit des centimes entiers en montant Decimal (2 décimales à l'affichage). */
export function fromCents(cents: number): Decimal {
  return new Decimal(cents).div(100);
}
