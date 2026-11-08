import { remapDepthCompare, resolveDepthDrawState, type DepthConvention } from "./DepthConvention";
import { Geometry } from "./Geometry";
import { VertexBuffer } from "./VertexBuffer";
import { IndexBuffer } from "./IndexBuffer";
import { type CollectedLight } from "./LightCollector";
import { LightUniforms, type LocalShadowedLight, type PackedLightsWithSelection, type PackedLightUniforms } from "./LightUniforms";
import { Material, renderStateHasExtendedCommandFields, type RenderState } from "./Material";
import { isFlatUniformValue, MaterialBinding, MaterialBindingError } from "./MaterialBinding";
import { flattenPortableDataUniform } from "./webgl2/UniformDataFlatten";
import { MaterialInstance } from "./MaterialInstance";
import { PortableShaderMaterial, type PortableShaderUniformDescriptor } from "./PortableShaderMaterial";
import { DepthPreviewMaterial } from "./DepthPreviewMaterial";
import { PBRMaterial } from "./PBRMaterial";
import { TexturedPBRMaterial } from "./TexturedPBRMaterial";
import { InstancedPBRMaterial } from "./InstancedPBRMaterial";
import { InstancedUnlitMaterial } from "./InstancedUnlitMaterial";
import { SkinnedLitMaterial } from "./SkinnedLitMaterial";
import { ScreenSpaceLineMaterial } from "./ScreenSpaceLineMaterial";
import { cullInstancesToFrustum, MIN_CULLED_INSTANCES, type InstanceFrustumCullResult } from "./renderer/InstanceFrustumCull";
import { type DrawCommand, type InstanceVertexAttribute, type RecursiveUniformValue, type RenderBuffer, type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { RenderPipeline } from "./RenderPipeline";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { MAX_UNIFORM_SKINNING_JOINTS as SHADER_MAX_UNIFORM_SKINNING_JOINTS } from "./ShaderChunks";
import { type SkinningCpuFallbackReason } from "./WebGPUSkinningLimits";
import { ShaderModule } from "./ShaderModule";
import { formatShaderFailure, isShaderFailureError, reportShaderFailure, resolveShaderFailureMode, type ShaderFailureMode } from "./ShaderFailures";
import { createLeanCoreShaderLibrary, DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME, DEFAULT_UNLIT_SHADER_NAME, type ShaderLibrary } from "./ShaderLibraryCore";
import { type ShadowFilterKernel } from "./ShadowMap";
import type { ShadowPcfTapTier } from "./shadows/ShadowFilterTier";
import type { ForwardSpotShadowMapOptions } from "./shadows/SpotShadowMaps";
import { isTextureBinding, TextureBinding } from "./TextureBinding";
import { Texture } from "./Texture";
import { Sampler } from "./Sampler";
import { UnlitMaterial } from "./UnlitMaterial";
import { sortRenderQueueItems, type RenderQueueBucket } from "./performance/RenderItemSorting";
import { resolveBloomWeight, SELECTIVE_BLOOM_FEATURE } from "./postprocess/NativeBloomPyramid";
import { registeredVelocityFeature } from "./post/chunks/velocity.glsl";
import { blendQueueForState, blendStateIsTransparent } from "./BlendModes";
import { renderStateKey } from "./contracts/blend";
import type { RenderCommandState } from "./RenderDevice";
import { type RenderItem } from "./contracts/renderItem";
import { hasPotentiallyActiveFrameContributors, type FrameContributorContext } from "./contracts/frameGraph";
import { instanceBufferSlot, type InstanceBufferLike } from "./contracts/geometry";
import { VertexFormat } from "./VertexFormat";
import { MAX_LIGHTS_PER_CLUSTER, type ClusteredForwardLightingResources } from "./ClusteredForwardLighting";
import { allShaderFeatures, potentiallyActiveShaderFeatures, programCacheSlot, shaderFeaturesFor, type ProgramCacheLike, type ProgramFeatures, type ShaderFeature } from "./contracts/program";
import { materialLobes, potentiallyActiveMaterialLobes } from "./contracts/materialLobes";
import { normalizeProgramFeatures, PROGRAM_CLIPPING_FEATURE, PROGRAM_LOG_DEPTH_FEATURE, PROGRAM_REVERSED_FOG_DEPTH_FEATURE, PROGRAM_OUTPUT_SRGB_FEATURE, PROGRAM_TRANSPARENCY_FEATURE, NATIVE_PROBE_GRID_FEATURE, NATIVE_VOXEL_INDIRECT_FEATURE, NATIVE_BAKED_LIGHTMAP_FEATURE, LEGACY_POINT_SHADOW_FEATURE, LEGACY_SPOT_SHADOW_FEATURE, PHOTOMETRIC_PROFILE_FEATURE, PROJECTED_SPOT_FEATURE, DEPTH_COVERAGE_FEATURE } from "./program/ProgramFeatures";
import { weightedTransparencyIneligibility, type WeightedTransparencyBindings, type WeightedTransparencyPhase } from "./transparency/WeightedTransparency";
import { featuresForGeometry, geometryHasSkin, materialFeatureWarning, materialRoutesToGeneratedProgram, withLiveAlphaCutoff } from "./program/MaterialFeatures";
import { bindShaderFeatureUniforms, makeShaderFeatureReplayGuard, selectShaderFeatureBits, stockArrayMatches, stockFeatureVerifier } from "./program/FeatureSelect";
import { bindMaterialLobeUniforms, observeSelectiveLobes, withLivePhysicalMapFeatures } from "./materials/PhysicalFeatures";
import { isPrd04ReplaySafeFeature, isStockPrd04ShaderFeature } from "./materials/features";
import { isReplaySafePrd04Lobe, isStockPrd04Lobe } from "./materials/lobes";
import { QUALITY_TIERS, type AuraQualityTierSettings } from "./contracts/quality";
import { rendererQrFlags } from "./renderer/FrameGraph";
import { qrCoreGeneratorOn, qrE3CompilerLightingOn, qrGeneratedProgramsOn, qrMaterialsLobeProgramsOn, rendererProgramCache, rendererProgramCachePeek, rendererAuraFrame } from "./renderer/qrSubFlags";
import { isTrustedQrFlags, type QrFlags } from "./contracts/core";
import { PRD02_IBL_FEATURE, type EnvironmentProbe } from "./contracts/environment";
import { packA3DEnvironmentUniforms } from "./environment/EnvUniforms";
import { dfgLutBinding, dfgLutTexture } from "./program/DFGLut";
import { PRD02_LOCAL_PROBE_FEATURE, PRD02_IRRADIANCE_VOLUME_FEATURE, prd02ItemProbeBindings, prd02ItemIrradianceBindings } from "./probes/ProbeBoxProjection";
import { advancedLightingFeatures, advancedLightingItemBinding } from "./lighting/AdvancedLightingBindings";
import { buildPhotometricProfileBindings, type PhotometricProfileBindings } from "./lighting/PhotometricProfileBindings";
import type { PhotometricFrameIdentity, PhotometricFrameLease, PhotometricFrameResources, PhotometricProfileIssue } from "./lighting/PhotometricFrameResources";
import { buildProjectedSpotBindings, type ProjectedSpotBindings, type ProjectedSpotFrameIdentity, type ProjectedSpotFrameLease, type ProjectedSpotResource } from "./lighting/ProjectedSpotBindings";
import { createClippingBinding, createClippingUniforms, type ClippingBinding, type ClippingGroupInput } from "./ClippingPlanes";
import { batchMembersFor, expandLogicalBatchItems, hasCombinedDrawIntent, isEngineBatchInstanceItem, isEnginePackedBatchItem, packedLoopCandidate, packedLoopMemberFor } from "./batching/BatchMembers";
import { createClippedScreenSpaceLineShader, LINE_CLIP_INVERSE_TRANSFORM } from "./forward/ScreenSpaceLineClipping";
import { certifiedDefaultScreenLineSource, isUnmodifiedDefaultShaderLibrary } from "./renderer/TrustedShaderLibrary";
import { trustedShaderVariantOptions } from "./renderer/TrustedShaderVariants";
import { NativePointQuadArena, type NativePointQuadDevice } from "./webgpu/NativePointQuads";
import type { WebGPUNativePointViewport } from "./WebGPUDevice";
import { frameUniformsSlot } from "./contracts/frameUniforms";
import { programKey } from "./program/ProgramKey";
import { isStockPrd02IblBloomFeature } from "./environment/Prd02IblShaderFeature";
import { isStockPrd07BloomFeature } from "./atmosphere/Prd07ShaderFeatures";
import { isStockCameraFadeBloomFeature } from "./shaders/camera-fade.glsl";
import { webgl2DeviceHost } from "./webgl2/Counters";


// PR 0b-2 re-imports for moved carve-out modules (CONTRACTS.md §3.3).
import { SkinningPaletteUploadManager, applyGpuMorphUniforms, resolveRenderGeometry } from "./forward/Deform.js";
import { resolveContactShadowMask, type ContactShadowMaskScope } from "./forward/contactShadowMaskStore.js";
import { FORWARD_DIRECT_LIGHT_CAPACITY, applyClusteredLightingUniforms, applyForwardLocalShadowUniforms, applyForwardShadowMapUniforms, resolveForwardClusteredLighting, selectForwardShadowMap, DEFAULT_FORWARD_SHADOW_FILTER_KERNEL, packForwardShadowPcfSamples, prd02ShadowStrengthDefault } from "./forward/Lighting.js";
import { applyShadowPcfTapTier } from "./shadows/ShadowFilterTier";
import { createForwardDrawCommand, flushMultiDrawQueue, submitDraw } from "./forward/DrawSubmit.js";
import { bindVelocityUniforms, isReplaySafeVelocityBinder, velocityFramePrepared } from "./forward/Velocity.js";
import { A3D_INSTANCE_EMISSIVE_ATTRIBUTE, isInstanceColorReplaySafeFeature, isStockInstanceColorTargetFeature, materialInstanceColorTarget, registerInstanceColorTargetFeature } from "./shaders/chunks/instance_color_target.glsl";
import { PRD02_IBL_SHADER_FEATURE } from "./shaders/Prd02IblFeature";
import { PRD02_SHADOW_FILTER_FEATURE } from "./shadows/Prd02ShadowFilter";
import { indirectFractionFeature } from "./post/chunks/indirectFraction.glsl";
import { lodDitherFeature } from "./shaders/lod-dither.glsl";
import { debugViewFeature } from "./shaders/debug-view.glsl";
import { cameraFadeFeature } from "./shaders/camera-fade.glsl";
import { isOriginalPrd07FeatureIdentity, originalPrd07FeatureFlag } from "./vfx/replayFeatureIdentity";
import { isOriginalBatchedDrawFeature } from "./batching/shaders/ParityBatchDraw";
import { isOriginalPrd11DrawIdFeature } from "./batching/shaders/drawId.glsl";
import { isOriginalPrd11InstanceEmissiveFeature } from "./batching/shaders/instanceEmissive.glsl";
import { combinedWebGLDevice } from "./batching/CombinedWebGLDevice";
import { combinedForwardEntries } from "./batching/CombinedForwardEntries";
import { MAX_COMBINED_DRAW_PLAN_ITEMS, planCombinedDrawRuns, type CombinedDrawPlanRun } from "./batching/CombinedDrawPlanner";
import { stageCombinedDrawData, type StagedCombinedDrawData } from "./batching/CombinedDrawData";
import { withCombinedDrawCarrier, isActiveCombinedDrawCarrier } from "./batching/CombinedDrawCarrier";
import { packedLoopDrawDataCurrent, retainPackedLoopDrawData } from "./batching/BatchMembers";
import { drawDataBindingFor } from "./batching/DrawDataTexture";
import { WebGL2Device } from "./WebGL2Device";
import { staticGeneratedCacheCapability, type StaticGeneratedCacheCapability } from "./program/StaticGeneratedCacheCapability";

export type { RenderItem };

// This pass-local permission is installed only by the renderer's simple
// explicit-item frame. The backend independently authenticates every ticket.
const staticUnlitPairFrames = new WeakMap<ForwardPass, () => boolean>();

/** @internal Renderer-owned frame authorization; not a public batching API. */
export function authorizeRendererStaticUnlitPairs(pass: ForwardPass, isCurrent: () => boolean): void {
  staticUnlitPairFrames.set(pass, isCurrent);
}

/**
 * GU47 E-D: the `prd04.instanceColorTarget` ShaderFeature. Registered when this module loads, so the renderer warmup
 * sees it, and again (idempotently) by every ForwardPass in case a module cycle deferred the first call. It never selects
 * for a material that does not carry its parameter, so existing programs are unchanged. (The rim term is the existing
 * PRD-04 `prd04.rim` feature, registered by `lanes/prd04.ts`; see `shaders/chunks/rim.glsl.ts`.)
 */
function ensureGu47ForwardFeatures(): void {
  registerInstanceColorTargetFeature();
}
try {
  ensureGu47ForwardFeatures();
} catch {
  // contracts/program not initialised yet (import cycle): the ForwardPass constructor registers them.
}

/**
 * GU47 E-D (ED-8): per-draw uniform extension point. A hook runs for every forward draw after the built-in binds and may
 * write extra uniforms the program reflects (for example an object-ID mask a post pass reads). No hook is registered by
 * default, so draws are unchanged. Generated programs can also use `ShaderFeature.bindUniforms`.
 */
export interface ForwardDrawHook {
  readonly id: string;
  bind(item: RenderItem, shader: RenderShaderProgram, set: (name: string, value: UniformValue) => void): void;
}

const forwardDrawHooks: ForwardDrawHook[] = [];

/** Frame replay must not invoke caller-provided draw hooks a second time. */
export function hasForwardDrawHooks(): boolean { return forwardDrawHooks.length > 0; }

const isCoreReplaySafeFeature = makeShaderFeatureReplayGuard([
  PRD02_IBL_SHADER_FEATURE, PRD02_SHADOW_FILTER_FEATURE, indirectFractionFeature, lodDitherFeature, debugViewFeature, cameraFadeFeature
]);

// A replay proof is scoped to the built-ins loaded with this module. Capture
// descriptors as well as function identities: replacing a getter, inserting a
// method or changing a prototype's parent can introduce a second user callback.
const replayPrototypes = [
  Material.prototype, MaterialInstance.prototype, PBRMaterial.prototype, TexturedPBRMaterial.prototype,
  InstancedPBRMaterial.prototype, InstancedUnlitMaterial.prototype, SkinnedLitMaterial.prototype, UnlitMaterial.prototype,
  Geometry.prototype, VertexBuffer.prototype, IndexBuffer.prototype, VertexFormat.prototype,
  TextureBinding.prototype, Texture.prototype, Sampler.prototype
].map((prototype) => ({
  prototype,
  parent: Object.getPrototypeOf(prototype) as object | null,
  descriptors: Object.getOwnPropertyDescriptors(prototype)
}));

function replayPrototypesUnchanged(): boolean {
  return replayPrototypes.every(({ prototype, parent, descriptors }) => {
    if (Object.getPrototypeOf(prototype) !== parent) return false;
    const keys = Reflect.ownKeys(descriptors);
    if (Reflect.ownKeys(prototype).length !== keys.length) return false;
    return keys.every((key) => {
      const before = Reflect.get(descriptors, key) as PropertyDescriptor;
      const after = Object.getOwnPropertyDescriptor(prototype, key);
      return after !== undefined && after.value === before.value && after.get === before.get && after.set === before.set
        && after.writable === before.writable && after.enumerable === before.enumerable && after.configurable === before.configurable;
    });
  });
}

/** Reject instance-owned methods and accessors which would bypass the snapshots. */
function replayBuiltinObject(value: object, prototype: object): boolean {
  if (Object.getPrototypeOf(value) !== prototype) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && !descriptor.get && !descriptor.set && typeof descriptor.value !== "function";
  });
}

const POOLED_PRIMITIVE_GEOMETRY = Symbol.for("@aura3d/rendering:pooledPrimitiveGeometry");

/**
 * The compiler's pooled primitive handle (`QrSharedPrimitiveGeometry`) is a `Geometry` subclass whose only added
 * behaviour is a `dispose()` that releases a pool reference. It never runs during a draw, so contact depth may treat it
 * like a plain geometry. Proven structurally: a direct subclass of Geometry carrying the registered marker, with exactly
 * `constructor` and `dispose` on its prototype, and no own accessors or functions on the instance.
 */
function pooledPrimitiveGeometry(geometry: Geometry): boolean {
  const prototype = Object.getPrototypeOf(geometry) as object | null;
  if (!prototype || Object.getPrototypeOf(prototype) !== Geometry.prototype) return false;
  if (Object.getOwnPropertyDescriptor(prototype, POOLED_PRIMITIVE_GEOMETRY)?.value !== true) return false;
  const keys = Reflect.ownKeys(prototype).filter((key) => key !== POOLED_PRIMITIVE_GEOMETRY);
  if (keys.length !== 2 || !keys.includes("constructor") || !keys.includes("dispose")) return false;
  return Reflect.ownKeys(geometry).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(geometry, key);
    return descriptor !== undefined && !descriptor.get && !descriptor.set && typeof descriptor.value !== "function";
  });
}

/** `allowPooled` is for the contact-shadow depth proof only; replay and batching keep the plain-Geometry rule. */
function replayGeometrySafe(geometry: Geometry, allowPooled = false): boolean {
  if (!replayBuiltinObject(geometry, Geometry.prototype) && !(allowPooled && pooledPrimitiveGeometry(geometry))) return false;
  const streams = [geometry.vertexBuffer, ...geometry.additionalVertexBuffers];
  if (streams.some((stream) => !replayBuiltinObject(stream, VertexBuffer.prototype)
    || !replayBuiltinObject(stream.format, VertexFormat.prototype))) return false;
  return geometry.indexBuffer === null || replayBuiltinObject(geometry.indexBuffer, IndexBuffer.prototype);
}

function replayMaterialTexturesSafe(material: Material | MaterialInstance): boolean {
  try {
    for (const value of material.getParameters().values()) {
      if (!isTextureBinding(value)) continue;
      if (!replayBuiltinObject(value, TextureBinding.prototype) || !replayBuiltinObject(value.sampler, Sampler.prototype)
        || (value.texture && !replayBuiltinObject(value.texture, Texture.prototype))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Callback-free proof of the providers that may run during a forward draw. */
export function forwardDrawProvidersSafe(flags: QrFlags, allowCombinedProviders = false): boolean {
  return forwardDrawProvidersUnsafeReason(flags, allowCombinedProviders) === undefined;
}

/** Why `forwardDrawProvidersSafe` is false (a short diagnostic token), or undefined when the providers are verified. */
function forwardDrawProvidersUnsafeReason(flags: QrFlags, allowCombinedProviders = false, skipFeature?: (feature: ShaderFeature) => boolean): string | undefined {
  if (!isTrustedQrFlags(flags)) return "untrusted-flags";
  if (forwardDrawHooks.length) return "forward-draw-hooks";
  if (!isReplaySafeVelocityBinder()) return "velocity-binder";
  if (!replayPrototypesUnchanged()) return "modified-prototypes";
  for (const feature of allShaderFeatures()) {
    if (isOriginalPrd07FeatureIdentity(feature) && originalPrd07FeatureFlag(feature) === undefined) return `prd07-feature:${feature.id}`;
  }
  // Activation uses the registry's immutable registration-time flag, so this
  // list is safe to filter without touching a provider's properties. Identity
  // guards inspect descriptors only for known built-in plain objects.
  for (const feature of potentiallyActiveShaderFeatures(flags)) {
    if (skipFeature?.(feature)) continue;
    if (!isCoreReplaySafeFeature(feature) && !isPrd04ReplaySafeFeature(feature) && !isInstanceColorReplaySafeFeature(feature)
      && !(allowCombinedProviders && (isOriginalBatchedDrawFeature(feature) || isOriginalPrd11DrawIdFeature(feature)
        || isOriginalPrd11InstanceEmissiveFeature(feature)))) return `feature:${String(feature.id)}`;
  }
  for (const lobe of potentiallyActiveMaterialLobes(flags)) if (!isReplaySafePrd04Lobe(lobe)) return `lobe:${String((lobe as { id?: unknown }).id)}`;
  return undefined;
}

/**
 * Providers a contact-shadow frame needs verified. The mask depth is drawn by its own lean library that runs no shader
 * feature, so a feature can only matter by changing the geometry or coverage a participant presents to the camera:
 * those are the deform/alpha hooks the contact contributor asks, participant by participant, and leaves out of the mask
 * depth when selected. Every other feature (fog, IBL, filters, rim, debug) cannot change that depth and is not a veto.
 * Draw hooks, unverified prototypes/velocity binder and unverified material lobes still veto.
 */
function forwardContactProvidersUnsafeReason(flags: QrFlags): string | undefined {
  return forwardDrawProvidersUnsafeReason(flags, false, () => true);
}

function forwardContactProvidersSafe(flags: QrFlags): boolean {
  return forwardContactProvidersUnsafeReason(flags) === undefined;
}

/**
 * Renderer-level contact guard. Strict keeps the full replay proof. Otherwise the providers above must verify and no
 * draw may run a per-draw callback (the forward pass refuses to draw with a published mask in that case); participants
 * the mask depth cannot represent are handled one by one by the contact contributor.
 */
function forwardContactFrameUnsafeReason(items: readonly RenderItem[], flags: QrFlags, strict: boolean): string | undefined {
  if (strict) return forwardDrawReplayUnsafeReason(items, flags);
  const providers = forwardContactProvidersUnsafeReason(flags);
  if (providers) return `provider ${providers}`;
  const bad = items.find(item => item.onBeforeRender);
  return bad ? `draw callback ${bad.label ?? "unlabelled"}` : undefined;
}

const forwardDegradedWarned = new Set<string>();
/** One console warning per code and material per page for a forward feature that degrades instead of failing the frame. */
function warnForwardDegradedOnce(code: string, material: string | undefined, detail: string): void {
  const key = `${code}:${material ?? ""}`;
  if (forwardDegradedWarned.has(key)) return;
  forwardDegradedWarned.add(key);
  console.warn(`${code}: material "${material ?? "unnamed"}" ${detail}`);
}

/** A repeated opaque draw may only use built-in callbacks with unchanged
 * identities. The caller must also reject custom or mutated shader libraries. */
export function forwardDrawReplaySafe(items: readonly RenderItem[], flags: QrFlags): boolean {
  return forwardDrawReplayUnsafeReason(items, flags) === undefined;
}

/** Diagnostic form of `forwardDrawReplaySafe`: which provider or participant fails, or undefined when all are verified. */
function forwardDrawReplayUnsafeReason(items: readonly RenderItem[], flags: QrFlags): string | undefined {
  const providers = forwardDrawProvidersUnsafeReason(flags);
  if (providers) return `provider ${providers}`;
  const bad = items.find(item => !forwardBuiltinParticipantSafe(item));
  return bad ? `participant ${bad.label ?? "unlabelled"}` : undefined;
}

/** Contact depth relies on the same built-in participant methods throughout
 * the frame. Portable/custom graph carriers need a separate identity proof. */
export function forwardContactParticipantSafe(item: RenderItem, flags: QrFlags): boolean {
  return forwardContactGeometrySafe(item, flags) && builtinParticipantSafe(item, true);
}

/** Common plain-item and geometry portion for graph-specific contact proofs. */
export function forwardContactGeometrySafe(item: RenderItem, flags: QrFlags): boolean {
  return forwardContactProvidersSafe(flags) && replayBuiltinObject(item, Object.prototype)
    && !item.onBeforeRender && replayGeometrySafe(item.geometry, true);
}

function forwardBuiltinParticipantSafe(item: RenderItem): boolean {
  return builtinParticipantSafe(item, false);
}

function builtinParticipantSafe(item: RenderItem, allowPooledGeometry: boolean): boolean {
  if (item.onBeforeRender || !replayGeometrySafe(item.geometry, allowPooledGeometry)) return false;
  const input = item.material;
  if (!input) return true;
  if (input instanceof MaterialInstance && !replayBuiltinObject(input, MaterialInstance.prototype)) return false;
  const material = input instanceof MaterialInstance ? input.baseMaterial : input;
  if (material instanceof PortableShaderMaterial) return false;
  const prototype = Object.getPrototypeOf(material);
  if (![PBRMaterial.prototype, TexturedPBRMaterial.prototype, InstancedPBRMaterial.prototype, InstancedUnlitMaterial.prototype, SkinnedLitMaterial.prototype, UnlitMaterial.prototype].includes(prototype)
    || !replayBuiltinObject(material, prototype)) return false;
  return replayMaterialTexturesSafe(input);
}

const staticUnlitItemFields = new Set([
  "geometry", "material", "label", "temporalObjectKey", "drawRange", "includeInAutoFrame", "modelMatrix", "normalMatrix",
  "modelViewProjectionMatrix", "boundingBoxCenter", "castShadow", "receiveShadow", "renderOrder", "frustumCulled", "layerMask", "userData"
]);
const staticUnlitParameters = new Set([
  "u_baseColor", "u_pointSize", "u_roundPoints", "u_pointSizeAttenuation", "u_alphaCutoff", "u_spriteMode",
  "u_spriteRotation", "u_spriteCenter", "u_spriteSizeAttenuation", "u_modelViewProjection", "u_instanceMatrices",
  "u_instanceCount", "u_instanceAttributeMode"
]);

/** The prospective binding may inspect only built-in numeric values. */
function staticUnlitNumericValue(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (ArrayBuffer.isView(value)) {
    if (Object.getPrototypeOf(value) !== Float32Array.prototype || !(value.buffer instanceof ArrayBuffer)
      || !replayBuiltinObject(value, Float32Array.prototype)) return false;
    return (value as Float32Array).every(Number.isFinite);
  }
  if (!Array.isArray(value) || !replayBuiltinObject(value, Array.prototype)) return false;
  return value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function staticUnlitMaterialSafe(material: UnlitMaterial): boolean {
  if (!replayBuiltinObject(material, UnlitMaterial.prototype) || material.disposed
    || material.shaderKey !== DEFAULT_UNLIT_SHADER_NAME || material.shaderVariant !== undefined) return false;
  const state = material.renderState;
  if (!replayBuiltinObject(state, Object.prototype) || state.blend || (state.blendMode !== undefined && state.blendMode !== "opaque")
    || !state.depthTest || !state.depthWrite || state.depthCompare !== "less-equal" || state.cullMode !== "back"
    || state.scissor || state.stencil || state.polygonOffset || state.alphaToCoverage || renderStateHasExtendedCommandFields(state)
    || !Array.isArray(state.colorWrite) || !replayBuiltinObject(state.colorWrite, Array.prototype)
    || state.colorWrite.length !== 4 || state.colorWrite.some((value) => value !== true)) return false;
  const parameters: unknown = Object.getOwnPropertyDescriptor(material, "parameters")?.value;
  if (!(parameters instanceof Map) || Object.getPrototypeOf(parameters) !== Map.prototype) return false;
  for (const [name, value] of parameters) {
    if (typeof name !== "string" || !staticUnlitParameters.has(name) || !staticUnlitNumericValue(value)) return false;
  }
  for (const values of [material.requiredAttributes, material.requiredUniforms, material.uniformSchema]) {
    if (!Array.isArray(values) || !replayBuiltinObject(values, Array.prototype)) return false;
  }
  return material.requiredAttributes.every((value) => typeof value === "string")
    && material.requiredUniforms.every((value) => typeof value === "string" && value !== "u_lightCount" && value !== "u_lightData")
    && material.uniformSchema.every((value) => replayBuiltinObject(value, Object.prototype));
}

function staticGeneratedUnlitFeaturesSafe(features: ProgramFeatures): boolean {
  return features.target === "glsl300es" && features.pass === "forward" && features.lighting === "unlit"
    && features.alphaMode === "opaque" && !features.doubleSided && !features.vertexColors && !features.flatShading
    && !features.skinning && !features.morph && !features.instancing && !features.drawId
    && !(features as ProgramFeatures & { readonly graph?: unknown }).graph
    && Object.values(features.maps).every((value) => value === undefined) && features.extensions.length === 0
    && features.fog === "none" && features.environment === "none" && !features.backgroundCoverage
    && features.shadows.cascades === 0 && features.shadows.localShadows === 0 && !features.shadows.contact
    && Object.keys(features.features).length === 1 && features.features[PROGRAM_OUTPUT_SRGB_FEATURE] === true;
}

function staticUnlitItemSafe(item: RenderItem, generated = false): boolean {
  if (!replayBuiltinObject(item, Object.prototype)
    || Reflect.ownKeys(item).some((key) => typeof key !== "string" || (!staticUnlitItemFields.has(key) && !(generated && key === "geometryMatrix")))
    || item.onBeforeRender || !replayGeometrySafe(item.geometry) || item.geometry.topology !== "triangles" || !item.geometry.indexBuffer
    || !item.material || Object.getPrototypeOf(item.material) !== UnlitMaterial.prototype
    || isEngineBatchInstanceItem(item) || isEnginePackedBatchItem(item) || packedLoopMemberFor(item)) return false;
  // Unlike projected model matrices, an authored geometry matrix is not
  // copied by collection. Only a genuine non-shared typed value can be read
  // speculatively without invoking an array iterator or accessor.
  if (generated && item.geometryMatrix !== undefined && (!ArrayBuffer.isView(item.geometryMatrix)
    || !staticUnlitNumericValue(item.geometryMatrix))) return false;
  return !item.drawRange || replayBuiltinObject(item.drawRange, Object.prototype);
}

const staticPairDeviceDraw = WebGL2Device.prototype.draw;
const staticPairBufferCheck = WebGL2Device.prototype.hasStaticUnlitPairBuffers;
const staticPairPrepare = WebGL2Device.prototype.prepareStaticUnlitPair;
const staticPairSubmit = WebGL2Device.prototype.submitStaticUnlitPair;
const staticPairMaterialBind = MaterialBinding.prototype.bind;
const staticPairMaterialBindRecursive = MaterialBinding.prototype.bindRecursive;
const staticPairMaterialBindGenerated = MaterialBinding.prototype.bindGenerated;
const staticPairPipelineCommand = RenderPipeline.prototype.createDrawCommand;
const staticPairShaderCompile = ShaderModule.prototype.compile;
const staticPairShaderPeek = ShaderModule.prototype.peek;
const staticGeneratedPairProgram = WebGL2Device.prototype.hasStaticGeneratedUnlitProgram;
const staticGeneratedPairPrepare = WebGL2Device.prototype.prepareStaticGeneratedUnlitPair;
const staticGeneratedPairSubmit = WebGL2Device.prototype.submitStaticGeneratedUnlitPair;
const staticGeneratedDeviceDescriptors = ["hasStaticGeneratedUnlitProgram", "prepareStaticGeneratedUnlitPair", "submitStaticGeneratedUnlitPair"]
  .map((name) => [name, Object.getOwnPropertyDescriptor(WebGL2Device.prototype, name)] as const);
const staticPairDeviceDescriptors = ["draw", "createBuffer", "updateBuffer", "createShaderProgram", "isDeviceLost", "disposed", "contextLost", "generation",
  "hasStaticUnlitPairBuffers", "snapshotStaticUnlitBuffer", "prepareStaticUnlitPair", "submitStaticUnlitPair"]
  .map((name) => [name, Object.getOwnPropertyDescriptor(WebGL2Device.prototype, name)] as const);

function staticPairDeviceCurrent(device: RenderDevice): device is WebGL2Device {
  if (!(device instanceof WebGL2Device) || Object.getPrototypeOf(device) !== WebGL2Device.prototype) return false;
  return staticPairDeviceDescriptors.every(([name, before]) => {
    if (!before || Object.hasOwn(device, name)) return false;
    const after = Object.getOwnPropertyDescriptor(WebGL2Device.prototype, name);
    return !!after && after.value === before.value && after.get === before.get && after.set === before.set
      && after.writable === before.writable && after.enumerable === before.enumerable && after.configurable === before.configurable;
  });
}

function staticGeneratedDeviceCurrent(device: WebGL2Device): boolean {
  return staticGeneratedDeviceDescriptors.every(([name, before]) => {
    if (!before || Object.hasOwn(device, name)) return false;
    const after = Object.getOwnPropertyDescriptor(WebGL2Device.prototype, name);
    return !!after && after.value === before.value && after.get === before.get && after.set === before.set
      && after.writable === before.writable && after.enumerable === before.enumerable && after.configurable === before.configurable;
  });
}

interface StaticGeneratedCapture {
  readonly cache: ProgramCacheLike;
  readonly capability: StaticGeneratedCacheCapability;
  readonly features: ProgramFeatures;
  readonly program: RenderShaderProgram;
}

interface StaticUnlitCapture { command?: DrawCommand; generatedRequested?: boolean; generated?: StaticGeneratedCapture; }

// ProgramCache installs this non-enumerable discovery set only after the real
// module has already loaded. It is not an authority; the module authenticates
// its own instances before it is allowed to prewarm.
const SELECTIVE_CACHE_DISCOVERY = Symbol.for("aura3d.prd01.selectiveBloom.builtinCaches");
const stockCoreSelectiveFeatures = stockFeatureVerifier([
  indirectFractionFeature, registeredVelocityFeature, PRD02_SHADOW_FILTER_FEATURE
]);
const stockMaterialGetParameter = Material.prototype.getParameter;
const stockMaterialGetParameters = Material.prototype.getParameters;
const stockMaterialAssertAlive = Object.getOwnPropertyDescriptor(Material.prototype, "assertAlive")?.value;
const stockPbrFeatures = PBRMaterial.prototype.programFeatures;
const stockTexturedFeatures = TexturedPBRMaterial.prototype.programFeatures;
const stockUnlitFeatures = Material.prototype.programFeatures;

/** Authenticate the concrete implementation, including mutable method slots. */
function stockSelectiveMaterial(material: RenderMaterial | undefined): material is Material {
  if (!material || material instanceof MaterialInstance) return false;
  const prototype = Object.getPrototypeOf(material);
  const expected = prototype === PBRMaterial.prototype ? stockPbrFeatures :
    prototype === TexturedPBRMaterial.prototype ? stockTexturedFeatures :
    prototype === UnlitMaterial.prototype ? stockUnlitFeatures : undefined;
  if (!expected || Object.getPrototypeOf(prototype) !== Material.prototype ||
      Object.getOwnPropertyDescriptor(prototype, "getParameter") !== undefined ||
      Object.getOwnPropertyDescriptor(prototype, "getParameters") !== undefined ||
      Object.getOwnPropertyDescriptor(prototype, "assertAlive") !== undefined ||
      (prototype === UnlitMaterial.prototype && Object.getOwnPropertyDescriptor(prototype, "programFeatures") !== undefined) ||
      Object.getOwnPropertyDescriptor(material, "programFeatures") !== undefined ||
      Object.getOwnPropertyDescriptor(material, "getParameter") !== undefined ||
      Object.getOwnPropertyDescriptor(material, "getParameters") !== undefined ||
      Object.getOwnPropertyDescriptor(material, "assertAlive") !== undefined ||
      Object.getOwnPropertyDescriptor(Material.prototype, "getParameter")?.value !== stockMaterialGetParameter ||
      Object.getOwnPropertyDescriptor(Material.prototype, "getParameters")?.value !== stockMaterialGetParameters ||
      Object.getOwnPropertyDescriptor(Material.prototype, "assertAlive")?.value !== stockMaterialAssertAlive ||
      Object.getOwnPropertyDescriptor(prototype === UnlitMaterial.prototype ? Material.prototype : prototype, "programFeatures")?.value !== expected) return false;
  const parameters = Object.getOwnPropertyDescriptor(material, "parameters")?.value;
  return Object.getOwnPropertyDescriptor(material, "disposed")?.value === false &&
    parameters instanceof Map && Object.getPrototypeOf(parameters) === Map.prototype &&
    Object.getOwnPropertyDescriptor(parameters, "get") === undefined &&
    Object.getOwnPropertyDescriptor(parameters, Symbol.iterator) === undefined;
}

function stockSelectiveFeature(feature: ShaderFeature): boolean {
  return stockCoreSelectiveFeatures(feature) || isStockPrd04ShaderFeature(feature) || isStockInstanceColorTargetFeature(feature) ||
    isStockPrd02IblBloomFeature(feature) || isStockPrd07BloomFeature(feature) || isStockCameraFadeBloomFeature(feature);
}
const coreProviderFlags: QrFlags = {
  values: Object.freeze({ A3D_QR_CORE: true }),
  on: (name) => name === "A3D_QR_CORE"
};
interface TrustedSelectiveCompiler {
  readonly provider: ReturnType<typeof programCacheSlot.get>;
  readonly cacheModule: typeof import("./program/ProgramCache");
  readonly webgl: typeof import("./WebGL2Device");
  readonly compile: NonNullable<RenderDevice["compileAsync"]>;
}
let trustedSelectiveCompiler: TrustedSelectiveCompiler | undefined;
let selectiveCompilerLoading = false;
let selectiveCompilerUnavailable = false;

/**
 * Authenticate the actual lane provider without invoking it or importing the
 * generator on unrelated frames. C-02 is single-assignment. If the lane
 * module resolves successfully, its own `provide` succeeded; if an arbitrary
 * provider was installed first, the guarded import fails on the already
 * provided C-07 slot before changing any slot.
 */
function selectiveCompilerFor(cache: ProgramCacheLike, device: RenderDevice): TrustedSelectiveCompiler | "pending" | "unavailable" {
  if (!programCacheSlot.provided || !instanceBufferSlot.provided || !frameUniformsSlot.provided || !webgl2DeviceHost(device)) return "unavailable";
  const discovery = Object.getOwnPropertyDescriptor(programCacheSlot, SELECTIVE_CACHE_DISCOVERY);
  try {
    if (!discovery || !WeakSet.prototype.has.call(discovery.value, cache)) return "unavailable";
  } catch {
    return "unavailable";
  }
  const provider = programCacheSlot.get(coreProviderFlags);
  if (provider === programCacheSlot.stub) return "unavailable";
  if (trustedSelectiveCompiler) return trustedSelectiveCompiler.provider === provider ? trustedSelectiveCompiler : "unavailable";
  if (selectiveCompilerUnavailable) return "unavailable";
  if (!selectiveCompilerLoading) {
    selectiveCompilerLoading = true;
    void import("./lanes/prd01.js")
      .then(() => Promise.all([import("./program/ProgramCache.js"), import("./WebGL2Device.js")]))
      .then(([cacheModule, webgl]) => {
        const compile: unknown = Object.getOwnPropertyDescriptor(webgl.WebGL2Device.prototype, "compileAsync")?.value;
        if (programCacheSlot.get(coreProviderFlags) !== provider || typeof compile !== "function") {
          selectiveCompilerUnavailable = true;
          return;
        }
        trustedSelectiveCompiler = { provider, cacheModule, webgl, compile: compile as NonNullable<RenderDevice["compileAsync"]> };
      })
      .catch(() => { selectiveCompilerUnavailable = true; });
  }
  return "pending";
}

/** Do not invoke a custom device's compiler or an instrumented replacement. */
function selectiveCompilerMatchesDevice(compiler: TrustedSelectiveCompiler, device: RenderDevice): boolean {
  const prototype = compiler.webgl.WebGL2Device.prototype;
  return Object.getPrototypeOf(device) === prototype &&
    Object.getOwnPropertyDescriptor(device, "compileAsync") === undefined &&
    Object.getOwnPropertyDescriptor(prototype, "compileAsync")?.value === compiler.compile;
}

/** Registers a per-draw uniform hook; returns its unregister function. A duplicate id throws. */
export function registerForwardDrawHook(hook: ForwardDrawHook): () => void {
  if (forwardDrawHooks.some((entry) => entry.id === hook.id)) throw new Error(`FORWARD_DRAW_HOOK_DUPLICATE:${hook.id}`);
  forwardDrawHooks.push(hook);
  return () => {
    const index = forwardDrawHooks.indexOf(hook);
    if (index >= 0) forwardDrawHooks.splice(index, 1);
  };
}

export interface RenderItemDrawRange {
  readonly start: number;
  readonly count: number;
}

export interface RenderItemInstanceAttribute {
  readonly shaderName: string;
  readonly components: 1 | 2 | 3 | 4;
  readonly data: Float32Array | readonly number[];
  readonly normalized?: boolean;
  readonly divisor?: number;
}

export type RenderMaterial = Material | MaterialInstance;

export interface SkinningPaletteBinding {
  readonly jointCount: number;
  readonly matrices: Float32Array;
  /**
   * Second influence set for eight-influence skinning. Only meaningful when the
   * geometry carries `joints1`/`weights1` attributes and the material uses an
   * eight-influence shader.
   */
  readonly extraInfluences?: boolean;
}

/** Which GPU path carried the joint palette for a submission. */
export type SkinningPalettePath = "uniform-array" | "data-texture";

export interface SkinningPaletteDiagnostics {
  readonly submissions: number;
  readonly jointsUploaded: number;
  readonly maxJointCount: number;
  readonly uniformArraySubmissions: number;
  readonly dataTextureSubmissions: number;
  readonly eightInfluenceSubmissions: number;
  readonly cpuFallbackCount: number;
  readonly maxUniformJoints: number;
  /**
   * Per-mesh palette decision (bounded: the first 64 submissions; overflow counted in
   * `decisionOverflow`). Each entry carries the CPU-fallback reason code so a claim about
   * which path carried a rig rests on observed decisions, not inference.
   */
  readonly decisions: readonly SkinningPaletteDecisionRecord[];
  readonly decisionOverflow: number;
}

/** One observed joint-palette decision for a submitted skinned mesh. */
export interface SkinningPaletteDecisionRecord {
  readonly label: string;
  readonly jointCount: number;
  readonly path: SkinningPalettePath | "cpu";
  readonly reason: SkinningCpuFallbackReason;
  readonly cpuFallback: boolean;
}

/** Joints addressable through the uniform-array palette. Re-exported for shaders. */
export const MAX_UNIFORM_SKINNING_JOINTS = SHADER_MAX_UNIFORM_SKINNING_JOINTS;

/**
 * Upper bound on joints per skin, using the data-texture palette path.
 *
 * Chosen to stay well inside a 1024-wide RGBA32F texture (1024 joints = 4096 texels =
 * a 1024x4 texture) while covering rigs far beyond anything the uniform path allows.
 */
export const MAX_SKINNING_JOINTS = 1024;



export const MAX_GPU_MORPH_VERTICES = 64;
export const MAX_GPU_MORPH_TARGETS = 4;
export const MAX_GPU_INSTANCES = 64;

export interface ProjectedSpotIssue {
  readonly reason: string;
  readonly message: string;
  readonly viewId: string | number;
  readonly frameIndex: number;
}

interface ForwardProjectedSpotCache {
  readonly packet: ProjectedSpotBindings;
  readonly selection: PackedLightsWithSelection;
  readonly lights: readonly CollectedLight[];
  readonly source: readonly CollectedLight[] | undefined;
  readonly shadow: ForwardPassOptions["shadowMap"];
  readonly sourceCurrent: () => boolean;
}

/** Shared by every forward segment in one renderer view and device frame. */
export interface ForwardProjectedSpotFrame {
  readonly identity: ProjectedSpotFrameIdentity;
  readonly resolveResource: (asset: unknown) => ProjectedSpotResource<unknown> | undefined;
  readonly onUnsupported: (issue: ProjectedSpotIssue) => void;
  readonly leases: Set<ProjectedSpotFrameLease>;
  cache?: ForwardProjectedSpotCache;
}

/** Per-frame state, shared with the post executor; never shared across frames. */
export interface SelectiveBloomFrame {
  enabled: boolean;
  valid: boolean;
  /** The first stable reason this frame's signal became unusable (reported as POST_SELECTIVE_BLOOM_UNAVAILABLE:<reason>). */
  invalidReason?: string;
  maxRadiance?: number;
  preparedKeys?: ReadonlySet<string>;
  readonly weights?: WeakMap<RenderItem, number>;
  /** Set by the renderer: turns the signal attachment's draw buffer on or off on the frame's target (see `setSelectiveSignalDrawBuffer`). */
  setSignalWrite?: (enabled: boolean) => void;
}

/** Mark a selective frame unusable; the first reason is kept, and the signal buffer goes off so later ordinary draws stay valid. */
export function invalidateSelectiveBloomFrame(frame: { valid: boolean; invalidReason?: string; setSignalWrite?: (enabled: boolean) => void }, reason: string): void {
  if (frame.valid) {
    frame.invalidReason = reason;
    frame.setSignalWrite?.(false);
  }
  frame.valid = false;
}

/**
 * Why one draw cannot write the separate signal, or null. Reads only data and
 * authenticated stock implementations; never invokes an item or material callback.
 */
function selectiveDrawDecline(item: RenderItem): string | null {
  const material = item.material;
  if (!stockSelectiveMaterial(material)) return "material-program";
  if (item.onBeforeRender || item.skinning || item.morphTargets || item.morphWeights ||
      item.instanceTransforms || item.instanceAttributes || (item as RenderItem & { multiDraw?: unknown }).multiDraw) return "draw-producer";
  const state = material.renderState;
  if (blendStateIsTransparent(state) || state.alphaToCoverage || renderStateHasExtendedCommandFields(state) || !stockArrayMatches(state.colorWrite, [true, true, true, true]) ||
      isTransmissionRenderItem(item)) return "transparent-or-transmission";
  return null;
}

/**
 * The first data-only reason a draw in `items` cannot write the separate signal, or null. The renderer asks before it commits a
 * frame to the second-attachment target, so a request the forward pass would decline later (an instanced, skinned, transparent
 * or non-stock draw) never pays for that target. A subset of what `prepareSelectiveBloom` checks: it never declines a frame the
 * later check would accept.
 */
export function selectiveItemsDecline(items: readonly RenderItem[]): string | null {
  for (const item of items) {
    const reason = selectiveDrawDecline(item);
    if (reason) return reason;
  }
  return null;
}

export interface ForwardPassOptions {
  readonly items: readonly RenderItem[];
  /** @internal Sorting camera when it differs from the shading camera. */
  readonly sortCameraPosition?: readonly [number, number, number];
  /** @internal Renderer-owned weighted accumulation or revealage submission. */
  readonly weightedTransparency?: { readonly phase: WeightedTransparencyPhase; readonly bindings: WeightedTransparencyBindings };
  /** Renderer-owned opaque depth/coverage pair for the native depth-of-field route. */
  readonly nativeDepthCoverage?: { readonly assertCurrent: () => void };
  /** The current frame's owner-scoped contributor resources, when available. */
  readonly frameContext?: FrameContributorContext;
  /** Internal renderer-owned lifetime and diagnostic scope for this view. */
  readonly photometricFrame?: {
    readonly identity: PhotometricFrameIdentity;
    readonly resources: PhotometricFrameResources;
    readonly leases: PhotometricFrameLease[];
    readonly onUnsupported: (issue: PhotometricProfileIssue) => void;
  };
  /** Internal per-view projected-light admission, cache and frame leases. */
  readonly projectedSpotFrame?: ForwardProjectedSpotFrame;
  readonly lights?: readonly CollectedLight[];
  readonly environmentLighting?: EnvironmentLightingOptions;
  readonly environmentFog?: ForwardEnvironmentFogOptions | false;
  readonly inputColorResource?: string;
  readonly shadowMap?: ForwardShadowMapOptions;
  /** The scene group; per-item snapshots take precedence. */
  readonly globalClipping?: ClippingGroupInput;
  /** Per-material group override; matches the depth-pass precedence. */
  readonly materialClippingFor?: (item: RenderItem) => ClippingGroupInput | undefined;
  /** Renderer already ran a per-item resolver while preparing this pass. */
  readonly disableCombinedDraw?: boolean;
  readonly clippingPlaneLimit?: number;
  readonly cameraPosition?: readonly [number, number, number];
  readonly cameraViewMatrix?: Float32Array | readonly number[];
  readonly cameraViewProjectionMatrix?: Float32Array | readonly number[];
  /** Clip range of the supplied camera projection, independent of the backend. */
  readonly projectionClipRange?: "minus-one-to-one" | "zero-to-one";
  readonly outputColorSpace?: "linear" | "srgb";
  readonly shaderLibrary?: ShaderLibrary;
  /**
   * C-02 material/feature context tier (`MaterialFeatureContext.tier`). The
   * app's quality controller supplies this under `A3D_QR_CORE=v2` (lane 15
   * wiring Q-15-*); defaults to the High tier when unset.
   */
  readonly qualityTier?: AuraQualityTierSettings;
  /** `material.custom` view/projection built-ins when the camera only exposed a combined view-projection (see `CameraLike.shaderViewMatrix`). */
  readonly customFrameCamera?: {
    readonly viewMatrix?: Float32Array | readonly number[];
    readonly projectionMatrix?: Float32Array | readonly number[];
  };
  /** C-08: fields of the AuraFrame UBO the options above do not already carry. */
  readonly auraFrameCamera?: {
    readonly projectionMatrix?: Float32Array | readonly number[];
    readonly near?: number;
    readonly far?: number;
    readonly projection?: "perspective" | "orthographic";
    readonly previousViewProjectionMatrix?: Float32Array | readonly number[];
  };
  /** C-40 exposure placeholder (default 1) until the output-options surface lands. */
  readonly exposure?: number;
  /** Seconds for `u_resolutionFarTime.w`; default 0. */
  readonly timeSeconds?: number;
  /**
   * C-05 (§6.5): the HDR target carries a BACKGROUND_COVERAGE attachment, so
   * generated programs write `outCoverage` at MRT location 1. Pass-owned;
   * applied to every generated program in the pass.
   */
  readonly backgroundCoverage?: boolean;
  /** Internal, capability-checked signal attachment; absent on ordinary frames. */
  readonly selectiveBloom?: SelectiveBloomFrame;
  /**
   * §9.1 split (C-05): the v2 frame runs several forward passes; the
   * RenderGraph requires unique names and single-producer writes, so each
   * phase pass declares its own name + write resource and optional extra
   * reads for ordering. `writes` defaults to `["color"]`.
   */
  readonly framePass?: { readonly name: string; readonly reads?: readonly string[]; readonly writes?: readonly string[] };
}

interface ForwardPhotometricBinding {
  readonly packet: PhotometricProfileBindings;
  readonly selection: PackedLightsWithSelection;
  readonly lease: PhotometricFrameLease;
  readonly sourceCurrent: () => boolean;
  active: boolean;
}

interface ForwardProjectedSpotBinding extends ForwardProjectedSpotCache { active: boolean; }

const PROJECTED_SPOT_UNIFORMS = ["u_projectedSpotEnabled", "u_projectedSpotIndex", "u_projectedSpotMap",
  "u_projectedSpotOffset", "u_projectedSpotScale", "u_projectedSpotRotation"] as const;

function projectedSpotItemSupported(item: RenderItem): boolean {
  return item.geometry.topology === "triangles" && !item.skinning && !item.morphTargets && !item.morphWeights &&
    !item.geometry.morphTargets?.length && !item.instanceTransforms && !item.instanceColors && !item.instanceAttributes &&
    (item.instanceCount === undefined || item.instanceCount === 1) && !isEngineBatchInstanceItem(item) &&
    !item.geometry.vertexBuffer.format.streams.some((stream) => stream.stepMode === "instance");
}

/** Conservative count: a vertex-stage sampler also consumes a numbered unit. */
function projectedSamplerBudgetAvailable(device: RenderDevice, shader: RenderShaderProgram): boolean {
  const limit = device.info.maxFragmentTextureUnits;
  if (!Number.isSafeInteger(limit) || limit! < 1) return false;
  const samplerTypes = new Set([0x8b5e, 0x8b5f, 0x8b60, 0x8b62, 0x8dc1, 0x8dc4, 0x8dc5,
    0x8dca, 0x8dcb, 0x8dcc, 0x8dcf, 0x8dd2, 0x8dd3, 0x8dd4, 0x8dd7].map(String));
  let count = 0;
  for (const detail of shader.reflection.uniformDetails.values()) {
    if (/sampler/i.test(detail.type) || samplerTypes.has(detail.type)) count += detail.arraySize ?? 1;
  }
  return count > 0 && count <= limit!;
}

export interface EnvironmentLightingOptions {
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly proceduralMap?: ProceduralEnvironmentMapLightingOptions;
  readonly environmentMapTexture?: TextureBinding;
  readonly environmentCubeMapTexture?: TextureBinding;
  readonly environmentMapIntensity?: number;
  readonly environmentMapSpecularIntensity?: number;
  readonly environmentMapRotation?: number;
  readonly environmentMapMipCount?: number;
  readonly environmentMapEncoding?: "srgb" | "rgbe" | "linear";
  readonly environmentBrdfLutTexture?: TextureBinding;
  /**
   * E3 stage-2b: the bound C-09 probe (cube + SH9) for the PRD-02 IBL
   * uniform pack. Set by `renderer/Background` only under the E3
   * conjunction; absent/null everywhere else, where no code reads it.
   */
  readonly environmentProbe?: EnvironmentProbe | null;
  /**
   * LIGHT-05/08: authored hemisphere lights as a directional sky/ground pair (linear rgb, premultiplied by
   * intensity; `direction` is the light's unit up). `color`/`intensity` already include the pair's flat mean
   * (mean(sky, ground), its horizontal-normal value) so every program that reads only the ambient scalar keeps the
   * hemisphere; the PRD-02 IBL pack (`applyPrd02EnvironmentUniforms`) takes that mean back out of the ambient and
   * binds the pair to `u_hemiSky`/`u_hemiGround`/`u_hemiDirection`, which the chunk evaluates per normal.
   */
  readonly hemisphere?: {
    readonly sky: readonly [number, number, number];
    readonly ground: readonly [number, number, number];
    readonly direction: readonly [number, number, number];
  } | null;
}

export interface ProceduralEnvironmentMapLightingOptions {
  readonly skyColor: readonly [number, number, number];
  readonly horizonColor: readonly [number, number, number];
  readonly groundColor: readonly [number, number, number];
  readonly specularColor: readonly [number, number, number];
  readonly intensity: number;
  readonly specularIntensity: number;
}

export type ForwardEnvironmentFogMode = "linear" | "exponential" | "exponential-squared";

export interface ForwardEnvironmentFogOptions {
  readonly mode: ForwardEnvironmentFogMode;
  readonly color: readonly [number, number, number];
  readonly near: number;
  readonly far: number;
  readonly density: number;
  readonly heightFalloff?: number;
  readonly heightReference?: number;
  readonly maxOpacity?: number;
  /**
   * A5 volumetric inscatter (muse3jsparity-PRD). 0/absent reproduces the
   * legacy fog path exactly; the forward pass binds these only when the
   * program declares them.
   */
  readonly volumetricIntensity?: number;
  /** World-space direction TOWARD the dominant volumetric light. */
  readonly volumetricLightDirection?: readonly [number, number, number];
  /** Linear RGB of the dominant volumetric light. */
  readonly volumetricLightColor?: readonly [number, number, number];
}

export interface ForwardShadowMapOptions {
  readonly texture: TextureBinding;
  readonly lightMatrix: Float32Array | readonly number[];
  readonly strength?: number;
  readonly bias?: number;
  readonly slopeBias?: number;
  /**
   * World-space receiver offset along the surface normal before projection
   * (three.js `shadow.normalBias`). Bound only to programs that declare
   * `u_shadowMapNormalBias` (the generated `shadow_forward` chunk); the
   * legacy shader ignores it.
   */
  readonly normalBias?: number;
  readonly texelSize?: readonly [number, number];
  readonly filterKernel?: ShadowFilterKernel;
  /**
   * PCF tap-count cap (32 / 16 / 8). A kernel with more taps is reduced to this many at upload; a kernel
   * within the cap, and an unset tier, are used as authored (PRD-2 WP-3, `shadows/ShadowFilterTier.ts`).
   */
  readonly pcfTapTier?: ShadowPcfTapTier;
  readonly pointLight?: ForwardPointShadowMapOptions;
  /**
   * B1 spot shadow path (muse3jsparity-PRD): perspective spot shadow uniforms.
   * Bound only when the program declares the `u_spotShadow*` uniforms, so
   * existing programs render exactly as before.
   */
  readonly spotLight?: ForwardSpotShadowMapOptions;
  readonly cascades?: readonly ForwardShadowCascadeOptions[];
  /**
   * GU47 eint (E-B handoff EB-3): set on every PRD-02 bridge frame (`shadows/Prd02ShadowBridge.ts`). The map above
   * is then the sun's, so spot / point casters never sample it; casters that got PRD-02 atlas tiles sample those
   * in the generated forward program, the others render unshadowed (`forwardShadedLights`).
   */
  readonly localShadows?: ForwardLocalShadowOptions;
}

/** Most PRD-02 local-light atlas tiles a frame binds (`shadows/ShadowSystem.ts` MAX_LOCAL_TILES). */
export const MAX_FORWARD_LOCAL_SHADOW_TILES = 6;

/** PRD-02 local-light shadow tiles for the forward pass (GU47 eint EB-3). */
export interface ForwardLocalShadowOptions {
  /**
   * First atlas tile of each shadowed spot / point light, keyed by the frame's collected light. A point light owns
   * six consecutive tiles (faces +X, -X, +Y, -Y, +Z, -Z). Empty when no local tile was rendered this frame.
   */
  readonly slots: ReadonlyMap<CollectedLight, number>;
  /** The local-light depth atlas with a compare sampler; set whenever `slots` is not empty. */
  readonly texture?: TextureBinding;
  /** Raw nearest-sampled atlas for portable shaders; `texture` remains the compare binding. */
  readonly rawTexture?: TextureBinding;
  /** Atlas edge in px. */
  readonly atlasSize: number;
  /** MAX_FORWARD_LOCAL_SHADOW_TILES column-major mat4: world -> tile [0,1]^3 (the tiles' sampling view-projections). */
  readonly matrices: Float32Array;
  /** MAX_FORWARD_LOCAL_SHADOW_TILES vec4: tile rect in the atlas (u0, v0, du, dv). */
  readonly rects: Float32Array;
  /** 8 floats (2 vec4, tile i at [i]): world size of one tile texel per unit of tile-axis depth, 2 tan(fov / 2) / tile px. */
  readonly texelScale: Float32Array;
  readonly strength: number;
  /** Receiver depth bias toward the light, in tile texels: `biasTexels + slopeBiasTexels * tan(incidence)`. */
  readonly biasTexels: number;
  readonly slopeBiasTexels: number;
  /** Receiver offset along its normal before the lookup, in tile texels. */
  readonly normalBiasTexels: number;
}

/**
 * GU47 eint (EB-3): the lights as the forward programs see them. On a PRD-02 bridge frame (`localShadows` set) a
 * shadow-casting spot / point light keeps lighting but drops its `castsShadow` gate (the bound forward map is the
 * sun's), and carries `localShadowSlot` when it got atlas tiles. Any other frame returns `lights` itself.
 */
export function forwardShadedLights(
  lights: readonly CollectedLight[] | undefined,
  localShadows: ForwardLocalShadowOptions | undefined,
  standalone?: Pick<ForwardShadowMapOptions, "pointLight" | "spotLight">
): readonly CollectedLight[] {
  if (!lights) return [];
  if (!localShadows) return lights;
  let changed = false;
  const shaded = lights.map((light): CollectedLight => {
    if (!light.castsShadow || (light.kind !== "spot" && light.kind !== "point")) return light;
    const slot = localShadows.slots.get(light);
    // A light not in the local atlas can still own the independent legacy map.
    const legacy = light.kind === "point" ? standalone?.pointLight : standalone?.spotLight;
    if (slot === undefined && legacy && legacy.strength !== 0 && legacy.lightPosition?.length === 3
      && isFiniteArrayLike(legacy.lightPosition) && graphShadowPositionMatches(light.position, legacy.lightPosition)
      && (light.kind !== "spot" || (standalone?.spotLight?.lightDirection?.length === 3
        && isFiniteArrayLike(standalone.spotLight.lightDirection) && graphShadowDirectionMatches(light.direction, standalone.spotLight.lightDirection)))) return light;
    changed = true;
    const out: LocalShadowedLight = { ...light, castsShadow: false, ...(slot === undefined ? {} : { localShadowSlot: slot }) };
    return out;
  });
  return changed ? shaded : lights;
}

export interface ForwardShadowCascadeOptions {
  readonly index: number;
  readonly near: number;
  readonly far: number;
  readonly shadowMap: Omit<ForwardShadowMapOptions, "cascades">;
}

export interface ForwardPointShadowMapOptions {
  readonly texture: TextureBinding;
  readonly lightPosition: readonly [number, number, number];
  readonly range: number;
  readonly faceMatrices: Float32Array | readonly number[];
  readonly faceRects: Float32Array | readonly number[];
  readonly strength?: number;
  readonly bias?: number;
  readonly slopeBias?: number;
  readonly texelSize?: readonly [number, number];
  readonly filterKernel?: ShadowFilterKernel;
}

type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export const MAX_FORWARD_SHADOW_PCF_SAMPLES = 32;

const INSTANCE_MATRIX_ATTRIBUTE_NAMES = [
  "a_instanceMatrix0",
  "a_instanceMatrix1",
  "a_instanceMatrix2",
  "a_instanceMatrix3"
] as const;

type NativeForwardPointDevice = NativePointQuadDevice & {
  getNativePointViewport(): WebGPUNativePointViewport;
  drawNativePointQuads: NonNullable<RenderDevice["drawNativePointQuads"]>;
};

function isNativePointQuadDevice(device: RenderDevice): device is NativeForwardPointDevice {
  const candidate = device as Partial<NativeForwardPointDevice>;
  return device.kind === "webgpu" && typeof candidate.getNativePointViewport === "function"
    && typeof candidate.getNativePointLimits === "function" && typeof candidate.createNativePointBuffer === "function"
    && typeof candidate.assertNativePointBufferStamp === "function" && typeof candidate.retireNativePointBuffer === "function"
    && typeof candidate.onNativePointInvalidated === "function" && typeof candidate.drawNativePointQuads === "function";
}

interface CombinedForwardSubmission {
  readonly items: readonly RenderItem[];
  readonly run: CombinedDrawPlanRun;
  readonly staged: StagedCombinedDrawData;
  readonly texture: Texture;
  readonly textureRevision: number;
  readonly rows: readonly Float32Array[];
  attempted: boolean;
}

/** Initial lit admission only shares a plain ambient environment, not probes or shadows. */
function combinedPbrEnvironmentSafe(options: ForwardPassOptions): boolean {
  if (options.shadowMap || options.environmentFog || (options.lights?.length ?? 0) !== 0) return false;
  const environment = options.environmentLighting;
  if (!environment) return true;
  try {
    if (Object.getPrototypeOf(environment) !== Object.prototype || Reflect.ownKeys(environment).some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(environment, key);
      return (key !== "color" && key !== "intensity") || !descriptor || !!descriptor.get || !!descriptor.set;
    })) return false;
    return Array.isArray(environment.color) && environment.color.length === 3
      && environment.color.every(Number.isFinite) && Number.isFinite(environment.intensity);
  } catch { return false; }
}

export class ForwardPass extends BaseRenderPass {
  private static readonly shaderCaches = new WeakMap<RenderDevice, WeakMap<ShaderLibrary, ShaderCacheRecord>>();
  private static readonly staticPairDrawItem = ForwardPass.prototype.drawItem;
  private static readonly staticPairGetShader = ForwardPass.prototype.getShader;
  private static readonly staticPairProgramFeatures = ForwardPass.prototype.programFeaturesFor;
  private readonly materialBinding = new MaterialBinding();
  private readonly shaderLibrary: ShaderLibrary;
  private readonly skinningPaletteUploads = new SkinningPaletteUploadManager();
  private staticPairAuraFrame: RenderBuffer | null = null;
  private clusteredLighting: ClusteredForwardLightingResources | null = null;
  private generatorProgramCache: ProgramCacheLike | undefined;

  // PRD-01 Phase 6 (submission performance): device-keyed pools — ForwardPass
  // instances are rebuilt per frame/segment, so pass-level caches would never
  // hit. Keyed by device they survive pass reconstruction (same precedent as
  // `shaderCaches`) and die with the device.
  private static readonly pipelineCaches = new WeakMap<RenderDevice, Map<string, RenderPipeline>>();
  private static readonly pointArenas = new WeakMap<NativePointQuadDevice, { readonly arena: NativePointQuadArena; failure?: unknown }>();
  private static readonly uniformPacketPools = new WeakMap<RenderDevice, { free: Map<string, UniformValue>[]; used: Map<string, UniformValue>[] }>();
  // SI-3: one owner-keyed slot allocator per device, shared by every ForwardPass (opaque pass, interleaved
  // transparent segments, mirror/probe views), so an instanced item keeps its buffer across passes and frames.
  private static readonly instanceSlotAllocators = new WeakMap<RenderDevice, InstanceSlotAllocator<InstanceBufferLike>>();
  private static readonly vertexFormatIds = new WeakMap<VertexFormat, number>();
  private static nextVertexFormatId = 1;
  private static readonly renderStateIds = new WeakMap<RenderState, number>();
  private static nextRenderStateId = 1;
  private static readonly requiredAttributeIds = new WeakMap<readonly string[], number>();
  private static nextRequiredAttributeId = 1;
  // threejs-parity SH-02: frame target dims for `u_resolution`, captured in
  // execute() because drawItem() does not carry the pass context.
  private frameWidth = 0;
  private frameHeight = 0;
  private spriteFrameCamera: { readonly view: Float32Array; readonly projection: Float32Array; readonly viewProjection: Float32Array } | undefined;
  // WP-4: which view this pass renders, so the contact-shadow mask binds only to the main camera's draws (one object per frame).
  private contactMaskScope: ContactShadowMaskScope | undefined;

  constructor(private readonly options: ForwardPassOptions) {
    super(
      options.framePass?.name ?? "forward",
      [...(options.inputColorResource ? [options.inputColorResource] : []), ...(options.framePass?.reads ?? [])],
      options.framePass?.writes ?? ["color"]
    );
    this.shaderLibrary = options.shaderLibrary ?? createLeanCoreShaderLibrary();
    ensureGu47ForwardFeatures();
  }

  /** Preflight both the item contract and generated shader before any weighted draw. */
  canDrawWeighted(device: RenderDevice): boolean {
    const weighted = this.options.weightedTransparency;
    const flags = rendererQrFlags(device);
    if (!weighted || !qrCoreGeneratorOn(flags) || !forwardDrawReplaySafe(this.options.items, flags)
      || !isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)) return false;
    try {
      for (const item of this.options.items) {
        const material = item.material;
        // Generated unlit and lit (PBR) alpha surfaces: the GLSL generator
        // emits the opaque-depth test and weighted outputs for both models.
        if (!(material instanceof UnlitMaterial || material instanceof PBRMaterial)) return false;
        const prototype = Object.getPrototypeOf(material);
        const lit = prototype === PBRMaterial.prototype;
        if ((prototype !== UnlitMaterial.prototype && !lit) || material.disposed
          || item.geometry.topology !== "triangles" || item.geometryMatrix || item.instanceTransforms
          || item.instanceAttributes?.length || item.instanceColors || (item.instanceCount !== undefined && item.instanceCount !== 1)
          || item.skinning || item.morphTargets?.length || item.morphWeights?.length || item.geometry.morphTargets?.length
          || item.globalClipping || item.materialClipping || item.cameraFade !== undefined || item.lodFade !== undefined
          || material.requiredAttributes.includes("a_color") || material.getParameter("u_pointMap") !== undefined
          || material.getParameter("u_spriteMode") === 1 || (material.getParameter("u_alphaCutoff") ?? 0) !== 0
          || weightedTransparencyIneligibility(material.renderState, { renderOrder: item.renderOrder, depthConvention: "standard" })
          || (material.renderState.blendMode !== undefined && material.renderState.blendMode !== "alpha")) return false;
        const features = this.programFeaturesFor(material, device, item);
        if (features.alphaMode !== "blend" || features.lighting !== (lit ? "lit" : "unlit") || features.fog !== "none"
          || features.skinning || features.morph || features.instancing || features.drawId || features.backgroundCoverage
          || Object.values(features.maps).some((value) => value !== undefined) || features.extensions.length
          || Object.keys(features.features).some((key) => key !== PROGRAM_TRANSPARENCY_FEATURE)) return false;
        const handle = this.programCache(device).acquire(features);
        if (handle.status !== "ready" || !handle.program || handle.program.disposed
          || ["u_a3dOpaqueDepth", "u_a3dTransparencyDepthOrigin", "u_a3dTransparencyReversedDepth"]
            .some((name) => !handle.program!.reflection.uniforms.has(name))) return false;
      }
      return true;
    } catch { return false; }
  }

  /**
   * GU47 E-D: per-execute values the `material.custom` built-ins share (`u_lightCount`/`u_lightData` for
   * `#include <a3d_lights>`, `u_a3dInverseViewProjection` for `a3dFragWorldPosition`), computed once on first use.
   */
  private customFrame: { lights?: ReturnType<typeof LightUniforms.pack>; inverseViewProjection?: Float32Array; depth?: Pick<DepthConvention, "mode" | "clipRange"> } = {};
  private readonly customFrameCache: CustomShaderFrameCache = {
    lights: () => (this.customFrame.lights ??= LightUniforms.pack(this.shadedLights())),
    inverseViewProjection: () => (this.customFrame.inverseViewProjection ??= customShaderInverseViewProjection(this.options, this.customFrame.depth))
  };

  /** GU47 eint (EB-3): `forwardShadedLights` of this pass, computed once per execute (packed per draw). */
  private shadedLightsMemo: readonly CollectedLight[] | undefined;
  private shadedLights(): readonly CollectedLight[] {
    return (this.shadedLightsMemo ??= forwardShadedLights(this.options.lights, this.options.shadowMap?.localShadows, this.options.shadowMap));
  }

  private photometricCache?: Omit<ForwardPhotometricBinding, "active">;

  private photometricUnsupported(reason: string, message: string): void {
    const frame = this.options.photometricFrame;
    if (frame) frame.onUnsupported({ reason, message, viewId: frame.identity.viewId, frameIndex: frame.identity.frameIndex });
  }

  private projectedSpotUnsupported(reason: string, message: string): void {
    const frame = this.options.projectedSpotFrame;
    if (frame) frame.onUnsupported({ reason, message, viewId: frame.identity.viewId, frameIndex: frame.identity.frameIndex });
  }

  /** Reuse the exact light occurrences across separate interleaved passes. */
  private adoptProjectedSpotLights(): void {
    const frame = this.options.projectedSpotFrame;
    const cache = frame?.cache;
    if (frame && cache && cache.source === this.options.lights && cache.shadow === this.options.shadowMap &&
        cache.sourceCurrent() && cache.packet.isCurrent(frame.identity)) this.shadedLightsMemo = cache.lights;
  }

  private projectedSpotForDraw(device: RenderDevice, item: RenderItem, material: Material,
    photometric?: ForwardPhotometricBinding): ForwardProjectedSpotBinding | undefined {
    const frame = this.options.projectedSpotFrame;
    const lights = this.shadedLights();
    if (!frame || !lights.some((light) => light.projectedImage !== undefined)) return undefined;
    const flags = rendererQrFlags(device);
    const route = { core: qrCoreGeneratorOn(flags), lobes: qrMaterialsLobeProgramsOn(flags) };
    const context = { flags, tier: this.options.qualityTier ?? QUALITY_TIERS.high };
    const features = material.programFeatures(context);
    if (material instanceof PortableShaderMaterial) {
      if (features.lighting === "lit" || material.graphLightingModel === "metallic-roughness") {
        this.projectedSpotUnsupported("material-unsupported", "Custom and graph materials cannot use projected spot images; scalar lighting is used.");
      }
      return undefined;
    }
    if (features.lighting !== "lit") return undefined;
    if (device.kind !== "webgl2" ||
        (!route.core && !route.lobes) || !materialRoutesToGeneratedProgram(material, route, context) || !projectedSpotItemSupported(item)) {
      this.projectedSpotUnsupported("material-unsupported", "This draw cannot use the bounded projected-spot shader; scalar lighting is used.");
      return undefined;
    }
    if (this.clusteredLighting !== null) {
      this.projectedSpotUnsupported("clustered", "Clustered projected-spot indexing is unavailable; scalar lighting is used.");
      return undefined;
    }
    const cache = frame.cache;
    let selection: PackedLightsWithSelection;
    try {
      selection = photometric?.active ? photometric.selection
        : cache && cache.lights === lights && cache.sourceCurrent() && cache.packet.isCurrent(frame.identity)
          ? cache.selection : LightUniforms.packWithSelection(lights);
    } catch {
      this.projectedSpotUnsupported("stale-selection", "Direct lights could not be selected for projected images; scalar lighting is used.");
      return undefined;
    }
    if (cache && cache.selection === selection && cache.lights === lights && cache.sourceCurrent() && cache.packet.isCurrent(frame.identity)) {
      return { ...cache, active: true };
    }
    const image = lights.find((light) => light.projectedImage !== undefined)?.projectedImage;
    let resource: ProjectedSpotResource<unknown> | undefined;
    try { resource = image ? frame.resolveResource(image.texture) : undefined; }
    catch {
      this.projectedSpotUnsupported("texture-unavailable", "The projected image resource is unavailable; scalar lighting is used.");
      return undefined;
    }
    const result = buildProjectedSpotBindings(lights, selection, frame.identity, resource, { clustered: this.clusteredLighting !== null });
    if (result.status === "not-required") return undefined;
    if (result.lease) frame.leases.add(result.lease);
    if (result.status === "unsupported") {
      this.projectedSpotUnsupported(result.reason, `${result.detail}; scalar lighting is used.`);
      return undefined;
    }
    const source = this.options.lights;
    const shadow = this.options.shadowMap;
    let occurrences: CollectedLight[], original: Float32Array;
    let metadata: Array<{ image: CollectedLight["projectedImage"]; profile: CollectedLight["photometricProfile"]; visible: CollectedLight["photometricVisible"]; dimmer: CollectedLight["photometricDimmer"] }>;
    try {
      occurrences = [...(source ?? [])];
      original = LightUniforms.pack(source ?? []).data.slice();
      metadata = (source ?? []).map((light) => ({ image: light.projectedImage, profile: light.photometricProfile,
        visible: light.photometricVisible, dimmer: light.photometricDimmer }));
    } catch {
      this.projectedSpotUnsupported("stale-selection", "Projected light data could not be retained; scalar lighting is used.");
      return undefined;
    }
    const slots = selection.selected.map((entry) => entry.inputIndex);
    const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((value, index) => Object.is(value, b[index]));
    const sourceCurrent = (): boolean => {
      try {
        const live = this.options.lights;
        if (live !== source || this.options.shadowMap !== shadow || !live || live.length !== occurrences.length ||
            live.some((light, i) => light !== occurrences[i] || light.projectedImage !== metadata[i]!.image ||
              light.photometricProfile !== metadata[i]!.profile || light.photometricVisible !== metadata[i]!.visible ||
              !Object.is(light.photometricDimmer, metadata[i]!.dimmer)) || !same(LightUniforms.pack(live).data, original)) return false;
        const remapped = forwardShadedLights(live, shadow?.localShadows, shadow);
        const fresh = LightUniforms.packWithSelection(remapped, selection.packed.diagnostics.requestedMaxLights);
        return same(fresh.packed.data, selection.packed.data) && fresh.selected.length === slots.length &&
          fresh.selected.every((entry, index) => entry.inputIndex === slots[index]) &&
          remapped.length === lights.length && remapped.every((light, index) => light.projectedImage === lights[index]?.projectedImage);
      } catch { return false; }
    };
    const projected: ForwardProjectedSpotCache = { packet: result, selection, lights, source, shadow, sourceCurrent };
    if (!sourceCurrent() || !result.isCurrent(frame.identity)) {
      this.projectedSpotUnsupported("stale-selection", "Projected light data changed during admission; scalar lighting is used.");
      return undefined;
    }
    frame.cache = projected;
    return { ...projected, active: true };
  }

  private photometricForDraw(device: RenderDevice, item: RenderItem, material: Material): ForwardPhotometricBinding | undefined {
    const frame = this.options.photometricFrame;
    const lights = this.shadedLights();
    if (!frame || !lights.some((light) => light.photometricProfile !== undefined)) return undefined;
    const flags = rendererQrFlags(device);
    const route = { core: qrCoreGeneratorOn(flags), lobes: qrMaterialsLobeProgramsOn(flags) };
    const context = { flags, tier: this.options.qualityTier ?? QUALITY_TIERS.high };
    const features = material.programFeatures(context);
    const graphLit = material instanceof PortableShaderMaterial && material.graphLightingModel === "metallic-roughness";
    if (material instanceof PortableShaderMaterial) {
      this.photometricUnsupported("material-unsupported", "Custom and graph shaders cannot use generated photometric profile lighting; scalar lighting is used.");
      return undefined;
    }
    if (features.lighting !== "lit" && !graphLit) return undefined;
    if (!materialRoutesToGeneratedProgram(material, route, context) ||
        (!route.core && !route.lobes) || item.geometry.topology !== "triangles") {
      this.photometricUnsupported("material-unsupported", "This lit draw cannot use generated photometric profile lighting; scalar lighting is used.");
      return undefined;
    }
    if (this.photometricCache?.lease.isCurrent(frame.identity) && this.photometricCache.sourceCurrent()) {
      const cached = this.photometricCache;
      const current = LightUniforms.pack(lights).data;
      if (current.length === cached.selection.packed.data.length && current.every((value, index) => Object.is(value, cached.selection.packed.data[index]))) {
        return { ...cached, active: true };
      }
    }
    let selection: PackedLightsWithSelection;
    let sourceCurrent: () => boolean;
    try {
      const shared = this.options.projectedSpotFrame?.cache;
      selection = shared && shared.lights === lights && shared.sourceCurrent() &&
        shared.packet.isCurrent(this.options.projectedSpotFrame!.identity) ? shared.selection : LightUniforms.packWithSelection(lights);
      const source = this.options.lights ?? [];
      const occurrences = [...source];
      const packed = LightUniforms.pack(source).data.slice();
      const profiles = source.map((light) => ({ profile: light.photometricProfile, visible: light.photometricVisible, dimmer: light.photometricDimmer }));
      sourceCurrent = () => {
        try {
          const live = this.options.lights ?? [];
          if (live.length !== occurrences.length || live.some((light, i) => light !== occurrences[i] ||
              light.photometricProfile !== profiles[i]!.profile || light.photometricVisible !== profiles[i]!.visible ||
              !Object.is(light.photometricDimmer, profiles[i]!.dimmer))) return false;
          const current = LightUniforms.pack(live).data;
          if (current.length !== packed.length || !current.every((value, index) => Object.is(value, packed[index]))) return false;
          const shaded = forwardShadedLights(live, this.options.shadowMap?.localShadows, this.options.shadowMap);
          const currentShaded = LightUniforms.pack(shaded).data;
          return currentShaded.length === selection.packed.data.length &&
            currentShaded.every((value, index) => Object.is(value, selection.packed.data[index]));
        } catch { return false; }
      };
    }
    catch {
      this.photometricUnsupported("stale-selection", "Direct lights could not be selected for photometric profiles; scalar lighting is used.");
      return undefined;
    }
    const result = buildPhotometricProfileBindings(lights, selection, { clustered: this.clusteredLighting !== null });
    if (result.status === "not-required") return undefined;
    if (result.status === "unsupported") {
      this.photometricUnsupported(result.reason, `${result.detail}; scalar lighting is used.`);
      return undefined;
    }
    const adopted = frame.resources.adopt(frame.identity, result);
    if (adopted.status !== "ready") {
      result.dispose();
      this.photometricUnsupported(adopted.reason, "Photometric profile frame resources are unavailable; scalar lighting is used.");
      return undefined;
    }
    frame.leases.push(adopted.lease);
    this.photometricCache = { packet: result, selection, lease: adopted.lease, sourceCurrent };
    return { ...this.photometricCache, active: true };
  }

  execute(context: RenderPassContext): void {
    if (this.options.frameContext && this.options.frameContext.device !== context.device) {
      throw new RenderDeviceError("Forward frame context belongs to another device", "FRAME_CONTEXT_DEVICE_MISMATCH");
    }
    this.customFrame = context.device.kind === "webgl2" ? { depth: context.device.getDepthConvention?.() } : {};
    this.shadedLightsMemo = undefined;
    this.photometricCache = undefined;
    this.skinningPaletteUploads.beginFrame();
    this.frameWidth = context.width;
    this.frameHeight = context.height;
    this.spriteFrameCamera = undefined;
    this.staticPairAuraFrame = null;
    this.contactMaskScope = { device: context.device, width: context.width, height: context.height, cameraPosition: this.options.cameraPosition ?? [0, 0, 1],
      timeSeconds: this.options.timeSeconds ?? 0, viewProjectionMatrix: this.options.cameraViewProjectionMatrix ?? identityMatrix(), frame: this.options.frameContext };
    this.beginFramePools(context.device);
    try {
      this.clusteredLighting = resolveForwardClusteredLighting(this.shadedLights(), context.width, context.height, this.options.cameraViewProjectionMatrix);
      const flags = rendererQrFlags(context.device);
      if (qrGeneratedProgramsOn(flags)) {
        const auraFrame = rendererAuraFrame(context.device, flags);
        if ("viewport" in auraFrame) {
          (auraFrame as { viewport: { width: number; height: number } }).viewport = { width: context.width, height: context.height };
        }
        const view = new Float32Array(toMat4Uniform(this.options.cameraViewMatrix ?? identityMatrix(), "cameraViewMatrix"));
        const projection = new Float32Array(toMat4Uniform(this.options.auraFrameCamera?.projectionMatrix ?? identityMatrix(), "auraFrameCamera.projectionMatrix"));
        const viewProjection = new Float32Array(toMat4Uniform(this.options.cameraViewProjectionMatrix ?? identityMatrix(), "cameraViewProjectionMatrix"));
        this.spriteFrameCamera = { view, projection, viewProjection };
        auraFrame.update(
          {
            viewMatrix: view,
            projectionMatrix: projection,
            viewProjectionMatrix: viewProjection,
            previousViewProjectionMatrix: this.options.auraFrameCamera?.previousViewProjectionMatrix
              ? toMat4Uniform(this.options.auraFrameCamera.previousViewProjectionMatrix, "auraFrameCamera.previousViewProjectionMatrix")
              : null,
            near: this.options.auraFrameCamera?.near ?? 0.1,
            far: this.options.auraFrameCamera?.far ?? 1000,
            projection: this.options.auraFrameCamera?.projection ?? "perspective",
            position: this.options.cameraPosition ?? [0, 0, 0]
          },
          this.options.timeSeconds ?? 0,
          this.options.exposure ?? 1,
          0
        );
        // The device binds the AuraFrame block to point 0 at link time
        // (`uniformBlockBinding`), so one global buffer bind covers every
        // generated draw this frame.
        if (auraFrame.buffer) context.device.bindUniformBuffer?.((this.staticPairAuraFrame = auraFrame.buffer), 0);
      }
      // Until a backend can attest observer-safe batch execution, recover
      // logical members before sorting or running any per-draw callbacks.
      for (const carrier of this.options.items) {
        const members = batchMembersFor(carrier);
        if (members && [carrier, ...members].some((item) => item.material && getBaseMaterial(item.material) instanceof DepthPreviewMaterial)) {
          throw new RenderDeviceError("Depth preview does not support batched draws", "DEPTH_PREVIEW_BATCH_UNSUPPORTED", { label: carrier.label });
        }
      }
      const logicalItems = expandLogicalBatchItems(this.options.items);
      if (logicalItems.some(isEnginePackedBatchItem)) {
        throw new RenderDeviceError("Packed draw rows require authenticated logical members", "PACKED_DRAW_PROVENANCE_UNAVAILABLE", {});
      }
      if (this.options.materialClippingFor && logicalItems.some(isEngineBatchInstanceItem)) {
        throw new RenderDeviceError("Per-member materialClippingFor is unavailable for batched instances", "BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED", {});
      }
      const ordered = sortForwardRenderItems(logicalItems.filter(hasDrawableInstances), this.options.sortCameraPosition ?? this.options.cameraPosition);
      // A live selective-bloom frame (4.7.x) draws every logical item through
      // drawItem's per-draw signal checks; combined runs and static pairs
      // (native 5.0 draw-call reductions) resume on ordinary frames.
      const selectiveLive = this.options.selectiveBloom?.enabled === true && this.options.selectiveBloom.valid;
      const canPlan = !selectiveLive && ordered.some(hasCombinedDrawIntent) && combinedWebGLDevice(context.device) && qrCoreGeneratorOn(flags)
        && flags.on("A3D_PARITY_BATCHING") && flags.on("A3D_QR_TIERS_BATCHING")
        && !(this.options.photometricFrame && this.shadedLights().some((light) => light.photometricProfile !== undefined))
        && !this.options.projectedSpotFrame
        && !this.options.globalClipping && !this.options.materialClippingFor && !this.options.disableCombinedDraw
        && !resolveContactShadowMask(this.contactMaskScope) && isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)
        && forwardDrawProvidersSafe(flags, true);
      if (!canPlan) {
        for (let index = 0; index < ordered.length;) {
          const first = ordered[index]!;
          const second = ordered[index + 1];
          const pair = second && !selectiveLive ? this.tryStaticUnlitPair(context.device, first, second) : "ineligible";
          if (pair === "submitted") index += 2;
          else if (pair === "declined" && second) {
            this.drawItem(context.device, first);
            this.drawItem(context.device, second);
            index += 2;
          } else { this.drawItem(context.device, first); index += 1; }
        }
      } else {
        // Plan bounded contiguous chunks in already-sorted order. A rejected
        // run resumes the exact ordinary member sequence at its first item.
        for (let start = 0; start < ordered.length; start += MAX_COMBINED_DRAW_PLAN_ITEMS) {
          const chunk = ordered.slice(start, start + MAX_COMBINED_DRAW_PLAN_ITEMS);
          const runs = planCombinedDrawRuns(combinedForwardEntries(context.device, chunk));
          const byStart = new Map(runs.map((run) => [run.members[0]!.itemIndex, run]));
          for (let index = 0; index < chunk.length;) {
            const run = byStart.get(index);
            if (run && this.tryCombinedRun(context.device, chunk, run)) index += run.members.length;
            else { this.drawItem(context.device, chunk[index]!); index += 1; }
          }
        }
      }
      // #181: issue any trailing multi-draw run deferred by `submitDraw`.
      flushMultiDrawQueue(context.device);
    } finally {
      this.clusteredLighting?.dispose();
      this.clusteredLighting = null;
    }
  }

  /** Recheck callback, source and resource ownership after every preparation step. */
  private staticUnlitPairCurrent(device: RenderDevice, first: RenderItem, second: RenderItem): device is WebGL2Device {
    try {
      const authorization = staticUnlitPairFrames.get(this);
      const flags = rendererQrFlags(device);
      const generated = qrGeneratedProgramsOn(flags);
      if (!authorization || !staticPairDeviceCurrent(device) || !authorization() || device.disposed || device.contextLost
        || device.draw !== staticPairDeviceDraw || device.hasStaticUnlitPairBuffers !== staticPairBufferCheck
        || device.prepareStaticUnlitPair !== staticPairPrepare || device.submitStaticUnlitPair !== staticPairSubmit
        || this.drawItem !== ForwardPass.staticPairDrawItem || this.materialBinding.bind !== staticPairMaterialBind
        || this.materialBinding.bindRecursive !== staticPairMaterialBindRecursive
        || this.getShader !== ForwardPass.staticPairGetShader
        || MaterialBinding.prototype.bind !== staticPairMaterialBind || MaterialBinding.prototype.bindRecursive !== staticPairMaterialBindRecursive
        || RenderPipeline.prototype.createDrawCommand !== staticPairPipelineCommand
        || ShaderModule.prototype.compile !== staticPairShaderCompile || ShaderModule.prototype.peek !== staticPairShaderPeek
        || !isTrustedQrFlags(flags) || hasPotentiallyActiveFrameContributors(flags)
        || !forwardDrawProvidersSafe(flags) || !isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)
        || this.options.globalClipping || this.options.materialClippingFor || this.options.disableCombinedDraw
        || this.options.nativeDepthCoverage || this.options.shadowMap || this.options.photometricFrame || this.options.projectedSpotFrame
        || (device.getDepthConvention?.()?.mode ?? "standard") !== "standard"
        || resolveContactShadowMask(this.contactMaskScope)
        || !staticUnlitItemSafe(first, generated) || !staticUnlitItemSafe(second, generated)
        || first.geometry !== second.geometry || first.material !== second.material
        || !staticUnlitMaterialSafe(first.material as UnlitMaterial)) return false;

      if (generated) {
        const cache = rendererProgramCachePeek(device, flags);
        if (!qrCoreGeneratorOn(flags) || this.options.outputColorSpace !== "srgb" || !this.staticPairAuraFrame
          || !staticGeneratedDeviceCurrent(device) || device.hasStaticGeneratedUnlitProgram !== staticGeneratedPairProgram
          || device.prepareStaticGeneratedUnlitPair !== staticGeneratedPairPrepare
          || device.submitStaticGeneratedUnlitPair !== staticGeneratedPairSubmit
          || this.programFeaturesFor !== ForwardPass.staticPairProgramFeatures || this.materialBinding.bindGenerated !== staticPairMaterialBindGenerated
          || MaterialBinding.prototype.bindGenerated !== staticPairMaterialBindGenerated
          || !cache || !staticGeneratedCacheCapability(cache)) return false;
      } else {
        // A normal frame must have compiled this exact legacy program first.
        const record = ForwardPass.shaderCaches.get(device)?.get(this.shaderLibrary);
        const module = record?.revision === this.shaderLibrary.getRevision() ? record.modules.get(DEFAULT_UNLIT_SHADER_NAME) : undefined;
        if (!module || module.compile !== staticPairShaderCompile || module.peek !== staticPairShaderPeek || !module.peek(device)) return false;
      }

      // `uploadedBuffer` is the last device's resource. Authenticate it on
      // this device before invoking the ordinary upload path for a packet.
      const geometry = first.geometry;
      const indices = geometry.indexBuffer!;
      if (!indices.uploadedBuffer || indices.getDirtyRange() !== null) return false;
      const vertices: (RenderBuffer | undefined)[] = [];
      for (const stream of geometry.vertexBuffer.format.streams) {
        if (stream.stepMode === "instance") return false;
        const vertex = geometry.getVertexBuffer(stream.slot);
        if (!vertex.uploadedBuffer || vertex.getDirtyRange() !== null) return false;
        vertices[stream.slot] = vertex.uploadedBuffer;
      }
      return device.hasStaticUnlitPairBuffers(vertices, indices.uploadedBuffer);
    } catch { return false; }
  }

  private tryStaticUnlitPair(device: RenderDevice, first: RenderItem, second: RenderItem): "ineligible" | "declined" | "submitted" {
    if (!this.staticUnlitPairCurrent(device, first, second)) return "ineligible";
    const generated = qrGeneratedProgramsOn(rendererQrFlags(device));
    const firstCapture: StaticUnlitCapture = { generatedRequested: generated };
    const secondCapture: StaticUnlitCapture = { generatedRequested: generated };
    // These calls take the ordinary selection and binding route, but cannot
    // submit. The preflight requires warm resources and callback-free owners.
    try {
      if (this.drawItem(device, first, undefined, firstCapture) !== true || !firstCapture.command
        || !this.staticUnlitPairCurrent(device, first, second)
        || this.drawItem(device, second, undefined, secondCapture) !== true || !secondCapture.command
        || !this.staticUnlitPairCurrent(device, first, second)) return "declined";
    } catch {
      // Neither logical draw was submitted. Let the ordinary path reproduce
      // its own warning or error at the original position in the queue.
      return "declined";
    }
    const firstCommand = firstCapture.command;
    const secondCommand = secondCapture.command;
    if (!firstCommand || !secondCommand) return "declined";
    if (generated) {
      const firstGenerated = firstCapture.generated;
      const secondGenerated = secondCapture.generated;
      const auraFrameBuffer = this.staticPairAuraFrame;
      if (!firstGenerated || !secondGenerated || !auraFrameBuffer || firstGenerated.cache !== secondGenerated.cache
        || firstGenerated.capability !== secondGenerated.capability || firstGenerated.program !== secondGenerated.program
        || firstCommand.shader !== firstGenerated.program || secondCommand.shader !== secondGenerated.program) return "declined";
      const cacheCurrent = (): boolean => {
        const cache = rendererProgramCachePeek(device, rendererQrFlags(device));
        return cache !== undefined && cache === firstGenerated.cache && staticGeneratedCacheCapability(cache) === firstGenerated.capability
          && firstGenerated.capability.peekReady(firstGenerated.features) === firstGenerated.program
          && firstGenerated.capability.peekReady(secondGenerated.features) === secondGenerated.program
          && staticGeneratedDeviceCurrent(device) && device.hasStaticGeneratedUnlitProgram === staticGeneratedPairProgram
          && device.hasStaticGeneratedUnlitProgram(firstGenerated.program, firstGenerated.features)
          && device.hasStaticGeneratedUnlitProgram(secondGenerated.program, secondGenerated.features);
      };
      if (!cacheCurrent()) return "declined";
      const ticket = device.prepareStaticGeneratedUnlitPair([firstCommand, secondCommand], {
        features: firstGenerated.features, auraFrameBuffer
      });
      if (!ticket || this.staticPairAuraFrame !== auraFrameBuffer || !this.staticUnlitPairCurrent(device, first, second) || !cacheCurrent()) return "declined";
      let committed = 0;
      const commit = (capture: StaticGeneratedCapture, expected: number): void => {
        if (committed !== expected || !cacheCurrent() || !capture.capability.commitReadyReuse(capture.features, capture.program, 1)) {
          throw new RenderDeviceError("The generated pair program cache changed during submission", "STATIC_BATCH_PROGRAM_CACHE_CHANGED");
        }
        committed += 1;
      };
      const result = device.submitStaticGeneratedUnlitPair(ticket, {
        onAttempt: () => {
          if (!this.staticUnlitPairCurrent(device, first, second)) {
            throw new RenderDeviceError("The generated pair changed during submission", "STATIC_BATCH_INVALIDATED");
          }
          commit(firstGenerated, 0);
        },
        onSubmitted: () => commit(secondGenerated, 1)
      });
      if ((result === "submitted" && committed !== 2) || (result === "declined" && committed !== 0)) {
        throw new RenderDeviceError("The generated pair submission did not preserve cache accounting", "STATIC_BATCH_PROGRAM_CACHE_CHANGED");
      }
      return result;
    }
    const ticket = device.prepareStaticUnlitPair([firstCommand, secondCommand]);
    if (!ticket || !this.staticUnlitPairCurrent(device, first, second)) return "declined";
    // The backend returns declined only before native submission. An exception
    // after entering native draw must escape: replay could draw a member twice.
    return device.submitStaticUnlitPair(ticket);
  }

  private combinedRunCurrent(device: RenderDevice, items: readonly RenderItem[], run: CombinedDrawPlanRun): boolean {
    const flags = rendererQrFlags(device);
    if (!combinedWebGLDevice(device) || !qrCoreGeneratorOn(flags) || !flags.on("A3D_PARITY_BATCHING")
      || !flags.on("A3D_QR_TIERS_BATCHING") || this.options.globalClipping || this.options.materialClippingFor || this.options.disableCombinedDraw
      || resolveContactShadowMask(this.contactMaskScope) || !isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)
      || !forwardDrawProvidersSafe(flags, true) || !items.every(forwardBuiltinParticipantSafe)
      || items.some((item) => item.material && materialInstanceColorTarget(item.material) === "emissive")) return false;
    if (items[0]?.material && [PBRMaterial.prototype, InstancedPBRMaterial.prototype].includes(Object.getPrototypeOf(items[0].material))) {
      if (!combinedPbrEnvironmentSafe(this.options)) return false;
      try {
        // Renderer projection normally supplies the standard normal matrix.
        // An authored override is only equivalent when its float32 value is
        // identical to the normal matrix used by ordinary logical drawing.
        if (items.some((item) => {
          if (!item.normalMatrix) return false;
          const packet = packedLoopMemberFor(item);
          if (!packet || item.normalMatrix.length !== 16) return true;
          const expected = normalMatrixFromModel(toMat4Values(packet.modelMatrix, "modelMatrix", item.label));
          return expected.some((value, index) => !Object.is(Math.fround(value), Math.fround(item.normalMatrix![index]!)));
        })) return false;
      } catch { return false; }
    }
    const entries = combinedForwardEntries(device, items);
    const first = entries[0];
    return first !== undefined && entries.length === run.members.length && entries.every((entry, index) =>
      entry !== undefined && entry.compatibilityKey === first.compatibilityKey && entry.indexType === run.indexType
      && entry.firstIndex === run.members[index]!.firstIndex && entry.indexCount === run.members[index]!.indexCount);
  }

  private tryCombinedRun(device: RenderDevice, queue: readonly RenderItem[], run: CombinedDrawPlanRun): boolean {
    const items = run.members.map((member) => queue[member.itemIndex]!);
    if (!this.combinedRunCurrent(device, items, run)) return false;
    // WebGL2 guarantees at least 2048 texture columns. The bounded planner
    // uses at most 1536; stage against that conservative guaranteed limit.
    const staged = stageCombinedDrawData(queue, run, 1536);
    if (!staged) return false;
    let transferred = false;
    try {
      const texture = staged.drawData.upload();
      const rows = staged.members.map((_, index) => staged.drawData.drawTexels(index).slice());
      if (!retainPackedLoopDrawData(device, staged.drawData)) return false;
      transferred = true;
      const submission: CombinedForwardSubmission = { items, run, staged, texture, textureRevision: texture.revision, rows, attempted: false };
      try {
        return withCombinedDrawCarrier(items[0]!, texture, (carrier) => this.drawItem(device, carrier, submission) === true);
      } catch (error) {
        // A failed speculative preparation has no observers and can follow
        // the original path. Once device submission is entered, never replay.
        if (submission.attempted) throw error;
        return false;
      }
    } finally {
      if (!transferred) staged.drawData.dispose();
    }
  }

  /**
   * Prepare the exact extra-output programs before committing to an MRT frame.
   * Only asynchronous compiler devices participate: compiling a new signal
   * variant must not consume the normal draw's synchronous compile budget.
   * No draw, draw callback, or feature binder is invoked here.
   */
  prepareSelectiveBloom(device: RenderDevice): string | null {
    const flags = rendererQrFlags(device);
    if (!qrCoreGeneratorOn(flags) || !device.probe?.parallelShaderCompile) return "generated-programs-unavailable";
    if (this.options.backgroundCoverage || forwardDrawHooks.length > 0) return "forward-hook-or-coverage";
    if ((this.options.lights?.length ?? 0) > FORWARD_DIRECT_LIGHT_CAPACITY) return "clustered-lighting";
    // A registered feature that selects nothing for a draw adds nothing to its
    // program (e.g. the default prd06.deform on rigid items). Features that do
    // select are checked where the ordinary loop selects them (non-stock ->
    // "shader-feature"), and only an ordinary program assembled from audited
    // producers can gain the signal output (ProgramGenerator provenance).
    // The velocity MRT writes the same output location as the signal.
    if (shaderFeaturesFor(flags).includes(registeredVelocityFeature) && flags.on("A3D_QR_POST_VELOCITY_MRT") && velocityFramePrepared()) return "velocity-mrt";
    if (materialLobes(flags).some((lobe) => !isStockPrd04Lobe(lobe))) return "material-lobe";
    // The normal warm-up already created this cache. Authenticate both its
    // actual lane provider and built-in implementation without calling either
    // an arbitrary provider or acquire (which can invoke a degradation sink).
    const cache = rendererProgramCachePeek(device, flags);
    if (!cache) return "generated-programs-unavailable";
    const compiler = selectiveCompilerFor(cache, device);
    if (compiler === "pending") return "signal-program-pending";
    if (compiler === "unavailable" || !selectiveCompilerMatchesDevice(compiler, device) ||
        !compiler.cacheModule.isBuiltinSelectiveBloomCache(cache, device, flags)) return "generated-programs-unavailable";
    this.generatorProgramCache = cache;
    for (const item of this.options.items) {
      const material = item.material;
      if (stockSelectiveMaterial(material) &&
          !materialRoutesToGeneratedProgram(material, { core: true, lobes: false }, { flags, tier: this.options.qualityTier ?? QUALITY_TIERS.high })) return "material-program";
      const reason = selectiveDrawDecline(item);
      if (reason) return reason;
    }
    // Reuse records already selected and generated by ordinary warmup or a
    // matching prior draw. No lobe/feature selector, binder, defines callback
    // or degradation sink is run to build these variants.
    const captured = compiler.cacheModule.prewarmCapturedSelectiveBloom(cache, device, flags, compiler.compile);
    if (!captured.handles) return captured.reason ?? "signal-program-unavailable";
    let pending = false;
    const preparedKeys = new Set<string>();
    for (const handle of captured.handles) {
      if (handle.status === "failed") return "signal-program-failed";
      if (handle.status !== "ready" || !handle.program) { pending = true; continue; }
      if (!handle.program.reflection.uniforms.has("u_a3dBloomWeight") ||
          !handle.program.reflection.uniforms.has("u_a3dBloomMaxRadiance")) return "signal-program-unavailable";
      preparedKeys.add(handle.key);
    }
    if (pending) return "signal-program-pending";
    if (this.options.selectiveBloom) this.options.selectiveBloom.preparedKeys = preparedKeys;
    return null;
  }

  private drawItem(device: RenderDevice, sourceItem: RenderItem, combined?: CombinedForwardSubmission, staticCapture?: StaticUnlitCapture): boolean | void {
    let item = sourceItem;
    // An instanced item with zero instances draws nothing (never a contract throw that blanks the frame).
    if (item.instanceTransforms !== undefined && item.instanceTransforms.length === 0) return;
    if (item.instanceCount !== undefined && (!Number.isSafeInteger(item.instanceCount) || item.instanceCount < 1)) {
      throw new RenderDeviceError("instanceCount must be a positive integer", "INVALID_INSTANCE_COUNT", { instanceCount: item.instanceCount });
    }
    if (item.instanceCount !== undefined && item.instanceTransforms !== undefined && item.instanceCount !== item.instanceTransforms.length / 16) {
      throw new RenderDeviceError("instanceCount must match the number of instance transforms", "INSTANCE_COUNT_MISMATCH", { instanceCount: item.instanceCount });
    }
    if (resolveContactShadowMask(this.contactMaskScope)
      && (item.onBeforeRender || !forwardContactProvidersSafe(rendererQrFlags(device)))) {
      throw new RenderDeviceError("Contact shadows require stable forward providers and draw participants", "CONTACT_SHADOW_DEPTH_STALE", { label: item.label });
    }
    const selective = this.options.selectiveBloom;
    if (selective?.enabled && selective.valid) {
      const reason = selectiveDrawDecline(item) ?? (forwardDrawHooks.length > 0 ? "forward-hook-or-coverage" : null);
      if (reason) invalidateSelectiveBloomFrame(selective, reason);
    }
    // threejs-parity L7/SG-09: three's Object3D.onBeforeRender fires
    // immediately before the draw call.
    item.onBeforeRender?.(item);
    // Local-shadow remapping can copy a light. Rebuild that list after the
    // user callback so profile visibility and transforms are from this draw.
    if (this.options.photometricFrame || this.options.projectedSpotFrame) this.shadedLightsMemo = undefined;
    this.adoptProjectedSpotLights();
    if (resolveContactShadowMask(this.contactMaskScope)
      && (item.onBeforeRender || !forwardContactProvidersSafe(rendererQrFlags(device)))) {
      throw new RenderDeviceError("Contact shadows require stable forward providers and draw participants", "CONTACT_SHADOW_DEPTH_STALE", { label: item.label });
    }
    const material = item.material ?? new UnlitMaterial();
    const baseMaterial = getBaseMaterial(material);
    const previewClipRange = baseMaterial instanceof DepthPreviewMaterial
      ? validateDepthPreviewDraw(item, baseMaterial, this.options, device) : undefined;
    // A portable/custom point material whose WGSL vertex stage declares `@aura3d-point-list` draws as a plain WebGPU
    // point list (one pixel per point: WebGPU has no point size) through the ordinary draw path, like any custom draw.
    const nativePoint = device.kind === "webgpu" && item.geometry.topology === "points" && !declaresWebgpuPointList(baseMaterial);
    // A custom (non built-in unlit) point material has no point-quad program. Its shader is still resolved first so a
    // custom shader without WGSL takes the ordinary skip path (CUSTOM_SHADER_WGSL_MISSING, every other draw continues)
    // instead of failing the mount; a resolvable one is rejected below, before anything is submitted.
    const customNativePoint = nativePoint && (Object.getPrototypeOf(baseMaterial) !== UnlitMaterial.prototype
      || (material instanceof MaterialInstance && Object.getPrototypeOf(material) !== MaterialInstance.prototype));
    if (nativePoint && !customNativePoint) {
      if (!isNativePointQuadDevice(device) || !qrCoreGeneratorOn(rendererQrFlags(device))) {
        throw new RenderDeviceError("Generated WebGPU points require the point-quad path", "NATIVE_UNLIT_POINTS_UNSUPPORTED", { material: baseMaterial.name });
      }
      if (item.skinning || item.morphTargets || item.morphWeights || item.geometry.morphTargets?.length
        || item.instanceTransforms || item.instanceColors || item.instanceAttributes || (item.instanceCount !== undefined && item.instanceCount !== 1)
        || item.geometry.vertexBuffer.format.streams.some(stream => stream.stepMode !== "vertex")) {
        throw new RenderDeviceError("WebGPU point quads do not support deformation or instancing", "WEBGPU_POINT_SOURCE_UNSUPPORTED", { label: item.label });
      }
    }
    const nativeSprite = device.kind === "webgpu" && (baseMaterial instanceof UnlitMaterial || baseMaterial instanceof InstancedUnlitMaterial)
      && material.getParameter("u_spriteMode") === 1;
    // Native billboards exist only as the generated unlit program's prd15.paritySprite variant (selected under A3D_PARITY_LINES).
    if (nativeSprite && (!qrCoreGeneratorOn(rendererQrFlags(device)) || !rendererQrFlags(device).on("A3D_PARITY_LINES"))) {
      throw new RenderDeviceError("Native WebGPU billboard sprites require a dedicated shader", "NATIVE_UNLIT_SPRITE_UNSUPPORTED", { material: baseMaterial.name });
    }
    const clipping = resolveForwardClipping(item, this.options, device);
    assertForwardClippingSupported(item, clipping, { flags: rendererQrFlags(device), cameraViewMatrix: this.spriteFrameCamera?.view ?? this.options.cameraViewMatrix, shaderLibrary: this.shaderLibrary });
    const advancedLighting = advancedLightingItemBinding(item, this.options.frameContext, { deferLightmapContentCheck: true });
    if (advancedLighting) {
      if (prd02ItemIrradianceBindings(item, device)) throw new RenderDeviceError("An item cannot combine advanced and volume diffuse lighting", "ADVANCED_LIGHTING_SOURCE_CONFLICT", {});
      if (advancedLighting.kind === "lightmap") {
        const semantic = advancedLighting.uvSet === 1 ? "uv1" : "uv";
        const name = advancedLighting.uvSet === 1 ? "a_uv1" : "a_uv";
        const location = advancedLighting.uvSet === 1 ? 7 : 2;
        const attribute = item.geometry.vertexBuffer.format.attributes.find((candidate) => candidate.semantic === semantic || candidate.shaderName === name);
        if (!attribute || attribute.components !== 2 || attribute.shaderLocation !== location || attribute.integer) {
          throw new RenderDeviceError("The baked lightmap UV channel is missing or incompatible", "ADVANCED_LIGHTING_UV_UNSUPPORTED", { semantic, location });
        }
      }
    }
    if (baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphRequiresWebGPU && device.kind !== "webgpu") {
      throw new RenderDeviceError("Shader graph storage resources require WebGPU", "GRAPH_STORAGE_BACKEND_UNSUPPORTED", { material: baseMaterial.name });
    }
    validateGraphGeometry(baseMaterial, item, device);
    const graphPhysical = baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphLightingModel === "metallic-roughness";
    const graphContactIndex = graphPhysical ? contactShadowLightIndex(this.contactMaskScope, item, this.shadedLights()) : -1;
    graphDrawShaderKey(baseMaterial, item, device, this.options.shadowMap, this.shadedLights(), this.options.environmentLighting, this.contactMaskScope);
    if (baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphLightingModel === "metallic-roughness"
        && this.shadedLights().some((light) => light.kind === "rect-area")) {
      throw new RenderDeviceError("Physical shader graphs do not yet support rectangular area lights", "GRAPH_RECT_LIGHT_UNSUPPORTED", { material: baseMaterial.name });
    }
    if (baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphLightingModel === "metallic-roughness") {
      const shadow = this.options.shadowMap;
      const directionalShadowActive = shadow && ((shadow.cascades?.length ?? 0) > 0
        ? shadow.cascades!.some((cascade) => cascade.shadowMap.strength !== 0)
        : shadow.strength !== 0);
      if (item.receiveShadow !== false && directionalShadowActive
        && this.shadedLights().filter((light) => light.kind === "directional" && light.castsShadow).length > 1) {
        throw new RenderDeviceError("Graph directional shadow maps cannot distinguish multiple shadow-casting directional lights", "GRAPH_MULTIPLE_DIRECTIONAL_SHADOWS_UNSUPPORTED", { material: baseMaterial.name });
      }
      if (item.receiveShadow !== false && shadow) {
        validateGraphLocalShadowSources(baseMaterial, shadow, this.shadedLights());
      }
    }
    // A combined candidate may still fall back before submission. Avoid the
    // public material writes here; reproduce them only after a successful
    // native call, once for each logical draw that it replaced.
    const photometric = combined ? undefined : this.photometricForDraw(device, item, baseMaterial);
    const projected = combined ? undefined : this.projectedSpotForDraw(device, item, baseMaterial, photometric);
    if (!combined) this.applyLightUniforms(material, photometric?.selection.packed ?? projected?.selection.packed);
    let shader: RenderShaderProgram | undefined;
    const clippedLine = clipping.groups.length > 0 && baseMaterial instanceof ScreenSpaceLineMaterial;
    const knownFailure = clippedLine || photometric || projected || this.options.weightedTransparency ? undefined : this.shaderFailureOutcome(baseMaterial, device, item);
    if (knownFailure !== undefined && selective?.enabled) invalidateSelectiveBloomFrame(selective, "shader-failure");
    if (knownFailure === undefined) {
      try {
        shader = this.getShader(baseMaterial, device, item, clipping, photometric, projected, staticCapture);
      } catch (error) {
        if (this.options.weightedTransparency) throw error;
        if (this.options.nativeDepthCoverage) throw error;
        if (combined && isShaderFailureError(error)) return false;
        if (clipping.groups.length > 0) throw error;
        if (!isShaderFailureError(error)) throw error;
        if (selective?.enabled) invalidateSelectiveBloomFrame(selective, "shader-failure");
        this.lastProgramFeatures = undefined;
        const mode = this.handleShaderFailure(error, baseMaterial, device, item);
        if (mode === "magenta") {
          this.drawItem(device, { ...item, onBeforeRender: undefined, material: shaderFailureDebugMaterial() });
        }
        return;
      }
    } else {
      if (this.options.nativeDepthCoverage) throw new RenderDeviceError("The native depth-coverage program failed", "NATIVE_DOF_COVERAGE_PROGRAM_UNAVAILABLE");
      if (combined) return false;
      // A program that already failed is not recompiled every frame: skip, or draw the magenta debug item.
      if (clipping.groups.length > 0) throw new RenderDeviceError("The clipping shader is unavailable", "FORWARD_CLIPPING_PROGRAM_UNSUPPORTED", { material: baseMaterial.name });
      if (advancedLighting) throw new RenderDeviceError("The advanced-lighting shader is unavailable", "ADVANCED_LIGHTING_PROGRAM_UNSUPPORTED", {});
      if (knownFailure === "magenta") {
        this.drawItem(device, { ...item, onBeforeRender: undefined, material: shaderFailureDebugMaterial() });
      }
      return;
    }
    if (shader === undefined) {
      if (this.options.weightedTransparency) throw new RenderDeviceError("The weighted transparency program is not ready", "WEIGHTED_TRANSPARENCY_PROGRAM_UNAVAILABLE");
      if (this.options.nativeDepthCoverage) throw new RenderDeviceError("The native depth-coverage program is not ready", "NATIVE_DOF_COVERAGE_PROGRAM_UNAVAILABLE");
      if (advancedLighting) throw new RenderDeviceError("The generated advanced-lighting program is not ready", "ADVANCED_LIGHTING_PROGRAM_PENDING", {});
      if (projected?.active) this.projectedSpotUnsupported("shader-pending", "The projected-spot program is not ready; this draw was skipped.");
      if (selective?.enabled) invalidateSelectiveBloomFrame(selective, "program-pending");
      return; // A3D_QR_CORE_GENERATOR async-skip (C-02 §A.2)
    }
    if (photometric?.active && (this.lastProgramFeatures?.features[PHOTOMETRIC_PROFILE_FEATURE] !== true ||
        ["u_a3dPhotometricOffsets", "u_a3dPhotometricMeta", "u_a3dPhotometricAtlas"].some((name) => !shader!.reflection.uniforms.has(name)))) {
      this.photometricUnsupported("shader-contract", "The selected shader cannot bind photometric profiles; scalar lighting is used.");
      photometric.active = false;
      shader = this.getShader(baseMaterial, device, item, clipping, photometric, projected);
      if (!shader) return;
    }
    if (projected?.active && (this.lastProgramFeatures?.features[PROJECTED_SPOT_FEATURE] !== true ||
        PROJECTED_SPOT_UNIFORMS.some((name) => !shader!.reflection.uniforms.has(name)) || !projectedSamplerBudgetAvailable(device, shader))) {
      this.projectedSpotUnsupported("shader-contract", "The projected-spot shader or sampler budget is unavailable; scalar lighting is used.");
      projected.active = false;
      shader = this.getShader(baseMaterial, device, item, clipping, photometric, projected);
      if (!shader) return;
    }
    const localShadowAtlas = this.options.shadowMap?.localShadows;
    const activeLocalShadows = localShadowAtlas !== undefined && localShadowAtlas.strength !== 0
      && this.shadedLights().some((light) => (light as LocalShadowedLight).localShadowSlot !== undefined);
    const litPhysical = this.lastProgramFeatures?.lighting === "lit" || LEGACY_PBR_DETAIL_SHADERS.has(baseMaterial.shaderKey)
      || baseMaterial.shaderKey === "aura3d/pbr-normal-map"
      || (baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphLightingModel === "metallic-roughness");
    const receiverContactIndex = litPhysical ? contactShadowLightIndex(this.contactMaskScope, item, this.shadedLights()) : -1;
    if ((graphPhysical && receiverContactIndex !== graphContactIndex)
      || (this.lastProgramFeatures?.lighting === "lit" && this.lastProgramFeatures.shadows.contact !== (receiverContactIndex >= 0))) {
      throw new RenderDeviceError("The contact shadow selection changed during shader acquisition", "CONTACT_SHADOW_MASK_STALE", {});
    }
    validateContactShadowReceiver(baseMaterial, receiverContactIndex, this.contactMaskScope);
    if (litPhysical && item.receiveShadow !== false && localShadowAtlas && activeLocalShadows
      && !shader.reflection.uniforms.has("u_localShadowAtlas")
      && (!(baseMaterial instanceof PortableShaderMaterial) || baseMaterial.graphLightingModel === "metallic-roughness")) {
      throw new RenderDeviceError("The selected physical shader cannot receive local shadow atlas tiles", "LOCAL_SHADOW_RECEIVER_UNSUPPORTED", { material: baseMaterial.name });
    }
    if (baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphMaterial && item.skinning) {
      const attributes = ["a_joints", "a_weights", ...(item.skinning.extraInfluences ? ["a_joints1", "a_weights1"] : [])];
      const uniforms = ["u_jointMatrices", "u_jointCount", "u_jointPaletteMode", "u_jointPaletteTexture", "u_jointPaletteTextureSize"];
      const reflection = shader.reflection;
      if (attributes.some((name) => !reflection.attributes.has(name)) || uniforms.some((name) => !reflection.uniforms.has(name))) {
        throw new RenderDeviceError("Shader graph skinning variant lacks the palette or attribute contract", "GRAPH_SKINNING_SHADER_UNSUPPORTED", { material: baseMaterial.name });
      }
    }
    // Generated iff getShader resolved a generated program for this draw (a
    // compile-failed fallback or an unskinnable skinned item is a legacy draw).
    if (customNativePoint) {
      throw new RenderDeviceError("Generated WebGPU points require the point-quad path", "NATIVE_UNLIT_POINTS_UNSUPPORTED", { material: baseMaterial.name });
    }
    let generated = this.lastProgramFeatures !== undefined;
    if (nativeSprite && (!generated || this.lastProgramFeatures?.features["prd15.paritySprite"] !== true)) {
      throw new RenderDeviceError("Native WebGPU billboard sprites require a dedicated shader", "NATIVE_UNLIT_SPRITE_UNSUPPORTED", { material: baseMaterial.name });
    }
    if (selective?.enabled && (!generated || this.lastProgramFeatures?.features[SELECTIVE_BLOOM_FEATURE] !== true)) {
      invalidateSelectiveBloomFrame(selective, generated ? "signal-program-unprepared" : "legacy-program");
    }
    if (clipping.groups.length > 0 && !generated && !clippedLine
      && !PortableShaderMaterial.hasGraphClippingContract(baseMaterial, shader.label)) {
      throw new RenderDeviceError("Clipping requires a generated forward shader", "FORWARD_CLIPPING_PROGRAM_UNSUPPORTED", { material: baseMaterial.name });
    }
    if (advancedLighting && !generated) throw new RenderDeviceError("Advanced lighting requires a generated lit physical program", "ADVANCED_LIGHTING_PROGRAM_UNSUPPORTED", { material: baseMaterial.name });
    if (!generated && litPhysical && hasLiveDiffuseTransmission(material)) {
      throw new RenderDeviceError("Diffuse transmission requires the generated physical receiver", "GENERATED_DIFFUSE_TRANSMISSION_LOBE_UNAVAILABLE", { material: baseMaterial.name });
    }
    const deform = this.lastProgramFeatures?.features["prd06.deform"];
    if (generated && item.skinning && typeof deform === "string" && /(?:^|\|)skin[48](?:\||$)/.test(deform)) {
      this.skinningPaletteUploads.validateGenerated(item, item.skinning);
    }
    // Large instanced draws: submit only the instances whose bounding sphere meets this pass's view frustum.
    const culled = this.cullInstancesToView(item, baseMaterial);
    if (culled !== null) {
      if (culled.count === 0) return;
      item = { ...item, instanceTransforms: culled.transforms, ...(item.instanceCount !== undefined ? { instanceCount: culled.count } : {}), ...(culled.colors ? { instanceColors: culled.colors } : {}) };
    }
    const usesGeometryMatrix = shader.reflection.uniforms.has("u_geometryMatrix")
      && (generated || (baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphMaterial && baseMaterial.graphSourcesPristine));
    if (item.instanceTransforms && baseMaterial.renderState.cullMode !== "none" && instancedItemNeedsPerInstanceCullState(item, usesGeometryMatrix)) {
      if (hasInstanceVertexStreams(item.geometry)) throw new RenderDeviceError("Per-instance vertex streams cannot be expanded for mixed culling", "INSTANCE_STREAM_EXPANSION_UNSUPPORTED", {});
      for (const expanded of expandInstancedRenderItem(item, this.options.cameraViewProjectionMatrix)) {
        this.drawItem(device, expanded);
      }
      return;
    }
    // GU47 E-D: a `material.custom` vertex shader that reads `instanceMatrix` / `instanceColor` draws every instance in
    // one call from the same per-instance attribute buffer the generated path uses (no split, no per-instance expansion).
    const authorInstancing = item.instanceTransforms !== undefined && !generated && supportsAuthorInstancing(shader);
    // Phase 6: generated programs only know attribute-matrix instancing — the
    // uniform fallback (`u_instanceMatrices[64]`) exists only in the frozen
    // legacy library, so the >64 split and no-support expansion never apply
    // on this path.
    if (item.instanceTransforms && !generated && !authorInstancing && !supportsInstanceAttributes(shader) && instanceTransformCount(item) > MAX_GPU_INSTANCES) {
      if (hasInstanceVertexStreams(item.geometry)) throw new RenderDeviceError("Per-instance vertex streams cannot be split across legacy draws", "INSTANCE_STREAM_SPLIT_UNSUPPORTED", {});
      for (const batch of splitInstanceTransforms(item.instanceTransforms)) {
        this.drawItem(device, { ...item, instanceTransforms: batch, ...(item.instanceCount !== undefined ? { instanceCount: batch.length / 16 } : {}) });
      }
      return;
    }
    if (item.instanceTransforms && !generated && !authorInstancing && !supportsInstanceAttributes(shader) && !supportsInstanceUniforms(shader)) {
      if (hasInstanceVertexStreams(item.geometry)) throw new RenderDeviceError("Per-instance vertex streams cannot be expanded for this shader", "INSTANCE_STREAM_EXPANSION_UNSUPPORTED", {});
      for (const expanded of expandInstancedRenderItem(item, this.options.cameraViewProjectionMatrix)) {
        this.drawItem(device, expanded);
      }
      return;
    }
    let uniforms = generated ? this.acquireUniformPacket(device) : new Map<string, UniformValue>();
    // Legacy WebGL can recover from a generated binding failure; a native
    // generated program must not silently lose features through that fallback.
    let binding: ReturnType<MaterialBinding["bindRecursive"]> | null = null;
    const bindMaterial = (currentShader: RenderShaderProgram) => {
      const recursive = baseMaterial instanceof PortableShaderMaterial
        && (baseMaterial.uniformSchema.some((uniform) => uniform.kind === "data")
          || [...material.getRecursiveParameters().values()].some((value) => !isFlatUniformValue(value)));
      return recursive ? this.materialBinding.bindRecursive(material, currentShader) : this.materialBinding.bind(material, currentShader);
    };
    try {
      binding = generated
        ? this.materialBinding.bindGenerated(material, shader, this.lastProgramFeatures, uniforms)
        : bindMaterial(shader);
    } catch (error) {
      if ((photometric?.active || projected?.active) && error instanceof MaterialBindingError) {
        if (photometric?.active) {
          this.photometricUnsupported("material-binding-unsupported", "The profile material bindings are unavailable; scalar lighting is used.");
          photometric.active = false;
        }
        if (projected?.active) {
          this.projectedSpotUnsupported("material-binding-unsupported", "The projected image material bindings are unavailable; scalar lighting is used.");
          projected.active = false;
        }
        shader = this.getShader(baseMaterial, device, item, clipping, photometric, projected);
        if (!shader) return;
        generated = this.lastProgramFeatures !== undefined;
        uniforms = generated ? this.acquireUniformPacket(device) : new Map<string, UniformValue>();
        binding = generated
          ? this.materialBinding.bindGenerated(material, shader, this.lastProgramFeatures, uniforms)
          : bindMaterial(shader);
      } else {
      if (combined && error instanceof MaterialBindingError) return false;
      if (this.options.weightedTransparency || !(error instanceof MaterialBindingError) || rendererQrFlags(device).on("A3D_QR_STRICT") || advancedLighting || clipping.groups.length > 0
        || (generated && (device.kind === "webgpu" || (this.lastProgramFeatures && requiresGeneratedEffectsProgram(this.lastProgramFeatures))))) throw error;
      if (selective?.enabled) invalidateSelectiveBloomFrame(selective, "material-binding");
      warnBindingOnce(item, baseMaterial, error, generated);
      if (!generated) return;
      this.lastProgramFeatures = undefined;
      generated = false;
      shader = this.legacyShader(baseMaterial, device, item);
      uniforms = new Map<string, UniformValue>();
      try {
        binding = bindMaterial(shader);
      } catch (legacyError) {
        if (!(legacyError instanceof MaterialBindingError)) throw legacyError;
        warnBindingOnce(item, baseMaterial, legacyError, false);
        return;
      }
      }
    }
    // Keep structured values out of the legacy packet and carry them separately
    // until an explicitly capable WebGPU portable submission is selected.
    const portableUniforms = new Map<string, RecursiveUniformValue>();
    if (!generated) for (const [name, value] of binding.uniforms) {
      const descriptor = baseMaterial instanceof PortableShaderMaterial
        ? baseMaterial.uniformSchema.find((uniform) => uniform.name === name) : undefined;
      if (descriptor?.kind === "data" && device.kind === "webgl2") {
        // S5-WP05-03: WebGL2 binds a data uniform as its GL leaf uniforms.
        for (const [leaf, leafValue] of flattenPortableDataUniform(descriptor as PortableShaderUniformDescriptor, value, baseMaterial.name)) uniforms.set(leaf, leafValue);
      } else if (descriptor?.kind === "data" || !isFlatUniformValue(value)) {
        if (!descriptor || device.kind !== "webgpu" || !device.drawPortable) {
          throw new RenderDeviceError("Structured material uniforms require portable WebGPU submission", "PORTABLE_UNIFORM_BACKEND_UNSUPPORTED", { material: baseMaterial.name, uniform: name });
        }
        portableUniforms.set(name, value);
      } else uniforms.set(name, value);
    }
    if (combined && (baseMaterial instanceof PBRMaterial || baseMaterial instanceof InstancedPBRMaterial)) {
      const packed = LightUniforms.pack(this.shadedLights());
      uniforms.set("u_lightCount", packed.lightCount);
      uniforms.set("u_lightData", packed.data);
    }
    applyClusteredLightingUniforms(this.clusteredLighting, shader, uniforms);
    // E3 stage-2b: under the conjunction a generated draw that selected
    // `prd02.ibl` shades indirect from the C-09 probe pack below (single
    // knob), so its other environment binds stop competing for the same
    // intensity names. E3 step 4/5: frozen draws under the conjunction get
    // bind-level suppression of their stacked terms (and of the stale 0.18
    // material default on no-environment draws) inside
    // applyEnvironmentLightingUniforms — see its header note.
    const drawFlags = rendererQrFlags(device);
    const e3Conjunction = qrE3CompilerLightingOn(drawFlags);
    const prd02Ibl = generated && e3Conjunction && this.lastProgramFeatures?.features[PRD02_IBL_FEATURE] !== undefined;
    const graphLighting = baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphLightingModel === "metallic-roughness";
    const localProbes = (generated && this.lastProgramFeatures?.features[PRD02_LOCAL_PROBE_FEATURE] === true) || graphLighting
      ? prd02ItemProbeBindings(item, device) : null;
    // A foreign-device tag must not activate its local probes, but its legacy
    // dominant-cube override still needs to be undone for the global light.
    const taggedProbes = prd02ItemProbeBindings(item);
    const environmentItem = taggedProbes ? globalEnvironmentItem(item, taggedProbes) : item;
    applyEnvironmentLightingUniforms(this.options.environmentLighting, environmentItem, shader, uniforms, { conjunction: e3Conjunction, generated });
    if (generated) applyGeneratedEnvironmentMapUniforms(this.options.environmentLighting, environmentItem, shader, uniforms, drawFlags);
    if (generated) applyGeneratedProceduralEnvironmentUniforms(this.options.environmentLighting, environmentItem, shader, uniforms, prd02Ibl);
    if (localProbes) {
      if (graphLighting) validateGraphEnvironmentUniforms(shader, [...GRAPH_LOCAL_PROBE_UNIFORMS, "u_a3dLocalProbeIntensity"], baseMaterial.name);
      for (const [name, value] of Object.entries(localProbes.uniforms)) uniforms.set(name, value);
      if (graphLighting) ensureGraphProbeCubeBindings(uniforms, baseMaterial.name);
      const intensity = uniforms.get("u_materialEnvironmentIntensity");
      uniforms.set("u_a3dLocalProbeIntensity", typeof intensity === "number" && Number.isFinite(intensity) ? Math.max(0, intensity) : 1);
    }
    if ((generated && this.lastProgramFeatures?.features[PRD02_IRRADIANCE_VOLUME_FEATURE] === true) || graphLighting) {
      const volume = prd02ItemIrradianceBindings(item, device);
      if (!volume && generated && this.lastProgramFeatures?.features[PRD02_IRRADIANCE_VOLUME_FEATURE] === true) {
        throw new RenderDeviceError("Selected irradiance volume is unavailable for this device", "IRRADIANCE_VOLUME_UNAVAILABLE", {});
      }
      if (volume) {
        if (graphLighting) validateGraphEnvironmentUniforms(shader, GRAPH_IRRADIANCE_VOLUME_UNIFORMS, baseMaterial.name);
        for (const [name, value] of Object.entries(volume.uniforms)) uniforms.set(name, value);
        if (graphLighting) validateGraphIrradianceBindings(uniforms, baseMaterial.name);
      }
    }
    if (graphLighting) {
      const cube = graphGlobalEnvironmentCube(this.options.environmentLighting, environmentItem);
      if (cube) {
        validateGraphEnvironmentUniforms(shader, ["u_graphGlobalEnvCube", "u_graphGlobalEnvCubeInfo", "u_graphGlobalEnvCubeEncoding", "u_graphGlobalEnvCubeDiffuseIntensity"], baseMaterial.name);
        uniforms.set("u_graphGlobalEnvCube", cube.binding);
        uniforms.set("u_graphGlobalEnvCubeInfo", cube.info);
        uniforms.set("u_graphGlobalEnvCubeEncoding", cube.encoding);
        uniforms.set("u_graphGlobalEnvCubeDiffuseIntensity", cube.diffuseIntensity);
      }
    }
    // threejs-parity L7/SR-02: three's `material.fog === false` — the draw
    // binds fog-disabled uniforms while other scene materials keep fog.
    const itemFog = baseMaterial.fog === false ? false : this.options.environmentFog;
    applyEnvironmentFogUniforms(itemFog, item, shader, uniforms);
    if (generated) applyGeneratedFogUniforms(itemFog, shader, uniforms);
    const selectedShadow = selectForwardShadowMap(this.options.shadowMap, item, this.options.cameraViewMatrix, this.options.cameraPosition);
    const effectiveShadow = selectedShadow && this.options.shadowMap && selectedShadow !== this.options.shadowMap
      ? { ...selectedShadow, pointLight: this.options.shadowMap.pointLight, spotLight: this.options.shadowMap.spotLight }
      : selectedShadow;
    applyForwardShadowMapUniforms(
      effectiveShadow,
      item,
      shader,
      uniforms,
      this.contactMaskScope
    );
    if (graphContactIndex >= 0 && ["u_contactShadowMask", "u_contactShadowMaskViewport", "u_contactShadowMaskStrength", "u_contactShadowLightIndex"]
      .some((name) => !shader.reflection.uniforms.has(name))) {
      throw new RenderDeviceError("The selected graph shader lacks the contact shadow contract", "GRAPH_CONTACT_SHADOW_CONTRACT", { material: baseMaterial.name });
    }
    if (!generated && litPhysical) {
      const index = contactShadowLightIndex(this.contactMaskScope, item, this.shadedLights());
      if (index >= 0 && baseMaterial instanceof TexturedPBRMaterial && baseMaterial.shaderVariant !== undefined) {
        throw new RenderDeviceError("This textured legacy variant cannot receive the contact mask", "CONTACT_SHADOW_RECEIVER_UNSUPPORTED", { material: baseMaterial.name });
      }
      if (index >= 0 && !shader.reflection.uniforms.has("u_contactShadowMask")) {
        throw new RenderDeviceError("The selected physical shader cannot receive the contact mask", "CONTACT_SHADOW_RECEIVER_UNSUPPORTED", { material: baseMaterial.name });
      }
      if (index >= 0 && !shader.reflection.uniforms.has("u_contactShadowLightIndex")) {
        throw new RenderDeviceError("The selected legacy shader cannot identify the contact-shadow light", "CONTACT_SHADOW_LEGACY_LIGHT_UNSUPPORTED", { material: baseMaterial.name });
      }
      if (index < 0 && shader.reflection.uniforms.has("u_contactShadowMaskStrength")) uniforms.set("u_contactShadowMaskStrength", 0);
      if (index >= 0 && shader.reflection.uniforms.has("u_contactShadowLightIndex")) uniforms.set("u_contactShadowLightIndex", index);
    }
    if (generated && this.lastProgramFeatures?.shadows.contact) {
      const index = contactShadowLightIndex(this.contactMaskScope, item, this.shadedLights());
      if (index < 0) throw new RenderDeviceError("The contact shadow light changed during the draw", "CONTACT_SHADOW_MASK_STALE", {});
      uniforms.set("u_contactShadowLightIndex", index);
    }
    // Portable graphs and native generated WebGPU programs consume the raw
    // atlas; generated WebGL retains the depth-comparison sampler.
    const atlas = this.options.shadowMap?.localShadows;
    const graphRawAtlas = baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphLightingModel === "metallic-roughness";
    if ((graphRawAtlas || (generated && device.kind === "webgpu")) && shader.reflection.uniforms.has("u_localShadowAtlas")) {
      if (item.receiveShadow !== false && atlas && activeLocalShadows) {
        const raw = atlas.rawTexture;
        if (!raw || !raw.texture || !raw.validate().ok || raw.texture.dimension !== "2d" || raw.sampler.compare !== undefined
          || raw.sampler.minFilter !== "nearest" || raw.sampler.magFilter !== "nearest"
          || (device.kind === "webgpu" && raw.texture.format === "depth24")) {
          throw new RenderDeviceError("Local shadows require a live nearest-sampled noncomparison atlas", graphRawAtlas ? "GRAPH_LOCAL_SHADOW_ATLAS_UNAVAILABLE" : "LOCAL_SHADOW_RAW_ATLAS_UNAVAILABLE", { material: baseMaterial.name });
        }
        applyForwardLocalShadowUniforms({ ...atlas, texture: raw }, item, shader, uniforms);
      } else {
        applyForwardLocalShadowUniforms(undefined, item, shader, uniforms);
        uniforms.set("u_localShadowAtlas", GRAPH_EMPTY_LOCAL_SHADOW_ATLAS);
      }
    } else {
      if (litPhysical && item.receiveShadow !== false && atlas && activeLocalShadows && shader.reflection.uniforms.has("u_localShadowAtlas")
        && (!atlas.texture || !atlas.texture.texture || !atlas.texture.validate().ok)) {
        throw new RenderDeviceError("The selected shader requires a live comparison shadow atlas", "LOCAL_SHADOW_ATLAS_UNAVAILABLE", { material: baseMaterial.name });
      }
      applyForwardLocalShadowUniforms(atlas, item, shader, uniforms);
    }
    applyOutputColorSpaceUniform(this.options.outputColorSpace ?? "srgb", item, shader, uniforms);
    applyCameraUniforms(this.options.cameraPosition, item, shader, uniforms);
    applyAlphaCutoffUniform(item, shader, uniforms);
    applyWrinkleUniform(item, shader, uniforms);
    if (this.options.weightedTransparency) {
      const { phase, bindings } = this.options.weightedTransparency;
      if (!generated || this.lastProgramFeatures?.features[PROGRAM_TRANSPARENCY_FEATURE] !== phase) {
        throw new RenderDeviceError("The weighted transparency shader is unavailable", "WEIGHTED_TRANSPARENCY_PROGRAM_UNAVAILABLE");
      }
      uniforms.set("u_a3dOpaqueDepth", bindings.depth);
      uniforms.set("u_a3dTransparencyDepthOrigin", bindings.depthOrigin);
      uniforms.set("u_a3dTransparencyReversedDepth", bindings.reversedDepth);
      uniforms.set("u_a3dTransparencyInputPremultiplied", 0);
    }
    applyTransformUniforms(item, shader, uniforms, this.options.cameraViewProjectionMatrix,
      baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphMaterial);
    // threejs-parity SH-02: the frame-scoped built-ins `material.custom` shaders
    // may declare (u_time/u_resolution/u_viewMatrix/u_projectionMatrix) — bound
    // only when the program actually reflects them, mirroring applyCameraUniforms.
    applyCustomShaderFrameUniforms(this.options, this.frameWidth, this.frameHeight, shader, uniforms);
    if (clippedLine && typeof uniforms.get("u_lineWorldUnits") === "number" && (uniforms.get("u_lineWorldUnits") as number) > 0.5) {
      bindClippedLineRasterCamera(this.options, uniforms);
    }
    // GU47 E-D: `a3d_lights` / sun / hemisphere / fog built-ins for `material.custom` programs (reflection-guarded).
    if (baseMaterial instanceof PortableShaderMaterial) {
      applyCustomShaderLightingUniforms(this.options, itemFog, shader, uniforms, this.customFrameCache);
      if (baseMaterial.graphLightingModel === "metallic-roughness") {
        applyGraphEnvironmentShIntensity(this.options.environmentLighting, uniforms, item);
        applyGraphCascadeUniforms(this.options, item, device, shader, uniforms);
      }
      if (baseMaterial.graphMaterial && shader.reflection.uniforms.has("u_a3dClipRange")) {
        // The frame camera's convention names its projection range (zero-to-one
        // for a reversed WebGPU frame rebuilt for native clip depth).
        uniforms.set("u_a3dClipRange", (this.options.projectionClipRange ?? this.options.frameContext?.camera?.depth?.clipRange) === "zero-to-one" ? 1 : 0);
      }
      // `instanceColor` reads white unless this instanced draw carries per-instance colours.
      if (shader.reflection.uniforms.has("u_a3dInstanceColors")) {
        uniforms.set("u_a3dInstanceColors", authorInstancing && item.instanceColors !== undefined ? 1 : 0);
      }
    }
    bindVelocityUniforms?.(item, uniforms);
    if (forwardDrawHooks.length > 0) {
      for (const hook of forwardDrawHooks) hook.bind(item, shader, (name, value) => uniforms.set(name, value));
    }
    if (generated && this.lastProgramFeatures) {
      // C-02 `ShaderFeature.bindUniforms` for the features this draw selected.
      bindShaderFeatureUniforms(this.lastProgramFeatures.features, rendererQrFlags(device), item,
        (name, value) => uniforms.set(name, value), this.options.frameContext,
        selective?.enabled && selective.valid ? (feature) => { if (!stockSelectiveFeature(feature)) invalidateSelectiveBloomFrame(selective, "shader-feature"); } : undefined);
      // E3 stage-2b bind site: `prd02.ibl` has no feature-local bind (the
      // probe, knob and ambient are pass state, not item state), so the
      // PRD-02 environment pack is bound here, in the feature-bind slot.
      if (prd02Ibl) applyPrd02EnvironmentUniforms(this.options.environmentLighting, environmentItem, material, uniforms);
      // C-03 `lobe.bind` (04-LOBES): descriptor factors and lobe textures for the
      // lobes this record carries. Material parameters stay authoritative.
      bindMaterialLobeUniforms(this.lastProgramFeatures.extensions, baseMaterial, rendererQrFlags(device),
        (name, value) => { if (!uniforms.has(name)) uniforms.set(name, value); },
        selective?.enabled && selective.valid ? (lobe) => { if (!isStockPrd04Lobe(lobe)) invalidateSelectiveBloomFrame(selective, "material-lobe"); } : undefined);
    }
    if (generated && this.lastProgramFeatures?.features[SELECTIVE_BLOOM_FEATURE] === true && this.options.selectiveBloom?.enabled) {
      uniforms.set("u_a3dBloomWeight", resolveBloomWeight(this.options.selectiveBloom.weights?.get(sourceItem) ?? item.bloomWeight));
      uniforms.set("u_a3dBloomMaxRadiance", this.options.selectiveBloom.maxRadiance ?? 65504);
    }
    if (previewClipRange !== undefined && baseMaterial instanceof DepthPreviewMaterial) {
      // Draw hooks can mutate the item or frame after the initial preflight.
      const currentRange = validateDepthPreviewDraw(item, baseMaterial, this.options, device);
      bindDepthPreviewFrameUniforms(this.options, item, baseMaterial, shader, uniforms, currentRange);
    }
    let transientPalette: TextureBinding | undefined;
    try {
      if (item.skinning && !generated) {
        // Legacy skinned programs take the u_jointMatrices palette; on the
        // generated path prd06.deform's bindUniforms binds the bone texture, and
        // a generated draw without it has no skin attributes (featuresForGeometry).
        const graphSkinning = baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphMaterial;
        if (graphSkinning) for (const name of ["u_jointMatrices", "u_jointCount", "u_jointPaletteMode", "u_jointPaletteTexture", "u_jointPaletteTextureSize"]) uniforms.delete(name);
        transientPalette = this.skinningPaletteUploads.bind(item, item.skinning, baseMaterial, shader, uniforms, device);
        if (graphSkinning && (!uniforms.has("u_jointMatrices") || !uniforms.has("u_jointCount") || !uniforms.has("u_jointPaletteMode") || !uniforms.has("u_jointPaletteTexture") || !uniforms.has("u_jointPaletteTextureSize"))) {
          throw new RenderDeviceError("Shader graph skinning palette was not bound", "GRAPH_SKINNING_PALETTE_UNAVAILABLE", { material: baseMaterial.name });
        }
      }
      const instanceBinding = item.instanceTransforms ? this.applyInstanceBinding(device, item, shader, uniforms, generated || authorInstancing) : { count: item.instanceCount ?? 1 };
      let geometry: Geometry | undefined;
      try {
        if (authorInstancing) uniforms.set("u_a3dInstancing", 1);
        const gpuMorph = item.morphTargets || item.morphWeights ? applyGpuMorphUniforms(item, shader, uniforms) : false;
        geometry = gpuMorph ? item.geometry : resolveRenderGeometry(item);
        // The legacy descriptor may require attributes intentionally omitted
        // from the generated variant; validate its own geometry contract here.
        if (!generated) validateMaterialGeometryContract(item, baseMaterial, geometry);
        const drawRange = resolveDrawRange(geometry, item.drawRange);
        // three's setDrawRange(0, 0) draws nothing; the device rejects zero-count draws, so skip here.
        if (drawRange.count === 0) return;
        const safeFeatures = this.lastProgramFeatures && this.lastProgramFeatures.extensions.length === 0 &&
          Object.keys(this.lastProgramFeatures.features).every((name) => ["a3d.nativePrimitive", "a3d.output.srgb", "a3d.clipping",
            "prd02.ibl", "prd02.shadowFilter", "prd03.indirectFraction"].includes(name));
        const candidate = combined && geometry === item.geometry ? packedLoopCandidate(device, combined.items[0]!)
          : !nativePoint && generated && safeFeatures && packedLoopMemberFor(item) && geometry === item.geometry &&
          [UnlitMaterial.prototype, PBRMaterial.prototype, TexturedPBRMaterial.prototype,
            InstancedUnlitMaterial.prototype, InstancedPBRMaterial.prototype].includes(Object.getPrototypeOf(baseMaterial)) &&
          isUnmodifiedDefaultShaderLibrary(this.shaderLibrary) ? packedLoopCandidate(device, item) : undefined;
        const usePacked = candidate && drawRange.start === candidate.sourceRange.start && drawRange.count === candidate.sourceRange.count;
        if (combined && !usePacked) return false;
        let submittedGeometry = usePacked ? candidate.packedGeometry : geometry;
        let submittedRange = usePacked ? candidate.packedRange : drawRange;
        let submittedVertices: readonly (RenderBuffer | undefined)[] | undefined;
        let submittedVertex: RenderBuffer | undefined;
        let submittedIndex: RenderBuffer | undefined;
        if (!nativePoint) {
          submittedVertices = submittedGeometry.uploadVertexBuffers(device, instanceBinding.count);
          submittedVertex = submittedVertices[0];
          if (!submittedVertex) throw new RenderDeviceError("Geometry has no primary vertex stream", "MISSING_VERTEX_BUFFER", {});
          submittedIndex = submittedGeometry.indexBuffer?.upload(device);
        }
        const pipeline = nativePoint ? undefined : this.pipelineFor(device, item, baseMaterial, shader, geometry, usesGeometryMatrix);
        const nativeStorageBindings = baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphRequiresWebGPU
          ? baseMaterial.graphStorageBindings("forward") : undefined;
        if (clipping.groups.length > 0) {
          assertForwardClippingSupported(item, clipping, { flags: rendererQrFlags(device), cameraViewMatrix: this.spriteFrameCamera?.view ?? this.options.cameraViewMatrix, shaderLibrary: this.shaderLibrary });
          if (generated ? this.lastProgramFeatures?.features[PROGRAM_CLIPPING_FEATURE] !== true
            : !clippedLine && !PortableShaderMaterial.hasGraphClippingContract(baseMaterial, shader.label)) {
            throw new RenderDeviceError("The selected shader does not preserve clipping", "FORWARD_CLIPPING_PROGRAM_UNSUPPORTED", { material: baseMaterial.name });
          }
          for (const [name, value] of createClippingUniforms(clipping)) {
            if (!shader.reflection.uniforms.has(name)) throw new RenderDeviceError("The selected shader lacks a clipping uniform", "FORWARD_CLIPPING_SHADER_CONTRACT", { material: baseMaterial.name, name });
            uniforms.set(name, value);
          }
          if (material.getParameter("u_spriteMode") === 1) {
            const model = uniforms.get("u_modelMatrix");
            const viewInverse = spriteClipInverse(this.spriteFrameCamera?.view ?? this.options.cameraViewMatrix ?? identityMatrix());
            const modelInverse = model instanceof Float32Array || Array.isArray(model) ? spriteClipInverse(model) : undefined;
            if (!viewInverse || (clipping.groups.some((group) => group.space === "local") && !modelInverse)) {
              throw new RenderDeviceError("Clipped sprites require finite, affine and invertible view and local transforms", "FORWARD_CLIPPING_SPRITE_TRANSFORM", { label: item.label });
            }
            for (const name of ["u_a3dSpriteViewToWorld", "u_a3dSpriteWorldToObject"]) {
              if (!shader.reflection.uniforms.has(name)) throw new RenderDeviceError("The selected sprite shader lacks a clipping transform", "FORWARD_CLIPPING_SHADER_CONTRACT", { material: baseMaterial.name, name });
            }
            uniforms.set("u_a3dSpriteViewToWorld", viewInverse);
            uniforms.set("u_a3dSpriteWorldToObject", modelInverse ?? new Float32Array(identityMatrix()));
          }
          if (clippedLine) bindClippedLineInverse(uniforms, shader, item);
        } else if (baseMaterial instanceof PortableShaderMaterial && baseMaterial.graphMaterial
          && shader.reflection.uniforms.has("u_a3dClipGroupCount")
          && (PortableShaderMaterial.hasGraphClippingContract(baseMaterial, shader.label)
            || material.getParameter("u_a3dClipGroupCount") === undefined)) {
          // A reused graph shader must never retain the previous draw's groups.
          uniforms.set("u_a3dClipGroupCount", 0);
        }
        const logDepth = device.getDepthConvention?.();
        if (logDepth?.mode === "logarithmic") {
          // Every draw of a logarithmic frame must write the same encoded
          // fragment depth; a program that cannot would mis-order surfaces.
          if (!generated || this.lastProgramFeatures?.features[PROGRAM_LOG_DEPTH_FEATURE] !== true
            || !shader.reflection.uniforms.has("u_a3dLogDepthView") || !shader.reflection.uniforms.has("u_a3dLogDepthRange")) {
            throw new RenderDeviceError("The selected shader does not write logarithmic fragment depth", "FORWARD_LOG_DEPTH_PROGRAM_UNSUPPORTED", { material: baseMaterial.name, label: item.label });
          }
          const view = this.spriteFrameCamera?.view ?? this.options.cameraViewMatrix;
          const range = logDepth.logRange;
          if (!view || !range) throw new RenderDeviceError("Logarithmic depth requires the frame view matrix and near/far range", "FORWARD_LOG_DEPTH_FRAME_UNAVAILABLE", { label: item.label });
          uniforms.set("u_a3dLogDepthView", new Float32Array(toMat4Values(view, "cameraViewMatrix", item.label)));
          uniforms.set("u_a3dLogDepthRange", [range.near, range.far]);
        }
        if (advancedLighting) {
          // User hooks and geometry resolution can change attachments. Check
          // the ticket and certificate after them, directly before submission.
          const current = advancedLightingItemBinding(item, this.options.frameContext);
          if (!current) throw new RenderDeviceError("Advanced lighting disappeared during draw", "ADVANCED_LIGHTING_RESOURCE_CHANGED", {});
          for (const [name, value] of Object.entries(advancedLightingFeatures(current))) {
            if (this.lastProgramFeatures?.features[name] !== value) {
              throw new RenderDeviceError("Advanced lighting changed after shader selection", "ADVANCED_LIGHTING_RESOURCE_CHANGED", { name });
            }
          }
          for (const [name, value] of Object.entries(current.uniforms)) {
            if (!shader.reflection.uniforms.has(name)) throw new RenderDeviceError("Generated program lacks an advanced lighting binding", "ADVANCED_LIGHTING_SHADER_CONTRACT", { name });
            uniforms.set(name, value);
          }
        }
        const generatedContact = generated && this.lastProgramFeatures?.shadows.contact === true;
        if (resolveContactShadowMask(this.contactMaskScope) && !forwardContactProvidersSafe(rendererQrFlags(device))) {
          throw new RenderDeviceError("Contact shadow forward providers changed during the draw", "CONTACT_SHADOW_DEPTH_STALE", { label: item.label });
        }
        validateContactShadowReceiver(baseMaterial, receiverContactIndex, this.contactMaskScope);
        if (litPhysical && contactShadowLightIndex(this.contactMaskScope, item, this.shadedLights()) !== receiverContactIndex) {
          throw new RenderDeviceError("The contact shadow selection changed during the draw", "CONTACT_SHADOW_MASK_STALE", {});
        }
        if (generatedContact || receiverContactIndex >= 0) {
          const mask = resolveContactShadowMask(this.contactMaskScope);
          const binding = uniforms.get("u_contactShadowMask");
          if (!mask || !isTextureBinding(binding) || binding.texture !== mask.texture
            || uniforms.get("u_contactShadowMaskStrength") !== Math.min(1, mask.strength)
            || uniforms.get("u_contactShadowLightIndex") !== contactShadowLightIndex(this.contactMaskScope, item, this.shadedLights())) {
            throw new RenderDeviceError("The scoped contact shadow mask changed during the draw", "CONTACT_SHADOW_MASK_STALE", {});
          }
        }
        if (photometric?.active) {
          const frame = this.options.photometricFrame!;
          if (!generated || this.lastProgramFeatures?.features[PHOTOMETRIC_PROFILE_FEATURE] !== true ||
              !photometric.lease.isCurrent(frame.identity) || !photometric.sourceCurrent()) {
            this.photometricUnsupported("draw-changed", "Photometric light data changed during the draw; this draw was skipped.");
            return;
          }
          uniforms.set("u_lightCount", photometric.selection.packed.lightCount);
          uniforms.set("u_lightData", photometric.selection.packed.data);
          uniforms.set("u_a3dPhotometricOffsets", photometric.packet.offsets);
          uniforms.set("u_a3dPhotometricMeta", photometric.packet.meta);
          uniforms.set("u_a3dPhotometricAtlas", photometric.packet.binding);
        }
        if (nativePoint) {
          if (!generated || !isNativePointQuadDevice(device) || geometry !== item.geometry
            || this.lastProgramFeatures?.features["a3d.nativePrimitive"] !== "points") {
            throw new RenderDeviceError("Generated WebGPU points require the point-quad path", "NATIVE_UNLIT_POINTS_UNSUPPORTED", { material: baseMaterial.name });
          }
          // Preserve the logical item through callbacks; only the checked
          // submission needs the implicit default material made explicit.
          this.submitNativePoint(device, item.material ? item : { ...item, material }, drawRange, shader, uniforms, baseMaterial);
          return;
        }
        if (combined) {
          const features = this.lastProgramFeatures;
          const bytes = combined.texture.data;
          if (!generated || !features || features.features["parity.batchDraw"] !== "multi-draw"
            || features.features["prd11.drawId"] !== undefined || features.extensions.length !== 0 || features.instancing !== undefined
            || features.vertexColors || Object.values(features.maps).some(Boolean)
            || [...INSTANCE_MATRIX_ATTRIBUTE_NAMES, "a_instanceColor"].some((name) => shader.reflection.attributes.has(name))
            || Object.keys(features.features).some((name) => !["parity.batchDraw", "a3d.nativePrimitive", "a3d.output.srgb"].includes(name))
            || !shader.reflection.uniforms.has("u_a3dDrawData") || shader.reflection.uniforms.has("u_drawId")
            || uniforms.get("u_a3dDrawData") !== drawDataBindingFor(combined.texture)
            || combined.texture.disposed || combined.texture.revision !== combined.textureRevision || !(bytes instanceof Float32Array)
            || bytes.length !== combined.rows.length * 24 || combined.rows.some((row, rowIndex) => {
              const current = combined.staged.drawData.drawTexels(rowIndex);
              return row.some((value, index) => !Object.is(value, current[index]) || !Object.is(value, bytes[rowIndex * 24 + index]));
            }) || !pipeline || !submittedVertex || !submittedIndex || !submittedGeometry.indexBuffer
            || !this.combinedRunCurrent(device, combined.items, combined.run)
            || !packedLoopDrawDataCurrent(device, combined.staged.drawData) || !combinedWebGLDevice(device)) return false;
          const base = pipeline.createDrawCommand({ label: item.label, vertexBuffer: submittedVertex,
            ...(submittedVertices === undefined ? {} : { vertexBuffers: submittedVertices }),
            vertexCount: submittedGeometry.vertexBuffer.vertexCount, uniforms, indexBuffer: submittedIndex,
            indexType: submittedGeometry.indexBuffer.type, indexCount: combined.run.members[0]!.indexCount,
            firstIndex: combined.run.members[0]!.firstIndex, instanceCount: 1 });
          const commands = combined.run.members.map((member) => ({ ...base, firstIndex: member.firstIndex, indexCount: member.indexCount }));
          // No fallback is allowed after the device enters a native attempt;
          // false means its combined-only method performed no draw at all.
          combined.attempted = true;
          let submitted: boolean;
          try { submitted = device.tryMultiDrawElementsInstanced(commands); }
          catch (error) {
            // An ordinary failed first draw has already performed one logical
            // material update. Preserve it, without replaying any member.
            this.applyLightUniforms(material);
            throw error;
          }
          if (submitted) for (const _member of combined.items) this.applyLightUniforms(material);
          return submitted;
        }
        // Shader selection and all item callbacks use the logical geometry.
        // A synchronous loop may then replace just its equivalent vertex/index
        // storage and range, leaving one ordinary device draw per member.
        // Uploads and feature binders can invoke code after the initial check.
        // Fall back to the source if a member or supported device entry moved.
        if (usePacked && packedLoopCandidate(device, item) !== candidate) {
          submittedGeometry = geometry;
          submittedRange = drawRange;
          submittedVertices = geometry.uploadVertexBuffers(device, instanceBinding.count);
          submittedVertex = submittedVertices[0];
          if (!submittedVertex) throw new RenderDeviceError("Geometry has no primary vertex stream", "MISSING_VERTEX_BUFFER", {});
          submittedIndex = geometry.indexBuffer?.upload(device);
        }
        if (!pipeline || !submittedVertex) throw new RenderDeviceError("Forward draw resources are unavailable", "MISSING_VERTEX_BUFFER", {});
        if (this.options.nativeDepthCoverage) {
          this.options.nativeDepthCoverage.assertCurrent();
          if (!generated || this.lastProgramFeatures?.features[DEPTH_COVERAGE_FEATURE] !== true || nativePoint || combined || usePacked) {
            throw new RenderDeviceError("The selected draw cannot preserve native depth coverage", "NATIVE_DOF_COVERAGE_DRAW_UNSUPPORTED");
          }
        }
        if (projected?.active) {
          const frame = this.options.projectedSpotFrame!;
          if (!generated || device.kind !== "webgl2" || !projectedSpotItemSupported(item) ||
              this.lastProgramFeatures?.features[PROJECTED_SPOT_FEATURE] !== true || this.lastProgramFeatures.instancing ||
              this.lastProgramFeatures.skinning || this.lastProgramFeatures.morph || this.lastProgramFeatures.drawId ||
              this.lastProgramFeatures.features["prd06.deform"] !== undefined ||
              !projected.sourceCurrent() || !projected.packet.isCurrent(frame.identity) ||
              (photometric?.active && (photometric.selection !== projected.selection ||
                !photometric.lease.isCurrent(this.options.photometricFrame!.identity) || !photometric.sourceCurrent()))) {
            this.projectedSpotUnsupported("draw-changed", "Projected light data changed during the draw; this draw was skipped.");
            return;
          }
          uniforms.set("u_lightCount", projected.selection.packed.lightCount);
          uniforms.set("u_lightData", projected.selection.packed.data);
          for (const [name, value] of Object.entries(projected.packet.uniforms)) uniforms.set(name, value);
          const usedSamplers = [...uniforms].filter(([name, value]) => shader!.reflection.uniforms.has(name) && isTextureBinding(value)).length;
          if (!Number.isSafeInteger(device.info.maxFragmentTextureUnits) || usedSamplers > device.info.maxFragmentTextureUnits!) {
            this.projectedSpotUnsupported("sampler-budget", "The projected image exceeds the available texture units; this draw was skipped.");
            return;
          }
        }
        const drawBindings = { item, vertexBuffer: submittedVertex,
          vertexBuffers: submittedVertices, indexBuffer: submittedIndex, drawRange: submittedRange, uniforms, instanceBinding, nativeStorageBindings,
          checked: (receiverContactIndex >= 0 && device.kind === "webgpu") || Boolean(this.options.nativeDepthCoverage) };
        if (staticCapture) {
          if (generated !== (staticCapture.generatedRequested === true)
            || (generated && (!staticCapture.generated || staticCapture.generated.program !== shader
              || !staticGeneratedUnlitFeaturesSafe(staticCapture.generated.features)))
            || nativePoint || combined || usePacked || geometry !== item.geometry || !submittedIndex
            || pipeline.createDrawCommand !== staticPairPipelineCommand || advancedLighting || photometric?.active || projected?.active
            || clipping.groups.length || generatedContact || receiverContactIndex >= 0 || this.options.nativeDepthCoverage) return false;
          staticCapture.command = createForwardDrawCommand(pipeline, submittedGeometry, instanceBinding.count, submittedRange, drawBindings);
          return true;
        }
        try {
          if (portableUniforms.size) {
            if (device.kind !== "webgpu" || !device.drawPortable) {
              throw new RenderDeviceError("Portable uniform submission is unavailable", "PORTABLE_UNIFORM_BACKEND_UNSUPPORTED", { material: baseMaterial.name });
            }
            const combinedUniforms = new Map<string, RecursiveUniformValue>(uniforms);
            for (const [name, value] of portableUniforms) {
              if (combinedUniforms.has(name)) {
                throw new RenderDeviceError("A forward binding overwrote a portable data uniform", "PORTABLE_UNIFORM_BINDING_COLLISION", { material: baseMaterial.name, uniform: name });
              }
              combinedUniforms.set(name, value);
            }
            const command = createForwardDrawCommand(pipeline, submittedGeometry, instanceBinding.count, submittedRange, drawBindings);
            device.drawPortable({ ...command, uniforms: combinedUniforms }, drawBindings.checked);
          } else {
            submitDraw(device, pipeline, submittedGeometry, instanceBinding.count, submittedRange, drawBindings);
          }
        } catch (error) {
          if (photometric?.active) this.photometricUnsupported("submission-failed", "Photometric draw submission failed; the frame was stopped.");
          if (projected?.active) this.projectedSpotUnsupported("submission-failed", "Projected-spot draw submission failed; the frame was stopped.");
          throw error;
        }
        // The packet's lifetime is scoped to this draw; do not leave it in a
        // deferred multi-draw queue across another item's mutation callback.
        if (advancedLighting || photometric?.active || projected?.active || clipping.groups.length > 0 || generatedContact || receiverContactIndex >= 0 || this.options.nativeDepthCoverage) flushMultiDrawQueue(device);
      } finally {
        try {
          if ((instanceBinding.buffers?.length ?? 0) > 0 || (geometry && geometry !== item.geometry)) flushMultiDrawQueue(device);
        } finally {
          for (const buffer of instanceBinding.buffers ?? []) buffer.dispose();
          if (geometry && geometry !== item.geometry) geometry.dispose();
        }
      }
    } finally {
      if (transientPalette) {
        try { flushMultiDrawQueue(device); } finally { transientPalette.texture?.dispose(); }
      }
    }
  }

  private submitNativePoint(device: NativeForwardPointDevice, item: RenderItem, range: RenderItemDrawRange,
    shader: RenderShaderProgram, uniforms: Map<string, UniformValue>, material: Material): void {
    let owner = ForwardPass.pointArenas.get(device);
    if (!owner) {
      owner = { arena: new NativePointQuadArena(device, { maxCpuBytes: 64 * 1024 * 1024, maxGpuBytes: 32 * 1024 * 1024, maxStreamBytes: 32 * 1024 * 1024 }) };
      ForwardPass.pointArenas.set(device, owner);
    }
    if (owner.failure !== undefined) {
      throw new RenderDeviceError("A previous point resource retirement failed", "WEBGPU_POINT_RETIREMENT_FAILED", { cause: String(owner.failure) });
    }
    const viewport = device.getNativePointViewport();
    uniforms.set("u_a3dPointViewport", [viewport.width, viewport.height]);
    const lease = owner.arena.acquire(item.geometry, range);
    try {
      const buffers = lease.upload();
      const vertexBuffer = buffers[0];
      if (!vertexBuffer) throw new RenderDeviceError("Point quad has no primary vertex stream", "MISSING_VERTEX_BUFFER", {});
      device.drawNativePointQuads({ label: item.label, topology: "triangles", renderState: renderStateForDepthConvention({ ...material.renderState, cullMode: "none" }, device.getDepthConvention?.()),
        vertexBuffer, vertexBuffers: buffers, vertexFormat: lease.vertexFormat, vertexCount: lease.vertexCount, shader, uniforms },
      { lease, item, range, viewport });
    } finally {
      const pointOwner = owner;
      void lease.release().catch(error => { pointOwner.failure = error; });
    }
  }

  /**
   * Per-instance frustum culling for large instanced items (see renderer/InstanceFrustumCull.ts). Only the main camera of this pass is used,
   * and only for plain meshes: skinned/morphed/custom-attribute items, custom shader materials (vertex displacement) and items that opt out
   * with `frustumCulled: false` always draw every instance.
   */
  private cullInstancesToView(item: RenderItem, baseMaterial: Material): InstanceFrustumCullResult | null {
    const transforms = item.instanceTransforms;
    const viewProjection = this.options.cameraViewProjectionMatrix;
    if (!(transforms instanceof Float32Array) || viewProjection === undefined || viewProjection.length < 16 || hasInstanceVertexStreams(item.geometry)) return null;
    if (transforms.length < MIN_CULLED_INSTANCES * 16) return null;
    if (instanceCullExcluded(item, baseMaterial instanceof PortableShaderMaterial)) return null;
    const colors = item.instanceColors;
    if (colors !== undefined && !(colors instanceof Float32Array)) return null;
    const typedColors = colors instanceof Float32Array ? colors : undefined;
    return cullInstancesToFrustum({ viewProjection, modelMatrix: item.modelMatrix, bounds: item.geometry.bounds, transforms, ...(typedColors ? { colors: typedColors } : {}) });
  }

  /**
   * Generated-path instancing (Phase 6): attribute matrices only — the
   * `u_instanceMatrices[64]` uniform path exists solely in the frozen legacy
   * library. Matrices (and colors) ride a persistent per-slot `InstanceBuffer`;
   * `buffers` carries only transient extra-attribute buffers, which the draw
   * finally-block disposes.
   */
  private applyInstanceBinding(
    device: RenderDevice,
    item: RenderItem,
    shader: RenderShaderProgram,
    uniforms: Map<string, UniformValue>,
    generated: boolean
  ): { readonly count: number; readonly attributes?: readonly InstanceVertexAttribute[]; readonly buffers?: readonly RenderBuffer[] } {
    if (!generated) return applyInstanceBinding(device, item, shader, uniforms);
    const source = validateInstanceTransformSource(item);
    const count = source.length / 16;
    const slot = this.instanceSlotFor(device, item.label, source, count, item.instanceColors !== undefined);
    slot.buffer.setMatrices(source instanceof Float32Array ? source : new Float32Array(source), count);
    if (item.instanceColors) {
      slot.buffer.setColors(item.instanceColors instanceof Float32Array ? item.instanceColors : new Float32Array(item.instanceColors));
    }
    const bound = slot.buffer.bind();
    const extra = createExtraInstanceAttributeBindings(device, item, count, false);
    // GU47 E-D: `instanceColorTarget: "emissive"` — the colours feed the emissive term only (prd04.instanceColorTarget).
    // The generated WebGPU program reads the "emissive" colours at the instance colour location (GeneratedPbrProgram).
    const colorAttribute = materialInstanceColorTarget(item.material) === "emissive" && device.kind !== "webgpu" ? A3D_INSTANCE_EMISSIVE_ATTRIBUTE : "a_instanceColor";
    // WebGL2 binds instance streams by name, so a program that never reads the colours (a `material.custom` twin with
    // only the matrix inputs, e.g. Cross Hop's sun-shade decal) silently skips them. WebGPU validates every stream against
    // the shader's inputs, so the unread colour stream is left out there instead of failing the mount.
    const bindColors = bound.colorBuffer !== undefined && (device.kind !== "webgpu" || shader.reflection.attributes.has(colorAttribute));
    return {
      count,
      attributes: [
        ...INSTANCE_MATRIX_ATTRIBUTE_NAMES.map((shaderName, column) => ({
          buffer: bound.matrixBuffer,
          shaderName,
          components: 4 as const,
          offset: column * 16,
          stride: 64,
          divisor: 1
        })),
        ...(bindColors && bound.colorBuffer ? [{
          buffer: bound.colorBuffer,
          shaderName: colorAttribute,
          components: 4 as const,
          offset: 0,
          stride: 16,
          divisor: 1
        }] : []),
        ...extra.attributes
      ],
      ...(extra.buffers.length > 0 ? { buffers: extra.buffers } : {})
    };
  }

  private applyLightUniforms(material: RenderMaterial, selected?: PackedLightUniforms): void {
    const baseMaterial = getBaseMaterial(material);
    if (!baseMaterial.requiredUniforms.includes("u_lightCount") || !baseMaterial.requiredUniforms.includes("u_lightData")) {
      return;
    }
    const packed = selected ?? LightUniforms.pack(this.shadedLights());
    if (material instanceof MaterialInstance) {
      material.setOverride("u_lightCount", packed.lightCount);
      material.setOverride("u_lightData", packed.data);
    } else {
      material.setParameter("u_lightCount", packed.lightCount);
      material.setParameter("u_lightData", packed.data);
    }
  }

  private readonly failedShaders = new WeakMap<Material, { readonly revision: number; readonly variantKey: string; readonly mode: ShaderFailureMode }>();

  /** Outcome for a material whose program already failed (undefined: not failed, or the shader library changed since). */
  private shaderFailureOutcome(material: Material, device: RenderDevice, item?: RenderItem): ShaderFailureMode | undefined {
    const failed = this.failedShaders.get(material);
    if (!failed) return undefined;
    if (failed.revision !== this.shaderLibrary.getRevision()) {
      this.failedShaders.delete(material);
      return undefined;
    }
    if (failed.variantKey !== shaderCacheKey(material, this.legacyDetailDefines(material, device, item), item && graphDrawShaderKey(material, item, device, this.options.shadowMap, this.shadedLights(), this.options.environmentLighting, this.contactMaskScope))) return undefined;
    return failed.mode;
  }

  /** Records a compile/link/WGSL failure, logs it once, and returns how the item is handled. Strict rethrows. */
  private handleShaderFailure(error: unknown, material: Material, device: RenderDevice, item?: RenderItem): ShaderFailureMode {
    const strict = rendererQrFlags(device).on("A3D_QR_STRICT");
    const mode = resolveShaderFailureMode(strict);
    let sources: { vertex?: string; fragment?: string } = {};
    const defines = this.legacyDetailDefines(material, device, item);
    const key = item ? graphDrawShaderKey(material, item, device, this.options.shadowMap, this.shadedLights(), this.options.environmentLighting, this.contactMaskScope) : material.shaderKey;
    try {
      const compiled = material.shaderVariant && key === material.shaderKey
        ? this.shaderLibrary.compileVariant(key, material.shaderVariant, trustedShaderVariantOptions(defines))
        : this.shaderLibrary.compileSource(key, { defines });
      sources = { vertex: compiled.vertex, fragment: compiled.fragment };
    } catch {
      // the source registry no longer has the pair: the record keeps the driver log only
    }
    const authored = (material as { readonly shaderAuthoredSource?: { readonly vertex?: string; readonly fragment?: string } }).shaderAuthoredSource;
    const record = reportShaderFailure(
      error,
      material,
      { ...sources, ...(authored ? { authored } : {}) },
      mode,
      mode === "throw" ? "Strict mode: failing the frame." : mode === "magenta" ? "Drawing it magenta; other draws continue." : "The item is skipped; every other draw continues."
    );
    if (mode === "throw") {
      throw new RenderDeviceError(formatShaderFailure(record), record.code, { material: record.material, stage: record.stage, log: record.log, locations: record.locations });
    }
    this.failedShaders.set(material, { revision: this.shaderLibrary.getRevision(), variantKey: shaderCacheKey(material, defines, key), mode });
    return mode;
  }

  private getShader(material: Material, device: RenderDevice, item?: RenderItem, clipping?: ClippingBinding, photometric?: ForwardPhotometricBinding,
    projected?: ForwardProjectedSpotBinding, staticCapture?: StaticUnlitCapture): RenderShaderProgram | undefined {
    const flags = rendererQrFlags(device);
    this.lastProgramFeatures = undefined;
    if (clipping && clipping.groups.length > 0 && material instanceof ScreenSpaceLineMaterial) {
      const cache = getForwardPassShaderCache(device, this.shaderLibrary);
      const key = `${DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME}:clipped`;
      let module = cache.get(key);
      if (!module) {
        const source = certifiedDefaultScreenLineSource(this.shaderLibrary);
        if (!source) throw new RenderDeviceError("Clipped screen-space lines require an authenticated shader source", "FORWARD_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED", { material: material.name });
        module = new ShaderModule(createClippedScreenSpaceLineShader(source));
        cache.set(key, module);
      }
      return module.compile(device);
    }
    // PRD-04 lobe-bearing materials need the generated shader even without
    // core; an explicit sRGB output selects the generator's encode variant.
    const route = {
      core: qrCoreGeneratorOn(flags),
      lobes: qrMaterialsLobeProgramsOn(flags)
    };
    if (this.options.selectiveBloom?.enabled && !route.core) invalidateSelectiveBloomFrame(this.options.selectiveBloom, "generated-programs-unavailable");
    const materialContext = { flags, tier: this.options.qualityTier ?? QUALITY_TIERS.high };
    const liveExtensions = route.lobes && item?.material instanceof MaterialInstance
      ? withLivePhysicalMapFeatures(material.programFeatures(materialContext), item.material, materialContext).extensions : undefined;
    if ((route.core || route.lobes) && materialRoutesToGeneratedProgram(material, route, materialContext, liveExtensions)) {
      const warning = materialFeatureWarning(material);
      if (warning) console.warn(`[prd01] ${warning}`);
      this.lastProgramFeatures = this.programFeaturesFor(material, device, item, clipping, photometric?.active === true, projected?.active === true);
      const selective = this.options.selectiveBloom;
      const compiler = trustedSelectiveCompiler;
      const cache = this.generatorProgramCache;
      if (selective?.enabled && this.lastProgramFeatures.features[SELECTIVE_BLOOM_FEATURE] === true &&
          (!selective.preparedKeys?.has(programKey(this.lastProgramFeatures)) || !compiler || !cache ||
           !selectiveCompilerMatchesDevice(compiler, device) ||
           !compiler.cacheModule.capturedSelectiveBloomReady(cache, device, flags, programKey(this.lastProgramFeatures)))) {
        // State or feature selection changed after preflight. Do not compile a
        // new optional variant (which could skip this draw or invoke app
        // callbacks); acquire the exact ordinary variant and ignore the signal.
        invalidateSelectiveBloomFrame(selective, "signal-program-unprepared");
        const { [SELECTIVE_BLOOM_FEATURE]: _signal, ...features } = this.lastProgramFeatures.features;
        this.lastProgramFeatures = { ...this.lastProgramFeatures, features };
      }
      if (this.lastProgramFeatures.features["prd15.paritySprite"] === true && !spriteCameraMatchesRaster(this.spriteFrameCamera)) {
        throw new RenderDeviceError("Sprite view and projection do not match the raster camera", "SPRITE_CAMERA_MATRIX_UNSUPPORTED", { material: material.name });
      }
      if (this.lastProgramFeatures.features["prd11.drawId"] !== undefined
        || this.lastProgramFeatures.features["parity.batchDraw"] !== undefined) {
        if (!item || !isActiveCombinedDrawCarrier(item) || device.kind !== "webgl2"
          || this.lastProgramFeatures.features["parity.batchDraw"] !== "multi-draw"
          || this.lastProgramFeatures.features["prd11.drawId"] !== undefined) {
          throw new RenderDeviceError("Packed draw rows require authenticated logical members", "PACKED_DRAW_PROVENANCE_UNAVAILABLE", { material: material.name });
        }
      }
      if (clipping && clipping.groups.length > 0 && (item?.material ?? material).getParameter("u_spriteMode") === 1
        && this.lastProgramFeatures.features["prd15.paritySprite"] !== true) {
        throw new RenderDeviceError("Clipped sprites require the generated billboard feature", "FORWARD_CLIPPING_SPRITE_UNSUPPORTED", { material: material.name });
      }
      if (device.kind === "webgpu" && this.lastProgramFeatures.lighting === "unlit"
        && this.lastProgramFeatures.features["a3d.nativePrimitive"] === "points" && !isNativePointQuadDevice(device)) {
        throw new RenderDeviceError("Generated WebGPU points require the point-quad path", "NATIVE_UNLIT_POINTS_UNSUPPORTED", { material: material.name });
      }
      const effectiveMaterial = item?.material ?? material;
      if (this.lastProgramFeatures.lighting === "lit" && hasLiveTransmission(effectiveMaterial)
        && (!this.lastProgramFeatures.extensions.some((extension) => extension.lobe === "transmission" || extension.lobe === "KHR_materials_transmission")
          || this.lastProgramFeatures.features["prd04.transmissionTarget"] !== true)) {
        // 4.7.x drew such a material without transmission. Strict mode keeps the failure; otherwise degrade and say so once.
        if (rendererQrFlags(device).on("A3D_QR_STRICT")) throw new RenderDeviceError("Generated transmission requires its physical lobe and frame capture", "TRANSMISSION_CAPTURE_UNAVAILABLE", { material: material.name });
        warnForwardDegradedOnce("TRANSMISSION_DEGRADED", material.name, "needs a transmission lobe and frame capture this program lacks; it draws without transmission.");
      }
      if (this.lastProgramFeatures.lighting === "lit" && hasLiveDiffuseTransmission(effectiveMaterial)
        && !this.lastProgramFeatures.extensions.some((extension) => extension.lobe === "diffuse-transmission" || extension.lobe === "KHR_materials_diffuse_transmission")) {
        if (rendererQrFlags(device).on("A3D_QR_STRICT")) throw new RenderDeviceError("Diffuse transmission requires its generated physical lobe", "GENERATED_DIFFUSE_TRANSMISSION_LOBE_UNAVAILABLE", { material: material.name });
        warnForwardDegradedOnce("DIFFUSE_TRANSMISSION_DEGRADED", material.name, "needs a diffuse-transmission lobe this program lacks; it draws without it.");
      }
      // #867: a skinned draw needs its program to skin. When no registered
      // deform feature (prd06.deform, A3D_QR_ANIMATION) selected this item,
      // the generated program has no skinning, so the draw keeps the legacy
      // skinned shaderKey program instead of rendering the bind pose.
      // Missing skin attributes must not turn a skinned item into a rigid draw.
      if (item?.skinning && !geometryHasSkin((a) => geometryHasAttribute(item.geometry, a))) {
        throw new RenderDeviceError("Skinned render item geometry requires joint and weight attributes", "SKINNING_GEOMETRY_CONTRACT", { material: material.name });
      }
      if (item?.skinning && geometryHasSkin((a) => geometryHasAttribute(item.geometry, a)) && this.lastProgramFeatures.features["prd06.deform"] === undefined) {
        if (photometric?.active) {
          this.photometricUnsupported("skinning-unsupported", "The generated profile shader cannot skin this draw; scalar lighting is used.");
          photometric.active = false;
          this.lastProgramFeatures = undefined;
          return this.legacyShader(material, device, item);
        }
        if (requiresGeneratedEffectsProgram(this.lastProgramFeatures)) throw new RenderDeviceError("The selected shading features require a generated skinning program", "GENERATED_EFFECT_SKINNING_UNSUPPORTED", {});
        if (device.kind === "webgpu") throw new RenderDeviceError("This draw requires a generated skinning program", "GENERATED_SKINNING_UNSUPPORTED", {});
        this.lastProgramFeatures = undefined;
        return this.legacyShader(material, device, item);
      }
      if (staticCapture?.generatedRequested) {
        if (!staticGeneratedUnlitFeaturesSafe(this.lastProgramFeatures)) return undefined;
        const cache = rendererProgramCachePeek(device, flags);
        const capability = cache && staticGeneratedCacheCapability(cache);
        const features = this.lastProgramFeatures;
        const program = capability?.peekReady(features);
        if (!cache || !capability || !program || !(device instanceof WebGL2Device) || !staticGeneratedDeviceCurrent(device)
          || device.hasStaticGeneratedUnlitProgram !== staticGeneratedPairProgram
          || !device.hasStaticGeneratedUnlitProgram(program, features)) return undefined;
        staticCapture.generated = { cache, capability, features, program };
        return program;
      }
      let handle: ReturnType<ProgramCacheLike["acquire"]>;
      try { handle = this.programCache(device).acquire(this.lastProgramFeatures); }
      catch (error) {
        if (projected?.active) {
          this.projectedSpotUnsupported("shader-unsupported", "The projected-spot program is unavailable; scalar lighting is used.");
          projected.active = false;
          return this.getShader(material, device, item, clipping, photometric, projected);
        }
        if (!photometric?.active) throw error;
        this.photometricUnsupported("shader-unsupported", `The profile program is unavailable; scalar lighting is used. ${String(error)}`);
        photometric.active = false;
        return this.getShader(material, device, item, clipping, photometric, projected);
      }
      if (handle.status === "failed") {
        if (this.options.weightedTransparency) throw new RenderDeviceError("Weighted transparency program failed", "WEIGHTED_TRANSPARENCY_PROGRAM_UNAVAILABLE");
        if (projected?.active) {
          this.projectedSpotUnsupported("shader-unsupported", "The projected-spot program failed to compile; scalar lighting is used.");
          projected.active = false;
          return this.getShader(material, device, item, clipping, photometric, projected);
        }
        if (photometric?.active) {
          this.photometricUnsupported("shader-unsupported", `The profile program failed to compile; scalar lighting is used. ${handle.error ?? handle.key}`);
          photometric.active = false;
          return this.getShader(material, device, item, clipping, photometric, projected);
        }
        // T0-03: the cache already emitted `program-compile-failed` (C-36) +
        // console.error. WebGPU variants may carry features absent from the
        // legacy program, so only WebGL can use its non-strict fallback.
        if (flags.on("A3D_QR_STRICT") || requiresGeneratedEffectsProgram(this.lastProgramFeatures) || device.kind === "webgpu") {
          throw new RenderDeviceError(`generated program failed to compile: ${handle.error ?? handle.key}`, "PROGRAM_COMPILE_FAILED", { key: handle.key });
        }
        // The fallback draw is a legacy draw: bind it as one.
        this.lastProgramFeatures = undefined;
      } else {
        // async-skip: a not-yet-ready program skips the draw this frame
        // (C-02 §A.2 semantics; warm-then-block warmup renders them ready up front).
        return handle.status === "ready" ? handle.program : undefined;
      }
    }
    if (staticCapture?.generatedRequested) return undefined;
    if (this.options.nativeDepthCoverage) throw new RenderDeviceError("Native depth coverage requires a generated forward program", "NATIVE_DOF_COVERAGE_PROGRAM_UNAVAILABLE");
    return this.legacyShader(material, device, item);
  }

  /** Frozen legacy shaderKey program (flag-off path, and generated-path fallbacks). */
  private legacyShader(material: Material, device: RenderDevice, item?: RenderItem): RenderShaderProgram {
    const defines = this.legacyDetailDefines(material, device, item);
    const key = item ? graphDrawShaderKey(material, item, device, this.options.shadowMap, this.shadedLights(), this.options.environmentLighting, this.contactMaskScope) : material.shaderKey;
    const cacheKey = shaderCacheKey(material, defines, key);
    const shaderCache = getForwardPassShaderCache(device, this.shaderLibrary);
    let module = shaderCache.get(cacheKey);
    if (!module) {
      const options = trustedShaderVariantOptions(defines);
      module = new ShaderModule(material.shaderVariant && key === material.shaderKey
        ? this.shaderLibrary.compileVariant(key, material.shaderVariant, options)
        : this.shaderLibrary.compileSource(key, options));
      shaderCache.set(cacheKey, module);
    }
    return module.compile(device);
  }

  /** Only active maps allocate legacy sampler units. Existing material variants
   * already budget their other samplers, so absent detail must not cost units. */
  private legacyDetailDefines(material: Material, device: RenderDevice, item?: RenderItem): Record<string, true> {
    if (!LEGACY_PBR_DETAIL_SHADERS.has(material.shaderKey)) return {};
    const flags = rendererQrFlags(device);
    const tier = this.options.qualityTier ?? QUALITY_TIERS.high;
    const live = withLivePhysicalMapFeatures(material.programFeatures({ flags, tier }), item?.material ?? material, { flags, tier });
    const features = item ? featuresForGeometry(live, (name) => geometryHasAttribute(item.geometry, name)) : live;
    return {
      ...(features.maps.diffuseRoughness ? { A3D_PBR_DIFFUSE_ROUGHNESS_MAP: true as const } : {}),
      ...(features.maps.bump ? { A3D_PBR_BUMP_MAP: true as const } : {})
    };
  }

  /** Feature record for the program `getShader` most recently resolved (C-02). */
  private lastProgramFeatures: ProgramFeatures | undefined;

  private programCache(device: RenderDevice): ProgramCacheLike {
    this.generatorProgramCache ??= rendererProgramCache(device, rendererQrFlags(device));
    return this.generatorProgramCache;
  }

  private programFeaturesFor(material: Material, device: RenderDevice, item?: RenderItem, clipping?: ClippingBinding, photometric = false, projected = false): ProgramFeatures {
    const flags = rendererQrFlags(device);
    const tier = this.options.qualityTier ?? QUALITY_TIERS.high;
    const selective = this.options.selectiveBloom;
    if (selective?.enabled && selective.valid) {
      observeSelectiveLobes({ flags, tier }, (lobe) => { if (!isStockPrd04Lobe(lobe)) invalidateSelectiveBloomFrame(selective, "material-lobe"); });
    }
    const effectiveMaterial = item?.material ?? material;
    const mf = withLiveAlphaCutoff(withLivePhysicalMapFeatures(material.programFeatures({ flags, tier }), effectiveMaterial, { flags, tier }), effectiveMaterial);
    const passAxes = forwardPassFeatureAxes(this.options, this.clusteredLighting !== null);
    const selectedShadow = item ? selectForwardShadowMap(this.options.shadowMap, item, this.options.cameraViewMatrix, this.options.cameraPosition) : undefined;
    const punctual = item && item.receiveShadow !== false && mf.lighting === "lit"
      ? selectLegacyPunctualShadows(this.options.shadowMap, this.shadedLights(), material, device) : { point: false, spot: false };
    const hasCommonCaster = this.shadedLights().some((light) => light.castsShadow && (light.kind === "directional" || (light.kind === "spot" && !punctual.spot)));
    const hasLocalCaster = this.shadedLights().some((light) => (light as LocalShadowedLight).localShadowSlot !== undefined);
    const activeContact = item !== undefined && mf.lighting === "lit" && contactShadowLightIndex(this.contactMaskScope, item, this.shadedLights()) >= 0;
    const axes = item ? { ...passAxes, shadows: { ...passAxes.shadows,
      cascades: item.receiveShadow === false || !hasCommonCaster || selectedShadow?.strength === 0 ? 0 as const : passAxes.shadows.cascades,
      localShadows: item.receiveShadow === false || !hasLocalCaster || this.options.shadowMap?.localShadows?.strength === 0 ? 0 as const : passAxes.shadows.localShadows,
      contact: activeContact
    } } : passAxes;
    // T0-05: registered ShaderFeatures select their bits per draw (C-02 §A.2:
    // at acquire time); the warmup applies the same selection per item.
    // Observe the ordinary selection loop rather than selecting anything a
    // second time (4.7.x selective bloom). Registry changes invalidate this frame before consumption.
    const selected: Record<string, string | number | boolean> = item ? selectShaderFeatureBits(
      { item, pass: "forward", tier, flags, frameContext: this.options.frameContext },
      selective?.enabled && selective.valid ? (feature) => { if (!stockSelectiveFeature(feature)) invalidateSelectiveBloomFrame(selective, "shader-feature"); } : undefined
    ) : {};
    if (selective?.enabled && selective.valid) selected[SELECTIVE_BLOOM_FEATURE] = true;
    // WebGPU: the f_ind alpha tag needs a floating colour target (`validateGeneratedPbrTarget`). A display-space rgba8 scene
    // target (`output.toneMapping: "none"`) refused the whole mount; such a draw keeps its untagged program instead.
    if (device.kind === "webgpu" && selected[indirectFractionFeature.id] !== undefined) {
      const target = device.getRenderTarget?.();
      if (target && !target.depthOnly && target.colorTexture.format !== "rgba16f" && target.colorTexture.format !== "rgba32f") delete selected[indirectFractionFeature.id];
    }
    if (this.options.weightedTransparency) selected[PROGRAM_TRANSPARENCY_FEATURE] = this.options.weightedTransparency.phase;
    if (this.options.nativeDepthCoverage) selected[DEPTH_COVERAGE_FEATURE] = true;
    if (photometric) selected[PHOTOMETRIC_PROFILE_FEATURE] = true;
    if (punctual.point) selected[LEGACY_POINT_SHADOW_FEATURE] = true;
    if (punctual.spot) selected[LEGACY_SPOT_SHADOW_FEATURE] = true;
    const advanced = item ? advancedLightingItemBinding(item, this.options.frameContext, { deferLightmapContentCheck: true }) : null;
    if (advanced) {
      if (mf.lighting !== "lit") throw new RenderDeviceError("Advanced lighting requires a lit physical material", "ADVANCED_LIGHTING_PROGRAM_UNSUPPORTED", { material: material.name });
      Object.assign(selected, advancedLightingFeatures(advanced));
    }
    const localProbes = item && mf.lighting === "lit" ? prd02ItemProbeBindings(item, device) : null;
    const taggedProbes = item ? prd02ItemProbeBindings(item) : null;
    const environmentItem = item && taggedProbes ? globalEnvironmentItem(item, taggedProbes) : item;
    if (localProbes) selected[PRD02_LOCAL_PROBE_FEATURE] = true;
    if (item && mf.lighting === "lit" && prd02ItemIrradianceBindings(item, device)) selected[PRD02_IRRADIANCE_VOLUME_FEATURE] = true;
    // E3 stage-2b: `prd02.ibl` shades from a C-09 probe cube; without one
    // (bare preset/procedural lighting) the default indirect body stays.
    if (selected[PRD02_IBL_FEATURE] !== undefined && !prd02IblEnvironmentAvailable(this.options.environmentLighting, environmentItem)) {
      delete selected[PRD02_IBL_FEATURE];
    }
    // Direct render path (frame output colour space is sRGB: no post chain, no OutputPass): the generated program
    // tone-maps and encodes its own output. Explicit "srgb" only; an unset option keeps the linear program.
    if (this.options.outputColorSpace === "srgb") selected[PROGRAM_OUTPUT_SRGB_FEATURE] = true;
    const selectedFeatures = { ...mf.features, ...selected };
    // This feature is issued only by the frame-owned checked packet, never by
    // a material or a registered shader feature.
    delete selectedFeatures[PROJECTED_SPOT_FEATURE];
    if (projected) selectedFeatures[PROJECTED_SPOT_FEATURE] = true;
    delete selectedFeatures[PROGRAM_CLIPPING_FEATURE];
    if (clipping && clipping.groups.length > 0) selectedFeatures[PROGRAM_CLIPPING_FEATURE] = true;
    // The variant follows the active frame convention, never the material.
    delete selectedFeatures[PROGRAM_LOG_DEPTH_FEATURE];
    if (device.getDepthConvention?.()?.mode === "logarithmic") selectedFeatures[PROGRAM_LOG_DEPTH_FEATURE] = true;
    delete selectedFeatures[PROGRAM_REVERSED_FOG_DEPTH_FEATURE];
    // WebGL2 generated programs only (WebGPU emits its own WGSL fog).
    if (device.kind === "webgl2" && device.getDepthConvention?.()?.mode === "reversed") selectedFeatures[PROGRAM_REVERSED_FOG_DEPTH_FEATURE] = true;
    delete selectedFeatures["a3d.nativePrimitive"];
    const nativePrimitive = item && nativeUnlitPrimitiveForGeometry(item.geometry, device, mf.lighting);
    if (nativePrimitive) selectedFeatures["a3d.nativePrimitive"] = nativePrimitive;
    let record = item ? featuresForGeometry({ ...mf, features: selectedFeatures }, (a) => geometryHasAttribute(item.geometry, a)) : { ...mf, features: selectedFeatures };
    if (item) {
      // A glTF/custom-geometry color belongs to the draw's geometry, not to a
      // shared physical material. Select it independently for each lit draw.
      if (record.lighting === "lit" && physicalVertexColorsForGeometry(item.geometry, device)) {
        record = { ...record, vertexColors: true };
      }
      const before = mf.extensions.find((extension) => extension.lobe === "diffuse-transmission" || extension.lobe === "KHR_materials_diffuse_transmission");
      const after = record.extensions.find((extension) => extension.lobe === "diffuse-transmission" || extension.lobe === "KHR_materials_diffuse_transmission");
      if (before?.maps.some((slot) => !after?.maps.includes(slot))) {
        throw new RenderDeviceError("Diffuse transmission requires its selected texture coordinate attributes", "DIFFUSE_TRANSMISSION_UV_UNAVAILABLE", { material: material.name });
      }
    }
    if (item) record = generatedSkinningForGeometry(record, item.geometry, material.name);
    if (item && record.features["prd04.geometryTangent"] === true) {
      const tangent = item.geometry.vertexBuffer.format.attributes.find((attribute) => attribute.semantic === "tangent" || attribute.shaderName === "a_tangent");
      if (!tangent || tangent.components !== 4 || tangent.shaderLocation !== 3 || tangent.integer
        || (device.kind === "webgpu" && tangent.type !== "float32" && !tangent.normalized)) {
        throw new RenderDeviceError("Physical shading requires a compatible four-component tangent at location 3", "PHYSICAL_TANGENT_FORMAT_UNSUPPORTED", { material: material.name });
      }
    }
    const normalized = normalizeProgramFeatures({
      ...record,
      ...axes,
      // threejs-parity L7/SR-02: `material.fog === false` selects a fog-free
      // program variant so the draw carries no FOG_* defines at all.
      ...(material.fog === false ? { fog: "none" as const } : {}),
      // Phase 6: instancing is item-driven — a material's own feature record
      // only declares it when authored instanced; the draw's program must
      // cover the union (attribute matrices are the only generated path).
      // GU47 E-D: `instanceColorTarget: "emissive"` keeps the base colour (no USE_INSTANCING_COLOR base multiply).
      // Only the private combined carrier has already folded each member's
      // model and tint into draw-data rows and deliberately has no instance
      // stream. Some built-in materials request instancing unconditionally;
      // retaining that request would require attributes we do not bind.
      ...(item && isActiveCombinedDrawCarrier(item) ? { instancing: undefined }
        : item?.instanceTransforms ? { instancing: { color: item.instanceColors !== undefined && materialInstanceColorTarget(material) !== "emissive" } } : {}),
      // #1140: a per-item probe cube (PRD-02 S12) is sampled as a cube.
      ...(environmentItem?.environmentCube?.texture?.dimension === "cube" ? { environment: "pmrem-cube" as const } : {}),
      backgroundCoverage: this.options.backgroundCoverage === true,
      pass: "forward",
      target: "glsl300es"
    });
    return normalized;
  }

  // ── Phase 6 submission-perf pools ──────────────────────────────────────

  private static packetPoolFor(device: RenderDevice): { free: Map<string, UniformValue>[]; used: Map<string, UniformValue>[] } {
    let pool = ForwardPass.uniformPacketPools.get(device);
    if (!pool) {
      pool = { free: [], used: [] };
      ForwardPass.uniformPacketPools.set(device, pool);
    }
    return pool;
  }

  private beginFramePools(device: RenderDevice): void {
    const pool = ForwardPass.packetPoolFor(device);
    if (pool.used.length > 0) {
      pool.free.push(...pool.used);
      pool.used = [];
    }
    ForwardPass.instanceSlotAllocators.get(device)?.beginPass();
  }

  /** A cleared per-item scratch map; recycled after the next execute begins. */
  private acquireUniformPacket(device: RenderDevice): Map<string, UniformValue> {
    const pool = ForwardPass.packetPoolFor(device);
    const packet = pool.free.pop() ?? new Map<string, UniformValue>();
    packet.clear();
    pool.used.push(packet);
    return packet;
  }

  /** Identity ids for the pipeline key — avoids serializing descriptors per draw. */
  private static weakId<T extends object>(map: WeakMap<T, number>, next: () => number, key: T): number {
    const existing = map.get(key);
    if (existing !== undefined) return existing;
    const id = next();
    map.set(key, id);
    return id;
  }

  /**
   * One `RenderPipeline` per (shader, vertex format, topology, render state,
   * required attributes) — previously constructed per item per frame. The
   * pipeline is a pure descriptor: no GL resources, safe to reuse.
   */
  private pipelineFor(
    device: RenderDevice,
    item: RenderItem,
    baseMaterial: Material,
    shader: RenderShaderProgram,
    geometry: { readonly vertexBuffer: { readonly format: VertexFormat }; readonly topology?: RenderItem["geometry"]["topology"] },
    usesGeometryMatrix: boolean
  ): RenderPipeline {
    const depthConvention = device.getDepthConvention?.();
    const reversedDepth = depthConvention?.mode === "reversed";
    const itemState = renderStateForItem(baseMaterial.renderState, item, usesGeometryMatrix);
    // Material compares and offsets are authored in standard-depth terms.
    const originalState = reversedDepth ? renderStateForDepthConvention(itemState, depthConvention) : itemState;
    const renderState = this.options.nativeDepthCoverage ? { ...originalState,
      colorAttachments: [undefined, { colorWrite: [true, false, false, false] as const, blendMode: "opaque" as const }] }
      : this.options.weightedTransparency ? { ...originalState, ...this.options.weightedTransparency.bindings.state } : originalState;
    const vertexFormatId = ForwardPass.weakId(ForwardPass.vertexFormatIds, () => ForwardPass.nextVertexFormatId++, geometry.vertexBuffer.format);
    const renderStateId = ForwardPass.weakId(ForwardPass.renderStateIds, () => ForwardPass.nextRenderStateId++, baseMaterial.renderState);
    const attrsId = ForwardPass.weakId(ForwardPass.requiredAttributeIds, () => ForwardPass.nextRequiredAttributeId++, baseMaterial.requiredAttributes);
    // `renderStateForItem` returns the SAME object for the unflipped case, so
    // the flip bit is the only per-item term needed in the key.
    const key = `${shader.id}|${vertexFormatId}|${geometry.topology ?? "triangles"}|${renderStateId}:${itemState === baseMaterial.renderState ? 0 : 1}|${attrsId}|coverage:${this.options.nativeDepthCoverage ? 1 : 0}|weighted:${this.options.weightedTransparency?.phase ?? "none"}|depth:${reversedDepth ? "reversed" : "standard"}`;
    let cache = ForwardPass.pipelineCaches.get(device);
    if (!cache) {
      cache = new Map();
      ForwardPass.pipelineCaches.set(device, cache);
    }
    let pipeline = cache.get(key);
    if (!pipeline || pipeline.shader !== shader) {
      pipeline = new RenderPipeline({
        label: item.label ?? baseMaterial.name,
        shader,
        vertexFormat: geometry.vertexBuffer.format,
        topology: geometry.topology,
        renderState,
        requiredAttributes: this.lastProgramFeatures
          ? baseMaterial.requiredAttributes.filter((attribute) =>
              !["a_uv", "a_uv1", "a_color", "a_tangent", "a_joints", "a_weights", "a_joints1", "a_weights1"].includes(attribute)
              || geometry.vertexBuffer.format.attributes.some((a) => a.semantic === attribute || a.shaderName === attribute))
          : baseMaterial.requiredAttributes
      });
      cache.set(key, pipeline);
    }
    return pipeline;
  }

  /**
   * Persistent attribute-matrix slot for the generated path (Phase 6). SI-3: slots are keyed by the item's
   * transform array (its owner), not by draw order inside one pass. The order-keyed cursor restarted at 0 in every
   * ForwardPass, so the opaque pass and each transparent segment wrote different items into slot 0 and the
   * content-compare upload skip never hit when several passes drew instanced items.
   */
  private instanceSlotFor(device: RenderDevice, label: string | undefined, transforms: object, count: number, colors: boolean): { readonly buffer: InstanceBufferLike; readonly capacity: number } {
    let allocator = ForwardPass.instanceSlotAllocators.get(device);
    if (!allocator) {
      allocator = new InstanceSlotAllocator<InstanceBufferLike>(
        (capacity, withColors) => instanceBufferSlot.get(rendererQrFlags(device))(device, capacity, { colors: withColors }),
        (buffer) => buffer.dispose()
      );
      ForwardPass.instanceSlotAllocators.set(device, allocator);
    }
    return allocator.acquire(label ? allocator.labelKey(label) : transforms, count, colors);
  }
}

/**
 * SI-3: owner-keyed pool of persistent instance buffers. The owner is the item label (with its occurrence index in
 * the pass, so two items sharing a label keep two slots), or the transform array when the item has no label; labels
 * survive the per-frame RenderItem rebuilds that replace arrays. `acquire(owner)` returns the slot that owner used last
 * (re-created only when its capacity or colour layout no longer fits); a new owner takes a slot idle for at least
 * `staleAfterPasses` pass executions, then a new slot up to `maxSlots`, then the least recently used one. Sharing a
 * slot between two draws is still correct (GL orders the uploads), it only costs a re-upload.
 */
export class InstanceSlotAllocator<B> {
  private readonly slots: { buffer: B; colors: boolean; capacity: number; owner: object | string | null; lastUse: number }[] = [];
  // Strong keys, bounded: an owner's entry is deleted when its slot is taken over, so it never exceeds maxSlots.
  private readonly byOwner = new Map<object | string, number>();
  private readonly labelCounts = new Map<string, number>();
  private pass = 0;

  constructor(
    private readonly create: (capacity: number, colors: boolean) => B,
    private readonly dispose: (buffer: B) => void,
    private readonly maxSlots = 256,
    private readonly staleAfterPasses = 16
  ) {}

  /** One pass execution started (the idle clock). */
  beginPass(): void {
    this.pass += 1;
    this.labelCounts.clear();
  }

  /** `label#n`: the n-th draw with this label in the current pass. */
  labelKey(label: string): string {
    const n = this.labelCounts.get(label) ?? 0;
    this.labelCounts.set(label, n + 1);
    return `${label}#${n}`;
  }

  get size(): number {
    return this.slots.length;
  }

  acquire(owner: object | string, count: number, colors: boolean): { readonly buffer: B; readonly capacity: number } {
    const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    const owned = this.byOwner.get(owner);
    let index = owned !== undefined && this.slots[owned]?.owner === owner ? owned : -1;
    if (index < 0) {
      index = this.slots.findIndex((slot) => slot.owner === null || slot.lastUse <= this.pass - this.staleAfterPasses);
      if (index < 0 && this.slots.length >= this.maxSlots) {
        index = 0;
        for (let i = 1; i < this.slots.length; i += 1) if (this.slots[i]!.lastUse < this.slots[index]!.lastUse) index = i;
      }
    }
    if (index < 0) {
      this.slots.push({ buffer: this.create(capacity, colors), colors, capacity, owner, lastUse: this.pass });
      index = this.slots.length - 1;
    }
    const slot = this.slots[index]!;
    if (slot.colors !== colors || slot.capacity < count) {
      this.dispose(slot.buffer);
      slot.buffer = this.create(capacity, colors);
      slot.colors = colors;
      slot.capacity = capacity;
    }
    if (slot.owner !== owner) {
      if (slot.owner) this.byOwner.delete(slot.owner);
      slot.owner = owner;
    }
    slot.lastUse = this.pass;
    this.byOwner.set(owner, index);
    return slot;
  }
}

/**
 * Items the per-instance frustum cull must draw whole: three's `frustumCulled: false`, CPU-unknown vertex motion
 * (skinning, morphs, custom attributes, custom shader materials), draw ranges, and SI-8 `prd10.wind` vegetation. Wind
 * bends a plant's top by up to about 0.74 of its height while the cull sphere (1.15 x the bounds radius) covers about
 * 0.625 of it, so a strongly bent plant at the view edge was culled while still on screen.
 */
export function instanceCullExcluded(
  item: Pick<RenderItem, "frustumCulled" | "skinning" | "morphTargets" | "morphWeights" | "instanceAttributes" | "drawRange" | "label">,
  customShaderMaterial: boolean
): boolean {
  if (item.frustumCulled === false || item.skinning || item.morphTargets || item.morphWeights || item.instanceAttributes || item.drawRange) return true;
  if (customShaderMaterial) return true;
  return item.label?.startsWith("prd10.wind:") === true;
}

function lightBucket(count: number, max: 4 | 8 = 8): 0 | 1 | 2 | 4 | 8 {
  return count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 4 : max;
}

/**
 * Pass-owned feature axes (C-02): lights/shadows/environment/fog shared by every
 * material in the pass. `clustered` is the pass's resolved state; above
 * FORWARD_DIRECT_LIGHT_CAPACITY lights the axes report clustered regardless.
 */
export function forwardPassFeatureAxes(
  options: Pick<ForwardPassOptions, "lights" | "shadowMap" | "environmentLighting" | "environmentFog">,
  clustered: boolean
): Pick<ProgramFeatures, "lights" | "shadows" | "environment" | "fog"> {
  let directional = 0;
  let point = 0;
  let spot = 0;
  let rect = 0;
  for (const light of options.lights ?? []) {
    if (light.kind === "directional") directional += 1;
    else if (light.kind === "point") point += 1;
    else if (light.kind === "spot") spot += 1;
    else rect += 1;
  }
  const fog = options.environmentFog;
  const fogMode = fog === undefined || fog === false
    ? "none"
    : fog.mode === "linear"
      ? "linear"
      : fog.heightFalloff !== undefined
        ? "height"
        : "exp2";
  const env = options.environmentLighting;
  return {
    lights: {
      dir: lightBucket(directional),
      point: lightBucket(point),
      spot: lightBucket(spot),
      rect: lightBucket(rect, 4) as 0 | 1 | 2 | 4,
      // #1140: mirrors resolveForwardClusteredLighting (clusters above the
      // u_lightData capacity), not the per-kind key bucket.
      clustered: clustered || directional + point + spot + rect > FORWARD_DIRECT_LIGHT_CAPACITY,
      hemisphere: env?.proceduralMap !== undefined
    },
    shadows: options.shadowMap
      ? {
          cascades: Math.max(1, Math.min(4, options.shadowMap.cascades?.length ?? 1)) as 0 | 1 | 2 | 3 | 4,
          pcfTaps: 4,
          // GU47 eint (EB-3): one variant for any tile count, so lights entering / leaving do not recompile.
          localShadows: (options.shadowMap.localShadows?.slots.size ?? 0) > 0 ? MAX_FORWARD_LOCAL_SHADOW_TILES : 0,
          contact: false
        }
      : { cascades: 0, pcfTaps: 4, localShadows: 0, contact: false },
    environment:
      // #1140: the generated env chunk samples exactly the texture it was
      // selected for. The prefiltered cube wins when present (the flag-off
      // shader mixes to the cube whenever it is enabled); otherwise the 2D
      // `environmentMapTexture`. Procedural-only → no sampler at all.
      env?.environmentCubeMapTexture?.texture?.dimension === "cube"
        ? "pmrem-cube"
        : env?.environmentMapTexture?.texture !== undefined
          ? "equirect"
          : "none",
    fog: fogMode
  };
}

export { SkinningPaletteUploadManager, releaseMorphScratchGeometry } from "./forward/Deform.js";
export { ensureMorphTargetTexture, releaseMorphTargetTexture, morphTextureDiagnostics } from "./shaders/deform/forwardFeature.js";

interface ShaderCacheRecord {
  revision: number;
  readonly modules: Map<string, ShaderModule>;
}

function getForwardPassShaderCache(device: RenderDevice, library: ShaderLibrary): Map<string, ShaderModule> {
  let libraryCaches = ForwardPass["shaderCaches"].get(device);
  if (!libraryCaches) {
    libraryCaches = new WeakMap<ShaderLibrary, ShaderCacheRecord>();
    ForwardPass["shaderCaches"].set(device, libraryCaches);
  }
  let record = libraryCaches.get(library);
  const revision = library.getRevision();
  if (!record) {
    record = { revision, modules: new Map<string, ShaderModule>() };
    libraryCaches.set(library, record);
  } else if (record.revision !== revision) {
    for (const module of record.modules.values()) module.dispose();
    record.modules.clear();
    record.revision = revision;
  }
  return record.modules;
}

function applyOutputColorSpaceUniform(
  outputColorSpace: "linear" | "srgb",
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!shader.reflection.uniforms.has("u_outputColorSpace")) return;
  if (outputColorSpace !== "linear" && outputColorSpace !== "srgb") {
    throw new RenderDeviceError("Forward pass outputColorSpace must be linear or srgb", "FORWARD_OUTPUT_COLOR_SPACE_CONTRACT", {
      label: item.label,
      outputColorSpace
    });
  }
  uniforms.set("u_outputColorSpace", outputColorSpace === "srgb" ? 1 : 0);
}

/**
 * C-02 generated-program fog. `fog_default` declares `u_fogColor`,
 * `u_fogRange`, `u_fogDensity` and `u_fogHeightFalloff` under FOG_LINEAR /
 * FOG_EXP2 / FOG_HEIGHT, and `forwardProgramFeatures` selects those defines
 * whenever the frame has fog. Nothing bound them, so every uniform read 0:
 * the exp2 factor was 1 - exp(0) = 0 and generated programs drew no fog at all
 * (scenes 09/17/18 under A3D_QR_CORE: distant surfaces kept their own colour
 * instead of blending to the fog colour).
 *
 * The values are the legacy `u_environmentFog*` inputs. The generated chunk
 * follows three.js FogExp2/Fog: view depth, and no opacity cap (legacy
 * `maxOpacity` is a legacy-only clamp). Lane 07's PRD-07 fog chunk shares
 * `u_fogColor` (#880); a value it already set is kept.
 */
export function generatedFogUniformValues(
  fog: ForwardEnvironmentFogOptions | false | undefined
): ReadonlyMap<string, UniformValue> | undefined {
  if (!fog) return undefined;
  return new Map<string, UniformValue>([
    ["u_fogColor", Array.from(fog.color)],
    ["u_fogRange", [fog.near, fog.far]],
    ["u_fogDensity", fog.density],
    ["u_fogHeightFalloff", fog.heightFalloff ?? 0]
  ]);
}

export function applyGeneratedFogUniforms(
  fog: ForwardEnvironmentFogOptions | false | undefined,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  // Reflection lists ACTIVE uniforms only: exp2 programs drop the unused
  // `u_fogRange`, linear ones drop `u_fogDensity`. Either marks fog_default
  // (forward programs declare neither otherwise; lane 07 uses u_fogA/u_fogB).
  if (!shader.reflection.uniforms.has("u_fogRange") && !shader.reflection.uniforms.has("u_fogDensity")) return;
  const values = generatedFogUniformValues(fog);
  if (!values) return;
  for (const [name, value] of values) {
    if (!shader.reflection.uniforms.has(name)) continue;
    if (name === "u_fogColor" && uniforms.has(name)) continue;
    uniforms.set(name, value);
  }
}

function applyEnvironmentFogUniforms(
  fog: ForwardEnvironmentFogOptions | false | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const requiredUniforms = [
    "u_environmentFogEnabled",
    "u_environmentFogMode",
    "u_environmentFogColor",
    "u_environmentFogNear",
    "u_environmentFogFar",
    "u_environmentFogDensity",
    "u_environmentFogHeightFalloff",
    "u_environmentFogHeightReference",
    "u_environmentFogMaxOpacity"
  ];
  if (!requiredUniforms.every((uniform) => shader.reflection.uniforms.has(uniform))) {
    return;
  }
  if (!fog) {
    uniforms.set("u_environmentFogEnabled", 0);
    uniforms.set("u_environmentFogMode", 1);
    uniforms.set("u_environmentFogColor", [0, 0, 0]);
    uniforms.set("u_environmentFogNear", 0);
    uniforms.set("u_environmentFogFar", 1);
    uniforms.set("u_environmentFogDensity", 0);
    uniforms.set("u_environmentFogHeightFalloff", 0);
    uniforms.set("u_environmentFogHeightReference", 0);
    uniforms.set("u_environmentFogMaxOpacity", 1);
    if (shader.reflection.uniforms.has("u_volumetricIntensity")) {
      uniforms.set("u_volumetricIntensity", 0);
    }
    return;
  }
  const color = Array.from(fog.color);
  const heightFalloff = fog.heightFalloff ?? 0;
  const heightReference = fog.heightReference ?? 0;
  const maxOpacity = fog.maxOpacity ?? 1;
  if (color.length !== 3 || !color.every((component) => Number.isFinite(component) && component >= 0 && component <= 1)) {
    throw new RenderDeviceError("Forward environment fog color must contain three finite linear RGB values in [0, 1]", "FORWARD_ENVIRONMENT_FOG_CONTRACT", {
      label: item.label,
      color
    });
  }
  if (!Number.isFinite(fog.near) || !Number.isFinite(fog.far) || fog.far <= fog.near) {
    throw new RenderDeviceError("Forward environment fog requires finite far greater than near", "FORWARD_ENVIRONMENT_FOG_CONTRACT", {
      label: item.label,
      near: fog.near,
      far: fog.far
    });
  }
  if (!Number.isFinite(fog.density) || fog.density < 0) {
    throw new RenderDeviceError("Forward environment fog density must be finite and non-negative", "FORWARD_ENVIRONMENT_FOG_CONTRACT", {
      label: item.label,
      density: fog.density
    });
  }
  if (!Number.isFinite(heightFalloff) || heightFalloff < 0) {
    throw new RenderDeviceError("Forward environment fog heightFalloff must be finite and non-negative", "FORWARD_ENVIRONMENT_FOG_CONTRACT", {
      label: item.label,
      heightFalloff
    });
  }
  if (!Number.isFinite(heightReference)) {
    throw new RenderDeviceError("Forward environment fog heightReference must be finite", "FORWARD_ENVIRONMENT_FOG_CONTRACT", {
      label: item.label,
      heightReference
    });
  }
  if (!Number.isFinite(maxOpacity) || maxOpacity < 0 || maxOpacity > 1) {
    throw new RenderDeviceError("Forward environment fog maxOpacity must be finite in [0, 1]", "FORWARD_ENVIRONMENT_FOG_CONTRACT", {
      label: item.label,
      maxOpacity
    });
  }
  uniforms.set("u_environmentFogEnabled", 1);
  uniforms.set("u_environmentFogMode", fogModeUniform(fog.mode, item.label));
  uniforms.set("u_environmentFogColor", color);
  uniforms.set("u_environmentFogNear", fog.near);
  uniforms.set("u_environmentFogFar", fog.far);
  uniforms.set("u_environmentFogDensity", fog.density);
  uniforms.set("u_environmentFogHeightFalloff", heightFalloff);
  uniforms.set("u_environmentFogHeightReference", heightReference);
  uniforms.set("u_environmentFogMaxOpacity", maxOpacity);
  // A5: bind the volumetric inscatter terms only when the program declares
  // them; legacy programs keep the exact legacy fog response.
  const volumetricIntensity = fog.volumetricIntensity ?? 0;
  if (!Number.isFinite(volumetricIntensity) || volumetricIntensity < 0) {
    throw new RenderDeviceError("Forward environment fog volumetricIntensity must be finite and non-negative", "FORWARD_ENVIRONMENT_FOG_CONTRACT", {
      label: item.label,
      volumetricIntensity
    });
  }
  const volumetricLightDirection = fog.volumetricLightDirection ?? [0, 1, 0];
  const volumetricLightColor = fog.volumetricLightColor ?? [1, 1, 1];
  if (shader.reflection.uniforms.has("u_volumetricIntensity")) {
    uniforms.set("u_volumetricIntensity", volumetricIntensity);
  }
  if (shader.reflection.uniforms.has("u_volumetricLightDirection")) {
    uniforms.set("u_volumetricLightDirection", Array.from(volumetricLightDirection));
  }
  if (shader.reflection.uniforms.has("u_volumetricLightColor")) {
    uniforms.set("u_volumetricLightColor", Array.from(volumetricLightColor));
  }
}

function fogModeUniform(mode: ForwardEnvironmentFogMode, label: string | undefined): number {
  switch (mode) {
    case "linear":
      return 1;
    case "exponential":
      return 2;
    case "exponential-squared":
      return 3;
    default:
      throw new RenderDeviceError("Forward environment fog mode must be linear, exponential, or exponential-squared", "FORWARD_ENVIRONMENT_FOG_CONTRACT", {
        label,
        mode
      });
  }
}

function validateMaterialGeometryContract(item: RenderItem, material: Material, geometry: Geometry): void {
  const missing = material.requiredAttributes.filter((attribute) => !geometryHasAttribute(geometry, attribute));
  if (missing.length === 0) {
    return;
  }
  throw new RenderDeviceError("Render item geometry is missing attributes required by its material", "RENDER_ITEM_GEOMETRY_MATERIAL_CONTRACT", {
    label: item.label,
    material: material.name,
    topology: geometry.topology,
    vertexFormat: geometry.vertexBuffer.format.attributes.map((attribute) => attribute.shaderName),
    missingAttributes: missing
  });
}

function resolveDrawRange(geometry: Geometry, range: RenderItemDrawRange | undefined): { readonly start: number; readonly count: number } {
  const available = geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount;
  // threejs-parity L2: three's `geometry.setDrawRange` clamps every draw to the
  // authored [start, start+count) window; a RenderItem override intersects it.
  const authored = geometry.drawRange;
  const authoredStart = authored ? Math.max(0, authored.start) : 0;
  const authoredEnd = authored ? Math.min(available, Math.max(authoredStart, authoredStart + Math.max(0, authored.count))) : available;
  if (!range) {
    return { start: authoredStart, count: Math.max(0, authoredEnd - authoredStart) };
  }
  if (!Number.isInteger(range.start) || range.start < 0 || !Number.isInteger(range.count) || range.count <= 0) {
    throw new RenderDeviceError("Render item drawRange must contain non-negative integer start and positive integer count", "RENDER_ITEM_DRAW_RANGE_INVALID", {
      start: range.start,
      count: range.count,
      available
    });
  }
  if (range.start + range.count > available) {
    throw new RenderDeviceError("Render item drawRange exceeds geometry draw count", "RENDER_ITEM_DRAW_RANGE_INVALID", {
      start: range.start,
      count: range.count,
      available
    });
  }
  const start = Math.max(range.start, authoredStart);
  const end = Math.min(range.start + range.count, authoredEnd);
  return { start, count: Math.max(0, end - start) };
}

let shaderFailureMaterial: UnlitMaterial | undefined;
function shaderFailureDebugMaterial(): UnlitMaterial {
  shaderFailureMaterial ??= new UnlitMaterial({ name: "aura3d-shader-failure", color: [1, 0, 1, 1] });
  return shaderFailureMaterial;
}

const warnedBindings = new WeakMap<Material, Set<string>>();

/** One console warning per (material, item label, path) for a non-fatal binding failure. */
function warnBindingOnce(item: RenderItem, material: Material, error: MaterialBindingError, generated: boolean): void {
  const key = `${item.label ?? ""}|${generated ? "generated" : "legacy"}`;
  const seen = warnedBindings.get(material) ?? new Set<string>();
  if (seen.has(key)) return;
  seen.add(key);
  warnedBindings.set(material, seen);
  console.warn(`[prd01] ${generated ? "generated draw falls back to the legacy program" : "draw skipped"} for "${item.label ?? material.name}": ${error.message}`);
}

function geometryHasAttribute(geometry: Geometry, attribute: string): boolean {
  return geometry.vertexBuffer.format.attributes.some((candidate) => candidate.semantic === attribute || candidate.shaderName === attribute);
}

/** Resolve once per draw with the same item/options/material precedence as DepthPass. */
export function resolveForwardClipping(
  item: RenderItem,
  options: Pick<ForwardPassOptions, "globalClipping" | "materialClippingFor" | "clippingPlaneLimit">,
  device: Pick<RenderDevice, "kind">
): ClippingBinding {
  const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
  const material = options.materialClippingFor?.(item) ?? item.materialClipping
    ?? (base as (typeof base & { readonly clipping?: ClippingGroupInput }))?.clipping;
  return createClippingBinding({ global: item.globalClipping ?? options.globalClipping, material, pass: "forward",
    primitive: item.geometry.topology === "lines" ? "line" : item.geometry.topology === "points" ? "point" : "mesh",
    backend: device.kind, maxPlanes: options.clippingPlaneLimit });
}

/** A preview has no clipping, deformation, packed-draw or nonstandard-depth shader. */
function validateDepthPreviewDraw(
  item: RenderItem,
  material: DepthPreviewMaterial,
  options: ForwardPassOptions,
  device: RenderDevice
): 0 | 1 {
  if (item.geometry.topology !== "triangles" || item.skinning || item.morphTargets?.length
    || item.morphWeights?.length || item.geometry.morphTargets?.length
    || item.instanceAttributes?.length || item.instanceColors?.length || item.instanceEmissive?.length
    || hasInstanceVertexStreams(item.geometry)
    || (item.instanceCount !== undefined && item.instanceCount !== 1 && !item.instanceTransforms)) {
    throw new RenderDeviceError("Depth preview requires rigid triangle geometry without instance attributes", "DEPTH_PREVIEW_GEOMETRY_UNSUPPORTED", { label: item.label });
  }
  if (isEngineBatchInstanceItem(item) || isEnginePackedBatchItem(item) || packedLoopMemberFor(item)
    || (item as RenderItem & { readonly multiDraw?: unknown }).multiDraw !== undefined) {
    throw new RenderDeviceError("Depth preview does not support batched draws", "DEPTH_PREVIEW_BATCH_UNSUPPORTED", { label: item.label });
  }
  if (item.geometryMatrix && toMat4Values(item.geometryMatrix, "geometryMatrix", item.label)
    .some((value, index) => value !== identityMatrix()[index])) {
    throw new RenderDeviceError("Depth preview does not support a separate geometry transform", "DEPTH_PREVIEW_GEOMETRY_UNSUPPORTED", { label: item.label });
  }
  const state = material.renderState;
  if (state.blend || (state.blendMode !== undefined && state.blendMode !== "opaque")
    || !state.depthTest || !state.depthWrite || (state.depthCompareV2 ?? state.depthCompare) !== "less-equal"
    || state.alphaToCoverage) {
    throw new RenderDeviceError("Depth preview requires opaque standard depth testing and writing", "DEPTH_PREVIEW_DEPTH_UNSUPPORTED", { label: item.label });
  }
  const cameraDepth = options.frameContext?.camera?.depth;
  const activeDepth = device.getDepthConvention?.();
  for (const depth of [cameraDepth, activeDepth]) {
    if (depth && (depth.mode !== "standard" || (depth.requestedMode !== "standard" && !depth.fallbackReason)
      || depth.clearValue !== 1 || depth.compare !== "less-equal" || depth.biasSign !== 1)) {
      throw new RenderDeviceError("Depth preview requires the standard depth convention", "DEPTH_PREVIEW_DEPTH_UNSUPPORTED", { label: item.label });
    }
  }
  const range = options.projectionClipRange ?? cameraDepth?.clipRange ?? "minus-one-to-one";
  if ((range !== "minus-one-to-one" && range !== "zero-to-one")
    || (cameraDepth && options.projectionClipRange !== undefined && options.projectionClipRange !== cameraDepth.clipRange)) {
    throw new RenderDeviceError("Depth preview projection clip range is invalid or disagrees with the camera", "DEPTH_PREVIEW_DEPTH_UNSUPPORTED", { label: item.label });
  }
  return range === "zero-to-one" ? 1 : 0;
}

/** Bind the real frame matrices and clip convention, including a verified jittered raster projection. */
function bindDepthPreviewFrameUniforms(
  options: ForwardPassOptions,
  item: RenderItem,
  material: DepthPreviewMaterial,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  clipRange: 0 | 1
): void {
  const required = ["u_modelMatrix", "u_viewMatrix", "u_projectionMatrix", "u_a3dClipRange", "u_depthPreviewNear", "u_depthPreviewSpan"];
  if (required.some((name) => !shader.reflection.uniforms.has(name)) || !shader.reflection.attributes.has("a_position")) {
    throw new RenderDeviceError("Depth preview shader reflection is incomplete", "DEPTH_PREVIEW_SHADER_UNSUPPORTED", { label: item.label });
  }
  let view = options.customFrameCamera?.viewMatrix ?? options.cameraViewMatrix;
  let projection = options.customFrameCamera?.projectionMatrix ?? options.auraFrameCamera?.projectionMatrix;
  const raster = options.cameraViewProjectionMatrix;
  const rasterView = options.cameraViewMatrix;
  const rasterProjection = options.auraFrameCamera?.projectionMatrix;
  if (raster && rasterView && rasterProjection) {
    const product = multiplyMat4(toMat4Values(rasterProjection, "projectionMatrix"), toMat4Values(rasterView, "viewMatrix"));
    if (matricesMatchAtFloatPrecision(product, raster)) {
      view = rasterView;
      projection = rasterProjection;
    }
  }
  if ((view === undefined) !== (projection === undefined) || (raster && (!view || !projection))) {
    throw new RenderDeviceError("Depth preview requires both camera view and projection matrices", "DEPTH_PREVIEW_CAMERA_UNSUPPORTED", { label: item.label });
  }
  const viewMatrix = toMat4Uniform(view ?? identityMatrix(), "cameraViewMatrix", item.label);
  const projectionMatrix = toMat4Uniform(projection ?? identityMatrix(), "projectionMatrix", item.label);
  const modelMatrix = toMat4Uniform(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
  const affine = (matrix: Float32Array) => matrix.every(Number.isFinite)
    && matrix[3] === 0 && matrix[7] === 0 && matrix[11] === 0 && matrix[15] === 1;
  if (!affine(viewMatrix) || !affine(modelMatrix) || !projectionMatrix.every(Number.isFinite)) {
    throw new RenderDeviceError("Depth preview requires finite affine model and view matrices", "DEPTH_PREVIEW_CAMERA_UNSUPPORTED", { label: item.label });
  }
  if (raster) {
    const product = multiplyMat4(Array.from(projectionMatrix) as Mat4, Array.from(viewMatrix) as Mat4);
    if (!matricesMatchAtFloatPrecision(product, raster)) {
      throw new RenderDeviceError("Depth preview matrices disagree with the raster camera", "DEPTH_PREVIEW_CAMERA_UNSUPPORTED", { label: item.label });
    }
  }
  uniforms.set("u_modelMatrix", modelMatrix);
  uniforms.set("u_viewMatrix", viewMatrix);
  uniforms.set("u_projectionMatrix", projectionMatrix);
  uniforms.set("u_a3dClipRange", clipRange);
  uniforms.set("u_depthPreviewNear", material.getParameter("u_depthPreviewNear")!);
  uniforms.set("u_depthPreviewSpan", material.getParameter("u_depthPreviewSpan")!);
}

/** Check specialized paths before any forward or shadow work for a clipped item. */
export function assertForwardClippingSupported(
  item: RenderItem,
  clipping: ClippingBinding,
  options: { readonly flags?: QrFlags; readonly cameraViewMatrix?: Float32Array | readonly number[]; readonly shaderLibrary?: ShaderLibrary } = {}
): void {
  if (clipping.groups.length === 0) return;
  const material = item.material;
  const base = material ? getBaseMaterial(material) : undefined;
  if (base?.shaderKey === DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME) {
    const geometryMatrix = item.geometryMatrix && toMat4Values(item.geometryMatrix, "geometryMatrix", item.label);
    if (!(base instanceof ScreenSpaceLineMaterial) || base.shaderVariant !== undefined || !options.shaderLibrary
      || !certifiedDefaultScreenLineSource(options.shaderLibrary) || item.instanceTransforms !== undefined
      || (item.instanceCount !== undefined && item.instanceCount !== 1) || hasInstanceVertexStreams(item.geometry)
      || item.skinning || item.morphTargets || item.morphWeights
      || (geometryMatrix && geometryMatrix.some((value, index) => value !== identityMatrix()[index]))) {
      throw new RenderDeviceError("Clipped screen-space lines require an authenticated non-instanced shader source", "FORWARD_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED", { material: base.name });
    }
  }
  if (material?.getParameter("u_spriteMode") === 1) {
    if (clipping.backend === "webgpu" || !options.flags || !qrCoreGeneratorOn(options.flags) || !options.flags.on("A3D_PARITY_LINES")
      || item.instanceTransforms !== undefined || (item.instanceCount !== undefined && item.instanceCount !== 1)
      || hasInstanceVertexStreams(item.geometry)) {
      throw new RenderDeviceError("Clipped sprites require the generated WebGL billboard path without instancing", "FORWARD_CLIPPING_SPRITE_UNSUPPORTED", { material: base?.name });
    }
    if (item.geometryMatrix && toMat4Values(item.geometryMatrix, "geometryMatrix", item.label).some((value, index) => value !== identityMatrix()[index])) {
      throw new RenderDeviceError("Clipped sprites do not apply a geometry transform", "FORWARD_CLIPPING_SPRITE_UNSUPPORTED", { material: base?.name });
    }
    if (!spriteClipInverse(options.cameraViewMatrix ?? identityMatrix())
      || (clipping.groups.some((group) => group.space === "local") && !spriteClipInverse(item.modelMatrix ?? identityMatrix()))) {
      throw new RenderDeviceError("Clipped sprites require finite, affine and invertible view and local transforms", "FORWARD_CLIPPING_SPRITE_TRANSFORM", { label: item.label });
    }
  }
  if ((item as RenderItem & { readonly multiDraw?: unknown }).multiDraw !== undefined) {
    throw new RenderDeviceError("Clipping is unavailable for packed multi-draw geometry", "FORWARD_CLIPPING_BATCH_UNSUPPORTED", { label: item.label });
  }
  if (clipping.backend === "webgpu" && base instanceof UnlitMaterial && item.geometry.topology === "points") {
    throw new RenderDeviceError("Generated WebGPU points require the point-quad path", "NATIVE_UNLIT_POINTS_UNSUPPORTED", { material: base.name });
  }
  if (base instanceof PortableShaderMaterial && !PortableShaderMaterial.hasGraphClippingContract(base)) {
    throw new RenderDeviceError("Portable and custom shaders do not yet provide forward clipping", "FORWARD_CLIPPING_PROGRAM_UNSUPPORTED", { material: base.name });
  }
}

function spriteClipInverse(value: Float32Array | readonly number[]): Float32Array | undefined {
  try {
    const matrix = Array.from(new Float32Array(toMat4Values(value, "spriteClipTransform"))) as Mat4;
    if (!isFiniteArrayLike(matrix) || matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) return undefined;
    const inverse = new Float32Array(invertMat4(matrix));
    return isFiniteArrayLike(inverse) ? inverse : undefined;
  } catch { return undefined; }
}

function spriteCameraMatchesRaster(camera: { readonly view: Float32Array; readonly projection: Float32Array; readonly viewProjection: Float32Array } | undefined): boolean {
  if (!camera) return false;
  const product = multiplyMat4(Array.from(camera.projection) as Mat4, Array.from(camera.view) as Mat4);
  return matricesMatchAtFloatPrecision(product, camera.viewProjection);
}

function matricesMatchAtFloatPrecision(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== 16 || right.length !== 16) return false;
  return Array.from(left).every((value, index) => {
    const actual = Math.fround(value), expected = Math.fround(right[index]!);
    return Number.isFinite(actual) && Number.isFinite(expected)
      && Math.abs(actual - expected) <= 1e-5 * Math.max(1, Math.abs(actual), Math.abs(expected));
  });
}

/** Use the actual raster camera when all three frame matrices agree. Custom
 * standalone cameras retain their existing bindings if no such proof exists. */
function bindClippedLineRasterCamera(options: ForwardPassOptions, uniforms: Map<string, UniformValue>): void {
  const view = options.cameraViewMatrix, projection = options.auraFrameCamera?.projectionMatrix, raster = options.cameraViewProjectionMatrix;
  if (!view || !projection || !raster) return;
  try {
    const viewMatrix = toMat4Uniform(view, "cameraViewMatrix");
    const projectionMatrix = toMat4Uniform(projection, "auraFrameCamera.projectionMatrix");
    const rasterMatrix = toMat4Uniform(raster, "cameraViewProjectionMatrix");
    const product = multiplyMat4(Array.from(projectionMatrix) as Mat4, Array.from(viewMatrix) as Mat4);
    if (!matricesMatchAtFloatPrecision(product, rasterMatrix)) return;
    uniforms.set("u_viewMatrix", viewMatrix);
    uniforms.set("u_projectionMatrix", projectionMatrix);
  } catch {
    // The final line-transform validation retains the existing explicit error.
  }
}

/** Invert the exact transform consumed by the selected line shader after hooks. */
function bindClippedLineInverse(uniforms: Map<string, UniformValue>, shader: RenderShaderProgram, item: RenderItem): void {
  const matrix = (name: string): Mat4 => {
    const value = uniforms.get(name);
    if (!(value instanceof Float32Array) && !Array.isArray(value)) {
      throw new RenderDeviceError("Clipped screen-space lines require bound transforms", "FORWARD_CLIPPING_LINE_TRANSFORM", { label: item.label, name });
    }
    return toMat4Values(value, name, item.label);
  };
  try {
    const model = matrix("u_modelMatrix");
    if (model[3] !== 0 || model[7] !== 0 || model[11] !== 0 || model[15] !== 1) throw new Error("non-affine model");
    const worldUnits = uniforms.get("u_lineWorldUnits");
    if (typeof worldUnits !== "number" || !Number.isFinite(worldUnits)) throw new Error("invalid line width mode");
    const transform = worldUnits > 0.5
      ? multiplyMat4(multiplyMat4(matrix("u_projectionMatrix"), matrix("u_viewMatrix")), model)
      : matrix("u_modelViewProjection");
    if (worldUnits > 0.5) {
      // The built-in line shader uses MVP for near-plane trimming and the
      // separate projection/view/model uniforms for world-width expansion.
      // Both operations must describe the same raster camera.
      const mvp = matrix("u_modelViewProjection");
      if (!matricesMatchAtFloatPrecision(transform, mvp)) throw new RenderDeviceError("World-width clipped lines require matching raster transforms", "FORWARD_CLIPPING_LINE_CAMERA_MISMATCH", { label: item.label });
    }
    const inverse = new Float32Array(invertMat4(Array.from(new Float32Array(transform)) as Mat4));
    if (!isFiniteArrayLike(inverse) || !shader.reflection.uniforms.has(LINE_CLIP_INVERSE_TRANSFORM)) throw new Error("invalid inverse or missing uniform");
    uniforms.set(LINE_CLIP_INVERSE_TRANSFORM, inverse);
  } catch (error) {
    if (error instanceof RenderDeviceError && error.code === "FORWARD_CLIPPING_LINE_CAMERA_MISMATCH") throw error;
    throw new RenderDeviceError("Clipped screen-space lines require a finite invertible bound transform", "FORWARD_CLIPPING_LINE_TRANSFORM", { label: item.label });
  }
}

/** Local-probe collection may install a legacy dominant-cube override. A
 * generated blend instead needs the original scene/item environment. */
function globalEnvironmentItem(item: RenderItem, probes: NonNullable<ReturnType<typeof prd02ItemProbeBindings>>): RenderItem {
  return { ...item, environmentCube: probes.originalEnvironmentCube, environmentCubeMip: probes.originalEnvironmentCubeMip };
}

/** Native unlit pipelines are keyed by the original geometry topology. */
export function nativeUnlitPrimitiveForGeometry(
  geometry: Pick<Geometry, "topology">,
  device: Pick<RenderDevice, "kind">,
  lighting: ProgramFeatures["lighting"]
): Geometry["topology"] | undefined {
  return device.kind === "webgpu" && lighting === "unlit" ? geometry.topology : undefined;
}

/** Physical color selection is geometry-specific even when a material is shared. */
/**
 * A selected `prd06.deform` skin segment draws from the bone texture with the geometry's joint input types. ForwardPass
 * applies this to every generated draw record; the renderer warmup applies it too so warmed keys match draw keys.
 */
export function generatedSkinningForGeometry<T extends Pick<ProgramFeatures, "features" | "skinning">>(record: T, geometry: Geometry, materialName: string): T {
  const deform = record.features["prd06.deform"];
  const skin = typeof deform === "string" ? /(?:^|\|)skin([48])(?:\||$)/.exec(deform) : null;
  if (!skin) return record;
  const influences = Number(skin[1]) as 4 | 8;
  const attributes = geometry.vertexBuffer.format.attributes;
  const kind = (semantic: "joints" | "joints1"): "float" | "uint" | "sint" => {
    const attribute = attributes.find((candidate) => candidate.semantic === semantic);
    return !attribute?.integer ? "float" : attribute.type.startsWith("uint") ? "uint" : "sint";
  };
  if (attributes.some((attribute) => (attribute.semantic === "weights" || (influences === 8 && attribute.semantic === "weights1")) && attribute.integer)) {
    throw new RenderDeviceError("Generated skinning weights require float or normalized inputs", "GENERATED_SKINNING_WEIGHT_INPUT_UNSUPPORTED", { material: materialName });
  }
  return { ...record, skinning: { influences, palette: "texture" }, features: { ...record.features,
    "prd06.joint0Type": kind("joints"), ...(influences === 8 ? { "prd06.joint1Type": kind("joints1") } : {}) } };
}

export function physicalVertexColorsForGeometry(geometry: Geometry, device: RenderDevice): boolean {
  const color = geometry.vertexBuffer.format.attributes.find((attribute) => attribute.semantic === "color" || attribute.shaderName === "a_color");
  if (!color) return false;
  if (color.components !== 4 || color.shaderLocation !== 4 || color.integer
    || (device.kind === "webgpu" && color.type !== "float32" && !color.normalized)) {
    throw new RenderDeviceError("Physical vertex colors require compatible four-component inputs at location 4", "PHYSICAL_VERTEX_COLOR_FORMAT_UNSUPPORTED", {});
  }
  return true;
}

function hasLiveTransmission(material: Material | MaterialInstance): boolean {
  const factor = material.getParameter("u_transmissionFactor");
  if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) return true;
  const name = "u_transmissionTexture", map = material.getParameter(name);
  return isTextureBinding(map) && !!map.texture && !map.texture.disposed && material.getParameter(`${name}Enabled`) !== 0;
}

function hasLiveDiffuseTransmission(material: Material | MaterialInstance): boolean {
  const factor = material.getParameter("u_diffuseTransmissionFactor");
  if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) return true;
  for (const name of ["u_diffuseTransmissionTexture", "u_diffuseTransmissionColorTexture"] as const) {
    const map = material.getParameter(name);
    if (isTextureBinding(map) && map.texture && !map.texture.disposed && material.getParameter(`${name}Enabled`) !== 0) return true;
  }
  return false;
}

const GRAPH_LOCAL_PROBE_UNIFORMS = ["u_prd02ProbeCubeA", "u_prd02ProbeCubeB", "u_prd02ProbeCenterA", "u_prd02ProbeCenterB",
  "u_prd02ProbeOriginA", "u_prd02ProbeOriginB", "u_prd02ProbeHalfA", "u_prd02ProbeHalfB", "u_prd02ProbeWeights"] as const;
const GRAPH_IRRADIANCE_VOLUME_UNIFORMS = ["u_prd02IrradianceR", "u_prd02IrradianceG", "u_prd02IrradianceB",
  "u_prd02IrradianceMin", "u_prd02IrradianceMax", "u_prd02IrradianceGrid"] as const;

/** Resolve the same original per-item/scene cube used by the generated IBL
 * path, rather than the legacy dominant-local-probe override. */
function graphGlobalEnvironmentCube(environment: EnvironmentLightingOptions | undefined, item: RenderItem): {
  readonly binding: TextureBinding;
  readonly info: readonly [number, number, number, number];
  readonly encoding: number;
  readonly diffuseIntensity: number;
} | null {
  const env = environment ? withItemEnvironmentCube(environment, item) : undefined;
  const authored = item.environmentCube ?? env?.environmentCubeMapTexture;
  const probe = env?.environmentProbe;
  let binding: TextureBinding;
  let fromProbe = false;
  if (authored?.texture || authored?.required) {
    validateEnvironmentTextureBinding("Graph global environment cube", authored, "cube", item);
    binding = authored;
  } else if (probe) {
    fromProbe = true;
    binding = new TextureBinding({
      name: "u_graphGlobalEnvCube", texture: probe.specularCube,
      sampler: Sampler.trilinear({ wrap: "clamp" }), required: true, expectedDimension: "cube"
    });
    validateEnvironmentTextureBinding("Graph global environment probe", binding, "cube", item);
  } else {
    return null;
  }
  const intensity = env?.environmentMapSpecularIntensity ?? env?.environmentMapIntensity ?? 1;
  const diffuseIntensity = env?.environmentMapIntensity ?? 1;
  const mipCount = item.environmentCubeMip ?? env?.environmentMapMipCount
    ?? (fromProbe ? probe!.mipCount : Math.max(1, binding.texture?.cubeFaces[0]?.mipLevels.length ?? 1));
  const rotation = env?.environmentMapRotation ?? 0;
  const encoding = fromProbe ? "linear" : env?.environmentMapEncoding ?? (binding.texture?.colorSpace === "srgb" ? "srgb" : "linear");
  if (!Number.isFinite(intensity) || !Number.isFinite(Math.fround(intensity)) || intensity < 0
    || !Number.isFinite(diffuseIntensity) || !Number.isFinite(Math.fround(diffuseIntensity)) || diffuseIntensity < 0
    || !Number.isSafeInteger(mipCount) || mipCount < 1
    || !Number.isFinite(rotation) || !Number.isFinite(Math.fround(rotation))
    || (encoding !== "srgb" && encoding !== "rgbe" && encoding !== "linear")) {
    throw new RenderDeviceError("Graph global environment cube options are invalid", "ENVIRONMENT_LIGHTING_CONTRACT", { label: item.label });
  }
  return {
    binding: new TextureBinding({ name: "u_graphGlobalEnvCube", texture: binding.texture, sampler: binding.sampler,
      required: true, ready: binding.ready, expectedColorSpace: binding.expectedColorSpace, expectedDimension: "cube" }),
    info: [1, intensity, mipCount - 1, rotation],
    encoding: encoding === "rgbe" ? 1 : encoding === "linear" ? 2 : 0,
    diffuseIntensity
  };
}

function validateGraphEnvironmentUniforms(shader: RenderShaderProgram, names: readonly string[], material: string): void {
  if (names.some((name) => !shader.reflection.uniforms.has(name))) {
    throw new RenderDeviceError("Graph shader lacks selected environment bindings", "GRAPH_ENVIRONMENT_BINDING_UNSUPPORTED", { material, names });
  }
}

function applyGraphEnvironmentShIntensity(environment: EnvironmentLightingOptions | undefined, uniforms: Map<string, UniformValue>, item: RenderItem): void {
  if (uniforms.get("u_a3dEnvShEnabled") !== 1) return;
  const sh = uniforms.get("u_a3dEnvSh");
  const intensity = environment?.environmentMapIntensity ?? 1;
  if (!(sh instanceof Float32Array) || !Number.isFinite(intensity) || intensity < 0) {
    throw new RenderDeviceError("Graph environment irradiance options are invalid", "ENVIRONMENT_LIGHTING_CONTRACT", { label: item.label });
  }
  const scaled = Float32Array.from(sh, (coefficient) => coefficient * intensity);
  if (!scaled.every(Number.isFinite)) {
    throw new RenderDeviceError("Graph environment irradiance exceeds GPU precision", "ENVIRONMENT_LIGHTING_CONTRACT", { label: item.label });
  }
  uniforms.set("u_a3dEnvSh", scaled);
}

function validateGraphIrradianceBindings(uniforms: Map<string, UniformValue>, material: string): void {
  for (const name of GRAPH_IRRADIANCE_VOLUME_UNIFORMS.slice(0, 3)) {
    const value = uniforms.get(name);
    if (!isTextureBinding(value) || !value.texture || value.texture.dimension !== "2d-array" || value.texture.format !== "rgba16f" || !value.validate().ok) {
      throw new RenderDeviceError("Graph irradiance volume texture is unavailable", "GRAPH_IRRADIANCE_VOLUME_BINDING_UNAVAILABLE", { material, name });
    }
  }
  const vectors = GRAPH_IRRADIANCE_VOLUME_UNIFORMS.slice(3).map((name) => uniforms.get(name));
  if (vectors.some((value) => !(value instanceof Float32Array) || value.length !== 4 || !value.every(Number.isFinite))) {
    throw new RenderDeviceError("Graph irradiance volume parameters are unavailable", "GRAPH_IRRADIANCE_VOLUME_BINDING_UNAVAILABLE", { material });
  }
  const [minimum, maximum, grid] = vectors as Float32Array[];
  if (grid![3]! < 0 || [0, 1, 2].some((axis) => maximum![axis]! <= minimum![axis]! || !Number.isInteger(grid![axis]!) || grid![axis]! < 1)) {
    throw new RenderDeviceError("Graph irradiance volume parameters are invalid", "GRAPH_IRRADIANCE_VOLUME_BINDING_UNAVAILABLE", { material });
  }
}

/** Portable native layouts require both cube views even when one weight is 0. */
function ensureGraphProbeCubeBindings(uniforms: Map<string, UniformValue>, material: string): void {
  for (const name of GRAPH_LOCAL_PROBE_UNIFORMS.slice(2, 8)) {
    const value = uniforms.get(name);
    if (!(value instanceof Float32Array) || value.length !== 4 || !value.every(Number.isFinite)) {
      throw new RenderDeviceError("Graph reflection probe parameters are unavailable", "GRAPH_PROBE_BINDING_UNAVAILABLE", { material, name });
    }
  }
  const weights = uniforms.get("u_prd02ProbeWeights");
  if (!(weights instanceof Float32Array) || weights.length < 4 || !Array.from(weights).every(Number.isFinite)
    || weights[0]! < 0 || weights[1]! < 0) {
    throw new RenderDeviceError("Graph reflection probe weights are invalid", "GRAPH_PROBE_BINDING_UNAVAILABLE", { material });
  }
  const names = ["u_prd02ProbeCubeA", "u_prd02ProbeCubeB"] as const;
  const cubes = names.map((name) => {
    const value = uniforms.get(name);
    return isTextureBinding(value) && value.texture && value.texture.dimension === "cube" && value.validate().ok ? value : null;
  });
  if (names.some((_, index) => weights[index]! > 0 && !cubes[index])) {
    throw new RenderDeviceError("Graph reflection probe cube is unavailable", "GRAPH_PROBE_BINDING_UNAVAILABLE", { material });
  }
  const fallback = cubes[0] ?? cubes[1];
  if (!fallback) throw new RenderDeviceError("Graph reflection probe cubes are unavailable", "GRAPH_PROBE_BINDING_UNAVAILABLE", { material });
  for (let index = 0; index < names.length; index += 1) {
    if (!cubes[index]) uniforms.set(names[index]!, new TextureBinding({
      name: names[index]!, texture: fallback.texture, sampler: fallback.sampler, required: true, expectedDimension: "cube"
    }));
  }
}

function requiresGeneratedEffectsProgram(features: ProgramFeatures): boolean {
  return features.extensions.length > 0 || features.shadows.contact || features.lights.rect > 0 || features.features[PROGRAM_CLIPPING_FEATURE] === true
    || features.features[LEGACY_POINT_SHADOW_FEATURE] === true || features.features[LEGACY_SPOT_SHADOW_FEATURE] === true
    || features.features[PRD02_LOCAL_PROBE_FEATURE] === true || features.features[PRD02_IRRADIANCE_VOLUME_FEATURE] === true
    || features.features[NATIVE_PROBE_GRID_FEATURE] === true || features.features[NATIVE_VOXEL_INDIRECT_FEATURE] === true
    || features.features[NATIVE_BAKED_LIGHTMAP_FEATURE] !== undefined;
}

/** Both packed and clustered light data retain input order for their active
 * paths, so the producer's actual light identity selects exactly one entry. */
function contactShadowLightIndex(scope: ContactShadowMaskScope | undefined, item: RenderItem, lights: readonly CollectedLight[]): number {
  if (item.receiveShadow === false) return -1;
  const mask = resolveContactShadowMask(scope);
  if (!mask) return -1;
  // A receiver whose own depth state differs from the camera depth the mask was built from cannot take the mask: outside
  // strict mode it simply does not receive (and was left out of the mask depth), instead of failing the frame.
  if (item.material && scope?.frame?.flags && !scope.frame.flags.on("A3D_QR_STRICT") && !contactReceiverCompatible(getBaseMaterial(item.material), scope)) return -1;
  let selected = -1;
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index]!;
    if (light.kind !== "directional" || !light.castsShadow || light.source !== mask.sourceLight) continue;
    if (selected >= 0 || index > 0x1000000) {
      throw new RenderDeviceError("Contact shadow light identity is ambiguous", "CONTACT_SHADOW_LIGHT_AMBIGUOUS", {});
    }
    selected = index;
  }
  // Cluster tiles retain at most the first 64 candidates in input order.
  // A directional appears in every tile, so an earlier index is guaranteed
  // to survive; beyond that point it may disappear in some tiles. Do not
  // silently count or bind a contact receiver whose source can be dropped.
  if (selected >= MAX_LIGHTS_PER_CLUSTER) {
    throw new RenderDeviceError("The contact shadow light exceeds the clustered light capacity", "CONTACT_SHADOW_LIGHT_CAPACITY_EXCEEDED", { index: selected });
  }
  return selected;
}

/** The mask is computed from a single camera-depth surface per pixel. These
 * receiver states can select a different surface or coverage than its depth
 * prepass, so accepting them would apply another object's shadow. */
function contactReceiverCompatible(material: Material, scope: ContactShadowMaskScope | undefined): boolean {
  const state = material.renderState;
  const frameDepth = scope?.frame?.camera?.depth;
  const depthCompare = frameDepth?.mode === "reversed" ? "greater-equal" : "less-equal";
  if (blendStateIsTransparent(state) || !state.depthTest || !state.depthWrite
    || remapDepthCompare(state.depthCompareV2 ?? state.depthCompare, frameDepth) !== depthCompare
    || state.alphaToCoverage === true || state.polygonOffset != null || state.stencil != null || state.scissor != null
    || renderStateHasExtendedCommandFields(state)) return false;
  if (material instanceof PortableShaderMaterial && material.graphMaterial
    && (!material.graphSourcesPristine || material.graphDisplaced || typeof (material as Material & { readonly customDepthShaderKey?: unknown }).customDepthShaderKey === "string")) return false;
  return true;
}

function validateContactShadowReceiver(material: Material, index: number, scope: ContactShadowMaskScope | undefined): void {
  if (index < 0) return;
  const state = material.renderState;
  // Receiver states are authored in standard-depth terms and remapped for a
  // reversed frame exactly like the camera depth prepass.
  const frameDepth = scope?.frame?.camera?.depth;
  const depthCompare = frameDepth?.mode === "reversed" ? "greater-equal" : "less-equal";
  if (blendStateIsTransparent(state) || !state.depthTest || !state.depthWrite
    || remapDepthCompare(state.depthCompareV2 ?? state.depthCompare, frameDepth) !== depthCompare
    || state.alphaToCoverage === true || state.polygonOffset != null || state.stencil != null || state.scissor != null
    || renderStateHasExtendedCommandFields(state)) {
    throw new RenderDeviceError("Contact shadows require an opaque receiver matching the camera depth prepass", "CONTACT_SHADOW_RECEIVER_DEPTH_UNSUPPORTED", { material: material.name });
  }
  if (material instanceof PortableShaderMaterial && material.graphMaterial && !material.graphSourcesPristine) {
    throw new RenderDeviceError("Reloaded graph sources require a rebuilt contact depth contract", "GRAPH_CONTACT_SHADOW_SOURCE_UNSUPPORTED", { material: material.name });
  }
  if (material instanceof PortableShaderMaterial && material.graphMaterial
    && (material.graphDisplaced || typeof (material as Material & { readonly customDepthShaderKey?: unknown }).customDepthShaderKey === "string")) {
    throw new RenderDeviceError("Displaced graph contact receivers require a matching camera depth prepass", "GRAPH_CONTACT_SHADOW_DEPTH_UNSUPPORTED", { material: material.name });
  }
}

const LEGACY_PBR_DETAIL_SHADERS = new Set([
  "aura3d/pbr-direct", "aura3d/instanced-pbr", "aura3d/skinned-lit", "aura3d/skinned-lit-8", "aura3d/pbr-textured"
]);

const GRAPH_EMPTY_LOCAL_SHADOW_ATLAS = new TextureBinding({ name: "u_localShadowAtlas", required: false,
  sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }), expectedDimension: "2d" });

const GRAPH_EMPTY_CASCADE_TEXTURES = Array.from({ length: 4 }, (_, index) => new TextureBinding({
  name: `u_graphCascadeTexture${index}`, required: false,
  sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }), expectedDimension: "2d"
}));

/** Per-fragment graph cascade packet. Every map retains its own filter and
 * bias, and disabled receivers get zero cascades and safe fallback textures. */
function applyGraphCascadeUniforms(options: ForwardPassOptions, item: RenderItem, device: RenderDevice, shader: RenderShaderProgram, uniforms: Map<string, UniformValue>): void {
  if (!shader.reflection.uniforms.has("u_graphCascadeCount")) return;
  const cascades = item.receiveShadow === false ? [] : options.shadowMap?.cascades ?? [];
  if (cascades.length > 4) throw new RenderDeviceError("Graph shadow receivers support at most four cascades", "GRAPH_CASCADE_CONTRACT", { count: cascades.length });
  const capacity = Math.max(1, cascades.length);
  const splits = new Float32Array(4), matrices = new Float32Array(capacity * 16), params = new Float32Array(capacity * 4);
  const texels = new Float32Array(capacity * 4), samples = new Float32Array(capacity * MAX_FORWARD_SHADOW_PCF_SAMPLES * 4);
  let previousFar = 0;
  for (let index = 0; index < capacity; index += 1) {
    const cascade = cascades[index];
    if (!cascade) {
      uniforms.set(`u_graphCascadeTexture${index}`, GRAPH_EMPTY_CASCADE_TEXTURES[index]!);
      continue;
    }
    const map = cascade.shadowMap;
    const texture = map.texture;
    const strength = map.strength ?? prd02ShadowStrengthDefault();
    const bias = map.bias ?? 0.001, slopeBias = map.slopeBias ?? 1, normalBias = map.normalBias ?? 0;
    const texel = map.texelSize ?? [1 / Math.max(1, texture.texture?.width ?? 1), 1 / Math.max(1, texture.texture?.height ?? 1)];
    if (!Number.isFinite(cascade.near) || !Number.isFinite(cascade.far) || cascade.near < 0 || cascade.far <= cascade.near
      || (index > 0 && cascade.far <= previousFar)
      || !texture.texture || !texture.validate().ok || texture.texture.dimension !== "2d" || texture.sampler.compare !== undefined
      || (device.kind === "webgpu" && texture.texture.format === "depth24")
      || !Number.isFinite(strength) || strength < 0 || strength > 1
      || !Number.isFinite(bias) || bias < 0 || !Number.isFinite(slopeBias) || slopeBias < 0 || !Number.isFinite(normalBias) || normalBias < 0
      || texel.length !== 2 || !texel.every((value) => Number.isFinite(value) && value > 0)) {
      throw new RenderDeviceError("Invalid graph cascade shadow binding", "GRAPH_CASCADE_CONTRACT", { index, material: item.label });
    }
    const kernel = applyShadowPcfTapTier(map.filterKernel ?? DEFAULT_FORWARD_SHADOW_FILTER_KERNEL, map.pcfTapTier);
    const packed = packForwardShadowPcfSamples(kernel, item.label);
    splits[index] = cascade.far;
    matrices.set(toMat4Uniform(map.lightMatrix, "cascade.lightMatrix", item.label), index * 16);
    params.set([strength, bias, slopeBias, normalBias], index * 4);
    texels.set([texel[0]!, texel[1]!, kernel.samples.length, 0], index * 4);
    samples.set(packed, index * MAX_FORWARD_SHADOW_PCF_SAMPLES * 4);
    uniforms.set(`u_graphCascadeTexture${index}`, texture);
    previousFar = cascade.far;
  }
  const view = options.customFrameCamera?.viewMatrix ?? options.cameraViewMatrix;
  const viewMode = view !== undefined && view.length === 16 && isFiniteArrayLike(view) ? 0 : options.cameraPosition && isFiniteArrayLike(options.cameraPosition) ? 1 : 2;
  uniforms.set("u_graphCascadeCount", cascades.length);
  uniforms.set("u_graphCascadeViewMode", viewMode);
  uniforms.set("u_graphCascadeSplits", splits);
  uniforms.set("u_graphCascadeMatrices", matrices);
  uniforms.set("u_graphCascadeParams", params);
  uniforms.set("u_graphCascadeTexels", texels);
  uniforms.set("u_graphCascadeSamples", samples);
}

function shaderCacheKey(material: Material, defines: Readonly<Record<string, true>> = {}, key = material.shaderKey): string {
  const base = material.shaderVariant && key === material.shaderKey ? `${key}:${material.shaderVariant}` : key;
  const axes = Object.keys(defines).sort();
  return axes.length ? `${base}:${axes.join(",")}` : base;
}

/** Match the graph shader's legacy shadow-map identity checks. A single map
 * cannot represent two distinct casters at the same position and direction. */
function validateGraphLocalShadowSources(material: Material, shadow: ForwardShadowMapOptions, lights: readonly CollectedLight[]): void {
  const point = shadow.pointLight;
  if (point && point.strength !== 0 && lights.filter((light) => light.kind === "point" && light.castsShadow
    && graphShadowPositionMatches(light.position, point.lightPosition)).length > 1) {
    throw new RenderDeviceError("Graph point shadow maps cannot distinguish multiple matching shadow-casting lights", "GRAPH_AMBIGUOUS_POINT_SHADOW", { material: material.name });
  }
  const spot = shadow.spotLight;
  if (spot && spot.strength !== 0 && lights.filter((light) => light.kind === "spot" && light.castsShadow
    && graphShadowPositionMatches(light.position, spot.lightPosition)
    && graphShadowDirectionMatches(light.direction, spot.lightDirection)).length > 1) {
    throw new RenderDeviceError("Graph spot shadow maps cannot distinguish multiple matching shadow-casting lights", "GRAPH_AMBIGUOUS_SPOT_SHADOW", { material: material.name });
  }
}

/** The legacy packet has no light ID, so select it only when its position
 * (and spot axis) identify a single shadow-casting light in the packed data. */
function selectLegacyPunctualShadows(shadow: ForwardShadowMapOptions | undefined, lights: readonly CollectedLight[], material: Material, device: RenderDevice): { point: boolean; spot: boolean } {
  const selected = { point: false, spot: false };
  for (const kind of ["point", "spot"] as const) {
    const map = kind === "point" ? shadow?.pointLight : shadow?.spotLight;
    const candidates = lights.filter((light) => light.kind === kind && light.castsShadow);
    if (!map || map.strength === 0 || candidates.length === 0) continue;
    if ((map.strength !== undefined && (!Number.isFinite(map.strength) || map.strength < 0 || map.strength > 1))
      || !map.lightPosition || map.lightPosition.length !== 3 || !isFiniteArrayLike(map.lightPosition)
      || (kind === "spot" && (!shadow?.spotLight?.lightDirection || shadow.spotLight.lightDirection.length !== 3
        || !isFiniteArrayLike(shadow.spotLight.lightDirection) || Math.hypot(...shadow.spotLight.lightDirection) <= 0.0001))) {
      throw new RenderDeviceError("Invalid standalone shadow light identity", "GENERATED_PUNCTUAL_SHADOW_CONTRACT", { material: material.name, kind });
    }
    const matching = candidates.filter((light) => graphShadowPositionMatches(light.position, map.lightPosition)
      && (kind !== "spot" || graphShadowDirectionMatches(light.direction, shadow!.spotLight!.lightDirection)));
    if (matching.length > 1) {
      throw new RenderDeviceError("Standalone shadow map cannot distinguish multiple matching shadow-casting lights", "GENERATED_PUNCTUAL_SHADOW_AMBIGUOUS", { material: material.name, kind });
    }
    if (matching.length === 0) continue;
    const binding = map.texture;
    if (!binding?.texture || !binding.validate().ok || binding.texture.dimension !== "2d" || binding.sampler.compare !== undefined
      || (device.kind === "webgpu" && binding.texture.format === "depth24")) {
      throw new RenderDeviceError("Invalid standalone shadow texture binding", "GENERATED_PUNCTUAL_SHADOW_CONTRACT", { material: material.name, kind });
    }
    selected[kind] = true;
  }
  return selected;
}

function graphShadowPositionMatches(a: readonly number[], b: readonly number[]): boolean {
  // Both packed light vectors and map uniforms reach GLSL/WGSL as f32.
  const distance = Math.hypot(Math.fround(a[0]!) - Math.fround(b[0]!), Math.fround(a[1]!) - Math.fround(b[1]!), Math.fround(a[2]!) - Math.fround(b[2]!));
  return distance <= 0.000100001;
}

function graphShadowDirectionMatches(a: readonly number[], b: readonly number[]): boolean {
  const av = a.map(Math.fround);
  const bv = b.map(Math.fround);
  const denominator = Math.max(Math.hypot(...av), 0.0001) * Math.max(Math.hypot(...bv), 0.0001);
  // Give the CPU check a small conservative margin for f32 dot/normalize rounding.
  return (av[0]! * bv[0]! + av[1]! * bv[1]! + av[2]! * bv[2]!) / denominator >= 0.999899;
}

/** Graph skin variants match each joint stream's numeric input type and use
 * the common legacy palette binder. Unsupported layouts fail explicitly. */
function graphSkinningShaderKey(material: Material, item: RenderItem, device: RenderDevice): string {
  if (!(material instanceof PortableShaderMaterial) || !material.graphMaterial || !item.skinning) return material.shaderKey;
  const attributes = item.geometry.vertexBuffer.format.attributes;
  const hasSecondSet = attributes.some((attribute) => attribute.semantic === "joints1" || attribute.semantic === "weights1" || attribute.shaderName === "a_joints1" || attribute.shaderName === "a_weights1");
  if (hasSecondSet && !item.skinning.extraInfluences) {
    throw new RenderDeviceError("Graph skinning must enable all geometry influence sets", "GRAPH_SKINNING_INFLUENCE_MISMATCH", { material: material.name });
  }
  const semantics = item.skinning.extraInfluences ? ["joints", "weights", "joints1", "weights1"] : ["joints", "weights"];
  const locations: Readonly<Record<string, number>> = { joints: 5, weights: 6, joints1: 8, weights1: 9 };
  const jointKinds: ("float" | "uint" | "sint")[] = [];
  for (const semantic of semantics) {
    const attribute = attributes.find((candidate) => candidate.semantic === semantic || candidate.shaderName === `a_${semantic}`);
    if (!attribute || attribute.components !== 4) {
      throw new RenderDeviceError("Skinned shader graph geometry requires four-component joint and weight attributes", "GRAPH_SKINNING_GEOMETRY_UNSUPPORTED", { material: material.name, semantic });
    }
    if (attribute.shaderLocation !== locations[semantic]) {
      throw new RenderDeviceError("Shader graph skinning attribute has an incompatible location", "GRAPH_SKINNING_LOCATION_UNSUPPORTED", { material: material.name, semantic, location: attribute.shaderLocation });
    }
    if (semantic.startsWith("joints") && attribute.normalized) {
      throw new RenderDeviceError("Shader graph joint indices must not be normalized", "GRAPH_SKINNING_INTEGER_ATTRIBUTE_UNSUPPORTED", { material: material.name, semantic });
    }
    if (semantic.startsWith("joints")) {
      if (device.kind === "webgpu" && attribute.type !== "float32" && !attribute.integer) {
        throw new RenderDeviceError("WebGPU joint storage must use an integer shader input", "GRAPH_SKINNING_INTEGER_ATTRIBUTE_UNSUPPORTED", { material: material.name, semantic });
      }
      jointKinds.push(attribute.integer ? (attribute.type.startsWith("uint") ? "uint" : "sint") : "float");
    } else if (attribute.integer || (device.kind === "webgpu" && attribute.type !== "float32" && !attribute.normalized)) {
      throw new RenderDeviceError("Shader graph weights require float or normalized storage", "GRAPH_SKINNING_WEIGHT_ATTRIBUTE_UNSUPPORTED", { material: material.name, semantic });
    }
  }
  const key = material.graphSkinningVariant(item.skinning.extraInfluences ? 8 : 4, jointKinds[0]!, jointKinds[1] ?? "float", "forward");
  if (!key) throw new RenderDeviceError("Shader graph material has no compatible skinning variant", "GRAPH_SKINNING_UNSUPPORTED", { material: material.name });
  return key;
}

/** Graph shadows are per-draw variants so inactive resources consume no slots. */
function graphDrawShaderKey(material: Material, item: RenderItem, device: RenderDevice, shadow: ForwardShadowMapOptions | undefined, lights: readonly CollectedLight[], environment: EnvironmentLightingOptions | undefined, contactMaskScope?: ContactShadowMaskScope): string {
  const base = graphSkinningShaderKey(material, item, device);
  if (!(material instanceof PortableShaderMaterial) || material.graphLightingModel !== "metallic-roughness") return base;
  let mask = 0;
  if (item.receiveShadow !== false && shadow) {
    const directional = lights.some((light) => light.kind === "directional" && light.castsShadow);
    const cascadeCount = shadow.cascades?.length ?? 0;
    if (directional && cascadeCount > 4) throw new RenderDeviceError("Graph shadow receivers support at most four cascades", "GRAPH_CASCADE_CONTRACT", { count: cascadeCount });
    if (directional && cascadeCount > 0) {
      if (shadow.cascades!.some((cascade) => cascade.shadowMap.strength !== 0)) mask |= 16 | ((cascadeCount - 1) << 5);
    } else if (directional && shadow.strength !== 0) mask |= 1;
    if (shadow.pointLight && shadow.pointLight.strength !== 0 && lights.some((light) => light.kind === "point" && light.castsShadow)) mask |= 2;
    if (shadow.spotLight && shadow.spotLight.strength !== 0 && lights.some((light) => light.kind === "spot" && light.castsShadow)) mask |= 4;
    if (shadow.localShadows && shadow.localShadows.strength !== 0 && lights.some((light) => (light as LocalShadowedLight).localShadowSlot !== undefined)) mask |= 8;
  }
  if (contactShadowLightIndex(contactMaskScope, item, lights) >= 0) mask |= 128;
  const probes = prd02ItemProbeBindings(item, device);
  const volume = prd02ItemIrradianceBindings(item, device);
  const taggedProbes = prd02ItemProbeBindings(item);
  const globalCube = graphGlobalEnvironmentCube(environment, taggedProbes ? globalEnvironmentItem(item, taggedProbes) : item);
  const environmentMask = (probes ? 1 : 0) | (volume ? 2 : 0) | (globalCube ? 4 : 0);
  const key = material.graphLightingVariant(base, mask, environmentMask);
  if (!key) throw new RenderDeviceError("Shader graph has no compatible lighting variant", "GRAPH_LIGHTING_VARIANT_UNSUPPORTED", { material: material.name, mask, environmentMask });
  return key;
}

function validateGraphGeometry(material: Material, item: RenderItem, device: RenderDevice): void {
  if (device.kind !== "webgpu" || !(material instanceof PortableShaderMaterial) || !material.graphMaterial) return;
  const locations: Readonly<Record<string, number>> = { a_position: 0, a_normal: 1, a_uv: 2, a_uv1: 7 };
  for (const name of material.requiredAttributes) {
    const location = locations[name];
    if (location === undefined) continue;
    const attribute = item.geometry.vertexBuffer.format.attributes.find((candidate) => candidate.shaderName === name || `a_${candidate.semantic}` === name);
    if (!attribute || attribute.shaderLocation !== location) {
      throw new RenderDeviceError("Shader graph geometry has an incompatible attribute location", "GRAPH_VERTEX_LOCATION_UNSUPPORTED", { material: material.name, attribute: name, location });
    }
  }
}

function supportsInstanceUniforms(shader: RenderShaderProgram): boolean {
  return shader.reflection.uniforms.has("u_instanceMatrices") && shader.reflection.uniforms.has("u_instanceCount");
}

function supportsInstanceAttributes(shader: RenderShaderProgram): boolean {
  return shader.reflection.uniforms.has("u_instanceAttributeMode") &&
    shader.reflection.uniforms.has("u_instanceCount") &&
    INSTANCE_MATRIX_ATTRIBUTE_NAMES.every((name) => shader.reflection.attributes.has(name));
}

/** Map a standard-sense material state to the active frame convention (see `resolveDepthDrawState`). */
export function renderStateForDepthConvention<T extends RenderState>(renderState: T, convention: Pick<DepthConvention, "mode"> | undefined): T {
  return resolveDepthDrawState(renderState, convention);
}

function renderStateForItem(renderState: RenderState, item: RenderItem, usesGeometryMatrix: boolean): RenderState {
  if (renderState.cullMode === "none") return renderState;
  if (!renderItemHasNegativeHandedness(item, usesGeometryMatrix)) return renderState;
  return {
    ...renderState,
    cullMode: renderState.cullMode === "back" ? "front" : "back"
  };
}

/** Winding follows model × geometry for a non-instanced draw. */
export function renderItemHasNegativeHandedness(item: RenderItem, usesGeometryMatrix: boolean): boolean {
  const model = toMat4Values(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
  const geometry = usesGeometryMatrix && item.geometryMatrix
    ? toMat4Values(item.geometryMatrix, "geometryMatrix", item.label) : undefined;
  return hasNegativeHandedness(geometry ? multiplyMat4(model, geometry) : model);
}

export function instancedItemNeedsPerInstanceCullState(item: RenderItem, usesGeometryMatrix: boolean): boolean {
  const source = validateInstanceTransformSource(item);
  const base = toMat4Values(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
  const geometry = usesGeometryMatrix && item.geometryMatrix
    ? toMat4Values(item.geometryMatrix, "geometryMatrix", item.label) : undefined;
  const baseNegative = hasNegativeHandedness(geometry ? multiplyMat4(base, geometry) : base);
  // Allocation-free: a 10,000-instance draw runs this every pass. Only the upper 3x3 of
  // `base * instance` feeds the handedness test, so build it from scalars (same sums as
  // `multiplyMat4`, rows 0..2 / columns 0..2) instead of two arrays per instance.
  for (let offset = 0; offset < source.length; offset += 16) {
    const negative = geometry
      ? hasNegativeHandedness(multiplyMat4(multiplyMat4(base, mat4FromArrayLike(source, offset)), geometry))
      : instanceProductHasNegativeHandedness(base, source, offset);
    if (negative || negative !== baseNegative) return true;
  }
  return false;
}

function instanceProductHasNegativeHandedness(base: Mat4, source: ArrayLike<number>, offset: number): boolean {
  const o = offset;
  const c00 = base[0 * 4 + 0] * source[o]! + base[1 * 4 + 0] * source[o + 1]! + base[2 * 4 + 0] * source[o + 2]! + base[3 * 4 + 0] * source[o + 3]!;
  const c01 = base[0 * 4 + 1] * source[o]! + base[1 * 4 + 1] * source[o + 1]! + base[2 * 4 + 1] * source[o + 2]! + base[3 * 4 + 1] * source[o + 3]!;
  const c02 = base[0 * 4 + 2] * source[o]! + base[1 * 4 + 2] * source[o + 1]! + base[2 * 4 + 2] * source[o + 2]! + base[3 * 4 + 2] * source[o + 3]!;
  const c10 = base[0 * 4 + 0] * source[o + 4]! + base[1 * 4 + 0] * source[o + 5]! + base[2 * 4 + 0] * source[o + 6]! + base[3 * 4 + 0] * source[o + 7]!;
  const c11 = base[0 * 4 + 1] * source[o + 4]! + base[1 * 4 + 1] * source[o + 5]! + base[2 * 4 + 1] * source[o + 6]! + base[3 * 4 + 1] * source[o + 7]!;
  const c12 = base[0 * 4 + 2] * source[o + 4]! + base[1 * 4 + 2] * source[o + 5]! + base[2 * 4 + 2] * source[o + 6]! + base[3 * 4 + 2] * source[o + 7]!;
  const c20 = base[0 * 4 + 0] * source[o + 8]! + base[1 * 4 + 0] * source[o + 9]! + base[2 * 4 + 0] * source[o + 10]! + base[3 * 4 + 0] * source[o + 11]!;
  const c21 = base[0 * 4 + 1] * source[o + 8]! + base[1 * 4 + 1] * source[o + 9]! + base[2 * 4 + 1] * source[o + 10]! + base[3 * 4 + 1] * source[o + 11]!;
  const c22 = base[0 * 4 + 2] * source[o + 8]! + base[1 * 4 + 2] * source[o + 9]! + base[2 * 4 + 2] * source[o + 10]! + base[3 * 4 + 2] * source[o + 11]!;
  // Column-major: matrix[0..2] = c00,c01,c02; [4..6] = c10,c11,c12; [8..10] = c20,c21,c22 (see hasNegativeHandedness).
  const determinant = c00 * (c11 * c22 - c21 * c12) - c10 * (c01 * c22 - c21 * c02) + c20 * (c01 * c12 - c11 * c02);
  return Number.isFinite(determinant) && determinant < -1e-8;
}

function hasInstanceVertexStreams(geometry: Geometry): boolean {
  return geometry.vertexBuffer.format.streams.some((stream) => stream.stepMode === "instance");
}

function expandInstancedRenderItem(item: RenderItem, cameraViewProjection?: Float32Array | readonly number[]): readonly RenderItem[] {
  const source = validateInstanceTransformSource(item);
  const baseModel = toMat4Values(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
  const baseModelViewProjection = item.modelViewProjectionMatrix
    ? toMat4Values(item.modelViewProjectionMatrix, "modelViewProjectionMatrix", item.label)
    : multiplyMat4(toMat4Values(cameraViewProjection ?? identityMatrix(), "cameraViewProjectionMatrix"), baseModel);
  const { instanceTransforms: _instanceTransforms, instanceCount: _instanceCount, normalMatrix: _normalMatrix, ...baseItem } = item;
  const expanded: RenderItem[] = [];
  for (let offset = 0; offset < source.length; offset += 16) {
    const index = offset / 16;
    const instanceMatrix = mat4FromArrayLike(source, offset);
    const modelMatrix = multiplyMat4(baseModel, instanceMatrix);
    expanded.push({
      ...baseItem,
      label: item.label ? `${item.label}#instance-${index}` : undefined,
      modelMatrix: new Float32Array(modelMatrix),
      modelViewProjectionMatrix: new Float32Array(multiplyMat4(baseModelViewProjection, instanceMatrix)),
      normalMatrix: new Float32Array(normalMatrixFromModel(modelMatrix))
    });
  }
  return expanded;
}

function multiplyMat4(left: Mat4, right: Mat4): Mat4 {
  const out = new Array(16).fill(0) as Mat4;
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        left[0 * 4 + row] * right[column * 4 + 0] +
        left[1 * 4 + row] * right[column * 4 + 1] +
        left[2 * 4 + row] * right[column * 4 + 2] +
        left[3 * 4 + row] * right[column * 4 + 3];
    }
  }
  return out;
}

export function normalMatrixFromModel(modelMatrix: Mat4): Mat4 {
  let matrix: Mat4;
  try {
    matrix = transposeMat4(invertMat4(modelMatrix));
  } catch {
    matrix = [...identityMatrix()] as Mat4;
  }
  // WebGL's front-face winding remains CCW when Aura represents a mirrored
  // draw by swapping front/back culling (and double-sided draws do not cull at
  // all). The PBR shaders use gl_FrontFacing to orient double-sided normals, so
  // compensate the inverse-transpose here just as a renderer that flips the
  // native front-face winding would. Without this sign, negatively-scaled glTF
  // meshes receive direct light from the opposite side.
  const handedness = hasNegativeHandedness(modelMatrix) ? -1 : 1;
  return [
    matrix[0] * handedness, matrix[1] * handedness, matrix[2] * handedness, 0,
    matrix[4] * handedness, matrix[5] * handedness, matrix[6] * handedness, 0,
    matrix[8] * handedness, matrix[9] * handedness, matrix[10] * handedness, 0,
    0, 0, 0, 1
  ];
}

function hasNegativeHandedness(matrix: Mat4): boolean {
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
    matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
    matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);
  return Number.isFinite(determinant) && determinant < -1e-8;
}

function transposeMat4(matrix: Mat4): Mat4 {
  return [
    matrix[0], matrix[4], matrix[8], matrix[12],
    matrix[1], matrix[5], matrix[9], matrix[13],
    matrix[2], matrix[6], matrix[10], matrix[14],
    matrix[3], matrix[7], matrix[11], matrix[15]
  ];
}

function invertMat4(matrix: Mat4): Mat4 {
  const [
    a00, a01, a02, a03,
    a10, a11, a12, a13,
    a20, a21, a22, a23,
    a30, a31, a32, a33
  ] = matrix;
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) <= 1e-12 || !Number.isFinite(det)) {
    throw new RenderDeviceError("Instance transform fallback requires invertible model matrices", "INSTANCING_CONTRACT");
  }
  const invDet = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * invDet,
    (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
    (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
    (a22 * b04 - a21 * b05 - a23 * b03) * invDet,
    (a12 * b08 - a10 * b11 - a13 * b07) * invDet,
    (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
    (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
    (a20 * b05 - a22 * b02 + a23 * b01) * invDet,
    (a10 * b10 - a11 * b08 + a13 * b06) * invDet,
    (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
    (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
    (a21 * b02 - a20 * b04 - a23 * b00) * invDet,
    (a11 * b07 - a10 * b09 - a12 * b06) * invDet,
    (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
    (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
    (a20 * b03 - a21 * b01 + a22 * b00) * invDet
  ];
}

export { selectForwardShadowMap } from "./forward/Lighting.js";









export { applyForwardSpotShadowMapUniforms } from "./forward/Lighting.js";







/**
 * Frozen-namespace environment binds (`u_environmentColor` /
 * `u_environmentIntensity` / procedural / sampled), shared by both program
 * families.
 *
 * E3 step 4 (frozen family, bind-level by design): the frozen shaders
 * (ShaderLibraryCore lean PBR + ShaderLibrary duplicates) are fallback-only
 * and their sources must stay byte-identical flag-off, so under the
 * conjunction a frozen draw's stacked terms are suppressed here instead of
 * by shader-body surgery: the procedural diffuse+specular are zeroed, the
 * duplicated ambient is zeroed when a sampled term shades from a
 * non-probe bundle, and absent sampled intensities read 0 (step-3 parity
 * with the generated binder). The sampled term — the single knob under the
 * conjunction — is kept. NOT bind-removable, so deliberately left and
 * UNVERIFIED until the L4 capture: the shader-constant sampled-specular
 * fudges (ShaderLibraryCore `mix(1.1, 0.65, roughness)`, ShaderLibrary
 * `mix(0.84, 0.58, …)` variants) and the extension environment re-add
 * (`a3dPbrExtensionEnvironmentLight` reuses the sampled radiance for its
 * lobes; zeroing it at the bind layer would mean zeroing the material
 * extension factors that also drive direct extension light). Its input is
 * de-stacked (procedural removed) by the zeroing above.
 *
 * E3 step 5 (0.18 at the bind layer): `DEFAULT_PBR_ENVIRONMENT_INTENSITY`
 * (PBRLightingDefaults, public API at index.ts) is a material-constructor
 * default for `u_environmentIntensity`. With an environment present this
 * function overwrites it per draw — always the case on production engine
 * paths, where compileScene's RenderSource resolves through
 * `collectEnvironmentLighting`, which never returns undefined for a
 * RenderSource. It otherwise survives only when the pass has no
 * environment at all: Renderer `Scene`/iterable sources and direct
 * ForwardPass use (both public `@aura3d/rendering` surfaces, not
 * production engine paths). Under the conjunction that branch now binds
 * `u_environmentIntensity = 0` (absent knob means zero, step-3 rule), so
 * the stale constructor default never reaches a conjunction draw; the
 * public constant and every conjunction-off packet are unchanged.
 */
export function applyEnvironmentLightingUniforms(
  environment: EnvironmentLightingOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  e3: { readonly conjunction?: boolean; readonly generated?: boolean } = {}
): void {
  const generatedE3Conjunction = e3.conjunction === true && e3.generated === true;
  const frozenE3Conjunction = e3.conjunction === true && e3.generated !== true;
  if (!environment) {
    clearProceduralEnvironmentMapUniforms(shader, uniforms);
    clearSampledEnvironmentMapUniforms(shader, uniforms);
    clearEnvironmentBrdfLutUniforms(shader, uniforms);
    // E3 step 5: see header note — never let the 0.18 constructor default
    // (or any material-side ambient scalar) survive a no-environment
    // conjunction draw. Conjunction-off the packet is untouched.
    if (e3.conjunction === true && shader.reflection.uniforms.has("u_environmentIntensity")) {
      uniforms.set("u_environmentIntensity", 0);
    }
    return;
  }
  if (!shader.reflection.uniforms.has("u_environmentColor") || !shader.reflection.uniforms.has("u_environmentIntensity")) {
    return;
  }
  const color = environment.color;
  if (color.length !== 3 || !isFiniteColor(color)) {
    throw new RenderDeviceError("Environment lighting color must contain three finite values in [0, 1]", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      color
    });
  }
  if (!Number.isFinite(environment.intensity) || environment.intensity < 0) {
    throw new RenderDeviceError("Environment lighting intensity must be finite and non-negative", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      intensity: environment.intensity
    });
  }
  uniforms.set("u_environmentColor", color);
  uniforms.set("u_environmentIntensity", environment.intensity);
  applyProceduralEnvironmentMapUniforms(environment.proceduralMap, item, shader, uniforms, generatedE3Conjunction);
  const sampledEnvironment = withItemEnvironmentCube(environment, item);
  applySampledEnvironmentMapUniforms(sampledEnvironment, item, shader, uniforms, frozenE3Conjunction);
  if (frozenE3Conjunction) {
    // E3 step 4 frozen suppression (see header note): when a sampled
    // environment is present, procedural terms are zeroed after their
    // validating bind (matching `#ifndef A3D_ENV_SAMPLE` in the generated
    // shader), so conjunction-off packets, procedural-only fallbacks, and
    // error behavior are unchanged. The ambient scalar is a stacked
    // duplicate of the sampled knob only for non-probe bundles with a
    // sampled term: probe-path lighting carries the authored ambient in
    // `intensity` (additive outside IBL, F-02-01), and with no sampled
    // term the ambient and procedural terms remain active.
    const sampledPresent = sampledEnvironment.environmentMapTexture !== undefined
      || sampledEnvironment.environmentCubeMapTexture !== undefined;
    if (sampledPresent) {
      clearProceduralEnvironmentMapUniforms(shader, uniforms);
    }
    if (sampledPresent && !environment.environmentProbe) {
      uniforms.set("u_environmentIntensity", 0);
    }
  }
}

/**
 * #1140: generated-program environment map (`indirect_default` chunk). The
 * legacy binder above only fills the frozen library's `u_environmentMapTexture*`
 * names, so a generated program's sampler used to stay unbound (sampling
 * whatever its texture unit held). Binds whichever sampler the program
 * declares: `u_environmentCubeMap` (ENVMAP_TYPE_CUBE_UV — the prefiltered
 * cube, honouring the per-item probe cube) or `u_environmentMap`
 * (ENVMAP_TYPE_EQUIRECT — the 2D map), plus the shared intensity / rotation /
 * mip range / encoding uniforms.
 */
export function applyGeneratedEnvironmentMapUniforms(
  environment: EnvironmentLightingOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  flags?: QrFlags
): void {
  const cube = shader.reflection.uniforms.has("u_environmentCubeMap");
  if (!cube && !shader.reflection.uniforms.has("u_environmentMap")) return;
  const env = environment ? withItemEnvironmentCube(environment, item) : undefined;
  const binding = cube ? env?.environmentCubeMapTexture : env?.environmentMapTexture;
  if (!env || !binding?.texture) {
    // forwardPassFeatureAxes never selects a sampler whose texture is absent;
    // a stale program draws with no environment contribution, never garbage.
    uniforms.set("u_environmentMapIntensity", 0);
    return;
  }
  const dimension = cube ? "cube" : "2d";
  validateEnvironmentTextureBinding(cube ? "Environment cube map texture" : "Environment map texture", binding, dimension, item);
  // E3 stage-2b (step 3): under the conjunction the stage-2a knob is the
  // only IBL intensity source — an absent field means zero, never the
  // legacy absent-field default of 1. Conjunction-off keeps `?? 1`.
  const intensity = flags !== undefined && qrE3CompilerLightingOn(flags)
    ? env.environmentMapIntensity ?? 0
    : env.environmentMapIntensity ?? 1;
  const rotation = env.environmentMapRotation ?? 0;
  const mipCount = env.environmentMapMipCount ?? 1;
  const encoding = env.environmentMapEncoding ?? "srgb";
  if (!Number.isFinite(intensity) || intensity < 0 || !Number.isFinite(rotation) || !Number.isInteger(mipCount) || mipCount < 1) {
    throw new RenderDeviceError("Sampled environment map options are invalid", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      intensity,
      rotation,
      mipCount
    });
  }
  const name = cube ? "u_environmentCubeMap" : "u_environmentMap";
  uniforms.set(name, new TextureBinding({
    name,
    texture: binding.texture,
    sampler: binding.sampler,
    required: true,
    ready: binding.ready,
    expectedColorSpace: binding.expectedColorSpace,
    expectedDimension: dimension
  }));
  uniforms.set("u_environmentMapIntensity", intensity);
  uniforms.set("u_environmentMapRotation", rotation);
  uniforms.set("u_environmentMapMaxLod", Math.max(mipCount - 1, 0));
  uniforms.set("u_environmentMapEncoding", encoding === "rgbe" ? 1 : encoding === "linear" ? 2 : 0);
}

/**
 * Generated-program procedural environment (`indirect_default` LIGHT_HEMISPHERE
 * block). Same validation as the frozen binder below, under the generator's
 * own `u_a3dProcedural*` names; a program compiled for a procedural map whose
 * environment no longer has one draws with zero procedural contribution.
 */
export function applyGeneratedProceduralEnvironmentUniforms(
  environment: EnvironmentLightingOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  suppressProcedural = false
): void {
  if (!shader.reflection.uniforms.has("u_a3dProceduralIntensity")) return;
  // E3 stage-2b: a PRD-02-IBL draw takes no procedural term at all (the
  // stage-2a knob already zeroed it in the bundle; bare-path bundles are
  // zeroed here so the sampled/probe term can never double-count).
  if (suppressProcedural) {
    uniforms.set("u_a3dProceduralIntensity", 0);
    uniforms.set("u_a3dProceduralSpecularIntensity", 0);
    return;
  }
  const proceduralMap = environment?.proceduralMap;
  if (!proceduralMap) {
    uniforms.set("u_a3dProceduralIntensity", 0);
    uniforms.set("u_a3dProceduralSpecularIntensity", 0);
    return;
  }
  if (!Number.isFinite(proceduralMap.intensity) || proceduralMap.intensity < 0
    || !Number.isFinite(proceduralMap.specularIntensity) || proceduralMap.specularIntensity < 0) {
    throw new RenderDeviceError("Procedural environment map intensities must be finite and non-negative", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      intensity: proceduralMap.intensity,
      specularIntensity: proceduralMap.specularIntensity
    });
  }
  uniforms.set("u_a3dProceduralSkyColor", toEnvironmentColor(proceduralMap.skyColor, "proceduralMap.skyColor", item.label));
  uniforms.set("u_a3dProceduralHorizonColor", toEnvironmentColor(proceduralMap.horizonColor, "proceduralMap.horizonColor", item.label));
  uniforms.set("u_a3dProceduralGroundColor", toEnvironmentColor(proceduralMap.groundColor, "proceduralMap.groundColor", item.label));
  uniforms.set("u_a3dProceduralSpecularColor", toEnvironmentColor(proceduralMap.specularColor, "proceduralMap.specularColor", item.label));
  uniforms.set("u_a3dProceduralIntensity", proceduralMap.intensity);
  uniforms.set("u_a3dProceduralSpecularIntensity", proceduralMap.specularIntensity);
}

/**
 * E3 stage-2b: `prd02.ibl` can only shade when a real SH-bearing C-09
 * probe exists (27-float `sh9`, the probe contract length). A cube-only
 * source — a scene `environmentCubeMapTexture` or a per-item
 * `environmentCube` with no SH — must NOT select the replacement body:
 * the pack would bind zeroed SH and diffuse IBL would vanish, where the
 * default indirect body samples that cube for diffuse. Such draws keep
 * the default body (which already honours the selected cube via
 * `withItemEnvironmentCube`). A per-item cube still wins for specular
 * when a scene SH probe exists (see the pack below); `_item` is kept in
 * the signature so the draw path and the Renderer warmup share one gate
 * and their program keys agree on the feature bit.
 */
export function prd02IblEnvironmentAvailable(
  environment: EnvironmentLightingOptions | undefined,
  _item?: RenderItem
): boolean {
  return environment?.environmentProbe?.sh9?.length === 27;
}

/**
 * E3 stage-2b bind site for the PRD-02 IBL chunk: packs
 * `packA3DEnvironmentUniforms` (previously zero production callers) from the
 * pass environment and writes it into the draw's uniform packet.
 *
 * Single intensity source (step 3): diffuse/specular intensities are the
 * stage-2a knob (`environmentMapIntensity` /
 * `environmentMapSpecularIntensity`, authored-equal under the conjunction;
 * an absent field is 0, never a legacy default), multiplied ONCE by the
 * per-material `envMapIntensity` (`u_materialEnvironmentIntensity`, kept as
 * a multiplier pending the owner decision). No preset scalar stack is read
 * here. Ambient rides `color`/`intensity` (under the probe path these are
 * the authored-ambient term, additive outside IBL per F-02-01); hemisphere
 * is not passed — the probe SH already carries sky/ground, and the
 * procedural map is suppressed on this path.
 *
 * Frozen-family scoping (step 1): this bind runs only for generated draws
 * that selected `prd02.ibl`. The frozen shader family (ShaderLibraryCore
 * lean PBR + ShaderLibrary duplicates) serves fallback-only draws
 * (unskinnable skinned items, compile failure, binding failure); since
 * step 4 those draws get bind-level suppression of their stacked terms in
 * `applyEnvironmentLightingUniforms` under the conjunction, while
 * conjunction-off every draw stays byte-identical.
 */
export function applyPrd02EnvironmentUniforms(
  environment: EnvironmentLightingOptions | undefined,
  item: RenderItem,
  material: Material | MaterialInstance,
  uniforms: Map<string, UniformValue>
): void {
  const env = environment ? withItemEnvironmentCube(environment, item) : undefined;
  const cubeTexture = env?.environmentCubeMapTexture?.texture ?? undefined;
  const sceneProbe = env?.environmentProbe ?? null;
  // A selected per-item cube (`withItemEnvironmentCube` already folded it
  // into `env.environmentCubeMapTexture`, e.g. from
  // `applyProbeEnvironmentCubes`) wins for specular; diffuse SH still
  // comes from the scene probe — the item cube carries no SH of its own.
  const selectedCubeMips = cubeTexture?.cubeFaces[0]?.mipLevels.length;
  const probe = sceneProbe && cubeTexture && cubeTexture.dimension === "cube" && cubeTexture !== sceneProbe.specularCube
    ? {
        specularCube: cubeTexture,
        mipCount: item.environmentCubeMip
          ?? (selectedCubeMips !== undefined && selectedCubeMips > 0
            ? selectedCubeMips
            : env?.environmentMapMipCount ?? sceneProbe.mipCount),
        sh9: sceneProbe.sh9
      }
    : sceneProbe
      ?? (cubeTexture
        ? {
            specularCube: cubeTexture,
            mipCount: env?.environmentMapMipCount ?? Math.max(1, cubeTexture.cubeFaces[0]?.mipLevels.length ?? 1),
            sh9: new Float32Array(0)
          }
        : null);
  const knobDiffuse = env?.environmentMapIntensity ?? 0;
  const knobSpecular = env?.environmentMapSpecularIntensity ?? knobDiffuse;
  // Effective (instance-overridden) multiplier, resolved the way the
  // generated binding resolved it: `MaterialBinding.bindGenerated` fills
  // this packet from `materialLike.getParameters()`, and
  // `MaterialInstance.getParameter` is override-first. Prefer the value
  // already bound into the packet; fall back to asking the material
  // itself (never the stripped base material) for direct callers.
  const boundMultiplier = uniforms.get("u_materialEnvironmentIntensity");
  const materialMultiplierRaw = typeof boundMultiplier === "number"
    ? boundMultiplier
    : material.getParameter?.("u_materialEnvironmentIntensity");
  const materialMultiplier = typeof materialMultiplierRaw === "number" && Number.isFinite(materialMultiplierRaw) && materialMultiplierRaw >= 0
    ? materialMultiplierRaw
    : 1;
  if (!Number.isFinite(knobDiffuse) || knobDiffuse < 0 || !Number.isFinite(knobSpecular) || knobSpecular < 0) {
    throw new RenderDeviceError("PRD-02 IBL knob intensities must be finite and non-negative", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      knobDiffuse,
      knobSpecular
    });
  }
  const packed = packA3DEnvironmentUniforms({
    probe,
    ...(env ? prd02AmbientAndHemisphere(env) : {}),
    // EnvironmentLightingOptions rotation is in turns (indirect_default);
    // the PRD-02 chunk's u_envRotation is radians.
    rotation: (env?.environmentMapRotation ?? 0) * Math.PI * 2,
    diffuseIntensity: knobDiffuse * materialMultiplier,
    specularIntensity: knobSpecular * materialMultiplier
  });
  for (const [name, value] of packed.uniforms) uniforms.set(name, value);
  // The chunk declares `u_envDfgLut` (its own split-sum entry, unused by the
  // stage-2b call body, which routes through the r185 multiscatter helpers);
  // bind the renderer DFG LUT so the sampler never reads a stale unit.
  uniforms.set("u_envDfgLut", new TextureBinding({
    name: "u_envDfgLut",
    texture: dfgLutTexture(),
    sampler: dfgLutBinding().sampler,
    expectedColorSpace: "linear"
  }));
}

/**
 * LIGHT-05/08: splits the pass ambient (which carries the hemisphere's flat mean for the programs that read only
 * the ambient scalar) back into the constant ambient and the directional hemisphere pair for the PRD-02 chunk.
 * With no hemisphere the ambient is passed through unchanged (byte-identical packet).
 */
export function prd02AmbientAndHemisphere(env: EnvironmentLightingOptions): {
  readonly ambient: { readonly color: readonly [number, number, number]; readonly intensity: number };
  readonly hemisphere?: { readonly sky: readonly [number, number, number]; readonly ground: readonly [number, number, number]; readonly intensity: number; readonly direction: readonly [number, number, number] };
} {
  const hemi = env.hemisphere;
  if (!hemi) return { ambient: { color: env.color, intensity: env.intensity } };
  const rest: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const value = env.color[i]! * env.intensity - (hemi.sky[i]! + hemi.ground[i]!) / 2;
    // Float residue of the add-then-subtract round trip is clamped; a real ambient is never negative.
    rest[i] = value > 1e-7 ? value : 0;
  }
  return {
    ambient: { color: rest, intensity: 1 },
    hemisphere: { sky: hemi.sky, ground: hemi.ground, intensity: 1, direction: hemi.direction }
  };
}

function applyProceduralEnvironmentMapUniforms(
  proceduralMap: ProceduralEnvironmentMapLightingOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  generatedE3Conjunction = false
): void {
  if (!proceduralMap) {
    clearProceduralEnvironmentMapUniforms(shader, uniforms);
    return;
  }
  const requiredUniforms = [
    "u_environmentSkyColor",
    "u_environmentHorizonColor",
    "u_environmentGroundColor",
    "u_environmentSpecularColor",
    "u_environmentMapIntensity",
    "u_environmentSpecularIntensity"
  ];
  if (!requiredUniforms.every((uniform) => shader.reflection.uniforms.has(uniform))) {
    return;
  }
  const skyColor = toEnvironmentColor(proceduralMap.skyColor, "proceduralMap.skyColor", item.label);
  const horizonColor = toEnvironmentColor(proceduralMap.horizonColor, "proceduralMap.horizonColor", item.label);
  const groundColor = toEnvironmentColor(proceduralMap.groundColor, "proceduralMap.groundColor", item.label);
  const specularColor = toEnvironmentColor(proceduralMap.specularColor, "proceduralMap.specularColor", item.label);
  if (!Number.isFinite(proceduralMap.intensity) || proceduralMap.intensity < 0) {
    throw new RenderDeviceError("Procedural environment map intensity must be finite and non-negative", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      intensity: proceduralMap.intensity
    });
  }
  if (!Number.isFinite(proceduralMap.specularIntensity) || proceduralMap.specularIntensity < 0) {
    throw new RenderDeviceError("Procedural environment map specularIntensity must be finite and non-negative", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      specularIntensity: proceduralMap.specularIntensity
    });
  }
  uniforms.set("u_environmentSkyColor", skyColor);
  uniforms.set("u_environmentHorizonColor", horizonColor);
  uniforms.set("u_environmentGroundColor", groundColor);
  uniforms.set("u_environmentSpecularColor", specularColor);
  // E3 stage-2b (step 3): `u_environmentMapIntensity` is the generated
  // program's SAMPLED-map (knob) uniform; the frozen namespace reuses the
  // same name for its procedural diffuse. On a generated conjunction draw
  // the procedural write is dropped so the knob owns the name outright.
  // Frozen draws keep this legacy write here; step 4 zeroes it afterwards
  // in applyEnvironmentLightingUniforms on frozen conjunction draws.
  if (!generatedE3Conjunction) {
    uniforms.set("u_environmentMapIntensity", proceduralMap.intensity);
  }
  uniforms.set("u_environmentSpecularIntensity", proceduralMap.specularIntensity);
}

function clearProceduralEnvironmentMapUniforms(
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (shader.reflection.uniforms.has("u_environmentMapIntensity")) {
    uniforms.set("u_environmentMapIntensity", 0);
  }
  if (shader.reflection.uniforms.has("u_environmentSpecularIntensity")) {
    uniforms.set("u_environmentSpecularIntensity", 0);
  }
}

/**
 * PRD-02 S12 (lane-01 half): a RenderItem's `environmentCube` (a captured
 * reflection probe) replaces the scene environment's cube for that draw only.
 * Items without one get `environment` back unchanged (same object).
 */
function withItemEnvironmentCube(environment: EnvironmentLightingOptions, item: RenderItem): EnvironmentLightingOptions {
  if (!item.environmentCube) return environment;
  // threejs-parity SC-01: the scene's sampled-environment knobs describe the
  // scene environment map, not a draw's own cube. three's `material.envMap`
  // ignores `scene.environmentIntensity`, so a cube-camera binding
  // (`item.cubeCameraEnvMap`) reflects at the material's own intensity, and any
  // other per-draw cube on a scene with no sampled environment (the compiler
  // fills explicit 0s) must not be scaled to nothing either.
  const sceneHasSampledEnvironment = environment.environmentMapTexture !== undefined
    || environment.environmentCubeMapTexture !== undefined
    || (environment.environmentProbe ?? null) !== null;
  const ownsEnvMap = item.cubeCameraEnvMap !== undefined;
  return {
    ...environment,
    ...(ownsEnvMap || !sceneHasSampledEnvironment ? { environmentMapIntensity: 1, environmentMapSpecularIntensity: 1 } : {}),
    environmentCubeMapTexture: item.environmentCube,
    ...(item.environmentCubeMip !== undefined ? { environmentMapMipCount: item.environmentCubeMip } : {})
  };
}

function applySampledEnvironmentMapUniforms(
  environment: EnvironmentLightingOptions,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  frozenE3Conjunction = false
): void {
  const environmentMapTexture = environment.environmentMapTexture;
  const environmentCubeMapTexture = environment.environmentCubeMapTexture;
  if (!environmentMapTexture && !environmentCubeMapTexture) {
    clearSampledEnvironmentMapUniforms(shader, uniforms);
    clearEnvironmentBrdfLutUniforms(shader, uniforms);
    return;
  }
  const requiredUniforms = [
    "u_environmentMapTexture",
    "u_environmentMapTextureEnabled",
    "u_environmentMapTextureIntensity",
    "u_environmentMapTextureSpecularIntensity",
    "u_environmentMapTextureRotation",
    "u_environmentMapTextureMipCount"
  ];
  if (!requiredUniforms.every((uniform) => shader.reflection.uniforms.has(uniform))) {
    return;
  }
  if (environmentMapTexture) {
    validateEnvironmentTextureBinding("Environment map texture", environmentMapTexture, "2d", item);
  }
  if (environmentCubeMapTexture) {
    validateEnvironmentTextureBinding("Environment cube map texture", environmentCubeMapTexture, "cube", item);
  }
  // E3 step 4: on a frozen conjunction draw an absent sampled intensity
  // is zero (single-knob rule, step-3 parity with the generated binder),
  // never the legacy absent-field defaults of 1 / 0.5.
  const intensity = frozenE3Conjunction ? environment.environmentMapIntensity ?? 0 : environment.environmentMapIntensity ?? 1;
  const specularIntensity = frozenE3Conjunction ? environment.environmentMapSpecularIntensity ?? 0 : environment.environmentMapSpecularIntensity ?? 0.5;
  const rotation = environment.environmentMapRotation ?? 0;
  const mipCount = environment.environmentMapMipCount ?? 1;
  const encoding = environment.environmentMapEncoding ?? "srgb";
  if (!Number.isFinite(intensity) || intensity < 0) {
    throw new RenderDeviceError("Sampled environment map intensity must be finite and non-negative", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      intensity
    });
  }
  if (!Number.isFinite(specularIntensity) || specularIntensity < 0) {
    throw new RenderDeviceError("Sampled environment map specular intensity must be finite and non-negative", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      specularIntensity
    });
  }
  if (!Number.isFinite(rotation)) {
    throw new RenderDeviceError("Sampled environment map rotation must be finite", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      rotation
    });
  }
  if (!Number.isInteger(mipCount) || mipCount < 1) {
    throw new RenderDeviceError("Sampled environment map mip count must be a positive integer", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      mipCount
    });
  }
  if (encoding !== "srgb" && encoding !== "rgbe" && encoding !== "linear") {
    throw new RenderDeviceError("Sampled environment map encoding must be srgb, rgbe, or linear", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      encoding
    });
  }
  uniforms.set(
    "u_environmentMapTexture",
    environmentMapTexture ?? new TextureBinding({ name: "u_environmentMapTexture", required: false, expectedDimension: "2d" })
  );
  if (shader.reflection.uniforms.has("u_environmentCubeMapTexture")) {
    uniforms.set(
      "u_environmentCubeMapTexture",
      environmentCubeMapTexture ?? new TextureBinding({ name: "u_environmentCubeMapTexture", required: false, expectedDimension: "cube" })
    );
  }
  uniforms.set("u_environmentMapTextureEnabled", 1);
  if (shader.reflection.uniforms.has("u_environmentCubeMapTextureEnabled")) {
    uniforms.set("u_environmentCubeMapTextureEnabled", environmentCubeMapTexture ? 1 : 0);
  }
  uniforms.set("u_environmentMapTextureIntensity", intensity);
  uniforms.set("u_environmentMapTextureSpecularIntensity", specularIntensity);
  uniforms.set("u_environmentMapTextureRotation", rotation);
  uniforms.set("u_environmentMapTextureMipCount", mipCount);
  if (shader.reflection.uniforms.has("u_environmentMapTextureEncoding")) {
    uniforms.set("u_environmentMapTextureEncoding", encoding === "rgbe" ? 1 : encoding === "linear" ? 2 : 0);
  }
  applyEnvironmentBrdfLutUniforms(environment, item, shader, uniforms);
}

function clearSampledEnvironmentMapUniforms(
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (shader.reflection.uniforms.has("u_environmentMapTexture")) {
    uniforms.set("u_environmentMapTexture", new TextureBinding({ name: "u_environmentMapTexture", required: false, expectedDimension: "2d" }));
  }
  if (shader.reflection.uniforms.has("u_environmentCubeMapTexture")) {
    uniforms.set("u_environmentCubeMapTexture", new TextureBinding({ name: "u_environmentCubeMapTexture", required: false, expectedDimension: "cube" }));
  }
  if (shader.reflection.uniforms.has("u_environmentMapTextureEnabled")) {
    uniforms.set("u_environmentMapTextureEnabled", 0);
  }
  if (shader.reflection.uniforms.has("u_environmentCubeMapTextureEnabled")) {
    uniforms.set("u_environmentCubeMapTextureEnabled", 0);
  }
  if (shader.reflection.uniforms.has("u_environmentMapTextureIntensity")) {
    uniforms.set("u_environmentMapTextureIntensity", 0);
  }
  if (shader.reflection.uniforms.has("u_environmentMapTextureSpecularIntensity")) {
    uniforms.set("u_environmentMapTextureSpecularIntensity", 0);
  }
  if (shader.reflection.uniforms.has("u_environmentMapTextureEncoding")) {
    uniforms.set("u_environmentMapTextureEncoding", 0);
  }
}

function validateEnvironmentTextureBinding(
  label: string,
  binding: TextureBinding,
  expectedDimension: "2d" | "cube",
  item: RenderItem
): void {
  const validation = binding.validate();
  if (!validation.ok) {
    throw new RenderDeviceError(`${label} binding validation failed`, "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      diagnostics: validation.diagnostics
    });
  }
  if (binding.texture?.dimension !== expectedDimension) {
    throw new RenderDeviceError(`${label} must bind a ${expectedDimension} texture`, "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      texture: binding.name,
      expectedDimension,
      actualDimension: binding.texture?.dimension ?? null
    });
  }
}

function applyEnvironmentBrdfLutUniforms(
  environment: EnvironmentLightingOptions,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!environment.environmentBrdfLutTexture) {
    clearEnvironmentBrdfLutUniforms(shader, uniforms);
    return;
  }
  if (!shader.reflection.uniforms.has("u_environmentBrdfLutTexture") || !shader.reflection.uniforms.has("u_environmentBrdfLutEnabled")) {
    return;
  }
  const validation = environment.environmentBrdfLutTexture.validate();
  if (!validation.ok) {
    throw new RenderDeviceError("Environment BRDF LUT texture binding validation failed", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label: item.label,
      diagnostics: validation.diagnostics
    });
  }
  uniforms.set("u_environmentBrdfLutTexture", environment.environmentBrdfLutTexture);
  uniforms.set("u_environmentBrdfLutEnabled", 1);
}

function clearEnvironmentBrdfLutUniforms(
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (shader.reflection.uniforms.has("u_environmentBrdfLutTexture")) {
    uniforms.set("u_environmentBrdfLutTexture", new TextureBinding({ name: "u_environmentBrdfLutTexture", required: false }));
  }
  if (shader.reflection.uniforms.has("u_environmentBrdfLutEnabled")) {
    uniforms.set("u_environmentBrdfLutEnabled", 0);
  }
}

function toEnvironmentColor(value: readonly number[], field: string, label?: string): readonly number[] {
  if (value.length !== 3 || !isFiniteColor(value)) {
    throw new RenderDeviceError("Procedural environment map colors must contain three finite values in [0, 1]", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label,
      field,
      color: value
    });
  }
  return value;
}

function applyCameraUniforms(
  cameraPosition: readonly [number, number, number] | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!shader.reflection.uniforms.has("u_cameraPosition")) return;
  const position = cameraPosition ?? [0, 0, 1];
  if (position.length !== 3 || position.some((value) => !Number.isFinite(value))) {
    throw new RenderDeviceError("Forward pass camera position must be a finite vec3", "FORWARD_CAMERA_CONTRACT", {
      label: item.label,
      cameraPosition: [...position]
    });
  }
  uniforms.set("u_cameraPosition", [...position]);
}

function applyAlphaCutoffUniform(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!shader.reflection.uniforms.has("u_alphaCutoff") || uniforms.has("u_alphaCutoff")) return;
  uniforms.set("u_alphaCutoff", 0);
}

/**
 * Wrinkle-detail intensity (E1 face-rig demo): mirrors the morph-uniform pattern — only
 * shaders declaring `u_wrinkleStrength` are touched, and an absent item value uploads 0,
 * which every such shader treats as "today's rendering exactly".
 */
function applyWrinkleUniform(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!shader.reflection.uniforms.has("u_wrinkleStrength") || uniforms.has("u_wrinkleStrength")) return;
  const strength = item.wrinkleStrength ?? 0;
  uniforms.set("u_wrinkleStrength", Number.isFinite(strength) ? Math.max(0, strength) : 0);
}

function applyTransformUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  cameraViewProjection: Float32Array | readonly number[] | undefined,
  graphMaterial: boolean
): void {
  const modelMatrix = shader.reflection.uniforms.has("u_modelMatrix") || shader.reflection.uniforms.has("u_normalMatrix")
    ? toMat4Uniform(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label)
    : undefined;
  if (item.modelViewProjectionMatrix && shader.reflection.uniforms.has("u_modelViewProjection")) {
    uniforms.set("u_modelViewProjection", toMat4Uniform(item.modelViewProjectionMatrix, "modelViewProjectionMatrix", item.label));
  } else if (graphMaterial && shader.reflection.uniforms.has("u_modelViewProjection")) {
    const camera = toMat4Values(cameraViewProjection ?? identityMatrix(), "cameraViewProjectionMatrix");
    const model = toMat4Values(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
    uniforms.set("u_modelViewProjection", new Float32Array(multiplyMat4(camera, model)));
  }
  if (modelMatrix && shader.reflection.uniforms.has("u_modelMatrix")) {
    uniforms.set("u_modelMatrix", modelMatrix);
  }
  if (shader.reflection.uniforms.has("u_geometryMatrix")) {
    uniforms.set(
      "u_geometryMatrix",
      toMat4Uniform(item.geometryMatrix ?? identityMatrix(), "geometryMatrix", item.label)
    );
  }
  if (shader.reflection.uniforms.has("u_normalMatrix")) {
    uniforms.set(
      "u_normalMatrix",
      item.normalMatrix
        ? toMat4Uniform(item.normalMatrix, "normalMatrix", item.label)
        : new Float32Array(normalMatrixFromModel(toMat4Values(modelMatrix ?? identityMatrix(), "modelMatrix", item.label)))
    );
  }
}

/**
 * threejs-parity SH-02 — frame-scoped built-ins for `material.custom` programs
 * (`u_time`, `u_resolution`, `u_viewMatrix`, `u_projectionMatrix`). Every bind
 * is guarded by reflection so non-custom programs render exactly as before;
 * when a value is unavailable the uniform simply stays unbound (the adapter
 * documents which names are populated).
 */
function applyCustomShaderFrameUniforms(
  options: ForwardPassOptions,
  frameWidth: number,
  frameHeight: number,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const reflected = shader.reflection.uniforms;
  if (reflected.has("u_time") && !uniforms.has("u_time")) {
    uniforms.set("u_time", options.timeSeconds ?? 0);
  }
  if (reflected.has("u_resolution") && !uniforms.has("u_resolution")) {
    uniforms.set("u_resolution", [Math.max(1, frameWidth), Math.max(1, frameHeight)]);
  }
  if (reflected.has("u_viewMatrix") && !uniforms.has("u_viewMatrix")) {
    uniforms.set("u_viewMatrix", toMat4Uniform(options.customFrameCamera?.viewMatrix ?? options.cameraViewMatrix ?? identityMatrix(), "cameraViewMatrix"));
  }
  if (reflected.has("u_a3dSunDirection") && !uniforms.has("u_a3dSunDirection")) {
    // `#include <a3d_shadow>` and the GU47 sun built-ins: direction from the surface toward the sun (the shadow-casting
    // directional light, else the first directional light; straight up when the scene has none).
    const d = customShaderSun(options.lights)?.direction ?? [0, -1, 0];
    const length = Math.hypot(d[0], d[1], d[2]) || 1;
    uniforms.set("u_a3dSunDirection", [-d[0] / length, -d[1] / length, -d[2] / length]);
  }
  if (reflected.has("u_projectionMatrix") && !uniforms.has("u_projectionMatrix")) {
    uniforms.set("u_projectionMatrix", toMat4Uniform(options.customFrameCamera?.projectionMatrix ?? options.auraFrameCamera?.projectionMatrix ?? identityMatrix(), "auraFrameCamera.projectionMatrix"));
  }
  // GU47 E-D: `instanceMatrix` / `instanceColor` read identity / white on a non-instanced draw (the instanced path sets 1).
  if (reflected.has("u_a3dInstancing") && !uniforms.has("u_a3dInstancing")) uniforms.set("u_a3dInstancing", 0);
}

/** The light the custom-shader sun built-ins describe: the shadow-casting directional light, else the first directional one. */
function customShaderSun(lights: readonly CollectedLight[] | undefined): CollectedLight | undefined {
  return lights?.find((light) => light.castsShadow && light.kind === "directional") ?? lights?.find((light) => light.kind === "directional");
}

/** Exp2 density whose fog reaches 98% at `far`, so a linear-fog scene still gives `u_a3dFogDensity` a matching value. */
const LINEAR_FOG_EXP2_EQUIVALENT = Math.sqrt(-Math.log(0.02));

/**
 * GU47 E-D (PRD §3.1): lighting built-ins for `material.custom` programs, each bound only when the program reflects it:
 *   - `u_a3dSunColor` (linear rgb) / `u_a3dSunIntensity`: the sun `u_a3dSunDirection` points at (0 when there is none).
 *   - `u_a3dHemiSky` / `u_a3dHemiGround`: the authored hemisphere pair (linear rgb, premultiplied by intensity; 0 when none).
 *   - `u_a3dFogColor` / `u_a3dFogDensity`: the scene fog for this draw (exp2 density; a linear fog gets the density that
 *     reaches 98% at `far`; 0 when the scene has no fog or the material opts out with `fog: false`).
 *   - `u_lightCount` / `u_lightData`: the packed direct lights `#include <a3d_lights>` loops over (same packing as the
 *     built-in lit programs; the clustered textures are bound by `applyClusteredLightingUniforms`).
 *   - `u_a3dInverseViewProjection`: inverse(projection * view) of the camera the other custom built-ins describe, for
 *     `a3dFragWorldPosition()`.
 *   - `#include <a3d_ibl>`: `u_a3dEnvAmbient` (environment colour * intensity), `u_a3dEnvSh` / `u_a3dEnvShEnabled` (the
 *     scene probe's SH9), `u_a3dEnvSky` / `u_a3dEnvHorizon` / `u_a3dEnvGround` (procedural map * intensity) and the
 *     equirect `u_a3dEnvMap` with `u_a3dEnvMapEnabled` / `Intensity` / `Rotation` / `MaxLod` / `Encoding` (same values the
 *     generated programs' `u_environmentMap*` get; the white fallback with enabled 0 when the scene has none).
 */
export function applyCustomShaderLightingUniforms(
  options: Pick<ForwardPassOptions, "lights" | "environmentLighting">,
  fog: ForwardEnvironmentFogOptions | false | undefined,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>,
  frame: CustomShaderFrameCache
): void {
  const reflected = shader.reflection.uniforms;
  const wants = (name: string) => reflected.has(name) && !uniforms.has(name);
  if (wants("u_a3dInverseViewProjection")) uniforms.set("u_a3dInverseViewProjection", frame.inverseViewProjection());
  applyCustomShaderEnvironmentUniforms(options.environmentLighting, wants, uniforms);
  if (wants("u_a3dSunColor") || wants("u_a3dSunIntensity")) {
    const sun = customShaderSun(options.lights);
    if (wants("u_a3dSunColor")) uniforms.set("u_a3dSunColor", sun ? [sun.color[0], sun.color[1], sun.color[2]] : [0, 0, 0]);
    if (wants("u_a3dSunIntensity")) uniforms.set("u_a3dSunIntensity", sun && Number.isFinite(sun.intensity) ? Math.max(0, sun.intensity) : 0);
  }
  const hemisphere = options.environmentLighting?.hemisphere;
  if (wants("u_a3dHemiSky")) uniforms.set("u_a3dHemiSky", hemisphere ? [...hemisphere.sky] : [0, 0, 0]);
  if (wants("u_a3dHemiGround")) uniforms.set("u_a3dHemiGround", hemisphere ? [...hemisphere.ground] : [0, 0, 0]);
  if (wants("u_a3dFogColor")) uniforms.set("u_a3dFogColor", fog ? Array.from(fog.color) : [0, 0, 0]);
  if (wants("u_a3dFogDensity")) {
    const density = !fog ? 0
      : fog.mode === "linear" ? (Number.isFinite(fog.far) && fog.far > 0 ? LINEAR_FOG_EXP2_EQUIVALENT / fog.far : 0)
        : Math.max(0, Number.isFinite(fog.density) ? fog.density : 0);
    uniforms.set("u_a3dFogDensity", density);
  }
  if (wants("u_lightCount") || wants("u_lightData")) {
    const packed = frame.lights();
    if (wants("u_lightCount")) uniforms.set("u_lightCount", packed.lightCount);
    if (wants("u_lightData")) uniforms.set("u_lightData", packed.data);
  }
}

/** GU47 E-D: per-execute values shared by every `material.custom` draw (computed on first use). */
export interface CustomShaderFrameCache {
  /** The packed direct lights (`LightUniforms.pack`). */
  lights(): ReturnType<typeof LightUniforms.pack>;
  /** inverse(projection * view) of the custom built-ins' camera (`customShaderInverseViewProjection`). */
  inverseViewProjection(): Float32Array;
}

/** inverse(projection * view) of the camera `applyCustomShaderFrameUniforms` binds as `u_projectionMatrix` / `u_viewMatrix`. */
export function customShaderInverseViewProjection(
  options: Pick<ForwardPassOptions, "customFrameCamera" | "cameraViewMatrix" | "auraFrameCamera">,
  depth?: Pick<DepthConvention, "mode" | "clipRange">
): Float32Array {
  const view = Array.from(options.customFrameCamera?.viewMatrix ?? options.cameraViewMatrix ?? identityMatrix());
  const projection = Array.from(options.customFrameCamera?.projectionMatrix ?? options.auraFrameCamera?.projectionMatrix ?? identityMatrix());
  if (view.length !== 16 || projection.length !== 16 || !isFiniteArrayLike(view) || !isFiniteArrayLike(projection)) return new Float32Array(identityMatrix());
  try {
    const viewProjection = Array.from(multiplyMat4(projection as Mat4, view as Mat4));
    // `a3dFragWorldPosition` decodes gl_FragCoord.z * 2 - 1. A WebGL2 reversed zero-to-one frame (EXT_clip_control) stores
    // clip z / w directly, so the z row r is re-expressed as 2r - w; minus-one-to-one frames (standard or reversed) already match.
    if (depth?.mode === "reversed" && depth.clipRange === "zero-to-one") {
      for (let column = 0; column < 4; column++) viewProjection[column * 4 + 2] = 2 * viewProjection[column * 4 + 2]! - viewProjection[column * 4 + 3]!;
    }
    const inverse = invertMat4(viewProjection as Mat4);
    return new Float32Array(isFiniteArrayLike(inverse) ? inverse : identityMatrix());
  } catch {
    // Singular camera (degenerate projection): `a3dFragWorldPosition` reads clip space instead of NaN.
    return new Float32Array(identityMatrix());
  }
}

const ZERO_SH9 = new Float32Array(27);
const CUSTOM_ENV_MAP_FALLBACK = new TextureBinding({ name: "u_a3dEnvMap", required: false });

/** `#include <a3d_ibl>` uniforms (see `applyCustomShaderLightingUniforms`). */
function applyCustomShaderEnvironmentUniforms(
  environment: EnvironmentLightingOptions | undefined,
  wants: (name: string) => boolean,
  uniforms: Map<string, UniformValue>
): void {
  if (wants("u_a3dEnvAmbient")) {
    const k = environment && Number.isFinite(environment.intensity) ? Math.max(0, environment.intensity) : 0;
    uniforms.set("u_a3dEnvAmbient", environment ? [environment.color[0] * k, environment.color[1] * k, environment.color[2] * k] : [0, 0, 0]);
  }
  if (wants("u_a3dEnvSh") || wants("u_a3dEnvShEnabled")) {
    const sh9 = environment?.environmentProbe?.sh9;
    const valid = sh9 !== undefined && sh9.length === 27 && isFiniteArrayLike(sh9);
    if (wants("u_a3dEnvSh")) uniforms.set("u_a3dEnvSh", valid ? sh9 : ZERO_SH9);
    if (wants("u_a3dEnvShEnabled")) uniforms.set("u_a3dEnvShEnabled", valid ? 1 : 0);
  }
  if (wants("u_a3dEnvSky") || wants("u_a3dEnvHorizon") || wants("u_a3dEnvGround")) {
    const procedural = environment?.proceduralMap;
    const k = procedural && Number.isFinite(procedural.intensity) ? Math.max(0, procedural.intensity) : 0;
    const scaled = (color: readonly [number, number, number] | undefined) => color ? [color[0] * k, color[1] * k, color[2] * k] : [0, 0, 0];
    if (wants("u_a3dEnvSky")) uniforms.set("u_a3dEnvSky", scaled(procedural?.skyColor));
    if (wants("u_a3dEnvHorizon")) uniforms.set("u_a3dEnvHorizon", scaled(procedural?.horizonColor));
    if (wants("u_a3dEnvGround")) uniforms.set("u_a3dEnvGround", scaled(procedural?.groundColor));
  }
  if (!wants("u_a3dEnvMap") && !wants("u_a3dEnvMapEnabled")) return;
  const binding = environment?.environmentMapTexture;
  const texture = binding?.texture;
  const usable = texture !== null && texture !== undefined && texture.dimension !== "cube";
  if (wants("u_a3dEnvMap")) {
    uniforms.set("u_a3dEnvMap", usable && binding
      ? new TextureBinding({ name: "u_a3dEnvMap", texture, sampler: binding.sampler, required: false, ready: binding.ready, expectedColorSpace: binding.expectedColorSpace, expectedDimension: "2d" })
      : CUSTOM_ENV_MAP_FALLBACK);
  }
  if (wants("u_a3dEnvMapEnabled")) uniforms.set("u_a3dEnvMapEnabled", usable ? 1 : 0);
  const intensity = environment?.environmentMapIntensity ?? 1;
  const mipCount = environment?.environmentMapMipCount ?? 1;
  const encoding = environment?.environmentMapEncoding ?? "srgb";
  if (wants("u_a3dEnvMapIntensity")) uniforms.set("u_a3dEnvMapIntensity", usable && Number.isFinite(intensity) ? Math.max(0, intensity) : 0);
  if (wants("u_a3dEnvMapRotation")) uniforms.set("u_a3dEnvMapRotation", Number.isFinite(environment?.environmentMapRotation) ? environment!.environmentMapRotation! : 0);
  if (wants("u_a3dEnvMapMaxLod")) uniforms.set("u_a3dEnvMapMaxLod", Number.isInteger(mipCount) && mipCount >= 1 ? mipCount - 1 : 0);
  if (wants("u_a3dEnvMapEncoding")) uniforms.set("u_a3dEnvMapEncoding", encoding === "rgbe" ? 1 : encoding === "linear" ? 2 : 0);
}

/** GU47 E-D: a `material.custom` vertex shader that reads `instanceMatrix` (the adapter declares these inputs for it). */
function supportsAuthorInstancing(shader: RenderShaderProgram): boolean {
  return shader.reflection.uniforms.has("u_a3dInstancing") && INSTANCE_MATRIX_ATTRIBUTE_NAMES.every((name) => shader.reflection.attributes.has(name));
}

export function toMat4Uniform(value: Float32Array | readonly number[], field: string, label?: string): Float32Array {
  if (value.length !== 16 || !isFiniteArrayLike(value)) {
    throw new RenderDeviceError("Render item transform uniforms must be finite mat4 values", "RENDER_ITEM_TRANSFORM_CONTRACT", {
      label,
      field,
      scalars: value.length
    });
  }
  return value instanceof Float32Array ? value : new Float32Array(value);
}

function toMat4Values(value: Float32Array | readonly number[], field: string, label?: string): Mat4 {
  if (value.length !== 16 || !isFiniteArrayLike(value)) {
    throw new RenderDeviceError("Render item transform uniforms must be finite mat4 values", "RENDER_ITEM_TRANSFORM_CONTRACT", {
      label,
      field,
      scalars: value.length
    });
  }
  return mat4FromArrayLike(value, 0);
}

export function identityMatrix(): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

function getBaseMaterial(material: RenderMaterial): Material {
  return material instanceof MaterialInstance ? material.baseMaterial : material;
}

export function sortForwardRenderItems(
  items: readonly RenderItem[],
  cameraPosition: readonly [number, number, number] | undefined
): readonly RenderItem[] {
  return sortRenderQueueItems(items.map((item) => {
    const queue = blendQueueForState(getBaseMaterial(item.material ?? new UnlitMaterial()).renderState);
    return {
      item,
      bucket: forwardItemBucket(item),
      // renderOrder is primary within this queue; split frame phases still constrain it.
      renderOrder: item.renderOrder ?? 0,
      depth: cameraPosition ? Math.sqrt(distanceSquaredFromCamera(item, cameraPosition)) : 0,
      pipelineKey: renderItemPipelineKey(item),
      batchKey: renderItemPipelineKey(item),
      blendRank: queue === "transparent-unordered" ? 1 : 0,
      instanceCount: item.instanceTransforms ? instanceTransformCount(item) : item.instanceCount ?? 1
    };
  })).items;
}

function isTransparentRenderItem(item: RenderItem): boolean {
  const material = item.material ?? new UnlitMaterial();
  return blendStateIsTransparent(getBaseMaterial(material).renderState);
}

/** C-04 bucket an item lands in for sorting and the v2 frame-order split (§9.1). */
export type ForwardBucket = RenderQueueBucket;

/**
 * Bucket one item the same way `sortForwardRenderItems` does. A non-blended,
 * non-transmissive cutout uses its live `u_alphaCutoff`; shader-only discards
 * without that metadata remain opaque for routing purposes.
 */
export function forwardItemBucket(item: RenderItem): ForwardBucket {
  const material = item.material ?? new UnlitMaterial();
  const baseMaterial = getBaseMaterial(material);
  const queue = blendQueueForState(baseMaterial.renderState);
  if (queue !== "opaque") return "transparent";
  // A masked transmissive material still needs the post-opaque capture; a
  // blended transmissive material must remain in the transparent phase.
  if (isTransmissionRenderItem(item)) return "transmission";
  const cutoff = material.getParameter("u_alphaCutoff");
  return typeof cutoff === "number" && cutoff > 0 ? "mask" : "opaque";
}

/**
 * §9.1 split: opaque and masked items feed the opaque phase; transmission
 * draws after the backdrop capture, then transparent items are interleaved
 * with contributors (`sortDepth` is larger for farther items). Each phase can
 * honor renderOrder internally, but an order across phases cannot override
 * these capture and depth dependencies.
 */
export function splitForwardItems(
  items: readonly RenderItem[],
  cameraPosition?: readonly [number, number, number]
): {
  readonly opaque: readonly RenderItem[];
  readonly transmission: readonly RenderItem[];
  readonly transparent: readonly { readonly item: RenderItem; readonly sortDepth: number; readonly blendRank: number }[];
} {
  const opaque: RenderItem[] = [];
  const transmission: RenderItem[] = [];
  const transparent: RenderItem[] = [];
  for (const item of items) {
    if (!hasDrawableInstances(item)) continue;
    const bucket = forwardItemBucket(item);
    if (bucket === "opaque" || bucket === "mask") {
      opaque.push(item);
    } else if (bucket === "transmission") {
      transmission.push(item);
    } else {
      transparent.push(item);
    }
  }
  // Use the same ordering as each later ForwardPass, including the stable
  // additive/multiply policy, so contributor boundaries cannot reorder a run.
  const orderedTransparent = sortForwardRenderItems(transparent, cameraPosition).map((item) => {
    const material = getBaseMaterial(item.material ?? new UnlitMaterial());
    return {
      item,
      sortDepth: cameraPosition ? Math.sqrt(distanceSquaredFromCamera(item, cameraPosition)) : 0,
      blendRank: blendQueueForState(material.renderState) === "transparent-unordered" ? 1 : 0
    };
  });
  return { opaque, transmission, transparent: orderedTransparent };
}

function isTransmissionRenderItem(item: RenderItem): boolean {
  const material = item.material ?? new UnlitMaterial();
  const baseMaterial = getBaseMaterial(material);
  if (blendQueueForState(baseMaterial.renderState) !== "opaque") return false;
  if (!hasLiveTransmission(material)) return false;
  const flags = { values: {}, on: () => false };
  return baseMaterial.programFeatures({ flags, tier: QUALITY_TIERS.high }).lighting === "lit";
}

function distanceSquaredFromCamera(item: RenderItem, cameraPosition: readonly [number, number, number]): number {
  const center = item.boundingBoxCenter;
  const tx = center?.[0] ?? item.modelMatrix?.[12] ?? 0;
  const ty = center?.[1] ?? item.modelMatrix?.[13] ?? 0;
  const tz = center?.[2] ?? item.modelMatrix?.[14] ?? 0;
  const x = tx - cameraPosition[0];
  const y = ty - cameraPosition[1];
  const z = tz - cameraPosition[2];
  return x * x + y * y + z * z;
}

function renderItemPipelineKey(item: RenderItem): string {
  const material = item.material ?? new UnlitMaterial();
  const baseMaterial = getBaseMaterial(material);
  const state = baseMaterial.renderState;
  const blendToken = state.blendMode === undefined
    ? (state.blend ? "blend" : "opaque")
    : typeof state.blendMode === "string" ? state.blendMode : `custom:${renderStateKey(state as RenderCommandState)}`;
  return `${baseMaterial.name}|${state.depthTest ? "dt" : "ndt"}|${state.depthWrite ? "dw" : "ndw"}|${state.cullMode}|${blendToken}`;
}

function instanceTransformCount(item: RenderItem): number {
  return validateInstanceTransformSource(item).length / 16;
}

function splitInstanceTransforms(transforms: Float32Array | readonly number[]): Float32Array[] {
  const source = transforms instanceof Float32Array ? transforms : new Float32Array(transforms);
  const batches: Float32Array[] = [];
  for (let offset = 0; offset < source.length; offset += MAX_GPU_INSTANCES * 16) {
    batches.push(source.subarray(offset, Math.min(source.length, offset + MAX_GPU_INSTANCES * 16)));
  }
  return batches;
}

function applyInstanceUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): number {
  if (!shader.reflection.uniforms.has("u_instanceMatrices") || !shader.reflection.uniforms.has("u_instanceCount")) {
    throw new RenderDeviceError("Instanced render items require a shader with instance matrix uniforms", "INSTANCING_SHADER_CONTRACT", {
      label: item.label
    });
  }
  const source = validateInstanceTransformSource(item);
  const instanceCount = source.length / 16;
  if (instanceCount > MAX_GPU_INSTANCES) {
    throw new RenderDeviceError("Instanced shader path exceeds the supported uniform instance count", "GPU_INSTANCE_LIMIT", {
      label: item.label,
      instanceCount,
      maxInstances: MAX_GPU_INSTANCES
    });
  }
  const packed = new Float32Array(MAX_GPU_INSTANCES * 16);
  packed.set(source);
  uniforms.set("u_instanceMatrices", packed);
  uniforms.set("u_instanceCount", instanceCount);
  uniforms.set("u_instanceAttributeMode", 0);
  return instanceCount;
}

function applyInstanceBinding(
  device: RenderDevice,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): { readonly count: number; readonly attributes?: readonly InstanceVertexAttribute[]; readonly buffers?: readonly RenderBuffer[] } {
  const source = validateInstanceTransformSource(item);
  const instanceCount = source.length / 16;
  const extraBindings = createExtraInstanceAttributeBindings(device, item, instanceCount);
  if (supportsInstanceAttributes(shader) && instanceCount > MAX_GPU_INSTANCES) {
    const data = source instanceof Float32Array ? source : new Float32Array(source);
    const buffer = device.createBuffer("vertex", data.byteLength, data);
    uniforms.set("u_instanceCount", instanceCount);
    uniforms.set("u_instanceAttributeMode", 1);
    return {
      count: instanceCount,
      buffers: [buffer, ...extraBindings.buffers],
      attributes: [
        ...INSTANCE_MATRIX_ATTRIBUTE_NAMES.map((shaderName, column) => ({
        buffer,
        shaderName,
        components: 4 as const,
        offset: column * 16,
        stride: 64,
        divisor: 1
        })),
        ...extraBindings.attributes
      ]
    };
  }
  return {
    count: applyInstanceUniforms(item, shader, uniforms),
    ...(extraBindings.attributes.length > 0 ? { attributes: extraBindings.attributes } : {}),
    ...(extraBindings.buffers.length > 0 ? { buffers: extraBindings.buffers } : {})
  };
}

function createExtraInstanceAttributeBindings(
  device: RenderDevice,
  item: RenderItem,
  instanceCount: number,
  includeColors = true
): { readonly attributes: readonly InstanceVertexAttribute[]; readonly buffers: readonly RenderBuffer[] } {
  const descriptors: RenderItemInstanceAttribute[] = [];
  if (item.instanceColors && includeColors) {
    descriptors.push({
      shaderName: "a_instanceColor",
      components: 4,
      data: item.instanceColors
    });
  }
  if (item.instanceAttributes) descriptors.push(...item.instanceAttributes);
  if (descriptors.length === 0) return { attributes: [], buffers: [] };

  const attributes: InstanceVertexAttribute[] = [];
  const buffers: RenderBuffer[] = [];
  for (const descriptor of descriptors) {
    validateInstanceAttributeDescriptor(descriptor, instanceCount, item.label);
    const data = descriptor.data instanceof Float32Array ? descriptor.data : new Float32Array(descriptor.data);
    const stride = descriptor.components * 4;
    const buffer = device.createBuffer("vertex", data.byteLength, data);
    buffers.push(buffer);
    attributes.push({
      buffer,
      shaderName: descriptor.shaderName,
      components: descriptor.components,
      offset: 0,
      stride,
      normalized: descriptor.normalized ?? false,
      divisor: descriptor.divisor ?? 1
    });
  }
  return { attributes, buffers };
}

function validateInstanceAttributeDescriptor(descriptor: RenderItemInstanceAttribute, instanceCount: number, label: string | undefined): void {
  if (!descriptor.shaderName.trim()) {
    throw new RenderDeviceError("Instance attribute shaderName is required", "INSTANCE_ATTRIBUTE_CONTRACT", { label });
  }
  if (![1, 2, 3, 4].includes(descriptor.components)) {
    throw new RenderDeviceError("Instance attribute components must be 1, 2, 3, or 4", "INSTANCE_ATTRIBUTE_CONTRACT", {
      label,
      shaderName: descriptor.shaderName,
      components: descriptor.components
    });
  }
  const data = descriptor.data instanceof Float32Array ? descriptor.data : new Float32Array(descriptor.data);
  if (data.length !== instanceCount * descriptor.components || !Array.from(data).every(Number.isFinite)) {
    throw new RenderDeviceError("Instance attribute data must contain finite values for every instance", "INSTANCE_ATTRIBUTE_CONTRACT", {
      label,
      shaderName: descriptor.shaderName,
      components: descriptor.components,
      dataLength: data.length,
      expectedLength: instanceCount * descriptor.components
    });
  }
}







/**
 * Packs a joint palette into an RGBA32F texture, one texel per matrix column.
 *
 * Width is a multiple of four so no matrix straddles a row boundary, which keeps the
 * shader's texel addressing a simple divide and avoids per-column row recomputation.
 */






/** An instanced item with zero instances draws nothing; it must never reach sorting/validation (a throw blanks the frame). */
function hasDrawableInstances(item: RenderItem): boolean {
  return item.instanceTransforms === undefined || item.instanceTransforms.length > 0;
}

function validateInstanceTransformSource(item: RenderItem): Float32Array | readonly number[] {
  const source = item.instanceTransforms ?? [];
  if (source.length === 0 || source.length % 16 !== 0) {
    throw new RenderDeviceError("Instance transforms must contain one or more mat4 values", "INSTANCING_CONTRACT", {
      label: item.label,
      scalars: source.length
    });
  }
  if (!isFiniteArrayLike(source)) {
    throw new RenderDeviceError("Instance transforms must contain finite mat4 values", "INSTANCING_CONTRACT", {
      label: item.label
    });
  }
  return source;
}

export function isFiniteArrayLike(values: ArrayLike<number>): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) return false;
  }
  return true;
}

function isFiniteColor(values: ArrayLike<number>): boolean {
  for (let index = 0; index < values.length; index += 1) {
    const channel = values[index];
    if (!Number.isFinite(channel) || channel < 0 || channel > 1) return false;
  }
  return true;
}

function mat4FromArrayLike(values: ArrayLike<number>, offset: number): Mat4 {
  return [
    values[offset]!, values[offset + 1]!, values[offset + 2]!, values[offset + 3]!,
    values[offset + 4]!, values[offset + 5]!, values[offset + 6]!, values[offset + 7]!,
    values[offset + 8]!, values[offset + 9]!, values[offset + 10]!, values[offset + 11]!,
    values[offset + 12]!, values[offset + 13]!, values[offset + 14]!, values[offset + 15]!
  ];
}

// Internal bridge for the renderer and the contact contributor: the contact-shadow forward guards stay module-private so
// the published declarations of this module are unchanged in a patch release. They are attached to the class under a
// registered symbol (not an export, not part of any entry point); readers cast.
Object.defineProperty(ForwardPass, Symbol.for("@aura3d/rendering:forwardContactGuards"), {
  value: { providersSafe: forwardContactProvidersSafe, frameUnsafeReason: forwardContactFrameUnsafeReason }
});

/** `@aura3d-point-list` in a portable material's WGSL vertex stage: the author accepts one-pixel WebGPU points. */
function declaresWebgpuPointList(material: Material): boolean {
  return material instanceof PortableShaderMaterial && /@aura3d-point-list\b/.test(material.sources.wgsl?.vertex ?? "");
}
