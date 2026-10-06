/**
 * C-21 — fog/wetness chunk registry and sky background source (rendering side,
 * CONTRACTS.md). Provider: PRD 07. Flag: A3D_QR_VFX.
 *
 * The spec's AuraSkySpec is an engine-level type (packages/engine/contracts/
 * atmosphere.ts); rendering cannot import upward, so it is carried as an opaque
 * spec record here. The engine-side stub lowers it to sky.dayNight.
 */

import type { RenderTarget } from "../RenderDevice";
import type { RenderDevice } from "../RenderDevice";
import { defineContractSlot, type ContractSlot } from "./core";

/** Engine AuraSkySpec, carried opaquely on the rendering side. */
export type AuraSkySpecLike = Readonly<Record<string, unknown>>;

/** Chunk "a3d_prd07_fog": vec3 a3dApplyFog(vec3 color, vec3 worldPos); float a3dFogAmount(vec3 worldPos); float a3dHeightFogTau(vec3 a, vec3 b, float density). Hook "fragment:fog". */
export const FOG_CHUNK: "a3d_prd07_fog" = "a3d_prd07_fog";
/** Chunk "a3d_prd07_wetness" behind #define A3D_WETNESS; uniforms u_wetness, u_puddleThreshold, u_rainRipples, u_snowCover. Hook "fragment:material". */
export const WETNESS_CHUNK: "a3d_prd07_wetness" = "a3d_prd07_wetness";
export interface SkyBackgroundPassLike { setSpec(spec: AuraSkySpecLike, time: number): void; renderToCubeFace(face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Float32Array): void; horizonRadiance(azimuthSamples: 8): Float32Array; }

/**
 * PR 0a: `renderToCubeFace` clears to the horizon colour (the gradient pass
 * today's EnvironmentBackgroundPass already draws). Horizon radiance is zero —
 * sky→IBL capture is PRD 07's real work.
 */
class StubSkyBackground implements SkyBackgroundPassLike {
  private spec: AuraSkySpecLike | null = null;
  private time = 0;
  setSpec(spec: AuraSkySpecLike, time: number): void { this.spec = spec; this.time = time; }
  renderToCubeFace(_face: 0 | 1 | 2 | 3 | 4 | 5, _target: RenderTarget, _viewProjection: Float32Array): void {
    // PR 0b wires the existing gradient pass; the stub records the call.
  }
  horizonRadiance(_azimuthSamples: 8): Float32Array {
    return new Float32Array(3);
  }
}

export const skyBackgroundSlot: ContractSlot<(device: RenderDevice) => SkyBackgroundPassLike> =
  defineContractSlot("C-21", "prd07", "A3D_QR_VFX", () => new StubSkyBackground());

type SkyListener = (spec: AuraSkySpecLike) => void;
const skyListeners = new Set<SkyListener>();

/** Sky change event for re-capture (C-07-OUT-4): emitted when the sun moves > 0.5 degrees. */
export function onSkyChanged(listener: SkyListener): () => void {
  skyListeners.add(listener);
  return () => { skyListeners.delete(listener); };
}

/** Fired by the VFX lane whenever the sky spec's lighting contribution changes. */
export function emitSkyChanged(spec: AuraSkySpecLike): void {
  for (const listener of skyListeners) listener(spec);
}
