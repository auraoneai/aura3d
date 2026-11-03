import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import type { AuraCameraSpec } from "../nodes/types.js";
import { negotiateDepthConvention, type DepthConvention, type DepthMode } from "@aura3d/rendering";

/**
 * Production depth is one convention shared by the projection, the depth
 * clear/compare/bias state, every camera-depth consumer and readback.
 *
 * - standard: minus-one-to-one projection, clear 1, compare less-equal.
 * - reversed: the projection maps near to +1 and far to -1 (window depth
 *   near = 1, far = 0), clear 0, compare greater-equal, negated bias. The
 *   portable path keeps the minus-one-to-one clip range and a fixed-point
 *   depth attachment, so ordering is correct but the floating-point precision
 *   gain of reversed Z is not delivered; diagnostics report "reduced".
 * - logarithmic: standard projection; generated programs write
 *   ln(distance / near) / ln(far / near) as fragment depth, which disables
 *   early depth testing for those draws. Needs finite 0 < near < far.
 *
 * Backend availability is negotiated by the renderer (WebGPU generated
 * programs do not write logarithmic fragment depth and fail precisely).
 */
export function resolveProductionCameraDepth(
  camera: AuraCameraSpec,
  code = "CAMERA_DEPTH_UNSUPPORTED"
): {
  readonly projectionCamera: AuraCameraSpec;
  readonly projectionMetadata: {
    readonly kind: "perspective" | "orthographic";
    readonly near: number;
    readonly far: number;
    readonly mode: DepthMode;
    readonly clipRange: "minus-one-to-one";
  };
  readonly depthConvention: DepthConvention;
} {
  // clipRange is accepted by the projection helper even though it is not yet
  // part of the public camera type; reject unsupported runtime inputs as well.
  const depth: unknown = camera.depth;
  if (depth !== undefined && (depth === null || typeof depth !== "object" || Array.isArray(depth))) {
    throw new RangeError(`${code}: production camera depth must be a depth options object`);
  }
  const requested = depth as { readonly mode?: unknown; readonly clipRange?: unknown; readonly allowFallback?: unknown } | undefined;
  const mode = requested?.mode === undefined ? "standard" : requested.mode;
  if ((mode !== "standard" && mode !== "reversed" && mode !== "logarithmic") ||
      (requested?.clipRange !== undefined && requested.clipRange !== "minus-one-to-one") ||
      (requested?.allowFallback !== undefined && typeof requested.allowFallback !== "boolean")) {
    throw new RangeError(`${code}: production cameras require a standard, reversed or logarithmic mode with minus-one-to-one clip range and valid depth options`);
  }
  // Validate the authored range for every mode; a nonstandard mode never
  // makes an invalid perspective near plane or logarithmic range valid.
  const { near, far } = resolveCameraClipping(camera);
  if (!Number.isFinite(far)) {
    throw new RangeError(`${code}: DEPTH_MODE_UNSUPPORTED: production cameras require finite far clipping`);
  }
  if (mode === "logarithmic" && !(near > 0 && far > near)) {
    throw new RangeError(`${code}: DEPTH_MODE_UNSUPPORTED: logarithmic depth requires finite 0 < near < far`);
  }
  const negotiated = negotiateDepthConvention(
    { mode, allowFallback: requested?.allowFallback === true },
    { clipRange: "minus-one-to-one", reversed: true, logarithmic: true }
  );
  const depthConvention: DepthConvention = Object.freeze({
    ...negotiated,
    ...(mode === "reversed"
      ? { precision: "reduced" as const, precisionReason: "reversed depth is rendered through a minus-one-to-one clip range into a fixed-point depth attachment; ordering is correct without the floating-point precision gain" }
      : mode === "logarithmic"
        ? { precision: "extended" as const, precisionReason: "logarithmic fragment depth distributes precision by relative distance and disables early depth testing for those draws" }
        : { precision: "standard" as const })
  });
  return {
    // Do not mutate the scene snapshot: it continues to record what was asked.
    projectionCamera: camera,
    projectionMetadata: {
      kind: camera.mode === "orthographic" || camera.mode === "isometric" ? "orthographic" : "perspective",
      near,
      far,
      mode,
      clipRange: "minus-one-to-one"
    },
    depthConvention
  };
}

export function productionCameraProjectionMetadata(
  camera: AuraCameraSpec,
  code = "CAMERA_DEPTH_UNSUPPORTED"
): ReturnType<typeof resolveProductionCameraDepth>["projectionMetadata"] {
  return resolveProductionCameraDepth(camera, code).projectionMetadata;
}

/**
 * Scene queries, picking rays and probe/mirror captures do not share the
 * frame's depth buffer. They use the camera's standard-depth projection,
 * whose x/y projection is identical in every mode.
 */
export function standardDepthCamera(camera: AuraCameraSpec): AuraCameraSpec {
  const mode = camera.depth?.mode;
  if (mode === undefined || mode === "standard") return camera;
  return { ...camera, depth: { ...camera.depth, mode: "standard" } };
}
