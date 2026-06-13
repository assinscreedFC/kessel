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
import { contactFormSchema, type Contact, type ContactFormValues } from "@/entities/contact/model";
import { useCreateContact, useUpdateContact } from "@/entities/contact/api";

// Dialog create/edit Contact (feature `create-contact`). UN SEUL composant réutilisé pour les
// deux modes : `contact` fourni => édition (PATCH), sinon création (POST). rhf + zodResolver
// (miroir du DTO) ; erreurs inline ; submit busy pendant la requête ; onSuccess close + refetch + toast.

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
}

const EMPTY: ContactFormValues = { name: "", email: "", organizationName: "" };

export function ContactDialog({ open, onOpenChange, contact }: ContactDialogProps) {
  const isEdit = Boolean(contact);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    mode: "onBlur",
    defaultValues: EMPTY,
  });

  // Pré-remplir (édition) ou réinitialiser (création) à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    reset(
      contact
        ? {
            name: contact.name,
            email: contact.email,
            organizationName: contact.organizationName ?? "",
          }
        : EMPTY,
    );
  }, [open, contact, reset]);

  const close = () => onOpenChange(false);
  const createContact = useCreateContact(close);
  const updateContact = useUpdateContact(contact?.id ?? "", close);
  const isPending = createContact.isPending || updateContact.isPending;

  const onSubmit = (values: ContactFormValues) => {
    if (isEdit) {
      updateContact.mutate(values);
    } else {
      createContact.mutate(values);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col">
            <Label htmlFor="name" className="mb-1.5">
              Nom
            </Label>
            <Input
              id="name"
              {...register("name")}
              className={cn(errors.name && "border-red-400")}
              autoFocus
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col">
            <Label htmlFor="email" className="mb-1.5">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              {...register("email")}
              className={cn(errors.email && "border-red-400")}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col">
            <Label htmlFor="organizationName" className="mb-1.5">
              Organisation
            </Label>
            <Input id="organizationName" {...register("organizationName")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isPending}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Enregistrement…"
                : isEdit
                  ? "Enregistrer"
                  : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
