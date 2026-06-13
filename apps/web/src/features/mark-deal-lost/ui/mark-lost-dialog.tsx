import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";
import {
  markLostFormSchema,
  type Deal,
  type MarkLostFormValues,
} from "@/entities/deal/model";
import { useMarkDealLost } from "@/entities/deal/api";

// Dialog "Marquer comme perdu" (feature `mark-deal-lost`, AI-01 critère 3). RÉUTILISE le geste métier
// existant : PATCH /deals/:id status=LOST (via useMarkDealLost) — PAS une saisie dédiée au flywheel.
// La raison est OPTIONNELLE (Textarea, max 2000 en miroir du DTO serveur) : vide -> envoyée undefined,
// le serveur enregistre l'outcome LOST avec reason null (discrétion respectée). Action destructive
// (bouton rouge). onSuccess close + invalidate ["deals"] + ["outcomes"] (le dataset se rafraîchit).

interface MarkLostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
}

export function MarkLostDialog({ open, onOpenChange, deal }: MarkLostDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MarkLostFormValues>({
    resolver: zodResolver(markLostFormSchema),
    mode: "onBlur",
    defaultValues: { reason: "" },
  });

  // Réinitialiser le champ raison à chaque ouverture (ne pas conserver la saisie d'un deal précédent).
  useEffect(() => {
    if (open) reset({ reason: "" });
  }, [open, reset]);

  const close = () => onOpenChange(false);
  const markLost = useMarkDealLost(deal?.id ?? "", close);

  const onSubmit = (values: MarkLostFormValues) => {
    markLost.mutate(values.reason);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marquer comme perdu</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-slate-500">
            {deal ? (
              <>
                Le deal <span className="font-medium text-slate-900">{deal.title}</span> passera au
                statut Perdu. Il enrichira le jeu de données d'apprentissage.
              </>
            ) : null}
          </p>

          <div className="flex flex-col">
            <Label htmlFor="reason" className="mb-1.5">
              Raison (optionnelle)
            </Label>
            <Textarea
              id="reason"
              placeholder="Pourquoi ce deal a-t-il été perdu ? (budget, timing, concurrent…)"
              {...register("reason")}
              className={cn("min-h-[120px]", errors.reason && "border-red-400")}
              autoFocus
            />
            {errors.reason && (
              <p className="mt-1 text-xs text-red-600">{errors.reason.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={markLost.isPending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              disabled={markLost.isPending}
            >
              {markLost.isPending ? "Enregistrement…" : "Marquer comme perdu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
