/**
 * Slingshot Siege — runtime VFX preset pack + 32-frame RGBA8 flipbook burst pool (WP-12).
 *
 * Combines:
 *   1. Material-specific particle/light/decal presets registered via `app.effects.registerPreset`
 *      (`siegeVfxPresets`, reduced-motion & reduced-flash compliant).
 *   2. Pooled 8x4 (32-frame) camera-facing flipbook burst cards driven by `createFlipbookAtlas("dust")`
 *      for structural masonry collapse plumes and `createFlipbookAtlas("sparks")` for blast bursts.
 */
import type { AuraAppEffects, AuraRuntimeNodeHandle, AuraVfxEffectSpec } from "@aura3d/engine";
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
  triple: "#7ad6ff",
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
      { type: "emitter", preset: "debris", count: n(12), sprite: "debris-chips", color: "#b67b42", size: [0.08, 0.18] },
      { type: "emitter", preset: "dust", count: n(9), sprite: "smoke-a", color: "#dfcaa2", size: [0.26, 0.54] }
    ]),
    [SIEGE_VFX.breakStone]: spec(SIEGE_VFX.breakStone, [
      { type: "emitter", preset: "debris", count: n(10), sprite: "debris-chips", color: "#c9c4b8", size: [0.06, 0.15] },
      { type: "emitter", preset: "dust", count: n(14), sprite: "smoke-b", color: "#d6d1c6", size: [0.32, 0.68] }
    ]),
    [SIEGE_VFX.breakGlass]: spec(SIEGE_VFX.breakGlass, [
      { type: "emitter", preset: "spark", count: n(18), sprite: "spark-streak", color: "#e4f8ff", intensity: 1.7 },
      { type: "emitter", preset: "debris", count: n(8), sprite: "debris-chips", color: "#bfe9f5", size: [0.05, 0.11] }
    ]),
    [SIEGE_VFX.breakIce]: spec(SIEGE_VFX.breakIce, [
      { type: "emitter", preset: "spark", count: n(16), sprite: "spark-streak", color: "#eaf5ff", intensity: 1.85 },
      { type: "emitter", preset: "dust", count: n(8), sprite: "snowflake", color: "#eef8ff", size: [0.08, 0.17] }
    ]),
    [SIEGE_VFX.breakObsidian]: spec(SIEGE_VFX.breakObsidian, [
      { type: "emitter", preset: "spark", count: n(14), sprite: "glow", color: "#a874ff", intensity: 2 },
      { type: "emitter", preset: "debris", count: n(9), sprite: "debris-chips", color: "#3d3552", size: [0.07, 0.15] }
    ]),
    [SIEGE_VFX.boarHit]: spec(SIEGE_VFX.boarHit, [
      { type: "emitter", preset: "impact-flash", count: 1, color: "#fff2d6" },
      { type: "emitter", preset: "dust", count: n(12), sprite: "dust-mote", color: "#ebd8ad", size: [0.14, 0.3] },
      ...light(3.5, 3.2, 0.12, "#fff2d6"),
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
      { type: "emitter", preset: "explosion-small", count: n(22), sprite: "fireball", color: "#ffb35c", intensity: 1.9 },
      { type: "emitter", preset: "spark", count: n(16), sprite: "spark-streak", color: "#ffd08a", intensity: 1.7 },
      ...light(4, 6, 0.25, "#ffb35c"),
      ...camera(0.3),
      { type: "decal", size: 1.4, lifetime: 6, opacity: 0.55, color: "#2a1d14" }
    ]),
    [SIEGE_VFX.yankPoof]: spec(SIEGE_VFX.yankPoof, [
      { type: "emitter", preset: "dust", count: n(16), sprite: "smoke-a", color: "#b8e8d4", size: [0.3, 0.6] },
      { type: "emitter", preset: "ring", count: 1, sprite: "ring-thin", color: "#b0f0d4" }
    ]),
    [SIEGE_VFX.abilityPop]: spec(SIEGE_VFX.abilityPop, [
      { type: "emitter", preset: "spark", count: n(12), sprite: "flare", color: "#fff0a0", intensity: 1.5 }
    ]),
    [SIEGE_VFX.windmillSmash]: spec(SIEGE_VFX.windmillSmash, [
      { type: "emitter", preset: "debris", count: n(16), sprite: "debris-chips", color: "#a77a4c", size: [0.1, 0.22] },
      { type: "emitter", preset: "dust", count: n(12), sprite: "smoke-a", color: "#dcc59c", size: [0.32, 0.64] },
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

interface ActiveFlipbookCard {
  readonly id: string;
  age: number;
  duration: number;
  x: number;
  y: number;
  z: number;
  baseScale: number;
  riseSpeed: number;
  active: boolean;
}

/**
 * Drives pooled 8x4 (32-frame) RGBA8 flipbook planes (`createFlipbookAtlas("dust")` masonry plumes &
 * `createFlipbookAtlas("sparks")` blast bursts) via `handle.setUniform("progress", p)` + camera billboarding.
 */
export class FlipbookBurstController {
  private readonly plumes: ActiveFlipbookCard[];
  private readonly blasts: ActiveFlipbookCard[];
  private plumeCursor = 0;
  private blastCursor = 0;

  constructor(
    plumeIds: readonly string[],
    blastIds: readonly string[],
    private readonly resolve: (id: string) => AuraRuntimeNodeHandle | undefined,
    private readonly reducedMotion: boolean
  ) {
    this.plumes = plumeIds.map((id) => ({ id, age: 0, duration: 0.62, x: 0, y: -120, z: 0, baseScale: 1, riseSpeed: 0.45, active: false }));
    this.blasts = blastIds.map((id) => ({ id, age: 0, duration: 0.44, x: 0, y: -120, z: 0, baseScale: 1.4, riseSpeed: 0.12, active: false }));
  }

  spawnPlume(at: readonly number[], scale = 1.05): void {
    const slot = this.plumes[this.plumeCursor % this.plumes.length];
    this.plumeCursor += 1;
    if (!slot) return;
    slot.age = 0;
    slot.duration = this.reducedMotion ? 0.42 : 0.64;
    slot.x = at[0] ?? 0;
    slot.y = (at[1] ?? 0) + 0.16;
    slot.z = (at[2] ?? 0) + 0.24;
    slot.baseScale = scale;
    slot.riseSpeed = this.reducedMotion ? 0.12 : 0.48;
    slot.active = true;
    const h = this.resolve(slot.id);
    if (h) {
      h.setPosition(slot.x, slot.y, slot.z).setScale(scale * 0.72).setVisible(true);
      try { h.setUniform?.("progress", 0); } catch { /* optional in mocks */ }
    }
  }

  spawnBlast(at: readonly number[], scale = 1.55): void {
    const slot = this.blasts[this.blastCursor % this.blasts.length];
    this.blastCursor += 1;
    if (!slot) return;
    slot.age = 0;
    slot.duration = this.reducedMotion ? 0.32 : 0.46;
    slot.x = at[0] ?? 0;
    slot.y = (at[1] ?? 0) + 0.14;
    slot.z = (at[2] ?? 0) + 0.3;
    slot.baseScale = scale;
    slot.riseSpeed = 0.1;
    slot.active = true;
    const h = this.resolve(slot.id);
    if (h) {
      h.setPosition(slot.x, slot.y, slot.z).setScale(scale * 0.8).setVisible(true);
      try { h.setUniform?.("progress", 0); } catch { /* optional in mocks */ }
    }
  }

  step(realDt: number, camPos: readonly [number, number, number]): void {
    const stepList = (list: ActiveFlipbookCard[], expandAmt: number): void => {
      for (const c of list) {
        if (!c.active) continue;
        c.age += realDt;
        const p = Math.min(1, c.age / Math.max(0.05, c.duration));
        const h = this.resolve(c.id);
        if (p >= 1) {
          c.active = false;
          h?.setPosition(0, -120, 0).setVisible(false);
          continue;
        }
        if (!h) continue;
        const y = c.y + c.riseSpeed * c.age;
        const dx = camPos[0] - c.x;
        const dz = camPos[2] - c.z;
        const yaw = Math.atan2(dx, dz);
        const s = c.baseScale * (0.72 + expandAmt * p);
        h.setPosition(c.x, y, c.z).setRotation(0, yaw, 0).setScale(s);
        try { h.setUniform?.("progress", p); } catch { /* optional in mocks */ }
      }
    };
    stepList(this.plumes, 0.65);
    stepList(this.blasts, 0.48);
  }

  clear(): void {
    for (const c of [...this.plumes, ...this.blasts]) {
      c.active = false;
      this.resolve(c.id)?.setPosition(0, -120, 0).setVisible(false);
    }
  }
}
