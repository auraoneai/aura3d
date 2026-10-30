/**
 * Aura Hoops 3D: the runtime VFX preset pack (GU47 WP-17, H47-V1; PRD §3.2 item 3).
 *
 * Five kinds registered with `app.effects.registerPreset` (E-F: a registered name resolves in `burst`/`spawn` before
 * the built-ins and fires every layer): net-flick, blacktop-dust, spray-burst, rain-splash, sweat-fleck. Every juice
 * event that draws maps to exactly one kind (`JUICE_FX`), and the ball flight draws one ribbon trail (`ballTrailOptions`,
 * fire-coloured at a full Jam Meter) instead of 14 emissive spheres. Pure data: no DOM, no app.
 *
 * Reduced motion halves emission (PRD §6.3); reduced flash caps every light layer at 0.3 of its peak and 0.2 s.
 */
import type { AuraBurstOptions, AuraColor, AuraTrailOptions, AuraVfxEffectSpec } from "@aura3d/engine";

export type HoopsFxKind = "net-flick" | "blacktop-dust" | "spray-burst" | "rain-splash" | "sweat-fleck";
export const HOOPS_FX_KINDS: readonly HoopsFxKind[] = ["net-flick", "blacktop-dust", "spray-burst", "rain-splash", "sweat-fleck"];

/** Peak and length caps of a light layer under reduced flash (PRD §6.3: peak 0.3 for <= 200 ms). */
export const REDUCED_FLASH_PEAK = 0.3;
export const REDUCED_FLASH_SECONDS = 0.2;

type Layer = AuraVfxEffectSpec["layers"][number];

/**
 * The pack. Sprites are E-F built-in atlas sequences; `maxScreen` caps each particle's on-screen size so nothing reads
 * as a floating disc; every emitter is one-shot with a short life.
 */
export const HOOPS_FX_PRESETS: Readonly<Record<HoopsFxKind, AuraVfxEffectSpec>> = {
  // Net threads flick down and out of the cords on a make or a rim rattle.
  "net-flick": {
    name: "hoops net-flick",
    layers: [{ type: "emitter", preset: "spark", count: 10, speed: 1.6, life: 0.32, gravity: -6, color: "#f2f1ea", size: 0.022, spread: 0.55, sprite: "spark-streak", maxScreen: 0.02, direction: [0, -1, 0] }]
  },
  // A low puff of grit kicked off the asphalt on cuts, steals, jukes and bricks.
  "blacktop-dust": {
    name: "hoops blacktop-dust",
    layers: [{ type: "emitter", preset: "dust", count: 12, speed: 0.9, life: 0.7, gravity: -0.6, color: "#6f6a63", size: 0.16, spread: 1, sprite: "smoke-b", maxScreen: 0.06, drag: 2.2 }]
  },
  // Paint mist from the rim on a dunk (sodium flash light for 0.18 s); the Jam dunk also stencils the spray tag (H47-V3).
  "spray-burst": {
    name: "hoops spray-burst",
    layers: [
      { type: "emitter", preset: "spark", count: 26, speed: 3.6, life: 0.55, gravity: -3, color: "#ff7a1a", size: 0.05, spread: 1, sprite: "soft-dot", maxScreen: 0.03, drag: 1.2 },
      { type: "emitter", preset: "dust", count: 8, speed: 0.8, life: 0.9, gravity: -0.4, color: "#ffb347", size: 0.22, spread: 1, sprite: "smoke-a", maxScreen: 0.07, drag: 1.6, at: 0.04 },
      { type: "light", intensity: 2.2, range: 6, duration: 0.18, color: "#ffb347" }
    ]
  },
  // Splash crowns where the ball and feet hit wet ground (the rain courts swap blacktop-dust for this).
  "rain-splash": {
    name: "hoops rain-splash",
    layers: [{ type: "emitter", preset: "splash", count: 8, speed: 1.2, life: 0.35, gravity: -8, color: "#b9c7da", size: 0.05, spread: 0.8, sprite: "splash", maxScreen: 0.03 }]
  },
  // Sweat droplets off contact: blocks and glass hits.
  "sweat-fleck": {
    name: "hoops sweat-fleck",
    layers: [{ type: "emitter", preset: "spark", count: 8, speed: 2.4, life: 0.4, gravity: -9, color: "#e8f2ff", size: 0.02, spread: 0.9, sprite: "soft-dot", maxScreen: 0.015 }]
  }
};

/** One kind per juice event that draws (H47-V1 acceptance: each juice event maps to one). */
export const JUICE_FX: Readonly<Record<string, HoopsFxKind>> = {
  swish: "net-flick",
  rim: "net-flick",
  bank: "sweat-fleck",
  block: "sweat-fleck",
  brick: "blacktop-dust",
  steal: "blacktop-dust",
  juke: "blacktop-dust",
  gate: "blacktop-dust",
  dunk: "spray-burst",
  jam: "spray-burst",
  win: "spray-burst",
  crown: "spray-burst"
};

/** On a wet court the ground puffs are splashes. */
export function hoopsFxKindFor(kind: HoopsFxKind, wetCourt: boolean): HoopsFxKind {
  return wetCourt && kind === "blacktop-dust" ? "rain-splash" : kind;
}

/** A preset as registered for this session: under reduced flash every light layer is capped (peak 0.3, <= 0.2 s). */
export function presetForSession(kind: HoopsFxKind, session: { readonly reducedFlash: boolean }): AuraVfxEffectSpec {
  const spec = HOOPS_FX_PRESETS[kind];
  if (!session.reducedFlash) return spec;
  return {
    ...spec,
    layers: spec.layers.map((layer): Layer => {
      if (layer.type !== "light") return layer;
      const intensity = typeof layer.intensity === "number" ? layer.intensity : 1;
      const duration = typeof layer.duration === "number" ? layer.duration : REDUCED_FLASH_SECONDS;
      return { ...layer, intensity: intensity * REDUCED_FLASH_PEAK, duration: Math.min(duration, REDUCED_FLASH_SECONDS) };
    })
  };
}

/** Registers the five kinds on an app's effects surface (`app.effects`). Returns the names registered. */
export function registerHoopsFx(
  effects: { registerPreset(kind: string, spec: AuraVfxEffectSpec): void } | null | undefined,
  session: { readonly reducedFlash: boolean }
): readonly HoopsFxKind[] {
  if (!effects || typeof effects.registerPreset !== "function") return [];
  for (const kind of HOOPS_FX_KINDS) effects.registerPreset(kind, presetForSession(kind, session));
  return HOOPS_FX_KINDS;
}

/** Total emitter particles of a kind (the per-burst budget the tier cap sees). */
export function presetParticleCount(kind: HoopsFxKind): number {
  return HOOPS_FX_PRESETS[kind].layers.reduce((sum, layer) => sum + (layer.type === "emitter" && typeof layer.count === "number" ? layer.count : 0), 0);
}

/**
 * Burst options for one juice burst: emission halves under reduced motion (PRD §6.3), the juice layer owns the camera
 * (no preset shake on top of the route's own), and the juice event's colour tints the burst.
 */
export function hoopsBurstOptions(kind: HoopsFxKind, opts: { readonly count?: number; readonly color?: AuraColor; readonly reducedMotion: boolean }): AuraBurstOptions {
  const base = opts.count ?? presetParticleCount(kind);
  const count = Math.max(1, Math.round(opts.reducedMotion ? base / 2 : base));
  return { count, camera: false, ...(opts.color !== undefined ? { color: opts.color } : {}) };
}

/** Colours of the ball ribbon: chalk white in play, fire at a full Jam Meter. */
export const TRAIL_COLOR = "#f6efe2";
export const TRAIL_FIRE_COLOR = "#ff6a1a";

/**
 * The one ribbon trail on the ball (E-F `app.effects.trail`): only fast flight draws (zero width at <= 5.5 m/s, so a
 * held or dribbled ball leaves none), points live 0.3 s, fire-coloured at a full Jam Meter.
 */
export function ballTrailOptions(jamFull: boolean): AuraTrailOptions {
  return { width: jamFull ? 0.14 : 0.09, life: 0.3, color: jamFull ? TRAIL_FIRE_COLOR : TRAIL_COLOR, widthOverSpeed: [5.5, 11] };
}
