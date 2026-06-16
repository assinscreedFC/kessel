import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TimelineItem } from "@/shared/ui/timeline-item";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { Label } from "@/shared/ui/label";
import {
  ACTIVITY_TYPE_VALUES,
  activityFormSchema,
  type ActivityFormInput,
  type ActivityFormValues,
} from "@/entities/deal-activity/model";
import { useDealActivities, useAddActivity } from "@/entities/deal-activity/api";

// ActivityTimeline — feature CRM-08 : timeline d'activités d'un deal + formulaire inline d'ajout.
// Montée sur la page deal-detail (Plan 06) ou en standalone testable isolément.
// Formulaire inline (toggle, pas dialog) : Select type + Textarea content + Enregistrer/Annuler.
// Add optimiste via useAddActivity (append en tête + rollback + toast.error).

const ACTIVITY_LABELS: Record<string, string> = {
  NOTE: "Note",
  CALL: "Appel",
  EMAIL: "Email",
  MEETING: "Réunion",
};

interface ActivityTimelineProps {
  dealId: string;
}

export function ActivityTimeline({ dealId }: ActivityTimelineProps) {
  const { data: activities, isPending, isError } = useDealActivities(dealId);
  const addActivity = useAddActivity(dealId);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ActivityFormInput, unknown, ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: { type: "NOTE", content: "" },
  });

  const selectedType = watch("type");

  function onCancel() {
    reset();
    setShowForm(false);
  }

  async function onSubmit(values: ActivityFormValues) {
    await addActivity.mutateAsync(values);
    reset();
    setShowForm(false);
  }

  return (
    <div>
      {/* En-tête section */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Activité</h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            Ajouter une activité
          </Button>
        )}
      </div>

      {/* Formulaire inline d'ajout */}
      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <Label htmlFor="activity-type" className="mb-1 block text-xs font-medium text-slate-700">
              Type
            </Label>
            <Select
              value={selectedType}
              onValueChange={(val) => setValue("type", val as ActivityFormValues["type"])}
            >
              <SelectTrigger id="activity-type" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPE_VALUES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ACTIVITY_LABELS[type] ?? type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-4">
            <Label htmlFor="activity-content" className="mb-1 block text-xs font-medium text-slate-700">
              Note
            </Label>
            <Textarea
              id="activity-content"
              rows={3}
              placeholder="Décrivez l'activité…"
              {...register("content")}
            />
            {errors.content && (
              <p className="mt-1 text-xs text-red-600">{errors.content.message}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isSubmitting || addActivity.isPending}>
              {addActivity.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </form>
      )}

      {/* Timeline */}
      {isPending ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600">Impossible de charger les activités.</p>
      ) : activities && activities.length > 0 ? (
        <div className="flex flex-col gap-4">
          {activities.map((activity) => (
            <TimelineItem key={activity.id} activity={activity} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-slate-400">
          Aucune activité pour l'instant. Ajoutez une note ou un appel.
        </p>
      )}
    </div>
  );
}
