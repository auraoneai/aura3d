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
import { registerPrd07VolumeChunk } from "../vfx/shaders/volume.glsl";
import { prd07WetnessState } from "../atmosphere/shaders/wetness.glsl";
import { TextureBinding } from "../TextureBinding";

// C-20 / C-21 provides — real implementations keyed by device.
particleRenderHookSlot.provide((device) => particlePassFor(device));
skyBackgroundSlot.provide((device) => skyPassFor(device));

// Frame contributors: prd07.particles, .sky, .decals, .volumetric.
registerPrd07Contributors();

// C-02 shader chunks for every PRD 07 program.
registerParticleChunks();
registerSkyChunks();
registerPrd07Chunks();
registerPrd07VolumeChunk();

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
    flag: "A3D_QR_VFX",
    select: () => true,
    defines: () => ({ A3D_WETNESS: 1 }),
    chunks: [WETNESS_CHUNK_NAME],
    hooks: ["fragment:material"],
    // §6.8 globals — driven by AtmosphereWetness/WeatherVolume via
    // setPrd07WetnessState (bindUniforms sees no blackboard; module store).
    bindUniforms: (_value, _item, set) => {
      const w = prd07WetnessState();
      set("u_wetness", w.wetness);
      set("u_puddleThreshold", w.puddleThreshold);
      set("u_rainRipples", w.rainRipples);
      set("u_snowCover", w.snowCover);
      set("u_puddleNoise", new TextureBinding({ name: "u_puddleNoise", texture: w.puddleNoise, required: false }));
    }
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
export { ParticleGpuSim, particleGpuSimAvailable, gpuSimCpuStep, gpuSimEmit, a3dValueNoise, a3dCurlNoise } from "../vfx/ParticleGpuSim";
export type { GpuSimSpec, GpuSimEmitterSpec, ParticleGpuSimState } from "../vfx/ParticleGpuSim";
export { PRD07_GPU_SIM_MARKER, gpuSimVertexSource, gpuSimPositionFragmentSource, gpuSimVelocityFragmentSource } from "../vfx/shaders/gpu-sim.glsl";
export { ProceduralVolumeEmitter, VOLUME_PRESETS, proceduralVolumePos, proceduralVolumeEdgeFade, a3dHash31Cpu } from "../vfx/ProceduralVolumeEmitter";
export type { VolumeEmitterSpec } from "../vfx/ProceduralVolumeEmitter";
export { PRD07_VOLUME_CHUNK_GLSL, registerPrd07VolumeChunk } from "../vfx/shaders/volume.glsl";
export { VolumetricFogPass, froxelGridFor, invertRigid } from "../atmosphere/VolumetricFogPass";
export type { FroxelGridSpec, VolumetricFogPassInput } from "../atmosphere/VolumetricFogPass";
export { resolveQrVolumetricFog, qrVolumetricModeForTier, qrVolumetricColor } from "../VolumetricFog";
export type { QrVolumetricMode, QrVolumetricFogParams, QrVolumetricResolution } from "../VolumetricFog";
export { PRD07_WETNESS_CHUNK_GLSL, setPrd07WetnessState, prd07WetnessState, applyWetnessMaterialCpu, noteWetnessPending, resetWetnessPending } from "../atmosphere/shaders/wetness.glsl";
export { volumetricInjectVertexSource, volumetricInjectFragmentSource, PRD07_VOLUMETRIC_MARKER } from "../atmosphere/shaders/volumetric-inject.glsl";
export { volumetricIntegrateVertexSource, volumetricIntegrateFragmentSource } from "../atmosphere/shaders/volumetric-integrate.glsl";
export { volumetricApplyVertexSource, volumetricApplyFragmentSource } from "../atmosphere/shaders/volumetric-apply.glsl";
export { preethamFrame, preethamEvaluate, sunDirection } from "../atmosphere/PreethamSky";
export { VfxAtlas } from "../vfx/VfxAtlas";
export type { VfxAtlasDecal, VfxAtlasManifest, VfxAtlasManifestDecals, VfxAtlasOptions, VfxAtlasSequence } from "../vfx/VfxAtlas";
export { RibbonBatch, RibbonTrail, RIBBON_VERTEX_FLOATS } from "../vfx/RibbonBatch";
export type { RibbonGeometry, RibbonOrientation, RibbonPoint, RibbonTrailOptions } from "../vfx/RibbonBatch";
export { RibbonPass, RIBBON_VERTEX_FORMAT } from "../vfx/RibbonPass";
export { MeshParticleBatch, MESH_INSTANCE_FLOATS } from "../vfx/MeshParticleBatch";
export type { MeshParticleBatchOptions, MeshParticleSpawn } from "../vfx/MeshParticleBatch";
export { BeamPass } from "../vfx/BeamPass";
export type { BeamDrawSpec } from "../vfx/BeamPass";
export { MeshParticlePass } from "../vfx/MeshParticlePass";
export type { MeshParticleFeed } from "../vfx/MeshParticlePass";
export { DecalBatch, DECAL_TIER_CAP, DECAL_VERTEX_FLOATS, decalQuadGeometry, decalLifeAlpha, ribbonStripToDecalGeometry } from "../vfx/DecalBatch";
export type { DecalBlendMode, DecalGeometry, DecalSlotOptions, DecalVertexData } from "../vfx/DecalBatch";
export { DecalPass, DECAL_VERTEX_FORMAT } from "../vfx/DecalPass";
export type { DecalPassOptions, DecalTextureResolver } from "../vfx/DecalPass";
export { DECAL_SHADER_MARKER, decalVertexSource, decalFragmentSource, decalProgramKey } from "../vfx/shaders/decal.glsl";
export { PARTICLE_GPU_BUDGET_MS, particleGpuBudgetMs, LowResAutoBudget, LowResParticleTarget } from "../vfx/LowResParticles";
export { LOWRES_COMPOSITE_SHADER_MARKER, lowResCompositeVertexSource, lowResCompositeFragmentSource, lowResCompositeProgramKey } from "../vfx/shaders/lowresComposite.glsl";
export type { LowResCompositeDefines } from "../vfx/shaders/lowresComposite.glsl";
export type { DecalProgramDefines } from "../vfx/shaders/decal.glsl";
export { BEAM_SHADER_MARKER, beamVertexSource, beamFragmentSource, beamProgramKey } from "../vfx/shaders/beam.glsl";
export { MESH_PARTICLE_SHADER_MARKER, meshParticleVertexSource, meshParticleFragmentSource } from "../vfx/shaders/mesh-particle.glsl";
