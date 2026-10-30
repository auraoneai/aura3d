/**
 * Thermal Drift look table (GU47 WP-13, PRD §3.2 item 2): one row per circuit. Each circuit is a time of day of the
 * same foundry megacity: MEGACITY a rain-wet sodium night, DUSTFALL an ochre dust storm under a 9-degree burnt sun,
 * VESPER a violet pre-dawn lit from below by vents. Pure data (type-only imports), read by scene.ts, main.ts and the
 * unit tests; the art direction is `../art/direction.ts`.
 */
import type { AuraHdriId } from "@aura3d/engine";
import type { CircuitId } from "./data";

/** Foundry palette (art/direction.ts). Coolant cyan is reserved for pickups, shields and the cooling HUD. */
export const PALETTE = {
  soot: "#14110f",
  oxidisedIron: "#3a2a22",
  moltenAmber: "#ff8a1f",
  slagRed: "#d2361c",
  coolantCyan: "#35d6ff"
} as const;

export type WeatherKind = "rain" | "dust" | "embers";
/** The three E-A catalogue skies this game uses (aura-assets.ts `HDRI_BY_ID`). */
export type CircuitHdriId = Extract<AuraHdriId, "rooftop_night" | "industrial_sunset_puresky" | "spruit_sunrise">;

export interface KeyLightRow {
  readonly color: string;
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly intensity: number;
}

export interface CircuitLook {
  readonly circuit: CircuitId;
  readonly timeOfDay: string;
  /** E-A catalogue HDRI (`/hdri/<id>_1k.hdr`), drawn as the sky (HS-03). */
  readonly hdri: CircuitHdriId;
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  /** The one shadowed light: PCSS, 3 cascades (HS-01). */
  readonly key: KeyLightRow;
  /** Unshadowed coolant counter-rim opposite the key (HS-01). */
  readonly rim: { readonly color: string; readonly intensity: number };
  /** VESPER only: unshadowed vent light from below (HS-01). */
  readonly upFill?: { readonly color: string; readonly intensity: number };
  /** Exponential scene fog (HS-05). */
  readonly fog: { readonly color: string; readonly density: number };
  /** DUSTFALL only: volumetric inscatter with god rays from the low sun (HS-05). */
  readonly volumetricFog?: { readonly color: string; readonly density: number; readonly intensity: number; readonly godRayDensity: number };
  readonly exposureEv: number;
  /** Colour grade (HS-12). temperature/tint are [-1, 1]. */
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  /** Warm bloom (HS-12). */
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly color: string };
  readonly vignette: number;
  /** Film grain intensity; 0 = no grain node (MEGACITY only, HS-12). */
  readonly grain: number;
  /** Motion blur while boosting, High tier only (HS-12). */
  readonly boostMotionBlur: number;
  /** One weather system per circuit (HS-06). */
  readonly weather: WeatherKind;
  /** Road deck material (HS-07): wet asphalt or ochre dust. */
  readonly road: { readonly color: string; readonly colorAlt: string; readonly roughness: number; readonly metalness: number };
  /** Ground plane under the elevated road. */
  readonly ground: string;
  /** Road spine, wall chevrons and lane marks (warm; never coolant cyan). */
  readonly accents: { readonly primary: string; readonly secondary: string; readonly lanes: string };
  /** Signature heat haze parameters (HS-11): base refraction strength and the ambient shimmer of hot air. */
  readonly haze: { readonly strength: number; readonly ambient: number; readonly tint: string };
  /** Skyline silhouettes (HS-04): soot colour and window/seam glow. */
  readonly skyline: { readonly color: string; readonly glow: string };
}

export const CIRCUIT_LOOKS: Readonly<Record<CircuitId, CircuitLook>> = {
  grand: {
    circuit: "grand",
    timeOfDay: "rain-wet sodium night",
    hdri: "rooftop_night",
    environmentIntensity: 0.55,
    environmentRotationDeg: 0,
    key: { color: "#ffb070", elevationDeg: 28, azimuthDeg: 120, intensity: 1.6 },
    rim: { color: PALETTE.coolantCyan, intensity: 0.35 },
    fog: { color: "#2a1d14", density: 0.011 },
    exposureEv: 0.35,
    grade: { contrast: 1.12, saturation: 1.06, temperature: 0.18, tint: -0.03 },
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ffb070" },
    vignette: 0.28,
    grain: 0.05,
    boostMotionBlur: 0.35,
    weather: "rain",
    road: { color: "#1b1714", colorAlt: "#181411", roughness: 0.2, metalness: 0.08 },
    ground: "#120e0c",
    accents: { primary: PALETTE.moltenAmber, secondary: PALETTE.slagRed, lanes: "#d9a066" },
    haze: { strength: 1, ambient: 0.15, tint: "#ff9a3c" },
    skyline: { color: "#17120f", glow: "#ff8a1f" }
  },
  dustfall: {
    circuit: "dustfall",
    timeOfDay: "ochre dust-storm sunset, 9-degree burnt sun",
    hdri: "industrial_sunset_puresky",
    environmentIntensity: 0.9,
    environmentRotationDeg: 35,
    key: { color: "#ff9a4a", elevationDeg: 9, azimuthDeg: 35, intensity: 2.6 },
    rim: { color: PALETTE.coolantCyan, intensity: 0.35 },
    fog: { color: "#8a5a2e", density: 0.02 },
    volumetricFog: { color: "#b97a3e", density: 0.16, intensity: 0.65, godRayDensity: 0.45 },
    exposureEv: 0,
    grade: { contrast: 1.06, saturation: 0.9, temperature: 0.32, tint: 0.03 },
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ff9a4a" },
    vignette: 0.28,
    grain: 0,
    boostMotionBlur: 0.35,
    weather: "dust",
    road: { color: "#6b4a2a", colorAlt: "#634427", roughness: 0.7, metalness: 0.02 },
    ground: "#4a3220",
    accents: { primary: PALETTE.moltenAmber, secondary: "#ffb347", lanes: "#e8c28a" },
    haze: { strength: 1.25, ambient: 0.35, tint: "#ffb060" },
    skyline: { color: "#3a2a1c", glow: "#ff9a4a" }
  },
  vesper: {
    circuit: "vesper",
    timeOfDay: "violet pre-dawn, lit from below by vents",
    hdri: "spruit_sunrise",
    environmentIntensity: 0.7,
    environmentRotationDeg: 300,
    key: { color: "#b9a4ff", elevationDeg: 18, azimuthDeg: 300, intensity: 1 },
    rim: { color: PALETTE.coolantCyan, intensity: 0.35 },
    upFill: { color: "#ff7a2e", intensity: 0.45 },
    fog: { color: "#2a2348", density: 0.008 },
    exposureEv: 0.25,
    grade: { contrast: 1.1, saturation: 1.08, temperature: -0.12, tint: 0.12 },
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ff9a5a" },
    vignette: 0.28,
    grain: 0,
    boostMotionBlur: 0.35,
    weather: "embers",
    road: { color: "#1d1a26", colorAlt: "#1a1722", roughness: 0.24, metalness: 0.1 },
    ground: "#16121f",
    accents: { primary: "#b9a4ff", secondary: PALETTE.moltenAmber, lanes: "#c9b8ff" },
    haze: { strength: 1, ambient: 0.2, tint: "#ff8a4a" },
    skyline: { color: "#1a1626", glow: "#ff7a2e" }
  }
};

/** Key light position for an elevation/azimuth pair (same convention as the engine looks: +Z is azimuth 0). */
export function sunPosition(elevationDeg: number, azimuthDeg: number, distance = 60): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [distance * Math.cos(el) * Math.sin(az), distance * Math.sin(el), distance * Math.cos(el) * Math.cos(az)];
}

/** Unit direction the light travels (from the light towards the scene) for E-B `setLight({ direction })`. */
export function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const [x, y, z] = sunPosition(elevationDeg, azimuthDeg, 1);
  return [-x, -y, -z];
}

/** The rim sits opposite the key, a little higher. */
export function rimPosition(look: CircuitLook): [number, number, number] {
  return sunPosition(Math.max(20, look.key.elevationDeg + 12), (look.key.azimuthDeg + 180) % 360);
}

/** `?circuit=grand|dustfall|vesper` (E-I variant param; tests/browser/game-luma-targets.ts HEATSINK_CIRCUITS). */
export function circuitFromParam(value: string | null | undefined): CircuitId | undefined {
  return value === "grand" || value === "dustfall" || value === "vesper" ? value : undefined;
}
