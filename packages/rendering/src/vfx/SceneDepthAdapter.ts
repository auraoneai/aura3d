// PRD-07 P1-T10 — scene-depth adapter over the C-01 context field.
// Returns the real depth source when PRD 01 provides it; while the stub reports
// `available: false`, soft depth is off and SOFT_DEPTH_PENDING is reported once.

import { FRAME_RESOURCES, type FrameContributorContext, type SceneDepthSource } from "../contracts/frameGraph";
import type { Texture } from "../Texture";

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
  // T0-34 FIX-softdepth-feedback: never bind ctx.sceneDepth — it is the LIVE
  // forward depth attachment, still bound while particles draw into the same
  // target (WebGL feedback loop, INVALID_OPERATION). Only the published copy
  // (aura.scene.depth.copy, produced by lane 01/10's scene-copy pass) is safe
  // to sample. Without it, soft depth degrades to hard particles with a
  // one-shot C-36 note.
  const copy = ctx.blackboard.get(FRAME_RESOURCES.sceneDepthCopy) as Texture | undefined;
  if (copy) {
    const source: SceneDepthSource = {
      texture: copy,
      linearize: ctx.sceneDepth.linearize,
      available: true
    };
    return { source, available: true, pendingNote: null };
  }
  if (!softDepthPendingReported) {
    softDepthPendingReported = true;
    return { source: ctx.sceneDepth, available: false, pendingNote: "SOFT_DEPTH_PENDING" };
  }
  return { source: ctx.sceneDepth, available: false, pendingNote: null };
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
