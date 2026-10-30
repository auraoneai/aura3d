/**
 * GU47 WP-34 (G24) runtime effect pack (PRD §3.2 item 3), on lane E-F's registered presets, atlas sprites and real trails.
 *
 * - `silt-sand-wake` (DG-V1, the signature): sand thrown up under the board, scaled by speed and low altitude.
 * - `silt-canal-spray` (DG-V1 variant): the same wake over the canal, white spray instead of sand.
 * - `silt-signal` (DG-V3): ring pass burst, jade flash and a beacon pulse light.
 * - `silt-impact` (DG-V3): dust and debris on a collision.
 * - `silt-motes-<kind>` (DG-V4): the chapter's ambient emitter (sand, fireflies, lantern motes, pollen, embers).
 * - `SILT_TRAIL` (DG-V2): twin jade ribbons from the board, widening on boost.
 *
 * Budget (WP-34): <= 600 particles and <= 96 effects. A dense moment is
 * about 434 particles (15 wake bursts of 20 alive at once, 60 motes, two signals of 26, one impact of 22); reduced motion halves every emission (PRD §6.3) and Low halves the wake and the motes again.
 */
import type { AuraTrailOptions, AuraVfxEffectSpec } from "@aura3d/engine";
import { SILT_PALETTE, chapterLook, type AmbientMotes } from "./look";

export type SiltVfxKind = "silt-sand-wake" | "silt-canal-spray" | "silt-signal" | "silt-impact" | `silt-motes-${AmbientMotes}`;

const MOTES: readonly AmbientMotes[] = ["sand", "fireflies", "lantern-motes", "pollen", "embers"];
export const SILT_VFX_KINDS: readonly SiltVfxKind[] = ["silt-sand-wake", "silt-canal-spray", "silt-signal", "silt-impact", ...MOTES.map((m) => `silt-motes-${m}` as const)];

/** WP-34 budget: live particles and live effects. */
export const SILT_PARTICLE_CAP = 600;
export const SILT_EFFECT_CAP = 96;

export interface SiltVfxOptions {
  readonly chapter: number;
  readonly reducedMotion?: boolean;
  readonly low?: boolean;
}

/** The pack, keyed by kind (each spec's `name` equals its key). Colours follow the chapter's look row. */
export function siltVfxPresets(options: SiltVfxOptions): Readonly<Record<SiltVfxKind, AuraVfxEffectSpec>> {
  const look = chapterLook(options.chapter);
  const scale = (options.reducedMotion ? 0.5 : 1) * (options.low ? 0.5 : 1);
  const n = (count: number, s = options.reducedMotion ? 0.5 : 1): number => Math.max(1, Math.round(count * s));
  const motes = (kind: AmbientMotes): AuraVfxEffectSpec => {
    const bright = kind === "fireflies" || kind === "lantern-motes" || kind === "embers";
    return {
      name: `silt-motes-${kind}`,
      layers: [{
        type: "emitter", preset: kind === "embers" ? "spark-fire" : "dust-sand", count: n(60, scale), speed: [0.2, 0.9], life: [2.5, 4.5],
        size: kind === "pollen" ? [0.08, 0.16] : [0.05, 0.12], color: kind === look.motes.kind ? look.motes.color : SILT_PALETTE.bone,
        intensity: bright ? 2.2 : 0.9, sprite: bright ? "glow" : "dust-mote", additive: bright, spread: 18, gravity: kind === "embers" ? 0.6 : -0.05,
        drag: 0.6, maxScreen: 0.012
      }]
    };
  };
  return {
    "silt-sand-wake": {
      name: "silt-sand-wake",
      layers: [
        { type: "emitter", preset: "dust-sand", count: n(14, scale), speed: [2, 6], life: [0.6, 1.2], size: [0.25, 0.7], color: look.wake.color, intensity: 1, sprite: "smoke-a", additive: false, direction: [0, 0.6, 1], spread: 0.8, gravity: -2.5, drag: 1.2, maxScreen: 0.08 },
        { type: "emitter", preset: "dust-sand", count: n(6, scale), speed: [4, 9], life: [0.3, 0.6], size: [0.04, 0.09], color: SILT_PALETTE.sandstone, intensity: 1, sprite: "dust-mote", additive: false, direction: [0, 0.8, 1], spread: 0.6, gravity: -9, maxScreen: 0.02 }
      ]
    },
    "silt-canal-spray": {
      name: "silt-canal-spray",
      layers: [
        { type: "emitter", preset: "splash", count: n(28, scale), speed: [3, 8], life: [0.4, 0.8], size: [0.12, 0.3], color: "#e9f1ee", intensity: 1.1, sprite: "splash", additive: false, direction: [0, 0.9, 1], spread: 0.7, gravity: -12, maxScreen: 0.05 }
      ]
    },
    "silt-signal": {
      name: "silt-signal",
      layers: [
        { type: "emitter", preset: "pickup-gem", count: n(18), speed: [3, 8], life: [0.35, 0.7], size: [0.12, 0.3], color: SILT_PALETTE.jade, intensity: 2.6, sprite: "flare", additive: true, maxScreen: 0.05 },
        { type: "emitter", preset: "ring", count: n(8), speed: 0, life: 0.45, size: [6, 6], color: SILT_PALETTE.jadeWhite, intensity: 1.6, sprite: "ring-thin", additive: true, maxScreen: 0.25 },
        { type: "light", intensity: 8, range: 60, duration: 0.35, color: SILT_PALETTE.jade }
      ]
    },
    "silt-impact": {
      name: "silt-impact",
      layers: [
        { type: "emitter", preset: "dust-sand", count: n(14), speed: [2, 5], life: [0.6, 1.1], size: [0.4, 0.9], color: SILT_PALETTE.sandstone, sprite: "smoke-b", additive: false, gravity: -1, drag: 1, maxScreen: 0.1 },
        { type: "emitter", preset: "debris", count: n(8), speed: [4, 9], life: [0.5, 0.9], size: [0.05, 0.12], color: SILT_PALETTE.terracotta, sprite: "debris-chips", additive: false, gravity: -14, maxScreen: 0.03 }
      ]
    },
    ...Object.fromEntries(MOTES.map((m) => [`silt-motes-${m}`, motes(m)])) as Record<`silt-motes-${AmbientMotes}`, AuraVfxEffectSpec>
  };
}

export interface SiltPresetRegistry { registerPreset(kind: string, spec: AuraVfxEffectSpec): void }

/** Register the pack on the app's effects; returns the registered kinds (empty without an effects surface). */
export function registerSiltVfx(effects: SiltPresetRegistry | undefined, options: SiltVfxOptions): readonly SiltVfxKind[] {
  if (!effects) return [];
  const presets = siltVfxPresets(options);
  for (const kind of SILT_VFX_KINDS) effects.registerPreset(kind, presets[kind]);
  return SILT_VFX_KINDS;
}

/** DG-V1 thresholds: the wake throws sand below 6 m above the ground at more than 20 speed, and never above 10 m. */
export const WAKE_FULL_ALTITUDE = 6;
export const WAKE_MAX_ALTITUDE = 10;
export const WAKE_MIN_SPEED = 20;

/**
 * Wake strength 0..1 from the board's speed and its height above the ground (read-only sim values). Full at or below
 * 6 m, fading to 0 at 10 m; 0 at or below speed 20, full by speed 60.
 */
export function wakeStrength(speed: number, altitude: number): number {
  const s = Math.abs(speed);
  if (s <= WAKE_MIN_SPEED || altitude >= WAKE_MAX_ALTITUDE) return 0;
  const bySpeed = Math.min(1, (s - WAKE_MIN_SPEED) / 40);
  const byHeight = altitude <= WAKE_FULL_ALTITUDE ? 1 : 1 - (altitude - WAKE_FULL_ALTITUDE) / (WAKE_MAX_ALTITUDE - WAKE_FULL_ALTITUDE);
  return bySpeed * Math.max(0, byHeight);
}

/** Seconds between wake bursts at a strength (0 = none). Each burst is one registered `silt-sand-wake` instance. */
export function wakeInterval(strength: number): number {
  return strength <= 0 ? Number.POSITIVE_INFINITY : 0.22 - 0.14 * Math.min(1, strength);
}

/** DG-V2: one jade ribbon per board edge, widening with speed (boost reaches the top of the ramp). */
export const SILT_TRAIL: AuraTrailOptions = { width: 0.45, life: 0.9, color: SILT_PALETTE.jade, widthOverSpeed: [18, 70] };
