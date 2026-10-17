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
  /** Once World 2 is entered the double-jump stays unlocked everywhere. */
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
