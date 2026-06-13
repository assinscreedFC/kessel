import type { OutcomeKind } from "@kessel/shared";

// OUTCOME_KIND_META — SOURCE UNIQUE du mapping issue -> (label FR + classes badge) de la vue dataset.
// Réutilise EXACTEMENT les hues de DEAL_STATUS_META (WON green / LOST red, 02-UI-SPEC §Status badge) :
// l'issue d'une proposition est la même sémantique gagné/perdu qu'un deal, donc même langage visuel.
export const OUTCOME_KIND_META: Record<OutcomeKind, { label: string; badge: string }> = {
  WON: { label: "Gagné", badge: "bg-green-100 text-green-700" },
  LOST: { label: "Perdu", badge: "bg-red-100 text-red-700" },
};
