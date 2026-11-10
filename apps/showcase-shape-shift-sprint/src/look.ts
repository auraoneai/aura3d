/**
 * Shape Shift Sprint look identity (PRD §6.3): candy primaries on cream, per-shape colour coding
 * (sphere red / cube yellow / cone blue), day gradient sky with a cream horizon, and 6 Toybox Worlds
 * that smoothly transition at each 750-point milestone. Signature effects: morph burst + shape-confetti
 * trail, hole rims glow on match. Colours here are sRGB hex; linear versions for shaders come from
 * the kit's `hexToLinear`.
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
  rimGlow: 0.42,
  rimGlowMatched: 1.05,
  /** Shape-confetti trail: chips dropped behind the player per second while playing. */
  confettiTrailRate: 16,
  morphBurstSeconds: 0.6
} as const;

export interface ToyboxWorldPalette {
  readonly name: string;
  readonly zenith: string;
  readonly mid: string;
  readonly low: string;
  readonly fog: string;
  readonly fogLow: string;
  readonly sunTint: string;
}

/** Six milestone Toybox Worlds cycling every 750 points while keeping the cream track + candy primaries crisp. */
export const TOYBOX_WORLDS: readonly ToyboxWorldPalette[] = [
  {
    name: "Candy Skyway",
    zenith: "#1e6edb",
    mid: "#59aef0",
    low: "#bae0fa",
    fog: "#f8d8c0",
    fogLow: "#dad1f0",
    sunTint: "#fff1d8"
  },
  {
    name: "Mint Cloudworks",
    zenith: "#157e8a",
    mid: "#4bc4c4",
    low: "#c2f2ea",
    fog: "#f4e6d2",
    fogLow: "#ccebe6",
    sunTint: "#f6ffe6"
  },
  {
    name: "Carousel Sunset",
    zenith: "#3a4ec9",
    mid: "#8e7be8",
    low: "#ffd3ba",
    fog: "#f9d0b4",
    fogLow: "#e4c9eb",
    sunTint: "#ffe2bd"
  },
  {
    name: "Berry Sorbet Bay",
    zenith: "#2d5cd4",
    mid: "#6da4f2",
    low: "#f6d4ea",
    fog: "#fae0d4",
    fogLow: "#e2cef2",
    sunTint: "#ffeaf2"
  },
  {
    name: "Starlight Toybox",
    zenith: "#1c49a8",
    mid: "#4c8be0",
    low: "#b9dcf7",
    fog: "#f2decb",
    fogLow: "#cbd4f2",
    sunTint: "#eaf4ff"
  },
  {
    name: "Prism Crown",
    zenith: "#2466d8",
    mid: "#64b6f5",
    low: "#d7eefc",
    fog: "#faebd4",
    fogLow: "#dcd8f5",
    sunTint: "#fff5dc"
  }
] as const;

export interface ToyboxWorldLinear {
  readonly name: string;
  readonly zenith: Rgb;
  readonly mid: Rgb;
  readonly low: Rgb;
  readonly fog: Rgb;
  readonly fogLow: Rgb;
  readonly sunTint: Rgb;
}

const WORLDS_LINEAR: readonly ToyboxWorldLinear[] = TOYBOX_WORLDS.map((w) => ({
  name: w.name,
  zenith: hexToLinear(w.zenith),
  mid: hexToLinear(w.mid),
  low: hexToLinear(w.low),
  fog: hexToLinear(w.fog),
  fogLow: hexToLinear(w.fogLow),
  sunTint: hexToLinear(w.sunTint)
}));

const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

/** Smoothly sample the active Toybox World palette from a continuous milestone blend cursor. */
export function sampleToyboxWorld(cursor: number): ToyboxWorldLinear {
  const n = WORLDS_LINEAR.length;
  const safe = Math.max(0, cursor);
  const idx0 = Math.floor(safe) % n;
  const idx1 = (idx0 + 1) % n;
  const frac = safe - Math.floor(safe);
  const smooth = frac * frac * (3 - 2 * frac);
  const a = WORLDS_LINEAR[idx0]!;
  const b = WORLDS_LINEAR[idx1]!;
  return {
    name: frac < 0.5 ? a.name : b.name,
    zenith: lerpRgb(a.zenith, b.zenith, smooth),
    mid: lerpRgb(a.mid, b.mid, smooth),
    low: lerpRgb(a.low, b.low, smooth),
    fog: lerpRgb(a.fog, b.fog, smooth),
    fogLow: lerpRgb(a.fogLow, b.fogLow, smooth),
    sunTint: lerpRgb(a.sunTint, b.sunTint, smooth)
  };
}

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
