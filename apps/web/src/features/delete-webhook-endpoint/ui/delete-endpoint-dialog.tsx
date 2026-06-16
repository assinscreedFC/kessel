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
import { useDeleteEndpoint } from "@/entities/webhook-endpoint/api";
import type { WebhookEndpointDto } from "@/entities/webhook-endpoint/model";

// DeleteEndpointDialog — confirmation AlertDialog avant suppression d'un webhook endpoint.
// Action destructive irréversible — les livraisons en cours sont abandonnées.

interface DeleteEndpointDialogProps {
  endpoint: WebhookEndpointDto | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteEndpointDialog({ endpoint, onOpenChange }: DeleteEndpointDialogProps) {
  const { mutate: deleteEndpoint, isPending } = useDeleteEndpoint(() => onOpenChange(false));

  function handleDelete() {
    if (!endpoint) return;
    deleteEndpoint(endpoint.id);
  }

  return (
    <AlertDialog open={endpoint !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cet endpoint ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les livraisons en cours seront abandonnées. Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          >
            {isPending ? "Suppression…" : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
