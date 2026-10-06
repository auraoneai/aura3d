// Lane prd07 barrel — real C-20/C-21 implementations + PRD 07 registrations
// (CONTRACTS.md §3.8). All behaviour stays behind A3D_QR_VFX_* flags: with the
// flags off, contributors are inactive and the slots' factories are unused.

import { particleRenderHookSlot } from "../contracts/particles";
import { skyBackgroundSlot } from "../contracts/atmosphere";
import { registerShaderFeature } from "../contracts/program";
import type { QrFlags } from "../contracts";
import { setRendererQrFlags } from "../renderer/FrameGraph";
import { particlePassFor, registerPrd07Contributors } from "../vfx/contributors";
import { skyPassFor } from "../atmosphere/SkyBackgroundPass";
import { registerParticleChunks } from "../vfx/shaders/particle.glsl";
import { registerSkyChunks } from "../atmosphere/sky.glsl";
import { registerPrd07Chunks, FOG_CHUNK_NAME, WETNESS_CHUNK_NAME } from "../atmosphere/fogChunks";

// C-20 / C-21 provides — real implementations keyed by device.
particleRenderHookSlot.provide((device) => particlePassFor(device));
skyBackgroundSlot.provide((device) => skyPassFor(device));

// Frame contributors: prd07.particles, .sky, .decals, .volumetric.
registerPrd07Contributors();

// C-02 shader chunks for every PRD 07 program.
registerParticleChunks();
registerSkyChunks();
registerPrd07Chunks();

// C-02 feature: fog attachment for PRD 07 programs (flag-gated by the registry).
try {
  registerShaderFeature({
    id: "prd07.fog",
    owner: "prd07",
    flag: "A3D_QR_VFX_FOG",
    select: () => true,
    defines: () => ({ A3D_FOG: 1 }),
    chunks: [FOG_CHUNK_NAME],
    hooks: ["fragment:fog"]
  });
  registerShaderFeature({
    id: "prd07.wetness",
    owner: "prd07",
    flag: "A3D_QR_VFX_FOG",
    select: () => true,
    defines: () => ({ A3D_WETNESS: 1 }),
    chunks: [WETNESS_CHUNK_NAME],
    hooks: ["fragment:material"]
  });
} catch (error) {
  // Idempotent: a second import must not throw on the duplicate-id path.
  if (!(error instanceof Error && error.message.startsWith("SHADER_FEATURE"))) throw error;
}

/**
 * PRD 15's `setRendererQrFlags` has no caller yet (qr-request filed). Lane 07
 * needs renderer-side flags so its contributors gate on the app's resolved
 * flags; the engine's `effects` extension calls this from its create() with
 * the app's `qrFlags`. Global store — last app wins; flagged on the CCR.
 */
export function bindPrd07RendererFlags(flags: QrFlags): void {
  setRendererQrFlags(flags);
}

export { particlePassFor } from "../vfx/contributors";
export { skyPassFor, skyDrawPassFor, SkyBackgroundPass } from "../atmosphere/SkyBackgroundPass";
export { ParticleBatchPass } from "../vfx/ParticleBatchPass";
export type { ParticlePassDiagnostics } from "../vfx/ParticleBatchPass";
export { ParticleInstanceRing, PARTICLE_INSTANCE_FLOATS } from "../vfx/ParticleInstanceLayout";
export { skyFrame, evaluateSky } from "../atmosphere/SkyEval";
export { preethamFrame, preethamEvaluate, sunDirection } from "../atmosphere/PreethamSky";
export { VfxAtlas } from "../vfx/VfxAtlas";
export type { VfxAtlasManifest, VfxAtlasOptions, VfxAtlasSequence } from "../vfx/VfxAtlas";
