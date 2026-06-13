import type { ProposalStatus } from "@kessel/shared";

// PROPOSAL_STATUS_META — SOURCE UNIQUE du mapping statut -> (label FR + classes badge), 03-UI-SPEC
// §Status reuse. En Phase 3 le statut est TOUJOURS DRAFT (badge neutre). Défini comme un record typé
// (miroir du pattern entities/deal) pour que la Phase 5 ajoute SENT/SIGNED sans restyler.
export const PROPOSAL_STATUS_META: Record<ProposalStatus, { label: string; badge: string }> = {
  DRAFT: { label: "Brouillon", badge: "bg-slate-100 text-slate-700" },
};
