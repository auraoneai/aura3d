/**
 * C-20 — renderable particle interface (rendering side, CONTRACTS.md). Provider: PRD 07.
 * Flag: A3D_QR_VFX.
 */

import type { Texture } from "../Texture";
import type { RenderDevice } from "../RenderDevice";
import type { BlendMode } from "./blend";
import { defineContractSlot, type ContractSlot } from "./core";

export interface ParticleBatchDescriptor { readonly key: string; readonly capacity: number; readonly source: "cpu" | "gpu" | "procedural" | "compute"; readonly atlas: Texture; readonly blend: BlendMode; readonly shading: "unlit" | "lit"; readonly softDepth: boolean; readonly stretch: boolean; readonly frameBlend: boolean; }
export interface ParticleBatchHandle { readonly key: string; readonly liveCount: number; }
export interface ParticleRenderHook {
  upsertBatch(desc: ParticleBatchDescriptor): ParticleBatchHandle;
  writeInstances(h: ParticleBatchHandle, data: Float32Array, liveCount: number): void;
  removeBatch(h: ParticleBatchHandle): void;
}
/** PRD 07 registers a C-01 FrameContributor "prd07.particles" (phase "transparent") that draws all batches. */

/** PR 0a: calling the stub's methods throws PARTICLE_PASS_PENDING. */
class StubParticleRenderHook implements ParticleRenderHook {
  upsertBatch(): ParticleBatchHandle { throw new Error("PARTICLE_PASS_PENDING"); }
  writeInstances(): void { throw new Error("PARTICLE_PASS_PENDING"); }
  removeBatch(): void { /* no-op so stub handles can always be released */ }
}

export const particleRenderHookSlot: ContractSlot<(device: RenderDevice) => ParticleRenderHook> =
  defineContractSlot("C-20", "prd07", "A3D_QR_VFX", () => new StubParticleRenderHook());

export const PARTICLE_PROGRAM_DEFINES: readonly ["PARTICLE_SOURCE", "STRETCH", "SHADING_LIT", "PARTICLE_SHADOW", "SOFT_PARTICLES", "FRAME_BLEND", "BLEND_ADDITIVE", "FOG_VOLUMETRIC"] =
  ["PARTICLE_SOURCE", "STRETCH", "SHADING_LIT", "PARTICLE_SHADOW", "SOFT_PARTICLES", "FRAME_BLEND", "BLEND_ADDITIVE", "FOG_VOLUMETRIC"]; // C-07-OUT-7
