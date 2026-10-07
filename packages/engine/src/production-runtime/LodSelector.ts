// PRD-05 §6.3.7 / §7.4 — per-frame MSFT_lod level selection.
// File: packages/engine/src/production-runtime/LodSelector.ts — owner lane 05.
//
// Coverage is the projected bounding-sphere height as a fraction of viewport
// height. `screenCoverage[i]` is the minimum coverage at which level i is the
// right choice (descending thresholds, three.js MSFT_lod convention): pick the
// smallest i with coverage >= screenCoverage[i], else the last level. Switch
// boundaries carry 10 % hysteresis and the selector moves at most one level per
// call (one step per frame per actor). `bias` multiplies coverage — default 1;
// the C-27 tier `lodBias` × model `bias` product arrives through
// `TypedGLBActorLod` options when the Q-15-1 compile seam lands.

export interface LodSelectorOptions {
  /** Descending per-level coverage thresholds (`extras.MSFT_screencoverage`), index 0 = level 0. */
  readonly screenCoverage: readonly number[];
  /** Coverage multiplier (C-27 `lodBias` × model bias). Default 1. */
  readonly bias?: number;
  /** Boundary deadband fraction on each side of a threshold. Default 0.1. */
  readonly hysteresis?: number;
}

export class LodSelector {
  private level = 0;
  private readonly thresholds: readonly number[];
  private readonly bias: number;
  private readonly hysteresis: number;

  constructor(options: LodSelectorOptions) {
    if (!options.screenCoverage.length) {
      throw new Error("LodSelector requires at least one screenCoverage threshold");
    }
    this.thresholds = options.screenCoverage;
    this.bias = options.bias ?? 1;
    this.hysteresis = options.hysteresis ?? 0.1;
  }

  get levels(): number {
    return this.thresholds.length;
  }

  get activeLevel(): number {
    return this.level;
  }

  /**
   * Advance one frame: returns the active level after applying bias,
   * hysteresis, and the one-step-per-frame rule.
   */
  select(rawCoverage: number): number {
    const coverage = rawCoverage * this.bias;
    const t = this.thresholds;
    let target = this.level;
    // Level i's band is [t[i], t[i-1]): stepping coarser crosses the current
    // level's own threshold down, stepping finer crosses the finer level's
    // threshold up — each widened by the deadband.
    while (target < t.length - 1 && coverage < t[target] * (1 - this.hysteresis)) target++;
    while (target > 0 && coverage >= t[target - 1] * (1 + this.hysteresis)) target--;
    this.level = this.level + Math.sign(target - this.level);
    return this.level;
  }

  /** Level the thresholds would pick with no hysteresis or stepping (evidence). */
  unconstrainedLevel(rawCoverage: number): number {
    const coverage = rawCoverage * this.bias;
    const t = this.thresholds;
    for (let i = 0; i < t.length; i++) {
      if (coverage >= t[i]) return i;
    }
    return t.length - 1;
  }

  /** Force the active level (fixed mode); resets the step memory. */
  setLevel(level: number): void {
    if (!Number.isInteger(level) || level < 0 || level >= this.thresholds.length) {
      throw new RangeError(`LOD level ${level} is outside 0..${this.thresholds.length - 1}`);
    }
    this.level = level;
  }
}

/** Camera matrices the LOD selector needs — a superset-friendly view of the
 * rendering `CameraLike` (which only guarantees matrices) plus the richer
 * frame-uniforms shape when callers have it. */
export interface LodCamera {
  readonly projectionMatrix?: Float32Array | readonly number[];
  readonly viewMatrix?: Float32Array | readonly number[];
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
  readonly position?: readonly [number, number, number];
  readonly near?: number;
  readonly projection?: "perspective" | "orthographic";
}

export interface LodCoverageInput {
  /** World-space bounding-sphere centre of the LOD set. */
  readonly center: readonly [number, number, number];
  /** World-space bounding-sphere radius. */
  readonly radius: number;
  readonly camera: LodCamera;
}

/**
 * Projected-sphere coverage as a viewport-height fraction, matching the
 * `MSFT_screencoverage` convention (NDC height, not pixels). Perspective:
 * `radius * proj[5] / viewDistance`. Orthographic: `radius * proj[5]` — camera
 * distance does not shrink the projection.
 */
export function projectedSphereCoverage(input: LodCoverageInput): number {
  const { camera, center, radius } = input;
  const projection = camera.projectionMatrix;
  if (!projection || projection.length < 16) return 1;
  const verticalScale = Math.abs(projection[5]);
  if (!Number.isFinite(verticalScale) || verticalScale <= 0) return 1;
  // Column-major: perspective has m[15]=0 (m[11]=-1); orthographic m[15]=1.
  const orthographic = camera.projection === "orthographic" || projection[15] === 1;
  if (orthographic) {
    return radius * verticalScale;
  }
  const view = camera.viewMatrix;
  let depth: number;
  if (view && view.length >= 16) {
    // View-space z of the sphere centre; perspective camera looks down -z.
    depth = -(view[2] * center[0] + view[6] * center[1] + view[10] * center[2] + view[14]);
  } else if (camera.viewProjectionMatrix && camera.viewProjectionMatrix.length >= 16) {
    // Perspective clip w equals -viewZ exactly — recover depth from VP alone.
    const vp = camera.viewProjectionMatrix;
    depth = vp[3] * center[0] + vp[7] * center[1] + vp[11] * center[2] + vp[15];
  } else if (camera.position) {
    const dx = center[0] - camera.position[0];
    const dy = center[1] - camera.position[1];
    const dz = center[2] - camera.position[2];
    depth = Math.hypot(dx, dy, dz);
  } else {
    return 1;
  }
  const distance = Math.max(depth, camera.near ?? 0.01, 1e-6);
  return (radius * verticalScale) / distance;
}
