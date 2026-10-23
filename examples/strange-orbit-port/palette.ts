/**
 * Strange Orbit pigment palette (ported from the original `src/palette.js`): each
 * stretch of the course blends three pigments (base, vein, chalk) that the track
 * shader mixes by the sampled texture's warmth and lightness. Colours are
 * returned in linear RGB, as three.js stores `Color` under colour management.
 */
import { smoothstep01, wrapS } from "./course";

export type Rgb = readonly [number, number, number];
export type Pigments = readonly [Rgb, Rgb, Rgb];

const hexToLinear = (hex: string): Rgb => {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s < 0.04045 ? s * (1 / 12.92) : Math.pow((s + 0.055) * (1 / 1.055), 2.4);
  };
  return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)];
};

const PALETTES: Readonly<Record<string, readonly [string, string, string]>> = {
  warm: ["#d98464", "#294e52", "#f3ddaf"],
  jade: ["#69bfb0", "#244f65", "#e8efcc"],
  violet: ["#8471b3", "#28325b", "#c8d0ef"],
  night: ["#628cce", "#293f6b", "#d0e0f1"],
  opal: ["#d2c5d9", "#665478", "#f6edd7"]
};

const LINEAR: Readonly<Record<string, Pigments>> = Object.fromEntries(
  Object.entries(PALETTES).map(([name, colors]) => [name, colors.map(hexToLinear) as unknown as Pigments])
);

/** Palette breakpoints along the orbit: [distance, palette name]. */
export const PALETTE_STOPS: readonly (readonly [number, string])[] = [
  [0, "warm"], [275, "warm"], [320, "violet"], [555, "violet"], [610, "warm"], [1125, "warm"],
  [1180, "jade"], [1212, "opal"], [1247, "violet"], [1280, "opal"], [1305, "jade"], [1360, "warm"], [1450, "warm"]
];

function segmentAt(s: number): { from: readonly [number, string]; to: readonly [number, string]; blend: number } {
  const t = wrapS(s);
  let n = 0;
  while (n < PALETTE_STOPS.length - 2 && t > PALETTE_STOPS[n + 1]![0]) n++;
  const from = PALETTE_STOPS[n]!;
  const to = PALETTE_STOPS[n + 1]!;
  return { from, to, blend: smoothstep01((t - from[0]) / (to[0] - from[0])) };
}

/** [base, vein, chalk] pigments at distance `s` (linear RGB). */
export function pigmentsAt(s: number): Pigments {
  const { from, to, blend } = segmentAt(s);
  const a = LINEAR[from[1]]!;
  const b = LINEAR[to[1]]!;
  const mix = (i: number): Rgb => [
    a[i]![0] + (b[i]![0] - a[i]![0]) * blend,
    a[i]![1] + (b[i]![1] - a[i]![1]) * blend,
    a[i]![2] + (b[i]![2] - a[i]![2]) * blend
  ];
  return [mix(0), mix(1), mix(2)];
}

/** 1 where the original painted surface should show (warm stretches), 0 where pigments take over. */
export function paintOriginalAt(s: number): number {
  const { from, to, blend } = segmentAt(s);
  return (from[1] === "warm" ? 1 - blend : 0) + (to[1] === "warm" ? blend : 0);
}

export const hexLinear = hexToLinear;
