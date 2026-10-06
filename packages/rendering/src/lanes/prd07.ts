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
// select returns the fog model — "volumetric" on froxel tiers (P5), else
// "height" — only when A3D_QR_VFX_FOG is on (registry already filters it off).
try {
  registerShaderFeature({
    id: "prd07.fog",
    owner: "prd07",
    flag: "A3D_QR_VFX_FOG",
    select: (input) => input.flags.on("A3D_QR_VFX_FOG")
      ? (input.tier.volumetricFog === "analytic" ? "height" : "volumetric")
      : undefined,
    defines: (value) => ({ A3D_FOG: 1, FOG_VOLUMETRIC: value === "volumetric" ? 1 : 0 }),
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
export {
  PRD07_FOG_DEFAULTS,
  FOG_MODE,
  resolvePrd07FogSpec,
  heightFogTau,
  fogTau,
  fogAmount,
  fogInscatter,
  absorptionTransmittance,
  applyFog,
  legacyEnvironmentFogFactor,
  legacyParityFogAmount,
  legacyUniformsFromPacked,
  packLegacy,
  packV2,
  parseFogColor,
  skyHorizonRadiance
} from "../atmosphere/HeightFog";
export type { Prd07FogSpec, LegacyFogUniforms, PackedLegacyFog, PackedFogUniforms } from "../atmosphere/HeightFog";
export {
  A3D_MAX_FOG_VOLUMES,
  rayBoxSegment,
  rayEllipsoidSegment,
  rayVolumeSegmentLength,
  fogVolumesTau,
  packFogVolumes
} from "../atmosphere/FogVolumes";
export type { Prd07FogVolume } from "../atmosphere/FogVolumes";
export { PRD07_FOG_CHUNK_GLSL } from "../atmosphere/shaders/fog.glsl";
export { preethamFrame, preethamEvaluate, sunDirection } from "../atmosphere/PreethamSky";
export { VfxAtlas } from "../vfx/VfxAtlas";
export type { VfxAtlasManifest, VfxAtlasOptions, VfxAtlasSequence } from "../vfx/VfxAtlas";
export { RibbonBatch, RibbonTrail, RIBBON_VERTEX_FLOATS } from "../vfx/RibbonBatch";
export type { RibbonGeometry, RibbonOrientation, RibbonPoint, RibbonTrailOptions } from "../vfx/RibbonBatch";
export { RibbonPass, RIBBON_VERTEX_FORMAT } from "../vfx/RibbonPass";
export { MeshParticleBatch, MESH_INSTANCE_FLOATS } from "../vfx/MeshParticleBatch";
export type { MeshParticleBatchOptions, MeshParticleSpawn } from "../vfx/MeshParticleBatch";
export { BeamPass } from "../vfx/BeamPass";
export type { BeamDrawSpec } from "../vfx/BeamPass";
export { MeshParticlePass } from "../vfx/MeshParticlePass";
export type { MeshParticleFeed } from "../vfx/MeshParticlePass";
export { BEAM_SHADER_MARKER, beamVertexSource, beamFragmentSource, beamProgramKey } from "../vfx/shaders/beam.glsl";
export { MESH_PARTICLE_SHADER_MARKER, meshParticleVertexSource, meshParticleFragmentSource } from "../vfx/shaders/mesh-particle.glsl";
