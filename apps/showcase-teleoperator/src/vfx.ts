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
 * - headlight motes: a looping spec (`HEADLIGHT_MOTES`) spawned with `effects.spawn` and moved into the headlight cones
 *   every frame (GD-15, dusk/fog/night only).
 *
 * Reduced motion and Low tier halve every particle count (PRD §6.3, §6.4); reduced flash drops the impact light.
 */
import type { AuraBurstOptions, AuraVec3, AuraVfxEffectSpec } from "@aura3d/engine";
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

/**
 * GD-15 headlight-cone motes: a looping emitter (an authored spec object, so `effects.spawn` keeps it alive) of tiny warm
 * dust specks, drifting back towards the camera through the headlight cones. `count` is the emission budget before
 * `vfxCountScale`; the runtime emits `2 x count` per second into a pool of at least 64.
 */
export const HEADLIGHT_MOTES: AuraVfxEffectSpec = {
  name: "grid-headlight-motes",
  layers: [
    { type: "emitter", preset: "dust", count: 14, speed: [0.25, 0.6], life: [0.9, 1.5], gravity: -0.05, color: "#ffe9c4", intensity: 1.4, size: [0.015, 0.035], spread: 0.6, additive: true, direction: [0, 0.05, 1], maxScreen: 0.008 }
  ]
};
/** Metres ahead of the nose where the mote emitter sits (inside both headlight cones, before they reach the road). */
export const MOTES_AHEAD_M = 6;

/** Mote emitter position in view space for a car whose nose sits at (carX, noseZ). */
export function motesAnchor(carX: number, noseZ: number, y = 0): AuraVec3 {
  return [carX, y + 0.75, noseZ - MOTES_AHEAD_M];
}

/** The mote spec scaled for comfort and tier; `null` when the sky has no headlights (noon). */
export function headlightMotesSpec(o: { readonly headlights: number; readonly motionOk: boolean; readonly lowTier: boolean }): AuraVfxEffectSpec | null {
  if (o.headlights <= 0) return null;
  const scale = vfxCountScale(o);
  return {
    name: HEADLIGHT_MOTES.name,
    layers: HEADLIGHT_MOTES.layers.map((l) => (l.type === "emitter" ? { ...l, count: Math.max(2, Math.round(Number((l as { count?: number }).count ?? 0) * scale)) } : l))
  };
}

/**
 * GD-15 manholes: two covers just past each intersection (world x, z offset from the intersection centre), recycled on
 * the intersection stride with the crossings. Steam rises only while the car is nearly stopped (signals, kerb stops):
 * particles live in view space and the street scrolls past a fixed camera, so a plume at speed would ride with the car
 * (handoff E-F: emitter velocity in a scrolling frame).
 */
export const MANHOLES = { offsets: [[-2.7, 12.5], [3.1, 15.5]] as const, size: [0.9, 0.03, 0.9] as [number, number, number], steamMaxSpeed: 2, steamIntervalS: 0.8, reach: [6, 70] as const } as const;

/** World (x, z) of every manhole for the intersections at `intersectionZs`. */
export function manholeLayout(intersectionZs: readonly number[]): [number, number][] {
  return intersectionZs.flatMap((z) => MANHOLES.offsets.map(([x, dz]) => [x, z + dz] as [number, number]));
}

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

/** One queued runtime burst, in sim world space (present() maps it into view space). */
export interface GridVfxShot {
  readonly kind: GridVfxKind;
  readonly at: AuraVec3;
  readonly options: AuraBurstOptions;
}

/** Seconds between two tyre-spray puffs per rear wheel (night only). */
export const TYRE_SPLASH_INTERVAL_S = 0.14;
/** Below this speed (m/s) the tyres throw no spray. */
export const TYRE_SPLASH_MIN_SPEED = 4;

/**
 * GD-14 presentation queue. The sim's contact callback and the ride events push shots; `drain` scales them for reduced
 * motion and the Low tier, and hands each one to the caller (`app.effects.burst`). Collision sparks pass `camera: false`
 * (the game owns its shake). Nothing here reads or writes sim state.
 */
export function createGridVfxQueue() {
  const queue: { kind: GridVfxKind; at: AuraVec3; count?: number; speed?: number; normal?: AuraVec3; seed: number }[] = [];
  let seed = 1;
  let tyreClock = 0;
  let steamClock = 0;
  return {
    /** Collision burst from the contact model (`ParticleBurst`: point, normal, count, approach speed). */
    impact(burst: { readonly point: readonly [number, number, number]; readonly normal: readonly [number, number, number]; readonly count: number; readonly speed: number }): void {
      queue.push({ kind: "grid-impact", at: [burst.point[0], Math.max(0.4, burst.point[1]), burst.point[2]], count: burst.count, speed: 3 + burst.speed * 0.25, normal: [burst.normal[0], 0.35, burst.normal[2]], seed: seed++ });
    },
    /** Teal ring at the kerb beacon on a pickup or a drop-off. */
    objective(x: number, z: number): void {
      queue.push({ kind: "grid-objective-ring", at: [x, 0.12, z], seed: seed++ });
    },
    /** Night tyre spray: one puff per rear wheel every `TYRE_SPLASH_INTERVAL_S` above `TYRE_SPLASH_MIN_SPEED`. */
    tyres(o: { readonly dt: number; readonly wet: boolean; readonly speed: number; readonly x: number; readonly z: number; readonly width: number; readonly length: number }): void {
      if (!o.wet || o.speed < TYRE_SPLASH_MIN_SPEED) {
        tyreClock = 0;
        return;
      }
      tyreClock += o.dt;
      if (tyreClock < TYRE_SPLASH_INTERVAL_S) return;
      tyreClock = 0;
      const rearZ = o.z + o.length * 0.36;
      const spray = Math.min(10, 1.5 + o.speed * 0.25);
      for (const side of [-1, 1]) queue.push({ kind: "grid-tyre-splash", at: [o.x + side * o.width * 0.38, 0.08, rearZ], speed: spray, normal: [side * 0.25, 0.55, 1], seed: seed++ });
    },
    /**
     * GD-15 manhole steam: below `MANHOLES.steamMaxSpeed`, one puff per manhole that sits `MANHOLES.reach` metres ahead
     * of the car, every `MANHOLES.steamIntervalS` seconds. `manholes` are world (x, z); `z` is the car's world z.
     */
    steam(o: { readonly dt: number; readonly speed: number; readonly z: number; readonly manholes: readonly (readonly [number, number])[] }): void {
      if (o.speed >= MANHOLES.steamMaxSpeed) {
        steamClock = 0;
        return;
      }
      steamClock += o.dt;
      if (steamClock < MANHOLES.steamIntervalS) return;
      steamClock = 0;
      for (const [x, mz] of o.manholes) {
        const ahead = o.z - mz;
        if (ahead >= MANHOLES.reach[0] && ahead <= MANHOLES.reach[1]) queue.push({ kind: "grid-manhole-steam", at: [x, 0.05, mz], seed: seed++ });
      }
    },
    /** Hands every queued shot to `fire`, scaled by `vfxCountScale`; empties the queue. */
    drain(o: { readonly motionOk: boolean; readonly lowTier: boolean }, fire: (shot: GridVfxShot) => void): void {
      const scale = vfxCountScale(o);
      for (const q of queue.splice(0)) {
        const base = q.kind === "grid-impact" ? impactCount(q.count ?? 12, 1) : GRID_VFX_PRESETS[q.kind].layers.reduce((n, l) => n + (l.type === "emitter" ? Number((l as { count?: number }).count ?? 0) : 0), 0);
        const options: AuraBurstOptions = {
          count: Math.max(2, Math.round(base * scale)),
          seed: q.seed,
          ...(q.speed !== undefined ? { speed: q.speed } : {}),
          ...(q.normal !== undefined ? { normal: q.normal } : {}),
          ...(q.kind === "grid-impact" ? { camera: false } : {})
        };
        fire({ kind: q.kind, at: q.at, options });
      }
    },
    get pending(): number {
      return queue.length;
    }
  };
}
