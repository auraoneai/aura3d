/**
 * D3 wetness + lightning descriptors (PRD D3 box 2).
 *
 * Pure deterministic helpers driven by `createWeatherState`:
 * - albedo darkening + roughness response for a wetness uniform in [0, 1],
 * - puddle-mask sampling over `WeatherPuddlePatch` discs,
 * - lightning-flash envelope for the thunderstorm light hook.
 *
 * The rendered wetness path applies these values to ordinary PBR material
 * inputs (base color multiplied down, roughness scaled down); no new shader
 * claim is made here.
 */

import { createWeatherState, type WeatherPuddlePatch, type WeatherState, type WeatherType } from "./Weather";

export interface WetnessMaterialResponse {
  /** Wetness in [0, 1] taken from the weather state. */
  readonly wetness: number;
  /** Darkened base color hex. */
  readonly albedoColor: string;
  /** Roughness after the wet response (never above the dry input). */
  readonly roughness: number;
  /** Mean puddle-mask value over the sampled patches in [0, 1]. */
  readonly puddleMask: number;
}

export interface LightningFlashSample {
  readonly elapsedSeconds: number;
  /** Flash intensity in [0, 1]; 0 unless the weather type is thunderstorm. */
  readonly intensity: number;
}

export interface WetnessProbe {
  readonly weather: WeatherState;
  readonly response: WetnessMaterialResponse;
  readonly flash: LightningFlashSample;
}

/**
 * Describe the wet look for one ground material under a weather type.
 * `dryColor` is a `#rrggbb` hex string; `dryRoughness` is in [0, 1].
 */
export function describeWetMaterial(options: {
  readonly type?: WeatherType;
  readonly dryColor?: string;
  readonly dryRoughness?: number;
  readonly elapsedSeconds?: number;
  readonly seed?: number;
}): WetnessProbe {
  const type = options.type ?? "rain";
  const dryColor = options.dryColor ?? "#5b6b4f";
  const dryRoughness = clamp(options.dryRoughness ?? 0.9, 0, 1);
  const elapsedSeconds = Math.max(0, options.elapsedSeconds ?? 1);
  const seed = Math.floor(options.seed ?? 0xd3e7);
  const weather = createWeatherState({ type, elapsedSeconds, seed });
  const albedoColor = applyWetnessToColor(dryColor, weather.wetness);
  const roughness = applyWetnessToRoughness(dryRoughness, weather.wetness);
  const puddleMask = weather.puddlePatches.length === 0
    ? 0
    : Number((weather.puddlePatches.reduce((sum, patch) => sum + Math.min(1, patch.depth * 2), 0) /
      weather.puddlePatches.length).toFixed(4));
  return {
    weather,
    response: { wetness: weather.wetness, albedoColor, roughness, puddleMask },
    flash: sampleLightningFlash({ type, elapsedSeconds, seed })
  };
}

/** Multiply a hex albedo toward dark by up to 45% at full wetness. */
export function applyWetnessToColor(hex: string, wetness: number): string {
  const wet = clamp(wetness, 0, 1);
  const rgb = parseHex(hex);
  const factor = 1 - 0.45 * wet;
  return rgbToHex([rgb[0] * factor, rgb[1] * factor, rgb[2] * factor]);
}

/** Scale roughness down by up to 55% at full wetness (never increases). */
export function applyWetnessToRoughness(dryRoughness: number, wetness: number): number {
  const wet = clamp(wetness, 0, 1);
  return Number((clamp(dryRoughness, 0, 1) * (1 - 0.55 * wet)).toFixed(4));
}

/** Smooth puddle-mask falloff over patch discs at a ground sample point. */
export function samplePuddleMask(patches: readonly WeatherPuddlePatch[], x: number, z: number): number {
  let mask = 0;
  for (const patch of patches) {
    const distance = Math.hypot(x - patch.x, z - patch.z);
    const t = 1 - distance / Math.max(1e-6, patch.radius * 1.6);
    if (t > 0) mask = Math.max(mask, t * t * (3 - 2 * t));
  }
  return Number(clamp(mask, 0, 1).toFixed(4));
}

/**
 * Deterministic lightning-flash envelope. Non-thunderstorm types always
 * return 0; thunderstorms return sparse sub-second spikes usable as a light
 * intensity hook.
 */
export function sampleLightningFlash(options: {
  readonly type: WeatherType;
  readonly elapsedSeconds: number;
  readonly seed?: number;
}): LightningFlashSample {
  const elapsedSeconds = Math.max(0, options.elapsedSeconds);
  if (options.type !== "thunderstorm") return { elapsedSeconds, intensity: 0 };
  const seed = Math.floor(options.seed ?? 0xd3e7);
  const windowIndex = Math.floor(elapsedSeconds * 2);
  const strike = seeded01(seed ^ (windowIndex * 0x9e3779b9)) > 0.62;
  if (!strike) return { elapsedSeconds, intensity: 0 };
  const phase = elapsedSeconds * 2 - windowIndex;
  const envelope = Math.exp(-phase * 9) * (0.55 + 0.45 * Math.sin(phase * 40));
  return { elapsedSeconds, intensity: Number(clamp(envelope, 0, 1).toFixed(4)) };
}

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match?.[1]) throw new RangeError(`Wetness albedo must be a #rrggbb hex string, got "${hex}".`);
  const value = match[1];
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function rgbToHex(rgb: readonly [number, number, number]): string {
  const toHex = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

function seeded01(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 10_000) / 10_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
