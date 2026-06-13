import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { AutosaveState } from "../lib/debounced-saver";

// Indicateur d'autosave (03-UI-SPEC §Autosave Indicator). 3 états dans le header de l'éditeur :
// Enregistré (Check vert) / Enregistrement… (Loader2 spin) / Échec — réessai… (AlertCircle rouge).
// Ne bloque jamais l'édition.

interface AutosaveIndicatorProps {
  state: AutosaveState;
}

export function AutosaveIndicator({ state }: AutosaveIndicatorProps) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-sm text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Enregistrement…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1 text-sm text-red-600">
        <AlertCircle className="h-3.5 w-3.5" />
        Échec — réessai…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-sm text-slate-500">
      <Check className="h-3.5 w-3.5 text-green-600" />
      Enregistré
    </span>
  );
}
