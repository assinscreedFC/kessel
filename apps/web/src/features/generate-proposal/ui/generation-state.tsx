import { AlertCircle, Loader2 } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { useGenerationSteps } from "../lib/use-generation-steps";

// États asynchrones de la génération, rendus DANS le même Dialog max-w-xl que le brief (04-UI-SPEC
// interdit de fermer pendant la génération). Trois sous-états :
//   - loading : titre "Génération en cours…", Loader2, étape FR courante (scheduler), sous-ligne
//     calibration si historique, barre indéterminée, bouton Annuler (abort -> brief préservé).
//   - failed (échec LLM/réseau/IDOR) : AlertCircle rouge, "La génération a échoué", Réessayer + Annuler.
//   - ai-disabled (503 clé absente) : AlertCircle slate, "Génération IA indisponible", Rédiger
//     manuellement (pas de retry : inutile sans clé).
// Aucun toast ici (canal = bloc inline) ; aucun détail serveur leaké (T-4-web-leak).

interface GenerationStateProps {
  phase: "loading" | "failed" | "ai-disabled";
  hasWonHistory: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onWriteManually: () => void;
}

export function GenerationState({
  phase,
  hasWonHistory,
  onCancel,
  onRetry,
  onWriteManually,
}: GenerationStateProps) {
  if (phase === "loading") {
    return <LoadingState hasWonHistory={hasWonHistory} onCancel={onCancel} />;
  }
  if (phase === "ai-disabled") {
    return <AiDisabledState onWriteManually={onWriteManually} />;
  }
  return <FailedState onRetry={onRetry} onCancel={onCancel} />;
}

function LoadingState({
  hasWonHistory,
  onCancel,
}: {
  hasWonHistory: boolean;
  onCancel: () => void;
}) {
  const { step } = useGenerationSteps(true);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Génération en cours…</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-slate-900">{step}</p>
          {hasWonHistory && (
            <p className="text-sm text-slate-500">Calibré sur vos propositions gagnées</p>
          )}
        </div>
        {/* Barre indéterminée : réassurance décorative, PAS un pourcentage réel (04-UI-SPEC). */}
        <div className="h-1 w-48 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-slate-300" />
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </>
  );
}

function FailedState({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>La génération a échoué</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <AlertCircle className="h-6 w-6 text-red-600" />
        <p className="max-w-sm text-sm text-red-600">
          Un problème est survenu pendant la génération. Réessayez dans un instant.
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="button" onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      </div>
    </>
  );
}

function AiDisabledState({ onWriteManually }: { onWriteManually: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Génération IA indisponible</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <AlertCircle className="h-6 w-6 text-slate-400" />
        <p className="max-w-sm text-sm text-slate-600">
          La génération IA n'est pas configurée sur ce serveur. Contactez votre administrateur ou
          rédigez la proposition manuellement.
        </p>
        <Button type="button" variant="outline" onClick={onWriteManually}>
          Rédiger manuellement
        </Button>
      </div>
    </>
  );
}
