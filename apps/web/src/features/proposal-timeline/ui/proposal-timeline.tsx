import { CheckCircle2, Eye, Mail, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import type { ProposalStatus } from "@kessel/shared";
import { useProposalEvents } from "@/entities/proposal/api";
import {
  buildRows,
  formatTimestamp,
  splitOverflow,
  type ProposalEventLike,
  type TimelineRow,
  type TimelineRowType,
} from "../lib/timeline";

// Feature proposal-timeline (Suivi, DELIV-02) — colonne droite de l'éditeur. 05-UI-SPEC §Tracking Timeline.
// Liste verticale, horodatée fr-FR, RGPD-minimale (meta ip/ua JAMAIS surfacé). 4 états : loading / empty
// (DRAFT) / populated / error. La logique de construction des lignes vit dans ../lib/timeline (testée).
//
// Source : GET /api/proposals/:id/events (SENT/OPENED/VIEWED). La transition SIGNED n'est PAS un
// ProposalEvent serveur (l'enum = SENT/OPENED/VIEWED, Plan 05-01) ; elle est portée par Proposal.status.
// Quand la proposition est SIGNED, on dérive une ligne terminale "Signée" depuis le statut. Le serveur
// n'expose pas signerName au boundary web (record Signature non surfacé) -> la ligne "Signée par {nom}"
// n'affiche le nom QUE si un event le portait (champ optionnel ProposalEventDto.signerName) ; sinon
// "Signée" seule (pas de fabrication). Voir SUMMARY (déviation contrat).

// Limite d'affichage avant de replier les consultations excédentaires (05-UI-SPEC : ~8).
const MAX_VISIBLE = 8;

// Palette d'icône + label par type de ligne (05-UI-SPEC §Timeline event palette). SENT/SIGNED portent
// la hue de milestone (bleu/vert), OPENED/VIEWED restent neutres (activité passive du client).
const EVENT_META: Record<TimelineRowType, { icon: LucideIcon; tint: string; label: string }> = {
  SENT: { icon: Send, tint: "text-blue-600", label: "Envoyée" },
  OPENED: { icon: Mail, tint: "text-slate-500", label: "Ouverte" },
  VIEWED: { icon: Eye, tint: "text-slate-500", label: "Vue" },
  SIGNED: { icon: CheckCircle2, tint: "text-green-600", label: "Signée" },
};

interface ProposalTimelineProps {
  proposalId: string;
  status: ProposalStatus;
}

export function ProposalTimeline({ proposalId, status }: ProposalTimelineProps) {
  // On ne charge la timeline que dès que la proposition est partie (SENT/SIGNED) ; en DRAFT, l'empty
  // state suffit (pas d'appel réseau inutile).
  const enabled = status !== "DRAFT";
  const { data, isPending, isError, refetch } = useProposalEvents(proposalId, enabled);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex h-10 items-center border-b border-slate-200 px-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suivi</span>
      </div>
      <TimelineBody
        status={status}
        events={data}
        loading={enabled && isPending}
        error={enabled && isError}
        onRetry={() => refetch()}
      />
    </div>
  );
}

function TimelineBody({
  status,
  events,
  loading,
  error,
  onRetry,
}: {
  status: ProposalStatus;
  events: ProposalEventLike[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  // Empty : la proposition n'est pas encore envoyée (DRAFT).
  if (status === "DRAFT") {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-600">Pas encore envoyée.</p>
        <p className="mt-1 text-slate-500">Envoyez la proposition pour suivre son ouverture.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm text-red-600">Impossible de charger le suivi.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      </div>
    );
  }

  const rows = buildRows(events ?? [], status);

  if (rows.length === 0) {
    // SENT mais aucun event encore matérialisé (rare) : ligne neutre plutôt qu'un panneau vide.
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        <p>Aucune activité pour l'instant.</p>
      </div>
    );
  }

  // Repli des consultations excédentaires (au-delà de MAX_VISIBLE) : on garde les plus récentes.
  const { visible, overflow } = splitOverflow(rows, MAX_VISIBLE);

  return (
    <div className="py-2">
      {overflow > 0 && (
        <p className="px-4 py-2 text-xs text-slate-500">+ {overflow} autres consultations</p>
      )}
      {visible.map((row) => (
        <TimelineEventRow key={row.key} row={row} />
      ))}
    </div>
  );
}

function TimelineEventRow({ row }: { row: TimelineRow }) {
  const meta = EVENT_META[row.type];
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-2 px-4 py-2">
      <div className="flex flex-col items-center">
        <Icon className={cn("h-4 w-4", meta.tint)} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
        <p className="text-sm text-slate-500">{formatTimestamp(row.occurredAt)}</p>
        {row.type === "SIGNED" && row.signerName ? (
          <p className="text-sm text-slate-900">Signée par {row.signerName}</p>
        ) : null}
      </div>
    </div>
  );
}
