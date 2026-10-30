/**
 * GU47 WP-31 (LT-01..LT-07): the Lamplight Line look table. One service runs from late afternoon at Mango Tide to blue hour
 * at Saltlight Terminus; the sun sinks leg by leg and the lamps, windows and the tram's bulbs take over. Night (`N`, the sim's
 * `timeOfDay`) is band E, the moon. Each row is one variant of PRD §3.2 item 2: HDRI, key (elevation, azimuth, colour,
 * intensity), hemisphere bounce, fog, exposure, post, grade, bloom, practical levels and the sky / cloud colours.
 *
 * Pure data and pure functions (no engine import), so `bands.test.ts` covers it and `world.ts` builds one scene per band
 * from it. `?look=original` keeps today's day / night look (world.ts `buildScene` original path).
 *
 * Azimuths are `atan2(z, x)` in degrees on the ground plane, the angle the engine's equirect lookup uses
 * (`a3dEnvironmentEquirectUv`: u = atan(d.z, d.x) / 2pi + 0.5 + rotation), so `envRotationRad` puts the HDRI's own sun
 * on the key. The HDRI sun columns were measured from the 1k catalogue files (brightest texel): belfast_sunset_puresky and
 * industrial_sunset_puresky u = 0.601; rooftop_night has no sun (its brightest texel is a street lamp), so D/E keep 0.
 */

export type BandId = "A" | "B" | "C" | "D" | "E";
export const BAND_IDS: readonly BandId[] = ["A", "B", "C", "D", "E"];

/** E-A catalogue ids this game uses (PRD §6.1: belfast_sunset, industrial_sunset, rooftop_night; never night-2k). */
export type LamplightHdri = "belfast_sunset_puresky" | "industrial_sunset_puresky" | "rooftop_night";
export const HDRI_URL = (id: LamplightHdri): string => `/hdri/${id}_1k.hdr`;
/** Measured u of the HDRI's sun texel (see the header); null when the HDRI has no sun. */
export const HDRI_SUN_U: Readonly<Record<LamplightHdri, number | null>> = {
  belfast_sunset_puresky: 0.6011,
  industrial_sunset_puresky: 0.6011,
  rooftop_night: null
};

/** Identity palette (PRD WP-31 Identity, §6.1 row G21). Lamplight amber is the only accent; cherry red is the reserved objective. */
export const LAMPLIGHT_PALETTE = {
  apricot: "#f6b98a",
  rose: "#e99aa0",
  cream: "#f3e6cc",
  terracotta: "#c4643f",
  lilac: "#a99ad1",
  lamplight: "#ffc77a",
  cherry: "#c2182f"
} as const;

export interface BandRow {
  readonly id: BandId;
  readonly name: string;
  readonly timeOfDay: string;
  readonly hdri: LamplightHdri;
  readonly envIntensity: number;
  /** Key light: the sun in A-C, the blue-hour sky key in D (0.55), the moon in E. */
  readonly key: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number; readonly name: "sun" | "moon" };
  /** Where the sky shader draws the sun disc (D puts it below the horizon; the key then comes from the bright western sky). */
  readonly skySunElevationDeg: number;
  /** LT-03: hemisphere bounce, the lit cloud sea under the islands. */
  readonly hemisphere: { readonly sky: string; readonly ground: string; readonly intensity: number };
  readonly fog: { readonly color: string; readonly density: number };
  /** LT-07: output exposure (linear multiplier ahead of agx). */
  readonly exposure: number;
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  /** LT-07: E-C S10 white balance (temperature/tint, -1..1) is the split tone: warm highlights in A/B, blue shadows in D/E. */
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  readonly vignette: number;
  /** LT-05: sky dome colours (the town's own pair is mixed in by `townSky`), afterglow strength at the horizon under the sun. */
  readonly sky: { readonly top: string; readonly horizon: string; readonly afterglow: number; readonly stars: number };
  /** LT-05: cloud sea: lit tops toward the sun and lilac valleys. */
  readonly clouds: { readonly lit: string; readonly valley: string; readonly sunGain: number };
  /** LT-02: lamp-head emissive, window emissive (x1.33 in C/D/E), practical point / spot intensities (0 = off). */
  readonly practicals: { readonly lampEmissive: number; readonly windowEmissive: number; readonly platformPoint: number; readonly headlamp: number; readonly tramBulbs: number };
  /** LT-06: god rays (High tier only) and the sun flare. */
  readonly godRays: boolean;
  readonly flare: boolean;
  /** LT-13: how bright the earned lanterns burn in this band (they read most against D/E). */
  readonly lanternGlow: number;
}

/** Window emissive today is 1.8 at night; C/D/E use 1.33x (LT-02). */
const WINDOW_NIGHT = 1.8 * 1.33;

export const BANDS: Readonly<Record<BandId, BandRow>> = {
  A: {
    id: "A", name: "Late afternoon", timeOfDay: "late afternoon, sun 28 deg", hdri: "belfast_sunset_puresky", envIntensity: 0.8,
    key: { name: "sun", elevationDeg: 28, azimuthDeg: 32, color: "#ffe3b8", intensity: 3.0 },
    skySunElevationDeg: 28,
    hemisphere: { sky: "#cfdcf2", ground: "#efd3cc", intensity: 0.35 },
    fog: { color: "#f2dccb", density: 0.00012 },
    exposure: 1.0,
    bloom: { intensity: 0.42, threshold: 0.9 },
    grade: { contrast: 1.06, saturation: 1.08, temperature: 0.12, tint: 0.02 },
    vignette: 0.2,
    sky: { top: "#7cbce6", horizon: "#ffd9b4", afterglow: 0.15, stars: 0 },
    clouds: { lit: "#fff4e4", valley: "#bdb3dc", sunGain: 1.25 },
    practicals: { lampEmissive: 0.4, windowEmissive: 0, platformPoint: 0, headlamp: 0, tramBulbs: 1.2 },
    godRays: false, flare: true, lanternGlow: 1.6
  },
  B: {
    id: "B", name: "Golden hour", timeOfDay: "golden hour, sun 12 deg", hdri: "belfast_sunset_puresky", envIntensity: 0.65,
    key: { name: "sun", elevationDeg: 12, azimuthDeg: 38, color: "#ffc489", intensity: 2.6 },
    skySunElevationDeg: 12,
    hemisphere: { sky: "#c3c4ea", ground: "#f2c6b4", intensity: 0.32 },
    fog: { color: "#f6c9a6", density: 0.00014 },
    exposure: 1.0,
    bloom: { intensity: 0.5, threshold: 0.85 },
    grade: { contrast: 1.08, saturation: 1.1, temperature: 0.2, tint: 0.04 },
    vignette: 0.22,
    sky: { top: "#8e9fd8", horizon: "#ffb57e", afterglow: 0.45, stars: 0 },
    clouds: { lit: "#ffe2bf", valley: "#ad9fd4", sunGain: 1.45 },
    practicals: { lampEmissive: 0.9, windowEmissive: 0.6, platformPoint: 0, headlamp: 0, tramBulbs: 1.6 },
    godRays: true, flare: true, lanternGlow: 2.0
  },
  C: {
    id: "C", name: "Storm dusk", timeOfDay: "storm dusk, sun 6 deg under cloud", hdri: "industrial_sunset_puresky", envIntensity: 0.5,
    key: { name: "sun", elevationDeg: 6, azimuthDeg: 44, color: "#f2a476", intensity: 1.5 },
    skySunElevationDeg: 6,
    hemisphere: { sky: "#7f7fa6", ground: "#b98c86", intensity: 0.3 },
    fog: { color: "#a597b0", density: 0.00022 },
    exposure: 1.05,
    bloom: { intensity: 0.65, threshold: 0.75 },
    grade: { contrast: 1.1, saturation: 0.96, temperature: 0.02, tint: 0.06 },
    vignette: 0.26,
    sky: { top: "#5c5f8a", horizon: "#e59c7c", afterglow: 0.55, stars: 0 },
    clouds: { lit: "#e7b89c", valley: "#7d7299", sunGain: 1.2 },
    practicals: { lampEmissive: 2.0, windowEmissive: WINDOW_NIGHT, platformPoint: 6, headlamp: 10, tramBulbs: 2.4 },
    godRays: false, flare: false, lanternGlow: 2.6
  },
  D: {
    id: "D", name: "Blue hour", timeOfDay: "blue hour, sun 4 deg below the horizon", hdri: "rooftop_night", envIntensity: 0.35,
    key: { name: "sun", elevationDeg: 18, azimuthDeg: 50, color: "#9fb2ff", intensity: 0.55 },
    skySunElevationDeg: -4,
    hemisphere: { sky: "#4b5aa0", ground: "#8a6a7c", intensity: 0.28 },
    fog: { color: "#2f3a6e", density: 0.00018 },
    exposure: 1.1,
    bloom: { intensity: 0.85, threshold: 0.62 },
    grade: { contrast: 1.1, saturation: 1.02, temperature: -0.16, tint: 0.03 },
    vignette: 0.3,
    sky: { top: "#302a80", horizon: "#f09c7c", afterglow: 0.8, stars: 0.35 },
    clouds: { lit: "#a88fb8", valley: "#3b3f78", sunGain: 1.1 },
    practicals: { lampEmissive: 3.2, windowEmissive: WINDOW_NIGHT, platformPoint: 9, headlamp: 16, tramBulbs: 3.0 },
    godRays: false, flare: false, lanternGlow: 3.2
  },
  E: {
    id: "E", name: "Moonlight", timeOfDay: "night under the moon", hdri: "rooftop_night", envIntensity: 0.2,
    key: { name: "moon", elevationDeg: 38, azimuthDeg: 214, color: "#b4c4ff", intensity: 1.2 },
    skySunElevationDeg: 38,
    hemisphere: { sky: "#29336a", ground: "#3d3550", intensity: 0.22 },
    fog: { color: "#161d3e", density: 0.00018 },
    exposure: 1.0,
    bloom: { intensity: 0.85, threshold: 0.6 },
    grade: { contrast: 1.1, saturation: 0.95, temperature: -0.22, tint: 0.0 },
    vignette: 0.34,
    sky: { top: "#070c26", horizon: "#26305e", afterglow: 0, stars: 1 },
    clouds: { lit: "#3b4676", valley: "#0c1230", sunGain: 1.05 },
    practicals: { lampEmissive: 3.4, windowEmissive: WINDOW_NIGHT, platformPoint: 9, headlamp: 16, tramBulbs: 3.0 },
    godRays: false, flare: false, lanternGlow: 3.4
  }
};

/** The service's band at each town (index = town, `data.tables.towns` order): Mango Tide A ... Saltlight Terminus D. */
export const TOWN_BANDS: readonly BandId[] = ["A", "B", "B", "C", "C", "D"];

/** The band the world should show: `?band=` pins it; night is E; else the town the tram is docked at (or left last). */
export function bandFor(town: number, timeOfDay: "day" | "night", pinned: BandId | null = null): BandId {
  if (pinned) return pinned;
  if (timeOfDay === "night") return "E";
  const n = TOWN_BANDS.length;
  return TOWN_BANDS[((Math.trunc(town) % n) + n) % n]!;
}

/** `?band=A..E` (case-insensitive); anything else is null (no pin). */
export function parseBand(value: string | null | undefined): BandId | null {
  const v = (value ?? "").trim().toUpperCase();
  return (BAND_IDS as readonly string[]).includes(v) ? (v as BandId) : null;
}

/** `?look=original` keeps today's look (two scenes, day / night). */
export function parseLook(value: string | null | undefined): "bands" | "original" {
  return value === "original" ? "original" : "bands";
}

/**
 * LT-01 "swap only while docked": the scene swaps when the wanted band differs from the shown one and the tram is not
 * en route. A pinned band (`?band=`) or the QA hook's forced swap may swap at once.
 */
export function shouldSwapBand(shown: BandId, wanted: BandId, phase: string, force = false): boolean {
  return shown !== wanted && (force || phase !== "enroute");
}

/** World direction (unit) of a key at `elevationDeg` / `azimuthDeg` (azimuth = atan2(z, x)). */
export function keyDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
}

/** Light position for a directional key aimed at the origin (the engine aims position -> target). */
export function keyPosition(row: BandRow, distance = 520): [number, number, number] {
  const d = keyDirection(row.key.elevationDeg, row.key.azimuthDeg);
  return [d[0] * distance, d[1] * distance, d[2] * distance];
}

/** Sky-shader sun direction (D draws it under the horizon while the key stays up as the bright sky). */
export function skySunDirection(row: BandRow): [number, number, number] {
  return keyDirection(row.skySunElevationDeg, row.key.azimuthDeg);
}

/**
 * LT-04 "rotated to the key": the environment rotation (radians) that puts the HDRI's sun texel on the key azimuth, or 0
 * when the HDRI has no sun. Equirect u = azimuth / 2pi + 0.5 + rotation / 2pi, so rotation = 2pi (u_sun - 0.5) - azimuth.
 */
export function envRotationRad(row: BandRow): number {
  const u = HDRI_SUN_U[row.hdri];
  if (u === null) return 0;
  const r = 2 * Math.PI * (u - 0.5) - (row.key.azimuthDeg * Math.PI) / 180;
  const tau = 2 * Math.PI;
  return ((r % tau) + tau) % tau;
}

const hex = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const toHex = (c: readonly number[]): string => `#${c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

/** Hue in degrees (0..360) of a hex colour; grey is 0. */
export function hueDeg(h: string): number {
  const [r, g, b] = hex(h);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  const k = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((k * 60) + 360) % 360;
}
export const hueDistance = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * LT-05 six divergent town sky pairs: each town pushes the band's sky toward its own hue (the original's six pairs were
 * near-identical blues). `TOWN_SKY_TINT` is the per-town tint; the mix keeps the band's time of day dominant.
 */
export const TOWN_SKY_TINT: readonly { readonly top: string; readonly horizon: string }[] = [
  { top: "#4fb4ea", horizon: "#ffd29a" }, // Mango Tide: clear cerulean over mango apricot
  { top: "#6f8fe0", horizon: "#f7c6a8" }, // Folded Gardens: periwinkle, peach
  { top: "#a27ad8", horizon: "#ffa98a" }, // Cedarbell Shrine: lilac, coral
  { top: "#5f96c8", horizon: "#d0b0d8" }, // Drowned Observatory: cold ice blue, mauve
  { top: "#3f9a8c", horizon: "#e89a82" }, // Monsoon Exchange: storm teal-grey, rust
  { top: "#4a3290", horizon: "#ff9f7a" }  // Saltlight Terminus: violet indigo, salmon afterglow
];
const TOWN_TINT_WEIGHT = 0.5;

/** Sky top / horizon for a band at a town (hex). */
export function townSky(band: BandId, town: number): { top: string; horizon: string } {
  const row = BANDS[band];
  const t = TOWN_SKY_TINT[((town % TOWN_SKY_TINT.length) + TOWN_SKY_TINT.length) % TOWN_SKY_TINT.length]!;
  const w = band === "E" ? TOWN_TINT_WEIGHT * 0.35 : TOWN_TINT_WEIGHT;
  return { top: toHex(mix(hex(row.sky.top), hex(t.top), w)), horizon: toHex(mix(hex(row.sky.horizon), hex(t.horizon), w)) };
}

/** Linear 0..1 RGB of a hex colour (sRGB-encoded values; the shaders decode). */
export const rgb = hex;

/**
 * Low tier and reduced flash (PRD §6.3, §6.4). Low keeps the palette, sky and lanterns, drops god rays, DOF and grain, keeps
 * one cascade (the engine's Low tier) and PCF; reduced flash caps the storm lightning at 0.3 for <= 200 ms.
 */
export interface BandPostPlan {
  readonly godRays: boolean;
  readonly tiltShift: boolean;
  readonly grain: number;
  readonly flare: boolean;
  readonly ao: boolean;
}
export function postPlan(band: BandId, tier: "low" | "medium" | "high" | "ultra"): BandPostPlan {
  const row = BANDS[band];
  const high = tier === "high" || tier === "ultra";
  return { godRays: row.godRays && high, tiltShift: high, grain: tier === "low" ? 0 : 0.03, flare: row.flare && tier !== "low", ao: tier !== "low" };
}

/** LT-14 storm lightning (band C only): peak and duration, capped under reduced flash. */
export function lightningFlash(reducedFlash: boolean): { readonly peak: number; readonly seconds: number } {
  return reducedFlash ? { peak: 0.3, seconds: 0.15 } : { peak: 0.6, seconds: 0.18 };
}

/** LT-14: deterministic strike times, one 0.25 s window every 13 s (storm dusk only); true while a strike window is open. */
export function storminess(seconds: number): boolean {
  return seconds % 13 < 0.25 && seconds > 5;
}
