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
import { useRevokeApiKey } from "@/entities/api-key/api";
import type { ApiKeyDto } from "@/entities/api-key/model";

// RevokeKeyDialog — confirmation AlertDialog avant révocation d'une clé API (API-01).
// Action destructive : bouton "Révoquer" en rouge, référence le préfixe de la clé.

interface RevokeKeyDialogProps {
  apiKey: ApiKeyDto | null;
  onOpenChange: (open: boolean) => void;
}

export function RevokeKeyDialog({ apiKey, onOpenChange }: RevokeKeyDialogProps) {
  const { mutate: revoke, isPending } = useRevokeApiKey(() => onOpenChange(false));

  function handleRevoke() {
    if (!apiKey) return;
    revoke(apiKey.id);
  }

  return (
    <AlertDialog open={apiKey !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Révoquer cette clé ?</AlertDialogTitle>
          <AlertDialogDescription>
            La clé{" "}
            <code className="font-mono">{apiKey?.prefix}</code>{" "}
            sera révoquée immédiatement. Toutes les intégrations utilisant cette clé cesseront de
            fonctionner.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRevoke}
            disabled={isPending}
            className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          >
            {isPending ? "Révocation…" : "Révoquer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
