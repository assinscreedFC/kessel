import { useEffect, useRef, useState } from "react";

// Scheduler d'étapes de génération PUR (sans React) — testable en env node (même pattern que
// createDebouncedSaver de la Phase 3). 04-UI-SPEC §Generation Loading State : la génération LLM dure
// plusieurs secondes ; on fait défiler des libellés FR HONNÊTES sur un timer (~2.5s), et on DWELL sur
// la dernière étape (jamais "terminé" avant que la réponse n'arrive). Une fonction pure (start/stop +
// onStepChange) + un hook React mince par-dessus.

// Les 4 étapes FR EXACTES de 04-UI-SPEC Copywriting Contract — descriptions honnêtes de ce que fait le
// prompt (lecture -> extraction -> chiffrage -> rédaction). Ordre figé, source unique.
export const GENERATION_STEPS = [
  "Lecture du brief…",
  "Extraction du scope et des livrables…",
  "Chiffrage depuis votre grille de tarifs…",
  "Rédaction de la proposition…",
] as const;

export type GenerationStep = (typeof GENERATION_STEPS)[number];

// Intervalle par défaut entre deux étapes (ms). Constante nommée (pas de magic number).
export const STEP_INTERVAL_MS = 2500;

export interface GenerationStepsScheduler {
  // Index courant (0..GENERATION_STEPS.length-1). Commence à 0.
  start: () => void;
  stop: () => void;
}

// Crée un scheduler pur : avance d'une étape toutes les `intervalMs`, DWELL (s'arrête d'avancer) sur la
// dernière étape — jamais au-delà. `onStepChange` est appelé à chaque changement d'index (et au start
// avec 0). Idempotent : start() relance proprement depuis 0 ; stop() annule le timer.
export function createGenerationStepsScheduler(
  onStepChange: (index: number) => void,
  intervalMs: number = STEP_INTERVAL_MS,
): GenerationStepsScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;
  let index = 0;
  const lastIndex = GENERATION_STEPS.length - 1;

  function clear() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start() {
      clear();
      index = 0;
      onStepChange(index);
      timer = setInterval(() => {
        if (index >= lastIndex) {
          // DWELL sur la dernière étape : on cesse d'avancer (et on libère le timer), jamais de "done".
          clear();
          return;
        }
        index += 1;
        onStepChange(index);
      }, intervalMs);
    },
    stop() {
      clear();
    },
  };
}

export interface UseGenerationStepsResult {
  step: GenerationStep;
  index: number;
}

// Hook React mince : quand `active` passe à true, démarre le défilement des étapes ; à false, l'arrête.
// L'index courant pilote l'affichage (generation-state.tsx). Le scheduler pur porte toute la logique
// de timing (testée sans DOM).
export function useGenerationSteps(active: boolean): UseGenerationStepsResult {
  const [index, setIndex] = useState(0);
  const setIndexRef = useRef(setIndex);
  setIndexRef.current = setIndex;

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const scheduler = createGenerationStepsScheduler((i) => setIndexRef.current(i));
    scheduler.start();
    return () => scheduler.stop();
  }, [active]);

  return { step: GENERATION_STEPS[index], index };
}
