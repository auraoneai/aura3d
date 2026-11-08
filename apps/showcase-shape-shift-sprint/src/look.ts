/**
 * Shape Shift Sprint look identity (PRD §6.3): candy primaries on cream, per-shape colour coding
 * (sphere red / cube yellow / cone blue), day gradient sky with a cream horizon. Signature effects:
 * morph burst + shape-confetti trail, hole rims glow on match. Colours here are sRGB hex; linear
 * versions for shaders come from the kit's `hexToLinear`.
 */
import { hexToLinear, hexSrgb, sunDirection, type Rgb, type SkyStop } from "../../../examples/shared/runner-kit/index";

export { hexSrgb, hexToLinear, sunDirection, type Rgb };

export const LOOK = {
  /** Per-shape candy primaries: sphere red, cube yellow, cone blue. */
  shapes: ["#e8453c", "#f7c531", "#2f6fe4"],
  shapeNames: ["sphere", "cube", "cone"],
  road: "#f7ecd9",
  roadEdge: "#e9d7ba",
  wallPanel: "#fdf6ea",
  wallShadow: "#d9c5a4",
  tokenColors: { morph: "#ffffff", wildcard: "#b45ae8", shield: "#2fbf9b", x2: "#f2a516" },
  cloud: "#ffffff",
  ink: "#1f2a44",
  paper: "#fff6e8",
  accent: "#e8453c",
  gold: "#8a5e06",
  good: "#166a52",
  bad: "#c0271f",
  skyStops: [
    { t: 0, hex: "#2e9be6" },
    { t: 0.45, hex: "#7cc8f2" },
    { t: 0.78, hex: "#cfeaf7" },
    { t: 1, hex: "#fdf3df" }
  ] as readonly SkyStop[],
  sun: { elevationDeg: 55, azimuthDeg: 20 },
  /** Rim glow: emissive boost applied to the hole rim the player can currently fit through. */
  rimGlow: 0.35,
  rimGlowMatched: 0.9,
  /** Shape-confetti trail: chips dropped behind the player per second while playing. */
  confettiTrailRate: 14,
  morphBurstSeconds: 0.6
} as const;

export const SHAPE_LINEAR: readonly Rgb[] = LOOK.shapes.map(hexToLinear);
export const ROAD_LINEAR: Rgb = hexToLinear(LOOK.road);
export const WALL_LINEAR: Rgb = hexToLinear(LOOK.wallPanel);
export const CLOUD_LINEAR: Rgb = hexToLinear(LOOK.cloud);
export const TOKEN_LINEAR: Record<keyof typeof LOOK.tokenColors, Rgb> = {
  morph: hexToLinear(LOOK.tokenColors.morph),
  wildcard: hexToLinear(LOOK.tokenColors.wildcard),
  shield: hexToLinear(LOOK.tokenColors.shield),
  x2: hexToLinear(LOOK.tokenColors.x2)
};
export const SUN_DIRECTION: Rgb = sunDirection(LOOK.sun.elevationDeg, LOOK.sun.azimuthDeg);