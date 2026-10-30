/**
 * GU47 WP-35 CD-15: the Cumulus Dash runtime effect pack (PRD §3.2 item 3), on E-F's registered-preset layers and the
 * built-in atlas sprites. Six presets, one per signature gameplay moment, coloured from the identity palette (amber only on
 * the pearl): pearl-spark (sky pearl pickup), cloud-puff (glider call / mount / dismount), puddle-splash (landing in a puddle
 * or the stream), storm-mist (launch off the ridge), speed-lines (launch and glider mount), landing-dust (a dry
 * landing) and falls-spray (the waterfall lip, CD-16). Plus the glider trail options.
 *
 * Counts keep a dense moment under the art direction's 96 live particles on High (spark 18 + puff 14 + splash 12 + mist 16 +
 * speed lines 10 + landing dust 10 + falls spray 5 = 85; splash and landing dust never fire together); reduced motion halves every
 * emission (PRD §6.3). These run beside the port's pooled point sprites (fx.ts), which stay for the per-step dust and wisps.
 */
import type { AuraTrailOptions, AuraVfxEffectSpec } from "@aura3d/engine";
import { CUMULUS_PALETTE } from "./look";

export type CumulusVfxKind = "pearl-spark" | "cloud-puff" | "puddle-splash" | "storm-mist" | "speed-lines" | "landing-dust" | "falls-spray";

export const CUMULUS_VFX_KINDS: readonly CumulusVfxKind[] = ["pearl-spark", "cloud-puff", "puddle-splash", "storm-mist", "speed-lines", "landing-dust", "falls-spray"];

/** Live-particle ceiling for a dense moment (CD-15 acceptance: <= 96). */
export const CUMULUS_VFX_LIVE_CAP = 96;

/**
 * Gameplay events (read-only, from `Game.frame`) mapped to the presets they fire. `land` fires the puddle splash on the wet
 * stretch and the sandstone landing dust everywhere else (world.ts picks one by the read-only track position).
 */
export const CUMULUS_VFX_EVENTS: Readonly<Record<string, readonly CumulusVfxKind[]>> = {
  skypearl: ["pearl-spark"],
  "glider-call": ["cloud-puff"],
  "glider-mount": ["cloud-puff", "speed-lines"],
  "glider-end": ["cloud-puff"],
  dismount: ["cloud-puff"],
  splash: ["puddle-splash"],
  land: ["puddle-splash", "landing-dust"],
  launch: ["storm-mist", "speed-lines"],
  "power-launch": ["storm-mist", "speed-lines"]
};

/** Which of an event's presets fire at this spot: the puddle splash only on the wet stretch, the landing dust only off it. */
export function cumulusVfxFor(event: string, wet: boolean): readonly CumulusVfxKind[] {
  const kinds = CUMULUS_VFX_EVENTS[event] ?? [];
  if (event !== "land") return kinds;
  return kinds.filter((k) => (wet ? k === "puddle-splash" : k === "landing-dust"));
}

export function cumulusVfxPresets(reducedMotion = false): Readonly<Record<CumulusVfxKind, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.round(reducedMotion ? count / 2 : count));
  return {
    "pearl-spark": {
      name: "pearl-spark",
      layers: [
        { type: "emitter", preset: "spark-gold", count: n(18), speed: [2, 5], life: [0.3, 0.6], size: [0.05, 0.11], color: CUMULUS_PALETTE.amber, intensity: 2.6, sprite: "flare", additive: true, maxScreen: 0.05 },
        { type: "light", intensity: 3, range: 8, duration: 0.25, color: CUMULUS_PALETTE.amber }
      ]
    },
    "cloud-puff": {
      name: "cloud-puff",
      layers: [
        { type: "emitter", preset: "dust", count: n(14), speed: [0.8, 2.2], life: [0.6, 1.1], size: [0.35, 0.8], color: CUMULUS_PALETTE.silver, intensity: 1, sprite: "smoke-a", additive: false, drag: 2.4, maxScreen: 0.12 }
      ]
    },
    "puddle-splash": {
      name: "puddle-splash",
      layers: [
        { type: "emitter", preset: "splash", count: n(12), speed: [1.5, 3.5], life: [0.25, 0.5], gravity: -9, size: [0.04, 0.09], color: "#d6e6f2", intensity: 1.2, sprite: "splash", additive: false, direction: [0, 1, 0], spread: 0.8, maxScreen: 0.05 }
      ]
    },
    "storm-mist": {
      name: "storm-mist",
      layers: [
        { type: "emitter", preset: "dust", count: n(16), speed: [1, 3], life: [0.7, 1.3], size: [0.4, 1.0], color: CUMULUS_PALETTE.haze, intensity: 0.9, sprite: "smoke-b", additive: false, drag: 1.8, maxScreen: 0.14 }
      ]
    },
    // Thin silver wind streaks thrown back past the runner on a launch or a glider mount (no camera layer, no flash).
    "speed-lines": {
      name: "speed-lines",
      layers: [
        { type: "emitter", preset: "streak", count: n(10), speed: [9, 14], life: [0.18, 0.32], size: [0.03, 0.06], color: CUMULUS_PALETTE.silver, intensity: 0.8, sprite: "spark-streak", additive: true, direction: [0, 0.15, -1], spread: 0.35, drag: 0.6, maxScreen: 0.04 }
      ]
    },
    // Low sandstone-coloured dust ring on a dry landing.
    "landing-dust": {
      name: "landing-dust",
      layers: [
        { type: "emitter", preset: "dust", count: n(10), speed: [0.8, 2], life: [0.4, 0.8], gravity: -1.5, size: [0.2, 0.45], color: "#c98a63", intensity: 0.9, sprite: "dust-mote", additive: false, direction: [0, 0.4, 0], spread: 1.3, drag: 2.8, maxScreen: 0.08 }
      ]
    },
    // CD-16: soft spray where the runnel tips over the drop (fired on a timer while the camera is near, not an event)
    "falls-spray": {
      name: "falls-spray",
      layers: [
        { type: "emitter", preset: "splash", count: n(5), speed: [0.6, 1.6], life: [0.6, 1.0], gravity: -2, size: [0.25, 0.6], color: CUMULUS_PALETTE.silver, intensity: 0.7, sprite: "smoke-a", additive: false, direction: [0, 0.6, 0], spread: 1.1, drag: 1.6, maxScreen: 0.1 }
      ]
    }
  };
}

/** CD-16: spray cadence (seconds) and the camera range (metres) within which it runs. */
export const FALLS_SPRAY_PERIOD = 0.35;
export const FALLS_SPRAY_RANGE = 140;

/** Anything with E-F's `registerPreset` (the app's `effects` extension). */
export interface CumulusPresetRegistry {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
}

/** Register the pack; returns the kinds registered (the QA hook lists them). */
export function registerCumulusVfx(effects: CumulusPresetRegistry | undefined, reducedMotion = false): readonly CumulusVfxKind[] {
  if (!effects) return [];
  const presets = cumulusVfxPresets(reducedMotion);
  for (const kind of CUMULUS_VFX_KINDS) effects.registerPreset(kind, presets[kind]);
  return CUMULUS_VFX_KINDS;
}

/** Glider trail behind the cloud mount (E-F `app.effects.trail`, followed per frame): silver, widening with speed. */
export const CUMULUS_GLIDER_TRAIL: AuraTrailOptions = { width: 0.5, life: 0.45, color: CUMULUS_PALETTE.silver, widthOverSpeed: [8, 24] };
