import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Deal } from "@/entities/deal/model";

// DealCard — composant draggable pour le kanban pipeline (CRM-04).
// Utilise useSortable(@dnd-kit/sortable) : spread attributes+listeners sur le conteneur,
// transform CSS pour l'animation de déplacement, opacity réduite pendant le drag.
// Badge ClientOrg violet (bg-violet-100 text-violet-700) affiché uniquement si clientOrgId renseigné
// (UI-SPEC — badge réservé exclusivement à l'organisation cliente).

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

function formatAmount(amount: string | null): string {
  if (amount == null) return "—";
  const n = Number(amount);
  return Number.isNaN(n) ? "—" : amountFormatter.format(n);
}

interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
  contactName?: string | null;
  orgName?: string | null;
}

export function DealCard({ deal, isDragging = false, contactName, orgName }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragging = isDragging || isSortableDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        "bg-white rounded-lg border border-slate-200 p-3 shadow-sm cursor-grab active:cursor-grabbing select-none",
        dragging ? "opacity-50 shadow-lg scale-105" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Line 1: titre tronqué */}
      <p className="text-sm font-semibold text-slate-900 truncate">{deal.title}</p>

      {/* Line 2: nom du contact */}
      {contactName && (
        <p className="mt-0.5 text-xs text-slate-500 truncate">{contactName}</p>
      )}

      {/* Line 3: montant + badge ClientOrg */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="tabular-nums text-xs text-slate-700">{formatAmount(deal.amount)}</span>
        {deal.clientOrgId && orgName && (
          <span className="bg-violet-100 text-violet-700 text-xs rounded px-1.5 py-0.5 truncate max-w-[120px]">
            {orgName}
          </span>
        )}
      </div>
    </div>
  );
}

// Variante overlay : utilisée dans DragOverlay (pas de ref sortable, juste le style visuel).
export function DealCardOverlay({
  deal,
  contactName,
  orgName,
}: {
  deal: Deal;
  contactName?: string | null;
  orgName?: string | null;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xl opacity-90 cursor-grabbing select-none scale-105">
      <p className="text-sm font-semibold text-slate-900 truncate">{deal.title}</p>
      {contactName && (
        <p className="mt-0.5 text-xs text-slate-500 truncate">{contactName}</p>
      )}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="tabular-nums text-xs text-slate-700">{formatAmount(deal.amount)}</span>
        {deal.clientOrgId && orgName && (
          <span className="bg-violet-100 text-violet-700 text-xs rounded px-1.5 py-0.5 truncate max-w-[120px]">
            {orgName}
          </span>
        )}
      </div>
    </div>
  );
}
