import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { Contact, ContactFormValues } from "./model";

// Couche data de l'entité Contact (couche `entities`). Hooks TanStack Query consommant
// /api/contacts via le client typé (credentials:include). Le contrat Dialog (02-UI-SPEC) est ici :
// mutate -> invalidateQueries(["contacts"]) -> refetch + toast succès ; onError -> toast erreur.

const CONTACTS_KEY = ["contacts"] as const;

// `organizationName` optionnel côté form -> on l'envoie en null si vide (le DTO serveur accepte null).
function toPayload(values: ContactFormValues) {
  return {
    name: values.name,
    email: values.email,
    organizationName: values.organizationName?.trim() ? values.organizationName.trim() : null,
    // CRM-06 : clientOrgId undefined = non modifié ; null = détacher ; string = rattacher
    ...(values.clientOrgId !== undefined ? { clientOrgId: values.clientOrgId } : {}),
  };
}

export function useContacts() {
  return useQuery({
    queryKey: CONTACTS_KEY,
    queryFn: () => api.get<Contact[]>("/contacts"),
  });
}

export function useCreateContact(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactFormValues) => api.post<Contact>("/contacts", toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
      toast.success("Contact créé");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

export function useUpdateContact(id: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ContactFormValues) =>
      api.patch<Contact>(`/contacts/${id}`, toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
      toast.success("Contact mis à jour");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}
