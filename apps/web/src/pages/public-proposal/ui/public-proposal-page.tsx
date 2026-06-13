import { useParams } from "react-router-dom";
import { usePublicProposal, useRecordView } from "../api";

// Surface PUBLIQUE /p/:token (squelette Task 1 — état-driven complet en Task 2). Montée HORS de
// l'AppShell authentifié (arbre de routes isolé, aucune sidebar/chrome, aucune session).
export function PublicProposalPage() {
  const { token = "" } = useParams();
  const { isPending } = usePublicProposal(token);
  useRecordView(token);

  return (
    <div className="min-h-screen bg-slate-50">
      {isPending ? null : null}
    </div>
  );
}
