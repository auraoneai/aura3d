// Aura FC 3D — save persistence (localStorage, schema-versioned).
// Pattern follows apps/showcase-pips-big-leap/src/game/save.ts.

import type { CelebrationId, ClubId, VenueId } from "./types";

export interface StudioSave {
  club: ClubId;
  primary: string;
  secondary: string;
  boots: string;
  celebration: CelebrationId;
}

export interface CircuitSaveMatch {
  round: string;         // "G1".."G3" | "R16" | "QF" | "SF" | "F"
  opponent: string;
  scoreline: string;     // "3-1" or "1-1 (4-3p)"
  won: boolean;
}

export interface CircuitSave {
  active: boolean;
  entrants: string[];                // entrant names in bracket order
  stage: "group" | "r16" | "qf" | "sf" | "final" | "done";
  groupPlayed: number;
  groupPoints: number;               // user points (W=3 D=1 L=0)
  groupGd: number;
  alive: boolean;                    // user still in the circuit
  champion: boolean;
  results: CircuitSaveMatch[];       // user's own results (most recent last)
  otherResults: string[];            // simulated lines for the bracket view
  venueByStage: Record<string, VenueId>;
}

export interface FcSave {
  readonly version: 1;
  venue: VenueId;
  studio: StudioSave;
  circuit: CircuitSave | null;
  bestPens: number;                  // shootout lab best /5
  touchBest: number;                 // touch lab best score
  wins: number;
  losses: number;
}

const KEY = "aura-fc-3d-save-v1";

export const DEFAULT_STUDIO: StudioSave = {
  club: "aurora",
  primary: "#d8ff3e",
  secondary: "#0b1f1c",
  boots: "#22262e",
  celebration: "knee"
};

export function loadSave(): FcSave {
  const fallback: FcSave = {
    version: 1,
    venue: "munich",
    studio: { ...DEFAULT_STUDIO },
    circuit: null,
    bestPens: 0,
    touchBest: 0,
    wins: 0,
    losses: 0
  };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<FcSave>;
    if (parsed.version !== 1) return fallback;
    return {
      version: 1,
      venue: (parsed.venue as VenueId) ?? "munich",
      studio: { ...DEFAULT_STUDIO, ...(parsed.studio ?? {}) },
      circuit: parsed.circuit ?? null,
      bestPens: parsed.bestPens ?? 0,
      touchBest: parsed.touchBest ?? 0,
      wins: parsed.wins ?? 0,
      losses: parsed.losses ?? 0
    };
  } catch {
    return fallback;
  }
}

export function persistSave(save: FcSave): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode — session still works, progress just won't persist */
  }
}

export function newCircuit(entrants: string[]): CircuitSave {
  return {
    active: true,
    entrants,
    stage: "group",
    groupPlayed: 0,
    groupPoints: 0,
    groupGd: 0,
    alive: true,
    champion: false,
    results: [],
    otherResults: [],
    venueByStage: {}
  };
}
