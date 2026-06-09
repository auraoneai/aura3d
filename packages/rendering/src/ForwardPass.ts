import { Geometry } from "./Geometry";
import { type CollectedLight } from "./LightCollector";
import { LightUniforms } from "./LightUniforms";
import { Material, type RenderState } from "./Material";
import { MaterialBinding } from "./MaterialBinding";
import { MaterialInstance } from "./MaterialInstance";
import { applyMorphTargets, type MorphTargetDelta } from "./MorphTarget";
import { type DrawCommand, type InstanceVertexAttribute, type RenderBuffer, type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { RenderPipeline } from "./RenderPipeline";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { ShaderModule } from "./ShaderModule";
import { createDefaultShaderLibrary, type ShaderLibrary } from "./ShaderLibrary";
import { createShadowFilterKernel, type ShadowFilterKernel } from "./ShadowMap";
import { TextureBinding } from "./TextureBinding";
import { UnlitMaterial } from "./UnlitMaterial";
import { sortRenderQueueItems } from "./performance/RenderItemSorting";

export interface RenderItem {
  readonly geometry: Geometry;
  readonly material?: RenderMaterial;
  readonly label?: string;
  readonly drawRange?: RenderItemDrawRange;
  readonly includeInAutoFrame?: boolean;
  readonly modelMatrix?: Float32Array | readonly number[];
  readonly normalMatrix?: Float32Array | readonly number[];
  readonly modelViewProjectionMatrix?: Float32Array | readonly number[];
  readonly skinning?: SkinningPaletteBinding;
  readonly morphTargets?: readonly MorphTargetDelta[];
  readonly morphWeights?: readonly number[];
  readonly instanceTransforms?: Float32Array | readonly number[];
  readonly instanceColors?: Float32Array | readonly number[];
  readonly instanceAttributes?: readonly RenderItemInstanceAttribute[];
  readonly boundingBoxCenter?: readonly [number, number, number];
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
}

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
  readonly outputColorSpace?: "linear" | "srgb";
  readonly shaderLibrary?: ShaderLibrary;
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

const MAX_FORWARD_SHADOW_PCF_SAMPLES = 32;
const DEFAULT_FORWARD_SHADOW_FILTER_KERNEL = createShadowFilterKernel({ filter: "pcf", pcfRadius: 1, pcfSamples: 9 });
const INSTANCE_MATRIX_ATTRIBUTE_NAMES = [
  "a_instanceMatrix0",
  "a_instanceMatrix1",
  "a_instanceMatrix2",
  "a_instanceMatrix3"
] as const;

export class ForwardPass extends BaseRenderPass {
  private static readonly shaderCaches = new WeakMap<RenderDevice, WeakMap<ShaderLibrary, Map<string, ShaderModule>>>();
  private readonly materialBinding = new MaterialBinding();
  private readonly shaderLibrary: ShaderLibrary;
  private readonly skinningPaletteUploads = new SkinningPaletteUploadManager();

  constructor(private readonly options: ForwardPassOptions) {
    super("forward", options.inputColorResource ? [options.inputColorResource] : [], ["color"]);
    this.shaderLibrary = options.shaderLibrary ?? createDefaultShaderLibrary();
  }

  execute(context: RenderPassContext): void {
    this.skinningPaletteUploads.beginFrame();
    for (const item of sortForwardRenderItems(this.options.items, this.options.cameraPosition)) {
      this.drawItem(context.device, item);
    }
  }

  private drawItem(device: RenderDevice, item: RenderItem): void {
    const material = item.material ?? new UnlitMaterial();
    const baseMaterial = getBaseMaterial(material);
    this.applyLightUniforms(material);
    const shader = this.getShader(baseMaterial, device);
    if (item.instanceTransforms && baseMaterial.renderState.cullMode !== "none" && instancedItemNeedsPerInstanceCullState(item)) {
      for (const expanded of expandInstancedRenderItem(item)) {
        this.drawItem(device, expanded);
      }
      return;
    }
    if (item.instanceTransforms && !supportsInstanceAttributes(shader) && instanceTransformCount(item) > MAX_GPU_INSTANCES) {
      for (const batch of splitInstanceTransforms(item.instanceTransforms)) {
        this.drawItem(device, { ...item, instanceTransforms: batch });
      }
      return;
    }
    if (item.instanceTransforms && !supportsInstanceAttributes(shader) && !supportsInstanceUniforms(shader)) {
      for (const expanded of expandInstancedRenderItem(item)) {
        this.drawItem(device, expanded);
      }
      return;
    }
    const binding = this.materialBinding.bind(material, shader);
    const uniforms = new Map<string, UniformValue>(binding.uniforms);
    applyEnvironmentLightingUniforms(this.options.environmentLighting, item, shader, uniforms);
    applyEnvironmentFogUniforms(this.options.environmentFog, item, shader, uniforms);
    applyForwardShadowMapUniforms(this.options.shadowMap, item, shader, uniforms);
    applyOutputColorSpaceUniform(this.options.outputColorSpace ?? "srgb", item, shader, uniforms);
    applyCameraUniforms(this.options.cameraPosition, item, shader, uniforms);
    applyAlphaCutoffUniform(item, shader, uniforms);
    applyTransformUniforms(item, shader, uniforms);
    if (item.skinning) {
      this.skinningPaletteUploads.bind(item, item.skinning, baseMaterial, shader, uniforms);
    }
    const instanceBinding = item.instanceTransforms ? applyInstanceBinding(device, item, shader, uniforms) : { count: 1 };
    const gpuMorph = item.morphTargets || item.morphWeights ? applyGpuMorphUniforms(item, shader, uniforms) : false;
    const geometry = gpuMorph ? item.geometry : resolveRenderGeometry(item);
    validateMaterialGeometryContract(item, baseMaterial, geometry);
    try {
      const vertexBuffer = geometry.vertexBuffer.upload(device);
      const indexBuffer = geometry.indexBuffer?.upload(device);
      const drawRange = resolveDrawRange(geometry, item.drawRange);
      const pipeline = new RenderPipeline({
        label: item.label ?? baseMaterial.name,
        shader,
        vertexFormat: geometry.vertexBuffer.format,
        topology: geometry.topology,
        renderState: renderStateForItem(baseMaterial.renderState, item),
        requiredAttributes: baseMaterial.requiredAttributes
      });
      const command: DrawCommand = pipeline.createDrawCommand({
        label: item.label,
        vertexBuffer,
        vertexCount: indexBuffer !== undefined ? geometry.vertexBuffer.vertexCount : drawRange.count,
        ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
        uniforms,
        ...(item.instanceTransforms ? { instanceCount: instanceBinding.count } : {}),
        ...(instanceBinding.attributes ? { instanceAttributes: instanceBinding.attributes } : {})
      });
      if (indexBuffer !== undefined) {
        Object.assign(command, {
          indexBuffer,
          indexType: geometry.indexBuffer?.type,
          indexCount: drawRange.count,
          ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
        });
      }
      device.draw(command);
    } finally {
      for (const buffer of instanceBinding.buffers ?? []) buffer.dispose();
      if (geometry !== item.geometry) {
        geometry.dispose();
      }
    }
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

  private getShader(material: Material, device: RenderDevice): RenderShaderProgram {
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
}

class SkinningPaletteUploadManager {
  private static readonly validatedGeometryJointCounts = new WeakMap<Geometry, Set<number>>();
  private submissions = 0;
  private jointsUploaded = 0;
  private maxJointCount = 0;

  beginFrame(): void {
    this.submissions = 0;
    this.jointsUploaded = 0;
    this.maxJointCount = 0;
  }

  bind(
    item: RenderItem,
    skinning: SkinningPaletteBinding,
    material: Material,
    shader: RenderShaderProgram,
    uniforms: Map<string, UniformValue>
  ): void {
    applySkinningUniforms(skinning, material, shader, uniforms);
    const validatedJointCounts = SkinningPaletteUploadManager.validatedGeometryJointCounts.get(item.geometry) ?? new Set<number>();
    if (!validatedJointCounts.has(skinning.jointCount)) {
      validateSkinningGeometryContract(item, skinning);
      validatedJointCounts.add(skinning.jointCount);
      SkinningPaletteUploadManager.validatedGeometryJointCounts.set(item.geometry, validatedJointCounts);
    }
    this.submissions += 1;
    this.jointsUploaded += skinning.jointCount;
    this.maxJointCount = Math.max(this.maxJointCount, skinning.jointCount);
  }
}

function getForwardPassShaderCache(device: RenderDevice, library: ShaderLibrary): Map<string, ShaderModule> {
  let libraryCaches = ForwardPass["shaderCaches"].get(device);
  if (!libraryCaches) {
    libraryCaches = new WeakMap<ShaderLibrary, Map<string, ShaderModule>>();
    ForwardPass["shaderCaches"].set(device, libraryCaches);
  }
  let shaderCache = libraryCaches.get(library);
  if (!shaderCache) {
    shaderCache = new Map<string, ShaderModule>();
    libraryCaches.set(library, shaderCache);
  }
  return shaderCache;
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
  const matrix = transposeMat4(invertMat4(modelMatrix));
  return [
    matrix[0], matrix[1], matrix[2], 0,
    matrix[4], matrix[5], matrix[6], 0,
    matrix[8], matrix[9], matrix[10], 0,
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

function applyForwardShadowMapUniforms(
  shadowMap: ForwardShadowMapOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const requiredUniforms = [
    "u_shadowMapTexture",
    "u_shadowMapEnabled",
    "u_shadowMapMatrix",
    "u_shadowMapStrength",
    "u_shadowMapBias",
    "u_shadowMapSlopeBias",
    "u_shadowMapTexelSize",
    "u_shadowPcfSampleCount",
    "u_shadowPcfSamples"
  ];
  if (!requiredUniforms.every((uniform) => shader.reflection.uniforms.has(uniform))) {
    return;
  }
  applyForwardPointShadowMapUniforms(shadowMap?.pointLight, item, shader, uniforms);
  if (!shadowMap) {
    uniforms.set("u_shadowMapTexture", new TextureBinding({ name: "u_shadowMapTexture", required: false }));
    uniforms.set("u_shadowMapEnabled", 0);
    uniforms.set("u_shadowMapMatrix", new Float32Array(identityMatrix()));
    uniforms.set("u_shadowMapStrength", 0);
    uniforms.set("u_shadowMapBias", 0);
    uniforms.set("u_shadowMapSlopeBias", 0);
    uniforms.set("u_shadowMapTexelSize", [1, 1]);
    uniforms.set("u_shadowPcfSampleCount", 1);
    uniforms.set("u_shadowPcfSamples", new Float32Array(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4));
    return;
  }
  const validation = shadowMap.texture.validate();
  if (!validation.ok) {
    throw new RenderDeviceError("Forward shadow-map texture binding validation failed", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      diagnostics: validation.diagnostics
    });
  }
  const strength = shadowMap.strength ?? 0.65;
  const bias = shadowMap.bias ?? 0.001;
  const slopeBias = shadowMap.slopeBias ?? 1;
  const texelSize = shadowMap.texelSize ?? [
    1 / Math.max(1, shadowMap.texture.texture?.width ?? 1),
    1 / Math.max(1, shadowMap.texture.texture?.height ?? 1)
  ];
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RenderDeviceError("Forward shadow-map strength must be finite in [0, 1]", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      strength
    });
  }
  if (!Number.isFinite(bias) || bias < 0) {
    throw new RenderDeviceError("Forward shadow-map bias must be finite and non-negative", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      bias
    });
  }
  if (!Number.isFinite(slopeBias) || slopeBias < 0) {
    throw new RenderDeviceError("Forward shadow-map slopeBias must be finite and non-negative", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      slopeBias
    });
  }
  if (texelSize.length !== 2 || !texelSize.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RenderDeviceError("Forward shadow-map texelSize must contain two finite positive values", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      texelSize: Array.from(texelSize)
    });
  }
  const filterKernel = shadowMap.filterKernel ?? DEFAULT_FORWARD_SHADOW_FILTER_KERNEL;
  const pcfSamples = packForwardShadowPcfSamples(filterKernel, item.label);
  uniforms.set("u_shadowMapTexture", shadowMap.texture);
  uniforms.set("u_shadowMapEnabled", 1);
  uniforms.set("u_shadowMapMatrix", toMat4Uniform(shadowMap.lightMatrix, "shadowMap.lightMatrix", item.label));
  uniforms.set("u_shadowMapStrength", strength);
  uniforms.set("u_shadowMapBias", bias);
  uniforms.set("u_shadowMapSlopeBias", slopeBias);
  uniforms.set("u_shadowMapTexelSize", texelSize);
  uniforms.set("u_shadowPcfSampleCount", filterKernel.samples.length);
  uniforms.set("u_shadowPcfSamples", pcfSamples);
}

function applyForwardPointShadowMapUniforms(
  pointShadowMap: ForwardPointShadowMapOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const requiredUniforms = [
    "u_pointShadowMapTexture",
    "u_pointShadowMapEnabled",
    "u_pointShadowLightPosition",
    "u_pointShadowRange",
    "u_pointShadowFaceMatrices",
    "u_pointShadowFaceRects",
    "u_pointShadowStrength",
    "u_pointShadowBias",
    "u_pointShadowSlopeBias",
    "u_pointShadowTexelSize",
    "u_pointShadowPcfSampleCount",
    "u_pointShadowPcfSamples"
  ];
  if (!requiredUniforms.every((uniform) => shader.reflection.uniforms.has(uniform))) {
    return;
  }
  if (!pointShadowMap) {
    uniforms.set("u_pointShadowMapTexture", new TextureBinding({ name: "u_pointShadowMapTexture", required: false }));
    uniforms.set("u_pointShadowMapEnabled", 0);
    uniforms.set("u_pointShadowLightPosition", [0, 0, 0]);
    uniforms.set("u_pointShadowRange", 1);
    uniforms.set("u_pointShadowFaceMatrices", new Float32Array(6 * 16));
    uniforms.set("u_pointShadowFaceRects", new Float32Array(6 * 4));
    uniforms.set("u_pointShadowStrength", 0);
    uniforms.set("u_pointShadowBias", 0);
    uniforms.set("u_pointShadowSlopeBias", 0);
    uniforms.set("u_pointShadowTexelSize", [1, 1]);
    uniforms.set("u_pointShadowPcfSampleCount", 1);
    uniforms.set("u_pointShadowPcfSamples", new Float32Array(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4));
    return;
  }
  const validation = pointShadowMap.texture.validate();
  if (!validation.ok) {
    throw new RenderDeviceError("Forward point-shadow atlas texture binding validation failed", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      diagnostics: validation.diagnostics
    });
  }
  if (pointShadowMap.lightPosition.length !== 3 || !isFiniteArrayLike(pointShadowMap.lightPosition)) {
    throw new RenderDeviceError("Forward point-shadow lightPosition must contain three finite values", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      lightPosition: pointShadowMap.lightPosition
    });
  }
  if (!Number.isFinite(pointShadowMap.range) || pointShadowMap.range <= 0) {
    throw new RenderDeviceError("Forward point-shadow range must be finite and positive", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      range: pointShadowMap.range
    });
  }
  const faceMatrices = toFloat32Array(pointShadowMap.faceMatrices, 6 * 16, "pointShadowMap.faceMatrices", item.label);
  const faceRects = toFloat32Array(pointShadowMap.faceRects, 6 * 4, "pointShadowMap.faceRects", item.label);
  validatePointShadowFaceRects(faceRects, item.label);
  const strength = pointShadowMap.strength ?? 0.65;
  const bias = pointShadowMap.bias ?? 0.001;
  const slopeBias = pointShadowMap.slopeBias ?? 1;
  const texelSize = pointShadowMap.texelSize ?? [
    1 / Math.max(1, pointShadowMap.texture.texture?.width ?? 1),
    1 / Math.max(1, pointShadowMap.texture.texture?.height ?? 1)
  ];
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RenderDeviceError("Forward point-shadow strength must be finite in [0, 1]", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      strength
    });
  }
  if (!Number.isFinite(bias) || bias < 0) {
    throw new RenderDeviceError("Forward point-shadow bias must be finite and non-negative", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      bias
    });
  }
  if (!Number.isFinite(slopeBias) || slopeBias < 0) {
    throw new RenderDeviceError("Forward point-shadow slopeBias must be finite and non-negative", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      slopeBias
    });
  }
  if (texelSize.length !== 2 || !texelSize.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RenderDeviceError("Forward point-shadow texelSize must contain two finite positive values", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      texelSize: Array.from(texelSize)
    });
  }
  const filterKernel = pointShadowMap.filterKernel ?? DEFAULT_FORWARD_SHADOW_FILTER_KERNEL;
  uniforms.set("u_pointShadowMapTexture", pointShadowMap.texture);
  uniforms.set("u_pointShadowMapEnabled", 1);
  uniforms.set("u_pointShadowLightPosition", pointShadowMap.lightPosition);
  uniforms.set("u_pointShadowRange", pointShadowMap.range);
  uniforms.set("u_pointShadowFaceMatrices", faceMatrices);
  uniforms.set("u_pointShadowFaceRects", faceRects);
  uniforms.set("u_pointShadowStrength", strength);
  uniforms.set("u_pointShadowBias", bias);
  uniforms.set("u_pointShadowSlopeBias", slopeBias);
  uniforms.set("u_pointShadowTexelSize", texelSize);
  uniforms.set("u_pointShadowPcfSampleCount", filterKernel.samples.length);
  uniforms.set("u_pointShadowPcfSamples", packForwardShadowPcfSamples(filterKernel, item.label));
}

function toFloat32Array(values: Float32Array | readonly number[], expectedLength: number, name: string, label: string | undefined): Float32Array {
  const source = values instanceof Float32Array ? values : new Float32Array(values);
  if (source.length !== expectedLength || !isFiniteArrayLike(source)) {
    throw new RenderDeviceError(`${name} must contain ${expectedLength} finite values`, "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label,
      length: source.length,
      expectedLength
    });
  }
  return source;
}

function validatePointShadowFaceRects(faceRects: Float32Array, label: string | undefined): void {
  for (let offset = 0; offset < faceRects.length; offset += 4) {
    const rect = [faceRects[offset], faceRects[offset + 1], faceRects[offset + 2], faceRects[offset + 3]];
    if (!rect.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || rect[2]! <= 0 || rect[3]! <= 0) {
      throw new RenderDeviceError("Forward point-shadow face rects must be normalized atlas rectangles", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
        label,
        face: offset / 4,
        rect
      });
    }
  }
}

function packForwardShadowPcfSamples(filterKernel: ShadowFilterKernel, label: string | undefined): Float32Array {
  if (filterKernel.samples.length < 1 || filterKernel.samples.length > MAX_FORWARD_SHADOW_PCF_SAMPLES) {
    throw new RenderDeviceError("Forward shadow-map PCF kernel must contain 1 to 32 samples", "FORWARD_SHADOW_MAP_CONTRACT", {
      label,
      samples: filterKernel.samples.length
    });
  }
  const packed = new Float32Array(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4);
  let weightSum = 0;
  for (const [index, sample] of filterKernel.samples.entries()) {
    if (![sample.x, sample.y, sample.weight].every(Number.isFinite) || sample.weight < 0) {
      throw new RenderDeviceError("Forward shadow-map PCF samples must contain finite offsets and non-negative weights", "FORWARD_SHADOW_MAP_CONTRACT", {
        label,
        sample
      });
    }
    const offset = index * 4;
    packed[offset] = sample.x;
    packed[offset + 1] = sample.y;
    packed[offset + 2] = sample.weight;
    weightSum += sample.weight;
  }
  if (weightSum <= 0) {
    throw new RenderDeviceError("Forward shadow-map PCF sample weights must sum to a positive value", "FORWARD_SHADOW_MAP_CONTRACT", {
      label,
      weightSum
    });
  }
  return packed;
}

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
  if (shader.reflection.uniforms.has("u_normalMatrix")) {
    uniforms.set(
      "u_normalMatrix",
      item.normalMatrix
        ? toMat4Uniform(item.normalMatrix, "normalMatrix", item.label)
        : new Float32Array(normalMatrixFromModel(toMat4Values(modelMatrix ?? identityMatrix(), "modelMatrix", item.label)))
    );
  }
}

function toMat4Uniform(value: Float32Array | readonly number[], field: string, label?: string): Float32Array {
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

function identityMatrix(): readonly number[] {
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
  return sortRenderQueueItems(items.map((item) => ({
    item,
    bucket: isTransparentRenderItem(item) ? "transparent" : isTransmissionRenderItem(item) ? "transmission" : "opaque",
    depth: cameraPosition ? distanceSquaredFromCamera(item, cameraPosition) : 0,
    pipelineKey: renderItemPipelineKey(item),
    batchKey: renderItemPipelineKey(item),
    instanceCount: item.instanceTransforms ? instanceTransformCount(item) : 1
  }))).items;
}

function isTransparentRenderItem(item: RenderItem): boolean {
  const material = item.material ?? new UnlitMaterial();
  return getBaseMaterial(material).renderState.blend;
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
  return `${baseMaterial.name}|${state.depthTest ? "dt" : "ndt"}|${state.depthWrite ? "dw" : "ndw"}|${state.cullMode}|${state.blend ? "blend" : "opaque"}`;
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
  instanceCount: number
): { readonly attributes: readonly InstanceVertexAttribute[]; readonly buffers: readonly RenderBuffer[] } {
  const descriptors: RenderItemInstanceAttribute[] = [];
  if (item.instanceColors) {
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

function resolveRenderGeometry(item: RenderItem): Geometry {
  if (item.morphTargets === undefined && item.morphWeights === undefined) {
    return item.geometry;
  }
  if (!item.morphTargets || !item.morphWeights) {
    throw new RenderDeviceError("Morph render items require both morphTargets and morphWeights", "MORPH_TARGET_CONTRACT", {
      label: item.label,
      targetCount: item.morphTargets?.length ?? 0,
      weightCount: item.morphWeights?.length ?? 0
    });
  }
  return applyMorphTargets(item.geometry, item.morphTargets, item.morphWeights);
}

function applyGpuMorphUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): boolean {
  if (
    !shader.reflection.uniforms.has("u_morphPositionDeltas") ||
    !shader.reflection.uniforms.has("u_morphWeights") ||
    !shader.reflection.uniforms.has("u_morphTargetCount")
  ) {
    return false;
  }
  if (!item.morphTargets || !item.morphWeights) {
    throw new RenderDeviceError("Morph render items require both morphTargets and morphWeights", "MORPH_TARGET_CONTRACT", {
      label: item.label,
      targetCount: item.morphTargets?.length ?? 0,
      weightCount: item.morphWeights?.length ?? 0
    });
  }
  if (item.morphTargets.length !== item.morphWeights.length) {
    throw new RenderDeviceError("Morph target count must match morph weight count", "MORPH_TARGET_CONTRACT", {
      label: item.label,
      targetCount: item.morphTargets.length,
      weightCount: item.morphWeights.length
    });
  }
  // Counts beyond the uniform fast-path capacity are not an error: fall back to the CPU morph
  // (resolveRenderGeometry -> applyMorphTargets), which is unlimited and morphs normals + tangents
  // so lighting follows the deformation. The texture-backed GPU plan (createMorphTargetPlan) packs
  // the same data for the texture path; see MorphTargetPlan.ts.
  if (item.morphTargets.length > MAX_GPU_MORPH_TARGETS || item.geometry.vertexBuffer.vertexCount > MAX_GPU_MORPH_VERTICES) {
    return false;
  }
  const packed = new Float32Array(MAX_GPU_MORPH_TARGETS * MAX_GPU_MORPH_VERTICES * 4);
  const packedNormals = new Float32Array(MAX_GPU_MORPH_TARGETS * MAX_GPU_MORPH_VERTICES * 4);
  const weights = new Float32Array(MAX_GPU_MORPH_TARGETS);
  for (let targetIndex = 0; targetIndex < item.morphTargets.length; targetIndex += 1) {
    const target = item.morphTargets[targetIndex]!;
    if (!target.positions || target.positions.length < item.geometry.vertexBuffer.vertexCount) {
      throw new RenderDeviceError("GPU morph shader path requires position deltas for every source vertex", "GPU_MORPH_TARGET_CONTRACT", {
        label: item.label,
        targetIndex,
        vertexCount: item.geometry.vertexBuffer.vertexCount,
        deltaCount: target.positions?.length ?? 0
      });
    }
    const weight = item.morphWeights[targetIndex] ?? 0;
    if (!Number.isFinite(weight)) {
      throw new RenderDeviceError("GPU morph weights must be finite", "GPU_MORPH_TARGET_CONTRACT", {
        label: item.label,
        targetIndex,
        weight
      });
    }
    weights[targetIndex] = weight;
    for (let vertex = 0; vertex < item.geometry.vertexBuffer.vertexCount; vertex += 1) {
      const delta = target.positions[vertex]!;
      if (delta.length !== 3 || !Number.isFinite(delta[0]) || !Number.isFinite(delta[1]) || !Number.isFinite(delta[2])) {
        throw new RenderDeviceError("GPU morph position deltas must be finite vec3 values", "GPU_MORPH_TARGET_CONTRACT", {
          label: item.label,
          targetIndex,
          vertex
        });
      }
      const offset = (targetIndex * MAX_GPU_MORPH_VERTICES + vertex) * 4;
      packed[offset] = delta[0];
      packed[offset + 1] = delta[1];
      packed[offset + 2] = delta[2];
      const normal = target.normals?.[vertex];
      if (normal && normal.length === 3) {
        packedNormals[offset] = normal[0];
        packedNormals[offset + 1] = normal[1];
        packedNormals[offset + 2] = normal[2];
      }
    }
  }
  uniforms.set("u_morphPositionDeltas", packed);
  uniforms.set("u_morphWeights", weights);
  uniforms.set("u_morphTargetCount", item.morphTargets.length);
  // Normal deltas are uploaded only when the bound shader declares the uniform (lit morph variants);
  // the default unlit morph shader ignores them.
  if (shader.reflection.uniforms.has("u_morphNormalDeltas")) {
    uniforms.set("u_morphNormalDeltas", packedNormals);
  }
  return true;
}

function applySkinningUniforms(
  skinning: SkinningPaletteBinding,
  material: Material,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!shader.reflection.uniforms.has("u_jointMatrices") || !shader.reflection.uniforms.has("u_jointCount")) {
    throw new RenderDeviceError("Skinned render item requires a shader with joint palette uniforms", "SKINNING_SHADER_CONTRACT", {
      material: material.name
    });
  }
  if (!Number.isInteger(skinning.jointCount) || skinning.jointCount <= 0 || skinning.jointCount > 96) {
    throw new RenderDeviceError("Skinning jointCount must be an integer in [1, 96]", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount
    });
  }
  if (skinning.matrices.length !== skinning.jointCount * 16) {
    throw new RenderDeviceError("Skinning matrix palette length must equal jointCount * 16", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount,
      matrixScalars: skinning.matrices.length
    });
  }
  if (!isFiniteArrayLike(skinning.matrices)) {
    throw new RenderDeviceError("Skinning matrix palette must contain finite values", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount
    });
  }
  uniforms.set("u_jointCount", skinning.jointCount);
  uniforms.set("u_jointMatrices", skinning.matrices);
}

function validateSkinningGeometryContract(item: RenderItem, skinning: SkinningPaletteBinding): void {
  const format = item.geometry.vertexBuffer.format;
  if (!format.hasAttribute("joints") || !format.hasAttribute("weights")) {
    throw new RenderDeviceError("Skinned render item geometry must include joints and weights attributes", "SKINNING_GEOMETRY_CONTRACT", {
      label: item.label,
      jointCount: skinning.jointCount,
      vertexFormat: format.attributes.map((attribute) => attribute.shaderName),
      missingAttributes: [
        ...(format.hasAttribute("joints") ? [] : ["a_joints"]),
        ...(format.hasAttribute("weights") ? [] : ["a_weights"])
      ]
    });
  }

  const jointsAttribute = format.getAttribute("joints");
  const weightsAttribute = format.getAttribute("weights");
  if (jointsAttribute.components !== 4 || weightsAttribute.components !== 4) {
    throw new RenderDeviceError("Skinned render item geometry must use four joint and four weight influences per vertex", "SKINNING_GEOMETRY_CONTRACT", {
      label: item.label,
      jointCount: skinning.jointCount,
      jointComponents: jointsAttribute.components,
      weightComponents: weightsAttribute.components
    });
  }

  for (let vertex = 0; vertex < item.geometry.vertexBuffer.vertexCount; vertex += 1) {
    const joints = item.geometry.vertexBuffer.getAttribute(vertex, "joints");
    const weights = item.geometry.vertexBuffer.getAttribute(vertex, "weights");
    let weightSum = 0;
    for (let influence = 0; influence < 4; influence += 1) {
      const joint = joints[influence] ?? 0;
      const weight = weights[influence] ?? 0;
      if (!Number.isFinite(weight) || weight < 0) {
        throw new RenderDeviceError("Skinned render item weights must be finite non-negative values", "SKINNING_GEOMETRY_CONTRACT", {
          label: item.label,
          jointCount: skinning.jointCount,
          vertex,
          influence,
          weight
        });
      }
      if (!Number.isFinite(joint) || !Number.isInteger(joint) || joint < 0) {
        throw new RenderDeviceError("Skinned render item joints must be finite non-negative integer indices", "SKINNING_GEOMETRY_CONTRACT", {
          label: item.label,
          jointCount: skinning.jointCount,
          vertex,
          influence,
          joint
        });
      }
      if (weight > 0 && joint >= skinning.jointCount) {
        throw new RenderDeviceError("Skinned render item joint indices must be within the uploaded skinning palette", "SKINNING_GEOMETRY_CONTRACT", {
          label: item.label,
          jointCount: skinning.jointCount,
          vertex,
          influence,
          joint,
          weight
        });
      }
      weightSum += weight;
    }
    if (weightSum <= 0) {
      throw new RenderDeviceError("Skinned render item weights must sum to a positive value", "SKINNING_GEOMETRY_CONTRACT", {
        label: item.label,
        jointCount: skinning.jointCount,
        vertex,
        weightSum
      });
    }
    if (Math.abs(weightSum - 1) > 0.02) {
      throw new RenderDeviceError("Skinned render item weights must be normalized before GPU skinning", "SKINNING_GEOMETRY_CONTRACT", {
        label: item.label,
        jointCount: skinning.jointCount,
        vertex,
        weightSum
      });
    }
  }
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

function isFiniteArrayLike(values: ArrayLike<number>): boolean {
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
