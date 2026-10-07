// PR 0b-2 seam (CONTRACTS.md §3.3) — velocity-MRT uniform binding hook (C-14),
// owned by PRD 03. No-op until PRD 03 registers a binder; the ForwardPass calls
// `bindVelocityUniforms?.(item, uniforms)` once per draw.

import { defineContractSlot } from "../contracts/core";
import { setTemporalHistoryImpl, type TemporalHistoryLike } from "../contracts/velocity.js";
import type { RenderItem } from "../contracts/renderItem.js";
import type { UniformValue } from "../RenderDevice.js";

export type VelocityUniformBinder = (item: RenderItem, uniforms: Map<string, UniformValue>) => void;

export let bindVelocityUniforms: VelocityUniformBinder | undefined;

/** Called once from the PRD 03 lane barrel when the real binder exists. */
export function setVelocityUniformBinder(binder: VelocityUniformBinder | undefined): void {
  bindVelocityUniforms = binder;
}

/* ------------------------------------------------------------------------- */
/* C-14 real: camera-level temporal history + velocity-MRT uniform binding.   */
/* ------------------------------------------------------------------------- */

/**
 * Per-frame camera matrices the velocity-MRT chunk needs, captured by
 * `VelocityHistory.prepare`. The binder reads them here because the seam's
 * signature (`item, uniforms`) carries no camera — module state is the only
 * channel that stays inside `forward/`.
 */
let cameraMatrices: {
  readonly jittered: Float32Array;
  readonly unjittered: Float32Array;
  readonly previous: Float32Array;
} | undefined;

/**
 * Aperiodic jitter shared with `TemporalHistory.jitter`: base-2 Halton would
 * lock coverage to an object's motion phase, so the same irrational
 * increments are used. Zero on the seed frame — nothing previous exists.
 */
function jitterOffset(frame: number, valid: boolean, width: number, height: number): readonly [number, number] {
  if (!valid) return [0, 0];
  return [
    (((0.5 + frame * ((Math.sqrt(5) - 1) / 2)) % 1) - 0.5) * 2 / width,
    (((0.5 + frame * ((Math.sqrt(2) - 1)) % 1) - 0.5) * 2) / height
  ];
}

/**
 * Camera-level history for the C-14 velocity MRT (S1 camera velocity). The
 * contract `TemporalHistoryLike` is per-frame: it returns the jittered,
 * unjittered and previous clip-space view-projection for the current frame.
 * Per-item `previousModelMatrix` stays on `RenderItem` (C-14 fields).
 */
export class VelocityHistory implements TemporalHistoryLike {
  private previousViewProjection: Float32Array | undefined;
  private frame = 0;

  prepare(viewProjection: Float32Array, jitter: readonly [number, number]): { readonly jittered: Float32Array; readonly unjittered: Float32Array; readonly previous: Float32Array } {
    const unjittered = new Float32Array(viewProjection);
    // Jitter in clip space: column 3 offset scaled by w — same convention as
    // TemporalHistory.prepare (`current[col*4] += jitter * current[col*4+3]`).
    const jittered = new Float32Array(unjittered);
    if (jitter[0] !== 0 || jitter[1] !== 0) {
      for (let col = 0; col < 4; col += 1) {
        jittered[col * 4] = jittered[col * 4]! + jitter[0] * jittered[col * 4 + 3]!;
        jittered[col * 4 + 1] = jittered[col * 4 + 1]! + jitter[1] * jittered[col * 4 + 3]!;
      }
    }
    const previous = this.previousViewProjection ?? unjittered;
    this.previousViewProjection = unjittered;
    this.frame += 1;
    cameraMatrices = { jittered, unjittered, previous };
    return cameraMatrices;
  }

  jitter(width: number, height: number): readonly [number, number] {
    return jitterOffset(this.frame, this.previousViewProjection !== undefined, width, height);
  }

  reset(_reason: "camera-cut" | "resize" | "tier-change" | "scene-swap"): void {
    this.previousViewProjection = undefined;
    this.frame = 0;
    cameraMatrices = undefined;
  }
}

/**
 * The C-14 seam binder. Writes only when a velocity frame was prepared this
 * frame (`cameraMatrices` set) — otherwise the map is untouched, so flag-off
 * and non-MRT draws pay nothing and bind nothing.
 */
const velocityMrtBinder: VelocityUniformBinder = (item, uniforms) => {
  if (!cameraMatrices) return;
  uniforms.set("u_previousViewProjection", cameraMatrices.previous);
  uniforms.set("u_unjitteredViewProjection", cameraMatrices.unjittered);
  const previousModel = item.previousModelMatrix ?? item.modelMatrix;
  if (previousModel) uniforms.set("u_previousModel", previousModel);
};

/**
 * C-14 surface: `history` is the camera-level `TemporalHistoryLike` impl the
 * velocity MRT prepares with; `kind` marks stub vs real for conformance.
 */
export interface VelocitySurface {
  readonly kind: "legacy" | "v2";
  readonly history: TemporalHistoryLike;
}

/** C-14 stub: identity history — previous == current every frame. */
class LegacyVelocityHistoryStub implements TemporalHistoryLike {
  prepare(viewProjection: Float32Array, _jitter: readonly [number, number]): { readonly jittered: Float32Array; readonly unjittered: Float32Array; readonly previous: Float32Array } {
    const copy = new Float32Array(viewProjection);
    return { jittered: copy, unjittered: copy, previous: copy };
  }
  reset(_reason: "camera-cut" | "resize" | "tier-change" | "scene-swap"): void { /* no-op */ }
}

export const velocityHistorySlot = defineContractSlot<VelocitySurface>(
  "C-14",
  "prd03",
  "A3D_QR_POST",
  { kind: "legacy", history: new LegacyVelocityHistoryStub() }
);

/**
 * Called once from `lanes/prd03.ts` (PR 0a barrel). Registers the real history
 * as the C-14 `TemporalHistoryLike` impl — additive today: nothing else calls
 * `setTemporalHistoryImpl`, and `resetTemporalHistory` previously no-oped.
 */
export function provideVelocityHistory(): void {
  const history = new VelocityHistory();
  velocityHistorySlot.provide({ kind: "v2", history });
  setTemporalHistoryImpl(history);
  setVelocityUniformBinder(velocityMrtBinder);
}
