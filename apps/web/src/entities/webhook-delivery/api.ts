import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { WebhookDeliveryDto } from "./model";

// Couche data de l'entité WebhookDelivery (couche `entities`). Hooks TanStack Query consommant
// /api/settings/webhooks/deliveries via le client typé (credentials:include, session Better Auth).

const DELIVERIES_KEY = ["webhook-deliveries"] as const;

export function useWebhookDeliveries() {
  return useQuery({
    queryKey: DELIVERIES_KEY,
    queryFn: () => api.get<WebhookDeliveryDto[]>("/settings/webhooks/deliveries"),
  });
}

export function useReplayDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean }>(`/settings/webhooks/deliveries/${id}/replay`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DELIVERIES_KEY });
      toast.success("Livraison rejouée");
    },
    onError: () => toast.error("Échec du rejeu — vérifiez les logs"),
  });
}
