/**
 * GU47 WP-29 (G19) VFX preset pack for Ion Circuit (PRD §3.2 item 3, IC-19). Registered on the app's runtime effects
 * with `registerPreset`; `world.ts` fires them with `camera: false` because the game owns its camera shake (HP-13).
 * Colours are the identity palette: ion cyan for boosts, amber/magenta for kills and barrels, copper sparks for hits.
 */
import type { AuraApp } from "@aura3d/engine";
import { PALETTE } from "./look";

type Effects = NonNullable<AuraApp["effects"]>;
type Spec = Parameters<Effects["registerPreset"]>[1];

export const HEATSINK_VFX = {
  hit: "heatsink-hit",
  kill: "heatsink-kill",
  barrel: "heatsink-barrel",
  boost: "heatsink-boost",
  checkpoint: "heatsink-checkpoint"
} as const;

export type HeatsinkVfxKind = (typeof HEATSINK_VFX)[keyof typeof HEATSINK_VFX];

/** worst-case live particles if every preset fired at once (IC-19 acceptance: liveCount <= 96) */
export const HEATSINK_VFX_MAX_LIVE = 96;

export const HEATSINK_VFX_PRESETS: Readonly<Record<HeatsinkVfxKind, Spec>> = {
  [HEATSINK_VFX.hit]: {
    name: HEATSINK_VFX.hit,
    layers: [
      { type: "emitter", count: 8, speed: 9, life: 0.25, size: 0.25, color: PALETTE.copper, additive: true, spread: 1 },
      { type: "light", intensity: 3, range: 6, duration: 0.12, color: PALETTE.copper }
    ]
  },
  [HEATSINK_VFX.kill]: {
    name: HEATSINK_VFX.kill,
    layers: [
      { type: "emitter", count: 28, speed: 22, life: 0.45, size: 0.5, color: PALETTE.amber, additive: true, spread: 1 },
      { type: "emitter", count: 10, speed: 8, life: 0.6, size: 0.9, color: PALETTE.magenta, additive: true, spread: 1, at: 0.05 },
      { type: "light", intensity: 8, range: 16, duration: 0.3, color: PALETTE.amber }
    ]
  },
  [HEATSINK_VFX.barrel]: {
    name: HEATSINK_VFX.barrel,
    layers: [
      { type: "emitter", count: 32, speed: 28, life: 0.5, size: 0.6, color: PALETTE.amber, additive: true, spread: 1 },
      { type: "light", intensity: 10, range: 20, duration: 0.35, color: "#ff8a3a" }
    ]
  },
  [HEATSINK_VFX.boost]: {
    name: HEATSINK_VFX.boost,
    layers: [{ type: "emitter", count: 12, speed: 6, life: 0.35, size: 0.4, color: PALETTE.ionCyan, additive: true, spread: 0.6 }]
  },
  [HEATSINK_VFX.checkpoint]: {
    name: HEATSINK_VFX.checkpoint,
    layers: [{ type: "emitter", count: 6, speed: 4, life: 0.4, size: 0.5, color: PALETTE.violet, additive: true, spread: 1 }]
  }
};

/** registers every preset once on the app (idempotent: a re-register overwrites with the same spec) */
export function registerHeatsinkVfx(app: { readonly effects: Effects }): readonly HeatsinkVfxKind[] {
  const kinds = Object.keys(HEATSINK_VFX_PRESETS) as HeatsinkVfxKind[];
  for (const kind of kinds) app.effects.registerPreset(kind, HEATSINK_VFX_PRESETS[kind]);
  return kinds;
}

/** reduced motion halves emission (PRD §6.3) */
export const vfxScale = (reducedMotion: boolean): number => (reducedMotion ? 0.5 : 1);
