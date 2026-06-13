import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
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
import { useUpdateProjectStatus } from "@/entities/project/api";
import { PROJECT_STATUS_META } from "@/entities/project/status";
import type { Project } from "@/entities/project/model";

// ProjectStatusControl — couche `features/update-project-status` (FSD).
//
// Si ACTIVE  → DropdownMenu (trigger bouton) avec 2 items de transition :
//   - "Marquer comme terminé" → ouvre AlertDialog de confirmation COMPLETED
//   - "Annuler le projet"     → ouvre AlertDialog de confirmation CANCELLED (destructive)
//   Chaque item ouvre son propre AlertDialog avant d'envoyer le PATCH.
//
// Si COMPLETED ou CANCELLED → Badge statut seul (read-only, pas de contrôle).
//
// Le statut est irréversible (CONTEXT.md) : pas d'optimistic update (refetch serveur après succès).
// Copy exacte 02-UI-SPEC §Copywriting.

type PendingStatus = "COMPLETED" | "CANCELLED" | null;

interface ProjectStatusControlProps {
  project: Project;
}

export function ProjectStatusControl({ project }: ProjectStatusControlProps) {
  const [pendingStatus, setPendingStatus] = useState<PendingStatus>(null);
  const { mutate: updateStatus, isPending } = useUpdateProjectStatus(project.id);
  const meta = PROJECT_STATUS_META[project.status];

  if (project.status !== "ACTIVE") {
    return <Badge className={meta.badge}>{meta.label}</Badge>;
  }

  const handleConfirm = () => {
    if (pendingStatus) {
      updateStatus({ status: pendingStatus }, { onSettled: () => setPendingStatus(null) });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Badge className={meta.badge}>{meta.label}</Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setPendingStatus("COMPLETED")}>
            Marquer comme terminé
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => setPendingStatus("CANCELLED")}>
            Annuler le projet
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog COMPLETED */}
      <AlertDialog
        open={pendingStatus === "COMPLETED"}
        onOpenChange={(open) => { if (!open) setPendingStatus(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminer le projet ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le projet sera marqué comme terminé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm">Revenir</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button size="sm" disabled={isPending} onClick={handleConfirm}>
                Terminer
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog CANCELLED */}
      <AlertDialog
        open={pendingStatus === "CANCELLED"}
        onOpenChange={(open) => { if (!open) setPendingStatus(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler le projet ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le projet sera marqué comme annulé et ne pourra plus être modifié.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm">Revenir</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                size="sm"
                disabled={isPending}
                className="text-red-600 hover:text-red-600"
                variant="outline"
                onClick={handleConfirm}
              >
                Annuler le projet
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
