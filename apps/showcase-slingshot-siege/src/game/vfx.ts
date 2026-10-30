/**
 * Slingshot Siege — GU47 runtime VFX preset pack (WP-22 SS47-V1/V2, PRD §3.2 item 3).
 *
 * Material-specific breaks replace the old sphere puffs: wood throws driftwood chips and sandy dust, stone grey
 * dust and crumbs, glass and ice white-blue glints, obsidian a purple flare; a boar hit flashes, a shot that lands
 * in the sea splashes, a launch kicks a sand ring off the knoll. Every preset is registered once with
 * `app.effects.registerPreset` (E-F) and fired by name through `app.effects.burst`. Sprites come from the baked
 * E-F atlas (no new textures).
 *
 * Reduced motion (PRD §6.3): particle counts halve and camera layers go. Reduced flash: light layers peak at 0.3
 * for at most 200 ms.
 */
import type { AuraAppEffects, AuraVfxEffectSpec } from "@aura3d/engine";
import type { AmmoId } from "./ammo";
import type { SiegeMaterialId } from "./materials";

export interface SiegeVfxOptions {
  readonly reducedMotion: boolean;
  readonly reducedFlash?: boolean;
}

/** Registered preset names (one per gameplay event; the art direction's vfx list mirrors these). */
export const SIEGE_VFX = {
  breakWood: "siege-break-wood",
  breakStone: "siege-break-stone",
  breakGlass: "siege-break-glass",
  breakIce: "siege-break-ice",
  breakObsidian: "siege-break-obsidian",
  boarHit: "siege-boar-hit",
  seaSplash: "siege-sea-splash",
  launchDust: "siege-launch-dust",
  emberBlast: "siege-ember-blast",
  yankPoof: "siege-yank-poof",
  abilityPop: "siege-ability-pop",
  windmillSmash: "siege-windmill-smash",
  scorch: "siege-scorch"
} as const;

export type SiegeVfxName = (typeof SIEGE_VFX)[keyof typeof SIEGE_VFX];

type Layer = AuraVfxEffectSpec["layers"][number];

/** Break preset for a block material (SS47-V1). */
export function breakPreset(material: SiegeMaterialId | string): SiegeVfxName {
  switch (material) {
    case "stone": return SIEGE_VFX.breakStone;
    case "glass": return SIEGE_VFX.breakGlass;
    case "ice": return SIEGE_VFX.breakIce;
    case "obsidian": return SIEGE_VFX.breakObsidian;
    default: return SIEGE_VFX.breakWood;
  }
}

/** Ability preset for an ammo type (the sim's fire/poof puffs, drawn as runtime VFX). */
export function abilityPreset(ammo: AmmoId): SiegeVfxName {
  if (ammo === "ember") return SIEGE_VFX.emberBlast;
  if (ammo === "squid") return SIEGE_VFX.yankPoof;
  return SIEGE_VFX.abilityPop;
}

/** Ammo-tinted flight trail colour (SS47-V2), from each ammo's glow. */
export const AMMO_TRAIL_COLOR: Readonly<Record<AmmoId, string>> = {
  pebble: "#ffd766",
  stone: "#cfd9ea",
  triple: "#fff0a0",
  squid: "#b0f0d4",
  ember: "#ffb35c"
};

/** The full preset table for the given motion/flash settings (pure: the unit test reads it). */
export function siegeVfxPresets(options: SiegeVfxOptions): Readonly<Record<SiegeVfxName, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.round(options.reducedMotion ? count / 2 : count));
  const camera = (shake: number): Layer[] => (options.reducedMotion ? [] : [{ type: "camera", shake }]);
  const light = (intensity: number, range: number, duration: number, color: string): Layer[] => [
    options.reducedFlash
      ? { type: "light", intensity: Math.min(0.3, intensity), range, duration: Math.min(0.2, duration), color }
      : { type: "light", intensity, range, duration, color }
  ];
  const spec = (name: SiegeVfxName, layers: Layer[]): AuraVfxEffectSpec => ({ name, layers });
  return {
    [SIEGE_VFX.breakWood]: spec(SIEGE_VFX.breakWood, [
      { type: "emitter", preset: "debris", count: n(10), sprite: "debris-chips", color: "#b07a43", size: [0.08, 0.16] },
      { type: "emitter", preset: "dust", count: n(8), sprite: "smoke-a", color: "#dcc59c", size: [0.25, 0.5] }
    ]),
    [SIEGE_VFX.breakStone]: spec(SIEGE_VFX.breakStone, [
      { type: "emitter", preset: "debris", count: n(8), sprite: "debris-chips", color: "#bdb8ac", size: [0.06, 0.14] },
      { type: "emitter", preset: "dust", count: n(12), sprite: "smoke-b", color: "#c8c5bc", size: [0.3, 0.6] }
    ]),
    [SIEGE_VFX.breakGlass]: spec(SIEGE_VFX.breakGlass, [
      { type: "emitter", preset: "spark", count: n(16), sprite: "spark-streak", color: "#e2f7ff", intensity: 1.6 },
      { type: "emitter", preset: "debris", count: n(6), sprite: "debris-chips", color: "#c4efff", size: [0.05, 0.1] }
    ]),
    [SIEGE_VFX.breakIce]: spec(SIEGE_VFX.breakIce, [
      { type: "emitter", preset: "spark", count: n(14), sprite: "spark-streak", color: "#eaf5ff", intensity: 1.8 },
      { type: "emitter", preset: "dust", count: n(6), sprite: "snowflake", color: "#eef8ff", size: [0.08, 0.16] }
    ]),
    [SIEGE_VFX.breakObsidian]: spec(SIEGE_VFX.breakObsidian, [
      { type: "emitter", preset: "spark", count: n(12), sprite: "glow", color: "#a874ff", intensity: 2 },
      { type: "emitter", preset: "debris", count: n(8), sprite: "debris-chips", color: "#3d3552", size: [0.07, 0.14] }
    ]),
    [SIEGE_VFX.boarHit]: spec(SIEGE_VFX.boarHit, [
      { type: "emitter", preset: "impact-flash", count: 1, color: "#fff2d6" },
      { type: "emitter", preset: "dust", count: n(10), sprite: "dust-mote", color: "#e9d6a8", size: [0.12, 0.28] },
      ...light(3.5, 3, 0.12, "#fff2d6"),
      ...camera(0.18)
    ]),
    [SIEGE_VFX.seaSplash]: spec(SIEGE_VFX.seaSplash, [
      { type: "emitter", preset: "splash", count: n(18), sprite: "splash", color: "#e4f6f4" },
      { type: "emitter", preset: "ring", count: 1, sprite: "ring-thin", color: "#d8f1ee" }
    ]),
    [SIEGE_VFX.launchDust]: spec(SIEGE_VFX.launchDust, [
      { type: "emitter", preset: "ring", count: 1, sprite: "ring", color: "#efe0bd" },
      { type: "emitter", preset: "dust", count: n(12), sprite: "dust-mote", color: "#e9d6a8", size: [0.15, 0.3] }
    ]),
    [SIEGE_VFX.emberBlast]: spec(SIEGE_VFX.emberBlast, [
      { type: "emitter", preset: "explosion-small", count: n(20), sprite: "fireball", color: "#ffb35c", intensity: 1.8 },
      { type: "emitter", preset: "spark", count: n(14), sprite: "spark-streak", color: "#ffd08a", intensity: 1.6 },
      ...light(4, 6, 0.25, "#ffb35c"),
      ...camera(0.3),
      { type: "decal", size: 1.4, lifetime: 6, opacity: 0.55, color: "#2a1d14" }
    ]),
    [SIEGE_VFX.yankPoof]: spec(SIEGE_VFX.yankPoof, [
      { type: "emitter", preset: "dust", count: n(16), sprite: "smoke-a", color: "#b8e8d4", size: [0.3, 0.6] },
      { type: "emitter", preset: "ring", count: 1, sprite: "ring-thin", color: "#b0f0d4" }
    ]),
    [SIEGE_VFX.abilityPop]: spec(SIEGE_VFX.abilityPop, [
      { type: "emitter", preset: "spark", count: n(10), sprite: "flare", color: "#fff0a0", intensity: 1.4 }
    ]),
    [SIEGE_VFX.windmillSmash]: spec(SIEGE_VFX.windmillSmash, [
      { type: "emitter", preset: "debris", count: n(14), sprite: "debris-chips", color: "#a77a4c", size: [0.1, 0.2] },
      { type: "emitter", preset: "dust", count: n(10), sprite: "smoke-a", color: "#dcc59c", size: [0.3, 0.6] },
      ...camera(0.25)
    ]),
    [SIEGE_VFX.scorch]: spec(SIEGE_VFX.scorch, [
      { type: "decal", size: 1.1, lifetime: 8, opacity: 0.5, color: "#2a1d14" }
    ])
  };
}

/** Register the pack on the app's effects surface (E-F `registerPreset`); returns the names registered. */
export function registerSiegeVfx(effects: Pick<AuraAppEffects, "registerPreset"> | undefined, options: SiegeVfxOptions): readonly string[] {
  if (!effects) return [];
  const presets = siegeVfxPresets(options);
  for (const [kind, spec] of Object.entries(presets)) effects.registerPreset(kind, spec);
  return Object.keys(presets);
}
