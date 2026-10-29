// Pip's Big Leap — save persistence (localStorage, schema-versioned).

import type { WorldId } from "./types";

export interface PipSave {
  readonly version: 1;
  /** world id -> collected seed ids that persist between sessions. */
  seeds: Record<string, readonly string[]>;
  /** world id -> true once the Sun-Gate has been reached. */
  completed: Record<string, true>;
  /** world id -> best time-trial seconds. */
  bestTimes: Record<string, number>;
  /** Player Studio colours. */
  studio: { cap: string; cape: string };
  /** Entering World 2 or any later world unlocks the double-jump for good. */
  doubleJump: boolean;
  /** Academy gauntlet finished at least once. */
  academyDone: boolean;
}

const KEY = "pips-big-leap-save-v1";

export const DEFAULT_STUDIO = { cap: "#c96a2b", cape: "#3f8cff" } as const;

export function loadSave(): PipSave {
  const fallback: PipSave = {
    version: 1,
    seeds: {},
    completed: {},
    bestTimes: {},
    studio: { ...DEFAULT_STUDIO },
    doubleJump: false,
    academyDone: false
  };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PipSave>;
    if (parsed.version !== 1) return fallback;
    return {
      version: 1,
      seeds: parsed.seeds ?? {},
      completed: parsed.completed ?? {},
      bestTimes: parsed.bestTimes ?? {},
      studio: { ...DEFAULT_STUDIO, ...(parsed.studio ?? {}) },
      doubleJump: parsed.doubleJump === true,
      academyDone: parsed.academyDone === true
    };
  } catch {
    return fallback;
  }
}

export function persistSave(save: PipSave): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode — play session still works, progress just won't persist */
  }
}

export function recordSeeds(save: PipSave, world: WorldId, seedIds: readonly string[]): PipSave {
  const prior = save.seeds[world] ?? [];
  const merged = [...new Set([...prior, ...seedIds])];
  return { ...save, seeds: { ...save.seeds, [world]: merged } };
}

export function totalSeeds(save: PipSave): number {
  return Object.values(save.seeds).reduce((sum, ids) => sum + ids.length, 0);
}

/**
 * The player's save plus an optional demo layer for the autopilot.
 *
 * While the demo is on, progress goes to an in-memory copy and nothing is
 * written to storage; turning the demo off drops that copy, so the Atlas
 * never shows seeds, clears, best times or unlocks the AI earned.
 */
export interface SaveStore {
  /** The save the game reads right now (the demo copy while the demo runs). */
  current(): PipSave;
  /** Replace the current save; persisted only when the demo is off. */
  commit(next: PipSave): PipSave;
  setDemo(on: boolean): PipSave;
  readonly demo: boolean;
}

export function createSaveStore(io: { load(): PipSave; persist(save: PipSave): void } = { load: loadSave, persist: persistSave }): SaveStore {
  let real = io.load();
  let demoSave: PipSave | null = null;
  return {
    current: () => demoSave ?? real,
    commit(next) {
      if (demoSave) {
        demoSave = next;
      } else {
        real = next;
        io.persist(next);
      }
      return next;
    },
    setDemo(on) {
      if (on && !demoSave) demoSave = { ...real };
      if (!on) demoSave = null;
      return demoSave ?? real;
    },
    get demo() {
      return demoSave !== null;
    }
  };
}
