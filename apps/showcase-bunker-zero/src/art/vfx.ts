/**
 * GU47 WP-21 runtime effect pack (PRD §3.2 item 3): one registered preset per gameplay event, on E-F's preset layers
 * and builtin atlas sprites. The signature is "gunfire lights the room": every shot, impact and blast carries a light
 * layer, which flashes one of the engine's pre-allocated transient lights (Medium 2, High 4, Ultra 8; Low has none, so
 * there the muzzle sprite, sparks and bloom carry the cue, PRD §6.4). The muzzle light is warm white on every floor so
 * the floor's lamp colour stays the room's colour between shots.
 *
 * Reduced motion (PRD §6.3) halves every emission and caps camera layers at 30%; reduced flash caps the light layers at
 * a third of their peak. Counts keep a heavy fire-fight under the art direction's 600 live particles (BZ-09 budget).
 */
import type { AuraVfxEffectSpec } from "@aura3d/engine";
import { BZ_PALETTE } from "./look";

export const BZ_VFX_KINDS = [
  "bz-muzzle", "bz-enemy-muzzle", "bz-impact", "concrete-chip", "bz-blast", "bz-door-dust", "bz-pushwall-debris", "bz-pickup"
] as const;
export type BunkerVfxKind = (typeof BZ_VFX_KINDS)[number];

/** Gameplay event (main.ts handleEvent / sim records) -> preset. */
export const BZ_VFX_EVENTS: Readonly<Record<string, BunkerVfxKind>> = {
  "player-fire": "bz-muzzle",
  "enemy-fire": "bz-enemy-muzzle",
  "bullet-impact": "bz-impact",
  "wall-chip": "concrete-chip",
  "rocket-or-barrel-blast": "bz-blast",
  "door-slide": "bz-door-dust",
  "push-wall": "bz-pushwall-debris",
  "pickup": "bz-pickup"
};

/** Live-particle ceiling of the pack plus the floor atmosphere (PRD WP-21 budget: <= 600 particles). */
export const BZ_PARTICLE_BUDGET = 600;
/** Warm white of the gunfire light, independent of the floor lamp. */
export const BZ_GUNFIRE_COLOR = "#ffd59a";
const EMBER = "#ff8a3a";
const CONCRETE_DUST = "#9a958a";

export interface BunkerVfxOptions {
  readonly reducedMotion?: boolean;
  readonly reducedFlash?: boolean;
}

/** The pack, keyed by registered kind (each spec's `name` equals its key). */
export function bunkerVfxPresets(options: BunkerVfxOptions = {}): Readonly<Record<BunkerVfxKind, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.round(options.reducedMotion ? count / 2 : count));
  const flash = (intensity: number): number => (options.reducedFlash ? +(intensity / 3).toFixed(3) : intensity);
  const shake = (amount: number): number => +(options.reducedMotion ? amount * 0.3 : amount).toFixed(3);
  return {
    "bz-muzzle": {
      name: "bz-muzzle",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(6), speed: [4, 9], life: [0.04, 0.09], size: [0.04, 0.08], color: BZ_GUNFIRE_COLOR, intensity: 3.2, sprite: "muzzle", additive: true, spread: 0.5, maxScreen: 0.06 },
        { type: "light", intensity: flash(14), range: 9, duration: 0.09, color: BZ_GUNFIRE_COLOR }
      ]
    },
    "bz-enemy-muzzle": {
      name: "bz-enemy-muzzle",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(4), speed: [3, 7], life: [0.04, 0.08], size: [0.04, 0.07], color: BZ_GUNFIRE_COLOR, intensity: 2.6, sprite: "muzzle", additive: true, spread: 0.6, maxScreen: 0.04 },
        { type: "light", intensity: flash(8), range: 7, duration: 0.08, color: BZ_GUNFIRE_COLOR }
      ]
    },
    "bz-impact": {
      name: "bz-impact",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(10), speed: [3, 8], life: [0.12, 0.3], size: [0.02, 0.05], color: EMBER, intensity: 2.4, sprite: "spark-streak", additive: true, spread: 1.1, gravity: -9, maxScreen: 0.04 },
        { type: "light", intensity: flash(5), range: 4, duration: 0.07, color: EMBER }
      ]
    },
    "concrete-chip": {
      name: "concrete-chip",
      layers: [
        { type: "emitter", preset: "debris", count: n(8), speed: [2, 5], life: [0.35, 0.7], size: [0.02, 0.05], color: BZ_PALETTE.concrete, sprite: "debris-chips", additive: false, gravity: -12, spread: 0.9, maxScreen: 0.03 },
        { type: "emitter", preset: "dust", count: n(5), speed: [0.4, 1.2], life: [0.6, 1.2], size: [0.12, 0.26], color: CONCRETE_DUST, sprite: "smoke-a", additive: false, drag: 2.2, maxScreen: 0.05 }
      ]
    },
    "bz-blast": {
      name: "bz-blast",
      layers: [
        { type: "emitter", preset: "explosion-small", count: n(18), speed: [3, 9], life: [0.25, 0.6], size: [0.3, 0.7], color: EMBER, intensity: 3.5, sprite: "fireball", additive: true, maxScreen: 0.35 },
        { type: "emitter", preset: "debris", count: n(14), speed: [4, 10], life: [0.5, 1.1], size: [0.03, 0.08], color: BZ_PALETTE.rust, sprite: "debris-chips", additive: false, gravity: -14, maxScreen: 0.05 },
        { type: "emitter", preset: "dust", count: n(10), speed: [0.6, 2], life: [1.2, 2.4], size: [0.6, 1.4], color: "#3a3630", sprite: "smoke-b", additive: false, drag: 1.6, maxScreen: 0.4 },
        { type: "light", intensity: flash(32), range: 14, duration: 0.45, color: EMBER },
        { type: "camera", shake: shake(0.35) }
      ]
    },
    "bz-door-dust": {
      name: "bz-door-dust",
      layers: [
        { type: "emitter", preset: "dust", count: n(12), speed: [0.3, 1.1], life: [0.8, 1.6], size: [0.2, 0.5], color: CONCRETE_DUST, sprite: "dust-mote", additive: false, drag: 2, direction: [0, 0.4, 0], spread: 1.4, maxScreen: 0.08 }
      ]
    },
    "bz-pushwall-debris": {
      name: "bz-pushwall-debris",
      layers: [
        { type: "emitter", preset: "debris", count: n(12), speed: [1, 3.5], life: [0.5, 1], size: [0.03, 0.07], color: BZ_PALETTE.concrete, sprite: "debris-chips", additive: false, gravity: -12, maxScreen: 0.04 },
        { type: "emitter", preset: "dust", count: n(14), speed: [0.3, 1], life: [1, 2], size: [0.3, 0.7], color: CONCRETE_DUST, sprite: "smoke-a", additive: false, drag: 1.8, maxScreen: 0.12 }
      ]
    },
    "bz-pickup": {
      name: "bz-pickup",
      layers: [
        { type: "emitter", preset: "pickup-gold", count: n(8), speed: [0.8, 2], life: [0.3, 0.55], size: [0.03, 0.06], color: BZ_PALETTE.objective, intensity: 2, sprite: "glow", additive: true, direction: [0, 1, 0], spread: 0.8, maxScreen: 0.03 }
      ]
    }
  };
}

/** Upper bound of live particles one burst of each preset adds (sum of emitter counts). */
export function presetParticleCount(spec: AuraVfxEffectSpec): number {
  return spec.layers.reduce((sum, layer) => sum + (layer.type === "emitter" ? Number(layer.count ?? 0) : 0), 0);
}

/** Anything with E-F's `registerPreset` (the app's `effects` extension). */
export interface BunkerPresetRegistry {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
}

/** Register the pack; returns the kinds registered (the QA hook lists them). */
export function registerBunkerVfx(effects: BunkerPresetRegistry | undefined, options: BunkerVfxOptions = {}): readonly BunkerVfxKind[] {
  if (!effects) return [];
  const presets = bunkerVfxPresets(options);
  for (const kind of BZ_VFX_KINDS) effects.registerPreset(kind, presets[kind]);
  return BZ_VFX_KINDS;
}

// ---------------------------------------------------------------------------------------------------------------
// BZ-09: per-floor atmosphere (looping authored specs spawned on the active floor only; stopped on a floor change)

/** One looping atmosphere emitter: where it sits (cell centre, height) and its spec. */
export interface BunkerAtmosphereEmitter {
  readonly cell: readonly [number, number];
  readonly y: number;
  readonly spec: AuraVfxEffectSpec;
}

/** Live-particle cap of one atmosphere emitter per tier (Low gets one emitter at half size). */
export const BZ_ATMOSPHERE_MAX = { low: 40, medium: 70, high: 90, ultra: 90 } as const;

type AtmosphereKind = "dust" | "embers" | "drips" | "sparks";
function atmosphereSpec(kind: AtmosphereKind, lamp: string, max: number, reducedMotion: boolean): AuraVfxEffectSpec {
  const cap = Math.max(8, Math.round(reducedMotion ? max / 2 : max));
  const base = { type: "emitter" as const, loop: true, maxParticles: cap, shape: "box" as const, additive: false };
  switch (kind) {
    case "dust":
      return { name: "bz-atmo-dust", layers: [{ ...base, rate: cap / 6, shapeSize: [4, 2.2, 4], lifetime: [5, 7], speed: [0.02, 0.08], size: [0.02, 0.05], gravity: -0.02, drag: 0.6, color: lamp, intensity: 0.9, sprite: "dust-mote", maxScreen: 0.01 }] };
    case "embers":
      return { name: "bz-atmo-embers", layers: [{ ...base, rate: cap / 2.5, shapeSize: [3, 0.2, 3], lifetime: [1.6, 2.6], speed: [0.4, 1.2], size: [0.015, 0.035], gravity: 0.6, color: "#ff8a3a", intensity: 3, sprite: "glow", additive: true, maxScreen: 0.008 }] };
    case "drips":
      return { name: "bz-atmo-drips", layers: [{ ...base, rate: cap / 1.2, shapeSize: [3, 0.05, 3], lifetime: [0.7, 0.9], speed: [0, 0.1], size: [0.01, 0.02], gravity: -9.8, color: "#b8d8d0", intensity: 0.8, sprite: "spark-streak", maxScreen: 0.006 }] };
    case "sparks":
      return { name: "bz-atmo-sparks", layers: [{ ...base, rate: cap / 3, shapeSize: [1.2, 0.05, 1.2], lifetime: [0.5, 0.9], speed: [0.5, 1.5], size: [0.01, 0.025], gravity: -9.8, color: "#dff1ff", intensity: 3, sprite: "spark-streak", additive: true, maxScreen: 0.008 }] };
  }
}

/** The floor's emitters: dust in the key and fill cones everywhere, plus F2 drips, F3 embers and F5 falling sparks. */
export function atmosphereEmitters(
  look: { readonly slot: number; readonly lamp: { readonly color: string }; readonly key: { readonly target: readonly [number, number] }; readonly fill: { readonly target: readonly [number, number] } },
  wallHeight: number,
  options: { readonly tier?: keyof typeof BZ_ATMOSPHERE_MAX; readonly reducedMotion?: boolean } = {}
): readonly BunkerAtmosphereEmitter[] {
  const tier = options.tier ?? "high";
  const max = BZ_ATMOSPHERE_MAX[tier];
  const rm = Boolean(options.reducedMotion);
  const out: BunkerAtmosphereEmitter[] = [{ cell: look.key.target, y: wallHeight * 0.55, spec: atmosphereSpec("dust", look.lamp.color, max, rm) }];
  if (tier === "low") return out;
  const extra: AtmosphereKind | null = look.slot === 1 ? "drips" : look.slot === 2 ? "embers" : look.slot === 4 ? "sparks" : null;
  if (extra) out.push({ cell: look.fill.target, y: extra === "embers" ? 0.3 : wallHeight - 0.1, spec: atmosphereSpec(extra, look.lamp.color, max, rm) });
  out.push({ cell: look.fill.target, y: wallHeight * 0.55, spec: atmosphereSpec("dust", look.lamp.color, max, rm) });
  return out;
}

/** Upper bound of live atmosphere particles on a floor (sum of the emitters' caps). */
export function atmosphereParticleCap(emitters: readonly BunkerAtmosphereEmitter[]): number {
  return emitters.reduce((sum, e) => sum + e.spec.layers.reduce((s, l) => s + Number((l as { maxParticles?: number }).maxParticles ?? 0), 0), 0);
}
