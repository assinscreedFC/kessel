import Decimal from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * TVA d'un groupe de lignes de même taux. Arrondi sur la somme du groupe (pas ligne par ligne), ROUND_HALF_UP.
 * @param lineBase - Montant unitaire HT d'une ligne
 * @param rate - Taux de TVA (ex. 0.20 pour 20%)
 * @param n - Nombre de lignes du groupe
 * @returns TVA totale du groupe, string toFixed(2).
 */
export function computeVat(
  lineBase: number | string | Decimal,
  rate: number | string | Decimal,
  n: number,
): string {
  return new Decimal(lineBase).mul(n).mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
