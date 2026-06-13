import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Briefcase, MoreHorizontal, Sparkles, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { DealDialog } from "@/features/create-deal/ui/deal-dialog";
import { MarkLostDialog } from "@/features/mark-deal-lost/ui/mark-lost-dialog";
import {
  BriefDialog,
  type LockedDeal,
} from "@/features/generate-proposal/ui/brief-dialog";
import { useDeals } from "@/entities/deal/api";
import { DEAL_STATUS_META } from "@/entities/deal/status";
import { DEAL_STATUS_VALUES, type Deal, type DealStatus } from "@/entities/deal/model";
import { useContacts } from "@/entities/contact/api";

// Page Deals (couche `pages`). Couvre CRM-02/03 côté front (02-UI-SPEC) : table dense (badges statut
// colorés, amount tabular-nums, date), filtre segmented (Tabs) PERSISTÉ EN URL via useSearchParams ->
// pilote la queryKey de useDeals -> refetch SERVEUR GET /api/deals?status=. 4 états + empty filtré
// (statut sans deal -> "Aucun deal avec ce statut" SANS CTA, distinct du no-data empty). Dialog create/edit.

const SKELETON_ROWS = 5;
const ALL_TAB = "ALL";

// amount string au boundary (Pitfall 2) : parsé UNIQUEMENT pour l'affichage, jamais pour recalcul.
const amountFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatAmount(amount: string | null): string {
  if (amount == null) return "—";
  const n = Number(amount);
  return Number.isNaN(n) ? "—" : amountFormatter.format(n);
}

function isDealStatus(value: string | null): value is DealStatus {
  return value != null && (DEAL_STATUS_VALUES as string[]).includes(value);
}

// Un deal RÉSOLU (gagné ou perdu) n'expose pas l'action "Marquer comme perdu" : un deal gagné ne se
// perd pas, un deal déjà perdu n'a pas à être re-marqué (l'outcome est déjà enregistré côté serveur).
function isResolved(status: DealStatus): boolean {
  return status === "WON" || status === "LOST";
}

export function DealsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  // Statut courant : valide -> filtre serveur ; sinon (absent/invalide) -> "Tous" (pas de param).
  const activeStatus = isDealStatus(statusParam) ? statusParam : undefined;

  const { data: deals, isPending, isError, refetch } = useDeals(activeStatus);
  const { data: contacts } = useContacts();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  // Deal ancré du flux de génération IA (brief-dialog ouvert avec le deal verrouillé).
  const [briefDeal, setBriefDeal] = useState<LockedDeal | null>(null);
  // Deal ciblé par l'action "Marquer comme perdu" (Dialog ouvert avec raison optionnelle).
  const [losingDeal, setLosingDeal] = useState<Deal | null>(null);

  // Résolution contactId -> nom côté web (le DealDto ne porte pas le nom du contact ; on ne modifie
  // pas le contrat serveur Plan 02). Map mémoïsée sur les contacts chargés.
  const contactNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const contact of contacts ?? []) map.set(contact.id, contact.name);
    return map;
  }, [contacts]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (deal: Deal) => {
    setEditing(deal);
    setDialogOpen(true);
  };

  const onTabChange = (value: string) => {
    // "Tous" -> retire le param (URL propre, GET /api/deals sans filtre) ; sinon ?status=X (persistance URL).
    if (value === ALL_TAB) {
      setSearchParams({});
    } else {
      setSearchParams({ status: value });
    }
  };

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Deals</h1>
        <Button onClick={openCreate}>Nouveau deal</Button>
      </header>

      <Tabs value={activeStatus ?? ALL_TAB} onValueChange={onTabChange} className="mb-6">
        <TabsList>
          <TabsTrigger value={ALL_TAB}>Tous</TabsTrigger>
          {DEAL_STATUS_VALUES.map((status) => (
            <TabsTrigger key={status} value={status}>
              {DEAL_STATUS_META[status].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <TableContainer>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : deals.length === 0 ? (
          activeStatus ? (
            <FilteredEmptyState />
          ) : (
            <EmptyState onCreate={openCreate} />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Proposition</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.map((deal) => {
                const meta = DEAL_STATUS_META[deal.status];
                return (
                  <TableRow
                    key={deal.id}
                    className="h-11 cursor-pointer hover:bg-slate-50"
                    onClick={() => openEdit(deal)}
                  >
                    <TableCell className="font-medium">{deal.title}</TableCell>
                    <TableCell className="text-slate-500">
                      {contactNameById.get(deal.contactId) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={meta.badge}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(deal.amount)}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {dateFormatter.format(new Date(deal.createdAt))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBriefDeal({
                            id: deal.id,
                            title: deal.title,
                            contactName: contactNameById.get(deal.contactId) ?? null,
                          });
                        }}
                      >
                        <Sparkles className="mr-2 h-3.5 w-3.5 text-slate-500" />
                        Nouvelle proposition depuis un brief
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Action par ligne : visible uniquement pour les deals NON résolus (un deal
                          gagné ne se perd pas ; un deal déjà perdu n'est pas re-marqué). */}
                      {!isResolved(deal.status) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Actions du deal"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4 text-slate-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              destructive
                              onSelect={() => setLosingDeal(deal)}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Marquer comme perdu
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <DealDialog open={dialogOpen} onOpenChange={setDialogOpen} deal={editing} />

      {/* "Marquer comme perdu" (AI-01 critère 3) : réutilise le geste deal->LOST (PATCH /deals/:id),
          enregistre un ProposalOutcome(LOST) serveur et invalide ["outcomes"] -> le dataset reflète
          immédiatement la perte (sans saisie dédiée). */}
      <MarkLostDialog
        open={losingDeal !== null}
        onOpenChange={(open) => {
          if (!open) setLosingDeal(null);
        }}
        deal={losingDeal}
      />

      {/* Génération IA deal-ancrée : deal VERROUILLÉ (ligne statique, pas un Select). 503 -> on dirige
          vers la liste propositions où le chemin manuel reste proéminent (jamais d'écran blanc). */}
      <BriefDialog
        open={briefDeal !== null}
        onOpenChange={(open) => {
          if (!open) setBriefDeal(null);
        }}
        lockedDeal={briefDeal ?? undefined}
        onWriteManually={() => navigate("/proposals")}
      />
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
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Briefcase className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">Aucun deal pour l'instant</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Créez un deal rattaché à un contact pour suivre vos opportunités.
      </p>
      <Button onClick={onCreate} className="mt-1">
        Nouveau deal
      </Button>
    </div>
  );
}

function FilteredEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Briefcase className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">Aucun deal avec ce statut</h2>
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
