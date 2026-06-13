import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";
import type { Project, Task } from "./model";
import type { ProjectStatus } from "@kessel/shared";

// Couche data de l'entité Project (couche `entities`). Hooks TanStack Query consommant /api/projects
// et /api/tasks via le client typé (credentials:include).
//
// useUpdateTask implémente l'optimistic update (02-UI-SPEC §Interaction Contracts) :
// onMutate -> setQueryData local -> PATCH serveur ; onError -> rollback setQueryData(previous) +
// toast ; onSuccess -> invalidateQueries pour resync. Pas de rechargement complet de page (SC5).

const PROJECTS_KEY = ["projects"] as const;

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => api.get<Project[]>("/projects"),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["project", id] as const,
    queryFn: () => api.get<Project>(`/projects/${id}`),
  });
}

export function useProjectTasks(id: string) {
  return useQuery({
    queryKey: ["project", id, "tasks"] as const,
    queryFn: () => api.get<Task[]>(`/projects/${id}/tasks`),
  });
}

export function useUpdateProjectStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ status }: { status: ProjectStatus }) =>
      api.patch<Project>(`/projects/${id}`, { status }),
    onSuccess: () => {
      // Le statut projet est définitif — on refetch serveur (pas optimistic), statut figé.
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      toast.success("Statut mis à jour");
    },
    onError: () => toast.error("Impossible de changer le statut. Réessayez."),
  });
}

// useUpdateTask : optimistic update (Pattern 5 — 02-RESEARCH).
// onMutate : annule les refetch en cours, sauvegarde l'état précédent, met à jour le cache localement.
// onError : rollback vers l'état précédent + toast erreur.
// onSuccess : invalide le cache pour resync avec le serveur.
export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      api.patch<Task>(`/tasks/${taskId}`, { done }),
    onMutate: async ({ taskId, done }) => {
      const tasksKey = ["project", projectId, "tasks"] as const;
      // Annule les requêtes en cours pour éviter d'écraser l'optimistic update.
      await queryClient.cancelQueries({ queryKey: tasksKey });
      // Sauvegarde l'état précédent pour rollback en cas d'erreur.
      const previous = queryClient.getQueryData<Task[]>(tasksKey);
      // Mise à jour optimiste du cache.
      queryClient.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.map((t) => (t.id === taskId ? { ...t, done } : t)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      const tasksKey = ["project", projectId, "tasks"] as const;
      // Rollback vers l'état précédent si le PATCH échoue.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(tasksKey, context.previous);
      }
      toast.error("Impossible de mettre à jour la tâche. Réessayez.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId, "tasks"] });
    },
  });
}
