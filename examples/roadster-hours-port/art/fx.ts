/**
 * GU47 WP-32 RH47-13: the Saltwind Highway driving-feel preset pack (PRD §3.2 item 3), registered with E-F's
 * `app.effects.registerPreset`. Every visual sim event maps to exactly one preset (`SALTWIND_FX_FOR_EVENT`); the world
 * runtime reads the step events (read-only, PRD D8) and bursts the preset at the car. Colours are route-tinted: tyre smoke
 * and landing dust take the route's spray colour, nitro is signal red (the only accent), gate flares are salt white.
 *
 * Budget: a dense moment (land + scrape + nitro + gate) stays under 120 live particles, far inside the 2,000 particle
 * budget shared with the spray. Reduced motion halves every emission and drops camera layers; reduced flash caps every
 * light layer at 0.3 of its intensity (PRD §6.3).
 */
import type { AuraTrailOptions, AuraVfxEffectSpec } from "@aura3d/engine";
import { SALTWIND_PALETTE, type SaltwindLookRow } from "./look";

export type SaltwindFxKind =
  | "saltwind-launch" | "saltwind-land" | "saltwind-landing-flare" | "saltwind-scrape" | "saltwind-nitro"
  | "saltwind-gate" | "saltwind-impact" | "saltwind-cell" | "saltwind-recover" | "saltwind-finish" | "saltwind-skid";

export const SALTWIND_FX_KINDS: readonly SaltwindFxKind[] = [
  "saltwind-launch", "saltwind-land", "saltwind-landing-flare", "saltwind-scrape", "saltwind-nitro",
  "saltwind-gate", "saltwind-impact", "saltwind-cell", "saltwind-recover", "saltwind-finish", "saltwind-skid"
];

/** Sim event type -> the one preset it bursts (events not listed have no visual: audio and HUD only). */
export const SALTWIND_FX_FOR_EVENT: Readonly<Record<string, SaltwindFxKind>> = {
  launch: "saltwind-launch",
  land: "saltwind-land",
  landingFlare: "saltwind-landing-flare",
  scrape: "saltwind-scrape",
  nitro: "saltwind-nitro",
  checkpoint: "saltwind-gate",
  impact: "saltwind-impact",
  cell: "saltwind-cell",
  recover: "saltwind-recover",
  finish: "saltwind-finish"
};

/** Skid decals laid while drifting, at most one per `SKID_INTERVAL` seconds; each lives 8 s (RH47-13). */
export const SKID_INTERVAL = 0.12;
export const SKID_LIFETIME = 8;

export interface SaltwindFxOptions {
  readonly reducedMotion?: boolean;
  readonly reducedFlash?: boolean;
}

/** The pack for one route, keyed by kind (each spec's `name` equals its key). */
export function saltwindFxPresets(row: SaltwindLookRow, options: SaltwindFxOptions = {}): Readonly<Record<SaltwindFxKind, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.round(options.reducedMotion ? count / 2 : count));
  const flash = (intensity: number): number => (options.reducedFlash ? intensity * 0.3 : intensity);
  const dust = row.spray.color;
  const red = SALTWIND_PALETTE.signalRed;
  const salt = SALTWIND_PALETTE.saltWhite;
  const sparkVariant = row.id === "halo" ? "spark-electric" : "spark-fire";
  const dustVariant = row.id === "redline" ? "dust-sand" : "dust-snow";
  const camera = (shake: number) => (options.reducedMotion ? [] : [{ type: "camera" as const, shake }]);
  return {
    "saltwind-launch": { name: "saltwind-launch", layers: [{ type: "emitter", preset: dustVariant, count: n(14), speed: [2, 5], life: [0.5, 1.1], size: [0.4, 1.2], color: dust, additive: false }] },
    "saltwind-land": {
      name: "saltwind-land",
      layers: [
        { type: "emitter", preset: "ring", count: 1, speed: 0, life: 0.45, size: [2.4, 2.4], color: salt, intensity: 1.2, sprite: "ring-thin", additive: true, maxScreen: 0.18 },
        { type: "emitter", preset: dustVariant, count: n(18), speed: [3, 7], life: [0.5, 1.2], size: [0.5, 1.4], color: dust, additive: false, direction: [0, 0.3, 0], spread: 1.4 },
        ...camera(0.18)
      ]
    },
    "saltwind-landing-flare": { name: "saltwind-landing-flare", layers: [{ type: "light", intensity: flash(3), range: 10, duration: 0.2, color: salt }] },
    "saltwind-scrape": { name: "saltwind-scrape", layers: [{ type: "emitter", preset: sparkVariant, count: n(12), speed: [5, 11], life: [0.15, 0.4], size: [0.03, 0.07], color: row.id === "halo" ? "#dfe8ee" : "#ffb070", intensity: 2.4, sprite: "spark-streak", additive: true, maxScreen: 0.05 }] },
    "saltwind-nitro": {
      name: "saltwind-nitro",
      layers: [
        { type: "emitter", preset: "streak", count: n(16), speed: [8, 16], life: [0.2, 0.4], size: [0.05, 0.1], color: red, intensity: 2.2, sprite: "spark-streak", additive: true, direction: [0, 0, 1], spread: 0.35, maxScreen: 0.06 },
        { type: "light", intensity: flash(4), range: 9, duration: 0.25, color: red }
      ]
    },
    "saltwind-gate": {
      name: "saltwind-gate",
      layers: [
        { type: "emitter", preset: "pickup-star", count: n(20), speed: [3, 7], life: [0.3, 0.7], size: [0.08, 0.16], color: salt, intensity: 2, sprite: "flare", additive: true, maxScreen: 0.08 },
        { type: "light", intensity: flash(5), range: 16, duration: 0.3, color: salt }
      ]
    },
    "saltwind-impact": {
      name: "saltwind-impact",
      layers: [
        { type: "emitter", preset: sparkVariant, count: n(20), speed: [6, 13], life: [0.25, 0.6], size: [0.05, 0.1], color: "#ffd2a8", intensity: 2.6, sprite: "spark-streak", additive: true, maxScreen: 0.1 },
        { type: "emitter", preset: "debris", count: n(8), speed: [3, 7], life: [0.6, 1.1], gravity: -14, color: "#3a3a3e", additive: false, maxScreen: 0.04 },
        ...camera(0.4)
      ]
    },
    "saltwind-cell": { name: "saltwind-cell", layers: [{ type: "emitter", preset: "pickup-gold", count: n(10), speed: [1.5, 3.5], life: [0.25, 0.5], size: [0.06, 0.12], color: SALTWIND_PALETTE.ochre, intensity: 2.2, sprite: "glow", additive: true, maxScreen: 0.04 }] },
    "saltwind-recover": { name: "saltwind-recover", layers: [{ type: "emitter", preset: dustVariant, count: n(16), speed: [1, 3], life: [0.6, 1.2], size: [0.6, 1.6], color: dust, additive: false }] },
    "saltwind-finish": {
      name: "saltwind-finish",
      layers: [
        { type: "emitter", preset: "pickup-star", count: n(28), speed: [4, 9], life: [0.6, 1.2], size: [0.1, 0.2], color: salt, intensity: 2.2, sprite: "flare", additive: true, maxScreen: 0.1 },
        { type: "light", intensity: flash(5), range: 20, duration: 0.5, color: red }
      ]
    },
    "saltwind-skid": { name: "saltwind-skid", layers: [{ type: "decal", size: 1.1, lifetime: SKID_LIFETIME, opacity: 0.45, color: "#121316" }] }
  };
}

/** Anything with E-F's `registerPreset` (the app's `effects` extension). */
export interface SaltwindPresetRegistry {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
}

/** Registers the pack for a route; returns the kinds registered (listed by the QA hook). */
export function registerSaltwindFx(effects: SaltwindPresetRegistry | undefined, row: SaltwindLookRow | null, options: SaltwindFxOptions = {}): readonly SaltwindFxKind[] {
  if (!effects || !row) return [];
  const presets = saltwindFxPresets(row, options);
  for (const kind of SALTWIND_FX_KINDS) effects.registerPreset(kind, presets[kind]);
  return SALTWIND_FX_KINDS;
}

/** The signal-red nitro trail on the roadster (E-F `app.effects.trail`); narrower at low speed. */
export const NITRO_TRAIL: AuraTrailOptions = { width: 0.5, life: 0.35, color: SALTWIND_PALETTE.signalRed, widthOverSpeed: [20, 70] };

/** Presets the step's events burst, in order (one per mapped event). */
export function fxForEvents(events: readonly { readonly type: string }[]): SaltwindFxKind[] {
  const out: SaltwindFxKind[] = [];
  for (const e of events) { const kind = SALTWIND_FX_FOR_EVENT[e.type]; if (kind) out.push(kind); }
  return out;
}
