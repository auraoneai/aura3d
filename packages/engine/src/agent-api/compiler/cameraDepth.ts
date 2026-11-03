import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import type { AuraCameraSpec } from "../nodes/types.js";
import { negotiateDepthConvention, type DepthConvention } from "@aura3d/rendering";

/**
 * The production forward, shadow, postprocess and explicit-item culling paths
 * currently share only standard depth with a minus-one-to-one camera matrix.
 * Negotiate before building a frame or running captures; a fallback must also
 * rebuild every projection rather than merely relabel the authored matrix.
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
    readonly mode: "standard";
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
    throw new RangeError(`${code}: production cameras require standard minus-one-to-one depth and valid depth options`);
  }
  // Validate the authored range first: fallback must not make an invalid
  // logarithmic range, or an invalid perspective near plane, appear valid.
  const { near, far } = resolveCameraClipping(camera);
  if (!Number.isFinite(far)) {
    throw new RangeError(`${code}: DEPTH_MODE_UNSUPPORTED: production cameras require finite far clipping`);
  }
  if (mode !== "standard" && requested?.allowFallback !== true) {
    throw new RangeError(`${code}: DEPTH_MODE_UNSUPPORTED: production cameras require standard minus-one-to-one depth; ${mode} depth is unavailable in the active rendering pipeline`);
  }
  const depthConvention = negotiateDepthConvention(
    { mode, allowFallback: requested?.allowFallback === true },
    { clipRange: "minus-one-to-one", reversed: false, logarithmic: false }
  );
  return {
    // Do not mutate the scene snapshot: it continues to record what was asked.
    projectionCamera: mode === "standard" ? camera : { ...camera, depth: { mode: "standard" } },
    projectionMetadata: {
      kind: camera.mode === "orthographic" || camera.mode === "isometric" ? "orthographic" : "perspective",
      near,
      far,
      mode: "standard",
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
