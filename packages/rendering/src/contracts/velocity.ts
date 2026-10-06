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

export interface TemporalHistoryLike { prepare(viewProjection: Float32Array, jitter: readonly [number, number]): { readonly jittered: Float32Array; readonly unjittered: Float32Array; readonly previous: Float32Array }; reset(reason: "camera-cut" | "resize" | "tier-change" | "scene-swap"): void; }

let temporalHistoryImpl: TemporalHistoryLike | null = null;

/** Registered by the renderer seam (PR 0b, TemporalHistory wiring). */
export function setTemporalHistoryImpl(history: TemporalHistoryLike | null): void {
  temporalHistoryImpl = history;
}

/** PR 0a stub: calls the registered TemporalHistoryLike.reset() (Renderer.ts). */
export function resetTemporalHistory(reason: "camera-cut" | "resize" | "tier-change" | "scene-swap"): void {
  temporalHistoryImpl?.reset(reason);
}
// AuraApp.cutCamera(): void  (via C-38; PRD 08's app.camera.cut() calls it)
