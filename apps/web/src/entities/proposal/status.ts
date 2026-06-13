import type { ProposalStatus } from "@kessel/shared";

// PROPOSAL_STATUS_META — SOURCE UNIQUE du mapping statut -> (label FR + classes badge), 03/05-UI-SPEC
// §Status badge. Record exhaustif sur DRAFT/SENT/SIGNED (Phase 5). Réutilisé partout : badge de la liste,
// badge du header éditeur, ligne Signée de la timeline. Les hue réutilisent EXACTEMENT celles du deal
// (DEAL_STATUS_META) : SENT = même bleu que PROPOSAL_SENT, SIGNED = même vert que WON (DELIV-04 :
// signer gagne le deal -> même vert sur la proposition et le deal). C'est la SEULE source de hue.
export const PROPOSAL_STATUS_META: Record<ProposalStatus, { label: string; badge: string }> = {
  DRAFT: { label: "Brouillon", badge: "bg-slate-100 text-slate-700" },
  SENT: { label: "Envoyée", badge: "bg-blue-100 text-blue-700" },
  SIGNED: { label: "Signée", badge: "bg-green-100 text-green-700" },
};
