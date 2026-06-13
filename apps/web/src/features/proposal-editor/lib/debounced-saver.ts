// Scheduler d'autosave PUR (sans React) — testable en env node.
//
// Invariants (03-UI-SPEC autosave + RESEARCH Pitfall 4) :
// - debounce : schedule(value) arme un timer ; un nouveau schedule re-arme (coalescence) ;
//   à l'échéance on save UNIQUEMENT la dernière valeur (jamais une valeur stale).
// - la valeur est mémorisée dans le scheduler (pas dans une closure de state React) -> le save
//   reçoit toujours la valeur la plus récente.
// - flush() : déclenche immédiatement le save pending (annule le timer) — utilisé par Export PDF.
// - dispose() : flushe un pending (cleanup au unmount, pas de perte) puis désactive le scheduler.
// Le hook React useAutosave n'est qu'un mince wrapper autour de ce scheduler.

export type AutosaveState = "saved" | "saving" | "error";

export interface DebouncedSaver<T> {
  schedule: (value: T) => void;
  flush: () => Promise<void>;
  dispose: () => Promise<void>;
}

export function createDebouncedSaver<T>(
  save: (value: T) => Promise<void>,
  delay: number,
  onStateChange?: (state: AutosaveState) => void,
): DebouncedSaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let latest: T;
  let disposed = false;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function run(): Promise<void> {
    clearTimer();
    if (!pending) return; // rien à sauver
    pending = false;
    const value = latest; // TOUJOURS la dernière valeur (anti stale-closure)
    onStateChange?.("saving");
    try {
      await save(value);
      onStateChange?.("saved");
    } catch {
      // L'indicateur passe en "error" ; un nouveau schedule re-tentera (édition continue).
      onStateChange?.("error");
    }
  }

  return {
    schedule(value: T) {
      if (disposed) return;
      latest = value;
      pending = true;
      clearTimer();
      timer = setTimeout(() => {
        void run();
      }, delay);
    },
    async flush() {
      await run();
    },
    async dispose() {
      disposed = true;
      await run(); // flushe un edit pending avant de mourir
    },
  };
}
