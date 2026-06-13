import { Brain } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { useOutcomes } from "@/entities/outcome/api";
import { OUTCOME_KIND_META } from "@/entities/outcome/status";

// Page Dataset (couche `pages`). Vue READ-ONLY du jeu de données d'apprentissage de l'org : la liste
// des propositions résolues (gagné/perdu) avec leur CONTEXTE comme matière d'apprentissage (AI-01,
// critère 2). Alimentée par GET /api/outcomes (useOutcomes, TanStack Query). 4 états (loading / empty /
// error / data) — même pattern que la page Deals. AUCUNE action d'écriture sur cette page (le flywheel
// s'alimente seul : WON à la signature, LOST via "Marquer comme perdu" sur un deal — Task 2).
//
// RGPD (T-6-pii) : le `context` est une WHITELIST non-identifiante (montant/comptes/raison). On
// n'affiche AUCUNE donnée identifiante client — le contrat partagé n'en contient pas.

const SKELETON_ROWS = 6;

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

function formatAmount(amount: string): string {
  const n = Number(amount);
  return Number.isNaN(n) ? "—" : amountFormatter.format(n);
}

export function DatasetPage() {
  const { data: outcomes, isPending, isError, refetch } = useOutcomes();

  return (
    <div>
      <header className="mb-2 flex items-center gap-2">
        <Brain className="h-5 w-5 text-slate-400" />
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Dataset d'apprentissage
        </h1>
      </header>
      <p className="mb-8 max-w-2xl text-sm text-slate-500">
        Chaque proposition résolue (signée ou marquée perdue) enrichit ce jeu de données. Il calibre
        l'IA sur vos succès passés — aucune saisie dédiée, il grossit à chaque deal résolu.
      </p>

      <TableContainer>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : outcomes.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proposition</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">Lignes</TableHead>
                <TableHead>Raison</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outcomes.map((outcome) => {
                const meta = OUTCOME_KIND_META[outcome.outcome];
                return (
                  <TableRow key={outcome.proposalId} className="h-11">
                    <TableCell className="font-medium">{outcome.proposalTitle}</TableCell>
                    <TableCell>
                      <Badge className={meta.badge}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {dateFormatter.format(new Date(outcome.decidedAt))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(outcome.context.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {outcome.context.lineCount}
                    </TableCell>
                    <TableCell className="text-slate-500">{outcome.reason ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>
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
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Brain className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">
        Aucune proposition résolue pour l'instant
      </h2>
      <p className="max-w-sm text-sm text-slate-500">
        Signez une proposition ou marquez un deal perdu — le jeu de données se remplira
        automatiquement.
      </p>
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
