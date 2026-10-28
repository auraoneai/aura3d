/**
 * Three.js r185 reference for the exposure-parity fixtures (PRD 3.2).
 *
 * With legacy lights gone (r155+), a punctual/directional light of intensity I
 * on a Lambert surface of linear albedo A, facing the light, produces
 * `A * I / PI` linear radiance; ambient and hemisphere irradiance take the same
 * `/ PI` through BRDF_Lambert. `MeshStandardMaterial` at roughness 1 adds a
 * dielectric specular lobe of well under 1%, which the tolerance absorbs.
 */

export const THREE_RECIPROCAL_PI = 1 / Math.PI;

export function srgbHexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (byte: number): number => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((n >> 16) & 255), channel((n >> 8) & 255), channel(n & 255)];
}

export function linearToSrgbChannel(value: number): number {
  const c = Math.min(1, Math.max(0, value));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Linear radiance leaving a head-on Lambert surface for one nominal light. */
export function threeLambertLinear(albedoHex: string, intensity: number, lightHex = "#ffffff"): [number, number, number] {
  const a = srgbHexToLinear(albedoHex);
  const l = srgbHexToLinear(lightHex);
  return [a[0] * l[0] * intensity * THREE_RECIPROCAL_PI, a[1] * l[1] * intensity * THREE_RECIPROCAL_PI, a[2] * l[2] * intensity * THREE_RECIPROCAL_PI];
}

/**
 * MeshStandardMaterial roughness 1 head-on dielectric lobe per unit radiance:
 * F(0.04) * D_GGX(alpha 1) * V_SmithCorrelated(alpha 1) = 0.04 * (1 / PI) * 0.25.
 */
export const THREE_DIELECTRIC_LOBE_ROUGH1 = 0.04 * (1 / Math.PI) * 0.25;

type Vec3 = [number, number, number];
const mul = (m: readonly number[], v: Vec3): Vec3 => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]
];
// Row-major transposes of the column-major GLSL mat3 constants in three's ACESFilmicToneMapping.
const ACES_IN = [0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777];
const ACES_OUT = [1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602];
const rrt = (v: number): number => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);

/** three.js ACESFilmicToneMapping at `toneMappingExposure = exposure`, per channel, returns display-linear. */
export function threeAcesFilmic(color: Vec3, exposure = 1): Vec3 {
  const scaled: Vec3 = [color[0] * exposure / 0.6, color[1] * exposure / 0.6, color[2] * exposure / 0.6];
  const c = mul(ACES_IN, scaled);
  const r: Vec3 = [rrt(c[0]), rrt(c[1]), rrt(c[2])];
  const out = mul(ACES_OUT, r);
  return [Math.min(1, Math.max(0, out[0])), Math.min(1, Math.max(0, out[1])), Math.min(1, Math.max(0, out[2]))];
}

/** Rec.709 luma of an sRGB-encoded 0..255 triple. */
export function lumaOfSrgb255(rgb: readonly [number, number, number]): number {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

export function threeAcesLuma255(linear: Vec3, exposure = 1): number {
  const t = threeAcesFilmic(linear, exposure);
  return lumaOfSrgb255([linearToSrgbChannel(t[0]) * 255, linearToSrgbChannel(t[1]) * 255, linearToSrgbChannel(t[2]) * 255]);
}

export interface ExposureCase {
  readonly id: string;
  readonly light: "directional" | "ambient" | "hemisphere" | "none" | "ambient+directional" | "hemisphere+directional";
  readonly intensity: number;
  readonly albedo: string;
  readonly lightColor?: string;
  /** Adds an inert bloom so the frame takes the HDR post path instead of the direct path (same lights, same expected output). */
  readonly post?: boolean;
}

/** Five light/albedo pairs plus zero-light and ambient/hemisphere probes. Linear outputs all stay below 1. */
export const EXPOSURE_CASES: readonly ExposureCase[] = [
  { id: "dir-1-grey", light: "directional", intensity: 1, albedo: "#808080" },
  { id: "dir-2.2-warm", light: "directional", intensity: 2.2, albedo: "#cc8844", lightColor: "#fff4e0" },
  { id: "dir-3-white", light: "directional", intensity: 3, albedo: "#ffffff" },
  { id: "dir-0.5-blue", light: "directional", intensity: 0.5, albedo: "#4488cc" },
  { id: "dir-2-green", light: "directional", intensity: 2, albedo: "#6f8a5a" },
  { id: "dir-1-grey+hdrpath", light: "directional", intensity: 1, albedo: "#808080", post: true },
  { id: "dir-2.2-warm+hdrpath", light: "directional", intensity: 2.2, albedo: "#cc8844", lightColor: "#fff4e0", post: true },
  { id: "none-grey", light: "none", intensity: 0, albedo: "#808080" },
  { id: "amb-1-grey", light: "ambient", intensity: 1, albedo: "#808080" },
  { id: "hemi-1.3-sky", light: "hemisphere", intensity: 1.3, albedo: "#808080", lightColor: "#dce8f2" },
  // The bench scenes light with one fill light plus a white sun of intensity 2 (sun added by the harness).
  { id: "amb+sun-0.5", light: "ambient+directional", intensity: 0.5, albedo: "#808080" },
  { id: "hemi+sun-1.3", light: "hemisphere+directional", intensity: 1.3, albedo: "#808080", lightColor: "#dce8f2" }
];

export const COMBINED_SUN_INTENSITY = 2;

/** Expected linear output for a case under the three r185 convention. */
export function expectedLinear(c: ExposureCase): Vec3 {
  if (c.light === "none") return [0, 0, 0];
  const lambert = threeLambertLinear(c.albedo, c.intensity, c.lightColor);
  if (c.light === "ambient+directional" || c.light === "hemisphere+directional") {
    const fill = lambert;
    const sun = threeLambertLinear(c.albedo, COMBINED_SUN_INTENSITY);
    return [0, 1, 2].map((i) => fill[i]! + sun[i]! + COMBINED_SUN_INTENSITY * THREE_DIELECTRIC_LOBE_ROUGH1) as [number, number, number];
  }
  if (c.light !== "directional") return lambert;
  const l = srgbHexToLinear(c.lightColor ?? "#ffffff");
  return [0, 1, 2].map((i) => lambert[i]! + l[i]! * c.intensity * THREE_DIELECTRIC_LOBE_ROUGH1) as [number, number, number];
}
