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
  /** HS-07: a road reflection probe refreshed 1 frame in 6, and SSR strength (0 = no SSR node; E-C). */
  readonly reflections: { readonly probe: boolean; readonly ssr: number };
  /** Ground plane under the elevated road. */
  readonly ground: string;
  /** Road spine, wall chevrons and lane marks (warm; never coolant cyan). */
  readonly accents: { readonly primary: string; readonly secondary: string; readonly lanes: string };
  /** Signature heat haze parameters (HS-11): base refraction strength and the ambient shimmer of hot air. */
  readonly haze: { readonly strength: number; readonly ambient: number; readonly tint: string };
  /**
   * Skyline (HS-04): soot body colour and seam glow; GU47 phase 3 facades: the warm glow at each block's foot, two window
   * colours, the share of lit bays and their HDR brightness (shaders.ts `skylineFacadeMaterial`).
   */
  readonly skyline: {
    readonly color: string;
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
    // GU47 phase 3: a starry night sky of its own (`rooftop_night` is top-tennis's primary sky, look-identity PRD 6.1);
    // round 2 tried `cobblestone_street_night`, whose lit street facades read as a blurred beige wall behind the skyline.
    hdri: "kloppenheim_02",
    environmentIntensity: 0.8,
    environmentRotationDeg: 0,
    key: { color: "#ffb070", elevationDeg: 28, azimuthDeg: 120, intensity: 1.6 },
    rim: { color: PALETTE.coolantCyan, intensity: 0.35 },
    fog: { color: "#2a1d14", density: 0.011 },
    // GU47 phase 3 (forward title pose, cobblestone night sky): round 1 measured mean 41 at +0.35 and 50 at +0.8 (band 45-70, software WebGL2).
    // Round 2: mean 55 at +0.6 and 64 at +1.0 under cobblestone_street_night; round 3 (kloppenheim_02, +0.8) 66.4, near
    // the 70 ceiling (60 s, software WebGL2).
    exposureEv: 0.6,
    grade: { contrast: 1.12, saturation: 1.06, temperature: 0.18, tint: -0.03 },
    lutIntensity: 0.6,
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ffb070" },
    vignette: 0.28,
    grain: 0.05,
    boostMotionBlur: 0.35,
    weather: "rain",
    road: { color: "#8a7a6c", colorAlt: "#7e7064", roughness: 0.2, metalness: 0.08 },
    reflections: { probe: true, ssr: 0.6 },
    ground: "#120e0c",
    accents: { primary: PALETTE.moltenAmber, secondary: PALETTE.slagRed, lanes: "#d9a066" },
    haze: { strength: 1, ambient: 0.15, tint: "#ff9a3c" },
    skyline: { color: "#2a2630", glow: "#ff8a1f", foot: "#5a2a10", windows: ["#ffb46a", "#ffe2b8"], lit: 0.32, windowGlow: 3 },
    molten: { hot: PALETTE.moltenAmber, crust: "#241812", glow: 6 },
    local: { headlight: { color: "#ffe2b8", intensity: 60 }, sodium: { color: "#ffa640", intensity: 34 }, strip: { color: "#ffb870", intensity: 6 } }
  },
  dustfall: {
    circuit: "dustfall",
    timeOfDay: "ochre dust-storm sunset, 9-degree burnt sun",
    hdri: "industrial_sunset_puresky",
    // GU47 phase 3: a stronger sky fill lifts the deck inside the long low-sun shadows (round 3: 73.6 before the shadow
    // maps settled at 25 s, 50.2 at 60 s, software WebGL2).
    environmentIntensity: 1.1,
    environmentRotationDeg: 35,
    key: { color: "#ff9a4a", elevationDeg: 9, azimuthDeg: 35, intensity: 2.6 },
    rim: { color: PALETTE.coolantCyan, intensity: 0.35 },
    fog: { color: "#8a5a2e", density: 0.02 },
    volumetricFog: { color: "#b97a3e", density: 0.16, intensity: 0.4, godRayDensity: 0.45 },
    // GU47 phase 2: the after capture measured mean 94.2 (band 45-70, software WebGL2); the dust inscatter washed the frame
    // and hid the drone. Round 1 (-1 EV, inscatter 0.5) landed 68.8, too close to the ceiling; round 2 thins the dust further.
    // GU47 phase 3: with the boot fixed, round 1 measured mean 54 at -1.1 and 64 at -0.6 (software WebGL2); the frame read murky.
    exposureEv: -0.9,
    // Round 2 panel: "muddy brown monochrome, low contrast": more contrast and colour, a little less warmth.
    grade: { contrast: 1.16, saturation: 1.02, temperature: 0.24, tint: 0.03 },
    lutIntensity: 0.4,
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ff9a4a" },
    vignette: 0.28,
    grain: 0,
    boostMotionBlur: 0.35,
    weather: "dust",
    road: { color: "#e8ba80", colorAlt: "#dcae76", roughness: 0.7, metalness: 0.02 },
    reflections: { probe: false, ssr: 0 },
    ground: "#4a3220",
    accents: { primary: PALETTE.moltenAmber, secondary: "#ffb347", lanes: "#e8c28a" },
    haze: { strength: 1.25, ambient: 0.35, tint: "#ffb060" },
    skyline: { color: "#4a3424", glow: "#ff9a4a", foot: "#6a3a18", windows: ["#ffb050", "#ffd8a0"], lit: 0.2, windowGlow: 2 },
    molten: { hot: "#ff9a2a", crust: PALETTE.oxidisedIron, glow: 5 },
    local: { headlight: { color: "#fff0d8", intensity: 40 }, sodium: { color: "#ffb25a", intensity: 18 }, strip: { color: "#ffc890", intensity: 4 } }
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
    // GU47 phase 2: the after capture measured mean 73.3 (band 45-70, software WebGL2), mostly the bright pre-dawn sky.
    // GU47 phase 3: round 1 measured mean 98 at -0.25 (software WebGL2, sun glare in the old backward title pose).
    // Round 2: mean 45.5 at -0.7 and 35 at -1.2 (60 s, software WebGL2), against the 45-70 band.
    exposureEv: -0.45,
    grade: { contrast: 1.1, saturation: 1.08, temperature: -0.12, tint: 0.12 },
    lutIntensity: 0.5,
    bloom: { intensity: 0.55, threshold: 0.8, color: "#ff9a5a" },
    vignette: 0.28,
    grain: 0,
    boostMotionBlur: 0.35,
    weather: "embers",
    road: { color: "#8a8098", colorAlt: "#7e7590", roughness: 0.24, metalness: 0.1 },
    reflections: { probe: true, ssr: 0.4 },
    ground: "#16121f",
    accents: { primary: "#b9a4ff", secondary: PALETTE.moltenAmber, lanes: "#c9b8ff" },
    haze: { strength: 1, ambient: 0.2, tint: "#ff8a4a" },
    skyline: { color: "#2c2644", glow: "#ff7a2e", foot: "#7a3418", windows: ["#ff9a52", "#d8c4ff"], lit: 0.3, windowGlow: 3 },
    molten: { hot: "#ff6a26", crust: "#1e1418", glow: 6.5 },
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
