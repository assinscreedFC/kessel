import type { ProposalStatus } from "@kessel/shared";

// PROPOSAL_STATUS_META — SOURCE UNIQUE du mapping statut -> (label FR + classes badge), 04-UI-SPEC
// §Color. Copié verbatim depuis apps/web/src/entities/proposal/status.ts.
// L'alias @kessel/shared est résolu dans apps/portal/vite.config.ts (Plan 01).
export const PROPOSAL_STATUS_META: Record<ProposalStatus, { label: string; badge: string }> = {
  DRAFT: { label: "Brouillon", badge: "bg-slate-100 text-slate-700" },
  SENT: { label: "Envoyée", badge: "bg-blue-100 text-blue-700" },
  SIGNED: { label: "Signée", badge: "bg-green-100 text-green-700" },
};
