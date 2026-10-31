/**
 * GU47 WP-25 (lane g15) look table for Craterline GP: "Gouache on the crater rim".
 *
 * One row per variant (PRD §3.2 item 2). `gouache` is the default; `?look=original` keeps the 4.6.1 look (same rig
 * positions, colours and post values as before GU47) so before/after captures can run on one build.
 * Sector rows (SO47-L3) retint the key and the haze per PALETTE_STOP colour family; `sectorAt(s)` picks one.
 * Pure data plus small helpers: no engine calls, so unit tests import it without a renderer.
 */
import { PALETTE_STOPS } from "../palette";

export type OrbitLook = "gouache" | "original";
export type SectorId = "warm" | "violet" | "jade" | "opal";
export type Vec3 = readonly [number, number, number];

/** `?look=original` (today's look) or the default gouache look. */
export function lookFromSearch(search: string | null | undefined): OrbitLook {
  const raw = search ? new URLSearchParams(search).get("look") : null;
  return raw === "original" ? "original" : "gouache";
}

export interface DirectionalRow {
  /** World position of the light (it aims at the origin, the centre of the orbit ring). */
  readonly position: Vec3;
  readonly color: string;
  readonly intensity: number;
}

export interface LookRow {
  readonly id: OrbitLook;
  readonly timeOfDay: string;
  readonly sky: string;
  readonly key: DirectionalRow & { readonly elevationDeg: number; readonly azimuthDeg: number; readonly cascades: 2 | 3; readonly filter: "pcf" | "pcss"; readonly maxDistance: number };
  readonly fill: DirectionalRow | null;
  /** SO47-L2: warm unshadowed directional from the gas giant. */
  readonly planetshine: DirectionalRow | null;
  readonly hemisphere: { readonly sky: string; readonly ground: string; readonly intensity: number };
  /** Environment: the captured nebula/planet probe (SO47-E1) or the neutral room. */
  readonly environment: { readonly kind: "capture" | "neutral"; readonly intensity: number };
  /** Scene fog the custom shaders read through `u_a3dFogColor` / `u_a3dFogDensity` (exp2) and the GLBs get from the engine. */
  readonly fog: { readonly color: string; readonly density: number; readonly maxOpacity: number; readonly heightMist: number } | null;
  readonly post: {
    readonly bloom: { readonly intensity: number; readonly threshold: number; readonly radius: number };
    readonly grade: { readonly contrast: number; readonly saturation: number };
    readonly vignette: { readonly intensity: number; readonly smoothness: number };
    readonly grain: { readonly intensity: number; readonly size: number } | null;
  };
  readonly camera: { readonly baseFov: number; readonly boostKick: number; readonly landingKick: number; readonly leanRollDeg: number };
  readonly planet: { readonly position: Vec3; readonly size: number; readonly ring: boolean; readonly moon: boolean };
  /** Output exposure in EV (pre-tone-map `output.exposure = 2^ev`); 0 keeps the 4.6.1 exposure. */
  readonly exposureEV: number;
  /** Signature-effect parameters: gouache brush scale and split-tone strength in the custom shaders (0 = off). */
  readonly signature: { readonly brush: number; readonly splitTone: number };
}

const DEG = Math.PI / 180;

/** Light position `distance` metres away at `elevationDeg` above the horizon and `azimuthDeg` from +X toward +Z. */
export function lightPosition(elevationDeg: number, azimuthDeg: number, distance = 600): Vec3 {
  const e = elevationDeg * DEG;
  const a = azimuthDeg * DEG;
  return [Math.cos(e) * Math.cos(a) * distance, Math.sin(e) * distance, Math.cos(e) * Math.sin(a) * distance];
}

/**
 * Gas giant placement (SO47-E2): outside the orbit ring on -X, so at the start grid (riders face +Z, left is +X) it
 * fills the right of the sky while the 18-degree key comes from the left.
 */
const GIANT_POSITION: Vec3 = [-880, 70, 120];

export const LOOKS: Readonly<Record<OrbitLook, LookRow>> = {
  gouache: {
    id: "gouache",
    timeOfDay: "permanent planet-rise, low white sun",
    sky: "nebula dome (violet-teal) + banded peach gas giant with a ring + small moon, captured into the environment probe",
    key: { elevationDeg: 18, azimuthDeg: 0, position: lightPosition(18, 0), color: "#fff3e4", intensity: 3.0, cascades: 3, filter: "pcss", maxDistance: 200 },
    fill: null,
    planetshine: { position: [GIANT_POSITION[0], GIANT_POSITION[1] + 60, GIANT_POSITION[2]], color: "#ffb48c", intensity: 0.8 },
    hemisphere: { sky: "#d8c2d6", ground: "#24395a", intensity: 0.95 },
    environment: { kind: "capture", intensity: 0.85 },
    fog: { color: "#2a2a4d", density: 0.0011, maxOpacity: 0.78, heightMist: 1 },
    post: {
      bloom: { intensity: 0.3, threshold: 0.78, radius: 0.5 },
      grade: { contrast: 1.1, saturation: 1.2 },
      vignette: { intensity: 0.24, smoothness: 0.7 },
      grain: { intensity: 0.035, size: 1.6 }
    },
    camera: { baseFov: 64, boostKick: 9, landingKick: 5, leanRollDeg: 2 },
    planet: { position: GIANT_POSITION, size: 520, ring: true, moon: true },
    // Phase 2 (software WebGL2 capture): the freeze frame read mean 32 (engine light-uniform and frame-camera bugs, fixed on
    // integration 22c1283c0). With those fixed, +1.75 EV washed the rider out (crop mean 160 vs 95-125, saturation 0.17), so
    // +1.0 EV with less bloom and more saturation: rider and crater keep their colour, the frame stays inside 60-110.
    exposureEV: 1.0,
    signature: { brush: 1, splitTone: 1 }
  },
  original: {
    id: "original",
    timeOfDay: "4.6.1 look: high warm key, cool fill",
    sky: "nebula dome + small planet overhead, neutral room environment",
    key: { elevationDeg: 52.7, azimuthDeg: -45, position: [150, 280, -150], color: "#ffd09a", intensity: 2.6, cascades: 2, filter: "pcf", maxDistance: 160 },
    fill: { position: [-140, 80, 210], color: "#8195bc", intensity: 1.0 },
    planetshine: null,
    hemisphere: { sky: "#f8d4a0", ground: "#2f3957", intensity: 1.1 },
    environment: { kind: "neutral", intensity: 0.9 },
    fog: { color: "#59617f", density: 0.00043, maxOpacity: 0.82, heightMist: 0 },
    post: {
      bloom: { intensity: 0.5, threshold: 0.78, radius: 0.55 },
      grade: { contrast: 1.06, saturation: 1.14 },
      vignette: { intensity: 0.22, smoothness: 0.7 },
      grain: null
    },
    camera: { baseFov: 72, boostKick: 0, landingKick: 0, leanRollDeg: 0 },
    planet: { position: [-17, 83, 48], size: 300, ring: false, moon: false },
    exposureEV: 0,
    signature: { brush: 0, splitTone: 0 }
  }
};

/** Linear output exposure multiplier for a look (`output.exposure`). */
export function lookExposure(look: OrbitLook): number {
  return 2 ** LOOKS[look].exposureEV;
}

export interface SectorRow {
  readonly id: SectorId;
  readonly keyColor: string;
  readonly keyIntensity: number;
  readonly fogColor: string;
  readonly fogDensity: number;
  /** Hue rotation of the nebula dome in turns (SO47-E2 "nebula shifts per sector"). */
  readonly nebulaShift: number;
}

/** SO47-L3: key tint and haze per painted sector (warm, violet, jade, opal). */
export const SECTORS: Readonly<Record<SectorId, SectorRow>> = {
  warm: { id: "warm", keyColor: "#fff1df", keyIntensity: 3.0, fogColor: "#3a2a44", fogDensity: 0.0011, nebulaShift: 0 },
  violet: { id: "violet", keyColor: "#e9dcff", keyIntensity: 2.7, fogColor: "#2b2458", fogDensity: 0.0013, nebulaShift: 0.08 },
  jade: { id: "jade", keyColor: "#e2fff3", keyIntensity: 2.8, fogColor: "#173f48", fogDensity: 0.0012, nebulaShift: -0.12 },
  opal: { id: "opal", keyColor: "#fff0f6", keyIntensity: 2.9, fogColor: "#3d3550", fogDensity: 0.001, nebulaShift: 0.18 }
};

/** Seconds the key and haze take to move to a new sector (SO47-L3). */
export const SECTOR_LERP_SECONDS = 1.5;

/** The painted sector at course distance `s`: the PALETTE_STOP the rider is in (the unused `night` palette maps to violet). */
export function sectorAt(s: number): SectorId {
  const lap = PALETTE_STOPS[PALETTE_STOPS.length - 1]![0];
  const t = ((s % lap) + lap) % lap;
  let name = PALETTE_STOPS[0]![1];
  for (const [at, palette] of PALETTE_STOPS) {
    if (t >= at) name = palette;
    else break;
  }
  return name === "jade" || name === "opal" || name === "violet" ? name : name === "night" ? "violet" : "warm";
}

/** Reduced motion (PRD §6.3): FOV kicks and lean roll drop to 0, particle emission halves. */
export const REDUCED_MOTION_LOOK = { fovKick: 0, roll: 0, emission: 0.5 } as const;
