/**
 * C-14 — velocity target and temporal history reset (CONTRACTS.md). Provider: PRD 03.
 * Flag: A3D_QR_POST. RenderItem gains previous-frame optional fields in PR 0a.
 */

// RenderItem additions (PR 0a, all optional, all inert until A3D_QR_POST):
//   readonly previousModelMatrix?: Float32Array;
//   readonly previousInstanceTransforms?: Float32Array;
//   readonly previousJointTexture?: import("../Texture").Texture;     // C-18 palette.previous
//   readonly previousMorphWeights?: Float32Array;
//   readonly writesReactive?: boolean;                                // particles/transparents (C-07-IN-8)
export const VELOCITY_MRT: { readonly velocityLocation: 1; readonly velocityFormat: "rg16f"; readonly reactiveLocation: 2; readonly reactiveFormat: "r8"; readonly define: "AURA_VELOCITY" } =
  { velocityLocation: 1, velocityFormat: "rg16f", reactiveLocation: 2, reactiveFormat: "r8", define: "AURA_VELOCITY" };

import type { RenderTarget } from "../RenderDevice";

/** Stable for the lifetime of an authored view or renderable, never its label. */
export type TemporalIdentity = object | string | number | symbol;
/** Same token on every pass of one authored frame; choose a new token for each subsequent frame. */
export type TemporalFrameId = string | number | symbol;
export type TemporalResetReason = "camera-cut" | "resize" | "tier-change" | "scene-swap" | "device-loss" | "explicit-reset";

export interface TemporalCameraMatrices {
  /** Jittered clip-space view-projection for the current frame (raster VP). */
  readonly jittered: Float32Array;
  /** Physical (unjittered) clip-space view-projection — velocity reprojection input. */
  readonly unjittered: Float32Array;
  /** Previous committed frame's unjittered clip-space view-projection. */
  readonly previous: Float32Array;
  /** Previous committed signed linear-Z surface, if provided by this history. */
  readonly linZ?: RenderTarget;
  /** Current signed linear-Z output; promoted to linZ on commit. */
  readonly linZOutput?: RenderTarget;
  /** Clip-space jitter; half of each component is its WebGL UV offset. */
  readonly jitterClip?: readonly [number, number];
  /** §8.8: measured frame delta in seconds; scales the S7 shutter (C-23). */
  readonly frameTime?: number;
}

export interface TemporalHistoryLike {
  prepare(viewProjection: Float32Array, jitter: readonly [number, number], frameId?: TemporalFrameId): TemporalCameraMatrices;
  commit?(frameId?: TemporalFrameId): void;
  cancel?(frameId?: TemporalFrameId): boolean | void;
  reset(reason: TemporalResetReason): void;
}

/** A renderer-owned history or a view-specific reset adapter. */
export type TemporalResetTarget = Pick<TemporalHistoryLike, "reset">;

let temporalHistoryImpl: TemporalHistoryLike | null = null;
// Ownership metadata only: no camera, model, or frame history is shared here.
const temporalHistoryOwnership = new WeakMap<object, "compatibility" | "scoped">();

/** @internal Claim a fresh history so the legacy reset seam cannot select it. */
export function claimScopedTemporalHistory(history: TemporalHistoryLike): boolean {
  if (temporalHistoryOwnership.has(history)) return false;
  temporalHistoryOwnership.set(history, "scoped");
  return true;
}

/** Registers the shared compatibility history used by an unscoped reset. */
export function setTemporalHistoryImpl(history: TemporalHistoryLike | null): void {
  if (history && temporalHistoryOwnership.get(history) === "scoped") {
    throw new Error("A scoped temporal history cannot be registered for unscoped reset");
  }
  if (history) temporalHistoryOwnership.set(history, "compatibility");
  temporalHistoryImpl = history;
}

/**
 * Reset an explicit owner or view adapter. With no target, only the shared
 * compatibility history is reset; no renderer or view is selected implicitly.
 */
export function resetTemporalHistory(reason: TemporalResetReason, target?: TemporalResetTarget): void {
  (target ?? temporalHistoryImpl)?.reset(reason);
}
// AuraApp.cutCamera(): void  (via C-38; PRD 08's app.camera.cut() calls it)
