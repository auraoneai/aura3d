import type { TextureBinding } from "../TextureBinding";
import {
  computeShadowDepthBias,
  createShadowFilterKernel,
  type ShadowFilterKernel,
} from "../ShadowMap";

/**
 * B1 spot shadow path (muse3jsparity-PRD).
 *
 * Perspective spot shadows were the missing member of the shadow family:
 * directional CSM + point-cube uniforms already exist in ForwardPass, but
 * zero `spot` matches existed there. This module owns the spot side:
 * options, perspective projection math, projective-UV evaluation, a CPU
 * PCF reference mirror (fixed inputs -> expected factor, so refactors
 * cannot silently regress the math), and atlas sizing tiers.
 *
 * The GLSL sampling reuses the shared PCF/Poisson kernel tables from
 * ShadowMap.ts (same policy as the point cube path); slope-scaled bias
 * reuses `computeShadowDepthBias`.
 */

export interface ForwardSpotShadowMapOptions {
  readonly texture: TextureBinding;
  /** World-space position of the spot light. */
  readonly lightPosition: readonly [number, number, number];
  /** Normalized world-space direction of the spot cone axis. */
  readonly lightDirection: readonly [number, number, number];
  /** Outer cone half-angle in radians, within (0, PI/2). */
  readonly angle: number;
  /** Penumbra blend in [0, 1] (matches CollectedLight.penumbra). */
  readonly penumbra: number;
  /** Shadow camera far plane (range). Must be positive. */
  readonly range: number;
  /** Perspective spot shadow matrix (projection * view), 16 numbers. */
  readonly shadowMatrix: Float32Array | readonly number[];
  readonly strength?: number;
  readonly bias?: number;
  readonly slopeBias?: number;
  readonly texelSize?: readonly [number, number];
  readonly filterKernel?: ShadowFilterKernel;
}

export interface SpotShadowProjection {
  /** Vertical field of view in radians (2 * angle). */
  readonly fovY: number;
  readonly near: number;
  readonly far: number;
  /** Column-major perspective matrix entries (16 numbers). */
  readonly projectionMatrix: readonly number[];
}

export interface SpotShadowAtlasTier {
  readonly resolution: number;
  readonly reason: string;
}

const DEFAULT_SPOT_SHADOW_KERNEL = createShadowFilterKernel({ filter: "pcf", pcfRadius: 1, pcfSamples: 9 });

export function createSpotShadowProjection(angle: number, range: number, near = 0.1): SpotShadowProjection {
  if (!Number.isFinite(angle) || angle <= 0 || angle >= Math.PI / 2) {
    throw new RangeError("Spot shadow angle must be within (0, PI / 2).");
  }
  if (!Number.isFinite(range) || range <= 0) {
    throw new RangeError("Spot shadow range must be finite and positive.");
  }
  if (!Number.isFinite(near) || near <= 0 || near >= range) {
    throw new RangeError("Spot shadow near plane must be finite, positive, and below range.");
  }
  const fovY = angle * 2;
  const f = 1 / Math.tan(fovY / 2);
  const projectionMatrix = [
    f, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (range + near) / (near - range), -1,
    0, 0, (2 * range * near) / (near - range), 0,
  ];
  return { fovY, near, far: range, projectionMatrix };
}

/**
 * Projective UV + linear depth of a world position in spot shadow space.
 * Returns null when the position is behind the light or outside the cone.
 */
export function projectSpotShadowUv(
  worldPosition: readonly [number, number, number],
  lightPosition: readonly [number, number, number],
  lightDirection: readonly [number, number, number],
  angle: number,
  shadowMatrix: Float32Array | readonly number[]
): { readonly u: number; readonly v: number; readonly depth: number } | null {
  if (shadowMatrix.length < 16) throw new RangeError("Spot shadow matrix must hold 16 numbers.");
  const dirLength = Math.hypot(lightDirection[0]!, lightDirection[1]!, lightDirection[2]!);
  if (!Number.isFinite(dirLength) || dirLength <= 0) throw new RangeError("Spot light direction must be a non-zero finite vector.");
  const axis: readonly [number, number, number] = [
    lightDirection[0]! / dirLength,
    lightDirection[1]! / dirLength,
    lightDirection[2]! / dirLength,
  ];
  const toFragment: readonly [number, number, number] = [
    worldPosition[0]! - lightPosition[0]!,
    worldPosition[1]! - lightPosition[1]!,
    worldPosition[2]! - lightPosition[2]!,
  ];
  const alongAxis = toFragment[0]! * axis[0]! + toFragment[1]! * axis[1]! + toFragment[2]! * axis[2]!;
  if (!Number.isFinite(alongAxis) || alongAxis <= 0) return null;
  const cosOuter = Math.cos(angle);
  const distance = Math.hypot(toFragment[0]!, toFragment[1]!, toFragment[2]!);
  if (alongAxis / Math.max(distance, 1e-9) < cosOuter) return null;
  const m = shadowMatrix;
  const x = worldPosition[0]!;
  const y = worldPosition[1]!;
  const z = worldPosition[2]!;
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (!Number.isFinite(w) || Math.abs(w) <= 1e-9) return null;
  const clipX = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
  const clipY = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
  const clipZ = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w;
  if (clipX < -1 || clipX > 1 || clipY < -1 || clipY > 1) return null;
  return { u: clipX * 0.5 + 0.5, v: clipY * 0.5 + 0.5, depth: clipZ * 0.5 + 0.5 };
}

export interface SpotShadowFactorInput {
  /** Sampled occluder depths, one per PCF tap, in [0, 1]. */
  readonly tapDepths: readonly number[];
  readonly receiverDepth: number;
  readonly normalDotLight: number;
  readonly baseBias?: number;
  readonly slopeScale?: number;
  readonly texelSize?: number;
  readonly strength?: number;
}

/**
 * CPU mirror of the spot PCF compare: hardens the point-cube path's shared
 * bias tables (computeShadowDepthBias) and averages lit taps.
 */
export function resolveSpotShadowFactor(input: SpotShadowFactorInput): number {
  if (input.tapDepths.length === 0) throw new RangeError("Spot shadow PCF requires at least one tap.");
  const strength = input.strength ?? 1;
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RangeError("Spot shadow strength must be in [0, 1].");
  }
  const bias = computeShadowDepthBias({
    baseBias: input.baseBias ?? 0.001,
    slopeScale: input.slopeScale ?? 1,
    normalDotLight: input.normalDotLight,
    texelSize: input.texelSize ?? 1,
  });
  let lit = 0;
  for (const tap of input.tapDepths) {
    if (!Number.isFinite(tap)) throw new RangeError("Spot shadow tap depths must be finite.");
    if (input.receiverDepth - bias <= tap) lit += 1;
  }
  const litFraction = lit / input.tapDepths.length;
  return Number((1 - strength * (1 - litFraction)).toFixed(6));
}

/** Atlas resolution tier for a spot light: wider cones cost more texels. */
export function selectSpotShadowAtlasTier(angle: number): SpotShadowAtlasTier {
  if (!Number.isFinite(angle) || angle <= 0 || angle >= Math.PI / 2) {
    throw new RangeError("Spot shadow angle must be within (0, PI / 2).");
  }
  const degrees = (angle * 180) / Math.PI;
  if (degrees <= 20) return { resolution: 512, reason: "narrow cone (<=20deg half-angle) fits a 512 tile" };
  if (degrees <= 40) return { resolution: 1024, reason: "medium cone (<=40deg half-angle) needs a 1024 tile" };
  return { resolution: 2048, reason: "wide cone (>40deg half-angle) needs a 2048 tile" };
}

export function defaultSpotShadowKernel(): ShadowFilterKernel {
  return DEFAULT_SPOT_SHADOW_KERNEL;
}
