import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { ClientOrg, ClientOrgFormValues } from "./model";
import type { ClientOrgOverviewDto, ContactOverviewDto } from "@kessel/shared";

// Couche data de l'entité ClientOrg (couche `entities`). Hooks TanStack Query consommant
// /api/client-orgs et les endpoints overview via le client typé (credentials:include).
// Contrat : mutate -> invalidateQueries(["client-orgs"]) -> refetch + toast ; onError -> toast.

const CLIENT_ORGS_KEY = ["client-orgs"] as const;

export function useClientOrgs() {
  return useQuery({
    queryKey: CLIENT_ORGS_KEY,
    queryFn: () => api.get<ClientOrg[]>("/client-orgs"),
  });
}

export function useCreateClientOrg(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ClientOrgFormValues) =>
      api.post<ClientOrg>("/client-orgs", { name: values.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLIENT_ORGS_KEY });
      toast.success("Organisation créée");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

export function useClientOrgOverview(id: string) {
  return useQuery({
    queryKey: [...CLIENT_ORGS_KEY, id, "overview"] as const,
    queryFn: () => api.get<ClientOrgOverviewDto>(`/client-orgs/${id}/overview`),
    enabled: Boolean(id),
  });
}

export function useContactOverview(id: string) {
  return useQuery({
    queryKey: ["contacts", id, "overview"] as const,
    queryFn: () => api.get<ContactOverviewDto>(`/contacts/${id}/overview`),
    enabled: Boolean(id),
  });
}
