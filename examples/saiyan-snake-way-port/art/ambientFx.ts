/**
 * GU47 WP-27 SSR-13: ambient weather and air under the colour script, on the serpent VFX pack (art/vfx.ts).
 *
 * - Cloud wisps replace the box speed streaks while the runner is fast (surge or flight): soft puffs spawned ahead
 *   beside the road that the runner streams past.
 * - Petals drift at the rose and sunburst stages; embers rise at the copper and red-lacquer stages.
 * - THE BROKEN SPINE (look `storm`): rain falling along the sim's gust (read-only mirror of `sim.ts`'s gust term) and
 *   lightning: one strike in every 5.5 s window (>= 2 in 16 s), each a bolt in the sky plus a 0.04 s (2-3 frame) exposure flash.
 *
 * Reduced motion halves the spawn rates; reduced flash drops the lightning (bolt and flash) entirely (PRD §6.3).
 * Deterministic in render time; never reads or writes the simulation's RNG.
 */
import type { RunState } from "../sim";
import type { ResolvedLook } from "./colorScript";

export const WISP_INTERVAL = 0.12;
export const AIR_INTERVAL = 0.3;
export const RAIN_INTERVAL = 0.08;
export const MIST_INTERVAL = 0.2;
export const RAIN_BURSTS = 8;
export const LIGHTNING_WINDOW = 5.5;
export const FLASH_SECONDS = 0.04;
export const FLASH_EXPOSURE = 0.7;
/** Stage rows (0-based, colour-script order) with petals and with embers. */
export const PETAL_STAGES: ReadonlySet<number> = new Set([0, 7]);
export const EMBER_STAGES: ReadonlySet<number> = new Set([2, 3]);

export type AmbientKind = "serpent-wisp" | "serpent-petals" | "serpent-embers" | "serpent-rain" | "serpent-lightning" | "serpent-mist";

/** A spawn in the road frame of the runner: `rel` metres ahead, `lateral` metres right, `up` metres above the road. */
export interface AmbientSpawn {
  readonly kind: AmbientKind;
  readonly rel: number;
  readonly lateral: number;
  readonly up: number;
}

export interface AmbientInput {
  readonly S: Pick<RunState, "phase" | "time" | "wind">;
  readonly look: Pick<ResolvedLook, "stageIndex" | "storm"> & { readonly mist?: number };
  readonly time: number;
  readonly dt: number;
  readonly fast: boolean;
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
}

export interface AmbientFrame {
  readonly spawns: readonly AmbientSpawn[];
  /** Added to the look's exposure this frame (lightning flash). */
  readonly exposureBoost: number;
  /** Lateral slant of the rain (road-right units per unit fall), quantised to 0.1. */
  readonly rainSlant: number;
  readonly raining: boolean;
}

export interface AmbientFx {
  step(input: AmbientInput): AmbientFrame;
  /** Lightning strikes so far (QA hook). */
  readonly strikes: number;
}

/** Deterministic 0..1 hash of an integer. */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Strike time inside lightning window `w` (seconds from the window start: 0.4 .. 4.4). */
export const strikeOffset = (w: number): number => 0.4 + 4 * hash01(w);

/** Read-only mirror of the sim's lateral gust (`sim.ts`: sin(0.9 t) sin(2.3 t + 1.1) x wind). */
export const gustOf = (S: Pick<RunState, "time" | "wind">): number => Math.sin(0.9 * S.time) * Math.sin(2.3 * S.time + 1.1) * S.wind;

export function createAmbientFx(): AmbientFx {
  const clocks = { wisp: 0, air: 0, rain: 0, mist: 0 };
  let n = 0;
  let strikes = 0;
  let lastWindow = -1;
  let flashUntil = -1;
  return {
    get strikes() { return strikes; },
    step({ S, look, time, dt, fast, reducedMotion, reducedFlash }) {
      const spawns: AmbientSpawn[] = [];
      const slow = reducedMotion ? 2 : 1;
      const live = S.phase === "run";
      const tick = (key: keyof typeof clocks, interval: number): number => {
        clocks[key] += dt;
        const every = interval * slow;
        let k = 0;
        while (clocks[key] >= every && k < 4) { clocks[key] -= every; k++; }
        if (clocks[key] >= every) clocks[key] = 0;
        return k;
      };
      const r = (): number => hash01(++n);

      const wisps = tick("wisp", WISP_INTERVAL);
      if (live && fast) for (let i = 0; i < wisps; i++) {
        const side = r() < 0.5 ? -1 : 1;
        spawns.push({ kind: "serpent-wisp", rel: 30 + 50 * r(), lateral: side * (5 + 9 * r()), up: 1 + 8 * r() });
      }
      const air = tick("air", AIR_INTERVAL);
      const airKind: AmbientKind | null = PETAL_STAGES.has(look.stageIndex) ? "serpent-petals" : EMBER_STAGES.has(look.stageIndex) ? "serpent-embers" : null;
      if (live && airKind) for (let i = 0; i < air; i++) {
        spawns.push({ kind: airKind, rel: 8 + 30 * r(), lateral: (r() - 0.5) * 22, up: airKind === "serpent-petals" ? 4 + 5 * r() : 0.5 + r() });
      }

      // SSR-17: THE DROWSE's low mist drifting over the road
      const mist = tick("mist", MIST_INTERVAL);
      if (live && (look.mist ?? 0) > 0.5) for (let i = 0; i < mist; i++) {
        spawns.push({ kind: "serpent-mist", rel: 6 + 40 * r(), lateral: (r() - 0.5) * 16, up: 0.3 + 0.5 * r() });
      }

      const raining = live && look.storm > 0.5;
      const rain = tick("rain", RAIN_INTERVAL);
      if (raining) for (let i = 0; i < rain; i++) for (let b = 0; b < RAIN_BURSTS; b++) {
        spawns.push({ kind: "serpent-rain", rel: -4 + 34 * r(), lateral: (r() - 0.5) * 30, up: 12 + 4 * r() });
      }

      let exposureBoost = 0;
      if (raining && !reducedFlash) {
        const w = Math.floor(time / LIGHTNING_WINDOW);
        if (w !== lastWindow && time - w * LIGHTNING_WINDOW >= strikeOffset(w)) {
          lastWindow = w;
          strikes++;
          flashUntil = time + FLASH_SECONDS;
          spawns.push({ kind: "serpent-lightning", rel: 500 + 200 * hash01(w + 0.5), lateral: (hash01(w + 0.25) - 0.5) * 600, up: 160 + 80 * hash01(w + 0.75) });
        }
        if (time < flashUntil) exposureBoost = FLASH_EXPOSURE;
      }
      return { spawns, exposureBoost, rainSlant: Math.round(gustOf(S) * 0.5 * 10) / 10, raining };
    }
  };
}
