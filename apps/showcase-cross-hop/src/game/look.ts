/**
 * Cross Hop look table (GU47 WP-24, PRD §3.2 item 2): one row per theme of the day clock. Pure data, no engine
 * imports, so the unit tests read it directly. Theme order matches `THEMES` in themes.ts:
 *   0 meadow = crisp dawn, 1 downtown = overcast noon, 2 riverbend = amber golden hour,
 *   3 emberline = red lava-lit dusk, 4 neon = blue-black lamplit night, 5 crittercore = pastel studio toybox.
 *
 * `?look=diorama` opts into the tabletop look; the default (and `?look=original`) is the 4.6 look (themes.ts `look` presets with the old capped key, ambient and box sky).
 */

export type CrossHopHdriId =
  | "spruit_sunrise" | "autumn_field_puresky" | "venice_sunset" | "industrial_sunset_puresky" | "rooftop_night" | "studio_small_08";
export type CrossHopPostPreset = "daylight-outdoor" | "cinematic-film" | "arena-fight" | "neon-night" | "product-studio";
export type CrossHopAmbient = "pollen" | "none" | "fireflies" | "embers" | "rain" | "confetti";

export interface ThemeLook {
  readonly timeOfDay: "dawn" | "noon" | "golden" | "dusk" | "night" | "studio";
  /** E-A catalogue id (`/hdri/<id>_1k.hdr`); IBL only, the gradient sky draws the background. */
  readonly hdri: CrossHopHdriId;
  readonly environmentIntensity: number;
  readonly environmentRotationDeg: number;
  /** The one shadowed key (CH47-01): elevation and azimuth in degrees, the look-preset convention. */
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number };
  /** Hemisphere fill (CH47-01): replaces the old ambient + rim. */
  readonly hemi: { readonly sky: string; readonly ground: string; readonly intensity: number };
  /** Gradient sky (CH47-03); stars only at night, clouds kept light (never Cumulus Dash or Serpentine). */
  readonly sky: {
    readonly zenith: string; readonly horizon: string; readonly ground: string; readonly horizonGlow: number;
    readonly stars?: { readonly count: number; readonly brightness: number };
    readonly clouds?: { readonly coverage: number; readonly speed: number; readonly color: string };
  };
  /** Height fog (CH47-04); null = none (studio). */
  readonly fog: { readonly color: string; readonly density: number; readonly heightFalloff: number } | null;
  readonly post: CrossHopPostPreset;
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  readonly exposureEv: number;
  /** Tilt-shift band (CH47-05): full sharp band height in screen fractions, and the DOF strength. */
  readonly tiltShift: { readonly bandWidth: number; readonly maxBlur: number };
  /** Sun sweep over one theme's 25 rows (the "sun that moves with progress"): azimuth and elevation deltas at row 25. */
  readonly sweep: { readonly azimuthDeg: number; readonly elevationDeg: number };
  /** Pooled lamp points (CH47-02); 0 = none. */
  readonly lamps: { readonly count: number; readonly colors: readonly string[]; readonly power: number; readonly distance: number };
  readonly ambient: CrossHopAmbient;
  /** Landing-dust colour (CH47-13), the theme's ground. */
  readonly dust: string;
  /** Surface pools (CH47-07). */
  readonly surfaces: {
    readonly felt: string; readonly asphalt: string; readonly dash: string; readonly water: string; readonly gravel: string;
    readonly rail: string; readonly lava: string; readonly lavaEmissive: number;
  };
}

/** Chalk mint, butter yellow, terracotta, slate; coin gold is the only accent (PRD §6.1 G14). */
export const CROSS_HOP_PALETTE = {
  chalkMint: "#a8dcc4",
  butterYellow: "#f4dc8a",
  terracotta: "#c8693f",
  slate: "#4f5d6b",
  coinGold: "#ffc531"
} as const;

export const THEME_LOOKS: readonly ThemeLook[] = [
  {
    timeOfDay: "dawn",
    hdri: "spruit_sunrise",
    environmentIntensity: 0.9,
    environmentRotationDeg: 220,
    sun: { elevationDeg: 18, azimuthDeg: 220, color: "#ffd2a1", intensity: 2.6 },
    hemi: { sky: "#cfe2f2", ground: "#7d8f5a", intensity: 0.35 },
    sky: { zenith: "#7fa6cf", horizon: "#f3d2b4", ground: "#a7b98a", horizonGlow: 0.55, clouds: { coverage: 0.12, speed: 0.4, color: "#fbe9db" } },
    fog: { color: "#b9cfe0", density: 0.012, heightFalloff: 0.35 },
    post: "daylight-outdoor",
    grade: { contrast: 1.1, saturation: 1.16, temperature: 0.05 },
    bloom: { intensity: 0.1, threshold: 1.4 },
    exposureEv: 0,
    tiltShift: { bandWidth: 0.34, maxBlur: 4 },
    sweep: { azimuthDeg: 14, elevationDeg: 6 },
    lamps: { count: 0, colors: [], power: 0, distance: 0 },
    ambient: "pollen",
    dust: "#d9c7a0",
    surfaces: { felt: "#8fc78a", asphalt: "#5a6270", dash: "#f4dc8a", water: "#4f9cc9", gravel: "#8a8072", rail: "#b7b9bd", lava: "#ff6a2a", lavaEmissive: 2.6 }
  },
  {
    timeOfDay: "noon",
    hdri: "autumn_field_puresky",
    environmentIntensity: 1.05,
    environmentRotationDeg: 30,
    sun: { elevationDeg: 55, azimuthDeg: 30, color: "#f4f1ea", intensity: 2.2 },
    hemi: { sky: "#dde3ea", ground: "#8a8a80", intensity: 0.45 },
    sky: { zenith: "#9fb0c2", horizon: "#dfe3e6", ground: "#9aa08c", horizonGlow: 0.25, clouds: { coverage: 0.2, speed: 0.3, color: "#eef0f2" } },
    fog: { color: "#d8d4c6", density: 0.013, heightFalloff: 0.3 },
    post: "daylight-outdoor",
    grade: { contrast: 1.08, saturation: 1.06, temperature: -0.04 },
    bloom: { intensity: 0.06, threshold: 1.6 },
    exposureEv: 0,
    tiltShift: { bandWidth: 0.36, maxBlur: 3.5 },
    sweep: { azimuthDeg: 10, elevationDeg: -4 },
    lamps: { count: 0, colors: [], power: 0, distance: 0 },
    ambient: "none",
    dust: "#b8b4aa",
    surfaces: { felt: "#9cbf7a", asphalt: "#4f5d6b", dash: "#f4f1ea", water: "#6a8fa8", gravel: "#9a948a", rail: "#c4c6ca", lava: "#ff6a2a", lavaEmissive: 2.5 }
  },
  {
    timeOfDay: "golden",
    hdri: "venice_sunset",
    environmentIntensity: 0.85,
    environmentRotationDeg: 250,
    sun: { elevationDeg: 10, azimuthDeg: 250, color: "#ffb064", intensity: 2.8 },
    hemi: { sky: "#f3c99a", ground: "#6f6a3e", intensity: 0.3 },
    sky: { zenith: "#5d78a6", horizon: "#ffb977", ground: "#8f8a54", horizonGlow: 0.85, clouds: { coverage: 0.1, speed: 0.35, color: "#ffd2a8" } },
    fog: { color: "#e8b98a", density: 0.013, heightFalloff: 0.35 },
    post: "cinematic-film",
    grade: { contrast: 1.1, saturation: 1.14, temperature: 0.18 },
    bloom: { intensity: 0.14, threshold: 1.2 },
    exposureEv: 0,
    tiltShift: { bandWidth: 0.32, maxBlur: 4.5 },
    sweep: { azimuthDeg: 8, elevationDeg: -6 },
    lamps: { count: 0, colors: [], power: 0, distance: 0 },
    ambient: "fireflies",
    dust: "#d6b47e",
    surfaces: { felt: "#a3b860", asphalt: "#5c5248", dash: "#f4dc8a", water: "#3f7fa6", gravel: "#8e7a62", rail: "#c9b89a", lava: "#ff6a2a", lavaEmissive: 2.6 }
  },
  {
    timeOfDay: "dusk",
    hdri: "industrial_sunset_puresky",
    environmentIntensity: 0.55,
    environmentRotationDeg: 280,
    sun: { elevationDeg: 6, azimuthDeg: 280, color: "#ff7a4a", intensity: 1.8 },
    hemi: { sky: "#7a4a52", ground: "#3a2a24", intensity: 0.3 },
    sky: { zenith: "#2c2240", horizon: "#d2553a", ground: "#3a2620", horizonGlow: 1.0 },
    fog: { color: "#6b3a34", density: 0.014, heightFalloff: 0.4 },
    post: "arena-fight",
    grade: { contrast: 1.12, saturation: 1.12, temperature: 0.2 },
    bloom: { intensity: 0.5, threshold: 0.75 },
    exposureEv: 0.1,
    tiltShift: { bandWidth: 0.32, maxBlur: 4 },
    sweep: { azimuthDeg: 6, elevationDeg: -4 },
    lamps: { count: 12, colors: ["#ff6a2a", "#ff8a3d"], power: 260, distance: 7 },
    ambient: "embers",
    dust: "#5a4038",
    surfaces: { felt: "#6a7356", asphalt: "#3a3330", dash: "#e8a05a", water: "#4a3a3a", gravel: "#4a3e38", rail: "#8a7a70", lava: "#ff5a1f", lavaEmissive: 3.0 }
  },
  {
    timeOfDay: "night",
    hdri: "rooftop_night",
    environmentIntensity: 0.4,
    environmentRotationDeg: 340,
    sun: { elevationDeg: 35, azimuthDeg: 340, color: "#9fb4ff", intensity: 0.35 },
    hemi: { sky: "#26304f", ground: "#141824", intensity: 0.25 },
    sky: { zenith: "#070b1a", horizon: "#1c2a4a", ground: "#10131c", horizonGlow: 0.35, stars: { count: 1400, brightness: 1.1 } },
    fog: { color: "#1a2440", density: 0.016, heightFalloff: 0.45 },
    post: "neon-night",
    grade: { contrast: 1.12, saturation: 1.15, temperature: -0.2 },
    bloom: { intensity: 0.45, threshold: 0.9 },
    exposureEv: 0.15,
    tiltShift: { bandWidth: 0.3, maxBlur: 4 },
    sweep: { azimuthDeg: 6, elevationDeg: 2 },
    lamps: { count: 12, colors: ["#ffb347", "#37f5ff"], power: 320, distance: 8 },
    ambient: "rain",
    dust: "#3a4058",
    surfaces: { felt: "#3f5a52", asphalt: "#22202e", dash: "#ffb347", water: "#24406a", gravel: "#2e2c3a", rail: "#6a7088", lava: "#ff4fd8", lavaEmissive: 2.5 }
  },
  {
    timeOfDay: "studio",
    hdri: "studio_small_08",
    environmentIntensity: 1.0,
    environmentRotationDeg: 25,
    sun: { elevationDeg: 50, azimuthDeg: 25, color: "#fff4ea", intensity: 2.4 },
    hemi: { sky: "#fbe8f2", ground: "#c6b6e0", intensity: 0.4 },
    sky: { zenith: "#bfd8f2", horizon: "#fbe3ee", ground: "#e2d6f2", horizonGlow: 0.3 },
    fog: null,
    post: "product-studio",
    grade: { contrast: 1.06, saturation: 1.16, temperature: 0 },
    bloom: { intensity: 0.08, threshold: 1.5 },
    exposureEv: 0,
    tiltShift: { bandWidth: 0.36, maxBlur: 3.5 },
    sweep: { azimuthDeg: 12, elevationDeg: 0 },
    lamps: { count: 0, colors: [], power: 0, distance: 0 },
    ambient: "confetti",
    dust: "#f2d6e6",
    surfaces: { felt: "#a8dcc4", asphalt: "#8c7fd0", dash: "#fff4ea", water: "#7fdbe8", gravel: "#b6a8d6", rail: "#f4f1ea", lava: "#ff8a5c", lavaEmissive: 2.5 }
  }
];

/** Rows per theme (themes.ts THEME_STRIDE); the sun sweeps over this span. */
const SWEEP_ROWS = 25;

/** Sun direction for a theme at a row: the authored sun plus the sweep, linear over the theme's 25 rows. */
export function sunAt(look: ThemeLook, row: number): { elevationDeg: number; azimuthDeg: number } {
  const t = Math.max(0, Math.min(1, (((row % SWEEP_ROWS) + SWEEP_ROWS) % SWEEP_ROWS) / (SWEEP_ROWS - 1)));
  return {
    elevationDeg: look.sun.elevationDeg + look.sweep.elevationDeg * t,
    azimuthDeg: look.sun.azimuthDeg + look.sweep.azimuthDeg * t
  };
}

/** Unit vector from the ground toward the sun (look-preset `sunPosition` convention). */
export function sunVector(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

/** Light travel direction (sun toward the scene) for `setLight({ direction })`. */
export function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const v = sunVector(elevationDeg, azimuthDeg);
  return [-v[0], -v[1], -v[2]];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c!))).toString(16).padStart(2, "0")).join("")}`;
}
export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Rows over which the key blends toward the next theme's sun (CH47-19). */
export const DAY_CLOCK_BLEND_ROWS = 5;

/**
 * Key light for a row (CH47-19): the theme's sun, swept with progress, and over the last
 * `DAY_CLOCK_BLEND_ROWS` rows of a theme blended toward the next theme's key colour and intensity.
 * `next` is the theme index the next stride will show (null: no change, no blend).
 */
export function keyAt(theme: number, next: number | null, row: number): { color: string; intensity: number; elevationDeg: number; azimuthDeg: number } {
  const look = THEME_LOOKS[theme]!;
  const sun = sunAt(look, row);
  const inStride = ((row % SWEEP_ROWS) + SWEEP_ROWS) % SWEEP_ROWS;
  const blendStart = SWEEP_ROWS - DAY_CLOCK_BLEND_ROWS;
  if (next === null || next === theme || inStride < blendStart) {
    return { color: look.sun.color, intensity: look.sun.intensity, ...sun };
  }
  const t = (inStride - blendStart + 1) / (DAY_CLOCK_BLEND_ROWS + 1);
  const to = THEME_LOOKS[next]!;
  return {
    color: mixHex(look.sun.color, to.sun.color, t),
    intensity: look.sun.intensity + (to.sun.intensity - look.sun.intensity) * t,
    ...sun
  };
}

/**
 * GU47 phase 3 (4.7.1): the "vivid" look. It keeps the 4.6 perspective chase camera, lanes and models (the blind panel
 * rejected the diorama's steep camera) and replaces only light, sky, haze, palette of the floor and post:
 * one shadowed sun from the camera's left, a little behind it (cast shadows fall to the right of each car),
 * a hemisphere fill instead of the flat ambient, a gradient sky with a low sun glow on the horizon instead of the
 * two flat boxes, theme-tinted distance haze for depth and a per-theme grade. Pure data, read by core.ts and tests.
 */
export interface VividLook {
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number };
  readonly hemi: { readonly sky: string; readonly ground: string; readonly intensity: number };
  readonly environmentIntensity: number;
  /** Painted sky; `glow` places the sky's sun glow low on the visible horizon (independent of the key). */
  readonly sky: {
    readonly zenith: string; readonly horizon: string; readonly ground: string; readonly horizonGlow: number;
    readonly glow: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number; readonly discSize: number };
    readonly stars?: { readonly count: number; readonly brightness: number };
    readonly clouds?: { readonly coverage: number; readonly speed: number; readonly color: string };
  };
  readonly fog: { readonly color: string; readonly density: number };
  /** The flat world floor beyond the lane strip (laid flat, so no sky band shows under the course). */
  readonly floor: string;
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  readonly exposureEv: number;
}

export const VIVID_LOOKS: readonly VividLook[] = [
  { // 0 Meadow Roads: clear morning
    sun: { elevationDeg: 40, azimuthDeg: -62, color: "#ffe6c4", intensity: 1.9 },
    hemi: { sky: "#cfe4ff", ground: "#5f8a45", intensity: 0.45 },
    environmentIntensity: 0.5,
    sky: { zenith: "#2a64b8", horizon: "#78b0e4", ground: "#9fc4a0", horizonGlow: 0.25, glow: { elevationDeg: 3, azimuthDeg: 205, color: "#fff0c8", intensity: 0.6, discSize: 0 }, clouds: { coverage: 0.28, speed: 0.4, color: "#ffffff" } },
    fog: { color: "#a8cbe8", density: 0 },
    floor: "#3f8a46",
    grade: { contrast: 1.16, saturation: 1.18, temperature: 0.02 },
    bloom: { intensity: 0.12, threshold: 0.95 },
    exposureEv: -0.1
  },
  { // 1 Downtown Trams: bright overcast noon
    sun: { elevationDeg: 40, azimuthDeg: -62, color: "#f6f2ea", intensity: 1.6 },
    hemi: { sky: "#e4e9ef", ground: "#727866", intensity: 0.55 },
    environmentIntensity: 0.55,
    sky: { zenith: "#4f78ac", horizon: "#9fbcdc", ground: "#a2a898", horizonGlow: 0.15, glow: { elevationDeg: 4, azimuthDeg: 195, color: "#fbf7ee", intensity: 0.5, discSize: 0 }, clouds: { coverage: 0.42, speed: 0.3, color: "#f4f6f8" } },
    fog: { color: "#b8cadc", density: 0 },
    floor: "#5f8a46",
    grade: { contrast: 1.16, saturation: 1.16, temperature: -0.02 },
    bloom: { intensity: 0.1, threshold: 1.0 },
    exposureEv: -0.1
  },
  { // 2 Riverbend: amber golden hour
    sun: { elevationDeg: 30, azimuthDeg: -62, color: "#ffc583", intensity: 2.0 },
    hemi: { sky: "#ffd9b0", ground: "#5f6a36", intensity: 0.45 },
    environmentIntensity: 0.45,
    sky: { zenith: "#3f62a6", horizon: "#ffa860", ground: "#b0a070", horizonGlow: 0.55, glow: { elevationDeg: 3, azimuthDeg: 200, color: "#ffb866", intensity: 0.8, discSize: 0 }, clouds: { coverage: 0.2, speed: 0.35, color: "#ffdcb8" } },
    fog: { color: "#f2b884", density: 0 },
    floor: "#5e8f3e",
    grade: { contrast: 1.16, saturation: 1.16, temperature: 0.06 },
    bloom: { intensity: 0.16, threshold: 0.9 },
    exposureEv: -0.1
  },
  { // 3 Emberline: lava-lit dusk
    sun: { elevationDeg: 26, azimuthDeg: -62, color: "#ff9a66", intensity: 1.7 },
    hemi: { sky: "#b07a90", ground: "#4a3a30", intensity: 0.9 },
    environmentIntensity: 0.55,
    sky: { zenith: "#2c2850", horizon: "#ff8a52", ground: "#4a3028", horizonGlow: 1.0, glow: { elevationDeg: 2, azimuthDeg: 200, color: "#ff7a3c", intensity: 1.5, discSize: 0.07 } },
    fog: { color: "#a85a44", density: 0.006 },
    floor: "#4e5548",
    grade: { contrast: 1.12, saturation: 1.12, temperature: 0.1 },
    bloom: { intensity: 0.32, threshold: 0.8 },
    exposureEv: 0.1
  },
  { // 4 Neon District: lamplit night under a blue moon
    sun: { elevationDeg: 40, azimuthDeg: -62, color: "#b4c4ff", intensity: 1.1 },
    hemi: { sky: "#5a6ab0", ground: "#22263c", intensity: 0.85 },
    environmentIntensity: 0.5,
    sky: { zenith: "#0a1236", horizon: "#4a3f96", ground: "#1c1a34", horizonGlow: 0.6, glow: { elevationDeg: 3, azimuthDeg: 200, color: "#ff5ad2", intensity: 0.9, discSize: 0 }, stars: { count: 1200, brightness: 1.1 } },
    fog: { color: "#2e2c6e", density: 0.005 },
    floor: "#3f5a52",
    grade: { contrast: 1.12, saturation: 1.18, temperature: -0.08 },
    bloom: { intensity: 0.4, threshold: 0.82 },
    exposureEv: 0.2
  },
  { // 5 Critter Core: pastel studio toybox
    sun: { elevationDeg: 40, azimuthDeg: -62, color: "#fff4ea", intensity: 1.8 },
    hemi: { sky: "#fbe8f2", ground: "#b6a6d8", intensity: 0.45 },
    environmentIntensity: 0.5,
    sky: { zenith: "#5a98e2", horizon: "#9cc8f2", ground: "#d8c8ee", horizonGlow: 0.2, glow: { elevationDeg: 4, azimuthDeg: 200, color: "#fff2f8", intensity: 0.5, discSize: 0 }, clouds: { coverage: 0.3, speed: 0.3, color: "#ffffff" } },
    fog: { color: "#c4d6f2", density: 0 },
    floor: "#6fbf62",
    grade: { contrast: 1.18, saturation: 1.2, temperature: 0 },
    bloom: { intensity: 0.12, threshold: 0.95 },
    exposureEv: -0.2
  }
];

/**
 * Views whose default is the vivid look: the `?theme=N` variants (quick play and World Tour start on theme 0, so they
 * follow theme 0) that a blind three-judge panel picked over the 4.6.2 frame. The others boot the 4.6 look; both
 * `?look=vivid` and `?look=original` override this. Phase 3 rounds: g14p3r2 (themes 3, 4 better), g14p3r3.
 */
export const VIVID_DEFAULT_THEMES: readonly number[] = [0, 1, 2, 3, 4, 5];

/** The look a view boots with: an explicit `?look=` wins, otherwise the panel verdict for the starting theme. */
export function defaultLookFor(lookParam: string | null, theme: number | null): "vivid" | "original" | "diorama" {
  if (lookParam === "diorama" || lookParam === "original" || lookParam === "vivid") return lookParam;
  return VIVID_DEFAULT_THEMES.includes(theme ?? 0) ? "vivid" : "original";
}
