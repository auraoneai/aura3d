/**
 * IRON CROWN runtime VFX pack (GU47 WP-15, PRD §3.2 item 3; IC47-V1, IC47-V2): the game's own effect kinds, registered
 * on `app.effects` with `registerPreset` (E-F) and fired through `burst`. Pure tables plus one installer, so the unit
 * tests read the presets without an app.
 *
 * Combat (V1), fired from read-only combat events in main.ts (gameplay unchanged):
 * - `ic-forge-spark`: a hit. White-hot amber sparks and a short amber flash light (the hit crop's amber hot pixels).
 * - `ic-guard-ember`: a blocked hit. Cold cyan-blue embers (hue 180-210 deg) off the guard, no light.
 * - `ic-special-burst`: a special. Aura burst plus a ring in the fighter's special colour (passed per burst).
 * - `ic-ko-shower`: the K.O. A molten-gold spark shower with falling embers and a gold light.
 * Ambient and celebration (V2):
 * - `ic-forge-embers`: embers rising off the Crown's braziers (spawned at intervals, one-shot bursts).
 * - `ic-lantern-motes`: warm motes drifting off the Dock's lanterns.
 * - `ic-dust-devil`: a gust of ochre dust across the Colosseum sand.
 * - `ic-win-confetti`: gold confetti over the winner on the hero shot.
 *
 * Every preset is one-shot (bursts), so `liveCount` returns to 0 within the longest life (1.2 s for combat). Reduced
 * motion halves every count (PRD §6.3); reduced flash drops every light layer and the impact flash (PRD §6.3); Low tier
 * halves the counts again (PRD §6.4). The worst case of all live presets stays far under the 2,000-particle budget.
 */
import type { AuraVfxEffectSpec } from "@aura3d/engine";
import { MOLTEN_GOLD } from "./look";

export type IronCrownVfxKind =
  | "ic-forge-spark"
  | "ic-guard-ember"
  | "ic-special-burst"
  | "ic-ko-shower"
  | "ic-forge-embers"
  | "ic-lantern-motes"
  | "ic-dust-devil"
  | "ic-win-confetti";

/** Block sparks: cold steel blue (hue about 196 deg), the guard's colour. */
export const GUARD_EMBER = "#4fc8ff";
export const FORGE_AMBER = "#ffb347";
export const KO_GOLD = "#ffcf5a";

type Layer = AuraVfxEffectSpec["layers"][number];

const FULL_PRESETS: Readonly<Record<IronCrownVfxKind, AuraVfxEffectSpec>> = {
  "ic-forge-spark": {
    name: "ic-forge-spark",
    layers: [
      { type: "emitter", preset: "spark-fire", count: 26, speed: [3.2, 7.5], life: [0.18, 0.5], gravity: -9.8, color: FORGE_AMBER, intensity: 3.6, size: [0.025, 0.06], spread: 0.95, additive: true, drag: 1.4, maxScreen: 0.02 },
      { type: "emitter", preset: "impact-flash", count: 2, life: [0.06, 0.1], color: "#fff1c8", intensity: 2.4, size: [0.22, 0.34], spread: 0.15, additive: true, maxScreen: 0.05 },
      { type: "light", intensity: 5, range: 4.5, duration: 0.12, color: FORGE_AMBER }
    ]
  },
  "ic-guard-ember": {
    name: "ic-guard-ember",
    layers: [
      { type: "emitter", preset: "spark-ice", count: 16, speed: [1.6, 4], life: [0.2, 0.45], gravity: -6, color: GUARD_EMBER, intensity: 2.6, size: [0.02, 0.05], spread: 0.7, additive: true, drag: 2, maxScreen: 0.02 },
      { type: "emitter", preset: "ring", count: 14, speed: [2.2, 2.8], life: [0.16, 0.26], gravity: 0, color: GUARD_EMBER, intensity: 1.8, size: [0.03, 0.05], spread: 1, additive: true, sprite: "ring-thin" }
    ]
  },
  "ic-special-burst": {
    name: "ic-special-burst",
    layers: [
      { type: "emitter", preset: "aura-burst", count: 36, speed: [2.4, 5.4], life: [0.3, 0.75], gravity: -1.5, color: MOLTEN_GOLD, intensity: 3, size: [0.04, 0.1], spread: 1, additive: true, maxScreen: 0.03 },
      { type: "emitter", preset: "ring", count: 24, speed: [3.4, 4.2], life: [0.25, 0.4], gravity: 0, color: MOLTEN_GOLD, intensity: 2.2, size: [0.04, 0.07], spread: 1, additive: true, direction: [0, 0.05, 0], sprite: "ring" },
      { type: "light", intensity: 7, range: 6, duration: 0.3, color: MOLTEN_GOLD }
    ]
  },
  "ic-ko-shower": {
    name: "ic-ko-shower",
    layers: [
      { type: "emitter", preset: "spark-gold", count: 60, speed: [3.5, 8.5], life: [0.4, 1.1], gravity: -9.8, color: KO_GOLD, intensity: 3.4, size: [0.03, 0.07], spread: 1, additive: true, drag: 0.8, direction: [0, 1, 0], maxScreen: 0.02 },
      { type: "emitter", preset: "spark-fire", count: 24, speed: [0.6, 1.8], life: [0.6, 1.2], gravity: -2.5, color: "#ff6a2a", intensity: 2.2, size: [0.03, 0.06], spread: 0.9, additive: true, sprite: "glow" },
      { type: "light", intensity: 9, range: 7, duration: 0.45, color: KO_GOLD }
    ]
  },
  "ic-forge-embers": {
    name: "ic-forge-embers",
    layers: [
      { type: "emitter", preset: "spark-fire", count: 10, speed: [0.4, 1.1], life: [1.2, 2.2], gravity: 1.2, color: "#ff7a2e", intensity: 2, size: [0.02, 0.045], spread: 0.35, additive: true, direction: [0, 1, 0], drag: 0.6, sprite: "glow" }
    ]
  },
  "ic-lantern-motes": {
    name: "ic-lantern-motes",
    layers: [
      { type: "emitter", preset: "pickup-gold", count: 6, speed: [0.15, 0.45], life: [1.6, 2.6], gravity: 0.35, color: "#ffc76a", intensity: 1.6, size: [0.02, 0.04], spread: 0.6, additive: true, sprite: "dust-mote" }
    ]
  },
  "ic-dust-devil": {
    name: "ic-dust-devil",
    layers: [
      { type: "emitter", preset: "dust-sand", count: 14, speed: [0.8, 2.2], life: [0.9, 1.6], gravity: 0.2, color: "#c9a46a", size: [0.25, 0.6], spread: 0.5, additive: false, direction: [1, 0.25, 0], sprite: "smoke-a", maxScreen: 0.08 }
    ]
  },
  "ic-win-confetti": {
    name: "ic-win-confetti",
    layers: [
      { type: "emitter", preset: "pickup-gold", count: 48, speed: [2.5, 5], life: [0.9, 1.6], gravity: -4.5, color: KO_GOLD, intensity: 1.8, size: [0.035, 0.07], spread: 0.85, additive: false, direction: [0, 1, 0], drag: 1.2, sprite: "debris-chips" }
    ]
  }
};

export interface VfxComfort {
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
  readonly lowTier: boolean;
}

/** Particle scale for the comfort settings (PRD §6.3: emission halves; §6.4 Low: half). */
export function vfxCountScale(comfort: VfxComfort): number {
  return (comfort.reducedMotion ? 0.5 : 1) * (comfort.lowTier ? 0.5 : 1);
}

function scaleLayer(layer: Layer, scale: number): Layer {
  const count = layer.count;
  return typeof count === "number" ? { ...layer, count: Math.max(1, Math.round(count * scale)) } : layer;
}

/** A flash layer is a light or an impact/super flash emitter (PRD §6.3 reduced flash drops them). */
function isFlashLayer(layer: Layer): boolean {
  return layer.type === "light" || layer.preset === "impact-flash" || layer.preset === "super-flash";
}

/** The pack for the comfort settings: counts scaled, flash layers dropped on reduced flash. */
export function ironCrownVfxPresets(comfort: VfxComfort): Readonly<Record<IronCrownVfxKind, AuraVfxEffectSpec>> {
  const scale = vfxCountScale(comfort);
  const out = {} as Record<IronCrownVfxKind, AuraVfxEffectSpec>;
  for (const [kind, spec] of Object.entries(FULL_PRESETS) as [IronCrownVfxKind, AuraVfxEffectSpec][]) {
    const layers = spec.layers.filter((layer) => !(comfort.reducedFlash && isFlashLayer(layer))).map((layer) => scaleLayer(layer, scale));
    out[kind] = { ...spec, layers };
  }
  return out;
}

export const IRON_CROWN_VFX_KINDS = Object.keys(FULL_PRESETS) as readonly IronCrownVfxKind[];

/** Particles one burst of a preset emits (sum of its emitter counts). */
export function presetParticles(spec: AuraVfxEffectSpec): number {
  return spec.layers.reduce((sum, layer) => sum + (layer.type === "emitter" && typeof layer.count === "number" ? layer.count : 0), 0);
}

/** Longest particle or light life of a preset, seconds (liveCount returns to 0 after it). */
export function presetLifeSeconds(spec: AuraVfxEffectSpec): number {
  let longest = 0;
  for (const layer of spec.layers) {
    const life = layer.life ?? layer.lifetime;
    if (Array.isArray(life)) longest = Math.max(longest, Number(life[1] ?? life[0] ?? 0));
    else if (typeof life === "number") longest = Math.max(longest, life);
    if (layer.type === "light" && typeof layer.duration === "number") longest = Math.max(longest, layer.duration);
  }
  return longest;
}

interface EffectsLike {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
  runtime: "on" | "off";
}

/**
 * Registers the pack on an app's effects surface and turns runtime effects back on: the floating-dot cause is fixed in
 * the engine (E-F), so the 4.5 `effects.runtime = "off"` workaround goes. `?vfx=off` still turns them off.
 */
export function installIronCrownVfx(effects: EffectsLike | undefined, comfort: VfxComfort, vfxParam: string | null): boolean {
  if (!effects) return false;
  for (const [kind, spec] of Object.entries(ironCrownVfxPresets(comfort))) effects.registerPreset(kind, spec);
  effects.runtime = vfxParam === "off" ? "off" : "on";
  return effects.runtime === "on";
}
