/**
 * GU47 WP-27 SSR-01: the stage colour script. One evening told across the eight stages of the road (rose, amber, dusty
 * copper, red lacquer, storm violet, lightning, moonlit indigo, white-gold sunburst), one look row per stage, blended over
 * 120 m centred on each stage boundary. Presentation only: the look reads `stageAt`-style distances from the run state and
 * never writes the simulation (PRD D8).
 *
 * `?stage=1..8` pins the look to one row (luma capture targets, E-I `SERPENTINE_STAGES`); the run itself is unchanged.
 * `?look=original` keeps today's look (the ORIGINAL row: the pre-GU47 constants of shaders.ts and world.ts).
 */
import { ROAD_LENGTH, STAGES } from "../sim";

export type Hex = `#${string}`;
export type Rgb = readonly [number, number, number];

export interface StageLook {
  /** Colour-script id (also the variant name in the identity sheet). */
  readonly id: string;
  /** `STAGES[i].name` the row belongs to. */
  readonly stage: string;
  readonly timeOfDay: string;
  /**
   * Key light. Elevation above the horizon; azimuth relative to the chase camera's forward (0 = dead ahead, positive to
   * the right), so the low sun stays ahead of the runner on every bend (backlit silhouette, SSR-02).
   */
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: Hex; readonly intensity: number; readonly disc: Hex; readonly corona: number };
  /** Camera-side fill (SSR-02): unshadowed directional from behind the camera. */
  readonly fill: { readonly color: Hex; readonly intensity: number };
  readonly hemisphere: { readonly sky: Hex; readonly ground: Hex; readonly intensity: number };
  readonly environmentIntensity: number;
  /** Sky dome (SSR-04): zenith, upper sky, horizon and the hot horizon band under the sun. */
  readonly sky: { readonly zenith: Hex; readonly upper: Hex; readonly horizon: Hex; readonly band: Hex; readonly stars: number; readonly moon: number };
  /** Cloud sea: lit tops, mid body, shadowed under-deck. */
  readonly cloud: { readonly lit: Hex; readonly mid: Hex; readonly dark: Hex };
  /** Linear distance fog shared by the road, sky and scene fog (metres). */
  readonly fog: { readonly color: Hex; readonly near: number; readonly far: number };
  /** Road scale tints (SSR-08): pearl plates, jade flank ramp, gold spine, belly. */
  readonly road: { readonly pearl: Hex; readonly jade: Hex; readonly spine: Hex; readonly belly: Hex };
  readonly exposure: number;
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  /** E-C colour grade: white balance (-1..1) and saturation. */
  readonly grade: { readonly temperature: number; readonly tint: number; readonly saturation: number; readonly contrast: number };
  /** SSR-06: god rays and the lens flare run at this stage (High tier only). */
  readonly godRays: boolean;
  /** SSR-13: rain and lightning (BROKEN SPINE). */
  readonly weather: "clear" | "rain-lightning" | "mist";
}

/** Identity palette (PRD WP-27 Identity). */
export const SERPENT_PALETTE = {
  indigo: "#1c1640",
  coral: "#ff7a6b",
  cloudGold: "#f2b33d",
  pearlJade: "#7fe0c4"
} as const satisfies Readonly<Record<string, Hex>>;

/** Blend width at each stage boundary, metres (centred on `STAGES[i].from`). */
export const STAGE_BLEND_METRES = 120;

// GU47 phase 3 (rubric round): rose, amber, copper and sunburst lift the cloud under-deck (the dark blotches the judge read
// as a noise texture), and rose / amber / copper / sunburst get a little more exposure and contrast (milky, low-contrast).
export const STAGE_LOOK: readonly StageLook[] = [
  {
    id: "rose", stage: "CHECK-IN", timeOfDay: "sun 9 deg, rose evening",
    sun: { elevationDeg: 9, azimuthDeg: -12, color: "#ffc6a8", intensity: 2.4, disc: "#fff0dc", corona: 0.8 },
    fill: { color: "#8a6ad8", intensity: 0.6 }, hemisphere: { sky: "#e0a8d0", ground: "#8a5a3a", intensity: 0.6 }, environmentIntensity: 0.6,
    sky: { zenith: "#2a2166", upper: "#b0609e", horizon: "#ff9e8e", band: "#ffd6b8", stars: 0.15, moon: 0 },
    cloud: { lit: "#ffdcae", mid: "#f0a088", dark: "#b06a7c" },
    fog: { color: "#eaa2a8", near: 420, far: 1600 },
    road: { pearl: "#f6eef8", jade: "#86e2c8", spine: "#f6c25a", belly: "#5a3c7a" },
    exposure: 1.14, bloom: { intensity: 0.45, threshold: 0.85 }, grade: { temperature: 0.08, tint: 0.06, saturation: 1.1, contrast: 1.1 },
    godRays: true, weather: "clear"
  },
  {
    id: "amber", stage: "THE LONG ROAD", timeOfDay: "sun 7 deg, amber",
    sun: { elevationDeg: 7, azimuthDeg: 10, color: "#ffb466", intensity: 2.6, disc: "#fff2c8", corona: 0.9 },
    fill: { color: "#7a62d0", intensity: 0.6 }, hemisphere: { sky: "#e8b07a", ground: "#7a4a22", intensity: 0.6 }, environmentIntensity: 0.6,
    sky: { zenith: "#1c1640", upper: "#a8603e", horizon: "#ffa444", band: "#ffd676", stars: 0.08, moon: 0 },
    cloud: { lit: "#ffd676", mid: "#f2b33d", dark: "#b06a34" },
    fog: { color: "#eaa45c", near: 420, far: 1600 },
    road: { pearl: "#f8f0e6", jade: "#7fe0c4", spine: "#f2b33d", belly: "#4a3266" },
    exposure: 1.1, bloom: { intensity: 0.45, threshold: 0.85 }, grade: { temperature: 0.18, tint: 0.02, saturation: 1.08, contrast: 1.08 },
    godRays: true, weather: "clear"
  },
  {
    // GU47 phase 2: exposure 1.06 -> 1.4 and sun 2.2 -> 2.6 (after capture mean 109.6, band 140-170). The lifted haze, horizon
    // and cloud sea of the first tune were reverted: they read as fog over the track.
    // GU47 phase 3: upper sky, horizon, cloud sea and fog lifted one step (still dusty copper; capture mean 130, band 140-170).
    id: "copper", stage: "TRAFFIC", timeOfDay: "sun 5 deg, dusty copper haze",
    sun: { elevationDeg: 5, azimuthDeg: -6, color: "#ea8c54", intensity: 2.6, disc: "#ffd8b0", corona: 1.1 },
    fill: { color: "#6a5ab8", intensity: 0.6 }, hemisphere: { sky: "#c89070", ground: "#5a3424", intensity: 0.6 }, environmentIntensity: 0.55,
    sky: { zenith: "#2c3a5c", upper: "#8e7470", horizon: "#d4865a", band: "#eeac7a", stars: 0.05, moon: 0 },
    cloud: { lit: "#f2bc8c", mid: "#c6865a", dark: "#a06a44" },
    fog: { color: "#c48c70", near: 380, far: 1400 },
    road: { pearl: "#efe2d8", jade: "#78c8b0", spine: "#e89a40", belly: "#4a3048" },
    exposure: 1.4, bloom: { intensity: 0.45, threshold: 0.85 }, grade: { temperature: 0.14, tint: -0.02, saturation: 1.02, contrast: 1.08 },
    godRays: true, weather: "clear"
  },
  {
    id: "lacquer", stage: "THE SERPENT HALL", timeOfDay: "sun 3.5 deg, red lacquer",
    sun: { elevationDeg: 3.5, azimuthDeg: 8, color: "#ff6c4a", intensity: 2.0, disc: "#ffc4a0", corona: 1.0 },
    fill: { color: "#7a4ac0", intensity: 0.6 }, hemisphere: { sky: "#d0605a", ground: "#4a1a1a", intensity: 0.55 }, environmentIntensity: 0.5,
    sky: { zenith: "#3a0c2a", upper: "#8a1a2e", horizon: "#ea442e", band: "#ff8454", stars: 0.1, moon: 0 },
    cloud: { lit: "#ff9c62", mid: "#c8422e", dark: "#3a1020" },
    fog: { color: "#a83c36", near: 360, far: 1300 },
    road: { pearl: "#f4e2e0", jade: "#6ad0b0", spine: "#ffb040", belly: "#3c1a30" },
    exposure: 1.05, bloom: { intensity: 0.5, threshold: 0.82 }, grade: { temperature: 0.1, tint: 0.08, saturation: 1.1, contrast: 1.08 },
    godRays: false, weather: "clear"
  },
  {
    id: "storm-violet", stage: "THE COILS", timeOfDay: "sun 2 deg behind storm, violet",
    sun: { elevationDeg: 2, azimuthDeg: -16, color: "#c892ff", intensity: 1.4, disc: "#f0dcff", corona: 0.6 },
    fill: { color: "#5a6ae0", intensity: 0.6 }, hemisphere: { sky: "#8a6ac8", ground: "#2a1a3a", intensity: 0.55 }, environmentIntensity: 0.5,
    sky: { zenith: "#0e1236", upper: "#46307a", horizon: "#9a62c0", band: "#d098dc", stars: 0.2, moon: 0 },
    cloud: { lit: "#caa2ea", mid: "#6a4c9a", dark: "#1e1438" },
    fog: { color: "#5c4a8c", near: 340, far: 1250 },
    road: { pearl: "#e8e6f8", jade: "#7ad8d0", spine: "#e8b84a", belly: "#2a2050" },
    exposure: 1.05, bloom: { intensity: 0.45, threshold: 0.85 }, grade: { temperature: -0.1, tint: 0.1, saturation: 1.02, contrast: 1.06 },
    godRays: false, weather: "clear"
  },
  {
    id: "lightning", stage: "THE BROKEN SPINE", timeOfDay: "sun below the storm, lightning",
    sun: { elevationDeg: 1, azimuthDeg: 6, color: "#a8baff", intensity: 1.2, disc: "#dce4ff", corona: 0.3 },
    fill: { color: "#4a5ad0", intensity: 0.6 }, hemisphere: { sky: "#5a64a0", ground: "#14142a", intensity: 0.5 }, environmentIntensity: 0.45,
    sky: { zenith: "#06101a", upper: "#1a3446", horizon: "#486a84", band: "#8ab0c8", stars: 0, moon: 0 },
    cloud: { lit: "#b0bce8", mid: "#4a4c7a", dark: "#12122a" },
    fog: { color: "#3c405e", near: 300, far: 1100 },
    road: { pearl: "#dfe4f0", jade: "#6ac8c8", spine: "#f0c050", belly: "#1c1c3a" },
    exposure: 1.06, bloom: { intensity: 0.5, threshold: 0.82 }, grade: { temperature: -0.2, tint: 0.02, saturation: 0.92, contrast: 1.1 },
    godRays: false, weather: "rain-lightning"
  },
  {
    id: "moonlit-indigo", stage: "THE DROWSE", timeOfDay: "night, moon 18 deg",
    sun: { elevationDeg: 18, azimuthDeg: 14, color: "#9ab2ea", intensity: 0.7, disc: "#eef2ff", corona: 0.4 },
    fill: { color: "#5a4ac8", intensity: 0.5 }, hemisphere: { sky: "#3a4a8a", ground: "#10102a", intensity: 0.45 }, environmentIntensity: 0.4,
    sky: { zenith: "#060820", upper: "#1c1640", horizon: "#3a4a82", band: "#6c82ba", stars: 1, moon: 1 },
    cloud: { lit: "#8ca2d2", mid: "#3a4878", dark: "#10142c" },
    fog: { color: "#2c3662", near: 320, far: 1300 },
    road: { pearl: "#d8e0f4", jade: "#7fe0c4", spine: "#f2c060", belly: "#1a1840" },
    exposure: 1.1, bloom: { intensity: 0.5, threshold: 0.8 }, grade: { temperature: -0.25, tint: 0.04, saturation: 0.96, contrast: 1.04 },
    godRays: false, weather: "mist"
  },
  {
    id: "sunburst", stage: "THE END OF THE ROAD", timeOfDay: "sun 10 deg, gold sunburst under a violet sky",
    // GU47 blind-panel pass: the white-gold row read as a milky beige haze (pale sky, cream road, brown cloud blotches).
    // Re-keyed to a saturated gold-on-violet: violet upper sky, gold horizon and cloud sea (no brown under-deck), deeper
    // gold fog, smaller corona and a dimmer sun, lilac-pearl plates, softer bloom, more saturation and contrast.
    sun: { elevationDeg: 10, azimuthDeg: 0, color: "#ffd890", intensity: 2.3, disc: "#fff4d8", corona: 0.7 },
    fill: { color: "#8a6ae0", intensity: 0.6 }, hemisphere: { sky: "#c89ad8", ground: "#8a5a2a", intensity: 0.6 }, environmentIntensity: 0.55,
    sky: { zenith: "#1e1660", upper: "#6a3ca8", horizon: "#ffa848", band: "#ffcc6a", stars: 0.05, moon: 0 },
    cloud: { lit: "#ffd870", mid: "#f2b33d", dark: "#cc8c38" },
    fog: { color: "#d48e58", near: 480, far: 1800 },
    road: { pearl: "#efe4f6", jade: "#7fe0c4", spine: "#ffc840", belly: "#4a3266" },
    exposure: 1.07, bloom: { intensity: 0.35, threshold: 0.9 }, grade: { temperature: 0.06, tint: 0.04, saturation: 1.16, contrast: 1.12 },
    godRays: true, weather: "clear"
  }
];

/**
 * `?look=original`: today's look (pre-GU47). The sky, fog and road colours are the old shader constants (FOG_COL is the
 * old linear value re-encoded as sRGB), the sun is the old world-fixed SUN_DIR, lights are hemisphere 1.1 / env 0.9 / sun 2.2
 * with no fill, tone mapping none, bloom 0.12 at 0.95.
 */
export const ORIGINAL_LOOK: StageLook = {
  id: "original", stage: "*", timeOfDay: "pink dusk (pre-GU47)",
  sun: { elevationDeg: 17.5, azimuthDeg: 0, color: "#fff0dc", intensity: 2.2, disc: "#fff0dc", corona: 0 },
  fill: { color: "#000000", intensity: 0 }, hemisphere: { sky: "#f6d0e6", ground: "#b98a2e", intensity: 1.1 }, environmentIntensity: 0.9,
  sky: { zenith: "#7637b4", upper: "#a876d8", horizon: "#dcc9f2", band: "#dcc9f2", stars: 1, moon: 0 },
  cloud: { lit: "#fff6b0", mid: "#f7d445", dark: "#d99a1e" },
  fog: { color: "#e7cee7", near: 430, far: 1010 },
  road: { pearl: "#f6f3ff", jade: "#dcd6ef", spine: "#9a93b0", belly: "#e4e0f7" },
  exposure: 1, bloom: { intensity: 0.12, threshold: 0.95 }, grade: { temperature: 0, tint: 0, saturation: 1, contrast: 1 },
  godRays: false, weather: "clear"
};

export type LookMode = "script" | "original";

export interface LookParams {
  readonly mode: LookMode;
  /** 0-based stage index pinned by `?stage=1..8`, or null to follow the run. */
  readonly pinnedStage: number | null;
}

/** Reads `?look=original` and `?stage=1..8` (1-based, E-I `VARIANT_PARAMS["serpentine-sky-run-port"]`). */
export function lookParams(search: string | undefined = typeof location !== "undefined" ? location.search : undefined): LookParams {
  const q = new URLSearchParams(search ?? "");
  const mode: LookMode = q.get("look") === "original" ? "original" : "script";
  const raw = q.get("stage");
  const n = raw === null ? Number.NaN : Number(raw);
  const pinnedStage = Number.isInteger(n) && n >= 1 && n <= STAGE_LOOK.length ? n - 1 : null;
  return { mode, pinnedStage };
}

/** Road distance the colour script reads: the outbound distance, mirrored on the way back (as `sim.ts` reads stages). */
export const lookDistance = (s: number, leg: "out" | "back" = "out"): number => (leg === "back" ? ROAD_LENGTH - s : s);

/** Index of the stage at `s` (read-only mirror of `stageAt`). */
export function stageIndexAt(s: number): number {
  let index = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (!(s >= (STAGES[i] as { from: number }).from)) break;
    index = i;
  }
  return index;
}

export interface StageBlend {
  readonly from: number;
  readonly to: number;
  /** 0 shows `from`, 1 shows `to`. */
  readonly t: number;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Which two rows to blend at `s`: within 60 m either side of a boundary the look crosses over smoothly. */
export function stageBlendAt(s: number): StageBlend {
  const half = STAGE_BLEND_METRES / 2;
  for (let i = 1; i < STAGES.length; i++) {
    const from = (STAGES[i] as { from: number }).from;
    if (s >= from - half && s < from + half) return { from: i - 1, to: i, t: smooth((s - (from - half)) / STAGE_BLEND_METRES) };
  }
  const i = stageIndexAt(s);
  return { from: i, to: i, t: 0 };
}

/* ------------------------------------------------------------------ resolved (numeric) look */

/** sRGB hex to linear RGB (the encoding `material.custom` color3 uniforms take). */
export function linearOf(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s < 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/** sRGB hex to 0..255 channels (for metrics and CSS). */
export function srgbOf(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear RGB back to `#rrggbb` (for engine colour strings). */
export function hexOf(rgb: Rgb): Hex {
  const enc = (c: number): number => {
    const v = Math.max(0, Math.min(1, c));
    return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  };
  return `#${rgb.map((c) => enc(c).toString(16).padStart(2, "0")).join("")}` as Hex;
}

export interface ResolvedLook {
  readonly id: string;
  readonly stageIndex: number;
  readonly sunElevation: number;
  readonly sunAzimuth: number;
  readonly sunColor: Rgb;
  readonly sunIntensity: number;
  readonly sunDisc: Rgb;
  readonly corona: number;
  readonly fillColor: Rgb;
  readonly fillIntensity: number;
  readonly hemiSky: Rgb;
  readonly hemiGround: Rgb;
  readonly hemiIntensity: number;
  readonly environmentIntensity: number;
  readonly zenith: Rgb;
  readonly upper: Rgb;
  readonly horizon: Rgb;
  readonly band: Rgb;
  readonly stars: number;
  readonly moon: number;
  readonly cloudLit: Rgb;
  readonly cloudMid: Rgb;
  readonly cloudDark: Rgb;
  readonly fogColor: Rgb;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly pearl: Rgb;
  readonly jade: Rgb;
  readonly spine: Rgb;
  readonly belly: Rgb;
  readonly exposure: number;
  readonly bloomIntensity: number;
  readonly bloomThreshold: number;
  readonly temperature: number;
  readonly tint: number;
  readonly saturation: number;
  readonly contrast: number;
  /** 0..1: how much of the god-ray / lens-flare look is on (blended across boundaries). */
  readonly godRays: number;
  /** 0..1: rain and lightning strength (BROKEN SPINE). */
  readonly storm: number;
  /** 0..1: low drifting mist (DROWSE). */
  readonly mist: number;
}

const mixN = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [mixN(a[0], b[0], t), mixN(a[1], b[1], t), mixN(a[2], b[2], t)];

/** One row as numbers (colours linear). */
export function resolveRow(row: StageLook, stageIndex: number): ResolvedLook {
  return {
    id: row.id, stageIndex,
    sunElevation: (row.sun.elevationDeg * Math.PI) / 180, sunAzimuth: (row.sun.azimuthDeg * Math.PI) / 180,
    sunColor: linearOf(row.sun.color), sunIntensity: row.sun.intensity, sunDisc: linearOf(row.sun.disc), corona: row.sun.corona,
    fillColor: linearOf(row.fill.color), fillIntensity: row.fill.intensity,
    hemiSky: linearOf(row.hemisphere.sky), hemiGround: linearOf(row.hemisphere.ground), hemiIntensity: row.hemisphere.intensity,
    environmentIntensity: row.environmentIntensity,
    zenith: linearOf(row.sky.zenith), upper: linearOf(row.sky.upper), horizon: linearOf(row.sky.horizon), band: linearOf(row.sky.band),
    stars: row.sky.stars, moon: row.sky.moon,
    cloudLit: linearOf(row.cloud.lit), cloudMid: linearOf(row.cloud.mid), cloudDark: linearOf(row.cloud.dark),
    fogColor: linearOf(row.fog.color), fogNear: row.fog.near, fogFar: row.fog.far,
    pearl: linearOf(row.road.pearl), jade: linearOf(row.road.jade), spine: linearOf(row.road.spine), belly: linearOf(row.road.belly),
    exposure: row.exposure, bloomIntensity: row.bloom.intensity, bloomThreshold: row.bloom.threshold,
    temperature: row.grade.temperature, tint: row.grade.tint, saturation: row.grade.saturation, contrast: row.grade.contrast,
    godRays: row.godRays ? 1 : 0, storm: row.weather === "rain-lightning" ? 1 : 0, mist: row.weather === "mist" ? 1 : 0
  };
}

/** Blend of two resolved rows (colours mixed in linear light; `stageIndex` and `id` follow the nearer row). */
export function mixLook(a: ResolvedLook, b: ResolvedLook, t: number): ResolvedLook {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const near = t < 0.5 ? a : b;
  const out: Record<string, unknown> = { id: near.id, stageIndex: near.stageIndex };
  for (const key of Object.keys(a) as (keyof ResolvedLook)[]) {
    if (key === "id" || key === "stageIndex") continue;
    const va = a[key], vb = b[key];
    out[key] = Array.isArray(va) ? mix3(va as Rgb, vb as Rgb, t) : mixN(va as number, vb as number, t);
  }
  return out as unknown as ResolvedLook;
}

const RESOLVED = STAGE_LOOK.map((row, i) => resolveRow(row, i));
/** The original fog colour was authored in linear light (shaders.ts FOG_COL); keep it exact. */
const RESOLVED_ORIGINAL: ResolvedLook = { ...resolveRow(ORIGINAL_LOOK, 0), fogColor: [0.8, 0.62, 0.8] };

/** The look to draw at road distance `s` (outbound metres) for `params`. */
export function lookAt(s: number, params: LookParams): ResolvedLook {
  if (params.mode === "original") return RESOLVED_ORIGINAL;
  if (params.pinnedStage !== null) return RESOLVED[params.pinnedStage] as ResolvedLook;
  const blend = stageBlendAt(s);
  return mixLook(RESOLVED[blend.from] as ResolvedLook, RESOLVED[blend.to] as ResolvedLook, blend.t);
}

/**
 * Sun direction (unit, pointing towards the sun) for a forward vector: elevation above the world horizon, azimuth
 * relative to the horizontal projection of `forward`. Falls back to world -Z when the forward is vertical.
 */
export function sunDirection(forward: readonly [number, number, number], elevation: number, azimuth: number): [number, number, number] {
  let fx = forward[0], fz = forward[2];
  const l = Math.hypot(fx, fz);
  if (l < 1e-4) { fx = 0; fz = -1; } else { fx /= l; fz /= l; }
  // right of forward on the horizontal plane (y up): (-fz, 0, fx)
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth);
  const hx = fx * ca - fz * sa, hz = fz * ca + fx * sa;
  const ce = Math.cos(elevation), se = Math.sin(elevation);
  return [hx * ce, se, hz * ce];
}

/** The original's world-fixed sun direction (shaders.ts SUN_DIR before GU47). */
export const ORIGINAL_SUN_DIR: readonly [number, number, number] = [-0.2501, 0.3002, -0.9206];
