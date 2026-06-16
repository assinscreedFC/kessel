import { useState } from "react";
import { Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { ClientOrgDialog } from "@/features/create-client-org/ui/client-org-dialog";
import { useClientOrgs } from "@/entities/client-org/api";

// Page /organisations (couche `pages`). CRM-05 : liste des organisations clientes + création.
// Row click -> vue 360 /organisations/:id. Empty state Building2 + CTA.

const SKELETON_ROWS = 4;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function OrganisationsPage() {
  const navigate = useNavigate();
  const { data: orgs, isPending, isError, refetch } = useClientOrgs();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Organisations</h1>
        <Button onClick={() => setDialogOpen(true)}>Nouvelle organisation</Button>
      </header>

      <TableContainer>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : orgs.length === 0 ? (
          <EmptyState onCreate={() => setDialogOpen(true)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Date création</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow
                  key={org.id}
                  className="h-11 cursor-pointer hover:bg-slate-50"
                  onClick={() => navigate(`/organisations/${org.id}`)}
                >
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-slate-500">
                    {dateFormatter.format(new Date(org.createdAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <ClientOrgDialog open={dialogOpen} onOpenChange={setDialogOpen} />
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
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Building2 className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">Aucune organisation pour l'instant</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Créez votre première organisation cliente pour regrouper contacts et deals.
      </p>
      <Button onClick={onCreate} className="mt-1">
        Nouvelle organisation
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
