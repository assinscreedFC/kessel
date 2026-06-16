import { useDroppable } from "@dnd-kit/core";
import type { DealStatus } from "@/entities/deal/model";
import { DEAL_STATUS_META } from "@/entities/deal/status";

// KanbanColumn — colonne droppable du pipeline kanban (CRM-04).
// Utilise useDroppable(@dnd-kit/core) avec id = DealStatus (Pitfall 5 cross-column) :
// l'id de la droppable est la valeur du statut, ce qui permet à onDragEnd de déterminer
// la colonne destination via over.id directement (pas besoin de lookup intermédiaire).
// Drop highlight : ring-2 ring-slate-200 quand un card survole la colonne.
// Empty state : dashed border (UI-SPEC) quand la colonne n'a aucun deal.

interface KanbanColumnProps {
  status: DealStatus;
  count: number;
  children?: React.ReactNode;
}

export function KanbanColumn({ status, count, children }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const meta = DEAL_STATUS_META[status];
  const isEmpty = count === 0;

  return (
    <div
      className="flex w-[272px] shrink-0 flex-col gap-0"
      style={{ minWidth: 272 }}
    >
      {/* Header colonne */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {count}
        </span>
      </div>

      {/* Body droppable */}
      <div
        ref={setNodeRef}
        className={[
          "flex min-h-[200px] flex-col gap-2 rounded-lg p-3 transition-colors",
          isOver ? "bg-slate-50 ring-2 ring-slate-200" : "bg-slate-50/50",
          isEmpty ? "border-2 border-dashed border-slate-200" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center py-6">
            <span className="text-sm text-slate-400">Aucun deal dans cette colonne</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
