import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { ProposalDto } from "@kessel/shared";
import { EMPTY_BODY_JSON, type Template } from "./model";

// Couche data de l'entité Template (couche `entities`). Hooks TanStack Query consommant /api/templates
// via le client typé (credentials:include). Contrat : mutate -> invalidateQueries(["templates"]) ->
// refetch + toast FR ; onError -> toast.
//
// useCreateFromTemplate appelle POST /api/proposals/from-template {templateId, dealId, title} : le
// serveur copie le bodyJson (anti-tampering, le web ne l'envoie jamais) et renvoie la ProposalDto créée.

const TEMPLATES_KEY = ["templates"] as const;
const templateKey = (id: string) => [...TEMPLATES_KEY, id] as const;

export function useTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => api.get<Template[]>("/templates"),
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKey(id),
    queryFn: () => api.get<Template>(`/templates/${id}`),
    enabled: id !== "",
  });
}

// PATCH silencieux du corps d'un template (autosave de l'éditeur de template). bodyJson passé en
// ARGUMENT (anti stale-closure). Pas de toast (l'indicateur d'autosave porte l'état).
export function useUpdateTemplateBodySilent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { title?: string; bodyJson?: unknown }) => {
      // L'éditeur passe {title} ou {bodyJson} ; le template a un `name`, pas un `title`.
      const body =
        patch.title !== undefined ? { name: patch.title } : { bodyJson: patch.bodyJson };
      return api.patch<Template>(`/templates/${id}`, body);
    },
    onSuccess: (template) => queryClient.setQueryData(templateKey(id), template),
  });
}

// Création d'un template vierge (corps édité ensuite dans l'éditeur Plan 05).
export function useCreateTemplate(onSuccess?: (template: Template) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<Template>("/templates", { name, bodyJson: EMPTY_BODY_JSON }),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      toast.success("Template créé");
      onSuccess?.(template);
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

export function useUpdateTemplate(id: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.patch<Template>(`/templates/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      toast.success("Template mis à jour");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}

export function useDeleteTemplate(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      toast.success("Template supprimé");
      onSuccess?.();
    },
    onError: () => toast.error("Échec de la suppression. Réessayez."),
  });
}

interface CreateFromTemplateVars {
  templateId: string;
  dealId: string;
  title: string;
}

// "Utiliser ce template" : crée une Proposition DRAFT pré-remplie (le serveur copie bodyJson) rattachée
// à un deal. onSuccess reçoit la ProposalDto créée -> la page navigue vers l'éditeur + toast.
export function useCreateFromTemplate(onSuccess?: (proposal: ProposalDto) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateFromTemplateVars) =>
      api.post<ProposalDto>("/proposals/from-template", vars),
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast.success("Proposition créée depuis le template");
      onSuccess?.(proposal);
    },
    onError: () => toast.error("Échec de l'enregistrement. Réessayez."),
  });
}
