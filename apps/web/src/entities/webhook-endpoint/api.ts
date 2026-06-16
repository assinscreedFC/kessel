import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { AddEndpointFormValues, WebhookEndpointDto } from "./model";

// Couche data de l'entité WebhookEndpoint (couche `entities`). Hooks TanStack Query consommant
// /api/settings/webhooks via le client typé (credentials:include, session Better Auth).
//
// useToggleEndpoint : optimistic update — switch mis à jour localement avant le PATCH serveur,
//   revert en cas d'erreur (T-5-ui-input : UX cohérente sans reload).

const ENDPOINTS_KEY = ["webhook-endpoints"] as const;

export function useWebhookEndpoints() {
  return useQuery({
    queryKey: ENDPOINTS_KEY,
    queryFn: () => api.get<WebhookEndpointDto[]>("/settings/webhooks"),
  });
}

export function useAddEndpoint(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: AddEndpointFormValues) =>
      api.post<WebhookEndpointDto>("/settings/webhooks", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENDPOINTS_KEY });
      toast.success("Endpoint ajouté");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'ajout. Réessayez."),
  });
}

export function useDeleteEndpoint(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/settings/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ENDPOINTS_KEY });
      toast.success("Endpoint supprimé");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de la suppression. Réessayez."),
  });
}

export function useToggleEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch<void>(`/settings/webhooks/${id}`, { active }),
    // Optimistic update : on met à jour le cache AVANT le retour serveur.
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey: ENDPOINTS_KEY });
      const previous = queryClient.getQueryData<WebhookEndpointDto[]>(ENDPOINTS_KEY);
      queryClient.setQueryData<WebhookEndpointDto[]>(ENDPOINTS_KEY, (old) =>
        old?.map((ep) => (ep.id === id ? { ...ep, active } : ep)) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Revert en cas d'erreur.
      if (context?.previous) {
        queryClient.setQueryData(ENDPOINTS_KEY, context.previous);
      }
      toast.error("Impossible de mettre à jour l'endpoint");
    },
    onSuccess: (_data, { active }) => {
      queryClient.invalidateQueries({ queryKey: ENDPOINTS_KEY });
      toast.success(active ? "Endpoint activé" : "Endpoint désactivé");
    },
  });
}
