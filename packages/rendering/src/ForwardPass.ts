import { Geometry } from "./Geometry";
import { type CollectedLight } from "./LightCollector";
import { LightUniforms } from "./LightUniforms";
import { Material, type RenderState } from "./Material";
import { MaterialBinding, MaterialBindingError } from "./MaterialBinding";
import { MaterialInstance } from "./MaterialInstance";
import { PortableShaderMaterial } from "./PortableShaderMaterial";
import { cullInstancesToFrustum, MIN_CULLED_INSTANCES, type InstanceFrustumCullResult } from "./renderer/InstanceFrustumCull";
import { type InstanceVertexAttribute, type RenderBuffer, type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { RenderPipeline } from "./RenderPipeline";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { MAX_UNIFORM_SKINNING_JOINTS as SHADER_MAX_UNIFORM_SKINNING_JOINTS } from "./ShaderChunks";
import { type SkinningCpuFallbackReason } from "./WebGPUSkinningLimits";
import { ShaderModule } from "./ShaderModule";
import { formatShaderFailure, isShaderFailureError, reportShaderFailure, resolveShaderFailureMode, type ShaderFailureMode } from "./ShaderFailures";
import { createLeanCoreShaderLibrary, type ShaderLibrary } from "./ShaderLibraryCore";
import { type ShadowFilterKernel } from "./ShadowMap";
import type { ShadowPcfTapTier } from "./shadows/ShadowFilterTier";
import type { ForwardSpotShadowMapOptions } from "./shadows/SpotShadowMaps";
import { TextureBinding } from "./TextureBinding";
import { UnlitMaterial } from "./UnlitMaterial";
import { sortRenderQueueItems } from "./performance/RenderItemSorting";
import { blendQueueForState, blendStateIsTransparent } from "./BlendModes";
import { renderStateKey } from "./contracts/blend";
import type { RenderCommandState } from "./RenderDevice";
import { type RenderItem } from "./contracts/renderItem";
import { instanceBufferSlot, type InstanceBufferLike } from "./contracts/geometry";
import { type VertexFormat } from "./VertexFormat";
import { type ClusteredForwardLightingResources } from "./ClusteredForwardLighting";
import { programCacheSlot, type ProgramCacheLike, type ProgramFeatures } from "./contracts/program";
import { normalizeProgramFeatures, PROGRAM_OUTPUT_SRGB_FEATURE } from "./program/ProgramFeatures";
import { featuresForGeometry, geometryHasSkin, materialFeatureWarning, materialRoutesToGeneratedProgram } from "./program/MaterialFeatures";
import { bindShaderFeatureUniforms, selectShaderFeatureBits } from "./program/FeatureSelect";
import { bindMaterialLobeUniforms } from "./materials/PhysicalFeatures";
import { QUALITY_TIERS, type AuraQualityTierSettings } from "./contracts/quality";
import { rendererQrFlags } from "./renderer/FrameGraph";
import { qrCoreGeneratorOn, qrE3CompilerLightingOn, qrGeneratedProgramsOn, qrMaterialsLobeProgramsOn, rendererProgramCache, rendererAuraFrame } from "./renderer/qrSubFlags";
import type { QrFlags } from "./contracts/core";
import { PRD02_IBL_FEATURE, type EnvironmentProbe } from "./contracts/environment";
import { packA3DEnvironmentUniforms } from "./environment/EnvUniforms";
import { dfgLutBinding, dfgLutTexture } from "./program/DFGLut";


// PR 0b-2 re-imports for moved carve-out modules (CONTRACTS.md §3.3).
import { SkinningPaletteUploadManager, applyGpuMorphUniforms, resolveRenderGeometry } from "./forward/Deform.js";
import type { ContactShadowMaskScope } from "./forward/contactShadowMaskStore.js";
import { FORWARD_DIRECT_LIGHT_CAPACITY, applyClusteredLightingUniforms, applyForwardShadowMapUniforms, resolveForwardClusteredLighting, selectForwardShadowMap } from "./forward/Lighting.js";
import { flushMultiDrawQueue, submitDraw } from "./forward/DrawSubmit.js";
import { bindVelocityUniforms } from "./forward/Velocity.js";

export type { RenderItem };

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

export interface ForwardPassOptions {
  readonly items: readonly RenderItem[];
  readonly lights?: readonly CollectedLight[];
  readonly environmentLighting?: EnvironmentLightingOptions;
  readonly environmentFog?: ForwardEnvironmentFogOptions | false;
  readonly inputColorResource?: string;
  readonly shadowMap?: ForwardShadowMapOptions;
  readonly cameraPosition?: readonly [number, number, number];
  readonly cameraViewMatrix?: Float32Array | readonly number[];
  readonly cameraViewProjectionMatrix?: Float32Array | readonly number[];
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
  /**
   * §9.1 split (C-05): the v2 frame runs several forward passes; the
   * RenderGraph requires unique names and single-producer writes, so each
   * phase pass declares its own name + write resource and optional extra
   * reads for ordering. `writes` defaults to `["color"]`.
   */
  readonly framePass?: { readonly name: string; readonly reads?: readonly string[]; readonly writes?: readonly string[] };
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

export class ForwardPass extends BaseRenderPass {
  private static readonly shaderCaches = new WeakMap<RenderDevice, WeakMap<ShaderLibrary, ShaderCacheRecord>>();
  private readonly materialBinding = new MaterialBinding();
  private readonly shaderLibrary: ShaderLibrary;
  private readonly skinningPaletteUploads = new SkinningPaletteUploadManager();
  private clusteredLighting: ClusteredForwardLightingResources | null = null;
  private generatorProgramCache: ProgramCacheLike | undefined;

  // PRD-01 Phase 6 (submission performance): device-keyed pools — ForwardPass
  // instances are rebuilt per frame/segment, so pass-level caches would never
  // hit. Keyed by device they survive pass reconstruction (same precedent as
  // `shaderCaches`) and die with the device.
  private static readonly pipelineCaches = new WeakMap<RenderDevice, Map<string, RenderPipeline>>();
  private static readonly uniformPacketPools = new WeakMap<RenderDevice, { free: Map<string, UniformValue>[]; used: Map<string, UniformValue>[] }>();
  private static readonly instanceSlotPools = new WeakMap<RenderDevice, { buffer: InstanceBufferLike; colors: boolean; capacity: number }[]>();
  private instanceSlotCursor = 0;
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
  // WP-4: which view this pass renders, so the contact-shadow mask binds only to the main camera's draws (one object per frame).
  private contactMaskScope: ContactShadowMaskScope | undefined;

  constructor(private readonly options: ForwardPassOptions) {
    super(
      options.framePass?.name ?? "forward",
      [...(options.inputColorResource ? [options.inputColorResource] : []), ...(options.framePass?.reads ?? [])],
      options.framePass?.writes ?? ["color"]
    );
    this.shaderLibrary = options.shaderLibrary ?? createLeanCoreShaderLibrary();
  }

  execute(context: RenderPassContext): void {
    this.skinningPaletteUploads.beginFrame();
    this.frameWidth = context.width;
    this.frameHeight = context.height;
    this.contactMaskScope = { device: context.device, width: context.width, height: context.height, cameraPosition: this.options.cameraPosition };
    this.beginFramePools(context.device);
    this.clusteredLighting = resolveForwardClusteredLighting(this.options.lights, context.width, context.height, this.options.cameraViewProjectionMatrix);
    const flags = rendererQrFlags(context.device);
    if (qrGeneratedProgramsOn(flags)) {
      const auraFrame = rendererAuraFrame(context.device, flags);
      if ("viewport" in auraFrame) {
        (auraFrame as { viewport: { width: number; height: number } }).viewport = { width: context.width, height: context.height };
      }
      const vp = this.options.cameraViewProjectionMatrix ?? identityMatrix();
      auraFrame.update(
        {
          viewMatrix: toMat4Uniform(this.options.cameraViewMatrix ?? identityMatrix(), "cameraViewMatrix"),
          projectionMatrix: toMat4Uniform(this.options.auraFrameCamera?.projectionMatrix ?? identityMatrix(), "auraFrameCamera.projectionMatrix"),
          viewProjectionMatrix: toMat4Uniform(vp, "cameraViewProjectionMatrix"),
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
      if (auraFrame.buffer) context.device.bindUniformBuffer?.(auraFrame.buffer, 0);
    }
    try {
      for (const item of sortForwardRenderItems(this.options.items.filter(hasDrawableInstances), this.options.cameraPosition)) {
        this.drawItem(context.device, item);
      }
      // #181: issue any trailing multi-draw run deferred by `submitDraw`.
      flushMultiDrawQueue(context.device);
    } finally {
      this.clusteredLighting?.dispose();
      this.clusteredLighting = null;
    }
  }

  private drawItem(device: RenderDevice, sourceItem: RenderItem): void {
    let item = sourceItem;
    // An instanced item with zero instances draws nothing (never a contract throw that blanks the frame).
    if (item.instanceTransforms !== undefined && item.instanceTransforms.length === 0) return;
    // threejs-parity L7/SG-09: three's Object3D.onBeforeRender fires
    // immediately before the draw call.
    item.onBeforeRender?.(item);
    const material = item.material ?? new UnlitMaterial();
    const baseMaterial = getBaseMaterial(material);
    this.applyLightUniforms(material);
    let shader: RenderShaderProgram | undefined;
    const knownFailure = this.shaderFailureOutcome(baseMaterial);
    if (knownFailure === undefined) {
      try {
        shader = this.getShader(baseMaterial, device, item);
      } catch (error) {
        if (!isShaderFailureError(error)) throw error;
        this.lastProgramFeatures = undefined;
        const mode = this.handleShaderFailure(error, baseMaterial, device);
        if (mode === "magenta") {
          this.drawItem(device, { ...item, onBeforeRender: undefined, material: shaderFailureDebugMaterial() });
        }
        return;
      }
    } else {
      // A program that already failed is not recompiled every frame: skip, or draw the magenta debug item.
      if (knownFailure === "magenta") {
        this.drawItem(device, { ...item, onBeforeRender: undefined, material: shaderFailureDebugMaterial() });
      }
      return;
    }
    if (shader === undefined) return; // A3D_QR_CORE_GENERATOR async-skip (C-02 §A.2)
    // Generated iff getShader resolved a generated program for this draw (a
    // compile-failed fallback or an unskinnable skinned item is a legacy draw).
    let generated = this.lastProgramFeatures !== undefined;
    // Large instanced draws: submit only the instances whose bounding sphere meets this pass's view frustum.
    const culled = this.cullInstancesToView(item, baseMaterial);
    if (culled !== null) {
      if (culled.count === 0) return;
      item = { ...item, instanceTransforms: culled.transforms, ...(culled.colors ? { instanceColors: culled.colors } : {}) };
    }
    if (item.instanceTransforms && baseMaterial.renderState.cullMode !== "none" && instancedItemNeedsPerInstanceCullState(item)) {
      for (const expanded of expandInstancedRenderItem(item)) {
        this.drawItem(device, expanded);
      }
      return;
    }
    // Phase 6: generated programs only know attribute-matrix instancing — the
    // uniform fallback (`u_instanceMatrices[64]`) exists only in the frozen
    // legacy library, so the >64 split and no-support expansion never apply
    // on this path.
    if (item.instanceTransforms && !generated && !supportsInstanceAttributes(shader) && instanceTransformCount(item) > MAX_GPU_INSTANCES) {
      for (const batch of splitInstanceTransforms(item.instanceTransforms)) {
        this.drawItem(device, { ...item, instanceTransforms: batch });
      }
      return;
    }
    if (item.instanceTransforms && !generated && !supportsInstanceAttributes(shader) && !supportsInstanceUniforms(shader)) {
      for (const expanded of expandInstancedRenderItem(item)) {
        this.drawItem(device, expanded);
      }
      return;
    }
    let uniforms = generated ? this.acquireUniformPacket(device) : new Map<string, UniformValue>();
    // #867 (games): binding validation never kills the frame. A generated
    // draw that fails validation falls back to the legacy shaderKey program;
    // a legacy draw that fails is skipped with one warning. Strict throws.
    let binding: ReturnType<MaterialBinding["bind"]> | null = null;
    try {
      binding = generated
        ? this.materialBinding.bindGenerated(material, shader, this.lastProgramFeatures, uniforms)
        : this.materialBinding.bind(material, shader);
    } catch (error) {
      if (!(error instanceof MaterialBindingError) || rendererQrFlags(device).on("A3D_QR_STRICT")) throw error;
      warnBindingOnce(item, baseMaterial, error, generated);
      if (!generated) return;
      this.lastProgramFeatures = undefined;
      generated = false;
      shader = this.legacyShader(baseMaterial, device);
      uniforms = new Map<string, UniformValue>();
      try {
        binding = this.materialBinding.bind(material, shader);
      } catch (legacyError) {
        if (!(legacyError instanceof MaterialBindingError)) throw legacyError;
        warnBindingOnce(item, baseMaterial, legacyError, false);
        return;
      }
    }
    if (!generated) for (const [k, v] of binding.uniforms) uniforms.set(k, v);
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
    applyEnvironmentLightingUniforms(this.options.environmentLighting, item, shader, uniforms, { conjunction: e3Conjunction, generated });
    if (generated) applyGeneratedEnvironmentMapUniforms(this.options.environmentLighting, item, shader, uniforms, drawFlags);
    if (generated) applyGeneratedProceduralEnvironmentUniforms(this.options.environmentLighting, item, shader, uniforms, prd02Ibl);
    // threejs-parity L7/SR-02: three's `material.fog === false` — the draw
    // binds fog-disabled uniforms while other scene materials keep fog.
    const itemFog = baseMaterial.fog === false ? false : this.options.environmentFog;
    applyEnvironmentFogUniforms(itemFog, item, shader, uniforms);
    if (generated) applyGeneratedFogUniforms(itemFog, shader, uniforms);
    applyForwardShadowMapUniforms(
      selectForwardShadowMap(this.options.shadowMap, item, this.options.cameraViewMatrix, this.options.cameraPosition),
      item,
      shader,
      uniforms,
      this.contactMaskScope
    );
    applyOutputColorSpaceUniform(this.options.outputColorSpace ?? "srgb", item, shader, uniforms);
    applyCameraUniforms(this.options.cameraPosition, item, shader, uniforms);
    applyAlphaCutoffUniform(item, shader, uniforms);
    applyWrinkleUniform(item, shader, uniforms);
    applyTransformUniforms(item, shader, uniforms);
    // threejs-parity SH-02: the frame-scoped built-ins `material.custom` shaders
    // may declare (u_time/u_resolution/u_viewMatrix/u_projectionMatrix) — bound
    // only when the program actually reflects them, mirroring applyCameraUniforms.
    applyCustomShaderFrameUniforms(this.options, this.frameWidth, this.frameHeight, shader, uniforms);
    bindVelocityUniforms?.(item, uniforms);
    if (generated && this.lastProgramFeatures) {
      // C-02 `ShaderFeature.bindUniforms` for the features this draw selected.
      bindShaderFeatureUniforms(this.lastProgramFeatures.features, rendererQrFlags(device), item, (name, value) => uniforms.set(name, value));
      // E3 stage-2b bind site: `prd02.ibl` has no feature-local bind (the
      // probe, knob and ambient are pass state, not item state), so the
      // PRD-02 environment pack is bound here, in the feature-bind slot.
      if (prd02Ibl) applyPrd02EnvironmentUniforms(this.options.environmentLighting, item, material, uniforms);
      // C-03 `lobe.bind` (04-LOBES): descriptor factors and lobe textures for the
      // lobes this record carries. Material parameters stay authoritative.
      bindMaterialLobeUniforms(this.lastProgramFeatures.extensions, baseMaterial, rendererQrFlags(device), (name, value) => {
        if (!uniforms.has(name)) uniforms.set(name, value);
      });
    }
    if (item.skinning && !generated) {
      // Legacy skinned programs take the u_jointMatrices palette; on the
      // generated path prd06.deform's bindUniforms binds the bone texture, and
      // a generated draw without it has no skin attributes (featuresForGeometry).
      this.skinningPaletteUploads.bind(item, item.skinning, baseMaterial, shader, uniforms, device);
    }
    const instanceBinding = item.instanceTransforms ? this.applyInstanceBinding(device, item, shader, uniforms, generated) : { count: 1 };
    const gpuMorph = item.morphTargets || item.morphWeights ? applyGpuMorphUniforms(item, shader, uniforms) : false;
    const geometry = gpuMorph ? item.geometry : resolveRenderGeometry(item);
    // Generated programs validate their selected attributes in MaterialBinding.
    // The legacy descriptor can require maps/tangents deliberately masked out
    // for this geometry, so it is not the generated program contract.
    if (!generated) validateMaterialGeometryContract(item, baseMaterial, geometry);
    try {
      const vertexBuffer = geometry.vertexBuffer.upload(device);
      const indexBuffer = geometry.indexBuffer?.upload(device);
      const drawRange = resolveDrawRange(geometry, item.drawRange);
      // three's setDrawRange(0, 0) draws nothing; the device rejects zero-count draws, so skip here.
      if (drawRange.count === 0) return;
      const pipeline = this.pipelineFor(device, item, baseMaterial, shader, geometry);
      submitDraw(device, pipeline, geometry, instanceBinding.count, drawRange, { item, vertexBuffer, indexBuffer, drawRange, uniforms, instanceBinding });
    } finally {
      for (const buffer of instanceBinding.buffers ?? []) buffer.dispose();
      if (geometry !== item.geometry) {
        geometry.dispose();
      }
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
    if (!(transforms instanceof Float32Array) || viewProjection === undefined || viewProjection.length < 16) return null;
    if (transforms.length < MIN_CULLED_INSTANCES * 16) return null;
    if (item.frustumCulled === false || item.skinning || item.morphTargets || item.morphWeights || item.instanceAttributes || item.drawRange) return null;
    if (baseMaterial instanceof PortableShaderMaterial) return null;
    const colors = item.instanceColors;
    if (colors !== undefined && !(colors instanceof Float32Array)) return null;
    return cullInstancesToFrustum({ viewProjection, modelMatrix: item.modelMatrix, bounds: item.geometry.bounds, transforms, ...(colors ? { colors } : {}) });
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
    const slot = this.instanceSlotFor(device, count, item.instanceColors !== undefined);
    slot.buffer.setMatrices(source instanceof Float32Array ? source : new Float32Array(source), count);
    if (item.instanceColors) {
      slot.buffer.setColors(item.instanceColors instanceof Float32Array ? item.instanceColors : new Float32Array(item.instanceColors));
    }
    const bound = slot.buffer.bind();
    const extra = createExtraInstanceAttributeBindings(device, item, count, false);
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
        ...(bound.colorBuffer ? [{
          buffer: bound.colorBuffer,
          shaderName: "a_instanceColor",
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

  private applyLightUniforms(material: RenderMaterial): void {
    const baseMaterial = getBaseMaterial(material);
    if (!baseMaterial.requiredUniforms.includes("u_lightCount") || !baseMaterial.requiredUniforms.includes("u_lightData")) {
      return;
    }
    const packed = LightUniforms.pack(this.options.lights ?? []);
    if (material instanceof MaterialInstance) {
      material.setOverride("u_lightCount", packed.lightCount);
      material.setOverride("u_lightData", packed.data);
    } else {
      material.setParameter("u_lightCount", packed.lightCount);
      material.setParameter("u_lightData", packed.data);
    }
  }

  private readonly failedShaders = new WeakMap<Material, { readonly revision: number; readonly mode: ShaderFailureMode }>();

  /** Outcome for a material whose program already failed (undefined: not failed, or the shader library changed since). */
  private shaderFailureOutcome(material: Material): ShaderFailureMode | undefined {
    const failed = this.failedShaders.get(material);
    if (!failed) return undefined;
    if (failed.revision !== this.shaderLibrary.getRevision()) {
      this.failedShaders.delete(material);
      return undefined;
    }
    return failed.mode;
  }

  /** Records a compile/link/WGSL failure, logs it once, and returns how the item is handled. Strict rethrows. */
  private handleShaderFailure(error: unknown, material: Material, device: RenderDevice): ShaderFailureMode {
    const strict = rendererQrFlags(device).on("A3D_QR_STRICT");
    const mode = resolveShaderFailureMode(strict);
    let sources: { vertex?: string; fragment?: string } = {};
    try {
      const compiled = material.shaderVariant
        ? this.shaderLibrary.compileVariant(material.shaderKey, material.shaderVariant)
        : this.shaderLibrary.compileSource(material.shaderKey);
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
    this.failedShaders.set(material, { revision: this.shaderLibrary.getRevision(), mode });
    return mode;
  }

  private getShader(material: Material, device: RenderDevice, item?: RenderItem): RenderShaderProgram | undefined {
    const flags = rendererQrFlags(device);
    this.lastProgramFeatures = undefined;
    // PRD-04: under `materials` without the core generator, lobe-bearing
    // materials still take the generated program (the legacy shader has no
    // lobe code). That program writes linear HDR, so the lobe route only runs
    // into a linear target (postprocess / OutputPass encodes).
    const route = {
      core: qrCoreGeneratorOn(flags),
      lobes: qrMaterialsLobeProgramsOn(flags) && this.options.outputColorSpace === "linear"
    };
    if ((route.core || route.lobes) && materialRoutesToGeneratedProgram(material, route, { flags, tier: this.options.qualityTier ?? QUALITY_TIERS.high })) {
      const warning = materialFeatureWarning(material);
      if (warning) console.warn(`[prd01] ${warning}`);
      this.lastProgramFeatures = this.programFeaturesFor(material, device, item);
      // #867: a skinned draw needs its program to skin. When no registered
      // deform feature (prd06.deform, A3D_QR_ANIMATION) selected this item,
      // the generated program has no skinning, so the draw keeps the legacy
      // skinned shaderKey program instead of rendering the bind pose.
      // A skinned item whose geometry has no joints/weights draws unskinned on
      // the generated program (features follow the geometry, #867 games).
      if (item?.skinning && geometryHasSkin((a) => geometryHasAttribute(item.geometry, a)) && this.lastProgramFeatures.features["prd06.deform"] === undefined) {
        this.lastProgramFeatures = undefined;
        return this.legacyShader(material, device);
      }
      const handle = this.programCache(device).acquire(this.lastProgramFeatures);
      if (handle.status === "failed") {
        // T0-03: the cache already emitted `program-compile-failed` (C-36) +
        // console.error. Strict escalates to a throw; otherwise the draw falls
        // back to the legacy shaderKey path below.
        if (flags.on("A3D_QR_STRICT")) {
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
    return this.legacyShader(material, device);
  }

  /** Frozen legacy shaderKey program (flag-off path, and generated-path fallbacks). */
  private legacyShader(material: Material, device: RenderDevice): RenderShaderProgram {
    const cacheKey = shaderCacheKey(material);
    const shaderCache = getForwardPassShaderCache(device, this.shaderLibrary);
    let module = shaderCache.get(cacheKey);
    if (!module) {
      module = material.shaderVariant
        ? ShaderModule.fromLibraryVariant(this.shaderLibrary, material.shaderKey, material.shaderVariant)
        : ShaderModule.fromLibrary(this.shaderLibrary, material.shaderKey);
      shaderCache.set(cacheKey, module);
    }
    return module.compile(device);
  }

  /** Feature record for the program `getShader` most recently resolved (C-02). */
  private lastProgramFeatures: ProgramFeatures | undefined;

  private programCache(device: RenderDevice): ProgramCacheLike {
    this.generatorProgramCache ??= rendererProgramCache(device, rendererQrFlags(device));
    return this.generatorProgramCache;
  }

  private programFeaturesFor(material: Material, device: RenderDevice, item?: RenderItem): ProgramFeatures {
    const flags = rendererQrFlags(device);
    const tier = this.options.qualityTier ?? QUALITY_TIERS.high;
    const mf = material.programFeatures({ flags, tier });
    const axes = forwardPassFeatureAxes(this.options, this.clusteredLighting !== null);
    // T0-05: registered ShaderFeatures select their bits per draw (C-02 §A.2:
    // at acquire time); the warmup applies the same selection per item.
    const selected = item ? selectShaderFeatureBits({ item, pass: "forward", tier, flags }) : {};
    // E3 stage-2b: `prd02.ibl` shades from a C-09 probe cube; without one
    // (bare preset/procedural lighting) the default indirect body stays.
    if (selected[PRD02_IBL_FEATURE] !== undefined && !prd02IblEnvironmentAvailable(this.options.environmentLighting, item)) {
      delete selected[PRD02_IBL_FEATURE];
    }
    // Direct render path (frame output colour space is sRGB: no post chain, no OutputPass): the generated program
    // tone-maps and encodes its own output. Explicit "srgb" only; an unset option keeps the linear program.
    if (this.options.outputColorSpace === "srgb") selected[PROGRAM_OUTPUT_SRGB_FEATURE] = true;
    const record = item ? featuresForGeometry({ ...mf, features: { ...mf.features, ...selected } }, (a) => geometryHasAttribute(item.geometry, a)) : { ...mf, features: { ...mf.features, ...selected } };
    return normalizeProgramFeatures({
      ...record,
      ...axes,
      // threejs-parity L7/SR-02: `material.fog === false` selects a fog-free
      // program variant so the draw carries no FOG_* defines at all.
      ...(material.fog === false ? { fog: "none" as const } : {}),
      // Phase 6: instancing is item-driven — a material's own feature record
      // only declares it when authored instanced; the draw's program must
      // cover the union (attribute matrices are the only generated path).
      ...(item?.instanceTransforms ? { instancing: { color: item.instanceColors !== undefined } } : {}),
      // #1140: a per-item probe cube (PRD-02 S12) is sampled as a cube.
      ...(item?.environmentCube?.texture?.dimension === "cube" ? { environment: "pmrem-cube" as const } : {}),
      backgroundCoverage: this.options.backgroundCoverage === true,
      pass: "forward",
      target: "glsl300es"
    });
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
    this.instanceSlotCursor = 0;
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
    geometry: { readonly vertexBuffer: { readonly format: VertexFormat }; readonly topology?: RenderItem["geometry"]["topology"] }
  ): RenderPipeline {
    const renderState = renderStateForItem(baseMaterial.renderState, item);
    const vertexFormatId = ForwardPass.weakId(ForwardPass.vertexFormatIds, () => ForwardPass.nextVertexFormatId++, geometry.vertexBuffer.format);
    const renderStateId = ForwardPass.weakId(ForwardPass.renderStateIds, () => ForwardPass.nextRenderStateId++, baseMaterial.renderState);
    const attrsId = ForwardPass.weakId(ForwardPass.requiredAttributeIds, () => ForwardPass.nextRequiredAttributeId++, baseMaterial.requiredAttributes);
    // `renderStateForItem` returns the SAME object for the unflipped case, so
    // the flip bit is the only per-item term needed in the key.
    const key = `${shader.id}|${vertexFormatId}|${geometry.topology ?? "triangles"}|${renderStateId}:${renderState === baseMaterial.renderState ? 0 : 1}|${attrsId}`;
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
   * Persistent attribute-matrix slot for the generated path (Phase 6): slots
   * are reused in draw order; capacity/colors mismatches retire the old
   * buffer (its VAOs are evicted by the §6.1 dispose fix).
   */
  private instanceSlotFor(device: RenderDevice, count: number, colors: boolean): { readonly buffer: InstanceBufferLike; readonly capacity: number } {
    const index = this.instanceSlotCursor;
    this.instanceSlotCursor += 1;
    const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    let slots = ForwardPass.instanceSlotPools.get(device);
    if (!slots) {
      slots = [];
      ForwardPass.instanceSlotPools.set(device, slots);
    }
    const existing = slots[index];
    if (existing && existing.colors === colors && existing.capacity >= count) {
      return existing;
    }
    existing?.buffer.dispose();
    const buffer = instanceBufferSlot.get(rendererQrFlags(device))(device, capacity, { colors });
    const slot = { buffer, colors, capacity };
    slots[index] = slot;
    if (slots.length > index + 64) slots.length = index + 64;
    return slot;
  }
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
      ? { cascades: Math.max(1, Math.min(4, options.shadowMap.cascades?.length ?? 1)) as 0 | 1 | 2 | 3 | 4, pcfTaps: 4, localShadows: 0, contact: false }
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

function shaderCacheKey(material: Material): string {
  return material.shaderVariant ? `${material.shaderKey}:${material.shaderVariant}` : material.shaderKey;
}

function supportsInstanceUniforms(shader: RenderShaderProgram): boolean {
  return shader.reflection.uniforms.has("u_instanceMatrices") && shader.reflection.uniforms.has("u_instanceCount");
}

function supportsInstanceAttributes(shader: RenderShaderProgram): boolean {
  return shader.reflection.uniforms.has("u_instanceAttributeMode") &&
    shader.reflection.uniforms.has("u_instanceCount") &&
    INSTANCE_MATRIX_ATTRIBUTE_NAMES.every((name) => shader.reflection.attributes.has(name));
}

function renderStateForItem(renderState: RenderState, item: RenderItem): RenderState {
  if (renderState.cullMode === "none") return renderState;
  const modelMatrix = toMat4Values(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
  if (!hasNegativeHandedness(modelMatrix)) return renderState;
  return {
    ...renderState,
    cullMode: renderState.cullMode === "back" ? "front" : "back"
  };
}

function instancedItemNeedsPerInstanceCullState(item: RenderItem): boolean {
  const source = validateInstanceTransformSource(item);
  const base = toMat4Values(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
  // Allocation-free: a 10,000-instance draw runs this every pass. Only the upper 3x3 of
  // `base * instance` feeds the handedness test, so build it from scalars (same sums as
  // `multiplyMat4`, rows 0..2 / columns 0..2) instead of two arrays per instance.
  for (let offset = 0; offset < source.length; offset += 16) {
    if (instanceProductHasNegativeHandedness(base, source, offset)) return true;
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

function expandInstancedRenderItem(item: RenderItem): readonly RenderItem[] {
  const source = validateInstanceTransformSource(item);
  const baseModel = toMat4Values(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
  const baseModelViewProjection = toMat4Values(item.modelViewProjectionMatrix ?? baseModel, "modelViewProjectionMatrix", item.label);
  const { instanceTransforms: _instanceTransforms, normalMatrix: _normalMatrix, ...baseItem } = item;
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

function normalMatrixFromModel(modelMatrix: Mat4): Mat4 {
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
  uniforms: Map<string, UniformValue>
): void {
  const modelMatrix = shader.reflection.uniforms.has("u_modelMatrix") || shader.reflection.uniforms.has("u_normalMatrix")
    ? toMat4Uniform(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label)
    : undefined;
  if (item.modelViewProjectionMatrix && shader.reflection.uniforms.has("u_modelViewProjection")) {
    uniforms.set("u_modelViewProjection", toMat4Uniform(item.modelViewProjectionMatrix, "modelViewProjectionMatrix", item.label));
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
    // `#include <a3d_shadow>`: direction from the surface toward the shadow-casting directional light.
    const sun = options.lights?.find((light) => light.castsShadow && light.kind === "directional");
    const d = sun?.direction ?? [0, -1, 0];
    const length = Math.hypot(d[0], d[1], d[2]) || 1;
    uniforms.set("u_a3dSunDirection", [-d[0] / length, -d[1] / length, -d[2] / length]);
  }
  if (reflected.has("u_projectionMatrix") && !uniforms.has("u_projectionMatrix")) {
    uniforms.set("u_projectionMatrix", toMat4Uniform(options.customFrameCamera?.projectionMatrix ?? options.auraFrameCamera?.projectionMatrix ?? identityMatrix(), "auraFrameCamera.projectionMatrix"));
  }
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

function sortForwardRenderItems(
  items: readonly RenderItem[],
  cameraPosition: readonly [number, number, number] | undefined
): readonly RenderItem[] {
  return sortRenderQueueItems(items.map((item) => {
    const queue = blendQueueForState(getBaseMaterial(item.material ?? new UnlitMaterial()).renderState);
    return {
      item,
      bucket: queue !== "opaque" ? "transparent" : isTransmissionRenderItem(item) ? "transmission" : "opaque",
      // threejs-parity L7/SG-09: three sorts on `object.renderOrder` first.
      renderOrder: item.renderOrder ?? 0,
      depth: cameraPosition ? distanceSquaredFromCamera(item, cameraPosition) : 0,
      pipelineKey: renderItemPipelineKey(item),
      batchKey: renderItemPipelineKey(item),
      blendRank: queue === "transparent-unordered" ? 1 : 0,
      instanceCount: item.instanceTransforms ? instanceTransformCount(item) : 1
    };
  })).items;
}

function isTransparentRenderItem(item: RenderItem): boolean {
  const material = item.material ?? new UnlitMaterial();
  return blendStateIsTransparent(getBaseMaterial(material).renderState);
}

/** C-04 bucket an item lands in for the v2 frame-order split (§9.1). */
export type ForwardBucket = "opaque" | "transmission" | "transparent";

/** Bucket one item the same way `sortForwardRenderItems` does. */
export function forwardItemBucket(item: RenderItem): ForwardBucket {
  const material = item.material ?? new UnlitMaterial();
  const queue = blendQueueForState(getBaseMaterial(material).renderState);
  if (queue !== "opaque") return "transparent";
  return isTransmissionRenderItem(item) ? "transmission" : "opaque";
}

/**
 * §9.1 split: `opaque` feeds the opaque phase, `transmission` the transmissive
 * draw after contributor `transmission` passes, and `transparent` the
 * interleaved transparent phase (each item carries its view-space distance as
 * `sortDepth`, larger = farther, matching `TransparentQueueItem` semantics).
 */
export function splitForwardItems(
  items: readonly RenderItem[],
  cameraPosition?: readonly [number, number, number]
): {
  readonly opaque: readonly RenderItem[];
  readonly transmission: readonly RenderItem[];
  readonly transparent: readonly { readonly item: RenderItem; readonly sortDepth: number }[];
} {
  const opaque: RenderItem[] = [];
  const transmission: RenderItem[] = [];
  const transparent: { item: RenderItem; sortDepth: number }[] = [];
  for (const item of items) {
    const bucket = forwardItemBucket(item);
    if (bucket === "opaque") {
      opaque.push(item);
    } else if (bucket === "transmission") {
      transmission.push(item);
    } else {
      transparent.push({ item, sortDepth: cameraPosition ? Math.sqrt(distanceSquaredFromCamera(item, cameraPosition)) : 0 });
    }
  }
  // Transparents are drawn back-to-front (farther first), matching the queue sort.
  // threejs-parity L7/SG-09: `renderOrder` remains the primary sort key.
  transparent.sort((a, b) => {
    const orderDelta = (a.item.renderOrder ?? 0) - (b.item.renderOrder ?? 0);
    return orderDelta !== 0 ? orderDelta : b.sortDepth - a.sortDepth;
  });
  return { opaque, transmission, transparent };
}

function materialNumericParameter(material: Material, name: string, fallback: number): number {
  const value = material.getParameter(name);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isTransmissionRenderItem(item: RenderItem): boolean {
  const material = item.material ?? new UnlitMaterial();
  const baseMaterial = getBaseMaterial(material);
  if (baseMaterial.renderState.blend) return false;
  const transmissionFactor = materialNumericParameter(baseMaterial, "u_transmissionFactor", 0);
  const diffuseTransmissionFactor = materialNumericParameter(baseMaterial, "u_diffuseTransmissionFactor", 0);
  const volumeThicknessFactor = materialNumericParameter(baseMaterial, "u_volumeThicknessFactor", 0);
  return transmissionFactor > 0.001 || diffuseTransmissionFactor > 0.001 || volumeThicknessFactor > 0.001;
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
