import { Material } from "./Material";
import { materialUniformValuesEqual, MaterialInstance } from "./MaterialInstance";
import { isFlatUniformValue } from "./MaterialBinding";
import { flattenPortableDataUniform, reflectsUniformRoot } from "./webgl2/UniformDataFlatten";
import { PortableShaderMaterial, type PortableShaderUniformDescriptor } from "./PortableShaderMaterial";
import { UnlitMaterial } from "./UnlitMaterial";
import { PBRMaterial } from "./PBRMaterial";
import { TexturedPBRMaterial } from "./TexturedPBRMaterial";
import { InstancedUnlitMaterial } from "./InstancedUnlitMaterial";
import { InstancedPBRMaterial } from "./InstancedPBRMaterial";
import { Geometry } from "./Geometry";
import { IndexBuffer } from "./IndexBuffer";
import { VertexBuffer } from "./VertexBuffer";
import { type DrawCommand, type InstanceVertexAttribute, type NativeStorageBinding, type RecursiveUniformValue, type RenderBuffer, type RenderCommandState, type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { ShaderModule } from "./ShaderModule";
import { reflectShaderSources } from "./ShaderReflection";
import { isTextureBinding, TextureBinding } from "./TextureBinding";
import { createLeanCoreShaderLibrary, DEFAULT_DEPTH_SHADER_NAME, DEFAULT_INSTANCED_PBR_SHADER_NAME, DEFAULT_INSTANCED_UNLIT_SHADER_NAME, DEFAULT_PBR_SHADER_NAME, DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME, DEFAULT_UNLIT_SHADER_NAME, type ShaderLibrary } from "./ShaderLibraryCore";
import { hasForwardDrawHooks, instancedItemNeedsPerInstanceCullState, normalMatrixFromModel, physicalVertexColorsForGeometry, renderItemHasNegativeHandedness, toMat4Uniform, type RenderItem } from "./ForwardPass";
import type { DepthVariantFeature, ShadowCasterVariantKey } from "./contracts/shadows";
import { prd02DepthProgram, prd02DepthVariantForVertexFormat, PRD02_DEPTH_MAX_INSTANCES, PRD02_DEPTH_SHADER_NAME, registerPrd02DepthShader } from "./shadows/Prd02DepthShaderLibrary";
import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { InstanceBuffer } from "./resources/InstanceBuffer";
import type { DepthConvention } from "./DepthConvention";
import { createClippingBinding, createClippingUniforms, type ClippingBinding, type ClippingGroupInput, type ClippingPass } from "./ClippingPlanes";
import { resolveRenderGeometry, validateSkinningGeometryContract } from "./forward/Deform";
import { applySkinningUniforms } from "./SkinningUniforms";
import { MAX_UNIFORM_SKINNING_JOINTS } from "./ShaderChunks";
import { batchMembersFor, expandLogicalBatchItems, isEngineBatchInstanceItem, isEnginePackedBatchItem } from "./batching/BatchMembers";
import { featuresForGeometry, materialRoutesToGeneratedProgram, withLiveAlphaCutoff } from "./program/MaterialFeatures";
import { withLivePhysicalMapFeatures } from "./materials/PhysicalFeatures";
import { rendererQrFlags } from "./renderer/FrameGraph";
import { ALPHA_TO_COVERAGE_FEATURE } from "./webgpu/GeneratedAlphaToCoverage";
import { QUALITY_TIERS } from "./contracts/quality";
import { materialInstanceColorTarget } from "./shaders/chunks/instance_color_target.glsl";
import { shaderFeaturesFor } from "./contracts/program";
import { selectShaderFeatureBits } from "./program/FeatureSelect";
import { qrCoreGeneratorOn, qrMaterialsLobeProgramsOn } from "./renderer/qrSubFlags";
import { ScreenSpaceLineMaterial } from "./ScreenSpaceLineMaterial";
import { createClippedScreenSpaceLineShader, LINE_CLIP_INVERSE_TRANSFORM } from "./forward/ScreenSpaceLineClipping";
import { certifiedDefaultScreenLineSource } from "./renderer/TrustedShaderLibrary";
import { assertSpecializedLineDepthClipRange, createSpecializedLineDepthShader } from "./shadows/SpecializedDepthShader";
import { assertSpecializedClippedDepthItem, clippedLineDepthTransforms, expandClippedSprite, resolveClippingRasterCamera, retainClippedPoints, specializedClippedPrimitive } from "./shadows/SpecializedClippedDepth";

export interface DepthPassOptions {
  readonly casters: readonly RenderItem[];
  readonly shaderLibrary?: ShaderLibrary;
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
  /** The scene camera eye used by the forward material's vertex expressions. */
  readonly cameraPosition?: readonly [number, number, number];
  /** The convention of this pass's own camera (shadow cameras may differ from the view). */
  readonly depthConvention?: DepthConvention;
  /** Scene group, read for every draw so updates require no shader rebuild. */
  readonly globalClipping?: ClippingGroupInput;
  /** Optional per-caster material group; takes precedence over the item group. */
  readonly materialClippingFor?: (item: RenderItem) => ClippingGroupInput | undefined;
  /** Shadow passes apply only groups explicitly opting into shadow clipping. */
  readonly clippingPass?: Extract<ClippingPass, "depth" | "shadow">;
  readonly clippingPlaneLimit?: number;
  /** Require each caster draw to be confirmed by the device, or throw. */
  readonly checkedSubmission?: boolean;
  /** Camera-space inputs used only for a logarithmic depth pass. */
  readonly depthViewMatrix?: Float32Array | readonly number[];
  readonly depthRange?: { readonly near: number; readonly far: number };
  /**
   * PRD-02 C-11 (flag A3D_QR_LIGHTING): resolves the depth-variant key per
   * caster; when set, programs compose from the key + `depthVariantFeatures`
   * instead of the fixed lean depth shader. Flag-off callers omit this and the
   * pass is byte-identical to before.
   */
  readonly variantResolver?: (item: RenderItem) => ShadowCasterVariantKey;
  readonly depthVariantFeatures?: readonly DepthVariantFeature[];
  /** Scissor rect (px) applied to every draw — atlas tile rendering. */
  readonly scissor?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /**
   * Frame time for `castShadow` custom-material casters. The renderer supplies
   * the same value to forward and depth passes; standalone passes default to 0.
   */
  readonly timeSeconds?: number;
}

/** A one-use clipping snapshot bound to one pass, device and active frame. */
export interface PreparedDepthPlan {
  /** Abandon the plan and release its retained transient geometry. Idempotent. */
  dispose(): void;
}

/**
 * GU47 E-D: the depth program of a `material.custom({ castShadow: true })` caster (`customDepthShaderKey` on the engine's
 * custom material: its baked vertex stage with a depth-only fragment, published in the global shader-source registry).
 * Undefined for every other material, which keeps the position-only depth program.
 */
export function customDepthShaderKeyOf(material: RenderItem["material"] | undefined): string | undefined {
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  if (!base || base.disposed) return undefined;
  const key = (base as { readonly customDepthShaderKey?: unknown }).customDepthShaderKey;
  return typeof key === "string" && key.length > 0 ? key : undefined;
}

export class DepthMaterial extends Material {
  constructor() {
    super({
      name: "depth",
      shaderKey: DEFAULT_DEPTH_SHADER_NAME,
      parameters: {
        u_modelViewProjection: identityMatrix()
      },
      requiredAttributes: ["a_position"],
      uniformSchema: [{ name: "u_modelViewProjection", kind: "mat4" }]
    });
  }
}

const DEPTH_INSTANCE_ATTRIBUTE_NAMES = ["a_instanceMatrix0", "a_instanceMatrix1", "a_instanceMatrix2", "a_instanceMatrix3"] as const;

/** Most dense casters kept resident per device; the least recently drawn one is disposed past this. */
export const DEPTH_INSTANCE_BUFFER_CACHE_LIMIT = 64;

/**
 * SI-6: persistent per-caster instance buffers for dense (attribute-mode) depth draws, per device. The key is the caster's
 * `instanceTransforms` array, which the renderer passes through from the node unchanged frame to frame. Every cascade draws the same
 * casters, so after the first cascade of a frame `InstanceBuffer.setMatrices` finds identical contents and skips the upload, and the VAO
 * keyed by the buffer id stays cached. Before this each dense caster created and disposed a vertex buffer and a VAO per cascade per frame.
 * Map order is LRU order (a hit is re-inserted at the end).
 */
type DepthInstanceEntry = { readonly buffer: InstanceBuffer; readonly capacity: number };
const depthInstanceBuffers = new WeakMap<RenderDevice, Map<object, { plain?: DepthInstanceEntry; colored?: DepthInstanceEntry }>>();
const validatedGraphSkinning = new WeakMap<RenderItem["geometry"], {
  readonly jointCount: number;
  readonly instanceCount: number;
  readonly vertexCount: number;
  readonly format: object;
  readonly buffers: readonly { readonly buffer: object; readonly revision: number }[];
}>();

export function depthInstanceBufferFor(device: RenderDevice, key: object, matrices: Float32Array, colors?: Float32Array): InstanceBuffer {
  let cache = depthInstanceBuffers.get(device);
  if (!cache) {
    cache = new Map();
    depthInstanceBuffers.set(device, cache);
  }
  const count = Math.floor(matrices.length / 16);
  let variants = cache.get(key);
  if (variants) cache.delete(key);
  else variants = {};
  const variant = colors ? "colored" : "plain";
  let entry = variants[variant];
  const bound = entry?.buffer.bind();
  if (!entry || entry.capacity < count || bound?.matrixBuffer.disposed || (colors && bound?.colorBuffer?.disposed)) {
    entry?.buffer.dispose();
    const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    entry = { buffer: new InstanceBuffer(device, capacity, { colors: colors !== undefined }), capacity };
    variants[variant] = entry;
  }
  cache.set(key, variants);
  while (cache.size > DEPTH_INSTANCE_BUFFER_CACHE_LIMIT) {
    const [oldestKey, oldest] = cache.entries().next().value as [object, { plain?: DepthInstanceEntry; colored?: DepthInstanceEntry }];
    cache.delete(oldestKey);
    oldest.plain?.buffer.dispose();
    oldest.colored?.buffer.dispose();
  }
  entry.buffer.setMatrices(matrices, count);
  if (colors) entry.buffer.setColors(colors);
  return entry.buffer;
}

/** Test and diagnostics hook: how many dense-caster instance buffers the device keeps resident. */
export function depthInstanceBufferCount(device: RenderDevice): number {
  return depthInstanceBuffers.get(device)?.size ?? 0;
}

function requireCheckedSubmission(device: RenderDevice): NonNullable<RenderDevice["drawChecked"]> {
  const drawChecked = device.drawChecked;
  if (typeof drawChecked !== "function") {
    throw new RenderDeviceError("Checked depth submission is unavailable on this device", "DEPTH_CHECKED_SUBMISSION_UNAVAILABLE");
  }
  return drawChecked;
}

function selectDepthCasterGeometry(source: RenderItem, customKey: string | undefined): RenderItem {
  const alphaCutoff = source.material?.getParameter("u_alphaCutoff");
  const needsSourceGeometry = customKey !== undefined || source.skinning !== undefined
    || source.geometry.vertexBuffer.format.streams.length > 1
    || (typeof alphaCutoff === "number" && alphaCutoff > 0);
  return !needsSourceGeometry && source.shadowGeometry !== undefined && source.drawRange === undefined
    ? { ...source, geometry: source.shadowGeometry } : source;
}

type GraphDepthMaterial = Material & {
  readonly graphMaterial?: boolean;
  readonly graphRequiresWebGPU?: boolean;
  readonly graphStorageBindings?: (pass: "forward" | "depth") => readonly NativeStorageBinding[];
  readonly graphSkinningDepthShaderKeys?: { readonly four: string; readonly eight: string };
  readonly graphSkinningVariant?: (influences: 4 | 8, first: "float" | "uint" | "sint", second: "float" | "uint" | "sint", pass: "forward" | "depth") => string | undefined;
};

function graphSkinningDepthKey(source: RenderItem, material: GraphDepthMaterial, inputs: readonly [GraphJointInput, GraphJointInput]): string {
  const influences = source.skinning!.extraInfluences ? 8 : 4;
  const key = material.graphSkinningVariant?.(influences, inputs[0], inputs[1], "depth")
    ?? (inputs[0] === "float" && inputs[1] === "float"
      ? (influences === 8 ? material.graphSkinningDepthShaderKeys?.eight : material.graphSkinningDepthShaderKeys?.four)
      : undefined);
  if (!key) throw new RenderDeviceError("Graph depth shader does not provide the requested skinning variant", "DEPTH_CUSTOM_SKINNING_UNSUPPORTED", { label: source.label });
  return key;
}

function depthUsesGeometryMatrix(source: RenderItem): boolean {
  const base = source.material instanceof MaterialInstance ? source.material.baseMaterial : source.material;
  return customDepthShaderKeyOf(source.material) === undefined
    || (base instanceof PortableShaderMaterial && base.graphMaterial && base.graphSourcesPristine);
}

const depthDegradedWarned = new Set<string>();
function warnDepthDegradedOnce(code: string, label: string | undefined, detail: string): void {
  if (depthDegradedWarned.has(code)) return;
  depthDegradedWarned.add(code);
  console.warn(`${code}: "${label ?? "unlabelled item"}" ${detail}`);
}
/**
 * Point casters draw in WebGPU depth and shadow passes as point-list primitives through the ordinary depth program,
 * matching WebGL2: the depth programs never write gl_PointSize, so a GL point caster rasterizes one-pixel points, which
 * is exactly what a WebGPU point list does. Only a clipped point caster (WebGL2 rebuilds it through the specialized
 * clipped-point path, which has no WebGPU twin) is still left out, with one warning outside strict mode instead of
 * failing every frame with WEBGPU_POINT_DEPTH_UNSUPPORTED. Strict keeps the error.
 */
export function skipWebGPUPointDepthCaster(source: RenderItem, device: RenderDevice): boolean {
  if (device.kind !== "webgpu" || isEnginePackedBatchItem(source) || rendererQrFlags(device).on("A3D_QR_STRICT")) return false;
  if (!webgpuPointDepthCaster(source)) return false;
  const base = source.material instanceof MaterialInstance ? source.material.baseMaterial : source.material;
  const clipped = source.globalClipping != null || source.materialClipping != null
    || (base as (typeof base & { readonly clipping?: unknown }) | undefined)?.clipping != null;
  if (!clipped) return false;
  warnDepthDegradedOnce("WEBGPU_POINT_DEPTH_SKIPPED", source.label, "is a clipped point caster; WebGPU has no clipped point depth program yet, so it is left out of depth and shadow passes.");
  return true;
}

/** The caster itself is points, or its selected shadow proxy is. */
function webgpuPointDepthCaster(source: RenderItem): boolean {
  return source.geometry.topology === "points" || (source.shadowGeometry?.topology === "points"
    && selectDepthCasterGeometry(source, customDepthShaderKeyOf(source.material)).geometry === source.shadowGeometry);
}
function warnAlphaHashDegradedOnce(label: string | undefined): void {
  warnDepthDegradedOnce("DEPTH_ALPHA_HASH_DEGRADED", label, "is a blended shadow caster; alpha-hashed depth has no implementation here, so it casts as an opaque caster.");
}

/** Select the same base-map and vertex-alpha inputs as the forward material. */
export function depthAlphaVariantForItem(item: RenderItem, key: ShadowCasterVariantKey, device: RenderDevice): ShadowCasterVariantKey {
  try {
    return depthAlphaVariantContract(item, key, device);
  } catch (error) {
    // The masked-depth contract could not reproduce the forward coverage (specialized primitive, packed member, per-instance
    // alpha, alpha providers, legacy program). That is an optional shadow/depth refinement, not invalid input: outside strict
    // mode the caster is drawn as an opaque caster (a conservative, slightly blockier shadow) and the frame still renders.
    if (!(error instanceof RenderDeviceError) || !MASKED_DEPTH_DEGRADABLE.has(error.code) || rendererQrFlags(device).on("A3D_QR_STRICT")) throw error;
    warnDepthDegradedOnce("DEPTH_ALPHA_MASK_DEGRADED", item.label, `uses a masked depth contract this device cannot reproduce (${error.code}); it casts as an opaque caster.`);
    const features: Record<string, string | number | boolean> = { ...key.features };
    delete features["prd02.depthAlphaMap"];
    delete features["prd02.depthAlphaVertex"];
    delete features["prd02.depthAlphaMember"];
    return { ...key, alphaTest: false, alphaHash: false, features };
  }
}

const MASKED_DEPTH_DEGRADABLE: ReadonlySet<string> = new Set([
  "DEPTH_ALPHA_SPECIALIZED_GEOMETRY_UNSUPPORTED", "DEPTH_PACKED_MEMBER_UNSUPPORTED", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED",
  "DEPTH_ALPHA_PROVIDER_UNSUPPORTED", "DEPTH_ALPHA_FORWARD_MODE_UNSUPPORTED", "DEPTH_ALPHA_FORWARD_PROGRAM_UNSUPPORTED"
]);

function depthAlphaVariantContract(item: RenderItem, key: ShadowCasterVariantKey, device: RenderDevice): ShadowCasterVariantKey {
  if (key.alphaHash) {
    // 4.7.x drew a blended caster as an ordinary opaque caster. Keep that outside strict mode instead of failing the frame.
    if (rendererQrFlags(device).on("A3D_QR_STRICT")) throw new RenderDeviceError("Alpha-hashed depth has no implementation", "DEPTH_ALPHA_HASH_UNSUPPORTED", { label: item.label });
    warnAlphaHashDegradedOnce(item.label);
    key = { ...key, alphaHash: false };
  }
  if (!key.alphaTest) return key;
  const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
  if (base?.renderState.alphaToCoverage) {
    // A shadow/depth caster has no multisample coverage to match; 4.7.x used the plain alpha-test cutoff for it.
    if (rendererQrFlags(device).on("A3D_QR_STRICT")) throw new RenderDeviceError("Alpha-to-coverage depth requires matching multisample coverage", "DEPTH_ALPHA_COVERAGE_UNSUPPORTED", { label: item.label });
    warnDepthDegradedOnce("DEPTH_ALPHA_COVERAGE_DEGRADED", item.label, "uses alpha-to-coverage; its depth/shadow pass uses the alpha-test cutoff instead.");
  }
  if (item.geometry.topology === "points" || base?.shaderKey === DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME || item.material?.getParameter("u_spriteMode") === 1) {
    throw new RenderDeviceError("Masked depth requires matching specialized primitive coverage", "DEPTH_ALPHA_SPECIALIZED_GEOMETRY_UNSUPPORTED", { label: item.label });
  }
  if (key.features["prd02.depthAlphaMember"] !== undefined) {
    throw new RenderDeviceError("Packed member depth alpha requires an authenticated loop carrier", "DEPTH_PACKED_MEMBER_UNSUPPORTED", { label: item.label });
  }
  let singleInstanceAlpha: number | undefined;
  if (item.instanceTransforms && item.instanceColors && materialInstanceColorTarget(item.material) !== "emissive") {
    const count = item.instanceTransforms.length / 16;
    if (!Number.isSafeInteger(count) || item.instanceColors.length !== count * 4
      || Array.from(item.instanceColors).some((value) => !Number.isFinite(value))) {
      throw new RenderDeviceError("Depth alpha does not support nontrivial per-instance color alpha", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: item.label });
    }
    if (Array.from({ length: count }, (_, index) => item.instanceColors![index * 4 + 3]).some((alpha) => alpha !== 1)) {
      // A single instance can use the already-available member-alpha uniform.
      // Multiple colors require a depth instance-color stream instead: using
      // one uniform for them would give the wrong coverage.
      if (count !== 1 || !key.instanced || (item.instanceCount !== undefined && item.instanceCount !== 1)
        || Array.from(item.instanceTransforms).some((value) => !Number.isFinite(value))
        || item.geometry.vertexBuffer.format.streams.some((stream) => stream.stepMode === "instance")
        || item.instanceAttributes !== undefined || item.skinning !== undefined
        || item.morphTargets !== undefined || item.morphWeights !== undefined
        || (base?.renderState.cullMode !== "none" && instancedItemNeedsPerInstanceCullState(item, depthUsesGeometryMatrix(item)))
        || materialInstanceColorTarget(item.material) !== "base") {
        throw new RenderDeviceError("Depth alpha does not support nontrivial per-instance color alpha", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: item.label });
      }
      singleInstanceAlpha = item.instanceColors[3]!;
    }
  }
  if (item.instanceAttributes?.some((attribute) => attribute.shaderName === "a_instanceColor")) {
    throw new RenderDeviceError("Depth alpha does not support a custom instance-color stream", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: item.label });
  }
  if (singleInstanceAlpha !== undefined && (!base || !item.material)) {
    throw new RenderDeviceError("Single-instance depth alpha requires a matching native generated forward program", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: item.label });
  }
  const features: Record<string, string | number | boolean> = { ...key.features };
  delete features["prd02.depthAlphaMap"];
  delete features["prd02.depthAlphaVertex"];
  if (base && item.material) {
    const context = { flags: rendererQrFlags(device), tier: QUALITY_TIERS.high };
    if (item.onBeforeRender || hasForwardDrawHooks()) {
      throw new RenderDeviceError("Masked depth requires stable forward alpha providers", "DEPTH_ALPHA_PROVIDER_UNSUPPORTED", { label: item.label });
    }
    const materialFeatures = withLiveAlphaCutoff(withLivePhysicalMapFeatures(base.programFeatures(context), item.material, context), item.material);
    const route = { core: qrCoreGeneratorOn(context.flags), lobes: qrMaterialsLobeProgramsOn(context.flags) };
    const liveExtensions = route.lobes && item.material instanceof MaterialInstance ? materialFeatures.extensions : undefined;
    if (materialRoutesToGeneratedProgram(base, route, context, liveExtensions)) {
      if (materialFeatures.alphaMode !== "mask") {
        throw new RenderDeviceError("Masked depth does not match the forward alpha mode", "DEPTH_ALPHA_FORWARD_MODE_UNSUPPORTED", { label: item.label });
      }
      const selected = selectShaderFeatureBits({ item, pass: "forward", ...context });
      for (const feature of shaderFeaturesFor(context.flags)) {
        if (!feature.hooks.some((hook) => hook === "fragment:material" || hook === "fragment:alpha")) continue;
        if (selected[feature.id] !== undefined || materialFeatures.features[feature.id] !== undefined) {
          // Alpha-to-coverage is a multisample refinement of the same cutoff: the depth pass can use the plain cutoff (as 4.7.x did).
          if (feature.id === ALPHA_TO_COVERAGE_FEATURE && !rendererQrFlags(device).on("A3D_QR_STRICT")) {
            warnDepthDegradedOnce("DEPTH_ALPHA_COVERAGE_DEGRADED", item.label, "uses alpha-to-coverage; its depth/shadow pass uses the alpha-test cutoff instead.");
            continue;
          }
          throw new RenderDeviceError("Masked depth cannot reproduce a forward alpha feature", "DEPTH_ALPHA_PROVIDER_UNSUPPORTED", { label: item.label, feature: feature.id });
        }
      }
      const has = (name: string) => item.geometry.vertexBuffer.format.attributes.some((attribute) => attribute.shaderName === name || `a_${attribute.semantic}` === name);
      const geometryFeatures = featuresForGeometry(materialFeatures, has);
      const map = geometryFeatures.maps.baseColor;
      if (map) features["prd02.depthAlphaMap"] = map.uvSet;
      if (geometryFeatures.vertexColors || (materialFeatures.lighting === "lit" && physicalVertexColorsForGeometry(item.geometry, device))) {
        features["prd02.depthAlphaVertex"] = true;
      }
      if (singleInstanceAlpha !== undefined) {
        const supported = [UnlitMaterial.prototype, PBRMaterial.prototype, TexturedPBRMaterial.prototype,
          InstancedUnlitMaterial.prototype, InstancedPBRMaterial.prototype].includes(Object.getPrototypeOf(base));
        // The WebGL generated-program path can fall back to an authored
        // legacy shader after compilation fails. Only native generated
        // shaders currently make the color operation unambiguous here.
        // A base map is excluded because the native unlit and depth programs
        // multiply the map and instance alpha in different orders.
        if (device.kind !== "webgpu" || !supported || map || materialFeatures.extensions.length > 0 || base.shaderVariant !== undefined
          || (item.material instanceof MaterialInstance && Object.getPrototypeOf(item.material) !== MaterialInstance.prototype)) {
          throw new RenderDeviceError("Single-instance depth alpha requires a matching native generated forward program", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: item.label });
        }
        features["prd02.depthAlphaMember"] = true;
      }
    } else {
      if (singleInstanceAlpha !== undefined) {
        throw new RenderDeviceError("Single-instance depth alpha requires a matching native generated forward program", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: item.label });
      }
      // These legacy shaders use constant material alpha and (except the
      // instanced-PBR shader) the vertex color, but do not sample a base map.
      const supported = [DEFAULT_UNLIT_SHADER_NAME, DEFAULT_PBR_SHADER_NAME, DEFAULT_INSTANCED_UNLIT_SHADER_NAME, DEFAULT_INSTANCED_PBR_SHADER_NAME];
      if (!supported.includes(base.shaderKey) || base.shaderVariant !== undefined) {
        throw new RenderDeviceError("Masked depth cannot match this legacy forward program", "DEPTH_ALPHA_FORWARD_PROGRAM_UNSUPPORTED", { label: item.label });
      }
      if (base.shaderKey !== DEFAULT_INSTANCED_PBR_SHADER_NAME && physicalVertexColorsForGeometry(item.geometry, device)) {
        features["prd02.depthAlphaVertex"] = true;
      }
    }
  }
  return { ...key, features };
}

function depthAlphaUniformsForItem(item: RenderItem, key: ShadowCasterVariantKey): ReadonlyMap<string, UniformValue> {
  const material = item.material;
  const cutoff = material?.getParameter("u_alphaCutoff");
  if (typeof cutoff !== "number" || !Number.isFinite(cutoff) || cutoff <= 0) {
    throw new RenderDeviceError("Masked depth requires a positive finite alpha cutoff", "DEPTH_ALPHA_INPUT_INVALID", { label: item.label });
  }
  const vector = (name: string, fallback: readonly number[]): readonly number[] | Float32Array | Int32Array | Uint32Array => {
    const value = material?.getParameter(name) ?? fallback;
    if (typeof value === "number" || isTextureBinding(value) || value.length !== fallback.length || !Array.from(value).every(Number.isFinite)) {
      throw new RenderDeviceError("Masked depth has an invalid alpha input", "DEPTH_ALPHA_INPUT_INVALID", { label: item.label, uniform: name });
    }
    return value;
  };
  const uniforms = new Map<string, UniformValue>([["u_alphaCutoff", cutoff], ["u_baseColor", vector("u_baseColor", [1, 1, 1, 1])]]);
  if (key.features["prd02.depthAlphaMember"] === true) {
    const color = item.instanceColors;
    if (!item.instanceTransforms || item.instanceTransforms.length !== 16 || !color || color.length !== 4
      || Array.from(color).some((value) => !Number.isFinite(value))
      || (item.instanceCount !== undefined && item.instanceCount !== 1)
      || Array.from(item.instanceTransforms).some((value) => !Number.isFinite(value))
      || item.geometry.vertexBuffer.format.streams.some((stream) => stream.stepMode === "instance")
      || item.instanceAttributes !== undefined || item.skinning !== undefined
      || item.morphTargets !== undefined || item.morphWeights !== undefined
      || materialInstanceColorTarget(material) !== "base") {
      throw new RenderDeviceError("Single-instance depth alpha changed during the draw", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: item.label });
    }
    uniforms.set("u_a3dPackedLoopColor", [1, 1, 1, color[3]!]);
  }
  if (key.features["prd02.depthAlphaMap"] !== undefined) {
    const value = material?.getParameter("u_baseColorTexture");
    if (value !== undefined && !isTextureBinding(value)) {
      throw new RenderDeviceError("Masked depth requires a texture binding for the base-color map", "DEPTH_ALPHA_INPUT_INVALID", { label: item.label });
    }
    const texture = value ?? new TextureBinding({ name: "u_baseColorTexture", required: false });
    if (!texture.validate().ok) throw new RenderDeviceError("Masked depth base-color texture is unavailable", "DEPTH_ALPHA_INPUT_INVALID", { label: item.label });
    const rotation = material?.getParameter("u_baseColorTextureRotation") ?? texture.rotation;
    if (typeof rotation !== "number" || !Number.isFinite(rotation)) {
      throw new RenderDeviceError("Masked depth texture rotation must be finite", "DEPTH_ALPHA_INPUT_INVALID", { label: item.label });
    }
    uniforms.set("u_baseColorTexture", texture);
    uniforms.set("u_baseColorTextureOffset", vector("u_baseColorTextureOffset", texture.offset));
    uniforms.set("u_baseColorTextureScale", vector("u_baseColorTextureScale", texture.scale));
    uniforms.set("u_baseColorTextureRotation", rotation);
  } else {
    // Preserve the legacy no-map sampler packet without sampling it in the shader.
    uniforms.set("u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", required: false }));
  }
  return uniforms;
}

function stableClippingProperty(source: unknown, name: string): unknown {
  if ((typeof source !== "object" && typeof source !== "function") || source === null) return undefined;
  for (let object: object | null = source; object !== null; object = Object.getPrototypeOf(object) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    if (!descriptor) continue;
    if (!("value" in descriptor)) {
      throw new RenderDeviceError("Clipping accessors cannot be evaluated consistently across depth targets", "DEPTH_CLIPPING_ACCESSOR_UNSUPPORTED", { property: name });
    }
    return descriptor.value;
  }
  return undefined;
}

function assertStableClippingGroup(group: unknown): void {
  if (group == null) return;
  const planes = stableClippingProperty(group, "planes");
  for (const name of ["scope", "space", "combine", "clipShadows", "enabled", "disposed"]) stableClippingProperty(group, name);
  if (!Array.isArray(planes)) return; // The regular clipping validator reports malformed groups.
  if (stableClippingProperty(planes, "map") !== Array.prototype.map) {
    throw new RenderDeviceError("Custom clipping plane array methods are unavailable across depth targets", "DEPTH_CLIPPING_ACCESSOR_UNSUPPORTED");
  }
  const length = stableClippingProperty(planes, "length") as number;
  for (let index = 0; index < length; index += 1) {
    const plane = stableClippingProperty(planes, String(index));
    if (!Array.isArray(plane)) continue;
    if (stableClippingProperty(plane, "every") !== Array.prototype.every) {
      throw new RenderDeviceError("Custom clipping plane array methods are unavailable across depth targets", "DEPTH_CLIPPING_ACCESSOR_UNSUPPORTED");
    }
    const planeLength = stableClippingProperty(plane, "length") as number;
    // Invalid dimensions are rejected before the regular validator reads coefficients.
    if (planeLength === 4) for (let coefficient = 0; coefficient < 4; coefficient += 1) stableClippingProperty(plane, String(coefficient));
  }
}

/** Reject clipping getters before a legacy or multi-target pass reads them more than once. */
export function assertStableDepthClippingInputs(source: RenderItem, options?: Pick<DepthPassOptions, "globalClipping">): void {
  const global = stableClippingProperty(source, "globalClipping") ?? stableClippingProperty(options, "globalClipping");
  let material = stableClippingProperty(source, "materialClipping");
  if (material == null) {
    const itemMaterial = stableClippingProperty(source, "material");
    const base = itemMaterial instanceof MaterialInstance ? stableClippingProperty(itemMaterial, "baseMaterial") : itemMaterial;
    material = stableClippingProperty(base, "clipping");
  }
  assertStableClippingGroup(global);
  assertStableClippingGroup(material);
}

/** Validate packed depth and clipping contracts before a target is touched. */
export function assertDepthClippingSupported(source: RenderItem, clip: ClippingBinding, device: RenderDevice): void {
  if (isEnginePackedBatchItem(source) || (source as RenderItem & { readonly multiDraw?: unknown }).multiDraw !== undefined) {
    throw new RenderDeviceError("Packed multi-draw depth geometry has no per-member transform support",
      clip.groups.length > 0 ? "DEPTH_CLIPPING_BATCH_UNSUPPORTED" : "DEPTH_MULTIDRAW_PROGRAM_UNSUPPORTED", { label: source.label });
  }
  const selectedPointProxy = source.shadowGeometry?.topology === "points" && (device.kind === "webgpu" || clip.groups.length > 0)
    && selectDepthCasterGeometry(source, customDepthShaderKeyOf(source.material)).geometry === source.shadowGeometry;
  const pointGeometry = source.geometry.topology === "points" || selectedPointProxy;
  // Unclipped point casters draw as one-pixel point lists (see skipWebGPUPointDepthCaster); clipped ones have no twin.
  if (device.kind === "webgpu" && pointGeometry && clip.groups.length > 0) {
    throw new RenderDeviceError("WebGPU clipped point depth requires a scene-raster point quad program and retained geometry lease", "WEBGPU_POINT_DEPTH_UNSUPPORTED", { label: source.label });
  }
  if (clip.groups.length === 0) return;
  const base = source.material instanceof MaterialInstance ? source.material.baseMaterial : source.material;
  const specialized = specializedClippedPrimitive(source, DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME);
  if (specialized) {
    // Point proxies cannot be clipped by their source centres; the clipped
    // draw uses the point geometry itself (see clippedDepthCaster).
    if (specialized === "line" && (!(base instanceof ScreenSpaceLineMaterial) || base.shaderVariant !== undefined)) {
      throw new RenderDeviceError("Clipped screen-space line depth requires the built-in line material", "DEPTH_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED", { label: source.label });
    }
    assertSpecializedClippedDepthItem(source, specialized, clip);
    return;
  }
  if (pointGeometry) {
    throw new RenderDeviceError("Clipping is unavailable for point, screen-space line and billboard sprite depth geometry used as a shadow proxy of other geometry", "DEPTH_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED", { label: source.label });
  }
  if (source.instanceTransforms && base?.renderState.cullMode !== "none" && hasInstanceVertexStreams(source)
    && instancedItemNeedsPerInstanceCullState(source, depthUsesGeometryMatrix(source))) {
    throw new RenderDeviceError("Per-instance vertex streams cannot be expanded for mixed culling", "INSTANCE_STREAM_EXPANSION_UNSUPPORTED", { label: source.label });
  }
  const graph = base as GraphDepthMaterial | undefined;
  if (graph?.graphMaterial) {
    if (!PortableShaderMaterial.hasGraphClippingContract(graph)) {
      throw new RenderDeviceError("The graph does not provide a certified depth clipping program", "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED", { label: source.label });
    }
    const key = source.skinning ? graphSkinningDepthKey(source, graph, graphDepthJointInputs(source, device)) : customDepthShaderKeyOf(source.material);
    if (key && !PortableShaderMaterial.hasGraphClippingContract(graph, key, "depth")) {
      throw new RenderDeviceError("The selected graph depth shader does not preserve clipping", "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED", { label: source.label, key });
    }
  }
}

interface PreparedDepthEntry {
  readonly source: RenderItem;
  readonly drawSource: RenderItem;
  readonly clip: ClippingBinding;
  readonly ownedGeometry?: Geometry;
  readonly valid?: () => boolean;
}

interface PreparedDepthState {
  readonly owner: DepthPass;
  readonly device: RenderDevice;
  readonly frameToken: object;
  readonly generation: number | undefined;
  readonly width: number;
  readonly height: number;
  readonly serial: number;
  readonly entries: PreparedDepthEntry[];
  readonly validOptions: () => boolean;
  status: "ready" | "consumed" | "disposed";
}

const preparedDepthStates = new WeakMap<PreparedDepthPlan, PreparedDepthState>();

function releasePreparedDepthEntries(entries: PreparedDepthEntry[]): void {
  const errors: unknown[] = [];
  for (const entry of entries) {
    try { entry.ownedGeometry?.dispose(); } catch (error) { errors.push(error); }
  }
  entries.length = 0;
  if (errors.length) throw new AggregateError(errors, "Prepared depth geometry disposal failed");
}

class PreparedDepthHandle implements PreparedDepthPlan {
  dispose(): void {
    const state = preparedDepthStates.get(this);
    if (!state || state.status !== "ready") return;
    state.status = "disposed";
    releasePreparedDepthEntries(state.entries);
  }
}

/** Preserve a callback's deformed geometry without retaining shared morph scratch. */
function snapshotDepthGeometry(geometry: Geometry): Geometry {
  const buffers: VertexBuffer[] = [];
  let index: IndexBuffer | null = null;
  try {
    const format = geometry.vertexBuffer.format;
    for (const stream of format.streams) {
      const source = geometry.getVertexBuffer(stream.slot);
      const buffer = new VertexBuffer(format, source.vertexCount, stream.slot);
      new Uint8Array(buffer.data).set(new Uint8Array(source.data));
      buffers.push(buffer);
    }
    if (geometry.indexBuffer) index = new IndexBuffer(Array.from(geometry.indexBuffer.data), geometry.vertexBuffer.vertexCount);
    const bounds = { min: [...geometry.bounds.min] as [number, number, number], max: [...geometry.bounds.max] as [number, number, number] };
    const result = new Geometry(buffers[0]!, index, geometry.topology, bounds, buffers.slice(1));
    result.drawRange = geometry.drawRange;
    result.groups = geometry.groups;
    result.morphTargets = geometry.morphTargets;
    return result;
  } catch (error) {
    for (const buffer of buffers) buffer.dispose();
    index?.dispose();
    throw error;
  }
}

function sameNumbers(current: ArrayLike<number> | undefined, snapshot: readonly number[] | undefined): boolean {
  if (current === undefined || snapshot === undefined) return current === undefined && snapshot === undefined;
  if (current.length !== snapshot.length) return false;
  for (let index = 0; index < snapshot.length; index += 1) if (!Object.is(current[index], snapshot[index])) return false;
  return true;
}

function recursiveMaterialParameters(material: Material | MaterialInstance): ReadonlyMap<string, RecursiveUniformValue> {
  return material.getRecursiveParameters();
}

function captureGeometryValidity(geometry: Geometry | undefined): () => boolean {
  if (!geometry) return () => true;
  const format = geometry.vertexBuffer.format;
  const topology = geometry.topology;
  const buffers = format.streams.map((stream) => {
    const buffer = geometry.getVertexBuffer(stream.slot);
    const semantic = format.attributes.find((attribute) => attribute.bufferSlot === stream.slot)!.semantic;
    buffer.getAttribute(0, semantic); // Also reject a disposed stream at preparation.
    return { slot: stream.slot, buffer, semantic, revision: buffer.revision };
  });
  const index = geometry.indexBuffer;
  const indexRevision = index?.revision;
  return () => {
    try {
      if (geometry.vertexBuffer.format !== format || geometry.topology !== topology || geometry.indexBuffer !== index || index?.revision !== indexRevision) return false;
      for (const entry of buffers) {
        const buffer = geometry.getVertexBuffer(entry.slot);
        if (buffer !== entry.buffer || buffer.revision !== entry.revision) return false;
        buffer.getAttribute(0, entry.semantic);
      }
      return true;
    } catch { return false; }
  };
}

function captureMaterialValidity(material: RenderItem["material"]): () => boolean {
  if (!material) return () => true;
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  const revision = base.getRevision();
  const shaderKey = base.shaderKey, shaderVariant = base.shaderVariant;
  const cullMode = base.renderState.cullMode;
  const blend = base.renderState.blend, blendMode = base.renderState.blendMode, alphaToCoverage = base.renderState.alphaToCoverage;
  const attributes = [...base.requiredAttributes];
  const graphPristine = base instanceof PortableShaderMaterial ? base.graphSourcesPristine : undefined;
  const graphRequiresWebGPU = base instanceof PortableShaderMaterial ? base.graphRequiresWebGPU : undefined;
  // The renderer's shared parameter snapshot keeps its identity until a parameter changes (Material.setParameterValue is
  // the only writer and keeps the snapshot only for an identical value), so an unchanged identity proves unchanged values
  // without rebuilding and comparing a cloned parameter map on every check. Texture bindings are borrowed, so their
  // texture revision and transform are still compared on every check.
  const snapshot = material.parameterSnapshot();
  const params = [...snapshot].map(([name, value]) => ({
    name,
    value,
    textureRevision: isTextureBinding(value) ? value.texture?.revision : undefined,
    textureDisposed: isTextureBinding(value) ? value.texture?.disposed : undefined,
    textureOffset: isTextureBinding(value) ? [...value.offset] : undefined,
    textureScale: isTextureBinding(value) ? [...value.scale] : undefined,
    textureRotation: isTextureBinding(value) ? value.rotation : undefined
  }));
  const textureParams = params.filter((entry) => isTextureBinding(entry.value));
  const storage = base instanceof PortableShaderMaterial && graphRequiresWebGPU
    ? base.graphStorageBindings("depth").map((binding) => ({ ...binding })) : undefined;
  return () => {
    try {
      if (base.disposed || base.getRevision() !== revision || base.shaderKey !== shaderKey || base.shaderVariant !== shaderVariant || base.renderState.cullMode !== cullMode
        || base.renderState.blend !== blend || base.renderState.blendMode !== blendMode || base.renderState.alphaToCoverage !== alphaToCoverage
        || base.requiredAttributes.length !== attributes.length || attributes.some((name, index) => base.requiredAttributes[index] !== name)
        || (base instanceof PortableShaderMaterial && (base.graphSourcesPristine !== graphPristine || base.graphRequiresWebGPU !== graphRequiresWebGPU))) return false;
      const current = material.parameterSnapshot();
      const unchanged = current === snapshot;
      if (current.size !== params.length) return false;
      for (const entry of unchanged ? textureParams : params) {
        const value = current.get(entry.name);
        if (isTextureBinding(entry.value)) {
          if (value !== entry.value || entry.value.texture?.disposed || entry.value.texture?.revision !== entry.textureRevision || entry.value.texture?.disposed !== entry.textureDisposed
            || !sameNumbers(entry.value.offset, entry.textureOffset) || !sameNumbers(entry.value.scale, entry.textureScale)
            || entry.value.rotation !== entry.textureRotation) return false;
        } else if (!materialUniformValuesEqual(value, entry.value)) return false;
      }
      if (storage && base instanceof PortableShaderMaterial) {
        const currentStorage = base.graphStorageBindings("depth");
        if (currentStorage.length !== storage.length) return false;
        for (let index = 0; index < storage.length; index += 1) {
          const saved = storage[index]!, value = currentStorage[index]!;
          if (value.kind !== saved.kind || value.name !== saved.name || value.group !== saved.group || value.binding !== saved.binding) return false;
          if (saved.kind === "storage-buffer") {
            if (value.kind !== "storage-buffer" || value.buffer !== saved.buffer || value.offset !== saved.offset || value.size !== saved.size || value.buffer.disposed) return false;
          } else if (value.kind !== "storage-texture" || value.texture !== saved.texture || value.format !== saved.format || value.texture.disposed) return false;
        }
      }
      return true;
    } catch { return false; }
  };
}

function captureCasterValidity(source: RenderItem, library: ShaderLibrary): () => boolean {
  const geometry = source.geometry, shadowGeometry = source.shadowGeometry, material = source.material;
  const geometryValid = captureGeometryValidity(geometry), shadowValid = captureGeometryValidity(shadowGeometry);
  const materialValid = captureMaterialValidity(material);
  const customKey = customDepthShaderKeyOf(material);
  const customSource = customKey ? library.get(customKey) : undefined;
  const customVertex = customSource?.vertex, customFragment = customSource?.fragment, customMarker = customSource?.marker;
  const arrays = [source.modelMatrix, source.geometryMatrix, source.normalMatrix, source.modelViewProjectionMatrix,
    source.instanceTransforms, source.instanceColors, source.morphWeights, source.skinning?.matrices].map((value) => value === undefined ? undefined : Array.from(value));
  const skin = source.skinning, morphTargets = source.morphTargets;
  const jointCount = skin?.jointCount, extraInfluences = skin?.extraInfluences;
  const targetRefs = morphTargets?.map((target) => [target, target.positions, target.normals, target.tangents] as const);
  const instanceCount = source.instanceCount, label = source.label;
  const range = source.drawRange && { start: source.drawRange.start, count: source.drawRange.count };
  return () => {
    const current = [source.modelMatrix, source.geometryMatrix, source.normalMatrix, source.modelViewProjectionMatrix,
      source.instanceTransforms, source.instanceColors, source.morphWeights, source.skinning?.matrices];
    return source.geometry === geometry && source.shadowGeometry === shadowGeometry && source.material === material
      && customDepthShaderKeyOf(source.material) === customKey
      && (!customKey || (library.get(customKey) === customSource && customSource?.vertex === customVertex
        && customSource.fragment === customFragment && customSource.marker === customMarker))
      && source.skinning === skin && source.morphTargets === morphTargets && source.instanceCount === instanceCount && source.label === label
      && (range ? source.drawRange?.start === range.start && source.drawRange.count === range.count : source.drawRange === undefined)
      && (!skin || (source.skinning?.jointCount === jointCount && source.skinning.extraInfluences === extraInfluences))
      && (!targetRefs || (morphTargets?.length === targetRefs.length && targetRefs.every(([target, positions, normals, tangents], index) =>
        morphTargets[index] === target && target.positions === positions && target.normals === normals && target.tangents === tangents)))
      && arrays.every((snapshot, index) => sameNumbers(current[index], snapshot)) && geometryValid() && shadowValid() && materialValid();
  };
}

function captureDepthOptionsValidity(options: DepthPassOptions): () => boolean {
  const casters = [...options.casters];
  const matrices = [options.viewProjectionMatrix, options.depthViewMatrix, options.cameraPosition]
    .map((value) => value === undefined ? undefined : Array.from(value));
  const clippingPass = options.clippingPass, clippingPlaneLimit = options.clippingPlaneLimit;
  const checked = options.checkedSubmission, time = options.timeSeconds;
  const resolver = options.variantResolver, features = options.depthVariantFeatures && [...options.depthVariantFeatures];
  const clipCallback = options.materialClippingFor, library = options.shaderLibrary;
  const convention = options.depthConvention && { ...options.depthConvention };
  const range = options.depthRange && { ...options.depthRange };
  const scissor = options.scissor && { ...options.scissor };
  return () => {
    const current = [options.viewProjectionMatrix, options.depthViewMatrix, options.cameraPosition];
    return options.casters.length === casters.length && casters.every((caster, index) => options.casters[index] === caster)
      && matrices.every((snapshot, index) => sameNumbers(current[index], snapshot))
      && options.clippingPass === clippingPass && options.clippingPlaneLimit === clippingPlaneLimit
      && options.checkedSubmission === checked && options.timeSeconds === time && options.variantResolver === resolver
      && options.materialClippingFor === clipCallback && options.shaderLibrary === library
      && (features ? options.depthVariantFeatures?.length === features.length && features.every((feature, index) => options.depthVariantFeatures?.[index] === feature) : options.depthVariantFeatures === undefined)
      && (convention ? options.depthConvention?.mode === convention.mode && options.depthConvention.clipRange === convention.clipRange
        && options.depthConvention.clearValue === convention.clearValue && options.depthConvention.compare === convention.compare : options.depthConvention === undefined)
      && (range ? options.depthRange?.near === range.near && options.depthRange.far === range.far : options.depthRange === undefined)
      && (scissor ? options.scissor?.x === scissor.x && options.scissor.y === scissor.y && options.scissor.width === scissor.width && options.scissor.height === scissor.height : options.scissor === undefined);
  };
}

export class DepthPass extends BaseRenderPass {
  /**
   * Depth shader modules, shared across `DepthPass` instances and keyed by shader library.
   *
   * `ShadowPass` constructs a **new `DepthPass` every time it renders**, so an instance-field cache
   * was discarded each frame and the depth shader was recompiled and relinked on every shadow pass.
   * WebGL shader compilation is a synchronous GPU stall: measured on the Aura Clash playable route,
   * that single per-frame recompile held the whole route at **2 FPS** with 97.8% of profiled time
   * outside JS, which in turn made every timing-based browser test miss its window.
   *
   * A `WeakMap` keyed by the library keeps the entry alive exactly as long as the library is, so a
   * long-lived renderer compiles the depth shader once while a disposed library is still collectable.
   * This mirrors the per-device/per-library cache `ForwardPass` already uses.
   */
  private static readonly shaderModules = new WeakMap<ShaderLibrary, ShaderModule>();

  /** GU47 E-D: compiled `castShadow` custom depth programs, per library and depth key (keys are content hashes). */
  private static readonly customShaderModules = new WeakMap<ShaderLibrary, Map<string, ShaderModule>>();
  private static readonly configuredShaderModules = new WeakMap<RenderDevice, WeakMap<ShaderLibrary, { revision: number; generation: number; modules: Map<string, ShaderModule> }>>();

  private readonly shaderLibrary: ShaderLibrary;
  private readonly material = new DepthMaterial();
  private frameSize: readonly [number, number] = [1, 1];
  private preparedSerial = 0;

  constructor(private readonly options: DepthPassOptions) {
    super("depth", [], ["depth"]);
    this.shaderLibrary = options.shaderLibrary ?? createLeanCoreShaderLibrary();
  }

  /** Conservative pre-clear gate for legacy devices without frame identity. */
  assertLegacyDepthFallback(context: RenderPassContext): void {
    if (this.options.checkedSubmission) requireCheckedSubmission(context.device);
    const callback = stableClippingProperty(this.options, "materialClippingFor");
    this.assertBatchClippingCallback(expandLogicalBatchItems(this.options.casters), callback);
    for (const caster of this.options.casters) {
      const members = batchMembersFor(caster);
      if (members) {
        if (members.every((member) => member.instanceTransforms !== undefined && member.instanceTransforms.length === 0)) continue;
        throw new RenderDeviceError("Legacy depth fallback cannot submit a packed caster", "DEPTH_LEGACY_FALLBACK_UNSUPPORTED", { label: caster.label });
      }
      if (caster.instanceTransforms !== undefined && caster.instanceTransforms.length === 0) continue;
      if (skipWebGPUPointDepthCaster(caster, context.device)) continue;
      if (isEnginePackedBatchItem(caster) || (caster as RenderItem & { readonly multiDraw?: unknown }).multiDraw !== undefined) {
        throw new RenderDeviceError("Legacy depth fallback cannot submit a packed caster", "DEPTH_LEGACY_FALLBACK_UNSUPPORTED", { label: caster.label });
      }
      if (callback) {
        throw new RenderDeviceError("Legacy depth fallback cannot snapshot a clipping callback", "DEPTH_LEGACY_FALLBACK_UNSUPPORTED");
      }
      assertStableDepthClippingInputs(caster, this.options);
      const base = caster.material instanceof MaterialInstance ? caster.material.baseMaterial : caster.material;
      const clip = createClippingBinding({
        global: caster.globalClipping ?? this.options.globalClipping,
        material: caster.materialClipping ?? (base as (typeof base & { readonly clipping?: ClippingGroupInput }))?.clipping,
        pass: this.options.clippingPass ?? "shadow",
        primitive: caster.geometry.topology === "lines" ? "line" : caster.geometry.topology === "points" ? "point" : "mesh",
        backend: context.device.kind,
        maxPlanes: this.options.clippingPlaneLimit
      });
      if (clip.groups.length > 0) {
        throw new RenderDeviceError("Legacy depth fallback cannot safely submit clipped casters", "DEPTH_LEGACY_FALLBACK_UNSUPPORTED", { label: caster.label });
      }
      assertDepthClippingSupported(caster, clip, context.device);
      const selected = selectDepthCasterGeometry(caster, customDepthShaderKeyOf(caster.material));
      if (selected.geometry !== caster.geometry) assertDepthClippingSupported(selected, clip, context.device);
    }
  }

  execute(context: RenderPassContext): void {
    if (this.options.checkedSubmission) requireCheckedSubmission(context.device);
    this.preparedSerial += 1;
    this.frameSize = [Math.max(1, context.width), Math.max(1, context.height)];
    const entries = this.prepareEntries(context.device, false);
    try { this.drawEntries(context.device, entries); } finally { releasePreparedDepthEntries(entries); }
  }

  /** Snapshot all caster clipping before a caller clears its target. */
  prepare(context: RenderPassContext): PreparedDepthPlan {
    const token = context.device.activeFrameToken;
    if (typeof token !== "object" || token === null || context.device.disposed || context.device.contextLost) {
      throw new RenderDeviceError("Prepared depth requires an active frame identity", "DEPTH_PREPARED_FRAME_UNAVAILABLE");
    }
    if (this.options.checkedSubmission) requireCheckedSubmission(context.device);
    const generation = context.device.generation;
    // Resolve this shared registration before any sibling cascade plan records
    // the library revision; the first draw must not invalidate later plans.
    try { this.shaderLibrary.get(PRD02_DEPTH_SHADER_NAME); } catch { registerPrd02DepthShader(this.shaderLibrary); }
    const validOptions = captureDepthOptionsValidity(this.options);
    const revision = this.shaderLibrary.getRevision();
    const entries = this.prepareEntries(context.device, true);
    try {
      if (context.device.activeFrameToken !== token || context.device.disposed || context.device.contextLost
        || context.device.generation !== generation || !validOptions() || this.shaderLibrary.getRevision() !== revision || entries.some((entry) => !entry.valid?.())) {
        throw new RenderDeviceError("Depth inputs changed while preparing the plan", "DEPTH_PREPARED_PLAN_STALE");
      }
      const handle = new PreparedDepthHandle();
      preparedDepthStates.set(handle, {
        owner: this, device: context.device, frameToken: token, generation,
        width: context.width, height: context.height, serial: ++this.preparedSerial, entries,
        validOptions: () => validOptions() && this.shaderLibrary.getRevision() === revision, status: "ready"
      });
      return Object.freeze(handle);
    } catch (error) {
      releasePreparedDepthEntries(entries);
      throw error;
    }
  }

  /** Check a prepared plan immediately before clearing a target. */
  validatePrepared(context: RenderPassContext, plan: PreparedDepthPlan): void {
    const state = preparedDepthStates.get(plan);
    if (!state || state.owner !== this || state.device !== context.device || state.width !== context.width || state.height !== context.height) {
      throw new RenderDeviceError("Prepared depth plan does not match this pass or context", "DEPTH_PREPARED_PLAN_MISMATCH");
    }
    if (state.status !== "ready") throw new RenderDeviceError("Prepared depth plan was already consumed or disposed", "DEPTH_PREPARED_PLAN_CONSUMED");
    let valid = false;
    try {
      valid = state.serial === this.preparedSerial && !context.device.disposed && !context.device.contextLost
        && context.device.activeFrameToken === state.frameToken && context.device.generation === state.generation
        && state.validOptions() && state.entries.every((entry) => entry.valid?.() === true);
      if (valid) for (const entry of state.entries) {
        assertDepthClippingSupported(entry.source, entry.clip, context.device);
        this.assertCasterAlphaContract(entry.drawSource, context.device);
      }
    } catch { valid = false; }
    if (!valid) {
      plan.dispose();
      throw new RenderDeviceError("Prepared depth plan is stale", "DEPTH_PREPARED_PLAN_STALE");
    }
    if (this.options.checkedSubmission) requireCheckedSubmission(context.device);
  }

  /** Consume one prepared plan; the caller retains target setup/restoration. */
  executePrepared(context: RenderPassContext, plan: PreparedDepthPlan): void {
    this.validatePrepared(context, plan);
    const state = preparedDepthStates.get(plan)!;
    state.status = "consumed";
    this.frameSize = [Math.max(1, context.width), Math.max(1, context.height)];
    try { this.drawEntries(context.device, state.entries); } finally { releasePreparedDepthEntries(state.entries); }
  }

  private prepareEntries(device: RenderDevice, validateResources: boolean): PreparedDepthEntry[] {
    const entries: PreparedDepthEntry[] = [];
    try {
      const logarithmic = this.options.depthConvention?.mode === "logarithmic";
      // Resolve logical members and each clipping callback once before drawing.
      const casters = expandLogicalBatchItems(this.options.casters);
      this.assertBatchClippingCallback(casters, this.options.materialClippingFor);
      for (const source of casters) {
        if (skipWebGPUPointDepthCaster(source, device)) continue;
        const entry = this.preflightCasterClipping(device, source);
        if (entry) {
          entries.push(entry);
          if (validateResources) entries[entries.length - 1] = { ...entry, valid: captureCasterValidity(source, this.shaderLibrary) };
        }
      }
      if (logarithmic && entries.length > 0) this.logDepthUniforms();
      // Later callbacks may have changed an earlier caster or graph source.
      for (const entry of entries) {
        if (entry.valid && !entry.valid()) throw new RenderDeviceError("Depth caster changed during preflight", "DEPTH_PREPARED_PLAN_STALE");
        assertDepthClippingSupported(entry.source, entry.clip, device);
        this.assertCustomDepthContract(entry.source, entry.clip, logarithmic);
        this.assertCasterAlphaContract(entry.drawSource, device);
      }
      return entries;
    } catch (error) {
      releasePreparedDepthEntries(entries);
      throw error;
    }
  }

  private drawEntries(device: RenderDevice, entries: readonly PreparedDepthEntry[]): void {
    // WebGPU records the caster loop into one command encoder (RenderDevice.beginDrawBatch); WebGL2 has no window.
    device.beginDrawBatch?.();
    try {
      for (const entry of entries) this.drawCaster(device, entry.drawSource, entry.clip);
    } finally {
      device.endDrawBatch?.();
    }
  }

  private assertBatchClippingCallback(casters: readonly RenderItem[], callback: unknown): void {
    if (callback && casters.some(isEngineBatchInstanceItem)) {
      throw new RenderDeviceError("Per-member materialClippingFor is unavailable for batched instances", "BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED");
    }
  }

  private assertCustomDepthContract(source: RenderItem, clip: ClippingBinding, logarithmic: boolean): void {
    const base = source.material instanceof MaterialInstance ? source.material.baseMaterial : source.material;
    const key = customDepthShaderKeyOf(source.material);
    if (!key || (base instanceof PortableShaderMaterial && base.graphMaterial) || (clip.groups.length === 0 && !logarithmic)) return;
    const reflected = reflectShaderSources(this.shaderLibrary.compileSource(key)).uniforms;
    const clipUniforms = ["u_a3dClipPlanes", "u_a3dClipGroups", "u_a3dClipGroupCount", "u_a3dClipModel"];
    const logUniforms = ["u_a3dLogDepthView", "u_a3dLogDepthRange", "u_a3dClipModel"];
    if ((clip.groups.length > 0 && clipUniforms.some((name) => !reflected.has(name))) || (logarithmic && logUniforms.some((name) => !reflected.has(name)))) {
      throw new RenderDeviceError("Custom depth shader does not provide the requested clipping/depth contract", "DEPTH_CUSTOM_SHADER_CONTRACT_MISSING", { key });
    }
  }

  private assertCasterAlphaContract(source: RenderItem, device: RenderDevice): void {
    const material = source.material;
    const base = material instanceof MaterialInstance ? material.baseMaterial : material;
    const alphaHash = (this.options.clippingPass ?? "shadow") === "shadow" && base !== undefined
      && (base.renderState.blend === true || (base.renderState.blendMode !== undefined && base.renderState.blendMode !== "opaque"))
      && source.castShadow === true;
    if (alphaHash) {
      if (rendererQrFlags(device).on("A3D_QR_STRICT")) throw new RenderDeviceError("Alpha-hashed depth has no implementation", "DEPTH_ALPHA_HASH_UNSUPPORTED", { label: source.label });
      warnAlphaHashDegradedOnce(source.label);
    }
    const cutoff = material?.getParameter("u_alphaCutoff");
    const alphaTest = typeof cutoff === "number" && cutoff > 0;
    if (customDepthShaderKeyOf(material) && alphaTest) {
      throw new RenderDeviceError("Custom depth alpha coverage has no matching contract", "DEPTH_CUSTOM_ALPHA_UNSUPPORTED", { label: source.label });
    }
    if (customDepthShaderKeyOf(material)) return;
    if (!alphaTest) return;
    const key: ShadowCasterVariantKey = { skinning: 0, skinningTexture: false, morphTargets: false, instanced: Boolean(source.instanceTransforms),
      batched: false, alphaTest, alphaHash: false, doubleSided: false, features: {} };
    const selected = depthAlphaVariantForItem(source, key, device);
    if (selected.alphaTest) depthAlphaUniformsForItem(source, selected);
  }

  private submitDraw(device: RenderDevice, command: DrawCommand): void {
    if (this.options.checkedSubmission) {
      requireCheckedSubmission(device).call(device, command);
    } else {
      device.draw(command);
    }
  }

  private preflightCasterClipping(device: RenderDevice, source: RenderItem): PreparedDepthEntry | undefined {
    if (source.instanceTransforms !== undefined && source.instanceTransforms.length === 0) return undefined;
    const hasMorph = source.morphTargets !== undefined || source.morphWeights !== undefined;
    // Callbacks see the deformed geometry. Retain an independent copy because
    // persistent morph scratch can be shared by different casters or plans.
    if (hasMorph && this.options.materialClippingFor) {
      const geometry = resolveRenderGeometry(source);
      try {
        const prepared = { ...source, geometry, shadowGeometry: undefined, morphTargets: undefined, morphWeights: undefined };
        const clip = this.resolveCasterClipping(device, source, prepared);
        const ownedGeometry = snapshotDepthGeometry(geometry);
        return { source, drawSource: { ...prepared, geometry: ownedGeometry }, clip, ownedGeometry };
      } finally {
        if (geometry !== source.geometry) geometry.dispose();
      }
    }
    const prepared = hasMorph ? { ...source, shadowGeometry: undefined, morphTargets: undefined, morphWeights: undefined } : source;
    return { source, drawSource: source, clip: this.resolveCasterClipping(device, source, prepared) };
  }

  private resolveCasterClipping(device: RenderDevice, source: RenderItem, prepared: RenderItem): ReturnType<typeof createClippingBinding> {
    const caster = selectDepthCasterGeometry(prepared, customDepthShaderKeyOf(prepared.material));
    const base = caster.material instanceof MaterialInstance ? caster.material.baseMaterial : caster.material;
    const materialClipping = this.options.materialClippingFor?.(caster) ?? caster.materialClipping
      ?? (base as (typeof base & { readonly clipping?: ClippingGroupInput }))?.clipping;
    const clip = createClippingBinding({
      global: caster.globalClipping ?? this.options.globalClipping,
      material: materialClipping,
      pass: this.options.clippingPass ?? "shadow",
      primitive: caster.geometry.topology === "lines" ? "line" : caster.geometry.topology === "points" ? "point" : "mesh",
      backend: device.kind,
      maxPlanes: this.options.clippingPlaneLimit
    });
    assertDepthClippingSupported(source, clip, device);
    if (clip.groups.length > 0 && specializedClippedPrimitive(source, DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME) === "line"
      && !certifiedDefaultScreenLineSource(this.shaderLibrary)) {
      throw new RenderDeviceError("Clipped screen-space line depth requires an authenticated line shader source", "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED", { label: source.label });
    }
    // A shadow proxy may have a different primitive than the visible geometry.
    // Check both: the original retains batch provenance, while the selected
    // geometry determines the shader behavior that will actually be submitted.
    if (caster.geometry !== source.geometry) assertDepthClippingSupported(caster, clip, device);
    return clip;
  }

  private drawCaster(device: RenderDevice, source: RenderItem, clip: ReturnType<typeof createClippingBinding>): void {
    // Match forward rendering: an explicitly empty transform list is invisible.
    if (source.instanceTransforms !== undefined && source.instanceTransforms.length === 0) return;
    const specialized = clip.groups.length > 0 ? specializedClippedPrimitive(source, DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME) : undefined;
    if (specialized) {
      this.drawClippedSpecialized(device, source, clip, specialized);
      return;
    }
    const instanceCount = depthInstanceCount(source);
    const base = source.material instanceof MaterialInstance ? source.material.baseMaterial : source.material;
    if (source.instanceTransforms && base?.renderState.cullMode !== "none"
      && instancedItemNeedsPerInstanceCullState(source, depthUsesGeometryMatrix(source))) {
      if (hasInstanceVertexStreams(source)) throw new RenderDeviceError("Per-instance vertex streams cannot be expanded for mixed culling", "INSTANCE_STREAM_EXPANSION_UNSUPPORTED", { label: source.label });
      const model = toMat4(source.modelMatrix ?? identityMat4(), source.label);
      const sourceMvp = source.modelViewProjectionMatrix === undefined ? undefined : toMat4(source.modelViewProjectionMatrix, source.label);
      const transforms = source.instanceTransforms;
      for (let index = 0; index < instanceCount; index += 1) {
        const instance = Array.from(transforms.slice(index * 16, index * 16 + 16)) as Mat4;
        const expanded: RenderItem = {
          ...source,
          label: source.label ? `${source.label}#instance-${index}` : undefined,
          modelMatrix: multiplyMat4(model, instance),
          modelViewProjectionMatrix: sourceMvp ? multiplyMat4(sourceMvp, instance) : undefined,
          instanceTransforms: undefined,
          instanceCount: undefined,
          normalMatrix: undefined
        };
        this.drawCaster(device, expanded, clip);
      }
      return;
    }
    if (source.morphTargets !== undefined || source.morphWeights !== undefined) {
      // Mirror the forward CPU morph fallback before skinning/instancing. Do
      // not use the coarse shadow proxy for animated geometry or apply the
      // morph twice in a later feature. The scratch implementation can safely
      // make dispose a no-op while a transient result releases its buffers.
      const geometry = resolveRenderGeometry(source);
      try {
        this.drawPreparedCaster(device, { ...source, geometry, shadowGeometry: undefined, morphTargets: undefined, morphWeights: undefined }, instanceCount, clip);
      } finally {
        if (geometry !== source.geometry) geometry.dispose();
      }
      return;
    }
    this.drawPreparedCaster(device, source, instanceCount, clip);
  }

  /**
   * Clipped points, billboard sprites and screen-space lines reproduce the
   * forward primitive's own clipping semantics (see SpecializedClippedDepth).
   */
  private drawClippedSpecialized(device: RenderDevice, source: RenderItem, clip: ClippingBinding, primitive: "point" | "sprite" | "line"): void {
    assertSpecializedClippedDepthItem(source, primitive, clip);
    if (primitive === "line") {
      this.drawClippedLine(device, source, clip);
      return;
    }
    const range = resolveDepthDrawRange(source.geometry, source.drawRange);
    const transient = primitive === "point"
      ? { geometry: retainClippedPoints(source, clip, range), modelMatrix: undefined }
      : expandClippedSprite(source, resolveClippingRasterCamera(source), range);
    const geometry = transient.geometry;
    // Every point was clipped: nothing remains to cast depth.
    if (!geometry) return;
    try {
      const caster: RenderItem = {
        ...source,
        geometry,
        shadowGeometry: undefined,
        drawRange: undefined,
        ...(transient.modelMatrix ? { modelMatrix: transient.modelMatrix, normalMatrix: undefined, modelViewProjectionMatrix: undefined } : {})
      };
      // Points were removed by their centres on the CPU; sprite corners are
      // clipped per fragment by the ordinary clipped depth program.
      const drawClip = primitive === "point" ? { ...clip, planes: new Float32Array(0), groups: [] } : clip;
      this.drawPreparedCaster(device, caster, 1, drawClip);
    } finally {
      geometry.dispose();
    }
  }

  /** Draw a clipped screen-space line with its forward expansion and this pass's projection. */
  private drawClippedLine(device: RenderDevice, source: RenderItem, clip: ClippingBinding): void {
    const material = source.material!;
    const camera = resolveClippingRasterCamera(source);
    const convention = this.options.depthConvention;
    if (device.kind === "webgl2" || device.kind === "webgpu") assertSpecializedLineDepthClipRange(device.kind, convention?.clipRange ?? "minus-one-to-one");
    const logarithmic = convention?.mode === "logarithmic";
    const log = logarithmic ? this.logDepthUniforms() : undefined;
    const shader = this.getClippedLineShader(device, logarithmic);
    const { model, modelViewProjection, inverse } = clippedLineDepthTransforms(source, camera);
    const uniforms = new Map<string, UniformValue>(material.getParameters());
    uniforms.set("u_modelMatrix", model);
    uniforms.set("u_viewMatrix", camera.view);
    uniforms.set("u_projectionMatrix", camera.projection);
    uniforms.set("u_modelViewProjection", modelViewProjection);
    uniforms.set(LINE_CLIP_INVERSE_TRANSFORM, inverse);
    uniforms.set("u_a3dDepthViewProjection", toMat4(this.options.viewProjectionMatrix ?? identityMat4(), source.label));
    uniforms.set("u_a3dClipRange", convention?.clipRange === "zero-to-one" ? 1 : 0);
    for (const [name, value] of createClippingUniforms(clip)) uniforms.set(name, value);
    if (log) {
      uniforms.set("u_a3dLogDepthView", log.view);
      uniforms.set("u_a3dLogDepthRange", log.range);
    }
    const geometry = source.geometry;
    const range = resolveDepthDrawRange(geometry, source.drawRange ?? geometry.drawRange);
    const vertexBuffers = geometry.uploadVertexBuffers(device, 1);
    const vertexBuffer = vertexBuffers[0];
    if (!vertexBuffer) throw new RenderDeviceError("Geometry has no primary vertex stream", "MISSING_VERTEX_BUFFER", {});
    const indexBuffer = geometry.indexBuffer?.upload(device);
    const command: DrawCommand = {
      label: source.label ?? "clipped-line-caster",
      topology: geometry.topology,
      vertexBuffer,
      vertexBuffers,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: indexBuffer ? geometry.vertexBuffer.vertexCount : range.count,
      ...(indexBuffer === undefined && range.start > 0 ? { firstVertex: range.start } : {}),
      shader,
      uniforms,
      // Lines are double-sided in forward; keep both windings in depth.
      renderState: depthRenderState(this.options.scissor, "none", convention)
    };
    if (indexBuffer) {
      Object.assign(command, {
        indexBuffer,
        indexType: geometry.indexBuffer?.type,
        indexCount: range.count,
        ...(range.start > 0 ? { firstIndex: range.start } : {})
      });
    }
    this.submitDraw(device, command);
  }

  private getClippedLineShader(device: RenderDevice, logarithmic: boolean): RenderShaderProgram {
    const revision = this.shaderLibrary.getRevision();
    const generation = device.generation ?? 0;
    let libraries = DepthPass.configuredShaderModules.get(device);
    if (!libraries) { libraries = new WeakMap(); DepthPass.configuredShaderModules.set(device, libraries); }
    let cache = libraries.get(this.shaderLibrary);
    if (!cache) {
      cache = { revision, generation, modules: new Map() };
      libraries.set(this.shaderLibrary, cache);
    } else if (cache.revision !== revision || cache.generation !== generation) {
      for (const old of cache.modules.values()) old.dispose();
      cache.modules.clear();
      cache.revision = revision;
      cache.generation = generation;
    }
    const key = `line:${logarithmic ? 1 : 0}`;
    let module = cache.modules.get(key);
    if (!module) {
      const line = certifiedDefaultScreenLineSource(this.shaderLibrary);
      if (!line) throw new RenderDeviceError("Clipped screen-space line depth requires an authenticated line shader source", "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED", {});
      module = new ShaderModule(createSpecializedLineDepthShader(createClippedScreenSpaceLineShader(line), { logarithmic }) as typeof line);
      cache.modules.set(key, module);
    }
    return module.compile(device);
  }

  private drawPreparedCaster(device: RenderDevice, source: RenderItem, instanceCount: number, clip: ReturnType<typeof createClippingBinding>): void {
    // A resolver or depth-feature binder can run between preflight and draw.
    // Retain the inputs for the single-instance alpha path so such a callback
    // cannot mix an old transform/program with a new member color.
    const needsSingleInstanceAlpha = source.instanceTransforms?.length === 16 && source.instanceColors?.length === 4
      && source.instanceColors[3] !== 1;
    const initialAlphaCutoff = needsSingleInstanceAlpha ? source.material?.getParameter("u_alphaCutoff") : undefined;
    const singleInstanceInputsValid = typeof initialAlphaCutoff === "number" && initialAlphaCutoff > 0
      ? captureCasterValidity(source, this.shaderLibrary) : undefined;
    // A `castShadow` custom caster keeps its real geometry: the author's vertex stage reads its attributes.
    let customKey = customDepthShaderKeyOf(source.material);
    const sourceBase = source.material instanceof MaterialInstance ? source.material.baseMaterial : source.material;
    const graphMaterial = sourceBase as GraphDepthMaterial | undefined;
    if (graphMaterial?.graphRequiresWebGPU && device.kind !== "webgpu") {
      throw new RenderDeviceError("Shader graph storage resources require WebGPU", "GRAPH_STORAGE_BACKEND_UNSUPPORTED", { label: source.label });
    }
    if (source.skinning && graphMaterial?.graphMaterial && !sourceBase?.disposed) {
      const inputs = graphDepthJointInputs(source, device);
      validateGraphDepthSkinning(source);
      customKey = graphSkinningDepthKey(source, graphMaterial, inputs);
    }
    if (clip.groups.length > 0 && graphMaterial?.graphMaterial
      && (!PortableShaderMaterial.hasGraphClippingContract(graphMaterial)
        || (customKey !== undefined && !PortableShaderMaterial.hasGraphClippingContract(graphMaterial, customKey, "depth")))) {
      throw new RenderDeviceError("The selected graph depth shader does not preserve clipping", "DEPTH_CLIPPING_PROGRAM_UNSUPPORTED", { label: source.label, key: customKey });
    }
    if (customKey && device.kind === "webgpu" && graphMaterial?.graphMaterial) {
      const locations: Readonly<Record<string, number>> = { a_position: 0, a_normal: 1, a_uv: 2, a_uv1: 7 };
      for (const name of graphMaterial.requiredAttributes) {
        const location = locations[name];
        if (location === undefined) continue;
        const attribute = source.geometry.vertexBuffer.format.attributes.find((candidate) => candidate.shaderName === name || `a_${candidate.semantic}` === name);
        if (!attribute || attribute.shaderLocation !== location) {
          throw new RenderDeviceError("Graph depth geometry has an incompatible attribute location", "GRAPH_VERTEX_LOCATION_UNSUPPORTED", { label: source.label, attribute: name, location });
        }
      }
    }
    if (graphMaterial?.graphRequiresWebGPU && !graphMaterial.graphStorageBindings) {
      throw new RenderDeviceError("Shader graph storage bindings are unavailable", "GRAPH_STORAGE_BINDINGS_UNAVAILABLE", { label: source.label });
    }
    const nativeStorageBindings = graphMaterial?.graphRequiresWebGPU ? graphMaterial.graphStorageBindings?.("depth") : undefined;
    if (nativeStorageBindings?.length && !customKey) {
      throw new RenderDeviceError("Shader graph storage displacement has no matching depth shader", "GRAPH_STORAGE_DEPTH_SHADER_MISSING", { label: source.label });
    }
    const caster = selectDepthCasterGeometry(source, customKey);
    const geometryMatrix = toMat4(caster.geometryMatrix ?? identityMat4(), caster.label);
    const hasGeometryTransform = geometryMatrix.some((value, index) => value !== (index % 5 === 0 ? 1 : 0));
    const base = caster.material instanceof MaterialInstance ? caster.material.baseMaterial : caster.material;
    const clipping = clip.groups.length > 0;
    const logarithmic = this.options.depthConvention?.mode === "logarithmic";
    if (logarithmic) this.logDepthUniforms(); // Validate before submitting any draw.
    const vertexBuffers = caster.geometry.uploadVertexBuffers(device, instanceCount);
    const vertexBuffer = vertexBuffers[0];
    if (!vertexBuffer) throw new RenderDeviceError("Geometry has no primary vertex stream", "MISSING_VERTEX_BUFFER", {});
    const indexBuffer = caster.geometry.indexBuffer?.upload(device);
    const drawRange = resolveDepthDrawRange(caster.geometry, caster.drawRange);
    const modelMatrix = toMat4(caster.modelMatrix ?? identityMat4(), caster.label);
    const viewProjection = toMat4(this.options.viewProjectionMatrix ?? identityMat4(), caster.label);
    if (customKey) {
      this.drawCustomCaster(device, caster, customKey, vertexBuffer, vertexBuffers, indexBuffer, drawRange, modelMatrix, geometryMatrix, viewProjection, clip, logarithmic, instanceCount, nativeStorageBindings);
      return;
    }
    const mvp = multiplyMat4(viewProjection, modelMatrix);
    let variant = this.options.variantResolver?.(caster) ?? null;
    const alphaCutoff = caster.material?.getParameter("u_alphaCutoff");
    const alphaTest = typeof alphaCutoff === "number" && alphaCutoff > 0;
    // The portable depth shader explicitly handles both WebGPU clip ranges;
    // the legacy auto-generated native shader always remaps OpenGL depth.
    if (!variant && (caster.instanceTransforms || caster.skinning || alphaTest || hasGeometryTransform || device.kind === "webgpu")) {
      variant = {
        skinning: caster.skinning ? (caster.skinning.extraInfluences ? 8 : 4) : 0,
        skinningTexture: (caster.skinning?.jointCount ?? 0) > MAX_UNIFORM_SKINNING_JOINTS,
        morphTargets: Boolean(caster.morphTargets?.length || caster.morphWeights?.length),
        instanced: Boolean(caster.instanceTransforms), batched: false,
        alphaTest, alphaHash: false, doubleSided: base?.renderState.cullMode === "none", features: {}
      };
    }
    if (alphaTest && caster.instanceTransforms?.length === 16 && caster.instanceColors?.length === 4
      && caster.instanceColors[3] !== 1 && variant && !variant.alphaTest) {
      throw new RenderDeviceError("The selected depth variant omits single-instance alpha coverage", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: caster.label });
    }
    if (variant && (clipping || logarithmic)) {
      variant = { ...variant, features: { ...variant.features, ...(clipping ? { "a3d.clipping": true } : {}), ...(logarithmic ? { "a3d.logarithmicDepth": true } : {}) } };
    }
    if (!variant) {
      this.material.setParameter("u_modelViewProjection", mvp);
      const uniforms = new Map(this.material.getParameters());
      this.bindDepthUniforms(uniforms, clip, modelMatrix, logarithmic);
      const command: DrawCommand = {
        label: caster.label ?? "shadow-caster",
        topology: caster.geometry.topology,
        vertexBuffer,
        vertexBuffers,
        vertexFormat: caster.geometry.vertexBuffer.format,
        vertexCount: indexBuffer ? caster.geometry.vertexBuffer.vertexCount : drawRange.count,
        ...(instanceCount > 1 ? { instanceCount } : {}),
        ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
        shader: clipping || logarithmic ? this.getConfiguredShader(device, clipping, logarithmic) : this.getShader(device),
        uniforms,
        renderState: {
          ...depthRenderState(this.options.scissor, base?.renderState.cullMode ?? "back", this.options.depthConvention,
            renderItemHasNegativeHandedness(caster, true) !== (base?.renderState.frontFace === "cw"))
        }
      };
      if (indexBuffer) {
        Object.assign(command, {
          indexBuffer,
          indexType: caster.geometry.indexBuffer?.type,
          indexCount: drawRange.count,
          ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
        });
      }
      this.submitDraw(device, command);
      return;
    }
    // Direct execute() may receive a caller-resolved variant without going
    // through prepare(), which normally installs this shared shader first.
    try { this.shaderLibrary.get(PRD02_DEPTH_SHADER_NAME); } catch { registerPrd02DepthShader(this.shaderLibrary); }
    this.drawCasterVariant(device, caster, variant, vertexBuffer, vertexBuffers, indexBuffer, drawRange, mvp, modelMatrix, geometryMatrix, clip, logarithmic, instanceCount, singleInstanceInputsValid);
  }

  /** C-11 variant path (A3D_QR_LIGHTING): composed program + variant uniforms. */
  private drawCasterVariant(
    device: RenderDevice,
    caster: RenderItem,
    variant: ShadowCasterVariantKey,
    vertexBuffer: DrawCommand["vertexBuffer"],
    vertexBuffers: NonNullable<DrawCommand["vertexBuffers"]>,
    indexBuffer: DrawCommand["indexBuffer"],
    drawRange: { readonly start: number; readonly count: number },
    mvp: Mat4,
    modelMatrix: Mat4,
    geometryMatrix: Mat4,
    clip: ReturnType<typeof createClippingBinding>,
    logarithmic: boolean,
    drawInstanceCount: number,
    singleInstanceInputsValid?: () => boolean
  ): void {
    variant = depthAlphaVariantForItem(caster, variant, device);
    if (device.kind === "webgpu" || device.kind === "webgl2") {
      variant = prd02DepthVariantForVertexFormat(variant, caster.geometry.vertexBuffer.format, device.kind);
    }
    const features = this.options.depthVariantFeatures ?? [];
    const shader = prd02DepthProgram(device, this.shaderLibrary, variant, features);
    const skinning = caster.skinning;
    const instanceTransforms = caster.instanceTransforms instanceof Float32Array ? caster.instanceTransforms : caster.instanceTransforms ? Float32Array.from(caster.instanceTransforms) : null;
    const instanceTotal = instanceTransforms ? instanceTransforms.length / 16 : 1;
    // More instances than the uniform array holds ride a per-instance vertex-attribute buffer: one draw for the whole set
    // instead of ceil(n / 64) draws per cascade (a forest of 2,000 trees was 32 draws in every cascade).
    const attributeMode = Boolean(variant.instanced && instanceTransforms && instanceTotal > PRD02_DEPTH_MAX_INSTANCES && variant.features["prd02.depthInstanceAttr"] !== undefined);
    const batchCount = variant.instanced && instanceTransforms && !attributeMode ? Math.ceil(instanceTotal / PRD02_DEPTH_MAX_INSTANCES) : 1;
    if (batchCount > 1 && hasInstanceVertexStreams(caster)) {
      throw new RenderDeviceError("Per-instance vertex streams cannot be split across depth draws", "INSTANCE_STREAM_SPLIT_UNSUPPORTED", {});
    }
    let instanceAttributes: readonly InstanceVertexAttribute[] | null = null;
    if (attributeMode && instanceTransforms) {
      const buffer: RenderBuffer = depthInstanceBufferFor(device, caster.instanceTransforms as object, instanceTransforms).bind().matrixBuffer;
      instanceAttributes = DEPTH_INSTANCE_ATTRIBUTE_NAMES.map((shaderName, column) => ({ buffer, shaderName, components: 4 as const, offset: column * 16, stride: 64, divisor: 1 }));
    }
    for (let batch = 0; batch < batchCount; batch += 1) {
      const uniforms = new Map<string, UniformValue>([["u_modelViewProjection", mvp], ["u_geometryMatrix", geometryMatrix]]);
      this.bindDepthUniforms(uniforms, clip, modelMatrix, logarithmic);
      if (variant.instanced && instanceTransforms) {
        if (attributeMode) {
          uniforms.set("u_instanceAttributeMode", 1);
          uniforms.set("u_instanceCount", instanceTotal);
        } else {
          const offset = batch * PRD02_DEPTH_MAX_INSTANCES;
          const count = Math.min(PRD02_DEPTH_MAX_INSTANCES, instanceTotal - offset);
          uniforms.set("u_instanceMatrices", instanceTransforms.subarray(offset * 16, (offset + count) * 16));
          uniforms.set("u_instanceCount", count);
        }
      }
      if (variant.alphaTest) for (const [name, value] of depthAlphaUniformsForItem(caster, variant)) uniforms.set(name, value);
      // 02-DEPTH: selected C-11 features bind their own uniforms (e.g.
      // prd06.deform's bone texture, prd10.wind's A3DWind/noise).
      for (const feature of features) {
        const value = variant.features[feature.id];
        if (value !== undefined) feature.bindUniforms?.(value, caster, (name, v) => uniforms.set(name, v));
      }
      let transientPalette: TextureBinding | undefined;
      if (variant.skinning > 0 && skinning) {
        const material = caster.material instanceof MaterialInstance ? caster.material.baseMaterial : caster.material ?? this.material;
        const palettePath = applySkinningUniforms(skinning, material, shader, uniforms);
        if (palettePath === "data-texture") transientPalette = uniforms.get("u_jointPaletteTexture") as TextureBinding;
      }
      const command: DrawCommand = {
        label: `${caster.label ?? "shadow-caster"}:${batch}`,
        topology: caster.geometry.topology,
        vertexBuffer,
        vertexBuffers,
        vertexFormat: caster.geometry.vertexBuffer.format,
        vertexCount: indexBuffer ? caster.geometry.vertexBuffer.vertexCount : drawRange.count,
        ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
        ...(variant.instanced && instanceTransforms
          ? { instanceCount: attributeMode ? instanceTotal : Math.min(PRD02_DEPTH_MAX_INSTANCES, instanceTotal - batch * PRD02_DEPTH_MAX_INSTANCES) }
          : drawInstanceCount > 1 ? { instanceCount: drawInstanceCount } : {}),
        ...(instanceAttributes ? { instanceAttributes } : {}),
        shader,
        uniforms,
        renderState: {
          ...depthRenderState(this.options.scissor, variant.doubleSided ? "none" :
            (caster.material instanceof MaterialInstance ? caster.material.baseMaterial : caster.material)?.renderState.cullMode === "front" ? "front" : "back",
            this.options.depthConvention, renderItemHasNegativeHandedness(caster, true)
              !== ((caster.material instanceof MaterialInstance ? caster.material.baseMaterial : caster.material)?.renderState.frontFace === "cw"))
        }
      };
      if (indexBuffer) {
        Object.assign(command, {
          indexBuffer,
          indexType: caster.geometry.indexBuffer?.type,
          indexCount: drawRange.count,
          ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
        });
      }
      try {
        // Feature binders and palette upload can invoke code after the first
        // alpha bind. Refresh the single-instance alpha at the draw boundary.
        if (variant.features["prd02.depthAlphaMember"] === true) {
          if (!singleInstanceInputsValid?.()) {
            throw new RenderDeviceError("Single-instance depth inputs changed during the draw", "DEPTH_PREPARED_PLAN_STALE", { label: caster.label });
          }
          const alpha = depthAlphaUniformsForItem(caster, variant).get("u_a3dPackedLoopColor");
          if (alpha === undefined) throw new RenderDeviceError("Single-instance depth alpha is unavailable", "DEPTH_INSTANCE_ALPHA_UNSUPPORTED", { label: caster.label });
          uniforms.set("u_a3dPackedLoopColor", alpha);
        }
        this.submitDraw(device, command);
      } finally { transientPalette?.texture?.dispose(); }
    }
  }

  private getShader(device: RenderDevice): RenderShaderProgram {
    let module = DepthPass.shaderModules.get(this.shaderLibrary);
    if (!module) {
      module = ShaderModule.fromLibrary(this.shaderLibrary, this.material.shaderKey);
      DepthPass.shaderModules.set(this.shaderLibrary, module);
    }
    return module.compile(device);
  }

  private getConfiguredShader(device: RenderDevice, clipping: boolean, logarithmic: boolean): RenderShaderProgram {
    const revision = this.shaderLibrary.getRevision();
    const generation = device.generation ?? 0;
    let libraries = DepthPass.configuredShaderModules.get(device);
    if (!libraries) { libraries = new WeakMap(); DepthPass.configuredShaderModules.set(device, libraries); }
    let cache = libraries.get(this.shaderLibrary);
    if (!cache) {
      cache = { revision, generation, modules: new Map() };
      libraries.set(this.shaderLibrary, cache);
    } else if (cache.revision !== revision || cache.generation !== generation) {
      for (const old of cache.modules.values()) old.dispose();
      cache.modules.clear();
      cache.revision = revision;
      cache.generation = generation;
    }
    const key = `${clipping ? 1 : 0}:${logarithmic ? 1 : 0}`;
    let module = cache.modules.get(key);
    if (!module) {
      const defines = { ...(clipping ? { A3D_DEPTH_CLIPPING: 1 } : {}), ...(logarithmic ? { A3D_DEPTH_LOGARITHMIC: 1 } : {}) };
      module = new ShaderModule(this.shaderLibrary.compileSource(DEFAULT_DEPTH_SHADER_NAME, { defines }));
      cache.modules.set(key, module);
    }
    return module.compile(device);
  }

  private logDepthUniforms(): { readonly view: Mat4; readonly range: readonly [number, number] } {
    const { near, far } = this.options.depthRange ?? {};
    if (!Number.isFinite(near) || !Number.isFinite(far) || near! <= 0 || far! <= near! || !this.options.depthViewMatrix) {
      throw new RangeError("Logarithmic depth requires a pass view matrix and finite 0 < near < far.");
    }
    return { view: toMat4(this.options.depthViewMatrix), range: [near!, far!] };
  }

  private bindDepthUniforms(uniforms: Map<string, UniformValue>, clip: ReturnType<typeof createClippingBinding>, model: Mat4, logarithmic: boolean): void {
    uniforms.set("u_a3dClipRange", this.options.depthConvention?.clipRange === "zero-to-one" ? 1 : 0);
    uniforms.set("u_a3dClipGroupCount", 0);
    uniforms.set("u_a3dLogDepthEnabled", logarithmic ? 1 : 0);
    if (clip.groups.length > 0) for (const [name, value] of createClippingUniforms(clip)) uniforms.set(name, value);
    if (clip.groups.length > 0 || logarithmic) uniforms.set("u_a3dClipModel", model);
    if (logarithmic) {
      const { view, range } = this.logDepthUniforms();
      uniforms.set("u_a3dLogDepthView", view);
      uniforms.set("u_a3dLogDepthRange", range);
    }
  }

  private customShader(device: RenderDevice, key: string): RenderShaderProgram {
    let modules = DepthPass.customShaderModules.get(this.shaderLibrary);
    if (!modules) {
      modules = new Map();
      DepthPass.customShaderModules.set(this.shaderLibrary, modules);
    }
    let module = modules.get(key);
    if (!module) {
      module = ShaderModule.fromLibrary(this.shaderLibrary, key);
      modules.set(key, module);
    }
    return module.compile(device);
  }

  /**
   * GU47 E-D: a `material.custom({ castShadow: true })` caster draws with its own vertex stage, so author displacement
   * (sway, wind, waves) moves the shadow. The matrix built-ins carry the light: `u_viewMatrix` is identity and
   * `u_projectionMatrix` the light's view-projection, so `projectionMatrix * viewMatrix * modelMatrix * p`,
   * `projectionMatrix * modelViewMatrix * p` and `modelViewProjectionMatrix * p` all land in light clip space. The
   * material's own uniforms (including runtime `setUniform` writes) and `u_time` (the forward pass clock) are bound too.
   * An instanced caster whose vertex stage reads `instanceMatrix` is one instanced draw; one that does not draws each
   * instance with the instance folded into `modelMatrix`. Culling follows the material's side.
   */
  private drawCustomCaster(
    device: RenderDevice,
    caster: RenderItem,
    key: string,
    vertexBuffer: DrawCommand["vertexBuffer"],
    vertexBuffers: NonNullable<DrawCommand["vertexBuffers"]>,
    indexBuffer: DrawCommand["indexBuffer"],
    drawRange: { readonly start: number; readonly count: number },
    modelMatrix: Mat4,
    geometryMatrix: Mat4,
    viewProjection: Mat4,
    clip: ReturnType<typeof createClippingBinding>,
    logarithmic: boolean,
    drawInstanceCount: number,
    nativeStorageBindings: readonly NativeStorageBinding[] | undefined
  ): void {
    const shader = this.customShader(device, key);
    const reflected = shader.reflection.uniforms;
    // An arbitrary authored vertex can displace geometry in ways that cannot
    // be recovered from gl_Position. Only the custom-material compiler can
    // provide matching post-deformation varyings and the clipping fragment.
    const clipUniforms = ["u_a3dClipPlanes", "u_a3dClipGroups", "u_a3dClipGroupCount", "u_a3dClipModel"];
    const logUniforms = ["u_a3dLogDepthView", "u_a3dLogDepthRange", "u_a3dClipModel"];
    if ((clip.groups.length > 0 && clipUniforms.some((name) => !reflected.has(name))) || (logarithmic && logUniforms.some((name) => !reflected.has(name)))) {
      throw new RenderDeviceError("Custom depth shader does not provide the requested clipping/depth contract", "DEPTH_CUSTOM_SHADER_CONTRACT_MISSING", { key });
    }
    if (caster.skinning) {
      const requiredAttributes = ["a_joints", "a_weights", ...(caster.skinning.extraInfluences ? ["a_joints1", "a_weights1"] : [])];
      if (["u_jointMatrices", "u_jointCount"].some((name) => !reflected.has(name))
        || requiredAttributes.some((name) => !shader.reflection.attributes.has(name))) {
        throw new RenderDeviceError("Custom depth shader does not provide the requested skinning contract", "DEPTH_CUSTOM_SKINNING_UNSUPPORTED", { key });
      }
      const semantics: readonly ("joints" | "weights" | "joints1" | "weights1")[] = caster.skinning.extraInfluences
        ? ["joints", "weights", "joints1", "weights1"] : ["joints", "weights"];
      if (semantics.some((semantic) => !caster.geometry.vertexBuffer.format.hasAttribute(semantic))) {
        throw new RenderDeviceError("Skinned custom depth geometry is missing a joint or weight attribute", "SKINNING_GEOMETRY_CONTRACT", { key });
      }
    }
    const base = caster.material instanceof MaterialInstance ? caster.material.baseMaterial : caster.material;
    const shared = new Map<string, UniformValue>();
    const portableUniforms = new Map<string, RecursiveUniformValue>();
    const parameters = caster.material ? recursiveMaterialParameters(caster.material) : undefined;
    for (const [name, value] of parameters ?? []) {
      if (!reflectsUniformRoot(reflected, name)) continue;
      const descriptor = base instanceof PortableShaderMaterial
        ? base.uniformSchema.find((uniform) => uniform.name === name) : undefined;
      if (descriptor && base instanceof PortableShaderMaterial) {
        const diagnostic = base.uniformValueDiagnostic(name, value);
        if (diagnostic) throw new RenderDeviceError(diagnostic, "DEPTH_PORTABLE_UNIFORM_INVALID", { label: caster.label, uniform: name });
      }
      if (descriptor?.kind === "data" && device.kind === "webgl2") {
        // S5-WP05-03: WebGL2 binds a data uniform as its GL leaf uniforms.
        for (const [leaf, leafValue] of flattenPortableDataUniform(descriptor as PortableShaderUniformDescriptor, value, caster.label)) shared.set(leaf, leafValue);
      } else if (!reflected.has(name)) {
        continue;
      } else if (descriptor?.kind === "data" || !isFlatUniformValue(value)) {
        if (!descriptor || device.kind !== "webgpu" || !device.drawPortable) {
          throw new RenderDeviceError("Structured depth uniforms require portable WebGPU submission", "PORTABLE_UNIFORM_BACKEND_UNSUPPORTED", { label: caster.label, uniform: name });
        }
        portableUniforms.set(name, value);
      } else shared.set(name, value);
    }
    const set = (name: string, value: UniformValue): void => {
      if (reflected.has(name)) shared.set(name, value);
    };
    set("u_viewMatrix", identityMatrix());
    set("u_projectionMatrix", new Float32Array(viewProjection));
    set("u_geometryMatrix", geometryMatrix);
    if (reflected.has("u_cameraPosition")) {
      const position = this.options.cameraPosition ?? [0, 0, 1];
      if (position.length !== 3 || position.some((value) => !Number.isFinite(value))) {
        throw new RenderDeviceError("Depth pass camera position must be a finite vec3", "DEPTH_CAMERA_CONTRACT", { label: caster.label, cameraPosition: [...position] });
      }
      shared.set("u_cameraPosition", [...position]);
    }
    set("u_time", this.options.timeSeconds ?? 0);
    set("u_resolution", [this.frameSize[0], this.frameSize[1]]);
    const cullMode = base?.renderState.cullMode ?? "back";
    const usesGeometryMatrix = depthUsesGeometryMatrix(caster);
    const transforms = caster.instanceTransforms instanceof Float32Array ? caster.instanceTransforms : caster.instanceTransforms ? Float32Array.from(caster.instanceTransforms) : null;
    const instanceTotal = transforms ? Math.floor(transforms.length / 16) : 0;
    const authorInstancing = transforms !== null && instanceTotal > 0 && reflected.has("u_a3dInstancing")
      && DEPTH_INSTANCE_ATTRIBUTE_NAMES.every((name) => shader.reflection.attributes.has(name));
    if (transforms && instanceTotal > 1 && !authorInstancing && hasInstanceVertexStreams(caster)) {
      throw new RenderDeviceError("Per-instance vertex streams cannot be expanded for this depth shader", "INSTANCE_STREAM_EXPANSION_UNSUPPORTED", {});
    }
    const colors = authorInstancing && caster.instanceColors !== undefined && shader.reflection.attributes.has("a_instanceColor")
      ? Float32Array.from(caster.instanceColors) : undefined;
    if (colors && (colors.length !== instanceTotal * 4 || colors.some((value) => !Number.isFinite(value)))) {
      throw new RenderDeviceError("Instance colors must contain finite values for every instance", "INSTANCE_ATTRIBUTE_CONTRACT", { label: caster.label });
    }
    set("u_a3dInstanceColors", colors ? 1 : 0);
    const instanceBuffers = authorInstancing && transforms ? depthInstanceBufferFor(device, caster.instanceTransforms as object, transforms, colors).bind() : null;
    const draw = (model: Mat4, label: string, instanced: boolean, useItemNormalMatrix: boolean): void => {
      const uniforms = new Map(shared);
      this.bindDepthUniforms(uniforms, clip, model, logarithmic);
      if (reflected.has("u_modelViewProjection")) uniforms.set("u_modelViewProjection", multiplyMat4(viewProjection, model));
      if (reflected.has("u_modelMatrix")) uniforms.set("u_modelMatrix", model);
      if (reflected.has("u_normalMatrix")) {
        uniforms.set("u_normalMatrix", useItemNormalMatrix && caster.normalMatrix !== undefined
          ? toMat4Uniform(caster.normalMatrix, "normalMatrix", caster.label) : new Float32Array(normalMatrixFromModel(model)));
      }
      if (reflected.has("u_a3dInstancing")) uniforms.set("u_a3dInstancing", instanced ? 1 : 0);
      const command: DrawCommand = {
        label,
        topology: caster.geometry.topology,
        vertexBuffer,
        vertexBuffers,
        vertexFormat: caster.geometry.vertexBuffer.format,
        vertexCount: indexBuffer ? caster.geometry.vertexBuffer.vertexCount : drawRange.count,
        ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
        ...(instanced && instanceBuffers
          ? {
            instanceCount: instanceTotal,
            instanceAttributes: [...DEPTH_INSTANCE_ATTRIBUTE_NAMES.map((shaderName, column) => ({
              buffer: instanceBuffers.matrixBuffer,
              shaderName,
              components: 4 as const,
              offset: column * 16,
              stride: 64,
              divisor: 1
            })), ...(colors && instanceBuffers.colorBuffer ? [{
              buffer: instanceBuffers.colorBuffer, shaderName: "a_instanceColor", components: 4 as const,
              offset: 0, stride: 16, divisor: 1
            }] : [])]
          }
          : !transforms && drawInstanceCount > 1 ? { instanceCount: drawInstanceCount } : {}),
        shader,
        uniforms,
        ...(nativeStorageBindings?.length ? { nativeStorageBindings } : {}),
        renderState: depthRenderState(this.options.scissor, cullMode, this.options.depthConvention,
          // Clockwise front faces cull like a mirrored (negative-handedness) transform.
          renderItemHasNegativeHandedness({ ...caster, modelMatrix: model }, usesGeometryMatrix) !== (base?.renderState.frontFace === "cw"))
      };
      if (indexBuffer) {
        Object.assign(command, {
          indexBuffer,
          indexType: caster.geometry.indexBuffer?.type,
          indexCount: drawRange.count,
          ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
        });
      }
      if (portableUniforms.size) {
        if (device.kind !== "webgpu" || !device.drawPortable) {
          throw new RenderDeviceError("Portable depth submission is unavailable", "PORTABLE_UNIFORM_BACKEND_UNSUPPORTED", { label: caster.label });
        }
        const combinedUniforms = new Map<string, RecursiveUniformValue>(uniforms);
        for (const [name, value] of portableUniforms) {
          if (combinedUniforms.has(name)) {
            throw new RenderDeviceError("A depth binding overwrote a portable data uniform", "PORTABLE_UNIFORM_BINDING_COLLISION", { label: caster.label, uniform: name });
          }
          combinedUniforms.set(name, value);
        }
        device.drawPortable({ ...command, uniforms: combinedUniforms }, this.options.checkedSubmission);
      } else this.submitDraw(device, command);
    };
    let transientPalette: TextureBinding | undefined;
    if (caster.skinning) {
      const palettePath = applySkinningUniforms(caster.skinning, base ?? this.material, shader, shared);
      if (palettePath === "data-texture") transientPalette = shared.get("u_jointPaletteTexture") as TextureBinding;
    }
    try {
      const label = `${caster.label ?? "shadow-caster"}:custom-depth`;
      if (authorInstancing || !transforms || instanceTotal === 0) {
        draw(modelMatrix, label, authorInstancing, true);
        return;
      }
      for (let index = 0; index < instanceTotal; index += 1) {
        const off = index * 16;
        if (caster.geometry.topology !== "points") {
          const max3 = Math.max(
            Math.abs(transforms[off] ?? 0),
            Math.abs(transforms[off + 1] ?? 0),
            Math.abs(transforms[off + 2] ?? 0),
            Math.abs(transforms[off + 4] ?? 0),
            Math.abs(transforms[off + 5] ?? 0),
            Math.abs(transforms[off + 6] ?? 0),
            Math.abs(transforms[off + 8] ?? 0),
            Math.abs(transforms[off + 9] ?? 0),
            Math.abs(transforms[off + 10] ?? 0)
          );
          const persp =
            Math.abs(transforms[off + 3] ?? 0) <= 1e-8 &&
            Math.abs(transforms[off + 7] ?? 0) <= 1e-8 &&
            Math.abs(transforms[off + 11] ?? 0) <= 1e-8;
          if (persp && (max3 <= 1e-8 || (max3 <= 2e-4 && (transforms[off + 13] ?? 0) <= -80))) {
            continue;
          }
        }
        const instance = Array.from(transforms.subarray(off, off + 16)) as unknown as Mat4;
        draw(multiplyMat4(modelMatrix, instance), `${label}:${index}`, false, false);
      }
    } finally { transientPalette?.texture?.dispose(); }
  }
}

/** Validate the draw count before allocating or binding any geometry streams. */
function depthInstanceCount(caster: RenderItem): number {
  const transforms = caster.instanceTransforms;
  if (transforms !== undefined && (transforms.length % 16 !== 0 || transforms.some((value) => !Number.isFinite(value)))) {
    throw new RenderDeviceError("Instance transforms must contain finite mat4 values", "INSTANCING_CONTRACT", { label: caster.label, scalars: transforms.length });
  }
  const count = caster.instanceCount ?? (transforms ? transforms.length / 16 : 1);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RenderDeviceError("instanceCount must be a positive integer", "INVALID_INSTANCE_COUNT", { instanceCount: count });
  }
  if (transforms && count !== transforms.length / 16) {
    throw new RenderDeviceError("instanceCount must match the number of instance transforms", "INSTANCE_COUNT_MISMATCH", { instanceCount: count });
  }
  return count;
}

function hasInstanceVertexStreams(caster: RenderItem): boolean {
  return caster.geometry.vertexBuffer.format.streams.some((stream) => stream.stepMode === "instance");
}

type GraphJointInput = "float" | "uint" | "sint";

function graphDepthJointInputs(caster: RenderItem, device: RenderDevice): readonly [GraphJointInput, GraphJointInput] {
  const format = caster.geometry.vertexBuffer.format;
  if (!caster.skinning?.extraInfluences && (format.hasAttribute("joints1") || format.hasAttribute("weights1"))) {
    throw new RenderDeviceError("Graph depth skinning must enable eight influences for a second joint or weight set", "GRAPH_SKINNING_INFLUENCE_MISMATCH", { label: caster.label });
  }
  const locations = { joints: 5, weights: 6, joints1: 8, weights1: 9 } as const;
  const semantics: readonly (keyof typeof locations)[] = caster.skinning?.extraInfluences
    ? ["joints", "weights", "joints1", "weights1"] : ["joints", "weights"];
  for (const semantic of semantics) {
    if (!format.hasAttribute(semantic)) throw new RenderDeviceError("Skinned graph depth geometry is missing a joint or weight attribute", "SKINNING_GEOMETRY_CONTRACT", { label: caster.label, semantic });
    const attribute = format.getAttribute(semantic);
    if (attribute.components !== 4 || attribute.shaderLocation !== locations[semantic]) {
      throw new RenderDeviceError("Skinned graph depth geometry requires matching four-component joint and weight attributes", "GRAPH_SKINNING_GEOMETRY_UNSUPPORTED", { label: caster.label, semantic });
    }
    const joint = semantic.startsWith("joints");
    const nativeFloat = attribute.type === "float32" || (attribute.normalized && attribute.type !== "int32" && attribute.type !== "uint32");
    if ((joint && attribute.normalized) || (!joint && attribute.integer)
      || (device.kind === "webgpu" && !attribute.integer && !nativeFloat)) {
      throw new RenderDeviceError("Graph depth skinning requires supported joint and weight attribute formats", "GRAPH_SKINNING_ATTRIBUTE_UNSUPPORTED", { label: caster.label, semantic });
    }
  }
  const jointInput = (semantic: "joints" | "joints1"): GraphJointInput => {
    const attribute = format.getAttribute(semantic);
    return !attribute.integer ? "float" : attribute.type.startsWith("uint") ? "uint" : "sint";
  };
  return [jointInput("joints"), caster.skinning?.extraInfluences ? jointInput("joints1") : "float"];
}

/** Match the forward skin contract, revalidating when an input stream changes. */
function validateGraphDepthSkinning(caster: RenderItem): void {
  const skinning = caster.skinning!;
  const geometry = caster.geometry;
  const format = geometry.vertexBuffer.format;
  const semantics: readonly ("joints" | "weights" | "joints1" | "weights1")[] = ["joints", "weights", "joints1", "weights1"];
  const buffers = semantics.filter((semantic) => format.hasAttribute(semantic)).map((semantic) => {
    const buffer = geometry.getAttributeBuffer(semantic);
    return { buffer, revision: buffer.revision };
  });
  const instanceCount = caster.instanceTransforms ? caster.instanceTransforms.length / 16 : caster.instanceCount ?? 1;
  const previous = validatedGraphSkinning.get(geometry);
  if (previous && previous.jointCount === skinning.jointCount && previous.instanceCount === instanceCount
    && previous.vertexCount === geometry.vertexBuffer.vertexCount && previous.format === format
    && previous.buffers.length === buffers.length
    && previous.buffers.every((entry, index) => entry.buffer === buffers[index]?.buffer && entry.revision === buffers[index]?.revision)) return;
  validateSkinningGeometryContract(caster, skinning);
  validatedGraphSkinning.set(geometry, { jointCount: skinning.jointCount, instanceCount, vertexCount: geometry.vertexBuffer.vertexCount, format, buffers });
}

/**
 * Depth-pass render state: depthTest+depthWrite forced (a depth pass must not
 * inherit the lit material's state); double-sided casters disable culling.
 */
function depthRenderState(
  scissor: DepthPassOptions["scissor"],
  cullMode: "none" | "front" | "back" = "back",
  convention?: DepthConvention,
  negativeHandedness = false
): RenderCommandState {
  return {
    depthTest: true,
    depthWrite: true,
    cullMode: !negativeHandedness || cullMode === "none" ? cullMode : cullMode === "back" ? "front" : "back",
    blend: false,
    depthCompare: "less-equal",
    ...(convention?.mode === "reversed" ? { depthCompareV2: "greater-equal" as const, depthConventionApplied: true } : {}),
    ...(scissor ? { scissor } : {})
  };
}

function resolveDepthDrawRange(geometry: RenderItem["geometry"], range: RenderItem["drawRange"]): { readonly start: number; readonly count: number } {
  const available = geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount;
  if (!range) return { start: 0, count: available };
  if (!Number.isInteger(range.start) || range.start < 0 || !Number.isInteger(range.count) || range.count <= 0 || range.start + range.count > available) {
    throw new RenderDeviceError("Depth caster drawRange must fit inside geometry draw count", "DEPTH_DRAW_RANGE_INVALID", {
      start: range.start,
      count: range.count,
      available
    });
  }
  return range;
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function toMat4(value: Float32Array | readonly number[], label?: string): Mat4 {
  const values = Array.from(value);
  if (values.length !== 16 || values.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`DepthPass ${label ?? "caster"} matrix must contain 16 finite numbers.`);
  }
  return values as unknown as Mat4;
}
