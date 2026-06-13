import { useState } from "react";
import { MoreHorizontal, Tag } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { PricingItemDialog } from "@/features/create-pricing-item/ui/pricing-item-dialog";
import {
  usePricingItems,
  useDeletePricingItem,
} from "@/entities/pricing-item/api";
import type { PricingItem } from "@/entities/pricing-item/model";

// Page Tarifs (couche `pages`). Couvre PROP-03 côté front (03-UI-SPEC "Pricing Grid page") :
// table dense (Prestation / Unité muted / Prix unitaire right tabular-nums EUR), row cliquable ->
// Dialog edit, 4 états obligatoires. Suppression via AlertDialog snapshot-rassurant ("Les devis
// existants ne sont pas affectés (valeurs figées)") déclenchée depuis un DropdownMenu de ligne.
// Réutilise VERBATIM le pattern Data Table + Create/Edit Dialog de Phase 2.

const SKELETON_ROWS = 5;

// unitPrice string au boundary (Pitfall 2) : parsé UNIQUEMENT pour l'affichage, jamais pour recalcul.
const priceFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

function formatPrice(unitPrice: string): string {
  const n = Number(unitPrice);
  return Number.isNaN(n) ? "—" : priceFormatter.format(n);
}

export function PricingPage() {
  const { data: items, isPending, isError, refetch } = usePricingItems();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PricingItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PricingItem | null>(null);

  const deleteItem = useDeletePricingItem(() => setPendingDelete(null));

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (item: PricingItem) => {
    setEditing(item);
    setDialogOpen(true);
  };

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Tarifs</h1>
        <Button onClick={openCreate}>Nouveau tarif</Button>
      </header>

      <TableContainer>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prestation</TableHead>
                <TableHead>Unité</TableHead>
                <TableHead className="text-right">Prix unitaire</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className="h-11 cursor-pointer hover:bg-slate-50"
                  onClick={() => openEdit(item)}
                >
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-slate-500">{item.unit ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(item.unitPrice)}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          aria-label="Actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(item)}>
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          destructive
                          onSelect={() => setPendingDelete(item)}
                        >
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <PricingItemDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} />

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce tarif ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les devis existants ne sont pas affectés (valeurs figées).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" disabled={deleteItem.isPending}>
                Annuler
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                className={cn("bg-red-600 text-white hover:bg-red-600/90")}
                disabled={deleteItem.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (pendingDelete) deleteItem.mutate(pendingDelete.id);
                }}
              >
                {deleteItem.isPending ? "Suppression…" : "Supprimer"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LoadingState() {
  return (
    <div>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div
          key={i}
          className="flex h-11 items-center gap-4 border-b border-slate-100 px-4 last:border-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Tag className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">Aucun tarif pour l'instant</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Définissez vos prestations et leurs prix pour chiffrer plus vite.
      </p>
      <Button onClick={onCreate} className="mt-1">
        Nouveau tarif
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm font-semibold text-red-600">Impossible de charger les données.</p>
      <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      <Button variant="outline" onClick={onRetry} className="mt-1">
        Réessayer
      </Button>
    </div>
  );
}
