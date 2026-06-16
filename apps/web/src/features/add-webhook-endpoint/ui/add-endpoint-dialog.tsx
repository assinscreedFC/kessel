import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Checkbox } from "@/shared/ui/checkbox";
import { useAddEndpoint } from "@/entities/webhook-endpoint/api";
import { WEBHOOK_EVENT_OPTIONS, addEndpointSchema } from "@/entities/webhook-endpoint/model";
import type { WebhookEventValue } from "@/entities/webhook-endpoint/model";

// AddEndpointDialog — modale formulaire pour ajouter un webhook endpoint (API-03/05).
// Validation Zod : URL valide + au moins 1 événement coché.

interface AddEndpointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddEndpointDialog({ open, onOpenChange }: AddEndpointDialogProps) {
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<WebhookEventValue[]>([]);
  const [errors, setErrors] = useState<{ url?: string; events?: string }>({});

  const { mutate: addEndpoint, isPending } = useAddEndpoint(() => {
    handleClose();
  });

  function handleClose() {
    setUrl("");
    setSelectedEvents([]);
    setErrors({});
    onOpenChange(false);
  }

  function handleEventToggle(value: WebhookEventValue, checked: boolean) {
    setSelectedEvents((prev) =>
      checked ? [...prev, value] : prev.filter((e) => e !== value),
    );
  }

  function handleSubmit() {
    const result = addEndpointSchema.safeParse({ url, events: selectedEvents });
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        url: fieldErrors.url?.[0],
        events: fieldErrors.events?.[0],
      });
      return;
    }
    setErrors({});
    addEndpoint(result.data);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un endpoint</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* URL */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="endpoint-url">URL cible</Label>
            <Input
              id="endpoint-url"
              placeholder="https://your-server.com/webhooks"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
            {errors.url && (
              <p className="text-xs text-red-600">{errors.url}</p>
            )}
          </div>

          {/* Événements */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-900">Événements</legend>
            <div className="flex flex-col gap-2">
              {WEBHOOK_EVENT_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`evt-${option.value}`}
                    checked={selectedEvents.includes(option.value)}
                    onCheckedChange={(checked) =>
                      handleEventToggle(option.value, checked)
                    }
                  />
                  <Label htmlFor={`evt-${option.value}`}>{option.label}</Label>
                </div>
              ))}
            </div>
            {errors.events && (
              <p className="mt-1 text-xs text-red-600">{errors.events}</p>
            )}
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Ajout…" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
