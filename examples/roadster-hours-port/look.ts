/**
 * Per-route look: sun, sky, ambient, terrain palette and post settings. The numbers follow the measured light rig of the
 * original (warm-white key at ~29 degrees elevation ahead-left, cool low fill from behind, ACES at 0.87 exposure, no fog
 * term, bright HDR sky) and the route colours in `data.ts`; the art itself (sky dome, ocean, rock, asphalt) is procedural.
 * Lateral +l is to the right of travel and the road runs toward -z.
 */
import type { Rgb } from "./materials";

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const hexLinear = (hex: number): Rgb => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const norm = (v: readonly [number, number, number]): [number, number, number] => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

export type TerrainStyle = "coast" | "canyon" | "skyway";

export interface Look {
  readonly id: string;
  readonly style: TerrainStyle;
  /** Side of the road (sign of lateral l) where the sea / drop is; the other side rises as cliffs. */
  readonly seaSide: -1 | 1;
  readonly night: number;
  readonly sunDir: [number, number, number];
  readonly sunColor: Rgb;
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  readonly ambSky: Rgb;
  readonly ambGround: Rgb;
  readonly cloudAmount: number;
  readonly fogNear: number;
  readonly fogFar: number;
  /** Colour handed to the engine's own fog (lit vehicles) so it meets the shader haze. */
  readonly engineFog: string;
  readonly engineFogDensity: number;
  readonly asphalt: Rgb;
  readonly roadGloss: number;
  readonly rockA: Rgb;
  readonly rockB: Rgb;
  readonly grass: Rgb;
  readonly sand: Rgb;
  readonly deepWater: Rgb;
  readonly shallowWater: Rgb;
  readonly beam: number;
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly radius: number };
  readonly grade: { readonly exposure: number; readonly contrast: number; readonly saturation: number };
  readonly vignette: number;
  readonly keyLight: { readonly color: string; readonly intensity: number };
  readonly fillLight: { readonly color: string; readonly intensity: number };
  readonly envIntensity: number;
}

const rgb = (hex: number, k = 1): Rgb => scale(hexLinear(hex), k);

export const LOOKS: Readonly<Record<string, Look>> = {
  sunbreak: {
    id: "sunbreak", style: "coast", seaSide: -1, night: 0,
    sunDir: norm([-0.78, 0.4, -0.5]), sunColor: rgb(0xffe4ad, 3.4),
    zenith: rgb(0x2f6fbf), horizon: rgb(0xc9dfe6), ambSky: rgb(0x7fb0e0, 0.5), ambGround: rgb(0xb59a76, 0.22),
    cloudAmount: 0.75, fogNear: 140, fogFar: 2000, engineFog: "#c9dfe6", engineFogDensity: 0.00045,
    asphalt: [0.04, 0.052, 0.085], roadGloss: 0.5,
    rockA: rgb(0xcbb98a, 0.62), rockB: rgb(0x9b8860, 0.6), grass: rgb(0xb59a48, 0.62), sand: rgb(0xe0cf9c, 0.68),
    deepWater: rgb(0x0b4a6e, 0.9), shallowWater: rgb(0x1fa5a8, 0.85),
    beam: 0.35, bloom: { intensity: 0.42, threshold: 0.88, radius: 0.55 }, grade: { exposure: 1.0, contrast: 1.08, saturation: 1.12 }, vignette: 0.22,
    keyLight: { color: "#fff0cf", intensity: 3.2 }, fillLight: { color: "#9db8e8", intensity: 0.7 }, envIntensity: 0.9
  },
  redline: {
    id: "redline", style: "canyon", seaSide: -1, night: 0,
    sunDir: norm([-0.55, 0.22, -0.8]), sunColor: rgb(0xffc98a, 3.8),
    zenith: rgb(0x3d5f9c), horizon: rgb(0xe8bd96), ambSky: rgb(0x9fb2d0, 0.45), ambGround: rgb(0xb06a45, 0.28),
    cloudAmount: 0.45, fogNear: 110, fogFar: 1700, engineFog: "#e8bd96", engineFogDensity: 0.00058,
    asphalt: [0.1, 0.075, 0.07], roadGloss: 0.7,
    rockA: rgb(0xc4562f, 0.62), rockB: rgb(0x7a2f1d, 0.58), grass: rgb(0x8a7a3a, 0.4), sand: rgb(0xd0996a, 0.62),
    deepWater: rgb(0x1a4f66, 0.8), shallowWater: rgb(0x3f9aa0, 0.8),
    beam: 0.5, bloom: { intensity: 0.5, threshold: 0.85, radius: 0.6 }, grade: { exposure: 1.0, contrast: 1.1, saturation: 1.15 }, vignette: 0.26,
    keyLight: { color: "#ffd2a0", intensity: 3.5 }, fillLight: { color: "#b09a8a", intensity: 0.6 }, envIntensity: 0.8
  },
  halo: {
    id: "halo", style: "skyway", seaSide: -1, night: 1,
    sunDir: norm([0.35, 0.55, -0.75]), sunColor: rgb(0xbcc9ff, 0.55),
    zenith: rgb(0x050b1c), horizon: rgb(0x22345f), ambSky: rgb(0x3a5a96, 0.2), ambGround: rgb(0x141c34, 0.25),
    cloudAmount: 0, fogNear: 90, fogFar: 1300, engineFog: "#1b2a4e", engineFogDensity: 0.0008,
    asphalt: [0.035, 0.04, 0.06], roadGloss: 0.4,
    rockA: rgb(0x20283c, 0.7), rockB: rgb(0x121826, 0.7), grass: rgb(0x18221f, 0.6), sand: rgb(0x2a3144, 0.7),
    deepWater: rgb(0x050b1a, 1), shallowWater: rgb(0x0e2744, 1),
    beam: 1.6, bloom: { intensity: 0.85, threshold: 0.7, radius: 0.7 }, grade: { exposure: 1.1, contrast: 1.1, saturation: 1.1 }, vignette: 0.32,
    keyLight: { color: "#b4c4ff", intensity: 0.9 }, fillLight: { color: "#4766b8", intensity: 0.5 }, envIntensity: 0.55
  }
};
