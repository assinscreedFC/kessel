import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { Proposal } from "./model";

// Couche data de l'entité Proposal (couche `entities`). Hooks TanStack Query consommant /api/proposals
// via le client typé (credentials:include). Toute mutation de ligne renvoie la ProposalDto complète
// (lignes triées + grandTotal recalculé serveur) -> on met le cache à jour avec la réponse.
//
// AUTOSAVE (useUpdateProposalSilent) : le corps/titre est passé en ARGUMENT de la mutation (jamais via
// closure de state — anti stale-closure, RESEARCH Pitfall 4). Pas de toast (silencieux) : l'indicateur
// d'autosave porte le feedback. Les actions de ligne explicites (add/delete/reorder) toastent les
// erreurs uniquement (édition optimiste, succès silencieux pour ne pas spammer).

const PROPOSALS_KEY = ["proposals"] as const;
const proposalKey = (id: string) => [...PROPOSALS_KEY, id] as const;

export function useProposals() {
  return useQuery({
    queryKey: PROPOSALS_KEY,
    queryFn: () => api.get<Proposal[]>("/proposals"),
  });
}

export function useProposal(id: string) {
  return useQuery({
    queryKey: proposalKey(id),
    queryFn: () => api.get<Proposal>(`/proposals/${id}`),
    enabled: id !== "",
  });
}

interface CreateProposalVars {
  dealId: string;
  title: string;
  bodyJson: unknown;
}

export function useCreateProposal(onSuccess?: (proposal: Proposal) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateProposalVars) => api.post<Proposal>("/proposals", vars),
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY });
      toast.success("Proposition créée");
      onSuccess?.(proposal);
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

// Payload de l'autosave (titre et/ou corps). Passé en ARGUMENT (jamais via state capturé).
export interface ProposalPatch {
  title?: string;
  bodyJson?: unknown;
}

// PATCH silencieux pour l'autosave : pas de toast (l'indicateur Enregistré/Échec porte l'état).
// On rafraîchit le cache de la proposition avec la réponse (grandTotal/lines à jour) SANS invalider
// (éviter un refetch qui re-set le contenu de l'éditeur uncontrolled — Pitfall 2).
export function useUpdateProposalSilent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProposalPatch) => api.patch<Proposal>(`/proposals/${id}`, patch),
    onSuccess: (proposal) => {
      queryClient.setQueryData(proposalKey(id), proposal);
    },
  });
}

export function useDeleteProposal(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/proposals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY });
      toast.success("Proposition supprimée");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de la suppression. Réessayez."),
  });
}

// === Quote lines (snapshot, nested sous proposal) ===
// Chaque mutation renvoie la ProposalDto complète -> on remplace le cache de la proposition avec
// la réponse (lignes triées + grandTotal recalculé serveur = autorité). onError -> toast.

interface AddQuoteLineVars {
  description: string;
  quantity: number;
  unitPrice: number;
  position: number;
}

export function useAddQuoteLine(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (line: AddQuoteLineVars) =>
      api.post<Proposal>(`/proposals/${proposalId}/lines`, line),
    onSuccess: (proposal) => queryClient.setQueryData(proposalKey(proposalId), proposal),
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

interface UpdateQuoteLineVars {
  lineId: string;
  patch: { description?: string; quantity?: number; unitPrice?: number };
}

export function useUpdateQuoteLine(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, patch }: UpdateQuoteLineVars) =>
      api.patch<Proposal>(`/proposals/${proposalId}/lines/${lineId}`, patch),
    onSuccess: (proposal) => queryClient.setQueryData(proposalKey(proposalId), proposal),
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

export function useDeleteQuoteLine(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) =>
      api.del<Proposal>(`/proposals/${proposalId}/lines/${lineId}`),
    onSuccess: (proposal) => queryClient.setQueryData(proposalKey(proposalId), proposal),
    onError: () => toast.error("Échec de la suppression. Réessayez."),
  });
}

export function useReorderQuoteLines(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.patch<Proposal>(`/proposals/${proposalId}/lines/reorder`, { orderedIds }),
    onSuccess: (proposal) => queryClient.setQueryData(proposalKey(proposalId), proposal),
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}
