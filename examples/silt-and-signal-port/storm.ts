/**
 * GU47 WP-34 DG-S5: lightning for the storm chapter (ch4, the only chapter with rain). A seeded schedule on render time
 * (never sim time, so gameplay and replays are untouched), a flash envelope shorter than 200 ms, and the thunder delay
 * the audio uses so every strike is heard after it is seen.
 *
 * Reduced flash (PRD §6.3, here the same `prefers-reduced-motion` preference): the peak is capped at 0.3.
 */

export interface LightningStrike {
  /** render-time seconds of the flash onset */
  readonly at: number;
  /** flash peak 0..1 before the reduced-flash cap */
  readonly peak: number;
  /** seconds from the flash to the thunder (distance) */
  readonly thunderDelay: number;
}

export const LIGHTNING = {
  /** first strike after this many seconds, then one every minGap..maxGap */
  first: 3.5,
  minGap: 7,
  maxGap: 15,
  /** total flash length, seconds (PRD: < 200 ms) */
  flashSeconds: 0.16,
  /** reduced-flash peak cap (PRD §6.3) */
  reducedPeak: 0.3
} as const;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every strike up to `untilSeconds`, the same list for the same seed. */
export function lightningStrikes(untilSeconds: number, seed = 4): LightningStrike[] {
  const next = rng(seed);
  const out: LightningStrike[] = [];
  for (let at = LIGHTNING.first; at <= untilSeconds; at += LIGHTNING.minGap + next() * (LIGHTNING.maxGap - LIGHTNING.minGap)) {
    out.push({ at, peak: 0.7 + next() * 0.3, thunderDelay: 0.5 + next() * 2 });
  }
  return out;
}

/** Flash envelope at `t` seconds after onset: a bright stroke, a short dip and a weaker restrike, 0 from 160 ms on. */
export function flashEnvelope(t: number): number {
  if (t < 0 || t >= LIGHTNING.flashSeconds) return 0;
  if (t < 0.03) return t / 0.03;
  if (t < 0.06) return 1 - ((t - 0.03) / 0.03) * 0.75;
  if (t < 0.08) return 0.25 + ((t - 0.06) / 0.02) * 0.45;
  return 0.7 * (1 - (t - 0.08) / (LIGHTNING.flashSeconds - 0.08));
}

/** A stateful player over the schedule: `step(time)` returns the flash level now and the strikes that began since the last call. */
export function createLightning(options: { readonly reducedFlash?: boolean; readonly seed?: number } = {}) {
  const horizon = 3600;
  const strikes = lightningStrikes(horizon, options.seed);
  const cap = options.reducedFlash ? LIGHTNING.reducedPeak : 1;
  let index = 0;
  let last = -Infinity;
  return {
    strikes,
    step(time: number): { readonly flash: number; readonly began: readonly LightningStrike[] } {
      const t = time % horizon;
      if (t < last) index = 0;
      last = t;
      const began: LightningStrike[] = [];
      while (index < strikes.length && strikes[index]!.at <= t) began.push(strikes[index++]!);
      const current = index > 0 ? strikes[index - 1]! : undefined;
      const flash = current ? Math.min(cap, flashEnvelope(t - current.at) * current.peak) : 0;
      return { flash, began };
    }
  };
}
