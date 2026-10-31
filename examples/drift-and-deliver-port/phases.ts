/**
 * Gridlock Courier "Last shift on the harbour" (GU47 WP-28): the look table.
 *
 * The 3:00 shift runs the light from golden hour through sunset to blue hour. `PHASES` holds one row per variant
 * (golden, sunset, blue hour) plus `ORIGINAL`, today's look, kept behind `?look=original`. `phaseAt(t)` blends the rows
 * on the shift clock: golden until 0:10, golden to sunset by 2:00, sunset to blue hour by 2:50, blue hour to the end.
 * Pure data and math (no DOM, no engine), so the runtime driver (`main.ts`) and the unit tests read the same numbers.
 *
 * `t` is the time-of-day clock in seconds of a 180 s shift: `todSeconds(elapsed, length, at)` scales a shorter or
 * longer shift onto it, and `?at=N` pins it (the capture variants golden `?at=10`, sunset `?at=120`, bluehour
 * `?at=170`; `tests/browser/game-luma-targets.ts` DRIFT_PHASES). The pin is visual only: the shift clock, jobs,
 * score and replays never read it (PRD D8).
 */

export type PhaseId = "golden" | "sunset" | "bluehour";
export type LookMode = "shift" | "original";

/** Directions are given as azimuth (degrees, `atan2(z, x)` of the direction toward the light) and elevation. */
export interface PhaseLight {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly color: string;
  readonly intensity: number;
}

export interface PhaseRow {
  readonly id: PhaseId | "original";
  /** Shift-clock second (of 180) where the row is reached exactly. */
  readonly at: number;
  /** Time of day in words (identity sheet). */
  readonly timeOfDay: string;
  /** The sun as the sky draws it (its disc and glow); below the horizon at blue hour. */
  readonly sun: PhaseLight;
  /** The one shadowed key: the sun until sunset, the moon fill at blue hour. */
  readonly key: PhaseLight;
  readonly hemisphere: { readonly sky: string; readonly ground: string; readonly intensity: number };
  /** venice_sunset IBL intensity (the HDRI is the reflection and fill source; the sky shader is the background). */
  readonly environmentIntensity: number;
  /** Harbour mist (GC-S3): cool at golden, rose at sunset, ink blue at blue hour. */
  readonly fog: { readonly color: string; readonly density: number };
  readonly sky: {
    readonly horizon: string;
    readonly mid: string;
    readonly top: string;
    readonly glow: string;
    /** 0..1: post-rain cumulus coverage. */
    readonly clouds: number;
    /** 0..1: star field strength (blue hour only). */
    readonly stars: number;
  };
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  readonly vignette: number;
  readonly grain: number;
  /** Facade window emissive intensity (GC-M2): 0.15 by day to 1.4 at blue hour. */
  readonly windows: number;
  /** Lit-window fraction of the seeded mask (GC-M2, GC-S2). */
  readonly litFraction: number;
  /** Sodium lamp pool strength 0..1 (GC-L4); 0 before sunset. */
  readonly lamps: number;
  /** Warm shopfront fills 0..1 (GC-L4); blue hour only. */
  readonly shopfronts: number;
  /** Delivery beacon pillar emissive (GC-V2); rises as the sky darkens so it stays +30 over the sky. */
  readonly beacon: number;
  /** Harbour water sun-glitter strength (GC-S4). */
  readonly glitter: number;
  /** Festoon bulbs 0..1 (GC-V3), from sunset. */
  readonly festoon: number;
}

/** Shared HDRI (GC-L1): only this game uses venice_sunset as its primary environment (PRD §6.1, G18). */
export const HDRI_ID = "venice_sunset" as const;
export const HDRI_URL = `/hdri/${HDRI_ID}_1k.hdr` as const;
/**
 * Where the venice_sunset 1k file keeps its sun: texel (614, 246) of 1024 x 512, u = 0.600, 3.3 deg above the
 * horizon (brightest pixel; measured from `public/hdri/venice_sunset_1k.hdr`). With no rotation the engine samples
 * u = atan2(z, x) / 2pi + 0.5, so the HDRI sun sits at azimuth (0.600 - 0.5) x 360 = 36 deg.
 */
export const HDRI_SUN_AZIMUTH_DEG = 36;

/** The shift's sun azimuth: down the diagonal of the street grid, so it rakes both the x and the z avenues. */
const SUN_AZ = 36;
/**
 * GU47 phase 3: the shadowed key comes from behind the chase camera's left shoulder (as in the 4.6.2 rig), so the
 * facades and the courier face into warm light and the shadows fall ahead down the street. With the key under the
 * sky sun (ahead, down the canyon) every judged frame was backlit: grey facades, flat street, weak shadows.
 */
const KEY_AZ = -150;

export const PHASES: readonly PhaseRow[] = [
  {
    id: "golden",
    at: 10,
    timeOfDay: "golden hour just after summer rain, sun 14 deg",
    sun: { azimuthDeg: SUN_AZ, elevationDeg: 14, color: "#ffc27a", intensity: 4.4 },
    key: { azimuthDeg: KEY_AZ, elevationDeg: 15, color: "#ffc27a", intensity: 4.4 },
    hemisphere: { sky: "#cfe0ea", ground: "#6a5a52", intensity: 0.3 },
    environmentIntensity: 1.0,
    // blind-panel fix pass: thinner warm haze, stronger contrast, saturation and warmth, softer bloom, no grain
    // (the panel read the cool #c9d6dc haze at 0.0019 as muddy, low-contrast and barely golden next to 4.6.2)
    fog: { color: "#efc896", density: 0.0011 },
    sky: { horizon: "#ffd9a8", mid: "#f4b98e", top: "#d9956f", glow: "#ffd08a", clouds: 0.55, stars: 0 },
    grade: { contrast: 1.22, saturation: 1.34, temperature: 0.16 },
    bloom: { intensity: 0.4, threshold: 1.0 },
    vignette: 0.22,
    grain: 0,
    windows: 0.15,
    litFraction: 0.06,
    lamps: 0,
    shopfronts: 0,
    beacon: 1.6,
    glitter: 0.6,
    festoon: 0
  },
  {
    id: "sunset",
    at: 120,
    timeOfDay: "sunset, sun 4 deg on the harbour line",
    sun: { azimuthDeg: SUN_AZ - 4, elevationDeg: 4, color: "#ff9a52", intensity: 3.3 },
    key: { azimuthDeg: KEY_AZ + 4, elevationDeg: 12, color: "#ff9a52", intensity: 3.3 },
    hemisphere: { sky: "#b8a6c4", ground: "#5a4446", intensity: 0.28 },
    environmentIntensity: 0.8,
    // blind-panel fix pass: same treatment as golden (thinner haze, more contrast and saturation, no grain)
    fog: { color: "#d8967a", density: 0.0013 },
    sky: { horizon: "#ff9a5c", mid: "#e07a62", top: "#9c5a70", glow: "#ffb070", clouds: 0.5, stars: 0 },
    grade: { contrast: 1.22, saturation: 1.3, temperature: 0.16 },
    bloom: { intensity: 0.5, threshold: 0.95 },
    vignette: 0.24,
    grain: 0,
    windows: 0.55,
    litFraction: 0.18,
    lamps: 0.6,
    shopfronts: 0.2,
    beacon: 2.0,
    glitter: 1.0,
    festoon: 0.7
  },
  {
    id: "bluehour",
    at: 170,
    timeOfDay: "blue hour, sun 6 deg below the horizon, moon fill",
    sun: { azimuthDeg: SUN_AZ - 8, elevationDeg: -6, color: "#ff8a4a", intensity: 0 },
    key: { azimuthDeg: SUN_AZ + 180, elevationDeg: 38, color: "#9fb4ff", intensity: 0.9 },
    hemisphere: { sky: "#4a5c8a", ground: "#1e2230", intensity: 0.32 },
    environmentIntensity: 0.35,
    fog: { color: "#2a3550", density: 0.0026 },
    sky: { horizon: "#6f80aa", mid: "#3d4f80", top: "#1b2852", glow: "#d98a6a", clouds: 0.35, stars: 1 },
    grade: { contrast: 1.1, saturation: 1.05, temperature: -0.12 },
    bloom: { intensity: 0.7, threshold: 0.85 },
    vignette: 0.3,
    grain: 0.03,
    windows: 1.4,
    litFraction: 0.42,
    lamps: 1,
    shopfronts: 1,
    beacon: 2.6,
    glitter: 0.25,
    festoon: 1
  }
];

/** Today's look (`?look=original`): kloppenheim_06 tinted #ffc890, one 21 deg sun, fixed peach sky. Not blended. */
export const ORIGINAL: PhaseRow = {
  id: "original",
  at: 0,
  timeOfDay: "fixed late afternoon (4.6.1 look)",
  sun: { azimuthDeg: 29.6, elevationDeg: 21, color: "#ffbf80", intensity: 4.4 },
  key: { azimuthDeg: -150.4, elevationDeg: 21, color: "#ffbf80", intensity: 4.4 },
  hemisphere: { sky: "#ffe0b0", ground: "#c9a070", intensity: 0.3 },
  environmentIntensity: 1.0,
  fog: { color: "#f0dcc0", density: 0.0024 },
  sky: { horizon: "#f0dcc0", mid: "#f5d5b0", top: "#e9c08c", glow: "#ffd18c", clouds: 0, stars: 0 },
  grade: { contrast: 1.06, saturation: 1.38, temperature: 0 },
  bloom: { intensity: 0.35, threshold: 1.05 },
  vignette: 0.2,
  grain: 0,
  windows: 0.6,
  litFraction: 0,
  lamps: 0,
  shopfronts: 0,
  beacon: 1.8,
  glitter: 0,
  festoon: 0
};

export const SHIFT_CLOCK = 180;

/** Time-of-day seconds for the shift clock: `at` (the `?at=` pin) wins; otherwise elapsed is scaled onto 180 s. */
export function todSeconds(elapsed: number, length: number, at?: number): number {
  if (at !== undefined && Number.isFinite(at)) return Math.max(0, Math.min(SHIFT_CLOCK, at));
  const l = length > 0 ? length : SHIFT_CLOCK;
  return Math.max(0, Math.min(SHIFT_CLOCK, (elapsed / l) * SHIFT_CLOCK));
}

/** Parses `?at=` (seconds, 0..180); anything else is undefined (the clock then follows the shift). */
export function parseAt(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(SHIFT_CLOCK, n)) : undefined;
}

/**
 * `?look=` to a look mode. GU47 phase 2 (PRD D11): the lights-only diagnostic (`env=0`) defaults to the original look,
 * because the shift look without its HDRI glared the wet road white ahead of the courier by the 60 s frame (two
 * capture rounds, worse than 4.6.2); `?look=shift` still forces it.
 */
/**
 * GU47 phase 3 (4.7.1): the shift look is the default again for every pinned and unpinned view with the HDRI on
 * (the key now front-lights the street, the stucco is warmer and the dial sits clear of the bumper; blind panel in the
 * lane report). `SHIFT_LOOK_FROM` is the lowest `?at=` pin that opens the shift look; `?look=original` and
 * `?look=shift` force either look, and `env=0` keeps the original look (D11).
 */
export const SHIFT_LOOK_FROM = 0;
export const parseLook = (raw: string | null | undefined, env = true, at?: number): LookMode =>
  raw === "original" ? "original" : raw === "shift" || (env && (at === undefined || at >= SHIFT_LOOK_FROM)) ? "shift" : "original";

/* ------------------------------------------------------------------ blending */

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(c: Rgb): string {
  const b = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${b(c[0])}${b(c[1])}${b(c[2])}`;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** sRGB hex colours blended in linear light. */
export function mixHex(a: string, b: string, t: number): string {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const enc = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([enc(lerp(lin(x[0]), lin(y[0]), t)), enc(lerp(lin(x[1]), lin(y[1]), t)), enc(lerp(lin(x[2]), lin(y[2]), t))]);
}

/** Unit vector toward a light given by azimuth / elevation (degrees). */
export function lightDir(l: Pick<PhaseLight, "azimuthDeg" | "elevationDeg">): [number, number, number] {
  const az = (l.azimuthDeg * Math.PI) / 180;
  const el = (l.elevationDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

/** Shortest-arc azimuth blend (degrees). */
function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

function mixLight(a: PhaseLight, b: PhaseLight, t: number): PhaseLight {
  return { azimuthDeg: lerpAngle(a.azimuthDeg, b.azimuthDeg, t), elevationDeg: lerp(a.elevationDeg, b.elevationDeg, t), color: mixHex(a.color, b.color, t), intensity: lerp(a.intensity, b.intensity, t) };
}

/** Blends every field of two rows; `t` 0 is `a`, 1 is `b`. */
export function mixPhase(a: PhaseRow, b: PhaseRow, t: number): PhaseRow {
  const n = (k: keyof PhaseRow) => lerp(a[k] as number, b[k] as number, t);
  // the key swaps from sun to moon under its lowest light: intensity dips to 25% half-way so the shadow direction
  // never swings across a lit frame
  const key = mixLight(a.key, b.key, t);
  const crossing = a.key.azimuthDeg !== b.key.azimuthDeg && Math.abs(lerpAngle(a.key.azimuthDeg, b.key.azimuthDeg, 1) - a.key.azimuthDeg) > 90;
  const dip = crossing ? 1 - 0.75 * Math.sin(Math.PI * t) : 1;
  return {
    id: t < 0.5 ? a.id : b.id,
    at: lerp(a.at, b.at, t),
    timeOfDay: t < 0.5 ? a.timeOfDay : b.timeOfDay,
    sun: mixLight(a.sun, b.sun, t),
    key: { ...key, intensity: key.intensity * dip },
    hemisphere: { sky: mixHex(a.hemisphere.sky, b.hemisphere.sky, t), ground: mixHex(a.hemisphere.ground, b.hemisphere.ground, t), intensity: lerp(a.hemisphere.intensity, b.hemisphere.intensity, t) },
    environmentIntensity: n("environmentIntensity"),
    fog: { color: mixHex(a.fog.color, b.fog.color, t), density: lerp(a.fog.density, b.fog.density, t) },
    sky: {
      horizon: mixHex(a.sky.horizon, b.sky.horizon, t),
      mid: mixHex(a.sky.mid, b.sky.mid, t),
      top: mixHex(a.sky.top, b.sky.top, t),
      glow: mixHex(a.sky.glow, b.sky.glow, t),
      clouds: lerp(a.sky.clouds, b.sky.clouds, t),
      stars: lerp(a.sky.stars, b.sky.stars, t)
    },
    grade: { contrast: lerp(a.grade.contrast, b.grade.contrast, t), saturation: lerp(a.grade.saturation, b.grade.saturation, t), temperature: lerp(a.grade.temperature, b.grade.temperature, t) },
    bloom: { intensity: lerp(a.bloom.intensity, b.bloom.intensity, t), threshold: lerp(a.bloom.threshold, b.bloom.threshold, t) },
    vignette: n("vignette"),
    grain: n("grain"),
    windows: n("windows"),
    litFraction: n("litFraction"),
    lamps: n("lamps"),
    shopfronts: n("shopfronts"),
    beacon: n("beacon"),
    glitter: n("glitter"),
    festoon: n("festoon")
  };
}

/**
 * GC-S5 sunset god rays: strength 0..1 from the sun's elevation, peaking at 5 deg (sunset on the harbour line) and 0
 * from 11 deg up (golden) and below -1 deg (blue hour), so the shafts only show at sunset. Quantised to 0.05.
 */
export function godRayStrength(sunElevationDeg: number): number {
  const v = Math.max(0, 1 - Math.abs(sunElevationDeg - 5) / 6);
  return Math.round(v * 20) / 20;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Seconds before sunset over which the practicals switch on. */
export const LIGHTS_ON_LEAD = 40;

/** The look at time-of-day second `t` (0..180). */
export function phaseAt(t: number): PhaseRow {
  const [golden, sunset, blue] = PHASES as [PhaseRow, PhaseRow, PhaseRow];
  if (!(t > golden.at)) return golden;
  if (t < sunset.at) {
    const row = mixPhase(golden, sunset, smooth((t - golden.at) / (sunset.at - golden.at)));
    // lamps, shopfronts and festoons switch on in the last 40 s before sunset, not across the whole golden hour
    const on = smooth(Math.max(0, (t - (sunset.at - LIGHTS_ON_LEAD)) / LIGHTS_ON_LEAD));
    return { ...row, lamps: sunset.lamps * on, shopfronts: sunset.shopfronts * on, festoon: sunset.festoon * on };
  }
  if (t < blue.at) return mixPhase(sunset, blue, smooth((t - sunset.at) / (blue.at - sunset.at)));
  return blue;
}

/** The named row a time-of-day second belongs to (HUD tint, QA state). */
export function phaseIdAt(t: number): PhaseId {
  return t < 65 ? "golden" : t < 145 ? "sunset" : "bluehour";
}

/**
 * Environment yaw (radians) that puts the HDRI's own sun under the shift's sun azimuth. The radians convention of
 * `environments.hdri({ rotation })` turns the probe about +y; 0 already matches (the shift sun was chosen at the
 * HDRI's 36 deg), so this is 0 unless a row moves the sun.
 */
export function environmentRotationFor(sunAzimuthDeg: number): number {
  return ((HDRI_SUN_AZIMUTH_DEG - sunAzimuthDeg) * Math.PI) / 180;
}
