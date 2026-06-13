import { useNavigate } from "react-router-dom";
import { FolderOpen } from "lucide-react";
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
import { useProjects } from "@/entities/project/api";
import { PROJECT_STATUS_META } from "@/entities/project/status";

// Page Projets (couche `pages`). Couvre SC4 : liste /projects (titre, statut badge, budget).
// Pattern identique à deals-page : header h1, TableContainer, 4 états (loading/error/empty/data).
// Pas de filtre ni de CTA "Nouveau projet" — les projets sont créés automatiquement à la signature.
// Clic sur ligne → /projects/:id (navigate, pas de dialog).

const SKELETON_ROWS = 5;

const budgetFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatBudget(total: string, currency: string): string {
  const n = Number(total);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects, isPending, isError, refetch } = useProjects();

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Projets</h1>
      </header>

      <TableContainer>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : projects.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead>Deal source</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const meta = PROJECT_STATUS_META[project.status];
                return (
                  <TableRow
                    key={project.id}
                    className="h-11 cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <TableCell className="font-medium">{project.title}</TableCell>
                    <TableCell>
                      <Badge className={meta.badge}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBudget(
                        project.budgetSnapshot.total,
                        project.budgetSnapshot.currency,
                      )}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {project.dealId ?? "—"}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {dateFormatter.format(new Date(project.createdAt))}
                    </TableCell>
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
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <FolderOpen className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">Aucun projet pour l&apos;instant</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Les projets sont créés automatiquement à la signature d&apos;une proposition.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm font-semibold text-red-600">Impossible de charger les projets.</p>
      <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      <Button variant="outline" onClick={onRetry} className="mt-1">
        Réessayer
      </Button>
    </div>
  );
}
