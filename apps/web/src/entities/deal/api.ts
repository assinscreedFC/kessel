import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import { OUTCOMES_KEY } from "@/entities/outcome/api";
import type { Deal, DealFormValues, DealStatus } from "./model";

// Couche data de l'entité Deal (couche `entities`). Hooks TanStack Query consommant /api/deals via le
// client typé (credentials:include). Le filtre statut (CRM-03) est SERVEUR : `status` entre dans la
// queryKey ET dans le query param -> changer de statut refetch GET /api/deals?status=X. Contrat Dialog :
// mutate -> invalidateQueries(["deals"]) (toutes les vues/statuts) -> refetch + toast ; onError -> toast.

const DEALS_KEY = ["deals"] as const;

// amount optionnel côté form -> envoyé en null si absent (le DTO serveur accepte null).
// On NE recalcule jamais amount (string au boundary, Pitfall 2) ; ici c'est une SAISIE number -> envoi.
function toPayload(values: DealFormValues) {
  return {
    title: values.title,
    contactId: values.contactId,
    status: values.status,
    amount: values.amount ?? null,
  };
}

export function useDeals(status?: DealStatus) {
  return useQuery({
    // status undefined (onglet "Tous") => clé distincte ET pas de param -> GET /api/deals (tous).
    queryKey: [...DEALS_KEY, { status: status ?? null }] as const,
    queryFn: () => api.get<Deal[]>("/deals", status ? { status } : undefined),
  });
}

export function useCreateDeal(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: DealFormValues) => api.post<Deal>("/deals", toPayload(values)),
    onSuccess: () => {
      // invalide TOUTES les vues deals (tous statuts) — la liste filtrée courante refetch.
      queryClient.invalidateQueries({ queryKey: DEALS_KEY });
      toast.success("Deal créé");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

export function useUpdateDeal(id: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: DealFormValues) => api.patch<Deal>(`/deals/${id}`, toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEALS_KEY });
      toast.success("Deal mis à jour");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

// "Marquer comme perdu" (AI-01 critère 3) : RÉUTILISE le geste métier existant (transition de statut du
// deal -> LOST via PATCH /deals/:id), PAS une saisie flywheel dédiée. Le serveur (Plan 06-02) enregistre
// alors un ProposalOutcome(LOST) en effet de bord. La raison optionnelle vide est envoyée undefined.
//
// L'invalidation de OUTCOMES_KEY (["outcomes"]) est CLÉ : la vue dataset reflète immédiatement le
// nouvel outcome LOST sans saisie dédiée (critère 3 — la boucle se ferme visiblement).
export function useMarkDealLost(id: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      api.patch<Deal>(`/deals/${id}`, { status: "LOST", reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEALS_KEY });
      queryClient.invalidateQueries({ queryKey: OUTCOMES_KEY });
      toast.success("Deal marqué perdu");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}
