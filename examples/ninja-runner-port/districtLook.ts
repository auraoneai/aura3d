/**
 * GU47 WP-30 "One evening, one run": the per-district look table. The time of day moves with distance: late-afternoon
 * gold in Lantern Village, vermilion sunset over Rooftop Run, dusk at the river, blue-hour mist in Whispering Forest,
 * first stars at Valley Gate. One row per district stop (the `?at=` luma targets, NR-22); between stops every value is
 * a smoothstep blend of its two neighbours, so the light never jumps across a district boundary (NR-02).
 *
 * Pure and DOM-free: `world.ts` reads `lookAtDistance(s)` every frame and pushes it to the sun (`setLight`), the
 * environment intensity, the fog (`app.atmosphere.setFog`), the sky dome and the lantern pool. `?look=original` keeps
 * the pre-GU47 midday look (`lookMode`).
 */
import { smooth } from "./course";
import { hexLinear, type Rgb } from "./palette";

export type DistrictId = "village" | "rooftops" | "river" | "forest" | "gate";
export type LookMode = "evening" | "original";

/** One look-table row (sRGB hex in the table; `lookAtDistance` returns linear RGB). */
export interface DistrictLookRow {
  readonly id: DistrictId;
  /** Course distance (m) the row is pinned to; also the `?at=` luma-target distance. */
  readonly at: number;
  readonly timeOfDay: string;
  /** Key light: the sun until the river, then a 25-degree moon key (still the one shadowed light). */
  readonly key: { readonly kind: "sun" | "moon"; readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number };
  /** Image-based fill from the belfast_sunset_puresky 1k HDRI (NR-01 steps 1.0 / 0.85 / 0.6 / 0.35 / 0.3). */
  readonly environmentIntensity: number;
  readonly fog: { readonly color: string; readonly density: number };
  /** Sky dome: zenith and horizon colours, sun/moon glow tint, star strength and moon disc strength (NR-05). */
  readonly sky: { readonly zenith: string; readonly horizon: string; readonly glow: string; readonly cloud: string; readonly stars: number; readonly moon: number };
  /** Pooled lantern point lights: intensity scale (0 = off; on from the river, NR-03). */
  readonly lanterns: number;
  /** Indigo ink outline opacity (NR-09); stays on every tier. */
  readonly ink: number;
}

/** Catalogue HDRI that lights the evening (IBL only; the visible sky is the authored dome). */
export const EVENING_HDRI = "belfast_sunset_puresky" as const;

/** Signature palette (PRD §6.1 G20). */
export const PALETTE = {
  indigo: "#2b3550",
  persimmon: "#d4553a",
  mistPaper: "#e8e2d4",
  lanternAmber: "#ffb45e",
  spiritCyan: "#51dfff",
  ink: "#1b2236"
} as const;

export const DISTRICT_LOOKS: readonly DistrictLookRow[] = [
  {
    id: "village", at: 100, timeOfDay: "late afternoon, golden",
    key: { kind: "sun", elevationDeg: 22, azimuthDeg: 125, color: "#ffc98a", intensity: 2.7 },
    environmentIntensity: 1.0,
    fog: { color: "#d8c6a4", density: 0.0026 },
    sky: { zenith: "#5b7fa8", horizon: "#f0cf98", glow: "#ffd9a0", cloud: "#f4e6cc", stars: 0, moon: 0 },
    lanterns: 0, ink: 0.85
  },
  {
    id: "rooftops", at: 700, timeOfDay: "vermilion sunset",
    key: { kind: "sun", elevationDeg: 9, azimuthDeg: 120, color: "#ff9a5c", intensity: 2.3 },
    environmentIntensity: 0.85,
    fog: { color: "#e2a27e", density: 0.003 },
    sky: { zenith: "#5e5a8c", horizon: "#f2774a", glow: "#ff8a4c", cloud: "#f6b088", stars: 0, moon: 0 },
    lanterns: 0, ink: 0.9
  },
  {
    id: "river", at: 1300, timeOfDay: "dusk",
    key: { kind: "sun", elevationDeg: 4, azimuthDeg: 115, color: "#ff7446", intensity: 1.5 },
    environmentIntensity: 0.6,
    fog: { color: "#8c7c90", density: 0.0034 },
    sky: { zenith: "#343d6c", horizon: "#d4684e", glow: "#ff6a3e", cloud: "#b88a90", stars: 0.15, moon: 0 },
    lanterns: 0.8, ink: 0.95
  },
  {
    id: "forest", at: 1900, timeOfDay: "blue hour, mist",
    key: { kind: "moon", elevationDeg: 25, azimuthDeg: -150, color: "#a3b6e2", intensity: 0.7 },
    environmentIntensity: 0.35,
    fog: { color: "#5c6c8c", density: 0.0046 },
    sky: { zenith: "#1b2346", horizon: "#56668e", glow: "#c4d2f4", cloud: "#6a789c", stars: 0.55, moon: 0.7 },
    lanterns: 1, ink: 1
  },
  {
    id: "gate", at: 2500, timeOfDay: "first stars",
    key: { kind: "moon", elevationDeg: 25, azimuthDeg: -150, color: "#adc0ec", intensity: 0.6 },
    environmentIntensity: 0.3,
    fog: { color: "#2b3550", density: 0.003 },
    sky: { zenith: "#0d1328", horizon: "#3a4672", glow: "#d6e0ff", cloud: "#3e4a70", stars: 1, moon: 1 },
    lanterns: 1, ink: 1
  }
];

/** The look as resolved for one distance: linear RGB, unit vectors, ready for uniforms and light patches. */
export interface ResolvedLook {
  readonly district: DistrictId;
  /** Unit vector from the ground toward the key light (sun or moon). */
  readonly toKey: readonly [number, number, number];
  readonly keyColor: Rgb;
  readonly keyIntensity: number;
  readonly environmentIntensity: number;
  readonly fogColor: Rgb;
  readonly fogDensity: number;
  readonly skyZenith: Rgb;
  readonly skyHorizon: Rgb;
  readonly skyGlow: Rgb;
  readonly skyCloud: Rgb;
  readonly stars: number;
  readonly moon: number;
  readonly lanterns: number;
  readonly ink: number;
}

/** `?look=original` keeps today's midday look; everything else is the evening. */
export function lookMode(search: string | URLSearchParams): LookMode {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("look") === "original" ? "original" : "evening";
}

/** District band a distance belongs to (the five stops; the Backstreets share the village row). */
export function districtIdAt(s: number): DistrictId {
  return s < 470 ? "village" : s < 1120 ? "rooftops" : s < 1510 ? "river" : s < 2260 ? "forest" : "gate";
}

/** Unit vector toward a light at `elevationDeg` above the horizon and `azimuthDeg` (0 = +Z, 90 = +X). */
export function directionFromAngles(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const normalize = (v: readonly [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The two rows around `s` and the smoothstep weight of the second. */
export function bracket(s: number): { readonly a: DistrictLookRow; readonly b: DistrictLookRow; readonly t: number } {
  const rows = DISTRICT_LOOKS;
  if (s <= rows[0]!.at) return { a: rows[0]!, b: rows[0]!, t: 0 };
  for (let i = 1; i < rows.length; i++) {
    const b = rows[i]!;
    if (s <= b.at) {
      const a = rows[i - 1]!;
      // The village row holds through the Backstreets (to 300 m), then the sun sinks toward the rooftops.
      const from = a.id === "village" ? 300 : a.at;
      return { a, b, t: smooth(from, b.at, s) };
    }
  }
  const last = rows[rows.length - 1]!;
  return { a: last, b: last, t: 0 };
}

/** The evening look at course distance `s` (m). */
export function lookAtDistance(s: number): ResolvedLook {
  const { a, b, t } = bracket(s);
  // The key crosses from sun to moon at the river-forest boundary: blend the direction, never the kind, so the
  // single shadowed key keeps moving smoothly (the sun has set by then and its intensity is already low).
  const toKey = normalize(mixDir(directionFromAngles(a.key.elevationDeg, a.key.azimuthDeg), directionFromAngles(b.key.elevationDeg, b.key.azimuthDeg), t));
  return {
    district: districtIdAt(s),
    toKey,
    keyColor: mixRgb(hexLinear(a.key.color), hexLinear(b.key.color), t),
    keyIntensity: keyIntensityAt(a, b, t),
    environmentIntensity: mix(a.environmentIntensity, b.environmentIntensity, t),
    fogColor: mixRgb(hexLinear(a.fog.color), hexLinear(b.fog.color), t),
    fogDensity: mix(a.fog.density, b.fog.density, t),
    skyZenith: mixRgb(hexLinear(a.sky.zenith), hexLinear(b.sky.zenith), t),
    skyHorizon: mixRgb(hexLinear(a.sky.horizon), hexLinear(b.sky.horizon), t),
    skyGlow: mixRgb(hexLinear(a.sky.glow), hexLinear(b.sky.glow), t),
    skyCloud: mixRgb(hexLinear(a.sky.cloud), hexLinear(b.sky.cloud), t),
    stars: mix(a.sky.stars, b.sky.stars, t),
    moon: mix(a.sky.moon, b.sky.moon, t),
    lanterns: mix(a.lanterns, b.lanterns, t),
    ink: mix(a.ink, b.ink, t)
  };
}

/** Sun-to-moon handover dips the key through its lowest point instead of fading two lights at once. */
function keyIntensityAt(a: DistrictLookRow, b: DistrictLookRow, t: number): number {
  if (a.key.kind === b.key.kind) return mix(a.key.intensity, b.key.intensity, t);
  const low = Math.min(a.key.intensity, b.key.intensity) * 0.5;
  return t < 0.5 ? mix(a.key.intensity, low, t * 2) : mix(low, b.key.intensity, (t - 0.5) * 2);
}

function mixDir(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

/** sRGB hex of a linear colour (for engine APIs that take hex: light patches and fog). */
export function linearToHex(c: Rgb): string {
  const enc = (v: number): number => {
    const x = Math.max(0, Math.min(1, v));
    return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255);
  };
  return `#${[enc(c[0]), enc(c[1]), enc(c[2])].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Sky-dome uniforms of the pre-GU47 look (`?look=original`): the shader's former constants, so the original sky
 * renders unchanged through the new uniform-driven program.
 */
export const ORIGINAL_SKY = {
  skyZenith: [0.065, 0.28, 0.54] as Rgb,
  skyHorizon: [0.44, 0.67, 0.8] as Rgb,
  skyGlow: [1.0, 0.8, 0.5] as Rgb,
  skyCloud: [0.94, 0.95, 0.89] as Rgb,
  stars: 0,
  moon: 0,
  sunDirection: [-0.45, 0.68, -0.4] as const
};

/** Post settings of the woodblock grade (NR-08); Low drops grain (PRD §6.4). */
export const WOODBLOCK_POST = {
  toneMapping: "agx" as const,
  bloom: { intensity: 0.55, threshold: 0.85, radius: 0.4 },
  grade: { contrast: 1.14, saturation: 1.04 },
  vignette: { intensity: 0.3, smoothness: 0.65 },
  grain: { intensity: 0.025 },
  outline: { color: PALETTE.ink, width: 1, threshold: 0.12 }
};

/** Pooled lantern lights (NR-03 within the C-35 cap of 6 practicals): amber lantern points plus cyan spirit points. */
export const LANTERN_POOL = {
  high: { amber: 4, cyan: 2 },
  low: { amber: 2, cyan: 1 },
  amberColor: PALETTE.lanternAmber,
  cyanColor: PALETTE.spiritCyan,
  /** Peak intensity and range of one pooled point at `lanterns = 1`. */
  amberIntensity: 6,
  cyanIntensity: 3,
  range: 14,
  /** Only lanterns this far ahead of (or 8 m behind) the runner take a pooled light. */
  ahead: 70
} as const;

/** Picks the `count` lanterns nearest to `s` in the window [s - 8, s + ahead], nearest first; allocation-light. */
export function nearestLanterns(sorted: readonly { readonly s: number }[], s: number, count: number, ahead: number = LANTERN_POOL.ahead): number[] {
  const out: number[] = [];
  if (count <= 0 || sorted.length === 0) return out;
  // Binary search for the first lantern at or past s - 8.
  let lo = 0, hi = sorted.length;
  const from = s - 8;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid]!.s < from) lo = mid + 1; else hi = mid; }
  const window: { i: number; d: number }[] = [];
  for (let i = lo; i < sorted.length && sorted[i]!.s <= s + ahead; i++) window.push({ i, d: Math.abs(sorted[i]!.s - s) });
  window.sort((p, q) => p.d - q.d || p.i - q.i);
  for (let k = 0; k < Math.min(count, window.length); k++) out.push(window[k]!.i);
  return out;
}

/**
 * NR-11 evening surfaces: clearcoat lacquer on the tiled roofs, hips and tower caps (the low sun and the lanterns catch
 * a sharp highlight on top of the tile map), damp stones (lower roughness and a thin coat on the rocks, evening dew).
 * Material patches only: the same instanced layers draw them (+0 draws). `?look=original` keeps the old specs.
 */
export const EVENING_SURFACES: Readonly<Record<string, { readonly roughness: number; readonly clearcoat: number; readonly clearcoatRoughness: number }>> = {
  roofs: { roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.14 },
  hips: { roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.14 },
  capcones: { roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.14 },
  rocks: { roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.35 }
};

/**
 * NR-11 lantern emissive per district: the lantern layer splits into three static groups by where each lantern stands
 * (+2 draws, the row's cap). Unlit paper glows faintly in the daylit village and rooftops, the lanterns come on at the
 * river and burn brightest in the blue-hour forest and at the gate, matching the pooled lights (NR-03).
 */
export type LanternGlow = "day" | "dusk" | "night";
export const LANTERN_GLOW: Readonly<Record<LanternGlow, { readonly emissive: string; readonly intensity: number }>> = {
  day: { emissive: "#e09a5a", intensity: 0.45 },
  dusk: { emissive: PALETTE.lanternAmber, intensity: 1.3 },
  night: { emissive: PALETTE.lanternAmber, intensity: 2.2 }
};

/** Glow group of a lantern standing at course distance `s`. */
export function lanternGlowAt(s: number): LanternGlow {
  const d = districtIdAt(s);
  return d === "village" || d === "rooftops" ? "day" : d === "river" ? "dusk" : "night";
}
