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

// === TVA par régime (TVA-02/03/04) ===

export interface VatLine {
  unitPrice: string | number | Decimal;
  quantity: string | number | Decimal;
  vatRate: number; // ex. 0.20 pour 20%, 0.055 pour 5.5%
}

export interface VatTotals {
  ht: string;                              // "99.99"
  tva: { rate: number; amount: string }[]; // [{ rate: 20, amount: "20.00" }] — taux en %
  ttc: string;                             // "119.99"
  regime: "FRANCHISE" | "NORMAL" | "INTRACOM";
  legalMention: string | null;
}

/**
 * Calcule les totaux TVA d'un ensemble de lignes selon le régime de l'org.
 * ROUND_HALF_UP sur la somme de chaque groupe de taux (anti-dérive de centime).
 * @param lines - Lignes de devis avec unitPrice, quantity, vatRate
 * @param regime - Régime TVA de l'organisation
 */
export function computeVatTotals(
  lines: VatLine[],
  regime: "FRANCHISE" | "NORMAL" | "INTRACOM",
): VatTotals {
  // HT = somme des lineTotals (sans arrondi intermédiaire)
  const ht = lines
    .reduce(
      (acc, l) =>
        acc.plus(new Decimal(l.unitPrice.toString()).mul(new Decimal(l.quantity.toString()))),
      new Decimal(0),
    )
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (regime === "FRANCHISE") {
    return {
      ht: ht.toFixed(2),
      tva: [],
      ttc: ht.toFixed(2),
      regime,
      legalMention: "Article 293B du CGI — TVA non applicable",
    };
  }

  if (regime === "INTRACOM") {
    return {
      ht: ht.toFixed(2),
      tva: [],
      ttc: ht.toFixed(2),
      regime,
      legalMention: "Autoliquidation — TVA due par le preneur",
    };
  }

  // NORMAL : grouper par taux, computeVat par groupe (ROUND_HALF_UP sur la somme, jamais ligne par ligne)
  const rateMap = new Map<number, Decimal>();
  for (const l of lines) {
    const rate = Number(l.vatRate);
    const lineHt = new Decimal(l.unitPrice.toString()).mul(new Decimal(l.quantity.toString()));
    rateMap.set(rate, (rateMap.get(rate) ?? new Decimal(0)).plus(lineHt));
  }

  const tva: { rate: number; amount: string }[] = [];
  let totalTva = new Decimal(0);

  for (const [rate, groupHt] of rateMap) {
    const vatAmount = groupHt.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    tva.push({ rate: rate * 100, amount: vatAmount.toFixed(2) });
    totalTva = totalTva.plus(vatAmount);
  }

  const ttc = ht.plus(totalTva).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return { ht: ht.toFixed(2), tva, ttc: ttc.toFixed(2), regime, legalMention: null };
}
