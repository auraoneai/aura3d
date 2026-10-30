/**
 * Aura Diamond 3D runtime VFX pack (GU47 DIA-V1). Seven registered presets, one per gameplay beat, in the park's own
 * colours: the bat-crack splinter flash (the signature effect), clay puffs, chalk puffs, home-run fireworks, canyon
 * dust, dome confetti and lunar regolith arcs. Every emitter samples an E-F atlas sprite (chips, smoke, streaks), so no
 * beat reads as a soft disc.
 *
 * Pure data: no engine import. `registerDiamondVfx` takes anything with `registerPreset(kind, spec)` (the app's
 * `app.effects`); the specs are structurally `AuraVfxEffectSpec`. Presets are re-registered on every park switch (a
 * registered name overrides the previous one). Presentation only: no sim state, no `G.rng`; burst seeds come from the
 * caller's own counter.
 */
import type { ParkId } from "../src/rules";
import { PARK_LOOKS } from "./look";

/** One preset layer (`emitter`, `light` or `camera`), structurally an `AuraVfxEffectSpec` layer. */
export interface DiamondVfxLayer {
  readonly type: "emitter" | "light" | "camera";
  readonly at?: number;
  readonly [field: string]: unknown;
}

export interface DiamondVfxSpec {
  readonly name: string;
  readonly layers: readonly DiamondVfxLayer[];
}

export type DiamondVfxKind =
  | "diamond-bat-crack"
  | "diamond-clay-puff"
  | "diamond-chalk-puff"
  | "diamond-hr-firework"
  | "diamond-canyon-dust"
  | "diamond-dome-confetti"
  | "diamond-regolith-arc";

export const DIAMOND_VFX_KINDS: readonly DiamondVfxKind[] = [
  "diamond-bat-crack",
  "diamond-clay-puff",
  "diamond-chalk-puff",
  "diamond-hr-firework",
  "diamond-canyon-dust",
  "diamond-dome-confetti",
  "diamond-regolith-arc"
];

export interface DiamondVfxOptions {
  /** PRD 6.3: particle emission halves. */
  readonly reducedMotion: boolean;
  /** PRD 6.3: no light flash, flash sprites capped at 0.3 of their energy. */
  readonly reducedFlash: boolean;
}

/** Engine pool cap (`EFFECT_INSTANCE_CAP`); one emitter layer is one pooled instance. */
export const DIAMOND_VFX_INSTANCE_CAP = 96;

const count = (n: number, o: DiamondVfxOptions): number => Math.max(1, Math.round(o.reducedMotion ? n / 2 : n));

/** Every preset of the pack for one park. */
export function diamondVfxPresets(park: ParkId, options: DiamondVfxOptions): Readonly<Record<DiamondVfxKind, DiamondVfxSpec>> {
  const row = PARK_LOOKS[park];
  const sig = row.signature;
  const flashEnergy = options.reducedFlash ? 0.3 : 1;
  const g = sig.gravityScale;
  const crowdA = row.crowd[0] ?? row.accent;
  const crowdB = row.crowd[3] ?? row.turf.chalk;
  const light = (layer: DiamondVfxLayer): readonly DiamondVfxLayer[] => (options.reducedFlash ? [] : [layer]);
  return {
    // Signature: ash splinters off the barrel, a white-hot contact flare and a few streaks, plus a 0.1 s light kick.
    "diamond-bat-crack": {
      name: "diamond-bat-crack",
      layers: [
        { type: "emitter", preset: "debris", sprite: "debris-chips", count: count(16, options), speed: [3.5, 7.5], life: [0.35, 0.7], gravity: -9.8 * g, color: sig.splinter, size: [0.025, 0.06], spread: 0.9, drag: 0.6, maxScreen: 0.025, additive: false },
        { type: "emitter", preset: "impact-flash", sprite: "flare", count: 2, speed: [0.2, 0.6], life: [0.06, 0.1], gravity: 0, color: sig.flash, intensity: 3 * sig.flashIntensity * flashEnergy, size: [0.18, 0.28], spread: 0.2, maxScreen: 0.09, additive: true },
        { type: "emitter", preset: "spark", sprite: "spark-streak", count: count(8, options), speed: [5, 9], life: [0.12, 0.25], gravity: -4 * g, color: sig.flash, intensity: 2.5 * flashEnergy, size: [0.015, 0.03], spread: 0.7, maxScreen: 0.02, additive: true },
        ...light({ type: "light", intensity: 6 * sig.flashIntensity, range: 5, duration: 0.1, color: sig.flash })
      ]
    },
    // A ball landing on the infield or the warning track: terracotta clay smoke.
    "diamond-clay-puff": {
      name: "diamond-clay-puff",
      layers: [
        { type: "emitter", preset: "dust-clay", sprite: "smoke-a", count: count(12, options), speed: [0.6, 1.6], life: [0.6, 1.1], gravity: -0.3, color: row.turf.clay, size: [0.18, 0.4], spread: 0.8, maxScreen: 0.06, additive: false }
      ]
    },
    // A ball landing on a foul line kicks up chalk.
    "diamond-chalk-puff": {
      name: "diamond-chalk-puff",
      layers: [
        { type: "emitter", preset: "dust", sprite: "smoke-b", count: count(8, options), speed: [0.4, 1.1], life: [0.5, 0.9], gravity: -0.2, color: row.turf.chalk, size: [0.12, 0.26], spread: 0.6, maxScreen: 0.05, additive: false }
      ]
    },
    // Home run over the wall: two shells of gold streaks in the park accent, the second 0.25 s later.
    "diamond-hr-firework": {
      name: "diamond-hr-firework",
      layers: [
        { type: "emitter", preset: "spark-gold", sprite: "spark-streak", count: count(36, options), speed: [6, 10], life: [0.7, 1.3], gravity: -3.5, color: row.accent, intensity: 3 * flashEnergy, size: [0.06, 0.12], spread: 1, drag: 0.4, maxScreen: 0.03, additive: true },
        { type: "emitter", at: 0.25, preset: "spark-gold", sprite: "spark-streak", count: count(28, options), speed: [5, 8], life: [0.6, 1.1], gravity: -3.5, color: crowdA, intensity: 2.6 * flashEnergy, size: [0.05, 0.1], spread: 1, drag: 0.4, maxScreen: 0.03, additive: true },
        ...light({ type: "light", intensity: 10, range: 14, duration: 0.5, color: row.accent })
      ]
    },
    // Canyon Rim: a landing raises desert dust that hangs in the noon air.
    "diamond-canyon-dust": {
      name: "diamond-canyon-dust",
      layers: [
        { type: "emitter", preset: "dust-sand", sprite: "smoke-b", count: count(14, options), speed: [0.8, 2.2], life: [1.0, 1.8], gravity: -0.15, color: row.fog ? row.fog.color : row.turf.clay, size: [0.3, 0.7], spread: 0.9, maxScreen: 0.08, additive: false }
      ]
    },
    // Typhoon Dome: confetti cannons from the roof in two crowd colours (a home-run celebration indoors).
    "diamond-dome-confetti": {
      name: "diamond-dome-confetti",
      layers: [
        { type: "emitter", preset: "debris", sprite: "debris-chips", count: count(30, options), speed: [3, 6], life: [1.6, 2.6], gravity: -1.2, color: crowdA, size: [0.04, 0.08], spread: 1, drag: 1.2, maxScreen: 0.02, additive: false },
        { type: "emitter", at: 0.15, preset: "debris", sprite: "debris-chips", count: count(30, options), speed: [3, 6], life: [1.6, 2.6], gravity: -1.2, color: crowdB, size: [0.04, 0.08], spread: 1, drag: 1.2, maxScreen: 0.02, additive: false }
      ]
    },
    // Lunar Park: grey regolith thrown in slow airless arcs at one-sixth gravity (no drag, long life).
    "diamond-regolith-arc": {
      name: "diamond-regolith-arc",
      layers: [
        { type: "emitter", preset: "debris", sprite: "dust-mote", count: count(18, options), speed: [1.5, 3.5], life: [1.6, 2.8], gravity: -1.63, color: row.turf.clay, size: [0.04, 0.1], spread: 0.7, drag: 0, maxScreen: 0.03, additive: false }
      ]
    }
  };
}

export interface DiamondEffectsRegistry {
  registerPreset(kind: string, spec: DiamondVfxSpec): void;
}

/** Registers the pack for `park`; returns the registered kinds (7 `registerPreset` calls). */
export function registerDiamondVfx(effects: DiamondEffectsRegistry, park: ParkId, options: DiamondVfxOptions): readonly DiamondVfxKind[] {
  const presets = diamondVfxPresets(park, options);
  for (const kind of DIAMOND_VFX_KINDS) effects.registerPreset(kind, presets[kind]);
  return DIAMOND_VFX_KINDS;
}

/** Pooled instances one firing of `kind` takes (its emitter layers). */
export function vfxInstances(spec: DiamondVfxSpec): number {
  return spec.layers.filter((layer) => layer.type === "emitter").length;
}

/** Juice events mapped onto the pack (the FX pass routes `diamond-*` kinds to `app.effects.burst`). */
export function juiceFxKind(event: "crack" | "homer" | "landing", park: ParkId): DiamondVfxKind {
  const row = PARK_LOOKS[park];
  if (event === "crack") return "diamond-bat-crack";
  if (event === "homer") return row.celebration;
  return row.landingFx;
}

/**
 * What a landing ball kicks up: chalk on a foul line (within 1.5 degrees of it), otherwise the park's landing effect
 * (clay, canyon dust or regolith).
 */
export function landingFxKind(park: ParkId, landThetaDeg: number, foulDeg: number): DiamondVfxKind {
  if (Math.abs(Math.abs(landThetaDeg) - foulDeg) <= 1.5) return "diamond-chalk-puff";
  return PARK_LOOKS[park].landingFx;
}

export const isDiamondVfxKind = (kind: string): kind is DiamondVfxKind => (DIAMOND_VFX_KINDS as readonly string[]).includes(kind);
