/**
 * Splat Turf look table (§6.3): paint-world carnival — a white road under a plum-to-peach painted sky,
 * saturated trail paint that cycles every 25 m stretch, plum ink HUD. Presentation only; the sim never
 * reads this file, so replays and traces are look-independent.
 */
import { hexToLinear, sunDirection, type Rgb, type SkyStop } from "../../../examples/shared/runner-kit/index";

export const LOOK = {
  id: "splat-turf",
  background: "#ffc2bc",
  /** Sunset dome: violet zenith, rose band, gold horizon line (t = 0.5 is the horizon). */
  skyStops: [
    { t: 0, hex: "#2c1866" },
    { t: 0.28, hex: "#6a3fb8" },
    { t: 0.43, hex: "#d47acc" },
    { t: 0.49, hex: "#ffaab4" },
    { t: 0.52, hex: "#ffd0a0" },
    { t: 0.6, hex: "#f6aac2" },
    { t: 1, hex: "#b98ad6" }
  ] as readonly SkyStop[],
  /** Horizon haze every lit surface fades towards (matches the sky's horizon band). */
  haze: "#ffbcbc",
  /** Low sun ahead and to the right of the run (world direction), warm white. */
  sunDir: [0.42, 0.1, -1] as readonly [number, number, number],
  sunColor: "#fff0c8",
  /** Lavender keel under the deck: the road reads as a floating ribbon. */
  keel: "#a88ad8",
  post: {
    bloom: { intensity: 0.55, threshold: 0.9, scatter: 0.6 },
    grade: { contrast: 1.08, saturation: 1.1, temperature: 0.03, gain: 1 },
    vignette: { intensity: 0.24, color: "#3a2148" }
  },
  road: "#ffffff",
  roadEdge: "#3b1f47",
  ball: "#ff3d8b",
  can: "#ffb400",
  solvent: "#14c9c9",
  eraser: "#8a8a99",
  finish: "#ffb400",
  ink: "#3b1f47",
  paper: "#fff8f2",
  wipeWash: "#bff2f2",
  /** Soft turf the road runs across (horizon and motion read). */
  turf: "#9fe0c4",
  /** Trail paint cycles per 25 m stretch so the coverage map reads as a carnival rainbow. */
  paintColors: ["#ff3d8b", "#ffb400", "#14c9c9", "#7a4fd0", "#5fd400", "#ff6a00"] as readonly string[],
  sun: sunDirection(55, 25)
} as const;

export const linear = (hex: string): Rgb => hexToLinear(hex);

/** Deterministic per-cell trail colour (no RNG: presentation must never consume gameplay draws). */
export function paintColorFor(row: number): string {
  const n = LOOK.paintColors.length;
  return LOOK.paintColors[Math.floor(Math.max(0, row) / 25) % n] as string;
}

/** Normalised pixel crops for the remote browser spec (chase camera keeps these bands stable). */
export const QA_CROPS = {
  sky: [0, 0, 1, 0.3],
  road: [0.2, 0.65, 0.8, 1],
  player: [0.35, 0.5, 0.65, 0.8],
  entity: [0.2, 0.3, 0.8, 0.65]
} as const;