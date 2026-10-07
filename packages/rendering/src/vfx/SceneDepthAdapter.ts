// PRD-07 P1-T10 — scene-depth adapter over the C-01 context field.
// Returns the real depth source when PRD 01 provides it; while the stub reports
// `available: false`, soft depth is off and SOFT_DEPTH_PENDING is reported once.

import type { FrameContributorContext, SceneDepthSource } from "../contracts/frameGraph";

let softDepthPendingReported = false;

/** Test hook. */
export function resetSceneDepthAdapterReports(): void {
  softDepthPendingReported = false;
}

export interface ResolvedSceneDepth {
  readonly source: SceneDepthSource;
  readonly available: boolean;
  /** Non-null when the caller should emit a once-per-session degradation note. */
  readonly pendingNote: "SOFT_DEPTH_PENDING" | null;
}

export function resolveSceneDepth(ctx: FrameContributorContext): ResolvedSceneDepth {
  const source = ctx.sceneDepth;
  if (source.available && source.texture !== null) {
    return { source, available: true, pendingNote: null };
  }
  if (!softDepthPendingReported) {
    softDepthPendingReported = true;
    return { source, available: false, pendingNote: "SOFT_DEPTH_PENDING" };
  }
  return { source, available: false, pendingNote: null };
}

/**
 * §6.2.7 output encoding: "linear" when the frame renders into an HDR target
 * (postprocess on), else the legacy "srgb" encode. PRD 01 publishes the
 * decision on the blackboard as `prd01.outputColorSpace` when postprocess is
 * active; absent the key the legacy path applies (the flag-off convention).
 */
export function resolveOutputColorSpace(ctx: FrameContributorContext): "linear" | "srgb" {
  const published = ctx.blackboard.get("prd01.outputColorSpace");
  return published === "linear" ? "linear" : "srgb";
}
