/**
 * Splat Turf look table (§6.3): paint-world carnival — a white road under a plum-to-peach painted sky,
 * saturated trail paint that cycles every 25 m stretch, plum ink HUD. Presentation only; the sim never
 * reads this file, so replays and traces are look-independent.
 */
import { hexToLinear, sunDirection, type Rgb, type SkyStop } from "../../../examples/shared/runner-kit/index";

export const LOOK = {
  id: "splat-turf",
  background: "#ffd9a8",
  skyStops: [
    { t: 0, hex: "#4f2a8f" },
    { t: 0.4, hex: "#b06ae0" },
    { t: 0.72, hex: "#ff9fc8" },
    { t: 1, hex: "#ffd9a8" }
  ] as readonly SkyStop[],
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