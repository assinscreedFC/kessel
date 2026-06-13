import { useCallback, useEffect, useRef, useState } from "react";
import { useUpdateProposalSilent, type ProposalPatch } from "@/entities/proposal/api";
import {
  createDebouncedSaver,
  type AutosaveState,
  type DebouncedSaver,
} from "./debounced-saver";

// useAutosave — hook d'autosave debounce 1.5s (03-UI-SPEC). Mince wrapper React autour du scheduler
// pur `createDebouncedSaver` (logique de timing testée sans DOM).
//
// Anti stale-closure (RESEARCH Pitfall 4) : le payload (title/bodyJson) est passé en ARGUMENT à
// `schedule(...)` et mémorisé DANS le scheduler — jamais capturé depuis un state React. La mutationFn
// est lue via une ref pour rester fraîche sans recréer le scheduler. `flush()` (utilisé par Export PDF)
// déclenche immédiatement le PATCH pending. Au unmount, le cleanup flushe un edit pending (pas de perte).

const AUTOSAVE_DELAY_MS = 1500;

export interface UseAutosaveResult {
  // schedule un PATCH partiel (titre et/ou corps) après le debounce.
  scheduleSave: (patch: ProposalPatch) => void;
  // flushe immédiatement un PATCH pending (await -> le serveur a l'état persisté).
  flush: () => Promise<void>;
  state: AutosaveState;
}

export function useAutosave(proposalId: string): UseAutosaveResult {
  const mutation = useUpdateProposalSilent(proposalId);
  const [state, setState] = useState<AutosaveState>("saved");

  // ref vers la mutationFn courante : le scheduler appelle toujours la dernière sans être recréé.
  const mutateRef = useRef(mutation.mutateAsync);
  mutateRef.current = mutation.mutateAsync;

  const saverRef = useRef<DebouncedSaver<ProposalPatch> | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createDebouncedSaver<ProposalPatch>(
      async (patch) => {
        await mutateRef.current(patch);
      },
      AUTOSAVE_DELAY_MS,
      setState,
    );
  }

  // Flush au unmount : ne pas perdre un edit pending (cleanup du useEffect).
  useEffect(() => {
    const saver = saverRef.current;
    return () => {
      void saver?.dispose();
    };
  }, []);

  const scheduleSave = useCallback((patch: ProposalPatch) => {
    saverRef.current?.schedule(patch);
  }, []);

  const flush = useCallback(async () => {
    await saverRef.current?.flush();
  }, []);

  return { scheduleSave, flush, state };
}
