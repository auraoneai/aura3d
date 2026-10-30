/**
 * GU47 WP-26 look table (PRD §3.2 item 2): one row per variant, presentation only. `?look=original` keeps the 4.6.0 frame
 * (the GLSL constants in `shaders.ts`, the neutral-room backdrop rig, no post); `?look=carnival` (the default) is the
 * "paint carnival at golden hour" look. Nothing here is read by `sim.ts`; the time of day is a pure function of the
 * distance the simulation already reports, so replays, traces and the random stream are identical across looks.
 *
 * Every number a phase-2 capture may need to recalibrate lives in this file (one-line changes).
 */
import type { AuraHdriId } from "@aura3d/engine";

export const LOOK_IDS = ["original", "carnival"] as const;
export type LookId = (typeof LOOK_IDS)[number];
export const DEFAULT_LOOK: LookId = "carnival";

/** `?look=original|carnival`; anything else (or nothing) is the default look. */
export function parseLook(search: string | URLSearchParams | undefined): LookId {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const value = params?.get("look") ?? "";
  return (LOOK_IDS as readonly string[]).includes(value) ? (value as LookId) : DEFAULT_LOOK;
}

/** One sky / light keyframe of the carnival run-length time of day. */
export interface SkyStage {
  readonly name: "golden" | "rose" | "violet";
  /** Run distance (metres, `sim.o.distance`) at which this stage is fully reached. */
  readonly at: number;
  readonly zenith: string;
  readonly upper: string;
  readonly rose: string;
  readonly horizon: string;
  /** Cloud sea below the apparent horizon. */
  readonly sea: string;
  readonly sunColor: string;
  readonly sunIntensity: number;
  /** Sun elevation above the real horizon for shading (degrees). */
  readonly sunElevationDeg: number;
  readonly skyFill: string;
  readonly bounce: string;
  readonly cloudTop: string;
  readonly cloudShadow: string;
  /** Star layer opacity (0 = none). */
  readonly stars: number;
}

export interface ToonLightRow {
  readonly sunAzimuthDeg: number;
  /** Hemisphere ground colour under the sky fill. */
  readonly ground: string;
  readonly fillIntensity: number;
  readonly bounceIntensity: number;
  /** Bounce light comes from below and behind the camera (rose light reflected by the cloud sea). */
  readonly bounceDirection: readonly [number, number, number];
  /** CR-L2 stepped fresnel rim. */
  readonly rim: { readonly color: string; readonly intensity: number; readonly threshold: number };
  /** CR-S3 exp2 horizon haze density (per metre). */
  readonly fogDensity: number;
  /** CR-M1 wet-paint gloss (ball and fresh splatters). */
  readonly gloss: { readonly ball: number; readonly fresh: number; readonly drySeconds: number; readonly shininess: number };
  /** CR-M2 painted-canvas deck (weave and brush-streak amplitudes, 0..1). */
  readonly canvas: { readonly weave: number; readonly streak: number };
}

export interface SplatLook {
  readonly id: LookId;
  readonly timeOfDay: string;
  /** Scene clear colour behind the sky dome. */
  readonly background: string;
  /** `null`: the 4.6.0 GLSL constants (`shaders.ts`). */
  readonly toon: ToonLightRow | null;
  /** `null`: the 4.6.0 four-stop canvas gradient. */
  readonly sky: null | {
    /** sin(elevation) of the painted horizon in view space: the camera looks down on the road, so it sits low. */
    readonly horizonY: number;
    readonly sunDiscDeg: number;
    readonly haloDeg: number;
    /** Painted sun-disc position on the dome (degrees above the painted horizon, azimuth from the road direction). */
    readonly discElevationDeg: number;
    readonly cirrus: number;
    readonly starCount: number;
    readonly stages: readonly SkyStage[];
  };
  readonly environment:
    | { readonly kind: "neutral"; readonly intensity: number }
    | { readonly kind: "hdri"; readonly id: AuraHdriId; readonly intensity: number; readonly rotationDeg: number; readonly fallback: "sunset" };
  /** Engine lights for the GLBs (backdrop and pickups). */
  readonly backdropLights: "original" | "from-toon";
  readonly post: null | {
    readonly bloom: { readonly intensity: number; readonly threshold: number; readonly scatter: number };
    readonly vignette: { readonly intensity: number; readonly color: string };
    readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number };
    readonly outline: { readonly color: string; readonly width: number; readonly targets: readonly string[] };
  };
  readonly clouds: { readonly high: string; readonly low: string };
  /** CR-S2 scrolling cloud-sea plane under the road. */
  readonly cloudSea: null | { readonly y: number; readonly color: string; readonly scroll: number };
  /** CR-V1 runtime paint bursts. */
  readonly vfx: boolean;
  /** CR-V2 ball ribbon (last 12 positions). */
  readonly ribbon: null | { readonly points: number; readonly width: number; readonly alpha: number };
  /** CR-C1 presentation camera layers. */
  readonly camera: null | { readonly maxRollDeg: number; readonly speedFovDeg: number };
  /** CR-W1 festival bunting. */
  readonly bunting: null | { readonly spacing: number };
  /** CR-AN2 backdrop sway amplitude (degrees). */
  readonly sway: null | { readonly balloonDeg: number; readonly islandDeg: number };
  /** CR-M3 paint-drip gate arches and CR-AN1 drip wobble (world units at the bead, Hz) and match squash (seconds). */
  /** CR-W2 horizon silhouette ring of crayon spires and towers, standing in the cloud sea (one static node). */
  readonly spires: null | { readonly count: number; readonly radius: number; readonly baseY: number; readonly minHeight: number; readonly maxHeight: number; readonly colors: readonly string[] };
  readonly gates: null | { readonly drips: boolean; readonly wobble: number; readonly wobbleHz: number; readonly squashSeconds: number };
}

/** Gate colours (sim `COLORS`): reserved as the most saturated things on screen. */
export const GATE_COLORS = ["#f0433a", "#f9c647", "#5ecaf0", "#b868e8"] as const;

export const LOOKS: Readonly<Record<LookId, SplatLook>> = {
  original: {
    id: "original",
    timeOfDay: "noon (4.6.0)",
    background: "#bfdcee",
    toon: null,
    sky: null,
    environment: { kind: "neutral", intensity: 0.8 },
    backdropLights: "original",
    post: null,
    clouds: { high: "#ffffff", low: "#eaf4ff" },
    cloudSea: null,
    vfx: false,
    ribbon: null,
    camera: null,
    bunting: null,
    sway: null,
    spires: null,
    gates: null
  },
  carnival: {
    id: "carnival",
    timeOfDay: "golden hour to rose dusk to violet twilight by run distance",
    background: "#a99bc9",
    toon: {
      sunAzimuthDeg: -35,
      ground: "#5b4a6e",
      fillIntensity: 0.42,
      bounceIntensity: 0.22,
      bounceDirection: [0.2, -0.35, 1],
      rim: { color: "#ffb27a", intensity: 0.55, threshold: 0.62 },
      fogDensity: 0.0042,
      gloss: { ball: 0.55, fresh: 0.7, drySeconds: 2, shininess: 48 },
      canvas: { weave: 0.05, streak: 0.06 }
    },
    sky: {
      horizonY: -0.42,
      sunDiscDeg: 1.6,
      haloDeg: 9,
      discElevationDeg: 7,
      cirrus: 0.35,
      starCount: 120,
      stages: [
        {
          name: "golden", at: 500,
          zenith: "#1f4a63", upper: "#5d6f8c", rose: "#e8798a", horizon: "#f3a96b", sea: "#a99bc9",
          sunColor: "#ffc58a", sunIntensity: 0.75, sunElevationDeg: 16, skyFill: "#6f8fb8", bounce: "#e8798a",
          cloudTop: "#f6c79a", cloudShadow: "#9f8fc0", stars: 0
        },
        {
          name: "rose", at: 3500,
          zenith: "#1c3b57", upper: "#6a5a85", rose: "#e06c86", horizon: "#ee8f6a", sea: "#9a86bd",
          sunColor: "#ff9f7a", sunIntensity: 0.62, sunElevationDeg: 9, skyFill: "#6a7fac", bounce: "#e2708c",
          cloudTop: "#f0a99a", cloudShadow: "#8f7cb6", stars: 0.25
        },
        {
          name: "violet", at: 6500,
          zenith: "#15243f", upper: "#4a3f72", rose: "#a8628f", horizon: "#c97a78", sea: "#7d6aa8",
          sunColor: "#e58aa0", sunIntensity: 0.48, sunElevationDeg: 3, skyFill: "#5d6a9c", bounce: "#b8689a",
          cloudTop: "#c993b0", cloudShadow: "#6f5f9c", stars: 1
        }
      ]
    },
    environment: { kind: "hdri", id: "kloppenheim_06_puresky", intensity: 0.65, rotationDeg: 145, fallback: "sunset" },
    backdropLights: "from-toon",
    post: {
      bloom: { intensity: 0.45, threshold: 0.92, scatter: 0.5 },
      vignette: { intensity: 0.22, color: "#3a2440" },
      grade: { contrast: 1.06, saturation: 1.08, temperature: 0.06 },
      outline: { color: "#3b1f3f", width: 2, targets: ["ball", "gates", "rails"] }
    },
    clouds: { high: "#ffffff", low: "#ffffff" },
    cloudSea: { y: -22, color: "#a99bc9", scroll: 0.35 },
    vfx: true,
    ribbon: { points: 12, width: 0.42, alpha: 0.55 },
    camera: { maxRollDeg: 3, speedFovDeg: 3 },
    bunting: { spacing: 26 },
    sway: { balloonDeg: 5, islandDeg: 2.5 },
    spires: { count: 54, radius: 96, baseY: -24, minHeight: 12, maxHeight: 30, colors: ["#4a3f72", "#5a4a80", "#6a5a85"] },
    gates: { drips: true, wobble: 0.045, wobbleHz: 0.9, squashSeconds: 0.25 }
  }
};

/* ------------------------------------------------------------------ colour helpers (pure) */

export type Rgb = readonly [number, number, number];

export const hexSrgb = (hex: string): Rgb => {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const toLinear = (s: number): number => (s < 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
export const hexToLinear = (hex: string): Rgb => {
  const [r, g, b] = hexSrgb(hex);
  return [toLinear(r), toLinear(g), toLinear(b)];
};
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Unit vector towards the sun: azimuth 0 looks down the road (-z), positive to the right (+x). */
export function sunDirection(elevationDeg: number, azimuthDeg: number): Rgb {
  const el = (elevationDeg * Math.PI) / 180, az = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

/** The blended sky / light state at one run distance, linear RGB, ready for uniforms. */
export interface TimeOfDay {
  /** 0 at the golden stage, 1 at the rose stage, 2 at the violet stage (fractional between). */
  readonly stage: number;
  readonly zenith: Rgb;
  readonly upper: Rgb;
  readonly rose: Rgb;
  readonly horizon: Rgb;
  readonly sea: Rgb;
  readonly sunColor: Rgb;
  readonly sunIntensity: number;
  readonly sunDirection: Rgb;
  readonly skyFill: Rgb;
  readonly bounce: Rgb;
  readonly cloudTop: Rgb;
  readonly cloudShadow: Rgb;
  readonly stars: number;
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Pure function of the distance: golden until 500 m, rose at 3,500 m, violet from 6,500 m. */
export function timeOfDay(look: SplatLook, distance: number): TimeOfDay | null {
  const sky = look.sky, toon = look.toon;
  if (!sky || !toon) return null;
  const stages = sky.stages;
  let i = 0;
  while (i < stages.length - 2 && distance >= (stages[i + 1] as SkyStage).at) i++;
  const a = stages[i] as SkyStage, b = stages[i + 1] as SkyStage;
  const t = smooth((distance - a.at) / (b.at - a.at));
  const c = (key: "zenith" | "upper" | "rose" | "horizon" | "sea" | "sunColor" | "skyFill" | "bounce" | "cloudTop" | "cloudShadow"): Rgb =>
    mixRgb(hexToLinear(a[key]), hexToLinear(b[key]), t);
  const n = (key: "sunIntensity" | "sunElevationDeg" | "stars"): number => a[key] + (b[key] - a[key]) * t;
  return {
    stage: i + t,
    zenith: c("zenith"), upper: c("upper"), rose: c("rose"), horizon: c("horizon"), sea: c("sea"),
    sunColor: c("sunColor"), sunIntensity: n("sunIntensity"), sunDirection: sunDirection(n("sunElevationDeg"), toon.sunAzimuthDeg),
    skyFill: c("skyFill"), bounce: c("bounce"), cloudTop: c("cloudTop"), cloudShadow: c("cloudShadow"), stars: n("stars")
  };
}

/** Quantised stage key: uniforms are rewritten only when the time of day moved by a visible step. */
export const timeOfDayKey = (tod: TimeOfDay | null): number => (tod ? Math.round(tod.stage * 64) : -1);

/** E-I capture crops per look (normalised 0..1). The chase camera keeps these bands stable during play. */
export interface QaCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
const COMMON_CROPS: readonly QaCrop[] = [
  { name: "sky-top", x: 0, y: 0, w: 1, h: 0.1 },
  { name: "sky-mid-left", x: 0, y: 0.25, w: 0.3, h: 0.2 },
  { name: "sky-mid-right", x: 0.7, y: 0.25, w: 0.3, h: 0.2 },
  { name: "ball", x: 0.43, y: 0.6, w: 0.14, h: 0.24 },
  { name: "deck-near", x: 0.6, y: 0.82, w: 0.25, h: 0.16 },
  { name: "road-far", x: 0.46, y: 0.28, w: 0.08, h: 0.06 },
  { name: "bottom-rows", x: 0, y: 0.9, w: 1, h: 0.1 }
];
export const QA_CROPS: Readonly<Record<LookId, readonly QaCrop[]>> = {
  original: COMMON_CROPS,
  carnival: [...COMMON_CROPS, { name: "sun", x: 0.2, y: 0.3, w: 0.16, h: 0.16 }]
};
