import { useState } from "react";
import { Sparkles, X } from "lucide-react";

// Bannière "brouillon IA" (04-UI-SPEC §AI-draft banner). Strip NEUTRE slate-50 (PAS une alerte colorée,
// PAS de teinte IA — l'esthétique outil-opérateur l'interdit). Sparkles = seul signifiant IA sanctionné,
// jamais rempli. Dismiss session-local : ne change PAS le statut DRAFT de la proposition, ne réapparaît
// pas pour cette proposition dans la session (state local). Rendue au-dessus du header de l'éditeur.

export function AiDraftBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex h-9 items-center gap-2 border-b border-slate-200 bg-slate-50 px-8 text-sm text-slate-600">
      <Sparkles className="h-3.5 w-3.5 text-slate-500" />
      <span>Brouillon généré par IA — relisez et ajustez avant d'envoyer.</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Masquer"
        className="ml-auto text-slate-400 hover:text-slate-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
