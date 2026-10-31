/**
 * The Bellkeeper's Walk look table (GU47 WP-33, WW47-L1): one daylight key per story beat. The day moves forward with
 * each letter found: 15:30 warm afternoon, then lower and more apricot through golden 18:30 at the third letter, lilac
 * dusk with lanterns once the bell has rung, and a moonlit night on the voyage epilogue. `original` is the 4.6 look
 * (`?look=original`): the constants the shaders used to hard-code, with no engine light.
 *
 * Presentation only: nothing here feeds the sim. `daylightKeyFor` reads the found count, the bell and the epilogue;
 * the driver eases between keys over `DAYLIGHT_EASE_SECONDS` so the change reads as time passing.
 *
 * Directions: `sunDir` points from the ground toward the sun (the shaders' `SUN_DIR` convention). World axes: the follow
 * camera looks toward -z (north, out to sea), +x is east, so a west-southwest sun sits behind the traveller's left
 * shoulder and its shadows reach forward-right across the meadow. `azimuthDeg` is measured from +z (south) toward -x
 * (west): 67.5 is west-southwest.
 */

export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

export interface DaylightKey {
  readonly id: "found0" | "found1" | "found2" | "found3" | "bell" | "epilogue" | "original";
  readonly clock: string;
  readonly label: string;
  /** Sun (or moon) height above the horizon, degrees. */
  readonly elevationDeg: number;
  /** From +z (south) toward -x (west), degrees. */
  readonly azimuthDeg: number;
  /** sRGB hex of the key light. */
  readonly sun: string;
  /** Multiplier of the painted shaders' direct term (1.3 x colour in the 4.6 rig). */
  readonly sunIntensity: number;
  /** Engine directional light intensity for the GLBs (the same direction and colour). */
  readonly engineSunIntensity: number;
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly fog: string;
  /** exp2 density of the painted shaders' distance fog. */
  readonly fogDensity: number;
  /** 0..1 strength of the low height fog pooling over the sea and the stream (WW47-S3). */
  readonly fogHeight: number;
  readonly skyHorizon: string;
  readonly skyMid: string;
  readonly skyZenith: string;
  readonly cloudTint: string;
  /** Largest share of the sun term a cloud shadow removes (WW47-S2, <= 0.35). */
  readonly cloudShadow: number;
  /** 0..1 star field after the bell. */
  readonly stars: number;
  /** 0..1 lantern glow and lantern point-light level (WW47-L5). */
  readonly lanterns: number;
  /** kloppenheim_06 IBL intensity for the GLBs (0.55 at the first key, scaled per key; WW47-L3). */
  readonly envIntensity: number;
  /** Golden-hour light-shaft strength (WW47-P2, High only). */
  readonly godRays: number;
  /** 0..1 fair-weather sky (phase 3): fewer, brighter clouds by day; 0 keeps the dusk and night cloud deck. */
  readonly clearSky: number;
}

/** Seconds the look takes to move from one key to the next. */
export const DAYLIGHT_EASE_SECONDS = 6;

export const DAYLIGHT_KEYS: readonly DaylightKey[] = [
  // GU47 phase 3 round 3: the daytime sun swings 14 deg further west (76-82 deg), so tree, cottage and traveller shadows
  // fall sideways across the meadow where the high follow camera can see them (rubric: shadows read as missing).
  // GU47 phase 3 (blind panel p3: the daytime keys read as a flat grey overcast sky over hazy water): the daytime skies are
  // clear painted blues again (the horizon a pale aqua, cream only near the sun at golden hour), the fog is the 4.6
  // teal-blue and thinner, the height fog stays off until golden hour, and the GLBs get more sky fill.
  { id: "found0", clock: "15:30", label: "warm afternoon", elevationDeg: 34, azimuthDeg: 76, sun: "#ffe6c2", sunIntensity: 1.26, engineSunIntensity: 2.6, hemiSky: "#e0eecb", hemiGround: "#3a5230", fog: "#b0d2cc", fogDensity: 0.0027, fogHeight: 0, skyHorizon: "#b6daf0", skyMid: "#66a4ea", skyZenith: "#3470d2", cloudTint: "#fffaf0", cloudShadow: 0.3, stars: 0, lanterns: 0, envIntensity: 0.7, godRays: 0.12, clearSky: 1 },
  { id: "found1", clock: "16:30", label: "late afternoon", elevationDeg: 28, azimuthDeg: 78, sun: "#ffdcae", sunIntensity: 1.24, engineSunIntensity: 2.5, hemiSky: "#dce8c4", hemiGround: "#3c4c2a", fog: "#b8d0c4", fogDensity: 0.0028, fogHeight: 0, skyHorizon: "#c4dcea", skyMid: "#6ea6e4", skyZenith: "#346cc8", cloudTint: "#fff2dc", cloudShadow: 0.32, stars: 0, lanterns: 0, envIntensity: 0.66, godRays: 0.16, clearSky: 1 },
  { id: "found2", clock: "17:30", label: "apricot light", elevationDeg: 22, azimuthDeg: 80, sun: "#ffca92", sunIntensity: 1.22, engineSunIntensity: 2.4, hemiSky: "#d8dfbc", hemiGround: "#40442a", fog: "#c2d0c0", fogDensity: 0.0029, fogHeight: 0.12, skyHorizon: "#ead8bc", skyMid: "#76a6de", skyZenith: "#3c6abc", cloudTint: "#ffe8c8", cloudShadow: 0.34, stars: 0, lanterns: 0.25, envIntensity: 0.62, godRays: 0.2, clearSky: 0.85 },
  { id: "found3", clock: "18:30", label: "golden hour", elevationDeg: 16, azimuthDeg: 82, sun: "#ffbc7a", sunIntensity: 1.2, engineSunIntensity: 2.3, hemiSky: "#d0d2b4", hemiGround: "#443c22", fog: "#cccab0", fogDensity: 0.003, fogHeight: 0.25, skyHorizon: "#f2c898", skyMid: "#80a2d8", skyZenith: "#3a5ca8", cloudTint: "#ffdcae", cloudShadow: 0.35, stars: 0, lanterns: 0.6, envIntensity: 0.56, godRays: 0.24, clearSky: 0.7 },
  { id: "bell", clock: "19:40", label: "lilac dusk", elevationDeg: 6, azimuthDeg: 70, sun: "#ff9c74", sunIntensity: 0.72, engineSunIntensity: 1.2, hemiSky: "#9c98b4", hemiGround: "#2e2a26", fog: "#a89cb0", fogDensity: 0.0042, fogHeight: 0.85, skyHorizon: "#e8a888", skyMid: "#9c8cb0", skyZenith: "#3e4c7c", cloudTint: "#e6a8a0", cloudShadow: 0.2, stars: 0.35, lanterns: 1, envIntensity: 0.3, godRays: 0.1, clearSky: 0 },
  { id: "epilogue", clock: "21:30", label: "moonlit voyage", elevationDeg: 38, azimuthDeg: -40, sun: "#b4c4ff", sunIntensity: 0.34, engineSunIntensity: 0.55, hemiSky: "#56628c", hemiGround: "#1a1c24", fog: "#4a5470", fogDensity: 0.004, fogHeight: 0.7, skyHorizon: "#4c5680", skyMid: "#283460", skyZenith: "#101838", cloudTint: "#7c88b0", cloudShadow: 0.12, stars: 1, lanterns: 1, envIntensity: 0.16, godRays: 0, clearSky: 0 }
];

/** `?look=original`: the 4.6 constants (SUN_DIR (-0.468, 0.802, 0.374), linear SUN_COL (1, 0.831, 0.429), ...). */
export const ORIGINAL_KEY: DaylightKey = {
  id: "original", clock: "12:00", label: "4.6 midday", elevationDeg: 53.32, azimuthDeg: 51.37, sun: "#ffedae", sunIntensity: 1.3, engineSunIntensity: 0,
  hemiSky: "#e5f2cf", hemiGround: "#395730", fog: "#b4d4cf", fogDensity: 0.003, fogHeight: 0, skyHorizon: "#cbe7ef", skyMid: "#7bb4f1", skyZenith: "#3c7cdc",
  cloudTint: "#ffffff", cloudShadow: 0, stars: 0, lanterns: 0, envIntensity: 0, godRays: 0, clearSky: 0
};

/** The 4.6 linear constants the original row reproduces exactly (the hex above is only its label). */
const ORIGINAL_LINEAR = {
  sunDir: [-0.468, 0.802, 0.374] as Vec3,
  sunColor: [1.0, 0.831, 0.429] as Rgb,
  hemiSky: [0.78, 0.89, 0.62] as Rgb,
  hemiGround: [0.04, 0.095, 0.03] as Rgb,
  fogColor: [0.46, 0.66, 0.62] as Rgb,
  skyHorizon: [0.6, 0.8, 0.86] as Rgb,
  skyMid: [0.17, 0.46, 0.88] as Rgb,
  skyZenith: [0.045, 0.2, 0.72] as Rgb,
  cloudTint: [1, 1, 1] as Rgb
};

export interface DaylightFrame {
  readonly key: DaylightKey["id"];
  /** 0..1 of the way from the previous key to `key`. */
  readonly blend: number;
  /** Unit vector from the ground toward the sun. */
  readonly sunDir: Vec3;
  /** Linear rgb. */
  readonly sunColor: Rgb;
  readonly sunIntensity: number;
  readonly engineSunIntensity: number;
  readonly hemiSky: Rgb;
  readonly hemiGround: Rgb;
  readonly fogColor: Rgb;
  readonly fogDensity: number;
  readonly fogHeight: number;
  readonly skyHorizon: Rgb;
  readonly skyMid: Rgb;
  readonly skyZenith: Rgb;
  readonly cloudTint: Rgb;
  readonly cloudShadow: number;
  readonly stars: number;
  readonly lanterns: number;
  readonly envIntensity: number;
  readonly godRays: number;
  readonly clearSky: number;
}

export function srgbToLinear(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`daylight: "${hex}" is not #rrggbb`);
  const n = parseInt(m[1]!, 16);
  const ch = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)];
}

export function linearToHex(rgb: Rgb): string {
  const ch = (v: number): string => {
    const c = Math.max(0, Math.min(1, v));
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(s * 255).toString(16).padStart(2, "0");
  };
  return `#${ch(rgb[0])}${ch(rgb[1])}${ch(rgb[2])}`;
}

export function sunDirection(elevationDeg: number, azimuthDeg: number): Vec3 {
  const el = (elevationDeg * Math.PI) / 180, az = (azimuthDeg * Math.PI) / 180;
  return [-Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

export function frameOfKey(key: DaylightKey): DaylightFrame {
  const original = key.id === "original";
  return {
    key: key.id,
    blend: 1,
    sunDir: original ? ORIGINAL_LINEAR.sunDir : sunDirection(key.elevationDeg, key.azimuthDeg),
    sunColor: original ? ORIGINAL_LINEAR.sunColor : srgbToLinear(key.sun),
    sunIntensity: key.sunIntensity,
    engineSunIntensity: key.engineSunIntensity,
    hemiSky: original ? ORIGINAL_LINEAR.hemiSky : srgbToLinear(key.hemiSky),
    hemiGround: original ? ORIGINAL_LINEAR.hemiGround : srgbToLinear(key.hemiGround),
    fogColor: original ? ORIGINAL_LINEAR.fogColor : srgbToLinear(key.fog),
    fogDensity: key.fogDensity,
    fogHeight: key.fogHeight,
    skyHorizon: original ? ORIGINAL_LINEAR.skyHorizon : srgbToLinear(key.skyHorizon),
    skyMid: original ? ORIGINAL_LINEAR.skyMid : srgbToLinear(key.skyMid),
    skyZenith: original ? ORIGINAL_LINEAR.skyZenith : srgbToLinear(key.skyZenith),
    cloudTint: original ? ORIGINAL_LINEAR.cloudTint : srgbToLinear(key.cloudTint),
    cloudShadow: key.cloudShadow,
    stars: key.stars,
    lanterns: key.lanterns,
    envIntensity: key.envIntensity,
    godRays: key.godRays,
    clearSky: key.clearSky
  };
}

/** Which key the story is at: the epilogue, then the rung bell, then one key per letter found. */
export function daylightKeyFor(view: { readonly found: number; readonly complete: boolean; readonly epilogue: boolean }): number {
  if (view.epilogue) return 5;
  if (view.complete) return 4;
  return Math.max(0, Math.min(3, Math.floor(view.found)));
}

/** `?found=0..3|epilogue` (luma-target variants found0, found2, found3, epilogue): pins the daylight key; null when absent or invalid. */
export function parseFoundParam(value: string | null): number | null {
  if (value === null) return null;
  if (value === "epilogue") return 5;
  if (value === "bell") return 4;
  if (!/^[0-3]$/.test(value)) return null;
  return Number(value);
}

/**
 * GU47 look resolution. Phase 3 (4.7.1): the daytime keys were rebuilt after the blind panel (clear painted skies, 4.6
 * teal fog, the 4.6 follow framing in daylight, a daytime post, a traveller fill light), so the GU47 look is the default
 * for every view whose rebuilt frame the panel judged better than 4.6.2 (`GU47_DEFAULT_VIEWS`). A view outside that set
 * still opens in the 4.6 look (`?look=original` path). `?look=gu47` forces the new look anywhere; `?look=original` always wins.
 */
export const GU47_DEFAULT_VIEWS: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5]);
export function resolveLook(lookParam: string | null, foundKey: number | null): "original" | "gu47" {
  if (lookParam === "original") return "original";
  if (lookParam === "gu47") return "gu47";
  return GU47_DEFAULT_VIEWS.has(foundKey ?? 0) ? "gu47" : "original";
}

/** The dusk and night keys (the bell, the voyage): the storybook camera and the softer gouache post the panel chose. */
export function isDuskKey(keyIndex: number): boolean {
  return keyIndex >= 4;
}

export interface LookPost {
  /** Gouache paper pass strength (WW47-P3) and film grain: lighter by day, where the judges read them as a dull overcast. */
  readonly paper: number;
  readonly grain: number;
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly scatter: number; readonly color: string };
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly exposure: number };
  readonly vignette: { readonly intensity: number; readonly smoothness: number; readonly color: string };
}
/**
 * WW47-P1 per light: the dusk and night keys keep the gouache post (warm bloom on the lanterns and the moon glow, umber
 * vignette). Daylight gets a clean post (phase 3): a high bloom threshold so the bright sky and water do not bloom into
 * haze, a neutral bloom tint, a crisper grade and a lighter vignette.
 */
export const DAY_POST: LookPost = {
  paper: 0.015,
  grain: 0.008,
  bloom: { intensity: 0.3, threshold: 1.05, scatter: 0.55, color: "#fff6ea" },
  grade: { contrast: 1.14, saturation: 1.22, exposure: 1.07 },
  vignette: { intensity: 0.12, smoothness: 0.8, color: "#2a2418" }
};
export const DUSK_POST: LookPost = {
  paper: 0.04,
  grain: 0.02,
  bloom: { intensity: 0.42, threshold: 0.92, scatter: 0.55, color: "#ffe2b8" },
  grade: { contrast: 1.1, saturation: 1.14, exposure: 1.05 },
  vignette: { intensity: 0.16, smoothness: 0.75, color: "#3a2a1c" }
};
export function lookPostFor(keyIndex: number): LookPost {
  return isDuskKey(keyIndex) ? DUSK_POST : DAY_POST;
}

/** Traveller fill (phase 3, GU47 daylight only): a soft warm point light above and in front of the traveller, so the dark cloak reads against the meadow. */
export const TRAVELLER_FILL = { intensity: 9, distance: 6, color: "#fff0dc", up: 2.4, toward: 1.8 } as const;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Blends two frames: colours in linear light, the sun direction along the great circle (normalised lerp). */
export function blendFrames(a: DaylightFrame, b: DaylightFrame, t: number): DaylightFrame {
  const s = Math.max(0, Math.min(1, t));
  const d = mix3(a.sunDir, b.sunDir, s);
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return {
    key: b.key,
    blend: s,
    sunDir: [d[0] / len, d[1] / len, d[2] / len],
    sunColor: mix3(a.sunColor, b.sunColor, s),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity, s),
    engineSunIntensity: mix(a.engineSunIntensity, b.engineSunIntensity, s),
    hemiSky: mix3(a.hemiSky, b.hemiSky, s),
    hemiGround: mix3(a.hemiGround, b.hemiGround, s),
    fogColor: mix3(a.fogColor, b.fogColor, s),
    fogDensity: mix(a.fogDensity, b.fogDensity, s),
    fogHeight: mix(a.fogHeight, b.fogHeight, s),
    skyHorizon: mix3(a.skyHorizon, b.skyHorizon, s),
    skyMid: mix3(a.skyMid, b.skyMid, s),
    skyZenith: mix3(a.skyZenith, b.skyZenith, s),
    cloudTint: mix3(a.cloudTint, b.cloudTint, s),
    cloudShadow: mix(a.cloudShadow, b.cloudShadow, s),
    stars: mix(a.stars, b.stars, s),
    lanterns: mix(a.lanterns, b.lanterns, s),
    envIntensity: mix(a.envIntensity, b.envIntensity, s),
    godRays: mix(a.godRays, b.godRays, s),
    clearSky: mix(a.clearSky, b.clearSky, s)
  };
}

export interface DaylightDriver {
  /** Advance toward `keyIndex` by `dt` seconds; returns the frame to draw. */
  update(keyIndex: number, dt: number): DaylightFrame;
  /** Jump straight to a key (boot, reset, capture params). */
  snap(keyIndex: number): DaylightFrame;
  readonly frame: DaylightFrame;
  readonly target: number;
}

/**
 * Eases from the frame on screen to the target key over `seconds` (smoothstep). A new target mid-ease starts a fresh
 * ease from what is on screen, so the light never jumps. `original` pins the 4.6 row.
 */
export function createDaylightDriver(options: { readonly seconds?: number; readonly original?: boolean } = {}): DaylightDriver {
  const seconds = Math.max(1e-3, options.seconds ?? DAYLIGHT_EASE_SECONDS);
  const original = options.original === true;
  const frames = DAYLIGHT_KEYS.map(frameOfKey);
  const originalFrame = frameOfKey(ORIGINAL_KEY);
  const keyFrame = (i: number): DaylightFrame => (original ? originalFrame : frames[Math.max(0, Math.min(frames.length - 1, i))]!);
  let target = 0, from = keyFrame(0), elapsed = seconds, frame = from;
  return {
    get frame() { return frame; },
    get target() { return target; },
    snap(keyIndex) {
      target = keyIndex; from = keyFrame(keyIndex); elapsed = seconds; frame = from;
      return frame;
    },
    update(keyIndex, dt) {
      if (keyIndex !== target) { from = frame; target = keyIndex; elapsed = 0; }
      elapsed = Math.min(seconds, elapsed + Math.max(0, dt));
      frame = elapsed >= seconds ? keyFrame(target) : blendFrames(from, keyFrame(target), smooth(elapsed / seconds));
      return frame;
    }
  };
}
