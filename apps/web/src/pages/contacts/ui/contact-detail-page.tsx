import { useParams } from "react-router-dom";
import { Skeleton } from "@/shared/ui/skeleton";
import { Badge } from "@/shared/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { useContactOverview } from "@/entities/client-org/api";
import { ActivityTimeline } from "@/features/deal-activity/ui/activity-timeline";
import type { OverviewDealDto, OverviewProposalDto, OverviewProjectDto } from "@kessel/shared";

// Vue 360 d'un contact (/contacts/:id). CRM-07.
// Header nom + email + badge ClientOrg violet (si rattaché).
// 3 sections agrégées (Deals / Propositions / Projets) + section Activité.
// Section Activité : ActivityTimeline montée sur le deal le plus récent du contact.
// Si le contact n'a aucun deal : empty-state (pas de montage ActivityTimeline, pas de crash).
// dealId calculé = deals[0]?.id (serveur retourne les deals ordonnés par createdAt desc).

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

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: overview, isPending, isError } = useContactOverview(id ?? "");

  if (isPending) {
    return <LoadingState />;
  }

  if (isError || !overview) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm font-semibold text-red-600">Impossible de charger les données.</p>
        <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      </div>
    );
  }

  const { contact, deals, proposals, projects } = overview;

  // Calcul du deal le plus récent (serveur retourne deals ordonnés par createdAt desc, donc index 0).
  // NE PAS passer undefined ni un dealId hardcodé à ActivityTimeline.
  const mostRecentDealId = deals[0]?.id ?? null;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{contact.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-slate-500">{contact.email}</span>
          {contact.clientOrgId && (
            <Badge className="bg-violet-100 text-violet-700">Organisation</Badge>
          )}
        </div>
      </header>

      {/* Section Deals */}
      <section>
        <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Deals associés</h2>
        <TableContainer>
          {deals.length === 0 ? (
            <EmptySectionState />
          ) : (
            <DealsTable deals={deals} />
          )}
        </TableContainer>
      </section>

      {/* Section Propositions */}
      <section>
        <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Propositions</h2>
        <TableContainer>
          {proposals.length === 0 ? (
            <EmptySectionState />
          ) : (
            <ProposalsTable proposals={proposals} />
          )}
        </TableContainer>
      </section>

      {/* Section Projets */}
      <section>
        <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Projets</h2>
        <TableContainer>
          {projects.length === 0 ? (
            <EmptySectionState />
          ) : (
            <ProjectsTable projects={projects} />
          )}
        </TableContainer>
      </section>

      {/* Section Activité — ActivityTimeline du deal le plus récent.
          mostRecentDealId null = contact sans deal = empty-state ; pas de crash, pas d'appel /deals/undefined/activities. */}
      <section>
        <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Activité</h2>
        {mostRecentDealId !== null ? (
          <ActivityTimeline dealId={mostRecentDealId} />
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">
            Aucun deal — ajoutez un deal pour suivre les activités.
          </p>
        )}
      </section>
    </div>
  );
}

function DealsTable({ deals }: { deals: OverviewDealDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titre</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="text-right">Montant</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((deal) => (
          <TableRow key={deal.id} className="h-10">
            <TableCell className="font-medium">{deal.title}</TableCell>
            <TableCell className="text-slate-500">{deal.status}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAmount(deal.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProposalsTable({ proposals }: { proposals: OverviewProposalDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titre</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {proposals.map((p) => (
          <TableRow key={p.id} className="h-10">
            <TableCell className="font-medium">{p.title}</TableCell>
            <TableCell className="text-slate-500">{p.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProjectsTable({ projects }: { projects: OverviewProjectDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titre</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((p) => (
          <TableRow key={p.id} className="h-10">
            <TableCell className="font-medium">{p.title}</TableCell>
            <TableCell className="text-slate-500">{p.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EmptySectionState() {
  return (
    <p className="py-4 text-center text-sm text-slate-400">Aucun élément</p>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
