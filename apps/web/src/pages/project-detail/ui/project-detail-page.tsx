import { useNavigate, useParams } from "react-router-dom";
import { Skeleton } from "@/shared/ui/skeleton";
import { TableContainer } from "@/shared/ui/table";
import { useProject, useProjectTasks } from "@/entities/project/api";
import { TaskItem } from "@/features/manage-tasks/ui/task-item";
import { ProjectStatusControl } from "@/features/update-project-status/ui/project-status-control";
import { PaymentStatusSection } from "./payment-status-section";

// Page Détail Projet (couche `pages`). Couvre SC4/SC5 : budget figé + liste de tâches optimistic.
// Layout : lien retour, header (titre + ProjectStatusControl), ligne budget, tableau tâches.
// Budget figé : immuable après signature (BudgetSnapshot), affiché en text-sm text-slate-500.
// Tâches : TaskItem avec optimistic toggle (SC5 — pas de rechargement complet).

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const SKELETON_TASKS = 3;

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isPending: projectPending } = useProject(id!);
  const { data: tasks, isPending: tasksPending } = useProjectTasks(id!);

  return (
    <div>
      {/* Lien retour */}
      <button
        onClick={() => navigate("/projects")}
        className="mb-6 text-sm text-slate-500 hover:text-slate-900"
      >
        ← Projets
      </button>

      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        {projectPending ? (
          <Skeleton className="h-7 w-64" />
        ) : (
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {project?.title}
          </h1>
        )}
        {project && <ProjectStatusControl project={project} />}
      </header>

      {/* Budget figé */}
      {projectPending ? (
        <Skeleton className="mb-6 h-4 w-80" />
      ) : project ? (
        <p className="mb-6 text-sm text-slate-500">
          Budget figé :{" "}
          {formatBudget(
            project.budgetSnapshot.total,
            project.budgetSnapshot.currency,
          )}{" "}
          · Signé le{" "}
          {dateFormatter.format(new Date(project.budgetSnapshot.signedAt))}
        </p>
      ) : null}

      {/* Section paiements (PAY-05) — acompte/solde avec badge statut */}
      {project && <PaymentStatusSection payments={project.payments ?? []} />}

      {/* Liste de tâches */}
      <TableContainer>
        {tasksPending ? (
          <LoadingTasks />
        ) : (
          tasks?.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              projectId={id!}
              projectStatus={project?.status ?? "ACTIVE"}
            />
          ))
        )}
      </TableContainer>
    </div>
  );
}

function formatBudget(total: string, currency: string): string {
  const n = Number(total);
  if (Number.isNaN(n)) return total;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function LoadingTasks() {
  return (
    <div>
      {Array.from({ length: SKELETON_TASKS }).map((_, i) => (
        <div
          key={i}
          className="flex h-11 items-center gap-3 border-b border-slate-100 px-4 last:border-0"
        >
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-64" />
        </div>
      ))}
    </div>
  );
}
