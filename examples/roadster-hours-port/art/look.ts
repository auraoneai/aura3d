/**
 * GU47 WP-32 look table for Saltwind Highway (PRD §3.2 item 2): one row per route, three hours of one day on a
 * wind-scoured Atlantic coast. Every number the engine lights, the IBL, the post chain and the custom GLSL surfaces read
 * comes from this one record (RH47-02): `look.ts` turns a row into the shader `Look`, `world.ts` mounts the engine nodes
 * from the same row.
 *
 * Directions: the road runs toward -z and lateral +l is to the right of travel. `azimuthDeg` is measured from straight
 * ahead (-z), positive to the right (+x); `elevationDeg` above the horizon. The sea is on the left (seaSide -1) on every
 * route, so a negative azimuth puts the sun over the water.
 *
 * Identity (PRD WP-32): salt white #e9e4d6, sea teal #12606e, ochre #c9a25e, signal red #c8321f as the only accent.
 * Halo is blue hour over a mercury-white and sea-glass city carpet with red beacons: no amber, no neon.
 */
import type { AuraHdriId } from "@aura3d/engine";

export type SaltwindVariant = "sunbreak" | "redline" | "halo";

export const SALTWIND_VARIANTS: readonly SaltwindVariant[] = ["sunbreak", "redline", "halo"];

export const SALTWIND_PALETTE = {
  saltWhite: "#e9e4d6",
  seaTeal: "#12606e",
  ochre: "#c9a25e",
  signalRed: "#c8321f"
} as const;

/** The signature effect: crosswind salt spray (sand on Redline, mist on Halo) blown off the sea-side cliff base. */
export interface SprayLook {
  readonly kind: "salt" | "sand" | "mist";
  readonly color: string;
  /** Opacity scale of one sprite (0..1). */
  readonly alpha: number;
  /** Fraction of the particle pool alive at full wind (0..1); reduced motion halves it. */
  readonly density: number;
  /** Lateral drift across the road in m/s (positive blows from the sea side toward the cliffs). */
  readonly windSpeed: number;
  /** Sprite size range in metres. */
  readonly size: readonly [number, number];
  /** Height band above the road the sheets travel in (metres). */
  readonly height: readonly [number, number];
}

export interface SaltwindLookRow {
  readonly id: SaltwindVariant;
  readonly timeOfDay: string;
  /** E-A catalogue id of the IBL that lights the vehicles (reflections only; the custom dome stays the visible sky). */
  readonly hdri: AuraHdriId;
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number };
  /** The one unshadowed fill: sea bounce (Sunbreak), violet rim (Redline), city glow from below (Halo). */
  readonly fill: { readonly kind: "sea-bounce" | "violet-rim" | "city-glow"; readonly color: string; readonly intensity: number; readonly elevationDeg: number; readonly azimuthDeg: number };
  /** Cool gantry point lights that ride with the next relay gate (Halo only). */
  readonly gantryPoints: { readonly count: number; readonly color: string; readonly intensity: number; readonly distance: number } | null;
  readonly sky: {
    readonly zenith: string;
    readonly horizon: string;
    /** Low band on the sea side: salt haze by day, the city glow at blue hour. */
    readonly band: string;
    readonly bandAmount: number;
    /** Coverage of the two wind-driven cloud layers (high cirrus, low cumulus). */
    readonly clouds: readonly [number, number];
    readonly night: number;
  };
  readonly ambient: { readonly sky: string; readonly skyGain: number; readonly ground: string; readonly groundGain: number };
  readonly fog: { readonly color: string; readonly near: number; readonly far: number; readonly density: number };
  readonly surfaces: {
    readonly asphalt: readonly [number, number, number];
    readonly roadGloss: number;
    readonly rockA: string;
    readonly rockB: string;
    readonly grass: string;
    readonly sand: string;
    readonly deepWater: string;
    readonly shallowWater: string;
    /** Whitecap and surf-line amount on the water (0..1). */
    readonly whitecaps: number;
    readonly beam: number;
    /** RH47-10: CC0 detail maps (asphalt plus one rock set) and their strength on the custom road and terrain surfaces. */
    readonly detail: { readonly rock: "limestone" | "sandstone"; readonly amount: number };
  };
  /** Relay gantry tint (RH47-11): the gate frame and its glow. */
  readonly gantry: { readonly frame: string; readonly glow: string; readonly glowAmount: number };
  readonly post: {
    readonly bloom: { readonly intensity: number; readonly threshold: number; readonly scatter: number };
    readonly flare: number;
    readonly grain: number;
    /** Depth-masked heat shimmer beyond `startMetres` (Redline last light). */
    readonly heat: { readonly amount: number; readonly startMetres: number };
    readonly autoExposure: boolean;
    readonly vignette: number;
  };
  readonly grade: { readonly exposure: number; readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  readonly shadow: { readonly cascades: 3; readonly maxDistance: number; readonly filter: "pcss"; readonly mapSize: 2048 };
  readonly spray: SprayLook;
  /** Wind across the road (x, z in world units per second) for clouds, whitecaps and spray. */
  readonly wind: readonly [number, number];
}

const SHADOW = { cascades: 3, maxDistance: 260, filter: "pcss", mapSize: 2048 } as const;

export const SALTWIND_LOOK: Readonly<Record<SaltwindVariant, SaltwindLookRow>> = {
  sunbreak: {
    id: "sunbreak",
    timeOfDay: "4 pm side sun through salt haze",
    hdri: "belfast_sunset_puresky",
    environmentIntensity: 0.55,
    environmentRotationDeg: 300,
    sun: { elevationDeg: 20, azimuthDeg: -62, color: "#ffe2b0", intensity: 3.4 },
    fill: { kind: "sea-bounce", color: "#8fc6c4", intensity: 0.55, elevationDeg: 8, azimuthDeg: -110 },
    gantryPoints: null,
    sky: { zenith: "#4f87b5", horizon: "#dfe2d8", band: "#e9e4d6", bandAmount: 0.55, clouds: [0.45, 0.6], night: 0 },
    ambient: { sky: "#86b2cf", skyGain: 0.5, ground: "#c9b48a", groundGain: 0.24 },
    fog: { color: "#dfe2d8", near: 150, far: 1900, density: 0.00042 },
    surfaces: {
      asphalt: [0.05, 0.056, 0.07], roadGloss: 0.45,
      rockA: "#e3d9c0", rockB: "#c9a25e", grass: "#b49c5a", sand: "#e9e4d6",
      deepWater: "#0d4b58", shallowWater: "#1f8c8c", whitecaps: 0.75, beam: 0.3,
      detail: { rock: "limestone", amount: 1 }
    },
    gantry: { frame: "#e9e4d6", glow: "#c8321f", glowAmount: 0.6 },
    post: { bloom: { intensity: 0.3, threshold: 1.1, scatter: 0.55 }, flare: 0.5, grain: 0, heat: { amount: 0, startMetres: 40 }, autoExposure: false, vignette: 0.18 },
    grade: { exposure: 1.0, contrast: 1.06, saturation: 1.04, temperature: 0.06, tint: 0 },
    shadow: SHADOW,
    spray: { kind: "salt", color: "#eef1ee", alpha: 0.3, density: 0.85, windSpeed: 9, size: [0.12, 0.55], height: [0.2, 6] },
    wind: [6, -1.5]
  },
  redline: {
    id: "redline",
    timeOfDay: "last light, 7 deg sun, heat shimmer",
    hdri: "industrial_sunset_puresky",
    environmentIntensity: 0.5,
    environmentRotationDeg: 330,
    sun: { elevationDeg: 7, azimuthDeg: -30, color: "#ff9a5a", intensity: 3.8 },
    fill: { kind: "violet-rim", color: "#8a72c8", intensity: 0.85, elevationDeg: 18, azimuthDeg: 150 },
    gantryPoints: null,
    sky: { zenith: "#3b4f86", horizon: "#f2a66e", band: "#e9b98c", bandAmount: 0.4, clouds: [0.35, 0.25], night: 0 },
    ambient: { sky: "#8d97c4", skyGain: 0.44, ground: "#b8744a", groundGain: 0.3 },
    fog: { color: "#ecb488", near: 120, far: 1700, density: 0.00055 },
    surfaces: {
      asphalt: [0.09, 0.07, 0.065], roadGloss: 0.65,
      rockA: "#c97a4c", rockB: "#8a4128", grass: "#9a8344", sand: "#d8a46e",
      deepWater: "#12606e", shallowWater: "#3a9a9c", whitecaps: 0.3, beam: 0.45,
      detail: { rock: "sandstone", amount: 1 }
    },
    gantry: { frame: "#2b2a2e", glow: "#c8321f", glowAmount: 0.9 },
    post: { bloom: { intensity: 0.45, threshold: 1.0, scatter: 0.6 }, flare: 0.75, grain: 0.06, heat: { amount: 1, startMetres: 40 }, autoExposure: false, vignette: 0.24 },
    grade: { exposure: 1.0, contrast: 1.1, saturation: 1.08, temperature: 0.14, tint: 0.03 },
    shadow: SHADOW,
    spray: { kind: "sand", color: "#e2b88a", alpha: 0.24, density: 0.6, windSpeed: 7, size: [0.1, 0.45], height: [0.1, 4] },
    wind: [5, 0.5]
  },
  halo: {
    id: "halo",
    timeOfDay: "blue hour over a mercury-white city carpet",
    hdri: "rooftop_night",
    environmentIntensity: 0.4,
    environmentRotationDeg: 40,
    sun: { elevationDeg: 24, azimuthDeg: 25, color: "#a9bce8", intensity: 0.6 },
    fill: { kind: "city-glow", color: "#bfd8e0", intensity: 0.45, elevationDeg: -60, azimuthDeg: 0 },
    gantryPoints: { count: 2, color: "#cfe6ff", intensity: 6, distance: 34 },
    sky: { zenith: "#1b2550", horizon: "#4e6496", band: "#a9c6cf", bandAmount: 0.6, clouds: [0.2, 0], night: 0.75 },
    ambient: { sky: "#5a74b0", skyGain: 0.36, ground: "#8fb3bd", groundGain: 0.34 },
    fog: { color: "#3c5084", near: 110, far: 1500, density: 0.0006 },
    surfaces: {
      asphalt: [0.05, 0.056, 0.075], roadGloss: 0.5,
      rockA: "#3a4560", rockB: "#262e44", grass: "#26343a", sand: "#46506a",
      deepWater: "#0c2236", shallowWater: "#1b4a5c", whitecaps: 0, beam: 1.3,
      detail: { rock: "limestone", amount: 0.7 }
    },
    gantry: { frame: "#cfd8de", glow: "#c8321f", glowAmount: 1.2 },
    post: { bloom: { intensity: 0.45, threshold: 1.05, scatter: 0.6 }, flare: 0, grain: 0, heat: { amount: 0, startMetres: 40 }, autoExposure: true, vignette: 0.26 },
    grade: { exposure: 1.05, contrast: 1.08, saturation: 1.0, temperature: -0.08, tint: 0 },
    shadow: SHADOW,
    spray: { kind: "mist", color: "#c9dbe6", alpha: 0.16, density: 0.5, windSpeed: 5, size: [0.15, 0.6], height: [0.5, 8] },
    wind: [3.5, -0.5]
  }
};

/** Unit vector toward a light from its elevation and azimuth (see the header for the convention). */
export function directionFromAngles(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180, az = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

/** `?look=original` keeps today's look (pre-GU47 rig, preset IBL, one-cascade sun); anything else is the GU47 look. */
export function lookModeFrom(search: string): "gu47" | "original" {
  return new URLSearchParams(search).get("look") === "original" ? "original" : "gu47";
}
