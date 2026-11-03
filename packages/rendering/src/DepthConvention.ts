/** Depth is a convention shared by projection, rasterization and every depth consumer. */
export type DepthMode = "standard" | "reversed" | "logarithmic";
export type DepthClipRange = "minus-one-to-one" | "zero-to-one";

export interface DepthOptions {
  readonly mode?: DepthMode;
  /** Permit an explicitly reported fallback to standard depth. */
  readonly allowFallback?: boolean;
}

export interface DepthCapabilities {
  readonly clipRange: DepthClipRange;
  /** True only when all active rendering and sampling paths support the mode. */
  readonly reversed: boolean;
  readonly logarithmic: boolean;
}

export interface DepthConvention {
  readonly requestedMode: DepthMode;
  readonly mode: DepthMode;
  readonly clipRange: DepthClipRange;
  readonly clearValue: 0 | 1;
  readonly compare: "less-equal" | "greater-equal";
  /** Multiply a standard-depth polygon/shadow bias by this value. */
  readonly biasSign: 1 | -1;
  readonly fallbackReason?: string;
  /**
   * Honest precision report for the negotiated pipeline. "reduced" means the
   * mode is rendered correctly but does not deliver its full precision gain
   * (for example reversed Z through a minus-one-to-one clip remap or into a
   * fixed-point depth attachment). "full" means reversed Z is rasterized from
   * a zero-to-one projection into a floating-point depth attachment. Absent
   * for conventions built elsewhere.
   */
  readonly precision?: DepthPrecision;
  readonly precisionReason?: string;
  /** Storage class of the depth attachment the frame rasterizes into, when known. */
  readonly depthStorage?: DepthStorage;
  /**
   * Clip range of the projection matrices the frame's programs receive, when
   * it differs from what `clipRange` implies. WebGPU always rasterizes
   * zero-to-one (`clipRange`), but only a reversed frame negotiated with
   * "zero-to-one" here hands its programs a native zero-to-one projection
   * (no (z + w) / 2 vertex remap). Absent means minus-one-to-one projections
   * on WebGPU and `clipRange` elsewhere.
   */
  readonly projectionClipRange?: DepthClipRange;
  /** Camera near/far for a logarithmic frame; generated programs encode against it. */
  readonly logRange?: DepthDistanceRange & { readonly kind?: "perspective" | "orthographic" };
}

export type DepthPrecision = "standard" | "reduced" | "full" | "extended";

/** Fixed-point (24-bit) or floating-point (32-bit) depth attachment storage. */
export type DepthStorage = "fixed" | "float";

/**
 * What a device can deliver for reversed-Z precision. The renderer may only
 * rasterize a zero-to-one projection when `zeroToOneReversed` is true; the
 * depth attachment must also be floating point for reversed Z to be "full".
 */
export interface DepthPrecisionSupport {
  /** Clip range of a standard frame (and of shadow/probe/mirror passes). */
  readonly standardClipRange: DepthClipRange;
  /** Reversed frames can rasterize a native zero-to-one projection without a clip-space remap. */
  readonly zeroToOneReversed: boolean;
  /** "float" render-target descriptors allocate floating-point depth. */
  readonly floatDepth: boolean;
  /** Floating-point depth is also available together with a stencil aspect. */
  readonly floatDepthStencil: boolean;
}

/**
 * Classify the precision a frame actually delivers. Reversed Z gains its
 * floating-point precision only when both the projection is evaluated in a
 * zero-to-one clip range (no (z + w) / 2 cancellation) and the attachment
 * stores floats; anything less is correct ordering at "reduced" precision.
 */
export function classifyDepthPrecision(
  mode: DepthMode,
  pipeline: { readonly zeroToOneProjection: boolean; readonly depthStorage: DepthStorage; readonly reason?: string }
): { readonly precision: DepthPrecision; readonly precisionReason?: string } {
  if (mode === "standard") return { precision: "standard" };
  if (mode === "logarithmic") {
    return { precision: "extended", precisionReason: "logarithmic fragment depth distributes precision by relative distance and disables early depth testing for those draws" };
  }
  if (pipeline.zeroToOneProjection && pipeline.depthStorage === "float") {
    return { precision: "full", precisionReason: "reversed depth is rasterized from a zero-to-one projection into a floating-point depth attachment" };
  }
  const missing = [
    ...(pipeline.zeroToOneProjection ? [] : ["the projection is evaluated in a minus-one-to-one clip range"]),
    ...(pipeline.depthStorage === "float" ? [] : ["the depth attachment is fixed point"])
  ].join(" and ");
  return { precision: "reduced", precisionReason: `reversed depth ordering is correct but ${missing}${pipeline.reason ? ` (${pipeline.reason})` : ""}` };
}

/**
 * Re-express a reversed minus-one-to-one projection (near -> +1, far -> -1)
 * as the matching zero-to-one reversed projection (near -> 1, far -> 0).
 * Window depth is identical in both encodings (1 - standard window depth);
 * only the arithmetic differs, which is where reversed-Z precision is won.
 * The depth row is rebuilt exactly from near/far when the projection is a
 * plain perspective or orthographic one; other matrices use (row2 + row3) / 2.
 */
export function zeroToOneReversedProjection(
  projection: ArrayLike<number>,
  metadata?: { readonly kind?: "perspective" | "orthographic" | "custom"; readonly near?: number; readonly far?: number }
): Float32Array {
  validateMatrix(projection);
  const m = Array.from(projection);
  const near = metadata?.near, far = metadata?.far;
  const finiteRange = near !== undefined && far !== undefined && Number.isFinite(near) && Number.isFinite(far) && far > near;
  // Column-major: row 2 is m[2], m[6], m[10], m[14]; row 3 is m[3], m[7], m[11], m[15].
  const plainDepthRow = m[2] === 0 && m[6] === 0;
  // The exact rebuild must describe the same matrix: f32 coefficients of a
  // reversed minus-one-to-one depth row for this near/far.
  const close = (actual: number, expected: number): boolean => Math.abs(actual - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-5);
  if (metadata?.kind === "perspective" && finiteRange && near! > 0 && plainDepthRow && m[3] === 0 && m[7] === 0 && m[11] === -1 && m[15] === 0
    && close(m[10]!, (far! + near!) / (far! - near!)) && close(m[14]!, 2 * far! * near! / (far! - near!))) {
    m[10] = near! / (far! - near!);
    m[14] = far! * near! / (far! - near!);
  } else if (metadata?.kind === "orthographic" && finiteRange && plainDepthRow && m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1
    && close(m[10]!, 2 / (far! - near!)) && close(m[14]!, (far! + near!) / (far! - near!))) {
    m[10] = 1 / (far! - near!);
    m[14] = far! / (far! - near!);
  } else {
    for (const column of [0, 1, 2, 3]) m[column * 4 + 2] = (m[column * 4 + 2]! + m[column * 4 + 3]!) / 2;
  }
  return Float32Array.from(m);
}

/**
 * Negotiate for the complete pipeline, not just the device's ability to change
 * its compare function. A caller may advertise a mode only when its shader,
 * shadow, copy/readback and postprocess paths agree on the encoding.
 */
export function negotiateDepthConvention(options: DepthOptions = {}, capabilities: DepthCapabilities): DepthConvention {
  const requestedMode = options.mode ?? "standard";
  if (requestedMode !== "standard" && requestedMode !== "reversed" && requestedMode !== "logarithmic") {
    throw new RangeError(`Unsupported depth mode: ${String(requestedMode)}.`);
  }
  if (capabilities.clipRange !== "minus-one-to-one" && capabilities.clipRange !== "zero-to-one") {
    throw new RangeError(`Unsupported depth clip range: ${String(capabilities.clipRange)}.`);
  }
  const supported = requestedMode === "standard" || capabilities[requestedMode] === true;
  const fallbackReason = supported ? undefined : `${requestedMode} depth is unavailable in the active rendering pipeline`;
  if (fallbackReason && options.allowFallback !== true) throw new Error(`DEPTH_MODE_UNSUPPORTED: ${fallbackReason}.`);
  const mode = supported ? requestedMode : "standard";
  const reversed = mode === "reversed";
  return Object.freeze({
    requestedMode,
    mode,
    clipRange: capabilities.clipRange,
    clearValue: reversed ? 0 : 1,
    compare: reversed ? "greater-equal" : "less-equal",
    biasSign: reversed ? -1 : 1,
    ...(fallbackReason ? { fallbackReason } : {})
  });
}

export interface DepthDistanceRange { readonly near: number; readonly far: number }

export type DepthCompareFunction = "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always";

/**
 * Materials and passes author depth comparisons in the standard sense
 * (nearer = smaller). Reversed depth stores nearer fragments as larger values,
 * so every ordering comparison flips; equality and constant tests do not.
 */
export function remapDepthCompare<T extends DepthCompareFunction>(compare: T, convention: Pick<DepthConvention, "mode"> | undefined): DepthCompareFunction {
  if (convention?.mode !== "reversed") return compare;
  switch (compare) {
    case "less": return "greater";
    case "less-equal": return "greater-equal";
    case "greater": return "less";
    case "greater-equal": return "less-equal";
    default: return compare;
  }
}

interface DepthDrawState {
  readonly depthCompare: "always" | "less-equal";
  readonly depthCompareV2?: DepthCompareFunction;
  readonly polygonOffset?: { readonly factor: number; readonly units: number; readonly clamp?: number } | null;
  readonly depthConventionApplied?: boolean;
}

/**
 * Express a standard-sense draw state in the active convention. Reversed
 * depth flips ordering compares (in `depthCompareV2`, which wins over the
 * legacy field) and the polygon-offset direction, and marks the state so a
 * device never flips it twice. Other conventions return the same object.
 */
export function resolveDepthDrawState<T extends DepthDrawState>(state: T, convention: Pick<DepthConvention, "mode"> | undefined): T {
  if (convention?.mode !== "reversed" || state.depthConventionApplied === true) return state;
  const offset = state.polygonOffset;
  return {
    ...state,
    depthCompareV2: remapDepthCompare(state.depthCompareV2 ?? state.depthCompare, convention),
    ...(offset ? { polygonOffset: { ...offset, factor: -offset.factor, units: -offset.units } } : {}),
    depthConventionApplied: true
  };
}

/** Shader-side depth mode id shared by post and reconstruction shaders. */
export function depthModeId(convention: Pick<DepthConvention, "mode"> | undefined): 0 | 1 | 2 {
  return convention?.mode === "reversed" ? 1 : convention?.mode === "logarithmic" ? 2 : 0;
}

/** True when a convention requests exactly the standard clear/compare/bias contract. */
export function isStandardDepthConvention(convention: DepthConvention | undefined): boolean {
  return !convention || (convention.mode === "standard" && convention.clearValue === 1 && convention.compare === "less-equal" && convention.biasSign === 1);
}

/**
 * Convert any stored depth to the standard window depth of the same
 * projection (perspective: f(d - n) / (d(f - n)); orthographic: linear).
 * Reversed depth is exactly 1 - standard depth for finite ranges; logarithmic
 * depth stores ln(d / n) / ln(f / n). Picking, readback and CPU reference
 * passes use this to share one standard reconstruction.
 */
export function toStandardWindowDepth(
  stored: number,
  convention: Pick<DepthConvention, "mode">,
  projection: { readonly kind: "perspective" | "orthographic"; readonly near: number; readonly far: number }
): number {
  if (!Number.isFinite(stored)) throw new RangeError("Stored depth must be finite.");
  if (convention.mode === "standard") return stored;
  if (convention.mode === "reversed") return 1 - stored;
  const { near, far } = validateLogRange(projection);
  const distance = Math.exp(Math.log(near) + stored * (Math.log(far) - Math.log(near)));
  return projection.kind === "orthographic" ? (distance - near) / (far - near) : far * (distance - near) / (distance * (far - near));
}

function validateLogRange(range: DepthDistanceRange | undefined): DepthDistanceRange {
  if (!range || !Number.isFinite(range.near) || range.near <= 0 || !Number.isFinite(range.far) || range.far <= range.near) {
    throw new RangeError("Logarithmic depth requires finite 0 < near < far.");
  }
  return range;
}

function validateMatrix(matrix: ArrayLike<number>): void {
  if (matrix.length !== 16 || !Array.from(matrix).every(Number.isFinite)) throw new RangeError("Depth reconstruction requires a finite 4x4 matrix.");
}

/** Encode signed forward distance (-view-space Z) into the depth buffer's [0, 1] range. */
export function encodeViewDepth(distance: number, projection: ArrayLike<number>, convention: DepthConvention, range?: DepthDistanceRange): number {
  if (!Number.isFinite(distance)) throw new RangeError("View distance must be finite.");
  if (convention.mode === "logarithmic") {
    const { near, far } = validateLogRange(range);
    if (distance <= 0) throw new RangeError("Logarithmic depth requires a positive view distance.");
    return (Math.log(distance) - Math.log(near)) / (Math.log(far) - Math.log(near));
  }
  validateMatrix(projection);
  const z = -distance;
  const w = projection[11]! * z + projection[15]!;
  if (w === 0) throw new RangeError("The view distance projects to zero homogeneous w.");
  const ndc = (projection[10]! * z + projection[14]!) / w;
  return convention.clipRange === "minus-one-to-one" ? (ndc + 1) / 2 : ndc;
}

function unproject(x: number, y: number, depth: number, inverse: ArrayLike<number>, range: DepthClipRange): readonly [number, number, number] {
  const z = range === "minus-one-to-one" ? depth * 2 - 1 : depth;
  const w = inverse[3]! * x + inverse[7]! * y + inverse[11]! * z + inverse[15]!;
  const vx = inverse[0]! * x + inverse[4]! * y + inverse[8]! * z + inverse[12]!;
  const vy = inverse[1]! * x + inverse[5]! * y + inverse[9]! * z + inverse[13]!;
  const vz = inverse[2]! * x + inverse[6]! * y + inverse[10]! * z + inverse[14]!;
  if (w === 0) {
    // The unbounded endpoint of an infinite-far perspective ray.
    return [vx === 0 ? 0 : Math.sign(vx) * Infinity, vy === 0 ? 0 : Math.sign(vy) * Infinity, Math.sign(vz) * Infinity];
  }
  return [vx / w, vy / w, vz / w];
}

/**
 * Reconstruct a view-space point using the actual inverse projection. ndcX/Y
 * are in [-1, 1] independent of the backend's depth clip range. For log depth
 * the two interior ray samples also work for asymmetric and orthographic views.
 */
export function reconstructViewPosition(
  depth: number,
  ndcX: number,
  ndcY: number,
  inverseProjection: ArrayLike<number>,
  convention: DepthConvention,
  range?: DepthDistanceRange
): readonly [number, number, number] {
  if (![depth, ndcX, ndcY].every(Number.isFinite) || depth < 0 || depth > 1) throw new RangeError("Depth must be in [0, 1] and NDC coordinates must be finite.");
  validateMatrix(inverseProjection);
  if (convention.mode !== "logarithmic") return unproject(ndcX, ndcY, depth, inverseProjection, convention.clipRange);
  const { near, far } = validateLogRange(range);
  const distance = Math.exp(Math.log(near) + depth * (Math.log(far) - Math.log(near)));
  const a = unproject(ndcX, ndcY, 0.25, inverseProjection, convention.clipRange);
  const b = unproject(ndcX, ndcY, 0.75, inverseProjection, convention.clipRange);
  const dz = b[2] - a[2];
  if (!Number.isFinite(dz) || Math.abs(dz) < Number.EPSILON) throw new RangeError("The inverse projection does not define a depth ray.");
  const t = (-distance - a[2]) / dz;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -distance];
}

/** Signed forward view distance; an unbounded far endpoint returns Infinity. */
export function linearizeDepth(depth: number, inverseProjection: ArrayLike<number>, convention: DepthConvention, range?: DepthDistanceRange): number {
  return -reconstructViewPosition(depth, 0, 0, inverseProjection, convention, range)[2];
}
