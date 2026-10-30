/**
 * Cross Hop VFX preset pack (GU47 WP-24 CH47-13, PRD §3.2 item 3). Registers the game's runtime effect kinds with
 * `app.effects.registerPreset` (E-F) and picks the kind per gameplay event. Pure presentation: the sim never reads it.
 */
import type { AuraVfxEffectSpec } from "@aura3d/engine";
import type { Death } from "./core";

/** One kind per gameplay event; every name is unique to Cross Hop. */
export const CROSS_HOP_VFX = {
  landDust: "crosshop-land-dust",
  logSplash: "crosshop-log-splash",
  logRing: "crosshop-log-ring",
  lavaSparks: "crosshop-lava-sparks",
  coin: "crosshop-coin-pickup",
  rescue: "crosshop-rescue-pop",
  deathSquashed: "crosshop-death-squashed",
  deathFlattened: "crosshop-death-flattened",
  deathDrowned: "crosshop-death-drowned",
  deathBurned: "crosshop-death-burned",
  deathSnatched: "crosshop-death-snatched"
} as const;

export type CrossHopVfxKind = (typeof CROSS_HOP_VFX)[keyof typeof CROSS_HOP_VFX];

/** Death hues, at least dE 15 apart (CH47-13 acceptance): crimson, plum, cyan, orange, slate violet. */
export const DEATH_COLORS: Readonly<Record<Death["kind"], string>> = {
  squashed: "#e0344a",
  flattened: "#8a3fd0",
  drowned: "#3fc7e8",
  burned: "#ff8a1f",
  snatched: "#4a4f7a"
};

export const DEATH_VFX: Readonly<Record<Death["kind"], CrossHopVfxKind>> = {
  squashed: CROSS_HOP_VFX.deathSquashed,
  flattened: CROSS_HOP_VFX.deathFlattened,
  drowned: CROSS_HOP_VFX.deathDrowned,
  burned: CROSS_HOP_VFX.deathBurned,
  snatched: CROSS_HOP_VFX.deathSnatched
};

/** Live particle ceiling for one event (CH47-13 liveCount <= 96 across overlapping events). */
export const MAX_EVENT_PARTICLES = 32;

function emitter(fields: Record<string, unknown>): AuraVfxEffectSpec["layers"][number] {
  return { type: "emitter", ...fields } as AuraVfxEffectSpec["layers"][number];
}

/** The preset specs; `scale` halves counts under reduced motion (PRD §6.3). */
export function crossHopPresets(reducedMotion: boolean): Readonly<Record<CrossHopVfxKind, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.min(MAX_EVENT_PARTICLES, Math.round(reducedMotion ? count / 2 : count)));
  const spec = (name: CrossHopVfxKind, layers: AuraVfxEffectSpec["layers"]): AuraVfxEffectSpec => ({ name, layers });
  return {
    [CROSS_HOP_VFX.landDust]: spec(CROSS_HOP_VFX.landDust, [
      emitter({ preset: "dust", count: n(10), sprite: "dust-mote", size: [0.08, 0.18], speed: [0.4, 0.9], life: [0.35, 0.6], gravity: -0.6, maxScreen: 0.04 })
    ]),
    [CROSS_HOP_VFX.logSplash]: spec(CROSS_HOP_VFX.logSplash, [
      emitter({ preset: "splash", count: n(14), sprite: "splash", size: [0.06, 0.14], color: "#cfeaff" })
    ]),
    [CROSS_HOP_VFX.logRing]: spec(CROSS_HOP_VFX.logRing, [
      emitter({ preset: "ring", count: n(1), sprite: "ring-thin", size: [0.6, 1.2], speed: [0, 0], life: [0.5, 0.7], color: "#e8f6ff", additive: false })
    ]),
    [CROSS_HOP_VFX.lavaSparks]: spec(CROSS_HOP_VFX.lavaSparks, [
      emitter({ preset: "spark", count: n(12), sprite: "spark-streak", color: "#ff8a3d", intensity: 2.5, gravity: 1.2, life: [0.4, 0.8] })
    ]),
    [CROSS_HOP_VFX.coin]: spec(CROSS_HOP_VFX.coin, [
      emitter({ preset: "pickup", count: n(14), sprite: "glow", color: "#ffc531", intensity: 2 }),
      emitter({ preset: "ring", count: n(1), sprite: "ring", size: [0.4, 0.8], speed: [0, 0], life: [0.3, 0.45], color: "#ffe28a" })
    ]),
    [CROSS_HOP_VFX.rescue]: spec(CROSS_HOP_VFX.rescue, [
      emitter({ preset: "aura-burst", count: n(24), sprite: "soft-dot", color: "#ff9ed2" })
    ]),
    [CROSS_HOP_VFX.deathSquashed]: spec(CROSS_HOP_VFX.deathSquashed, [
      emitter({ preset: "debris", count: n(22), sprite: "debris-chips", color: DEATH_COLORS.squashed })
    ]),
    [CROSS_HOP_VFX.deathFlattened]: spec(CROSS_HOP_VFX.deathFlattened, [
      emitter({ preset: "debris", count: n(26), sprite: "debris-chips", color: DEATH_COLORS.flattened, speed: [3, 6] })
    ]),
    [CROSS_HOP_VFX.deathDrowned]: spec(CROSS_HOP_VFX.deathDrowned, [
      emitter({ preset: "splash", count: n(24), sprite: "splash", color: DEATH_COLORS.drowned }),
      emitter({ preset: "bubble", count: n(8), sprite: "bubble", color: "#bfefff" })
    ]),
    [CROSS_HOP_VFX.deathBurned]: spec(CROSS_HOP_VFX.deathBurned, [
      emitter({ preset: "explosion-small", count: n(18), sprite: "fireball", color: DEATH_COLORS.burned }),
      emitter({ preset: "dust", count: n(8), sprite: "smoke-a", color: "#3a2a24", life: [0.8, 1.4] })
    ]),
    [CROSS_HOP_VFX.deathSnatched]: spec(CROSS_HOP_VFX.deathSnatched, [
      emitter({ preset: "dust", count: n(18), sprite: "soft-dot", color: DEATH_COLORS.snatched, gravity: 0.6, speed: [1, 2.2] })
    ])
  } as Record<CrossHopVfxKind, AuraVfxEffectSpec>;
}

interface PresetRegistry { registerPreset(kind: string, spec: AuraVfxEffectSpec): void }

/** Registers every Cross Hop preset on `app.effects`. Safe to call again (re-registration overrides). */
export function registerCrossHopVfx(effects: PresetRegistry | undefined, reducedMotion: boolean): number {
  if (!effects) return 0;
  const presets = crossHopPresets(reducedMotion);
  for (const [kind, spec] of Object.entries(presets)) effects.registerPreset(kind, spec);
  return Object.keys(presets).length;
}

/** The landing effect for the lane type the critter landed on (null: none). */
export function landingVfx(laneType: string, onLog: boolean): CrossHopVfxKind | null {
  if (laneType === "river") return onLog ? CROSS_HOP_VFX.logSplash : CROSS_HOP_VFX.logRing;
  if (laneType === "lava") return CROSS_HOP_VFX.lavaSparks;
  return CROSS_HOP_VFX.landDust;
}
