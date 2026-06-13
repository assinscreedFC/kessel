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
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";
import {
  pricingItemFormSchema,
  type PricingItem,
  type PricingItemFormInput,
  type PricingItemFormValues,
} from "@/entities/pricing-item/model";
import { useCreatePricingItem, useUpdatePricingItem } from "@/entities/pricing-item/api";

// Dialog create/edit PricingItem (feature `create-pricing-item`). UN SEUL composant réutilisé pour
// les deux modes : `item` fourni => édition (PATCH), sinon création (POST). rhf + zodResolver (miroir
// du DTO PricingItemInput). Champs : name (requis), unitPrice (number >= 0, EUR), unit (optionnel,
// placeholder "ex. jour"). Erreurs inline ; submit busy ; onSuccess close + refetch + toast.

interface PricingItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: PricingItem | null;
}

const EMPTY: PricingItemFormInput = {
  name: "",
  unitPrice: undefined as unknown as number,
  unit: undefined,
};

export function PricingItemDialog({ open, onOpenChange, item }: PricingItemDialogProps) {
  const isEdit = Boolean(item);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PricingItemFormInput, unknown, PricingItemFormValues>({
    resolver: zodResolver(pricingItemFormSchema),
    mode: "onBlur",
    defaultValues: EMPTY,
  });

  // Pré-remplir (édition) ou réinitialiser (création) à chaque ouverture. unitPrice est une string
  // au boundary (Decimal, Pitfall 2) : parsée SEULEMENT pour pré-remplir l'input number, jamais recalculée.
  useEffect(() => {
    if (!open) return;
    reset(
      item
        ? {
            name: item.name,
            unitPrice: Number(item.unitPrice),
            unit: item.unit ?? undefined,
          }
        : EMPTY,
    );
  }, [open, item, reset]);

  const close = () => onOpenChange(false);
  const createItem = useCreatePricingItem(close);
  const updateItem = useUpdatePricingItem(item?.id ?? "", close);
  const isPending = createItem.isPending || updateItem.isPending;

  const onSubmit = (values: PricingItemFormValues) => {
    if (isEdit) {
      updateItem.mutate(values);
    } else {
      createItem.mutate(values);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le tarif" : "Nouveau tarif"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col">
            <Label htmlFor="name" className="mb-1.5">
              Prestation
            </Label>
            <Input
              id="name"
              {...register("name")}
              className={cn(errors.name && "border-red-400")}
              autoFocus
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col">
            <Label htmlFor="unitPrice" className="mb-1.5">
              Prix unitaire (€)
            </Label>
            <Input
              id="unitPrice"
              type="number"
              min={0}
              step="0.01"
              {...register("unitPrice")}
              className={cn(errors.unitPrice && "border-red-400")}
            />
            {errors.unitPrice && (
              <p className="mt-1 text-xs text-red-600">{errors.unitPrice.message}</p>
            )}
          </div>

          <div className="flex flex-col">
            <Label htmlFor="unit" className="mb-1.5">
              Unité (optionnel)
            </Label>
            <Input id="unit" placeholder="ex. jour" {...register("unit")} />
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
