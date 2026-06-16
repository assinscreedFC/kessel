import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { ActivityFormValues, DealActivityDto } from "./model";

// Couche data de l'entité DealActivity (couche `entities` FSD).
// useDealActivities — GET /deals/:id/activities (desc serveur, CRM-08)
// useAddActivity — POST /deals/:id/activities avec update optimiste (append en tête) + rollback
//
// T-6-17 (input validation) : borné via activityFormSchema dans le formulaire avant appel API.
// onSettled invalidateQueries -> refetch autorité serveur (T-6-16 pattern).

export function dealActivitiesKey(dealId: string) {
  return ["deal-activities", dealId] as const;
}

export function useDealActivities(dealId: string) {
  return useQuery({
    queryKey: dealActivitiesKey(dealId),
    queryFn: () => api.get<DealActivityDto[]>(`/deals/${dealId}/activities`),
    enabled: !!dealId,
  });
}

export function useAddActivity(dealId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: ActivityFormValues) =>
      api.post<DealActivityDto>(`/deals/${dealId}/activities`, values),

    onMutate: async (values) => {
      // Cancel in-flight queries pour éviter clobber de l'update optimiste
      await queryClient.cancelQueries({ queryKey: dealActivitiesKey(dealId) });

      // Snapshot pour rollback
      const previous = queryClient.getQueryData<DealActivityDto[]>(dealActivitiesKey(dealId));

      // Optimistic append en tête (la timeline est desc - plus récent en premier)
      const optimistic: DealActivityDto = {
        id: `optimistic-${Date.now()}`,
        dealId,
        type: values.type,
        content: values.content,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<DealActivityDto[]>(dealActivitiesKey(dealId), (old) => [
        optimistic,
        ...(old ?? []),
      ]);

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Rollback en cas d'erreur serveur
      if (context?.previous !== undefined) {
        queryClient.setQueryData(dealActivitiesKey(dealId), context.previous);
      }
      toast.error("Impossible d'enregistrer l'activité. Réessayez.");
    },

    onSettled: () => {
      // Refetch autorité serveur (T-6-16 — position/données synchronisées)
      queryClient.invalidateQueries({ queryKey: dealActivitiesKey(dealId) });
    },
  });
}
