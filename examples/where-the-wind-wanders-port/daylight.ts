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
}

/** Seconds the look takes to move from one key to the next. */
export const DAYLIGHT_EASE_SECONDS = 6;

export const DAYLIGHT_KEYS: readonly DaylightKey[] = [
  { id: "found0", clock: "15:30", label: "warm afternoon", elevationDeg: 34, azimuthDeg: 62, sun: "#ffe4bf", sunIntensity: 1.22, engineSunIntensity: 2.6, hemiSky: "#c9dcc0", hemiGround: "#3c4a26", fog: "#bccdb6", fogDensity: 0.0032, fogHeight: 0, skyHorizon: "#e6e2c8", skyMid: "#9ec2d2", skyZenith: "#5a8db8", cloudTint: "#fff4e2", cloudShadow: 0.3, stars: 0, lanterns: 0, envIntensity: 0.55, godRays: 0.12 },
  { id: "found1", clock: "16:30", label: "late afternoon", elevationDeg: 28, azimuthDeg: 64, sun: "#ffd9a8", sunIntensity: 1.2, engineSunIntensity: 2.5, hemiSky: "#c6d6bb", hemiGround: "#3f4826", fog: "#c4cdb2", fogDensity: 0.0033, fogHeight: 0.15, skyHorizon: "#ecdcbc", skyMid: "#a4c0cc", skyZenith: "#5b88b0", cloudTint: "#ffeccf", cloudShadow: 0.32, stars: 0, lanterns: 0, envIntensity: 0.52, godRays: 0.16 },
  { id: "found2", clock: "17:30", label: "apricot light", elevationDeg: 22, azimuthDeg: 66, sun: "#ffc58a", sunIntensity: 1.16, engineSunIntensity: 2.3, hemiSky: "#c3ccb0", hemiGround: "#433f24", fog: "#cec6a6", fogDensity: 0.0035, fogHeight: 0.35, skyHorizon: "#f2cfa2", skyMid: "#aab8c0", skyZenith: "#5a7fa6", cloudTint: "#ffe0b8", cloudShadow: 0.34, stars: 0, lanterns: 0.25, envIntensity: 0.48, godRays: 0.2 },
  { id: "found3", clock: "18:30", label: "golden hour", elevationDeg: 16, azimuthDeg: 68, sun: "#ffb26a", sunIntensity: 1.1, engineSunIntensity: 2.1, hemiSky: "#bdbfa4", hemiGround: "#47391f", fog: "#d4bb94", fogDensity: 0.0037, fogHeight: 0.6, skyHorizon: "#f6be86", skyMid: "#b0a8b0", skyZenith: "#55709a", cloudTint: "#ffcf98", cloudShadow: 0.35, stars: 0, lanterns: 0.6, envIntensity: 0.42, godRays: 0.24 },
  { id: "bell", clock: "19:40", label: "lilac dusk", elevationDeg: 6, azimuthDeg: 70, sun: "#ff9c74", sunIntensity: 0.72, engineSunIntensity: 1.2, hemiSky: "#9c98b4", hemiGround: "#2e2a26", fog: "#a89cb0", fogDensity: 0.0042, fogHeight: 0.85, skyHorizon: "#e8a888", skyMid: "#9c8cb0", skyZenith: "#3e4c7c", cloudTint: "#e6a8a0", cloudShadow: 0.2, stars: 0.35, lanterns: 1, envIntensity: 0.3, godRays: 0.1 },
  { id: "epilogue", clock: "21:30", label: "moonlit voyage", elevationDeg: 38, azimuthDeg: -40, sun: "#b4c4ff", sunIntensity: 0.34, engineSunIntensity: 0.55, hemiSky: "#56628c", hemiGround: "#1a1c24", fog: "#4a5470", fogDensity: 0.004, fogHeight: 0.7, skyHorizon: "#4c5680", skyMid: "#283460", skyZenith: "#101838", cloudTint: "#7c88b0", cloudShadow: 0.12, stars: 1, lanterns: 1, envIntensity: 0.16, godRays: 0 }
];

/** `?look=original`: the 4.6 constants (SUN_DIR (-0.468, 0.802, 0.374), linear SUN_COL (1, 0.831, 0.429), ...). */
export const ORIGINAL_KEY: DaylightKey = {
  id: "original", clock: "12:00", label: "4.6 midday", elevationDeg: 53.32, azimuthDeg: 51.37, sun: "#ffedae", sunIntensity: 1.3, engineSunIntensity: 0,
  hemiSky: "#e5f2cf", hemiGround: "#395730", fog: "#b4d4cf", fogDensity: 0.003, fogHeight: 0, skyHorizon: "#cbe7ef", skyMid: "#7bb4f1", skyZenith: "#3c7cdc",
  cloudTint: "#ffffff", cloudShadow: 0, stars: 0, lanterns: 0, envIntensity: 0, godRays: 0
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
    godRays: key.godRays
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
 * GU47 blind-panel fallback: the panel judged the GU47 look better only at the bell (lilac dusk) and the epilogue
 * (moonlit voyage); every daylight beat (found0..3, the default boot) read worse than 4.6.2. So the game boots the 4.6
 * look unless `?look=gu47` asks for the new one, and a capture pinned to the bell or the epilogue (`?found=bell|epilogue`)
 * keeps the GU47 look. `?look=original` always wins.
 */
export function resolveLook(lookParam: string | null, foundKey: number | null): "original" | "gu47" {
  if (lookParam === "original") return "original";
  if (lookParam === "gu47") return "gu47";
  return foundKey !== null && foundKey >= 4 ? "gu47" : "original";
}

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
    godRays: mix(a.godRays, b.godRays, s)
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
