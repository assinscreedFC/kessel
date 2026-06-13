import { Checkbox } from "@/shared/ui/checkbox";
import { useUpdateTask } from "@/entities/project/api";
import type { Task } from "@/entities/project/model";
import type { ProjectStatus } from "@kessel/shared";
import { cn } from "@/shared/lib/utils";

// TaskItem — couche `features/manage-tasks` (FSD). Checkbox + label tâche avec optimistic update.
//
// Si le projet est ACTIVE : la checkbox est cliquable, PATCH /api/tasks/:id via useUpdateTask
// (optimistic onMutate/rollback — pas de rechargement complet, SC5).
// Si le projet est COMPLETED ou CANCELLED : la checkbox est disabled (cursor-not-allowed opacity-50).
// Label : line-through text-slate-400 si task.done.

interface TaskItemProps {
  task: Task;
  projectId: string;
  projectStatus: ProjectStatus;
}

export function TaskItem({ task, projectId, projectStatus }: TaskItemProps) {
  const { mutate: updateTask } = useUpdateTask(projectId);
  const isActive = projectStatus === "ACTIVE";

  return (
    <div className="flex h-11 items-center gap-3 border-b border-slate-100 px-4 last:border-0">
      <Checkbox
        checked={task.done}
        disabled={!isActive}
        onCheckedChange={(checked) => {
          if (isActive) {
            updateTask({ taskId: task.id, done: checked });
          }
        }}
        className={cn(!isActive && "cursor-not-allowed opacity-50")}
      />
      <span
        className={cn(
          "text-sm text-slate-900",
          task.done && "text-slate-400 line-through",
        )}
      >
        {task.title}
      </span>
    </div>
  );
}
