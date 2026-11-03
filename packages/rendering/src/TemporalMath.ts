/** Numerical conventions shared by temporal-history producers and resolve passes. */
export type TemporalProjection = "perspective" | "orthographic";
/** Depth-buffer values are normalized to [0, 1], including on WebGL. */
export type TemporalDepthConvention = "standard" | "reversed";
export type TemporalVec2 = readonly [number, number];

/** Seed and commit the frame, but do not reuse stale history for unsupported motion. */
export function temporalCanAccumulate(historyValid: boolean, unsupportedMotion: readonly string[] = []): boolean {
  return historyValid && !unsupportedMotion.some(reason => reason !== "previous-depth-approximation");
}

function finiteVec2(value: TemporalVec2, name: string): void {
  if (value.length !== 2 || !value.every(Number.isFinite)) throw new RangeError(`${name} must have two finite components`);
}

/** Seed frames contribute equally until the requested history weight is reached. */
export function temporalAccumulationWeight(blend: number, historyFrames?: number): number {
  if (!Number.isFinite(blend) || blend < 0 || blend > 1) throw new RangeError("Temporal blend must be finite in [0, 1]");
  if (historyFrames === undefined) return blend;
  if (!Number.isSafeInteger(historyFrames) || historyFrames < 0) throw new RangeError("Temporal history frame count must be a nonnegative integer");
  return Math.min(blend, historyFrames / (historyFrames + 1));
}

/**
 * Pixel-distributed sample displacement in clip-space units. Frame zero has no
 * prior samples, so a freshly invalidated history is rendered without jitter.
 * Multiplying this result by one half gives the corresponding WebGL UV offset;
 * WebGPU's top-left texture origin requires the Y component to be negated.
 */
export function temporalJitter(frame: number, historyValid: boolean, width: number, height: number): TemporalVec2 {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError("Temporal frame must be a nonnegative integer");
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError("Temporal dimensions must be positive integers");
  }
  if (!historyValid) return [0, 0];
  return [
    (((0.5 + frame * ((Math.sqrt(5) - 1) / 2)) % 1) - 0.5) * 2 / width,
    (((0.5 + frame * (Math.sqrt(2) - 1)) % 1) - 0.5) * 2 / height
  ];
}

/**
 * `velocity` is current minus previous unjittered UV. Current raster coverage
 * is sampled at outputUV + jitterUV, while previous history is sampled at
 * outputUV - velocity. Previous depth remains jittered, so its lookup also
 * adds previousJitterUv. Jitter must use the texture's UV orientation.
 */
export function temporalReprojection(outputUv: TemporalVec2, velocity: TemporalVec2, jitterUv: TemporalVec2 = [0, 0], previousJitterUv: TemporalVec2 = [0, 0]): {
  readonly currentUv: TemporalVec2;
  readonly previousUv: TemporalVec2;
  readonly previousDepthUv: TemporalVec2;
  readonly historyInBounds: boolean;
  readonly previousDepthInBounds: boolean;
} {
  finiteVec2(outputUv, "outputUv");
  finiteVec2(velocity, "velocity");
  finiteVec2(jitterUv, "jitterUv");
  finiteVec2(previousJitterUv, "previousJitterUv");
  const currentUv: TemporalVec2 = [outputUv[0] + jitterUv[0], outputUv[1] + jitterUv[1]];
  const previousUv: TemporalVec2 = [outputUv[0] - velocity[0], outputUv[1] - velocity[1]];
  const previousDepthUv: TemporalVec2 = [previousUv[0] + previousJitterUv[0], previousUv[1] + previousJitterUv[1]];
  const inBounds = (uv: TemporalVec2): boolean => uv[0] >= 0 && uv[1] >= 0 && uv[0] < 1 && uv[1] < 1;
  return { currentUv, previousUv, previousDepthUv, historyInBounds: inBounds(previousUv), previousDepthInBounds: inBounds(previousDepthUv) };
}

/**
 * Camera-only velocity in texture UV units. `previousFromCurrentClip` maps an
 * unjittered current clip point into the previous clip space (column-major).
 * The depth sample came from a jittered raster, so its XY must be unjittered
 * before that mapping. A singular projection yields zero, like the GL pass.
 */
export function temporalCameraVelocity(
  rasterUv: TemporalVec2, jitterClip: TemporalVec2, ndcDepth: number,
  previousFromCurrentClip: readonly number[] | Float32Array, origin: "bottom-left" | "top-left" = "bottom-left"
): TemporalVec2 {
  finiteVec2(rasterUv, "rasterUv");
  finiteVec2(jitterClip, "jitterClip");
  if (!Number.isFinite(ndcDepth) || previousFromCurrentClip.length !== 16
      || !Array.from(previousFromCurrentClip).every(Number.isFinite) || (origin !== "bottom-left" && origin !== "top-left")) {
    throw new RangeError("Invalid temporal camera reprojection");
  }
  const x = rasterUv[0] * 2 - 1 - jitterClip[0];
  const y = (origin === "top-left" ? 1 - rasterUv[1] * 2 : rasterUv[1] * 2 - 1) - jitterClip[1];
  const m = previousFromCurrentClip;
  const w = m[3]! * x + m[7]! * y + m[11]! * ndcDepth + m[15]!;
  if (Math.abs(w) < 1e-20 || !Number.isFinite(w)) return [0, 0];
  const previousX = (m[0]! * x + m[4]! * y + m[8]! * ndcDepth + m[12]!) / w;
  const previousY = (m[1]! * x + m[5]! * y + m[9]! * ndcDepth + m[13]!) / w;
  return [(x - previousX) * 0.5, (y - previousY) * (origin === "top-left" ? -0.5 : 0.5)];
}

/**
 * Signed forward view-space distance from normalized device depth. `reversed` means
 * the near plane writes 1 and the far plane writes 0. Perspective permits an
 * infinite far plane. A logarithmic depth buffer needs its own inverse mapping
 * and is intentionally not treated as either supported convention.
 */
export function temporalLinearDepth(
  depth: number, near: number, far: number,
  projection: TemporalProjection = "perspective", convention: TemporalDepthConvention = "standard"
): number {
  if (!Number.isFinite(depth) || depth < 0 || depth > 1) throw new RangeError("Depth must be finite in [0, 1]");
  if (projection !== "perspective" && projection !== "orthographic") throw new RangeError("Unsupported temporal projection");
  if (!Number.isFinite(near) || (projection === "perspective" && near <= 0) || !(far > near) || (far !== Infinity && !Number.isFinite(far))) throw new RangeError("Invalid temporal depth range");
  if (convention !== "standard" && convention !== "reversed") throw new RangeError("Unsupported temporal depth convention");
  if (projection === "orthographic" && far === Infinity) throw new RangeError("Orthographic temporal depth requires a finite far plane");
  const d = convention === "reversed" ? 1 - depth : depth;
  if (projection === "orthographic") return near + d * (far - near);
  if (far === Infinity) return d === 1 ? Infinity : near / (1 - d);
  return near * far / (far - d * (far - near));
}

/**
 * Compare an expected previous signed linear depth against actual nearby
 * previous samples. The near distance supplies the origin for relative error;
 * the reserved 3e38 sentinel identifies uncovered or unbounded depth.
 * Comparing a sample range would accept empty space between two surfaces.
 */
export function temporalDepthAccepted(expected: number, samples: readonly number[], relativeTolerance = 0.1, absoluteTolerance = 0.001, near = 0): boolean {
  if (!Number.isFinite(relativeTolerance) || relativeTolerance < 0 || !Number.isFinite(absoluteTolerance) || absoluteTolerance < 0 || !Number.isFinite(near)) throw new RangeError("Invalid temporal depth tolerance or near distance");
  // Uncovered or unbounded depth is represented by the explicit sky sentinel;
  // negative distances and zero can be valid for an orthographic camera.
  const valid = (depth: number) => Number.isFinite(depth) && depth >= near && depth < 3e38;
  if (!valid(expected)) return false;
  const tolerance = Math.max(absoluteTolerance, relativeTolerance * Math.max(expected - near, 0));
  return samples.some(depth => valid(depth) && Math.abs(depth - expected) <= tolerance);
}

/** Motion-adaptive history weight; a fully reactive or disoccluded pixel reseeds. */
export function temporalFeedbackWeight(feedbackMin: number, feedbackMax: number, motionPixels: number, reactive: number, historyValid = true, depthAccepted = true): number {
  if (![feedbackMin, feedbackMax, motionPixels, reactive].every(Number.isFinite) || feedbackMin < 0 || feedbackMax > 1 || feedbackMin > feedbackMax || motionPixels < 0 || reactive < 0 || reactive > 1) {
    throw new RangeError("Invalid temporal feedback parameters");
  }
  if (!historyValid || !depthAccepted) return 0;
  const stillness = 1 - Math.min(motionPixels / 2, 1);
  return (feedbackMin + (feedbackMax - feedbackMin) * stillness) * (1 - reactive);
}

/** Separable four-tap interpolating cubic weights; constants sum to one. */
export function temporalCubicWeights(fraction: number): readonly [number, number, number, number] {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new RangeError("Cubic fraction must be in [0, 1]");
  const squared = fraction * fraction, cubed = squared * fraction;
  return [-0.5 * fraction + squared - 0.5 * cubed, 1 - 2.5 * squared + 1.5 * cubed, 0.5 * fraction + 2 * squared - 1.5 * cubed, -0.5 * squared + 0.5 * cubed];
}
