import { type DealStatus } from "@kessel/shared";

// DEAL_STATUS_META — SOURCE UNIQUE du mapping statut -> (label FR + classes badge), 02-UI-SPEC §Status badge.
// Réutilisé partout : badge de la table, Select statut du Dialog, labels des Tabs de filtre.
// Les classes `badge` sont la SEULE introduction de hue du design (les Tabs restent neutres).
// L'enum reste stable à 4 valeurs (phases 5/6 en dépendent : DELIV-04 -> WON, AI-01 lit WON/LOST).
export const DEAL_STATUS_META: Record<DealStatus, { label: string; badge: string }> = {
  LEAD: { label: "Lead", badge: "bg-slate-100 text-slate-700" },
  PROPOSAL_SENT: { label: "Proposition envoyée", badge: "bg-blue-100 text-blue-700" },
  WON: { label: "Gagné", badge: "bg-green-100 text-green-700" },
  LOST: { label: "Perdu", badge: "bg-red-100 text-red-700" },
};
