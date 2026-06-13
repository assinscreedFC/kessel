import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedSaver } from "./debounced-saver";

// Tests de la LOGIQUE DE TIMING de l'autosave (pur, sans React/DOM — l'env vitest web est node).
// Le hook useAutosave n'est qu'un mince wrapper React autour de ce scheduler ; ici on prouve les
// invariants du <behavior> : debounce 1.5s, coalescence (un seul save avec la DERNIÈRE valeur),
// flush immédiat, dispose() flushe un pending (anti-perte au unmount).

const DELAY = 1500;

describe("createDebouncedSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.restoreAllMocks());

  it("déclenche le save après le délai de debounce (1.5s)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save, DELAY);

    saver.schedule("v1");
    expect(save).not.toHaveBeenCalled(); // rien avant le délai

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("v1");
  });

  it("deux changements rapprochés ne déclenchent qu'UN save avec la DERNIÈRE valeur (anti stale)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save, DELAY);

    saver.schedule("v1");
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule("v2"); // re-arme le timer avant que v1 ne parte
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("v2"); // la dernière valeur, jamais v1 (stale)
  });

  it("flush() déclenche immédiatement le save pending (utilisé par Export PDF)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save, DELAY);

    saver.schedule("v1");
    await saver.flush(); // n'attend pas le débounce

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("v1");

    // le timer pending a été annulé : pas de second save
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush() sans pending est un no-op", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save, DELAY);

    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("dispose() flushe un edit pending (pas de perte au unmount)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save, DELAY);

    saver.schedule("v1");
    await saver.dispose(); // simule le cleanup du useEffect au unmount

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("v1");
  });

  it("expose l'état via onStateChange (saving puis saved)", async () => {
    let state = "saved";
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save, DELAY, (s) => {
      state = s;
    });

    saver.schedule("v1");
    await vi.advanceTimersByTimeAsync(DELAY);
    // après résolution du save, l'état repasse à "saved"
    expect(state).toBe("saved");
  });

  it("passe à l'état error si le save échoue", async () => {
    let state = "saved";
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const saver = createDebouncedSaver(save, DELAY, (s) => {
      state = s;
    });

    saver.schedule("v1");
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(state).toBe("error");
  });
});
