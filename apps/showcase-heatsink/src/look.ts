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
export type CircuitHdriId = Extract<AuraHdriId, "kloppenheim_02" | "industrial_sunset_puresky" | "spruit_sunrise">;

export interface KeyLightRow {
  readonly color: string;
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly intensity: number;
}

export interface CircuitSkyDome {
  readonly zenith: string;
  readonly horizon: string;
  readonly ground: string;
  readonly stars?: { readonly count: number; readonly brightness?: number };
  readonly clouds?: { readonly coverage: number; readonly speed?: number; readonly color?: string };
}

export interface CircuitLook {
  readonly circuit: CircuitId;
  readonly timeOfDay: string;
  /** E-A catalogue HDRI (`/hdri/<id>_1k.hdr`), used strictly for prefiltered specular/diffuse IBL (`background: false`). */
  readonly hdri: CircuitHdriId;
  /** Procedural night-industrial / cyber sky dome (`sky.gradient`) replacing the HDRI meadow background. */
  readonly sky: CircuitSkyDome;
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  /** The one shadowed light: PCSS, 2 tight cascades (`maxDistance: 65`). */
  readonly key: KeyLightRow;
  /** Unshadowed coolant counter-rim opposite the key (HS-01). */
  readonly rim: { readonly color: string; readonly intensity: number };
  /** VESPER only: unshadowed vent light from below (HS-01). */
  readonly upFill?: { readonly color: string; readonly intensity: number };
  /** Scene fog colour and nominal density (rendered as crisp far-field linear fog in `scene.ts` / `sectors.ts`). */
  readonly fog: { readonly color: string; readonly density: number };
  /** DUSTFALL only: volumetric inscatter with god rays from the low sun (HS-05). */
  readonly volumetricFog?: { readonly color: string; readonly density: number; readonly intensity: number; readonly godRayDensity: number };
  readonly exposureEv: number;
  /** Colour grade (HS-12). temperature/tint are [-1, 1]. */
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  /** Strength (0..1) of the shared foundry display LUT (HS-12, `src/lut.ts`). */
  readonly lutIntensity: number;
  /** Warm bloom (HS-12). */
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly color: string };
  readonly vignette: number;
  /** Film grain intensity; 0 = no grain node (MEGACITY only, HS-12). */
  readonly grain: number;
  /** Motion blur while boosting, High tier only (HS-12). */
  readonly boostMotionBlur: number;
  /** One weather system per circuit (HS-06). */
  readonly weather: WeatherKind;
  /**
   * Road deck material (HS-07): the CC0 asphalt set tinted by `color`/`colorAlt` (multipliers of the map), at an
   * effective `roughness` (wet 0.15-0.25, DUSTFALL dusty 0.7).
   */
  readonly road: { readonly color: string; readonly colorAlt: string; readonly roughness: number; readonly metalness: number };
  /** Wet-track SSR strength (0 = no SSR node); live cubemap reflection probe retired for 60 fps sync WebGPU/WebGL2. */
  readonly reflections: { readonly probe: boolean; readonly ssr: number };
  /** Ground plane under the elevated road. */
  readonly ground: string;
  /** Road spine, wall chevrons and lane marks (warm; never coolant cyan). */
  readonly accents: { readonly primary: string; readonly secondary: string; readonly lanes: string };
  /** Signature heat haze parameters (HS-11): base refraction strength and the ambient shimmer of hot air. */
  readonly haze: { readonly strength: number; readonly ambient: number; readonly tint: string };
  /**
   * Skyline (HS-04): curtain-wall slate body, night-sky Fresnel sheen, seam glow, warm foundry foot glow, and dual-tone
   * parallax interior office bays (shaders.ts `skylineFacadeMaterial`).
   */
  readonly skyline: {
    readonly color: string;
    readonly skySheen: string;
    readonly glow: string;
    readonly foot: string;
    readonly windows: readonly [string, string];
    readonly lit: number;
    readonly windowGlow: number;
  };
  /** HS-15 molten shader (slag gutters along the walls, the pool under the lava curtain): vein colour, crust, HDR glow. */
  readonly molten: { readonly hot: string; readonly crust: string; readonly glow: number };
  /**
   * HS-02 local lights (unshadowed): the player drone's headlight spot, the sodium lamps on the start gantry, the two strip
   * lights in the tunnel ceilings (scene.ts `localLightSpecs`). `power`-free intensities (engine units per light kind).
   */
  readonly local: {
    readonly headlight: { readonly color: string; readonly intensity: number };
    readonly sodium: { readonly color: string; readonly intensity: number };
    readonly strip: { readonly color: string; readonly intensity: number };
  };
}

export const CIRCUIT_LOOKS: Readonly<Record<CircuitId, CircuitLook>> = {
  grand: {
    circuit: "grand",
    timeOfDay: "rain-wet sodium night",
    hdri: "kloppenheim_02",
    sky: {
      zenith: "#03050c",
      horizon: "#0d1528",
      ground: "#05070e",
      stars: { count: 280, brightness: 0.82 },
      clouds: { coverage: 0.22, speed: 0.35, color: "#191c2e" }
    },
    environmentIntensity: 0.7,
    environmentRotationDeg: 0,
    key: { color: "#ffb070", elevationDeg: 20, azimuthDeg: 150, intensity: 2 },
    rim: { color: PALETTE.coolantCyan, intensity: 0.55 },
    fog: { color: "#4a3a30", density: 0.02 },
    exposureEv: 0.55,
    grade: { contrast: 1.16, saturation: 1.08, temperature: 0.14, tint: -0.04 },
    lutIntensity: 0.58,
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ffb070" },
    vignette: 0.28,
    grain: 0.05,
    boostMotionBlur: 0.35,
    weather: "rain",
    road: { color: "#3d4456", colorAlt: "#343b4c", roughness: 0.18, metalness: 0.22 },
    reflections: { probe: false, ssr: 0.65 },
    ground: "#05070d",
    accents: { primary: PALETTE.moltenAmber, secondary: PALETTE.slagRed, lanes: "#d9a066" },
    haze: { strength: 1, ambient: 0.15, tint: "#ff9a3c" },
    skyline: { color: "#0b101d", skySheen: "#2d4a74", glow: "#ff8a1f", foot: "#48200c", windows: ["#ffb46a", "#7dd3fc"], lit: 0.34, windowGlow: 2.8 },
    molten: { hot: PALETTE.moltenAmber, crust: "#1c1412", glow: 5.5 },
    local: { headlight: { color: "#ffe2b8", intensity: 60 }, sodium: { color: "#ffa640", intensity: 34 }, strip: { color: "#ffb870", intensity: 6 } }
  },
  dustfall: {
    circuit: "dustfall",
    timeOfDay: "ochre dust-storm sunset, 9-degree burnt sun",
    hdri: "industrial_sunset_puresky",
    sky: {
      zenith: "#090813",
      horizon: "#241928",
      ground: "#0b0912",
      stars: { count: 140, brightness: 0.48 },
      clouds: { coverage: 0.32, speed: 0.55, color: "#3c2624" }
    },
    environmentIntensity: 1.1,
    environmentRotationDeg: 35,
    key: { color: "#ff9a4a", elevationDeg: 9, azimuthDeg: 35, intensity: 2.2 },
    rim: { color: PALETTE.coolantCyan, intensity: 0.35 },
    fog: { color: "#8a5a2e", density: 0.02 },
    volumetricFog: { color: "#1a1628", density: 0.0008, intensity: 0.06, godRayDensity: 0.22 },
    exposureEv: -1.05,
    grade: { contrast: 1.18, saturation: 1.04, temperature: 0.18, tint: 0.02 },
    lutIntensity: 0.42,
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ff9a4a" },
    vignette: 0.28,
    grain: 0.035,
    boostMotionBlur: 0.35,
    weather: "dust",
    road: { color: "#584a46", colorAlt: "#4d403d", roughness: 0.7, metalness: 0.06 },
    reflections: { probe: false, ssr: 0 },
    ground: "#0d0b14",
    accents: { primary: PALETTE.moltenAmber, secondary: "#ffb347", lanes: "#e8c28a" },
    haze: { strength: 1.25, ambient: 0.35, tint: "#ffb060" },
    skyline: { color: "#14111d", skySheen: "#4a3340", glow: "#ff9a4a", foot: "#4d2812", windows: ["#ffb050", "#ffd8a0"], lit: 0.24, windowGlow: 2.2 },
    molten: { hot: "#ff9a2a", crust: "#241a18", glow: 4.8 },
    local: { headlight: { color: "#fff0d8", intensity: 40 }, sodium: { color: "#ffb25a", intensity: 18 }, strip: { color: "#ffc890", intensity: 4 } }
  },
  vesper: {
    circuit: "vesper",
    timeOfDay: "violet pre-dawn, lit from below by vents",
    hdri: "spruit_sunrise",
    sky: {
      zenith: "#04040e",
      horizon: "#171330",
      ground: "#070612",
      stars: { count: 260, brightness: 0.78 },
      clouds: { coverage: 0.2, speed: 0.3, color: "#281e42" }
    },
    environmentIntensity: 0.7,
    environmentRotationDeg: 300,
    key: { color: "#b9a4ff", elevationDeg: 18, azimuthDeg: 300, intensity: 1 },
    rim: { color: PALETTE.coolantCyan, intensity: 0.35 },
    upFill: { color: "#ff7a2e", intensity: 0.45 },
    fog: { color: "#4a4670", density: 0.014 },
    exposureEv: -0.15,
    grade: { contrast: 1.14, saturation: 1.08, temperature: -0.12, tint: 0.12 },
    lutIntensity: 0.5,
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ff9a5a" },
    vignette: 0.28,
    grain: 0.035,
    boostMotionBlur: 0.35,
    weather: "embers",
    road: { color: "#423e5c", colorAlt: "#383550", roughness: 0.22, metalness: 0.2 },
    reflections: { probe: false, ssr: 0.45 },
    ground: "#070611",
    accents: { primary: "#b9a4ff", secondary: PALETTE.moltenAmber, lanes: "#c9b8ff" },
    haze: { strength: 1, ambient: 0.2, tint: "#ff8a4a" },
    skyline: { color: "#0e0c1f", skySheen: "#4f3f7a", glow: "#ff7a2e", foot: "#582412", windows: ["#ff9a52", "#d8c4ff"], lit: 0.32, windowGlow: 2.8 },
    molten: { hot: "#ff6a26", crust: "#1a1218", glow: 6 },
    local: { headlight: { color: "#f2e6ff", intensity: 55 }, sodium: { color: "#ff9a52", intensity: 30 }, strip: { color: "#d8c4ff", intensity: 5 } }
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
