/**
 * vfx.ts — Aura Links 3D's runtime VFX preset pack (GU47 WP-20 LINKS-11,
 * PRD §3.2 item 3). Seven one-shot presets registered with
 * `app.effects.registerPreset` and fired with `app.effects.burst(name, at)`:
 * tee strike, divot, sand burst, water splash, lava ember hiss, low-gravity
 * regolith dust and the hole-out ring. Pure data plus the zone mapping, so
 * the colour spacing, lifetimes, budgets and the reduced-motion path are unit
 * tested (tests/unit/aura-links-3d/vfx.test.ts).
 *
 * Every particle dies within LINKS_VFX_MAX_LIFE seconds (acceptance: live
 * count back to 0 by 2 s after a landing). Reduced motion halves every count
 * (PRD §6.3); reduced flash drops the light layers.
 */
import type { AuraVfxEffectSpec } from "@aura3d/engine";
import type { CourseId, LieKind } from "./types";

export type LinksVfxId =
  | "links-strike"
  | "links-divot"
  | "links-sand-burst"
  | "links-water-splash"
  | "links-ember-hiss"
  | "links-lowg-dust"
  | "links-holeout-ring";

export const LINKS_VFX_IDS: readonly LinksVfxId[] = [
  "links-strike",
  "links-divot",
  "links-sand-burst",
  "links-water-splash",
  "links-ember-hiss",
  "links-lowg-dust",
  "links-holeout-ring"
];

/** Each preset's own colour (hues >= 20 deg apart). Divot, sand and the ring take the course's tone at run time. */
export const LINKS_VFX_COLORS: Readonly<Record<LinksVfxId, string>> = {
  "links-strike": "#9ff0e6",
  "links-divot": "#5f8a3a",
  "links-sand-burst": "#e2c27a",
  "links-water-splash": "#7fd0ff",
  "links-ember-hiss": "#ff5a1f",
  "links-lowg-dust": "#a9a2c4",
  "links-holeout-ring": "#ff5fae"
};

/** Longest particle life in the pack, seconds. */
export const LINKS_VFX_MAX_LIFE = 1.8;

export interface LinksVfxOptions {
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
}

type Layer = AuraVfxEffectSpec["layers"][number];

const emitter = (fields: Record<string, unknown>): Layer => ({ type: "emitter", ...fields }) as Layer;

/** The pack's specs for this session's accessibility settings. */
export function linksVfxSpecs(options: LinksVfxOptions): readonly AuraVfxEffectSpec[] {
  const n = (count: number) => (options.reducedMotion ? Math.max(1, Math.floor(count / 2)) : count);
  const light = (fields: Record<string, unknown>): Layer[] => (options.reducedFlash ? [] : [{ type: "light", ...fields } as Layer]);
  const c = LINKS_VFX_COLORS;
  return [
    {
      name: "links-strike",
      layers: [
        emitter({ preset: "dust-turf", count: n(10), speed: [1.4, 3], life: [0.3, 0.6], gravity: -6, color: c["links-strike"], size: [0.015, 0.035], spread: 0.5, direction: [0, 1, 0.6], sprite: "debris-chips" }),
        emitter({ preset: "dust", count: n(5), speed: [0.3, 0.7], life: [0.5, 0.9], gravity: -0.2, color: "#d8e6d0", size: [0.08, 0.16], spread: 1, sprite: "dust-mote" })
      ]
    },
    {
      name: "links-divot",
      layers: [
        emitter({ preset: "dust-turf", count: n(14), speed: [1.2, 2.6], life: [0.5, 0.9], gravity: -7, color: c["links-divot"], size: [0.035, 0.08], spread: 0.55, direction: [0, 1, 0], sprite: "debris-chips" }),
        emitter({ preset: "dust", count: n(8), speed: [0.3, 0.8], life: [0.6, 1.1], gravity: -0.3, color: "#8c9a6a", size: [0.14, 0.28], spread: 1, sprite: "dust-mote" }),
        // LINKS-10: the pitch mark / divot scar left at the landing
        { type: "decal", size: 0.32, lifetime: 30, opacity: 0.55, color: "#2f2416" } as Layer
      ]
    },
    {
      name: "links-sand-burst",
      layers: [
        emitter({ preset: "dust-sand", count: n(26), speed: [1.5, 3.2], life: [0.6, 1.1], gravity: -6, color: c["links-sand-burst"], size: [0.025, 0.06], spread: 0.7, direction: [0, 1, 0], sprite: "debris-chips" }),
        emitter({ preset: "dust-sand", count: n(10), speed: [0.4, 1], life: [0.8, 1.4], gravity: -0.5, color: "#d9c08a", size: [0.2, 0.42], spread: 1, sprite: "smoke-a" })
      ]
    },
    {
      name: "links-water-splash",
      layers: [
        emitter({ preset: "splash", count: n(28), speed: [2, 4.2], life: [0.5, 0.9], gravity: -9, color: c["links-water-splash"], size: [0.05, 0.12], spread: 0.45, direction: [0, 1, 0], sprite: "splash" }),
        emitter({ preset: "splash", count: n(10), speed: [0.5, 1.2], life: [0.6, 1.2], gravity: -0.2, color: "#cfeeff", size: [0.25, 0.5], spread: 1, sprite: "smoke-b" })
      ]
    },
    {
      name: "links-ember-hiss",
      layers: [
        emitter({ preset: "spark-fire", count: n(22), speed: [1.5, 3.5], life: [0.4, 0.9], gravity: 1.5, color: c["links-ember-hiss"], intensity: 2.5, additive: true, size: [0.02, 0.05], spread: 0.6, direction: [0, 1, 0], sprite: "spark-streak" }),
        emitter({ preset: "dust-ash", count: n(12), speed: [0.4, 1], life: [1, 1.6], gravity: 0.6, color: "#8a7a74", size: [0.3, 0.6], spread: 1, sprite: "smoke-a" }),
        ...light({ intensity: 6, range: 5, duration: 0.35, color: c["links-ember-hiss"] })
      ]
    },
    {
      name: "links-lowg-dust",
      layers: [
        // 1/6 g, no air: slow arcs and no drag, gone before 2 s
        emitter({ preset: "dust", count: n(30), speed: [0.6, 1.6], life: [1.2, 1.7], gravity: -1.1, drag: 0, color: c["links-lowg-dust"], size: [0.035, 0.09], spread: 0.9, direction: [0, 1, 0], sprite: "dust-mote" }),
        emitter({ preset: "dust", count: n(8), speed: [0.3, 0.7], life: [1.3, LINKS_VFX_MAX_LIFE], gravity: -0.4, drag: 0, color: "#bdb8cc", size: [0.22, 0.45], spread: 1, sprite: "smoke-b" })
      ]
    },
    {
      name: "links-holeout-ring",
      layers: [
        emitter({ preset: "ring", count: n(32), speed: [3.5, 5], life: [0.35, 0.6], gravity: 0, color: c["links-holeout-ring"], additive: true, size: [0.04, 0.08], spread: 1, sprite: "ring-thin" }),
        emitter({ preset: "spark-gold", count: n(16), speed: [1, 2.5], life: [0.5, 1], gravity: -2, color: "#fff4d0", additive: true, size: [0.02, 0.05], spread: 0.8, direction: [0, 1, 0], sprite: "flare" }),
        ...light({ intensity: 4, range: 4, duration: 0.3, color: c["links-holeout-ring"] })
      ]
    }
  ];
}

/** Registers the pack on `app.effects` (E-F `registerPreset`); returns the names. */
export function registerLinksVfx(
  effects: { registerPreset(kind: string, spec: AuraVfxEffectSpec): void } | null | undefined,
  options: LinksVfxOptions
): readonly string[] {
  if (!effects || typeof effects.registerPreset !== "function") return [];
  const specs = linksVfxSpecs(options);
  for (const spec of specs) effects.registerPreset(spec.name, spec);
  return specs.map((s) => s.name);
}

/** The landing effect for a ball that touches down on `zone` (the old splash-to-dust mapping is gone). */
export function landingVfxFor(course: CourseId, zone: LieKind): LinksVfxId {
  if (course === "mareCourse") return "links-lowg-dust";
  if (zone === "water") return course === "cinderRim" ? "links-ember-hiss" : "links-water-splash";
  if (zone === "sand") return "links-sand-burst";
  if (zone === "rock") return "links-strike";
  return "links-divot";
}

/** Particles one burst of a preset puts up (all emitter layers). */
export function linksVfxParticles(spec: AuraVfxEffectSpec): number {
  return spec.layers.reduce((sum, layer) => {
    const count = layer.count;
    return sum + (layer.type === "emitter" && typeof count === "number" ? count : 0);
  }, 0);
}

/** Longest particle life of a preset, seconds. */
export function linksVfxMaxLife(spec: AuraVfxEffectSpec): number {
  let max = 0;
  for (const layer of spec.layers) {
    const life = (layer as { life?: unknown }).life;
    if (Array.isArray(life)) max = Math.max(max, Number(life[1] ?? life[0]));
    else if (typeof life === "number") max = Math.max(max, life);
  }
  return max;
}
