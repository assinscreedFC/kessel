import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";
import {
  dealFormSchema,
  DEAL_STATUS_VALUES,
  type Deal,
  type DealFormInput,
  type DealFormValues,
} from "@/entities/deal/model";
import { DEAL_STATUS_META } from "@/entities/deal/status";
import { useCreateDeal, useUpdateDeal } from "@/entities/deal/api";
import { useContacts } from "@/entities/contact/api";

// Dialog create/edit Deal (feature `create-deal`). UN SEUL composant réutilisé pour les deux modes :
// `deal` fourni => édition (PATCH), sinon création (POST). rhf + zodResolver (miroir du DTO).
// Select contact alimenté par useContacts (requis) ; Select statut sur DEAL_STATUS_VALUES (défaut LEAD,
// labels via DEAL_STATUS_META) ; amount Input number optionnel >= 0. Erreurs inline ; submit busy ;
// onSuccess close + refetch + toast.

interface DealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
}

const EMPTY: DealFormInput = {
  title: "",
  contactId: "",
  status: "LEAD",
  amount: undefined,
};

export function DealDialog({ open, onOpenChange, deal }: DealDialogProps) {
  const isEdit = Boolean(deal);
  const { data: contacts } = useContacts();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<DealFormInput, unknown, DealFormValues>({
    resolver: zodResolver(dealFormSchema),
    mode: "onBlur",
    defaultValues: EMPTY,
  });

  // Pré-remplir (édition) ou réinitialiser (création) à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    reset(
      deal
        ? {
            title: deal.title,
            contactId: deal.contactId,
            status: deal.status,
            // amount est une string au boundary (Pitfall 2) ; on la parse SEULEMENT pour pré-remplir
            // l'input number, jamais pour recalcul.
            amount: deal.amount != null ? Number(deal.amount) : undefined,
          }
        : EMPTY,
    );
  }, [open, deal, reset]);

  const close = () => onOpenChange(false);
  const createDeal = useCreateDeal(close);
  const updateDeal = useUpdateDeal(deal?.id ?? "", close);
  const isPending = createDeal.isPending || updateDeal.isPending;

  const onSubmit = (values: DealFormValues) => {
    if (isEdit) {
      updateDeal.mutate(values);
    } else {
      createDeal.mutate(values);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le deal" : "Nouveau deal"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col">
            <Label htmlFor="title" className="mb-1.5">
              Titre
            </Label>
            <Input
              id="title"
              {...register("title")}
              className={cn(errors.title && "border-red-400")}
              autoFocus
            />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col">
            <Label htmlFor="contactId" className="mb-1.5">
              Contact
            </Label>
            <Controller
              name="contactId"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="contactId"
                    className={cn(errors.contactId && "border-red-400")}
                  >
                    <SelectValue placeholder="Sélectionner un contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {(contacts ?? []).map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.contactId && (
              <p className="mt-1 text-xs text-red-600">{errors.contactId.message}</p>
            )}
          </div>

          <div className="flex flex-col">
            <Label htmlFor="status" className="mb-1.5">
              Statut
            </Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STATUS_VALUES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {DEAL_STATUS_META[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex flex-col">
            <Label htmlFor="amount" className="mb-1.5">
              Montant (optionnel)
            </Label>
            <Input
              id="amount"
              type="number"
              min={0}
              step="0.01"
              {...register("amount")}
              className={cn(errors.amount && "border-red-400")}
            />
            {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isPending}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
