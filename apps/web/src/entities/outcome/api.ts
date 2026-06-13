import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { Outcome } from "./model";

// Couche data de l'entité Outcome (couche `entities`). Hook TanStack Query READ-ONLY consommant
// GET /api/outcomes via le client typé (credentials:include). Aucune mutation ici : le dataset
// d'apprentissage s'alimente UNIQUEMENT en effet de bord serveur (WON à la signature, LOST sur la
// transition deal->LOST — Plan 06-02). La queryKey ["outcomes"] est invalidée par useMarkDealLost
// (Task 2) pour que la vue reflète immédiatement un nouvel outcome LOST (critère 3).

export const OUTCOMES_KEY = ["outcomes"] as const;

export function useOutcomes() {
  return useQuery({
    queryKey: OUTCOMES_KEY,
    queryFn: () => api.get<Outcome[]>("/outcomes"),
  });
}
