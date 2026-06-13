import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENERATION_STEPS,
  STEP_INTERVAL_MS,
  createGenerationStepsScheduler,
} from "./use-generation-steps";

// Tests de la LOGIQUE DE TIMING du scheduler d'étapes (pur, sans React/DOM — l'env vitest web est node).
// Invariants 04-UI-SPEC §Generation Loading State : 4 étapes FR honnêtes, avance sur un timer, DWELL sur
// la dernière (jamais "terminé" avant la réponse), stop() annule le défilement.

const LAST = GENERATION_STEPS.length - 1;

describe("createGenerationStepsScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.restoreAllMocks());

  it("expose exactement les 4 étapes FR de 04-UI-SPEC dans l'ordre", () => {
    expect(GENERATION_STEPS).toEqual([
      "Lecture du brief…",
      "Extraction du scope et des livrables…",
      "Chiffrage depuis votre grille de tarifs…",
      "Rédaction de la proposition…",
    ]);
  });

  it("démarre à l'étape 0 (Lecture du brief…) dès start()", () => {
    const onStep = vi.fn();
    const scheduler = createGenerationStepsScheduler(onStep);
    scheduler.start();
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenLastCalledWith(0);
  });

  it("avance d'une étape à chaque intervalle", () => {
    const onStep = vi.fn();
    const scheduler = createGenerationStepsScheduler(onStep);
    scheduler.start();

    vi.advanceTimersByTime(STEP_INTERVAL_MS);
    expect(onStep).toHaveBeenLastCalledWith(1);

    vi.advanceTimersByTime(STEP_INTERVAL_MS);
    expect(onStep).toHaveBeenLastCalledWith(2);

    vi.advanceTimersByTime(STEP_INTERVAL_MS);
    expect(onStep).toHaveBeenLastCalledWith(3);
    scheduler.stop();
  });

  it("DWELL sur la dernière étape : n'avance jamais au-delà, même après plusieurs intervalles", () => {
    const onStep = vi.fn();
    const scheduler = createGenerationStepsScheduler(onStep);
    scheduler.start();

    // Avance bien au-delà du nombre d'étapes.
    vi.advanceTimersByTime(STEP_INTERVAL_MS * (GENERATION_STEPS.length + 5));

    expect(onStep).toHaveBeenLastCalledWith(LAST);
    // Aucun index hors borne (jamais > LAST).
    for (const call of onStep.mock.calls) {
      expect(call[0]).toBeLessThanOrEqual(LAST);
    }
    scheduler.stop();
  });

  it("stop() annule le défilement (plus aucun changement d'étape ensuite)", () => {
    const onStep = vi.fn();
    const scheduler = createGenerationStepsScheduler(onStep);
    scheduler.start();
    vi.advanceTimersByTime(STEP_INTERVAL_MS); // -> index 1
    const callsAtStop = onStep.mock.calls.length;

    scheduler.stop();
    vi.advanceTimersByTime(STEP_INTERVAL_MS * 3);

    expect(onStep.mock.calls.length).toBe(callsAtStop);
  });

  it("start() relance proprement depuis 0", () => {
    const onStep = vi.fn();
    const scheduler = createGenerationStepsScheduler(onStep);
    scheduler.start();
    vi.advanceTimersByTime(STEP_INTERVAL_MS * 2); // -> index 2
    onStep.mockClear();

    scheduler.start(); // relance
    expect(onStep).toHaveBeenLastCalledWith(0);
    scheduler.stop();
  });
});
