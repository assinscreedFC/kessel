import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { KanbanColumn } from "@/shared/ui/kanban-column";
import { DealCard, DealCardOverlay } from "@/shared/ui/deal-card";
import { Skeleton } from "@/shared/ui/skeleton";
import { Button } from "@/shared/ui/button";
import { useDeals, useMoveDeal } from "@/entities/deal/api";
import { DEAL_STATUS_VALUES, type Deal, type DealStatus } from "@/entities/deal/model";
import { useContacts } from "@/entities/contact/api";

// PipelinePage — kanban 4 colonnes (CRM-04, UI-SPEC §CRM-04).
// DndContext(PointerSensor + KeyboardSensor) -> accessibilité clavier out-of-the-box.
// Cross-column drop : over.id est soit un DealStatus (colonne vide droppée) soit un deal.id ;
//   on détermine le status cible en cherchant le deal survolé dans dealsByStatus.
// Move optimiste via useMoveDeal (rollback + toast.error sur erreur API).
// DragOverlay : clone visuel du card actif pendant le drag.

const SKELETON_COUNT = 3;

// Résolution contactId -> nom (même pattern que DealsPage)
function useContactNameMap() {
  const { data: contacts } = useContacts();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts ?? []) map.set(c.id, c.name);
    return map;
  }, [contacts]);
}

// Grouper les deals par statut, triés par position ascendante
function groupByStatus(deals: Deal[]): Record<DealStatus, Deal[]> {
  const groups: Record<DealStatus, Deal[]> = {
    LEAD: [],
    PROPOSAL_SENT: [],
    WON: [],
    LOST: [],
  };
  for (const deal of deals) {
    groups[deal.status].push(deal);
  }
  for (const status of DEAL_STATUS_VALUES) {
    groups[status].sort((a, b) => a.position - b.position);
  }
  return groups;
}

export function PipelinePage() {
  const { data: deals, isPending, isError, refetch } = useDeals();
  const contactNameMap = useContactNameMap();
  const moveDeal = useMoveDeal();

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dealsByStatus = useMemo(
    () => groupByStatus(deals ?? []),
    [deals],
  );

  // Deal actif pour le DragOverlay
  const activeDeal = useMemo(
    () => (activeId ? (deals ?? []).find((d) => d.id === activeId) ?? null : null),
    [activeId, deals],
  );

  // Map id deal -> status (pour retrouver la colonne d'un deal survolé)
  const dealStatusMap = useMemo(() => {
    const map = new Map<string, DealStatus>();
    for (const deal of deals ?? []) map.set(deal.id, deal.status);
    return map;
  }, [deals]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedId = String(active.id);
    const overId = String(over.id);

    // Déterminer la colonne destination (Pitfall 5 cross-column) :
    // - Si over.id est un DealStatus (colonne droppable) → status destination = over.id
    // - Sinon over.id est un deal.id → status destination = status de ce deal
    const destStatus: DealStatus = (DEAL_STATUS_VALUES as string[]).includes(overId)
      ? (overId as DealStatus)
      : (dealStatusMap.get(overId) ?? (dealStatusMap.get(draggedId) as DealStatus));

    const destColumn = dealsByStatus[destStatus];

    // Calculer la position cible dans la colonne destination
    let position: number;
    if ((DEAL_STATUS_VALUES as string[]).includes(overId)) {
      // Dropped onto column itself (empty or header) → fin de colonne
      position = destColumn.filter((d) => d.id !== draggedId).length;
    } else {
      // Dropped onto another deal → insérer à sa position
      const overIndex = destColumn.findIndex((d) => d.id === overId);
      const filteredLen = destColumn.filter((d) => d.id !== draggedId).length;
      position = Math.max(0, Math.min(overIndex >= 0 ? overIndex : filteredLen, filteredLen));
    }

    // Ne rien faire si le deal n'a pas bougé
    const dragged = deals?.find((d) => d.id === draggedId);
    if (dragged && dragged.status === destStatus && dragged.position === position) return;

    moveDeal.mutate({ id: draggedId, status: destStatus, position });
  }

  if (isPending) {
    return <PipelineLoadingState />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm font-semibold text-red-600">
          Impossible de charger le pipeline.
        </p>
        <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
        <Button variant="outline" onClick={() => refetch()} className="mt-1">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Pipeline</h1>
      </header>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {DEAL_STATUS_VALUES.map((status) => {
            const column = dealsByStatus[status];
            const ids = column.map((d) => d.id);

            return (
              <KanbanColumn key={status} status={status} count={column.length}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {column.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      contactName={contactNameMap.get(deal.contactId)}
                    />
                  ))}
                </SortableContext>
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeDeal ? (
            <DealCardOverlay
              deal={activeDeal}
              contactName={contactNameMap.get(activeDeal.contactId)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function PipelineLoadingState() {
  return (
    <div>
      <header className="mb-8">
        <Skeleton className="h-7 w-32" />
      </header>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {DEAL_STATUS_VALUES.map((status) => (
          <div key={status} className="w-[272px] shrink-0">
            <div className="mb-3 flex items-center gap-2 px-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-slate-50/50 p-3">
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
