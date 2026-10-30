/**
 * GU47 WP-30 runtime VFX preset pack (NR-14, NR-15). Every gameplay event the art direction lists maps to one
 * registered preset; `registerNinjaVfx` registers them on `app.effects` and returns `fire(event, position)`.
 * Emitter `gravity` follows the engine sign (negative falls); additive layers carry `intensity: 3` because the
 * built-in glow colours are HDR (the spark base is [4, 2.4, 0.8]). Kills throw indigo debris with persimmon sparks, crate breaks leave an ink decal, pickups and power use the
 * reserved spirit cyan, and each district has one authored ambient (petals, embers, fireflies, falls spray).
 *
 * Reduced motion halves every emission count (PRD §6.3); Low halves it again and drops the ambient emitters
 * (PRD §6.4: the palette and the scarf ribbon stay). Pure apart from the `effects` surface passed in.
 */
import type { AuraAppEffects, AuraTrailHandle, AuraVec3, AuraVfxEffectSpec } from "@aura3d/engine";
import { PALETTE, type DistrictId } from "./districtLook";

export type NinjaVfxEvent = "kill" | "kill-heavy" | "crate-break" | "pickup" | "land" | "damage" | "form" | "dash" | "wind-impact";
export type NinjaAmbient = "petals" | "embers" | "fireflies" | "falls-spray";

export interface NinjaVfxOptions {
  readonly reducedMotion: boolean;
  readonly quality: "low" | "high";
}

type Layer = AuraVfxEffectSpec["layers"][number];
const emitter = (fields: Record<string, unknown>): Layer => ({ type: "emitter", ...fields });

/** Base presets before the motion and tier scales (counts are the High, full-motion values). */
export const NINJA_PRESETS: Readonly<Record<NinjaVfxEvent, AuraVfxEffectSpec>> = {
  kill: { name: "ninja-kill", layers: [
    emitter({ preset: "debris", count: 18, speed: 5.5, life: 0.8, gravity: -9.8, color: PALETTE.indigo, size: 0.16 }),
    emitter({ preset: "spark", count: 14, speed: 7, life: 0.45, color: PALETTE.persimmon, additive: true, intensity: 3, size: 0.08 })
  ] },
  "kill-heavy": { name: "ninja-kill-heavy", layers: [
    emitter({ preset: "debris", count: 28, speed: 6.5, life: 0.95, gravity: -9.8, color: PALETTE.indigo, size: 0.2 }),
    emitter({ preset: "spark", count: 22, speed: 8, life: 0.5, color: PALETTE.persimmon, additive: true, intensity: 3, size: 0.1 }),
    { type: "light", intensity: 5, range: 6, duration: 0.18, color: PALETTE.persimmon }
  ] },
  "crate-break": { name: "ninja-crate-break", layers: [
    emitter({ preset: "debris", count: 16, speed: 5, life: 0.75, gravity: -9.8, color: "#8a5a35", size: 0.14 }),
    emitter({ preset: "dust", count: 10, speed: 2.2, life: 0.9, color: "#c9b693", size: 0.5 }),
    { type: "decal", size: 1.3, lifetime: 6, opacity: 0.7, color: PALETTE.ink }
  ] },
  pickup: { name: "ninja-pickup", layers: [emitter({ preset: "pickup-power", count: 12, speed: 3, life: 0.55, color: PALETTE.spiritCyan, additive: true, intensity: 3 })] },
  land: { name: "ninja-land", layers: [emitter({ preset: "dust", count: 8, speed: 2.2, life: 0.55, color: "#c9b693", size: 0.35 })] },
  damage: { name: "ninja-damage", layers: [emitter({ preset: "spark", count: 16, speed: 5, life: 0.5, color: PALETTE.persimmon, additive: true, intensity: 3 })] },
  form: { name: "ninja-form", layers: [
    emitter({ preset: "aura-burst", count: 30, speed: 6, life: 0.85, color: PALETTE.lanternAmber, additive: true, intensity: 3 }),
    { type: "light", intensity: 4, range: 7, duration: 0.3, color: PALETTE.lanternAmber }
  ] },
  dash: { name: "ninja-dash", layers: [emitter({ preset: "streak", count: 14, speed: 4, life: 0.4, color: PALETTE.spiritCyan, additive: true, intensity: 3 })] },
  "wind-impact": { name: "ninja-wind-impact", layers: [emitter({ preset: "spark-ice", count: 18, speed: 6.5, life: 0.55, color: PALETTE.spiritCyan, additive: true, intensity: 3 })] }
};

/** District ambients (one per district; the Backstreets and rooftops share embers, the river has none). */
export const NINJA_AMBIENTS: Readonly<Record<NinjaAmbient, AuraVfxEffectSpec>> = {
  petals: { name: "ninja-petals", layers: [emitter({ preset: "dust", count: 10, speed: 0.6, life: 3.2, gravity: -0.4, color: "#f2b8c0", size: 0.12, spread: 6 })] },
  embers: { name: "ninja-embers", layers: [emitter({ preset: "spark-fire", count: 8, speed: 0.8, life: 2.4, gravity: 0.6, color: PALETTE.lanternAmber, additive: true, intensity: 3, size: 0.05, spread: 5 })] },
  fireflies: { name: "ninja-fireflies", layers: [emitter({ preset: "spark-magic", count: 10, speed: 0.3, life: 3.5, gravity: 0, color: "#d8ff8a", additive: true, intensity: 3, size: 0.05, spread: 7 })] },
  "falls-spray": { name: "ninja-falls-spray", layers: [emitter({ preset: "splash", count: 14, speed: 2.5, life: 1.4, gravity: -3, color: PALETTE.mistPaper, size: 0.4, spread: 6 })] }
};

export const AMBIENT_BY_DISTRICT: Readonly<Record<DistrictId, NinjaAmbient | null>> = {
  village: "petals", rooftops: "embers", river: null, forest: "fireflies", gate: "falls-spray"
};

/** Emission scale: reduced motion halves it, Low halves it again. */
export function emissionScale(o: NinjaVfxOptions): number {
  return (o.reducedMotion ? 0.5 : 1) * (o.quality === "low" ? 0.5 : 1);
}

/** A preset with every emitter `count` scaled (rounded, at least 1). */
export function scaledPreset(spec: AuraVfxEffectSpec, scale: number): AuraVfxEffectSpec {
  return {
    ...spec,
    layers: spec.layers.map((layer) => (layer.type === "emitter" && typeof layer.count === "number" ? { ...layer, count: Math.max(1, Math.round(layer.count * scale)) } : layer))
  };
}

/** Scarf ribbon (NR-15): vermilion for the base form, the cyan twin for the Sage and Beast forms. */
export const SCARF = {
  anchor: "hero-scarf",
  width: 0.16,
  life: 0.42,
  widthOverSpeed: [2, 14] as const,
  color: { base: PALETTE.persimmon, spirit: PALETTE.spiritCyan }
} as const;

export interface NinjaVfx {
  fire(event: NinjaVfxEvent, position: AuraVec3): void;
  /** Spawns one puff of the district's ambient at `position` (called on a timer by the world). */
  ambient(district: DistrictId, position: AuraVec3): void;
  /** Starts (or recolours) the scarf ribbon on the `hero-scarf` anchor; `null` when the trail API is inert. */
  scarf(form: "base" | "sage" | "beast"): AuraTrailHandle | null;
  readonly ambientOn: boolean;
}

/** Registers the pack on `effects` and returns the event mapper. */
export function registerNinjaVfx(effects: AuraAppEffects | undefined, options: NinjaVfxOptions): NinjaVfx {
  const scale = emissionScale(options);
  const ambientOn = options.quality !== "low";
  if (effects) {
    // The floating-dot cause is fixed in the engine (E-F): runtime effects stay on.
    effects.runtime = "on";
    for (const spec of Object.values(NINJA_PRESETS)) effects.registerPreset(spec.name, scaledPreset(spec, scale));
    if (ambientOn) for (const spec of Object.values(NINJA_AMBIENTS)) effects.registerPreset(spec.name, scaledPreset(spec, scale));
  }
  let trail: AuraTrailHandle | null = null;
  let trailColor = "";
  return {
    ambientOn,
    fire(event, position) { effects?.burst(NINJA_PRESETS[event].name, position, { camera: false }); },
    ambient(district, position) {
      const kind = AMBIENT_BY_DISTRICT[district];
      if (!effects || !ambientOn || kind === null) return;
      effects.burst(NINJA_AMBIENTS[kind].name, position, { camera: false });
    },
    scarf(form) {
      if (!effects) return null;
      const color = form === "base" ? SCARF.color.base : SCARF.color.spirit;
      if (trail && trailColor === color) return trail;
      trail?.stop({ immediate: false });
      trailColor = color;
      trail = effects.trail(SCARF.anchor, { width: SCARF.width, life: SCARF.life, color, widthOverSpeed: SCARF.widthOverSpeed });
      return trail;
    }
  };
}
