/**
 * GU47 WP-27 SSR-12 / SSR-13: the serpent-road runtime effect pack (PRD §3.2 item 3). One registered preset per gameplay
 * event, on E-F's registered-preset layers and the built-in atlas sprites, coloured from the identity palette only:
 * jade and cloud gold for pickups, pearl for road chips, coral for strain and hits, white-gold for the surge aura.
 * No other live game uses this jade/pearl/coral set (PRD §6.1 G17 row).
 *
 * Reduced motion halves every emission (PRD §6.3); reduced flash drops the light and camera layers (lightning, surge).
 * Live counts: a dense moment (orb 10 + power 16 + chips 12 + puff 8 + surge 14 + hit 12) stays under 96 particles,
 * well inside the art direction's High cap.
 */
import type { AuraTrailOptions, AuraVfxEffectSpec } from "@aura3d/engine";
import { SERPENT_PALETTE } from "./colorScript";

export type SerpentVfxKind =
  | "serpent-orb"
  | "serpent-power"
  | "serpent-pearl-chips"
  | "serpent-cloud-puff"
  | "serpent-surge"
  | "serpent-hit"
  | "serpent-soul"
  | "serpent-lightning"
  | "serpent-wisp"
  | "serpent-petals"
  | "serpent-embers"
  | "serpent-rain"
  | "serpent-mist";

export const SERPENT_VFX_KINDS: readonly SerpentVfxKind[] = [
  "serpent-orb", "serpent-power", "serpent-pearl-chips", "serpent-cloud-puff", "serpent-surge", "serpent-hit", "serpent-soul", "serpent-lightning",
  "serpent-wisp", "serpent-petals", "serpent-embers", "serpent-rain", "serpent-mist"
];

/** Pack colours (sRGB hex). */
export const SERPENT_VFX_COLORS = {
  jade: SERPENT_PALETTE.pearlJade,
  gold: SERPENT_PALETTE.cloudGold,
  pearl: "#f4eefa",
  coral: SERPENT_PALETTE.coral,
  whiteGold: "#fff2c4",
  soul: "#bfe8ff",
  storm: "#dce4ff",
  wisp: "#fff4ec",
  petal: "#ffb4c0",
  ember: "#ffa040",
  rain: "#c8d4f0",
  mist: "#8a96c8"
} as const;

/** Live-particle ceiling for a dense moment on High (art direction tiers.high.particles). */
export const SERPENT_VFX_LIVE_CAP = 96;

export interface SerpentVfxOptions {
  readonly reducedMotion?: boolean;
  readonly reducedFlash?: boolean;
  /** SSR-13: world direction the rain falls along (default straight down); re-registered as the gust moves. */
  readonly rainDirection?: readonly [number, number, number];
}

/** SSR-13: the rain burst (one of 8 per 0.08 s around the camera; fast thin streaks along `direction`). */
export function serpentRainPreset(direction: readonly [number, number, number] = [0, -1, 0], reducedMotion = false): AuraVfxEffectSpec {
  return {
    name: "serpent-rain",
    layers: [
      { type: "emitter", preset: "rain", count: reducedMotion ? 3 : 6, speed: [20, 26], life: [0.45, 0.6], size: [0.02, 0.035], color: SERPENT_VFX_COLORS.rain, intensity: 1.2, sprite: "rain-streak", additive: true, direction: [...direction], spread: 0.06, maxScreen: 0.08 }
    ]
  };
}

/** The pack, keyed by the registered kind (each spec's `name` equals its key). */
export function serpentVfxPresets(options: SerpentVfxOptions = {}): Readonly<Record<SerpentVfxKind, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.round(options.reducedMotion ? count / 2 : count));
  const flash = !options.reducedFlash;
  const c = SERPENT_VFX_COLORS;
  const light = (intensity: number, range: number, duration: number, color: string) => (flash ? [{ type: "light" as const, intensity, range, duration, color }] : []);
  return {
    "serpent-orb": {
      name: "serpent-orb",
      layers: [
        { type: "emitter", preset: "pickup-gem", count: n(10), speed: [2, 4.5], life: [0.25, 0.5], size: [0.06, 0.12], color: c.jade, intensity: 2.6, sprite: "glow", additive: true, maxScreen: 0.04 }
      ]
    },
    "serpent-power": {
      name: "serpent-power",
      layers: [
        { type: "emitter", preset: "pickup-power", count: n(16), speed: [3, 6], life: [0.35, 0.7], size: [0.08, 0.16], color: c.gold, intensity: 3, sprite: "flare", additive: true, maxScreen: 0.06 },
        { type: "emitter", preset: "ring", count: 1, speed: 0, life: 0.4, size: [1.2, 1.2], color: c.gold, intensity: 1.6, sprite: "ring-thin", additive: true, maxScreen: 0.1 },
        ...light(3, 10, 0.25, c.gold)
      ]
    },
    "serpent-pearl-chips": {
      name: "serpent-pearl-chips",
      layers: [
        { type: "emitter", preset: "debris", count: n(12), speed: [3, 7], life: [0.5, 0.9], gravity: -16, size: [0.05, 0.1], color: c.pearl, sprite: "debris-chips", additive: false, maxScreen: 0.04 }
      ]
    },
    "serpent-cloud-puff": {
      name: "serpent-cloud-puff",
      layers: [
        { type: "emitter", preset: "dust", count: n(8), speed: [1, 2.5], life: [0.8, 1.4], size: [0.6, 1.2], color: "#ffe2c0", sprite: "smoke-a", additive: false, drag: 2, maxScreen: 0.12 }
      ]
    },
    "serpent-surge": {
      name: "serpent-surge",
      layers: [
        { type: "emitter", preset: "aura-burst", count: n(14), speed: [2, 5], life: [0.3, 0.6], size: [0.06, 0.14], color: c.whiteGold, intensity: 3, sprite: "spark-streak", additive: true, direction: [0, 1, 0], spread: 0.8, maxScreen: 0.05 },
        ...light(4, 12, 0.3, c.whiteGold),
        ...(options.reducedMotion ? [] : [{ type: "camera" as const, shake: 0.15 }])
      ]
    },
    "serpent-hit": {
      name: "serpent-hit",
      layers: [
        { type: "emitter", preset: "spark", count: n(12), speed: [4, 9], life: [0.2, 0.4], size: [0.04, 0.08], color: c.coral, intensity: 2.4, sprite: "spark-streak", additive: true, maxScreen: 0.05 }
      ]
    },
    "serpent-soul": {
      name: "serpent-soul",
      layers: [
        { type: "emitter", preset: "pickup-star", count: n(6), speed: [0.6, 1.4], life: [0.6, 1.1], size: [0.1, 0.2], color: c.soul, intensity: 1.8, sprite: "soft-dot", additive: true, direction: [0, 0, 1], spread: 0.4, maxScreen: 0.04 }
      ]
    },
    "serpent-lightning": {
      name: "serpent-lightning",
      layers: [
        { type: "emitter", preset: "spark-electric", count: n(6), speed: [0, 1], life: [0.08, 0.16], size: [2.5, 4], color: c.storm, intensity: 4, sprite: "electric", additive: true, maxScreen: 0.3 },
        ...light(8, 400, 0.12, c.storm)
      ]
    },
    "serpent-wisp": {
      name: "serpent-wisp",
      layers: [
        { type: "emitter", preset: "dust", count: n(2), speed: [0.2, 0.6], life: [0.7, 1.1], size: [0.9, 1.6], color: c.wisp, intensity: 0.8, sprite: "smoke-b", additive: false, drag: 1.5, maxScreen: 0.1 }
      ]
    },
    "serpent-petals": {
      name: "serpent-petals",
      layers: [
        { type: "emitter", preset: "dust", count: n(3), speed: [0.4, 1.2], life: [2.4, 3.6], gravity: -0.6, size: [0.08, 0.14], color: c.petal, sprite: "dust-mote", additive: false, drag: 0.8, maxScreen: 0.02 }
      ]
    },
    "serpent-embers": {
      name: "serpent-embers",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(3), speed: [0.6, 1.6], life: [1.4, 2.2], gravity: 1.2, size: [0.04, 0.08], color: c.ember, intensity: 2.2, sprite: "soft-dot", additive: true, direction: [0, 1, 0], spread: 0.5, maxScreen: 0.02 }
      ]
    },
    "serpent-rain": serpentRainPreset(options.rainDirection, options.reducedMotion),
    "serpent-mist": {
      name: "serpent-mist",
      layers: [
        { type: "emitter", preset: "dust", count: n(2), speed: [0.1, 0.4], life: [2.2, 3.2], gravity: 0, size: [2.4, 3.6], color: c.mist, intensity: 0.7, sprite: "smoke-a", additive: false, drag: 1, maxScreen: 0.25 }
      ]
    }
  };
}

/** Anything with E-F's `registerPreset` (the app's `effects` extension). */
export interface SerpentPresetRegistry {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
}

/** Registers the pack; returns the kinds registered (the QA hook lists them). */
export function registerSerpentVfx(effects: SerpentPresetRegistry | undefined, options: SerpentVfxOptions = {}): readonly SerpentVfxKind[] {
  if (!effects) return [];
  const presets = serpentVfxPresets(options);
  for (const kind of SERPENT_VFX_KINDS) effects.registerPreset(kind, presets[kind]);
  return SERPENT_VFX_KINDS;
}

/** SSR-12: the runner's surge and flight trail (white-gold, widening with speed). */
export const SERPENT_RUNNER_TRAIL: AuraTrailOptions = { width: 0.42, life: 0.35, color: SERPENT_VFX_COLORS.whiteGold, widthOverSpeed: [40, 90] };
