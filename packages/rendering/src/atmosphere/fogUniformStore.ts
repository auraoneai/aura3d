// PRD-07 P4-T4 / #187 / #82 — forward-geometry binding for the C-21 fog chunk.
//
// The `prd07.fog` ShaderFeature splices `a3d_prd07_fog` into C-02 generated
// forward programs (pars at fragment:pars, call at fragment:fog — #880), but a
// per-draw `bindUniforms` sees no frame blackboard. The prd07.fog contributor
// therefore publishes the frame's packed §8.4 uniforms here during collect, and
// the feature's `bindUniforms` reads them per draw (same module-store pattern
// as wetness). Without this binding every u_fog* uniform stays 0 → mode 0 →
// forward geometry is never fogged, so `setFog({ mode: "absorption" })` only
// reached the sky and decals. With it, mode 5 (Beer-Lambert per-channel
// T = exp(-σ·d)) shades forward geometry on the real C-02 path.

import type { UniformValue } from "../RenderDevice";
import type { PackedFogUniforms, Vec3 } from "./HeightFog";
import { packFogVolumes, type Prd07FogVolume } from "./FogVolumes";

export interface Prd07ForwardFogState {
  readonly uniforms: PackedFogUniforms;
  readonly volumes: readonly Prd07FogVolume[];
  readonly sunDirection: Vec3;
  readonly sunColor: Vec3;
  readonly cameraPosition: Vec3;
}

let forwardFog: Prd07ForwardFogState | null = null;

/** Called by the prd07.fog contributor each frame; `null` = no live fog node (IC-0: mode 0). */
export function setPrd07ForwardFog(state: Prd07ForwardFogState | null): void {
  forwardFog = state;
}

export function prd07ForwardFog(): Prd07ForwardFogState | null {
  return forwardFog;
}

/**
 * `prd07.fog` ShaderFeature.bindUniforms body. Always writes `u_fogMode` so a
 * program that selected the feature never reads a stale mode from a previous
 * draw's uniform packet; the remaining slots are written only while fog is live.
 */
export function bindPrd07FogUniforms(set: (name: string, value: UniformValue) => void): void {
  const state = forwardFog;
  if (!state) {
    set("u_fogMode", 0);
    return;
  }
  const f = state.uniforms;
  set("u_fogA", [...f.fogA]);
  set("u_fogB", [...f.fogB]);
  set("u_fogColor", [...f.fogColor]);
  set("u_fogAbsorption", [...f.fogAbsorption]);
  set("u_fogMode", f.fogMode);
  set("u_fogNear", f.fogNear);
  set("u_fogFar", f.fogFar);
  set("u_fogVolumes", packFogVolumes(state.volumes));
  set("u_cameraPosition", [...state.cameraPosition]);
  set("u_sunDirection", [...state.sunDirection]);
  set("u_sunColor", [...state.sunColor]);
}
