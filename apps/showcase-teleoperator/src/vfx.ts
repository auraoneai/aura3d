/**
 * Grid Dispatch runtime VFX pack (GU47 WP-14, PRD §3.2 item 3): the game's own effect kinds, registered on
 * `app.effects` with `registerPreset` (E-F) and fired through `burst` / `trail`. Pure tables plus one installer, so the
 * unit tests read the presets without an app.
 *
 * - `grid-impact`: amber sparks plus an impact flash light at a collision (GD-14; the caller passes `camera: false`, the
 *   game owns its camera shake). Replaces the 12 instanced spark spheres.
 * - `grid-objective-ring`: teal ring at a pickup or drop-off (teal is reserved for the objective, PRD identity).
 * - `grid-tyre-splash`: night tyre spray off the wet asphalt (GD-14, GD-07).
 * - `grid-manhole-steam`: soft grey steam puff from a manhole (GD-15).
 * - tail trails: red ribbons behind the player car (GD-14), `TAIL_TRAIL`.
 *
 * Reduced motion and Low tier halve every particle count (PRD §6.3, §6.4); reduced flash drops the impact light.
 */
import type { AuraVfxEffectSpec } from "@aura3d/engine";
import { BRAKE_RED, OBJECTIVE_TEAL, SODIUM } from "./look";

export type GridVfxKind = "grid-impact" | "grid-objective-ring" | "grid-tyre-splash" | "grid-manhole-steam";

export const GRID_VFX_PRESETS: Readonly<Record<GridVfxKind, AuraVfxEffectSpec>> = {
  "grid-impact": {
    name: "grid-impact",
    layers: [
      { type: "emitter", preset: "spark", count: 18, speed: [3, 7], life: [0.25, 0.55], gravity: -9.8, color: "#ffb347", intensity: 3.4, size: [0.03, 0.07], spread: 0.9, additive: true, maxScreen: 0.02 },
      { type: "emitter", preset: "impact-flash", count: 2, life: [0.08, 0.14], color: SODIUM, intensity: 2.2, size: [0.25, 0.4], spread: 0.2, additive: true, maxScreen: 0.06 },
      { type: "light", intensity: 6, range: 7, duration: 0.18, color: SODIUM }
    ]
  },
  "grid-objective-ring": {
    name: "grid-objective-ring",
    layers: [
      { type: "emitter", preset: "ring", count: 28, speed: [3.2, 4.2], life: [0.35, 0.55], gravity: 0, color: OBJECTIVE_TEAL, intensity: 2.6, size: [0.05, 0.09], spread: 1, additive: true, direction: [0, 0.05, 0] },
      { type: "emitter", preset: "pickup", count: 12, speed: [1.2, 2.2], life: [0.5, 0.8], gravity: 1.2, color: OBJECTIVE_TEAL, intensity: 2, size: [0.05, 0.1], spread: 0.6, additive: true }
    ]
  },
  "grid-tyre-splash": {
    name: "grid-tyre-splash",
    layers: [
      { type: "emitter", preset: "splash", count: 10, speed: [1.4, 2.6], life: [0.3, 0.55], gravity: -7, color: "#8fa3b4", size: [0.03, 0.07], spread: 0.7, additive: false, direction: [0, 0.6, 1] }
    ]
  },
  "grid-manhole-steam": {
    name: "grid-manhole-steam",
    layers: [
      { type: "emitter", preset: "dust", count: 8, speed: [0.3, 0.7], life: [1.4, 2.2], gravity: 0.6, color: "#b9c3c8", size: [0.5, 1.1], spread: 0.35, additive: false, direction: [0, 1, 0], maxScreen: 0.08 }
    ]
  }
};

/** GD-14: red tail-lamp trails behind the player car; full width only above 6 m/s. */
export const TAIL_TRAIL = { width: 0.16, life: 0.35, color: BRAKE_RED, widthOverSpeed: [6, 18] as const } as const;

/** Particle scale for the current comfort settings (PRD §6.3: emission halves; §6.4 Low: half). */
export function vfxCountScale(o: { readonly motionOk: boolean; readonly lowTier: boolean }): number {
  return (o.motionOk ? 1 : 0.5) * (o.lowTier ? 0.5 : 1);
}

/** Spark count for a collision burst (the contact model reports `burst.count`). */
export function impactCount(burstCount: number, scale: number): number {
  return Math.max(2, Math.round(Math.min(burstCount, 24) * scale));
}

interface EffectsLike {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
  runtime: "on" | "off";
}

/** Registers the pack on an app's effects surface and turns runtime effects on (the E-F floating-dot fix is merged). */
export function installGridVfx(effects: EffectsLike | undefined): boolean {
  if (!effects) return false;
  for (const [kind, spec] of Object.entries(GRID_VFX_PRESETS)) effects.registerPreset(kind, spec);
  effects.runtime = "on";
  return true;
}
