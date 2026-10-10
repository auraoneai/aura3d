import { Geometry } from "./Geometry";
import { type CollectedLight } from "./LightCollector";
import { LightUniforms } from "./LightUniforms";
import { Material, type RenderState } from "./Material";
import { MaterialBinding } from "./MaterialBinding";
import { MaterialInstance } from "./MaterialInstance";
import { type InstanceVertexAttribute, type RenderBuffer, type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { RenderPipeline } from "./RenderPipeline";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { MAX_UNIFORM_SKINNING_JOINTS as SHADER_MAX_UNIFORM_SKINNING_JOINTS } from "./ShaderChunks";
import { type SkinningCpuFallbackReason } from "./WebGPUSkinningLimits";
import { ShaderModule } from "./ShaderModule";
import { createLeanCoreShaderLibrary, type ShaderLibrary } from "./ShaderLibraryCore";
import { type ShadowFilterKernel } from "./ShadowMap";
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
import { normalizeProgramFeatures } from "./program/ProgramFeatures";
import { materialFeatureWarning, materialUsesGeneratedProgram } from "./program/MaterialFeatures";
import { QUALITY_TIERS, type AuraQualityTierSettings } from "./contracts/quality";
import { rendererQrFlags } from "./renderer/FrameGraph";
import { qrCoreGeneratorOn, rendererProgramCache, rendererAuraFrame } from "./renderer/qrSubFlags";


// PR 0b-2 re-imports for moved carve-out modules (CONTRACTS.md §3.3).
import { SkinningPaletteUploadManager, applyGpuMorphUniforms, resolveRenderGeometry } from "./forward/Deform.js";
import { applyClusteredLightingUniforms, applyForwardShadowMapUniforms, resolveForwardClusteredLighting, selectForwardShadowMap } from "./forward/Lighting.js";
import { submitDraw } from "./forward/DrawSubmit.js";
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
  readonly texelSize?: readonly [number, number];
  readonly filterKernel?: ShadowFilterKernel;
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
    this.beginFramePools(context.device);
    this.clusteredLighting = resolveForwardClusteredLighting(this.options.lights, context.width, context.height, this.options.cameraViewProjectionMatrix);
    const flags = rendererQrFlags();
    if (qrCoreGeneratorOn(flags)) {
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
      for (const item of sortForwardRenderItems(this.options.items, this.options.cameraPosition)) {
        this.drawItem(context.device, item);
      }
    } finally {
      this.clusteredLighting?.dispose();
      this.clusteredLighting = null;
    }
  }

  private drawItem(device: RenderDevice, item: RenderItem): void {
    const material = item.material ?? new UnlitMaterial();
    const baseMaterial = getBaseMaterial(material);
    this.applyLightUniforms(material);
    const shader = this.getShader(baseMaterial, device, item);
    if (shader === undefined) return; // A3D_QR_CORE_GENERATOR async-skip (C-02 §A.2)
    const generated = qrCoreGeneratorOn(rendererQrFlags()) && materialUsesGeneratedProgram(baseMaterial);
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
    const uniforms = generated ? this.acquireUniformPacket(device) : new Map<string, UniformValue>();
    const binding = generated
      ? this.materialBinding.bindGenerated(material, shader, this.lastProgramFeatures, uniforms)
      : this.materialBinding.bind(material, shader);
    if (!generated) for (const [k, v] of binding.uniforms) uniforms.set(k, v);
    applyClusteredLightingUniforms(this.clusteredLighting, shader, uniforms);
    applyEnvironmentLightingUniforms(this.options.environmentLighting, item, shader, uniforms);
    applyEnvironmentFogUniforms(this.options.environmentFog, item, shader, uniforms);
    applyForwardShadowMapUniforms(
      selectForwardShadowMap(this.options.shadowMap, item, this.options.cameraViewMatrix, this.options.cameraPosition),
      item,
      shader,
      uniforms
    );
    applyOutputColorSpaceUniform(this.options.outputColorSpace ?? "srgb", item, shader, uniforms);
    applyCameraUniforms(this.options.cameraPosition, item, shader, uniforms);
    applyAlphaCutoffUniform(item, shader, uniforms);
    applyWrinkleUniform(item, shader, uniforms);
    applyTransformUniforms(item, shader, uniforms);
    bindVelocityUniforms?.(item, uniforms);
    if (item.skinning) {
      this.skinningPaletteUploads.bind(item, item.skinning, baseMaterial, shader, uniforms, device);
    }
    const instanceBinding = item.instanceTransforms ? this.applyInstanceBinding(device, item, shader, uniforms, generated) : { count: 1 };
    const gpuMorph = item.morphTargets || item.morphWeights ? applyGpuMorphUniforms(item, shader, uniforms) : false;
    const geometry = gpuMorph ? item.geometry : resolveRenderGeometry(item);
    validateMaterialGeometryContract(item, baseMaterial, geometry);
    try {
      const vertexBuffer = geometry.vertexBuffer.upload(device);
      const indexBuffer = geometry.indexBuffer?.upload(device);
      const drawRange = resolveDrawRange(geometry, item.drawRange);
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

  private getShader(material: Material, device: RenderDevice, item?: RenderItem): RenderShaderProgram | undefined {
    const flags = rendererQrFlags();
    this.lastProgramFeatures = undefined;
    if (qrCoreGeneratorOn(flags) && materialUsesGeneratedProgram(material)) {
      const warning = materialFeatureWarning(material);
      if (warning) console.warn(`[prd01] ${warning}`);
      this.lastProgramFeatures = this.programFeaturesFor(material, item);
      const handle = this.programCache(device).acquire(this.lastProgramFeatures);
      // async-skip: a not-yet-ready or failed program skips the draw this frame
      // (C-02 §A.2 semantics; warm-then-block warmup renders them ready up front).
      return handle.status === "ready" ? handle.program : undefined;
    }
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
    this.generatorProgramCache ??= rendererProgramCache(device, rendererQrFlags());
    return this.generatorProgramCache;
  }

  private programFeaturesFor(material: Material, item?: RenderItem): ProgramFeatures {
    const flags = rendererQrFlags();
    const tier = this.options.qualityTier ?? QUALITY_TIERS.high;
    const mf = material.programFeatures({ flags, tier });
    const axes = forwardPassFeatureAxes(this.options, this.clusteredLighting !== null);
    return normalizeProgramFeatures({
      ...mf,
      ...axes,
      // Phase 6: instancing is item-driven — a material's own feature record
      // only declares it when authored instanced; the draw's program must
      // cover the union (attribute matrices are the only generated path).
      ...(item?.instanceTransforms ? { instancing: { color: item.instanceColors !== undefined } } : {}),
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
        requiredAttributes: baseMaterial.requiredAttributes
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
    const buffer = instanceBufferSlot.get(rendererQrFlags())(device, capacity, { colors });
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
 * material in the pass. `clustered` is the pass's resolved state; callers that
 * only have counts should pass `dir>8||point>8||spot>8||rect>8`.
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
      clustered: clustered || directional > 8 || point > 8 || spot > 8 || rect > 8,
      hemisphere: env?.proceduralMap !== undefined
    },
    shadows: options.shadowMap
      ? { cascades: Math.max(1, Math.min(4, options.shadowMap.cascades?.length ?? 1)) as 0 | 1 | 2 | 3 | 4, pcfTaps: 4, localShadows: 0, contact: false }
      : { cascades: 0, pcfTaps: 4, localShadows: 0, contact: false },
    environment:
      env?.environmentMapTexture || env?.environmentCubeMapTexture || env?.proceduralMap
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
  if (!range) {
    return { start: 0, count: available };
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
  return range;
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
  const baseModel = toMat4Values(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label);
  const handedness = new Set<boolean>();
  for (let offset = 0; offset < source.length; offset += 16) {
    const instanceMatrix = mat4FromArrayLike(source, offset);
    handedness.add(hasNegativeHandedness(multiplyMat4(baseModel, instanceMatrix)));
  }
  return handedness.has(true);
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







function applyEnvironmentLightingUniforms(
  environment: EnvironmentLightingOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!environment) {
    clearProceduralEnvironmentMapUniforms(shader, uniforms);
    clearSampledEnvironmentMapUniforms(shader, uniforms);
    clearEnvironmentBrdfLutUniforms(shader, uniforms);
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
  applyProceduralEnvironmentMapUniforms(environment.proceduralMap, item, shader, uniforms);
  applySampledEnvironmentMapUniforms(environment, item, shader, uniforms);
}

function applyProceduralEnvironmentMapUniforms(
  proceduralMap: ProceduralEnvironmentMapLightingOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
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
  uniforms.set("u_environmentMapIntensity", proceduralMap.intensity);
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

function applySampledEnvironmentMapUniforms(
  environment: EnvironmentLightingOptions,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
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
  const intensity = environment.environmentMapIntensity ?? 1;
  const specularIntensity = environment.environmentMapSpecularIntensity ?? 0.5;
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
  transparent.sort((a, b) => b.sortDepth - a.sortDepth);
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
