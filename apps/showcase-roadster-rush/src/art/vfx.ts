/**
 * GU47 WP-12 AO-V1: the Apex Overdrive runtime effect pack (PRD §3.2 item 3). Five registered presets, one per gameplay
 * event, on E-F's registered-preset layers and atlas sprites; plus the player (cyan) and rival (red) trail options.
 * Colours come from the identity palette: warm tangerine/sodium for impacts, cyan only for the player, red only for rivals.
 * Counts are sized so a dense moment stays under the art direction's 96 live particles on High (crash 28 + land 10 + bolt 8
 * + skykill 14 + rocket 18 = 78), and reduced motion halves every emission (PRD §6.3).
 */
import type { AuraVfxEffectSpec, AuraTrailOptions } from "@aura3d/engine";
import { APEX_PALETTE } from "./look";

export type ApexVfxKind = "apex-crash" | "apex-bolt" | "apex-land" | "apex-rocket" | "apex-skykill";

export const APEX_VFX_KINDS: readonly ApexVfxKind[] = ["apex-crash", "apex-bolt", "apex-land", "apex-rocket", "apex-skykill"];

/** Live-particle ceiling for a dense moment (art direction tiers.high.particles; AO-V1 acceptance liveCount <= 96). */
export const APEX_VFX_LIVE_CAP = 96;
/** Largest on-screen diameter of the crash burst as a fraction of the viewport height (AO-V1: <= 0.12 of screen). */
export const APEX_CRASH_MAX_SCREEN = 0.12;

/** The pack, keyed by the registered kind (each spec's `name` equals its key). */
export function apexVfxPresets(reducedMotion = false): Readonly<Record<ApexVfxKind, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.round(reducedMotion ? count / 2 : count));
  return {
    "apex-crash": {
      name: "apex-crash",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(18), speed: [6, 14], life: [0.25, 0.6], size: [0.05, 0.12], color: APEX_PALETTE.tangerine, intensity: 3, sprite: "spark-streak", additive: true, maxScreen: APEX_CRASH_MAX_SCREEN },
        { type: "emitter", preset: "debris", count: n(10), speed: [3, 8], life: [0.6, 1.1], gravity: -14, color: APEX_PALETTE.charcoal, sprite: "debris-chips", additive: false, maxScreen: 0.04 },
        { type: "light", intensity: 6, range: 14, duration: 0.25, color: APEX_PALETTE.tangerine }
      ]
    },
    "apex-bolt": {
      name: "apex-bolt",
      layers: [
        { type: "emitter", preset: "pickup-gold", count: n(8), speed: [1.5, 3.5], life: [0.25, 0.45], size: [0.06, 0.1], color: APEX_PALETTE.bolt, intensity: 2.4, sprite: "glow", additive: true, maxScreen: 0.03 }
      ]
    },
    "apex-land": {
      name: "apex-land",
      layers: [
        { type: "emitter", preset: "spark", count: n(10), speed: [3, 7], life: [0.18, 0.35], size: [0.03, 0.06], color: APEX_PALETTE.sodium, intensity: 2.6, sprite: "spark-streak", additive: true, direction: [0, 0.35, 0], spread: 1.2, maxScreen: 0.03 }
      ]
    },
    "apex-rocket": {
      name: "apex-rocket",
      layers: [
        { type: "emitter", preset: "streak", count: n(18), speed: [10, 20], life: [0.2, 0.4], size: [0.04, 0.08], color: APEX_PALETTE.cyan, intensity: 2.2, sprite: "spark-streak", additive: true, direction: [0, 0, 1], spread: 0.35, maxScreen: 0.05 },
        { type: "light", intensity: 4, range: 10, duration: 0.3, color: APEX_PALETTE.cyan }
      ]
    },
    "apex-skykill": {
      name: "apex-skykill",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(14), speed: [5, 11], life: [0.25, 0.5], size: [0.05, 0.1], color: APEX_PALETTE.rival, intensity: 2.8, sprite: "flare", additive: true, maxScreen: 0.06 },
        { type: "emitter", preset: "ring", count: 1, speed: 0, life: 0.35, size: [0.8, 0.8], color: APEX_PALETTE.rival, intensity: 1.6, sprite: "ring-thin", additive: true, maxScreen: 0.08 }
      ]
    }
  };
}

/** Anything with E-F's `registerPreset` (the app's `effects` extension). */
export interface ApexPresetRegistry {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
}

/** Register the pack; returns the kinds registered (the QA hook lists them, AO-V1 "presets contain all 5"). */
export function registerApexVfx(effects: ApexPresetRegistry | undefined, reducedMotion = false): readonly ApexVfxKind[] {
  if (!effects) return [];
  const presets = apexVfxPresets(reducedMotion);
  for (const kind of APEX_VFX_KINDS) effects.registerPreset(kind, presets[kind]);
  return APEX_VFX_KINDS;
}

/**
 * Player wake (cyan, the sky-lane colour) and rival wake (red) as E-F trail options, kept for the E-F `worldOffset` handoff:
 * an engine trail cannot follow this camera-anchored game today, so src/render/wakes.ts draws both wakes game-side.
 */
export const APEX_PLAYER_TRAIL: AuraTrailOptions = { width: 0.32, life: 0.28, color: APEX_PALETTE.cyan, widthOverSpeed: [30, 60] };
export const APEX_RIVAL_TRAIL: AuraTrailOptions = { width: 0.28, life: 0.22, color: APEX_PALETTE.rival, widthOverSpeed: [10, 40] };
