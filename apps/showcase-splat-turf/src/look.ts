/**
 * Splat Turf look table: sunlit urban skate-arena & art-park causeway — warm gesso concrete deck under a
 * crisp cobalt-to-cream sunlit sky, glossy clearcoat acrylic trail pigments cycling every 25 m stretch,
 * and high-contrast plum-on-cream AuraOne territory HUD. Presentation only; the sim never reads this file,
 * so replays and traces remain 100% look-independent.
 */
import { hexSrgb, hexToLinear, sunDirection, type Rgb, type SkyStop } from "../../../examples/shared/runner-kit/index";

export const LOOK = {
  id: "splat-turf",
  background: "#bfe4ff",
  /** Sunlit outdoor sky dome: crisp cobalt zenith, azure mid-sky, sunlit cream horizon aligned to chase pitch. */
  skyStops: [
    { t: 0, hex: "#1557c0" },
    { t: 0.34, hex: "#287be0" },
    { t: 0.48, hex: "#4fa4f6" },
    { t: 0.57, hex: "#8fd2ff" },
    { t: 0.64, hex: "#fff3da" },
    { t: 0.74, hex: "#c6e6fa" },
    { t: 1, hex: "#86bbe8" }
  ] as readonly SkyStop[],
  /** Sunlit atmospheric horizon haze every distant surface melts towards. */
  haze: "#d8eeff",
  /** Sunlit highlight direction ahead of the run (sky sun disc + clearcoat specular lobe). */
  sunDir: [-0.36, 0.52, -0.77] as readonly [number, number, number],
  sunColor: "#fff7de",
  /** Architectural skate-park slate underside beneath the floating gesso deck. */
  keel: "#584476",
  post: {
    bloom: { intensity: 0.3, threshold: 0.86, scatter: 0.58 },
    grade: { contrast: 1.06, saturation: 1.08, vibrance: 0.08, temperature: 0.02, gain: 1 },
    vignette: { intensity: 0.14, color: "#2b1c3d" }
  },
  road: "#ffffff",
  roadEdge: "#34224a",
  ball: "#ff2e88",
  can: "#ffb000",
  solvent: "#0ec8d8",
  eraser: "#687086",
  finish: "#ffb000",
  ink: "#3b1f47",
  paper: "#fff8f2",
  wipeWash: "#bff4f8",
  /** Sunlit park turf on floating roadside islets. */
  turf: "#72dca8",
  /** Glossy clearcoat acrylic pigments cycling per 25 m stretch. */
  paintColors: ["#ff2e88", "#ffb000", "#0ec8d8", "#7b4dff", "#4ad620", "#ff6218"] as readonly string[],
  sun: sunDirection(48, -32)
} as const;

export const linear = (hex: string): Rgb => hexToLinear(hex);

export function hexToRgba8(hex: string, alpha = 255): readonly [number, number, number, number] {
  const [r, g, b] = hexSrgb(hex);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), alpha];
}

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
