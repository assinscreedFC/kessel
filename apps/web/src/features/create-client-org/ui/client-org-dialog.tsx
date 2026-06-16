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
import { clientOrgFormSchema, type ClientOrgFormValues } from "@/entities/client-org/model";
import { useCreateClientOrg } from "@/entities/client-org/api";

// Dialog création ClientOrg (feature `create-client-org`). 1 champ Nom, react-hook-form + zodResolver,
// erreur inline text-xs red-600 (T-6-18 : validation UI max 100 chars).

interface ClientOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY: ClientOrgFormValues = { name: "" };

export function ClientOrgDialog({ open, onOpenChange }: ClientOrgDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientOrgFormValues>({
    resolver: zodResolver(clientOrgFormSchema),
    mode: "onBlur",
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    reset(EMPTY);
  }, [open, reset]);

  const close = () => onOpenChange(false);
  const createClientOrg = useCreateClientOrg(close);

  const onSubmit = (values: ClientOrgFormValues) => {
    createClientOrg.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle organisation</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col">
            <Label htmlFor="org-name" className="mb-1.5">
              Nom
            </Label>
            <Input
              id="org-name"
              {...register("name")}
              className={cn(errors.name && "border-red-400")}
              autoFocus
              maxLength={100}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={createClientOrg.isPending}>
              Annuler
            </Button>
            <Button type="submit" disabled={createClientOrg.isPending}>
              {createClientOrg.isPending ? "Création…" : "Créer l'organisation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
