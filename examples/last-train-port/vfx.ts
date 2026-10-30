/**
 * GU47 WP-31 LT-14 (and the LT-13 catch cue): the Lamplight Line runtime effect pack (PRD §3.2 item 3). Five registered
 * presets on E-F's registered-preset layers and built-in atlas sprites: pantograph sparks on curves, a fare sparkle when a
 * rider pays, a platform splash at Monsoon Exchange, departure dust, and the guttering lantern a catch drops. Colours come
 * from the identity palette: lamplight amber for light, cream and apricot for dust; cherry red is reserved for the
 * objective and never used here. Reduced motion halves every emission (PRD §6.3).
 */
import type { AuraVfxEffectSpec } from "@aura3d/engine";
import { LAMPLIGHT_PALETTE } from "./bands";

export type LamplightVfxKind = "lamplight-pantograph" | "lamplight-fare" | "lamplight-splash" | "lamplight-dust" | "lamplight-gutter";

export const LAMPLIGHT_VFX_KINDS: readonly LamplightVfxKind[] = ["lamplight-pantograph", "lamplight-fare", "lamplight-splash", "lamplight-dust", "lamplight-gutter"];

/** Live-particle ceiling for a dense moment (art direction tiers.high.particles). Sum of one of each: 10 + 8 + 12 + 14 + 6 = 50. */
export const LAMPLIGHT_VFX_LIVE_CAP = 96;
/** LT-14: no effect covers more than 5% of the screen. */
export const LAMPLIGHT_VFX_MAX_SCREEN = 0.05;

export function lamplightVfxPresets(reducedMotion = false): Readonly<Record<LamplightVfxKind, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.round(reducedMotion ? count / 2 : count));
  const P = LAMPLIGHT_PALETTE;
  return {
    "lamplight-pantograph": {
      name: "lamplight-pantograph",
      layers: [
        { type: "emitter", preset: "spark-electric", count: n(10), speed: [2, 5], life: [0.12, 0.3], size: [0.02, 0.05], color: "#fff1c8", intensity: 3, sprite: "spark-streak", additive: true, gravity: -6, maxScreen: 0.02 },
        { type: "light", intensity: 2.5, range: 6, duration: 0.08, color: "#cfe0ff" }
      ]
    },
    "lamplight-fare": {
      name: "lamplight-fare",
      layers: [
        { type: "emitter", preset: "pickup-gold", count: n(8), speed: [0.8, 1.8], life: [0.35, 0.6], size: [0.05, 0.09], color: P.lamplight, intensity: 2.2, sprite: "glow", additive: true, direction: [0, 1, 0], spread: 0.6, maxScreen: 0.02 }
      ]
    },
    "lamplight-splash": {
      name: "lamplight-splash",
      layers: [
        { type: "emitter", preset: "splash", count: n(12), speed: [1.5, 3.2], life: [0.3, 0.55], size: [0.05, 0.1], color: "#cfdcef", intensity: 1, sprite: "splash", additive: false, gravity: -9, direction: [0, 1, 0], spread: 0.9, maxScreen: 0.04 }
      ]
    },
    "lamplight-dust": {
      name: "lamplight-dust",
      layers: [
        { type: "emitter", preset: "dust-clay", count: n(14), speed: [0.6, 1.6], life: [0.8, 1.4], size: [0.25, 0.55], color: P.apricot, intensity: 0.6, sprite: "dust-mote", additive: false, drag: 1.8, spread: 1.4, maxScreen: LAMPLIGHT_VFX_MAX_SCREEN }
      ]
    },
    "lamplight-gutter": {
      name: "lamplight-gutter",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(6), speed: [0.4, 1.2], life: [0.5, 0.9], size: [0.04, 0.08], color: P.lamplight, intensity: 2, sprite: "flame-loop", additive: true, gravity: -2, maxScreen: 0.02 },
        { type: "light", intensity: 1.8, range: 5, duration: 0.6, color: P.lamplight }
      ]
    }
  };
}

/** Anything with E-F's `registerPreset` (the app's `effects` extension). */
export interface LamplightPresetRegistry {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
}

/** Registers the pack; returns the kinds registered (the QA hook lists them; LT-14 "4 presets registered"). */
export function registerLamplightVfx(effects: LamplightPresetRegistry | undefined, reducedMotion = false): readonly LamplightVfxKind[] {
  if (!effects) return [];
  const presets = lamplightVfxPresets(reducedMotion);
  for (const kind of LAMPLIGHT_VFX_KINDS) effects.registerPreset(kind, presets[kind]);
  return LAMPLIGHT_VFX_KINDS;
}

/**
 * Event detection from two consecutive sim snapshots (read-only; gameplay untouched). Returns the effect kinds to spawn this
 * frame: departure dust when the doors finish closing, a fare sparkle per fare paid, pantograph sparks on a hard curve at
 * speed (rate-limited by the caller), a splash on arrival at Monsoon Exchange in the rain, a gutter on a catch.
 */
export interface VfxSimView {
  readonly phase: string;
  readonly fares: number;
  readonly catches: number;
  readonly speed: number;
  readonly roll: number;
  readonly leg: number;
}
export function vfxEvents(prev: VfxSimView, now: VfxSimView, weather: "clear" | "rain" | "snow"): LamplightVfxKind[] {
  const out: LamplightVfxKind[] = [];
  if (prev.phase === "closing" && now.phase === "enroute") out.push("lamplight-dust");
  if (now.fares > prev.fares) out.push("lamplight-fare");
  if (now.catches > prev.catches) out.push("lamplight-gutter");
  if (prev.phase === "enroute" && now.phase === "docked" && weather === "rain") out.push("lamplight-splash");
  if (now.phase === "enroute" && Math.abs(now.speed) > 6 && Math.abs(now.roll) > 0.18) out.push("lamplight-pantograph");
  return out;
}
