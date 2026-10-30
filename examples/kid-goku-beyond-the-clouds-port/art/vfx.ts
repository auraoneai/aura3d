/**
 * GU47 WP-35 CD-15: the Cumulus Dash runtime effect pack (PRD §3.2 item 3), on E-F's registered-preset layers and the
 * built-in atlas sprites. Four presets, one per signature gameplay moment, coloured from the identity palette (amber only on
 * the pearl): pearl-spark (sky pearl pickup), cloud-puff (glider call / mount / dismount), puddle-splash (landing in a puddle
 * or the stream) and storm-mist (launch off the ridge). Plus the glider trail options.
 *
 * Counts keep a dense moment under the art direction's 96 live particles on High (spark 18 + puff 14 + splash 12 + mist 16
 * = 60); reduced motion halves every emission (PRD §6.3). These run beside the port's pooled point sprites (fx.ts), which
 * stay for the per-step dust and wisps.
 */
import type { AuraTrailOptions, AuraVfxEffectSpec } from "@aura3d/engine";
import { CUMULUS_PALETTE } from "./look";

export type CumulusVfxKind = "pearl-spark" | "cloud-puff" | "puddle-splash" | "storm-mist";

export const CUMULUS_VFX_KINDS: readonly CumulusVfxKind[] = ["pearl-spark", "cloud-puff", "puddle-splash", "storm-mist"];

/** Live-particle ceiling for a dense moment (CD-15 acceptance: <= 96). */
export const CUMULUS_VFX_LIVE_CAP = 96;

/** Gameplay events (read-only, from `Game.frame`) mapped to the preset they fire. */
export const CUMULUS_VFX_EVENTS: Readonly<Record<string, CumulusVfxKind>> = {
  skypearl: "pearl-spark",
  "glider-call": "cloud-puff",
  "glider-mount": "cloud-puff",
  "glider-end": "cloud-puff",
  dismount: "cloud-puff",
  splash: "puddle-splash",
  land: "puddle-splash",
  launch: "storm-mist",
  "power-launch": "storm-mist"
};

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
    }
  };
}

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
