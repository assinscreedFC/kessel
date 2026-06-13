import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { PricingItem, PricingItemFormValues } from "./model";

// Couche data de l'entité PricingItem (couche `entities`). Hooks TanStack Query consommant
// /api/pricing-items via le client typé (credentials:include). Contrat Dialog : mutate ->
// invalidateQueries(["pricing-items"]) -> refetch + toast FR ; onError -> toast.
//
// unitPrice est reçu en string (Decimal au boundary, Pitfall 2) : affiché via Intl, jamais recalculé.
// La SAISIE (Input number) produit un number validé zod -> envoyé tel quel au POST/PATCH ; unit vide
// -> null (le DTO serveur accepte null).

const PRICING_KEY = ["pricing-items"] as const;

function toPayload(values: PricingItemFormValues) {
  return {
    name: values.name,
    unitPrice: values.unitPrice,
    unit: values.unit ?? null,
  };
}

export function usePricingItems() {
  return useQuery({
    queryKey: PRICING_KEY,
    queryFn: () => api.get<PricingItem[]>("/pricing-items"),
  });
}

export function useCreatePricingItem(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: PricingItemFormValues) =>
      api.post<PricingItem>("/pricing-items", toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_KEY });
      toast.success("Tarif créé");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

export function useUpdatePricingItem(id: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: PricingItemFormValues) =>
      api.patch<PricingItem>(`/pricing-items/${id}`, toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_KEY });
      toast.success("Tarif mis à jour");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

export function useDeletePricingItem(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/pricing-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICING_KEY });
      toast.success("Tarif supprimé");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de la suppression. Réessayez."),
  });
}
