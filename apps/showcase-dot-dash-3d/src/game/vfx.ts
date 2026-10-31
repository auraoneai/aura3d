// Glint Courier — GU47 VFX preset pack (DD47-V1, V2). Workbench-electronics effects registered with
// `app.effects.registerPreset`, so `app.effects.burst("<kind>", at)` fires every layer of the spec. Pure data plus one
// registration helper (no engine runtime import) so the pack is unit-tested.
//
// Event map (main.ts): dash and cache gem -> solder-spark; surge cell -> surge-ring (the trace pulse runs in the trace
// layer, traces.ts); sentry disabled -> short-circuit; courier intercepted -> blown-fuse. Lamp-cone dust motes are an
// authored emitter in the scene (dustMotesOptions).
//
// Reduced flash (PRD §6.3): no light flicker; any light flash is one soft pulse at <= 0.3 of the full pack.
// Reduced motion: particle counts halve and nothing shakes the camera.

import type { AuraVfxEffectSpec } from "@aura3d/engine";

export const VFX_KINDS = {
  solderSpark: "solder-spark",
  surgeRing: "surge-ring",
  shortCircuit: "short-circuit",
  blownFuse: "blown-fuse"
} as const;
export type DotDashVfxKind = (typeof VFX_KINDS)[keyof typeof VFX_KINDS];

/** Live runtime-particle ceiling (DD47-V1 acceptance: liveCount <= 60 with the worst overlap below). */
export const VFX_LIVE_CAP = 60;

export interface VfxPrefs {
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
}

type Layer = AuraVfxEffectSpec["layers"][number];

const count = (n: number, prefs: VfxPrefs): number => (prefs.reducedMotion ? Math.max(1, Math.round(n / 2)) : n);

/** Light flash: full on the default pack; one soft pulse capped at 30% (no flicker) on reduced flash. */
function flash(prefs: VfxPrefs, color: string, intensity: number, range: number, duration: number, at = 0): Layer {
  return prefs.reducedFlash
    ? { type: "light", color, intensity: intensity * 0.3, range, duration: Math.min(duration, 0.2), at: 0 }
    : { type: "light", color, intensity, range, duration, at };
}

/** The four event presets for the current motion and flash settings. */
export function vfxPack(prefs: VfxPrefs): Readonly<Record<DotDashVfxKind, AuraVfxEffectSpec>> {
  return {
    // Bright tin-lead droplets off the courier's contacts: fast, short, falling.
    "solder-spark": {
      name: VFX_KINDS.solderSpark,
      layers: [
        { type: "emitter", preset: "spark", count: count(12, prefs), speed: [2.6, 5.2], life: [0.18, 0.38], gravity: -9, color: "#ffd9a0", intensity: 3.2, size: [0.025, 0.05], spread: 0.85, additive: true, sprite: "spark-streak", maxScreen: 0.02 },
        flash(prefs, "#ffc27a", 1.6, 2.2, 0.1)
      ]
    },
    // Amber shock ring off a capacitor can: flat, outward, no gravity.
    "surge-ring": {
      name: VFX_KINDS.surgeRing,
      layers: [
        { type: "emitter", preset: "ring", count: count(18, prefs), speed: [4.5, 5.5], life: [0.32, 0.42], gravity: 0, color: "#ffb23e", intensity: 2.4, size: [0.06, 0.1], spread: 1, direction: [0, 0.05, 0], additive: true, sprite: "ring-thin", maxScreen: 0.03 },
        flash(prefs, "#ffb23e", 2.4, 3.5, 0.22)
      ]
    },
    // Sentry shorted out: blue-white arcs, a puff of flux smoke and a hard flash (>= 40 hot pixels 80 ms later).
    "short-circuit": {
      name: VFX_KINDS.shortCircuit,
      layers: [
        { type: "emitter", preset: "spark-electric", count: count(11, prefs), speed: [2, 4.4], life: [0.14, 0.3], gravity: -2, color: "#bfe8ff", intensity: 4.5, size: [0.03, 0.06], spread: 1, additive: true, sprite: "electric", maxScreen: 0.03 },
        { type: "emitter", preset: "dust", count: count(4, prefs), speed: [0.3, 0.7], life: [0.6, 0.9], gravity: 0.6, color: "#6e6a66", size: [0.12, 0.2], spread: 0.6, additive: false, sprite: "smoke-a" },
        flash(prefs, "#bfe8ff", 3.2, 3, 0.08),
        ...(prefs.reducedFlash ? [] : [flash(prefs, "#bfe8ff", 1.8, 2.6, 0.06, 0.11)])
      ]
    },
    // The courier's fuse blows: a red-orange pop, glass flakes and smoke; a single steady glow on reduced flash.
    "blown-fuse": {
      name: VFX_KINDS.blownFuse,
      layers: [
        { type: "emitter", preset: "spark-fire", count: count(16, prefs), speed: [1.8, 4.6], life: [0.25, 0.55], gravity: -6, color: "#ff6a3c", intensity: 3, size: [0.03, 0.07], spread: 1, additive: true, sprite: "spark-streak", maxScreen: 0.03 },
        { type: "emitter", preset: "debris", count: count(6, prefs), speed: [1.5, 3], life: [0.5, 0.8], gravity: -9.8, color: "#d8dde6", size: [0.04, 0.08], spread: 1, additive: false, sprite: "debris-chips" },
        flash(prefs, "#ff5a3c", 3, 3.5, 0.18),
        ...(prefs.reducedFlash ? [] : [flash(prefs, "#ff5a3c", 1.6, 3, 0.08, 0.22), flash(prefs, "#ff5a3c", 1, 2.5, 0.06, 0.36)])
      ]
    }
  };
}

/** Particles the worst plausible overlap spawns (a disable chain of 4 plus a dash spark plus a surge ring). */
export function worstCaseLive(prefs: VfxPrefs): number {
  const pack = vfxPack(prefs);
  const particles = (kind: DotDashVfxKind): number =>
    pack[kind].layers.reduce((sum, layer) => sum + (layer.type === "emitter" && typeof layer.count === "number" ? layer.count : 0), 0);
  return 2 * particles("short-circuit") + particles("solder-spark") + particles("surge-ring");
}

/** Registers (or re-registers, after a settings change) every preset of the pack. */
export function registerVfxPack(effects: { registerPreset(kind: string, spec: AuraVfxEffectSpec): void } | null | undefined, prefs: VfxPrefs): boolean {
  if (!effects) return false;
  const pack = vfxPack(prefs);
  for (const kind of Object.values(VFX_KINDS)) effects.registerPreset(kind, pack[kind]);
  return true;
}

/** DD47-V2: dust motes drifting in the lamp cone (authored emitter; <= 60 particles, 30 on reduced motion). */
export function dustMotesOptions(prefs: Pick<VfxPrefs, "reducedMotion">) {
  return {
    name: "lamp motes",
    position: [-5.5, 4.2, 2.5] as [number, number, number],
    shape: "box" as const,
    shapeSize: [11, 7, 9] as [number, number, number],
    rate: prefs.reducedMotion ? 5 : 10,
    maxParticles: prefs.reducedMotion ? 30 : 60,
    lifetime: [5, 7] as [number, number],
    speed: [0.02, 0.07] as [number, number],
    // Phase 3 (4.7.1): 0.025-0.05 was sub-pixel from the play camera; the motes now read as dust in the cone.
    size: [0.08, 0.16] as [number, number],
    gravity: -0.01,
    noise: { strength: prefs.reducedMotion ? 0.04 : 0.1, frequency: 0.35 },
    color: "#ffe2b8",
    intensity: 1.1,
    sprite: "dust-mote" as const,
    blend: "additive" as const,
    seed: 1414,
    loop: true,
    prewarm: 3
  };
}
