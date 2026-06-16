import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { ApiKeyDto } from "./model";

// Couche data de l'entité ApiKey (couche `entities`). Hooks TanStack Query consommant
// /api/settings/api-keys via le client typé (credentials:include, session Better Auth).
//
// useGenerateApiKey : retourne { id, key, prefix } — key = clé brute UNE SEULE FOIS
//   (T-5-ui-key-leak : jamais mis en cache query, jamais persisté, juste dans le state local du modal).

const API_KEYS_KEY = ["api-keys"] as const;

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_KEY,
    queryFn: () => api.get<ApiKeyDto[]>("/settings/api-keys"),
  });
}

export function useGenerateApiKey(onSuccess?: (result: { id: string; key: string; prefix: string }) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<{ id: string; key: string; prefix: string }>("/settings/api-keys", { name }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
      toast.success("Clé API générée");
      onSuccess?.(data);
    },
    onError: () => toast.error("Échec de la génération. Réessayez."),
  });
}

export function useRevokeApiKey(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/settings/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
      toast.success("Clé révoquée");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de la révocation. Réessayez."),
  });
}
