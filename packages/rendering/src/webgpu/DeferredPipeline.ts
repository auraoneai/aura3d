import { RenderDeviceError } from "../RenderDevice";
import type { RenderItem } from "../contracts/renderItem";
import { PBRMaterial } from "../PBRMaterial";
import { isTextureBinding } from "../TextureBinding";
import { DFG_LUT_RG16F, DFG_LUT_SIZE } from "../program/DFGLutData";
import { deferredProbeWgsl, packDeferredProbe, type DeferredProbeInput } from "./DeferredProbe";
import { PHYSICAL_LIGHTING_WGSL } from "./PhysicalLighting.wgsl";
import { assertWarmupActive, enqueueNativePipelineWarmup } from "./NativePipelineWarmup";

/** A bounded opaque material understood by the optional native drawing paths. */
export interface NativeDrawingMaterial {
  readonly baseColor: readonly [number, number, number, number];
  readonly emissive?: readonly [number, number, number];
  readonly shading?: "unlit" | "lambert" | "physical";
  /** Metallic and perceptual roughness for the bounded physical path. */
  readonly metallic?: number;
  readonly roughness?: number;
}

/** World-space triangle mesh. Each triangle indexes one material. */
export interface NativeDrawingScene {
  readonly positions: Float32Array;
  readonly normals?: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly triangleMaterials: Uint32Array;
  /** Triangles with a nonzero flag remain visible even outside the camera frustum. */
  readonly triangleNoCull?: Uint8Array;
  readonly materials: readonly NativeDrawingMaterial[];
}

export interface NativeDrawingLight {
  /** Direction from a surface toward the light, in world space. */
  readonly direction?: readonly [number, number, number];
  /** Linear directional radiance. Physical materials require an explicit value. */
  readonly color?: readonly [number, number, number];
  /** Linear ambient irradiance for physical materials; a Lambert multiplier otherwise. */
  readonly ambient?: readonly [number, number, number];
}

export interface NativeDrawingSurface {
  /** A single-sample output view, including when deferred MSAA is enabled. */
  readonly view: unknown;
  readonly width: number;
  readonly height: number;
}

/**
 * Frame-scoped renderer-owned attachments. The provider validates their device,
 * usage and lifetime. Its submit function must use this device's queue and
 * retain borrowed resources through completion, even if it throws after enqueue.
 */
export interface NativeDeferredAttachments {
  readonly colorView: unknown;
  readonly resolveView?: unknown;
  readonly depthAttachmentView: unknown;
  readonly depthSampleView: unknown;
  readonly colorFormat: string;
  readonly depthFormat: string;
  readonly width: number;
  readonly height: number;
  readonly sampleCount: number;
  /** Load previously initialized color/depth/stencil, or clear them together. */
  readonly loadOp: "load" | "clear";
  readonly clearColor: readonly [number, number, number, number];
  readonly depthClearValue: number;
  readonly stencilClearValue: number;
  submit(commands: readonly unknown[], readResources?: readonly object[]): void;
}

export interface NativeDrawingFrame {
  readonly scene: NativeDrawingScene;
  /** Column-major view-projection with the renderer's [-1, 1] depth range. */
  readonly viewProjection: ArrayLike<number>;
  readonly surface: NativeDrawingSurface;
  readonly clearColor?: readonly [number, number, number, number];
  readonly light?: NativeDrawingLight;
  /** Required for physical materials; coordinates are in world space. */
  readonly physical?: {
    readonly cameraPosition: readonly [number, number, number];
    readonly probe?: DeferredProbeInput;
    /** Write the PRD-03 indirect-radiance fraction into HDR alpha. */
    readonly indirectFraction?: boolean;
  };
  /** Optional shared attachments, used only by the deferred pipeline. */
  readonly deferredAttachments?: NativeDeferredAttachments;
}

export interface NativeDrawingOptions {
  readonly outputFormat: string;
  /** Permit an explicitly reported forward path when an optional path is unavailable. */
  readonly allowFallback?: boolean;
}

/** Deferred raster sample count; output is resolved to the single-sample surface. */
export interface DeferredDrawingOptions extends NativeDrawingOptions {
  readonly sampleCount?: 1 | 4;
}

export interface NativeDrawingDiagnostics {
  readonly requested: "deferred" | "meshlet" | "visibility";
  readonly active: "deferred" | "meshlet" | "visibility" | "forward";
  readonly fallbackReason?: string;
  readonly drawCalls: number;
  readonly triangles: number;
  /** True when GPU culling makes triangles a submitted upper bound. */
  readonly trianglesAreUpperBound?: boolean;
  readonly computeDispatches?: number;
  readonly submittedMeshlets?: number;
  readonly culledMeshlets?: number;
}

export interface NativeDrawingBuffer { destroy(): void }
export interface NativeDrawingTexture { createView(): unknown; destroy(): void }
export interface NativeDrawingRenderPipeline { getBindGroupLayout(index: number): unknown }
export interface NativeDrawingRenderPass {
  setPipeline(pipeline: NativeDrawingRenderPipeline): void;
  setBindGroup(index: number, group: unknown): void;
  setVertexBuffer(index: number, buffer: NativeDrawingBuffer): void;
  draw(count: number, instances?: number, firstVertex?: number): void;
  drawIndirect?(buffer: NativeDrawingBuffer, offset: number): void;
  end(): void;
}
export interface NativeDrawingComputePass {
  setPipeline(pipeline: NativeDrawingRenderPipeline): void;
  setBindGroup(index: number, group: unknown): void;
  dispatchWorkgroups(x: number): void;
  end(): void;
}
export interface NativeDrawingEncoder {
  beginComputePass?(descriptor?: Record<string, unknown>): NativeDrawingComputePass;
  beginRenderPass(descriptor: Record<string, unknown>): NativeDrawingRenderPass;
  finish(): unknown;
}
/** Narrow native interface: the same GPUDevice owned by WebGPUDevice.nativeGpuDevice. */
export interface NativeDrawingDevice {
  readonly limits?: {
    readonly maxColorAttachments?: number;
    readonly maxColorAttachmentBytesPerSample?: number;
    readonly maxTextureDimension2D?: number;
    readonly maxBufferSize?: number;
    readonly maxStorageBufferBindingSize?: number;
    readonly maxStorageBuffersPerShaderStage?: number;
    readonly maxComputeWorkgroupsPerDimension?: number;
    readonly maxSampledTexturesPerShaderStage?: number;
    readonly maxBindingsPerBindGroup?: number;
    readonly maxSamplersPerShaderStage?: number;
    readonly maxUniformBuffersPerShaderStage?: number;
    readonly maxUniformBufferBindingSize?: number;
  };
  readonly lost?: Promise<unknown>;
  readonly queue: {
    writeBuffer(buffer: NativeDrawingBuffer, offset: number, data: ArrayBufferView): void;
    submit(commands: readonly unknown[]): void;
    onSubmittedWorkDone(): Promise<void>;
  };
  createBuffer(descriptor: Record<string, unknown>): NativeDrawingBuffer;
  createTexture(descriptor: Record<string, unknown>): NativeDrawingTexture;
  createShaderModule(descriptor: Record<string, unknown>): unknown;
  createRenderPipeline(descriptor: Record<string, unknown>): NativeDrawingRenderPipeline;
  createRenderPipelineAsync?(descriptor: Record<string, unknown>): Promise<NativeDrawingRenderPipeline>;
  createComputePipeline?(descriptor: Record<string, unknown>): NativeDrawingRenderPipeline;
  createComputePipelineAsync?(descriptor: Record<string, unknown>): Promise<NativeDrawingRenderPipeline>;
  createBindGroup(descriptor: Record<string, unknown>): unknown;
  createCommandEncoder(descriptor?: Record<string, unknown>): NativeDrawingEncoder;
}

const BUFFER_COPY_DST = 0x08;
const BUFFER_VERTEX = 0x20;
const BUFFER_UNIFORM = 0x40;
const BUFFER_STORAGE = 0x80;
const TEXTURE_BINDING = 0x04;
const RENDER_ATTACHMENT = 0x10;
const VERTEX_BYTES = 32;
const MAX_EXACT_ID = 16_777_215;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
// Shared with the advanced-lighting bridge; those per-item sources are not
// represented in this bounded deferred material format.
const ADVANCED_LIGHTING_BINDING = Symbol.for("@aura3d/rendering/advanced-lighting-bindings");

type Destroyable = { destroy(): void };
export interface PreparedNativeDrawing {
  readonly vertices: Float32Array;
  readonly materials: Float32Array;
  readonly triangleMaterials: Uint32Array;
  readonly triangleNoCull?: Uint8Array;
  readonly triangleCount: number;
  readonly usesPhysical: boolean;
}
export interface NativeFrameBuffers {
  readonly vertices: NativeDrawingBuffer;
  readonly materials: NativeDrawingBuffer;
  readonly uniforms: NativeDrawingBuffer;
  readonly triangleMaterials: NativeDrawingBuffer;
  readonly dfg?: NativeDrawingBuffer;
  readonly all: readonly NativeDrawingBuffer[];
  /** Buffers whose upload may already be queued, even before a draw submission. */
  readonly written: readonly NativeDrawingBuffer[];
}

/** @internal A meshlet owner's validated contiguous raster and culling plan. */
interface NativeDeferredMeshletBatch {
  readonly bounds: Uint8Array;
  readonly count: number;
  readonly workgroups: number;
  readonly computePipeline: NativeDrawingRenderPipeline;
}

/** Validates inputs and expands triangle indices into a GPU-friendly stream. */
export function prepareNativeDrawing(scene: NativeDrawingScene, limits?: NativeDrawingDevice["limits"], allowPhysical = false): PreparedNativeDrawing {
  if (!(scene.positions instanceof Float32Array) || scene.positions.length % 3 !== 0) fail("positions", "must contain float32 vec3 positions");
  const vertexCount = scene.positions.length / 3;
  if (scene.normals && (!(scene.normals instanceof Float32Array) || scene.normals.length !== scene.positions.length)) fail("normals", "must match positions");
  if (scene.indices && !(scene.indices instanceof Uint16Array || scene.indices instanceof Uint32Array)) fail("indices", "must be Uint16Array or Uint32Array");
  const streamCount = scene.indices?.length ?? vertexCount;
  if (streamCount % 3 !== 0) fail("indices", "must describe complete triangles");
  const triangleCount = streamCount / 3;
  if (triangleCount > MAX_EXACT_ID) fail("indices", "exceeds the exact primitive-id limit");
  if (!(scene.triangleMaterials instanceof Uint32Array) || scene.triangleMaterials.length !== triangleCount) fail("triangleMaterials", "must contain one material index per triangle");
  if (scene.triangleNoCull && (!(scene.triangleNoCull instanceof Uint8Array) || scene.triangleNoCull.length !== triangleCount)) fail("triangleNoCull", "must contain one flag per triangle");
  if (!scene.materials || scene.materials.length === 0) fail("materials", "must contain at least one material");
  if (scene.materials.length > MAX_EXACT_ID) fail("materials", "exceeds the exact material-id limit");
  const maxBuffer = limits?.maxBufferSize ?? 268_435_456;
  const maxStorage = limits?.maxStorageBufferBindingSize ?? 134_217_728;
  if (streamCount * VERTEX_BYTES > maxBuffer || scene.materials.length * 32 > maxBuffer || triangleCount * 4 > maxBuffer) fail("scene", "exceeds maxBufferSize");
  if (scene.materials.length * 32 > maxStorage || triangleCount * 4 > maxStorage) fail("scene.materials", "exceeds maxStorageBufferBindingSize");
  const materialData = new Float32Array(scene.materials.length * 8);
  let usesPhysical = false;
  scene.materials.forEach((material, index) => {
    const color = material.baseColor;
    const emissive = material.emissive ?? [0, 0, 0];
    if (!color || color.length !== 4 || !color.every(Number.isFinite) || color.some(value => value < 0 || value > 65504)) fail(`materials[${index}].baseColor`, "must be a finite vec4 in [0, 65504]");
    if (color[3] !== 1) fail(`materials[${index}].baseColor[3]`, "transparent materials require the sorted forward renderer");
    if (emissive.length !== 3 || !emissive.every(Number.isFinite) || emissive.some(value => value < 0 || value > 65504)) fail(`materials[${index}].emissive`, "must be a finite vec3 in [0, 65504]");
    if (material.shading !== undefined && material.shading !== "unlit" && material.shading !== "lambert" && material.shading !== "physical") fail(`materials[${index}].shading`, "must be unlit, lambert or physical");
    if (material.shading === "physical") {
      if (!allowPhysical) fail(`materials[${index}].shading`, "physical materials require the deferred renderer");
      if (color.slice(0, 3).some(value => value > 1)) fail(`materials[${index}].baseColor`, "physical color channels must be in [0, 1]");
      if (!Number.isFinite(material.metallic) || material.metallic! < 0 || material.metallic! > 1 || !Number.isFinite(material.roughness) || material.roughness! < 0 || material.roughness! > 1) fail(`materials[${index}]`, "physical metallic and roughness must be finite values in [0, 1]");
      usesPhysical = true;
    }
    materialData.set(color, index * 8);
    materialData.set(emissive, index * 8 + 4);
    // The deferred geometry pass consumes alpha as scratch only after the
    // external opaque-alpha contract has been checked above.
    if (material.shading === "physical") materialData[index * 8 + 3] = material.metallic!;
    materialData[index * 8 + 7] = material.shading === "physical" ? 3 + material.roughness! : material.shading === "lambert" ? 2 : 1;
  });
  const vertices = new Float32Array(streamCount * 8);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const material = scene.triangleMaterials[triangle]!;
    if (material >= scene.materials.length) fail(`triangleMaterials[${triangle}]`, "is outside the material table");
    const ids = [0, 1, 2].map(corner => scene.indices?.[triangle * 3 + corner] ?? triangle * 3 + corner);
    if (ids.some(id => id >= vertexCount)) fail(`indices[${triangle * 3}]`, "references a missing vertex");
    const a = ids.map(id => [scene.positions[id * 3]!, scene.positions[id * 3 + 1]!, scene.positions[id * 3 + 2]!] as const);
    if (a.some(position => !position.every(Number.isFinite))) fail(`positions[${ids[0]}]`, "must be finite");
    const fallbackNormal = faceNormal(a[0]!, a[1]!, a[2]!);
    for (let corner = 0; corner < 3; corner++) {
      const id = ids[corner]!;
      const normal = scene.normals ? Array.from(scene.normals.subarray(id * 3, id * 3 + 3)) : fallbackNormal;
      if (!normal.every(Number.isFinite)) fail(`normals[${id}]`, "must be finite");
      const offset = (triangle * 3 + corner) * 8;
      vertices.set(a[corner]!, offset);
      vertices.set(normal, offset + 3);
      vertices[offset + 6] = material;
      vertices[offset + 7] = triangle;
    }
  }
  return { vertices, materials: materialData, triangleMaterials: scene.triangleMaterials.slice(),
    ...(scene.triangleNoCull ? { triangleNoCull: scene.triangleNoCull.slice() } : {}), triangleCount, usesPhysical };
}

/**
 * Convert existing RenderItems without substituting unsupported material or deformation
 * behavior. This accepts static, opaque unlit triangles and an explicitly
 * enabled subset of generated physical materials; callers can route an
 * explicit rejection to the ordinary forward renderer.
 */
export function nativeDrawingSceneFromRenderItems(items: readonly RenderItem[], options: { readonly physicalModel?: "generated-metallic-roughness" } = {}): NativeDrawingScene {
  const positions: number[] = [];
  const normals: number[] = [];
  const triangleMaterials: number[] = [];
  const triangleNoCull: number[] = [];
  const materials: NativeDrawingMaterial[] = [];
  for (const [itemIndex, item] of items.entries()) {
    const field = `items[${itemIndex}]`;
    const geometry = item.geometry;
    if (ADVANCED_LIGHTING_BINDING in item) fail(field, "advanced lighting requires the forward renderer");
    if (geometry.topology !== "triangles") fail(`${field}.geometry.topology`, "must be triangles");
    if (item.skinning || item.morphTargets?.length || item.morphWeights?.some(value => value !== 0) || item.instanceTransforms || item.instanceAttributes?.length || item.instanceColors || (item.instanceCount !== undefined && item.instanceCount !== 1) || geometry.morphTargets?.length) fail(field, "deformed and instanced geometry needs the forward renderer");
    if (item.modelViewProjectionMatrix || item.normalMatrix || item.onBeforeRender || item.environmentCube || item.cubeCameraEnvMap) fail(field, "custom transforms, callbacks and environment bindings require the forward renderer");
    // The lean unlit forward shader does not consume u_geometryMatrix. Do not
    // apply a non-identity matrix here and silently change that draw.
    if (item.geometryMatrix && (item.geometryMatrix.length !== 16 || Array.from(item.geometryMatrix).some((value, index) => value !== IDENTITY[index]))) fail(`${field}.geometryMatrix`, "requires the forward renderer");
    if (geometry.groups?.length) fail(`${field}.geometry.groups`, "group ranges need separate render items");
    if (!geometry.vertexBuffer.format.hasAttribute("position") || geometry.vertexBuffer.format.getAttribute("position").components !== 3) fail(`${field}.geometry.position`, "must be a vec3");
    const positionAttribute = geometry.vertexBuffer.format.getAttribute("position");
    if (positionAttribute.shaderName !== "a_position" || positionAttribute.shaderLocation !== 0 || positionAttribute.integer) fail(`${field}.geometry.position`, "must provide the unlit shader's floating-point position input");
    if (geometry.vertexBuffer.format.hasAttribute("normal") && geometry.vertexBuffer.format.getAttribute("normal").components !== 3) fail(`${field}.geometry.normal`, "must be a vec3");
    // The lean unlit shader consumes a color stream whenever one is bound,
    // even if the material did not declare it as a required attribute.
    if (geometry.vertexBuffer.format.attributes.some(attribute => attribute.shaderLocation === 4)) fail(`${field}.geometry.vertexColor`, "vertex colors require the forward renderer");
    const normalAttribute = geometry.vertexBuffer.format.hasAttribute("normal") ? geometry.vertexBuffer.format.getAttribute("normal") : undefined;
    if (normalAttribute && geometry.vertexBuffer.format.streams.find(stream => stream.slot === normalAttribute.bufferSlot)?.stepMode !== "vertex") fail(`${field}.geometry.normal`, "instance-rate normals require the forward renderer");
    const material = item.material;
    // Separate the absent-material case so TypeScript narrows the wrapper on
    // both branches. Keep the structural check: callers may pass a material
    // instance created by another copy of the package.
    const base = material ? ("baseMaterial" in material ? material.baseMaterial : material) : undefined;
    const physical = base?.shaderKey === "aura3d/pbr-direct" && options.physicalModel === "generated-metallic-roughness";
    if (base && ((base.shaderKey !== "aura3d/unlit" && !physical) || base.shaderVariant)) fail(`${field}.material`, "only the standard unlit material or an explicitly enabled physical material is supported by this adapter");
    if (physical && (Object.getPrototypeOf(base) !== PBRMaterial.prototype || base!.programFeatures !== PBRMaterial.prototype.programFeatures)) fail(`${field}.material`, "custom physical material features require the forward renderer");
    if ((item.lodFade !== undefined && item.lodFade !== 1) || (item.cameraFade !== undefined && item.cameraFade !== 1) || item.instanceEmissive) fail(field, "fades and per-instance emissive values require the forward renderer");
    if (base) {
      const state = base.renderState;
      const extended = state as typeof state & { readonly frontFace?: "ccw" | "cw"; readonly sampleMask?: number; readonly blendConstant?: readonly number[]; readonly blendedDepthWrite?: "allow" };
      if ((extended.frontFace !== undefined && extended.frontFace !== "ccw") || (extended.sampleMask !== undefined && extended.sampleMask !== 0xffffffff) || extended.blendConstant || extended.blendedDepthWrite) fail(`${field}.material.renderState`, "extended draw state requires the forward renderer");
      if (state.blend || (state.blendMode && state.blendMode !== "opaque") || !state.depthTest || !state.depthWrite || state.depthCompare !== "less-equal" || (state.depthCompareV2 && state.depthCompareV2 !== "less-equal") || state.stencil || state.polygonOffset || state.scissor || state.alphaToCoverage || state.colorWrite.some(value => !value) || state.cullMode !== "back") fail(`${field}.material.renderState`, "requires the forward renderer");
      if (base.requiredAttributes.includes("a_color")) fail(`${field}.material.vertexColors`, "requires the forward renderer");
      for (const [name, value] of material!.getParameters()) if (isTextureBinding(value) && value.texture) fail(`${field}.material.${name}`, "texture bindings require the forward renderer");
      if ((material!.getParameter("u_alphaCutoff") as number | undefined ?? 0) !== 0 || (material!.getParameter("u_spriteMode") as number | undefined ?? 0) !== 0 || (material!.getParameter("u_roundPoints") as number | undefined ?? 0) !== 0 || (material!.getParameter("u_instanceCount") as number | undefined ?? 0) !== 0) fail(`${field}.material`, "alpha masks, sprites, round points and material-driven instances require the forward renderer");
    }
    const rawColor = material?.getParameter("u_baseColor") ?? [1, 1, 1, 1];
    if (typeof rawColor === "number" || isTextureBinding(rawColor) || rawColor.length !== 4) fail(`${field}.material.baseColor`, "must be a vec4");
    const color = Array.from(rawColor) as [number, number, number, number];
    if (color[3] !== 1) fail(`${field}.material.baseColor[3]`, "transparent materials require the forward renderer");
    let nativeMaterial: NativeDrawingMaterial = { baseColor: color, shading: "unlit" };
    if (physical) {
      if (!normalAttribute || normalAttribute.shaderName !== "a_normal" || normalAttribute.shaderLocation !== 1 || normalAttribute.integer) fail(`${field}.geometry.normal`, "physical materials require the unlit-compatible floating-point normal input");
      if (base!.requiredAttributes.some(attribute => attribute !== "a_position" && attribute !== "a_normal")) fail(`${field}.material`, "additional physical attributes require the forward renderer");
      const scalar = (name: string, fallback: number): number => {
        const value = material!.getParameter(name) ?? fallback;
        if (typeof value !== "number" || !Number.isFinite(value)) fail(`${field}.material.${name}`, "must be finite");
        return value;
      };
      const values = (name: string, fallback: readonly number[]): readonly number[] => {
        const value = material!.getParameter(name) ?? fallback;
        if (typeof value === "number" || isTextureBinding(value) || value.length !== fallback.length || !Array.from(value).every(Number.isFinite)) fail(`${field}.material.${name}`, `must be a finite vec${fallback.length}`);
        return Array.from(value);
      };
      const unsupportedScalars = ["u_clearcoatFactor", "u_anisotropyStrength", "u_iridescenceFactor", "u_transmissionFactor", "u_volumeThicknessFactor", "u_diffuseTransmissionFactor", "u_dispersion", "u_diffuseRoughness", "u_retroreflection", "u_flatShading", "u_diffuseModel"];
      // A zero sheen color contributes nothing even when the root material's
      // default sheen roughness selects the otherwise inert lobe.
      const sheenRoughness = scalar("u_sheenRoughnessFactor", 0);
      // The generated packer gives this alias priority when supplied, including
      // on a MaterialInstance; ignoring it would silently alter reflectance.
      const specular = scalar("u_specularIntensity", scalar("u_specularFactor", 1));
      if (unsupportedScalars.some(name => scalar(name, 0) !== 0) || sheenRoughness < 0 || sheenRoughness > 1 || scalar("u_ior", 1.5) !== 1.5 || specular !== 1 || scalar("u_materialEnvironmentIntensity", 1) !== 1 || scalar("u_specularAntialiasing", 1) === 0 || values("u_specularColorFactor", [1, 1, 1]).some(value => value !== 1) || values("u_sheenColorFactor", [0, 0, 0]).some(value => value !== 0)) fail(`${field}.material`, "physical extensions and custom shader features require the forward renderer");
      const metallic = scalar("u_metallic", 0), roughness = scalar("u_roughness", 1);
      if (metallic < 0 || metallic > 1 || roughness < 0 || roughness > 1) fail(`${field}.material`, "physical metallic and roughness must be in [0, 1]");
      const strength = scalar("u_emissiveStrength", 1);
      if (strength < 0 || strength > 1) fail(`${field}.material.u_emissiveStrength`, "physical emissive-strength extensions require the forward renderer");
      const emission = values("u_emissiveColor", [0, 0, 0]).map(value => value * strength) as [number, number, number];
      if (emission.some(value => value < 0 || value > 65504)) fail(`${field}.material.u_emissiveColor`, "must be non-negative and representable");
      nativeMaterial = { baseColor: color, shading: "physical", metallic, roughness, emissive: emission };
    }
    const materialIndex = materials.push(nativeMaterial) - 1;
    const model = multiplyMatrices(item.modelMatrix ?? IDENTITY, item.geometryMatrix ?? IDENTITY);
    const determinant = model[0]! * (model[5]! * model[10]! - model[9]! * model[6]!) - model[4]! * (model[1]! * model[10]! - model[9]! * model[2]!) + model[8]! * (model[1]! * model[6]! - model[5]! * model[2]!);
    if (determinant < -1e-8) fail(`${field}.modelMatrix`, "reflected winding requires the forward renderer");
    const transformNormal = normalTransform(model, field);
    const vertexBuffer = geometry.vertexBuffer;
    const positionBuffer = geometry.getAttributeBuffer("position");
    const normalBuffer = normalAttribute ? geometry.getAttributeBuffer("normal") : undefined;
    const indices = geometry.indexBuffer?.data;
    const count = indices?.length ?? vertexBuffer.vertexCount;
    const baseRange = geometry.drawRange;
    const start = Math.min(count, Math.max(0, baseRange?.start ?? 0, item.drawRange?.start ?? 0));
    const end = Math.max(start, Math.min(count, baseRange ? baseRange.start + Math.max(0, baseRange.count) : count, item.drawRange ? item.drawRange.start + Math.max(0, item.drawRange.count) : count));
    if (!Number.isInteger(start) || !Number.isInteger(end) || start % 3 !== 0 || (end - start) % 3 !== 0) fail(`${field}.drawRange`, "must align with complete triangles");
    for (let i = start; i < end; i += 3) {
      const vertices = [0, 1, 2].map(corner => indices?.[i + corner] ?? i + corner);
      const world = vertices.map(index => transformPoint(model, positionBuffer.getDecodedAttribute(index, "position")));
      const face = faceNormal(world[0]!, world[1]!, world[2]!);
      for (const [corner, vertex] of vertices.entries()) {
        positions.push(...world[corner]!);
        normals.push(...(normalBuffer ? transformNormal(normalBuffer.getDecodedAttribute(vertex, "normal")) : face));
      }
      triangleMaterials.push(materialIndex);
      triangleNoCull.push(item.frustumCulled === false ? 1 : 0);
    }
  }
  if (!materials.length) materials.push({ baseColor: [1, 1, 1, 1] });
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), triangleMaterials: new Uint32Array(triangleMaterials), triangleNoCull: new Uint8Array(triangleNoCull), materials };
}

export function asNativeDrawingDevice(device: unknown): NativeDrawingDevice {
  const value = device as Partial<NativeDrawingDevice> | null;
  if (!value || !value.queue || typeof value.queue.writeBuffer !== "function" || typeof value.queue.submit !== "function" || typeof value.queue.onSubmittedWorkDone !== "function" || typeof value.createBuffer !== "function" || typeof value.createTexture !== "function" || typeof value.createShaderModule !== "function" || typeof value.createRenderPipeline !== "function" || typeof value.createBindGroup !== "function" || typeof value.createCommandEncoder !== "function") {
    throw new RenderDeviceError("Native drawing requires a complete WebGPU device and queue completion", "NATIVE_DRAW_DEVICE_UNAVAILABLE");
  }
  return value as NativeDrawingDevice;
}

// Failed fences or destructors must not let an owner with live resources
// disappear before a later fence, confirmed loss, or an explicit retry.
const pendingNativeDrawingOwners = new Set<NativeDrawingOwner>();

export class NativeDrawingOwner {
  protected readonly device: NativeDrawingDevice;
  protected readonly outputFormat: string;
  protected disposed = false;
  protected lost = false;
  private lossConfirmed = false;
  private disposing = false;
  private activeFrames = 0;
  private fenceVersion = 0;
  private fenceFailure?: { readonly error: unknown };
  private readonly warmupLifetime = new AbortController();
  private readonly pending = new Set<Destroyable>();
  private readonly destroying = new Set<Destroyable>();
  private readonly destructionFailures = new Map<Destroyable, unknown>();
  private readonly retirementObservers = new Set<() => void>();
  constructor(device: unknown, options: NativeDrawingOptions) {
    this.device = asNativeDrawingDevice(device);
    if (!options || !["rgba8unorm", "rgba8unorm-srgb", "bgra8unorm", "bgra8unorm-srgb", "rgba16float"].includes(options.outputFormat)) fail("outputFormat", "must be a supported floating-point WebGPU color format");
    if ((this.device.limits?.maxStorageBuffersPerShaderStage ?? 8) < 1) throw new RenderDeviceError("Native drawing requires one fragment storage buffer", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "maxStorageBuffersPerShaderStage" });
    this.outputFormat = options.outputFormat;
    // An unresolved device-loss promise must not retain retired warmup owners.
    const owner = new WeakRef(this);
    this.device.lost?.then(() => {
      const live = owner.deref();
      if (!live) return;
      live.lost = true;
      live.lossConfirmed = true;
      live.fenceVersion += 1;
      live.fenceFailure = undefined;
      live.warmupLifetime.abort(new RenderDeviceError("Native drawing device is lost", "DEVICE_LOST"));
      live.releasePending([...live.pending]);
    }, () => {
      const live = owner.deref();
      if (!live) return;
      live.lost = true;
      live.warmupLifetime.abort(new RenderDeviceError("Native drawing device is lost", "DEVICE_LOST"));
    });
  }
  /** Snapshot of failed native destructors, including failures after dispose. */
  get retirementDestructionErrors(): readonly unknown[] {
    return [...this.destructionFailures.values()];
  }
  /** @internal A disposed owner is complete only after all frame work and handles retire. */
  get nativeRetirementComplete(): boolean {
    return this.disposed && !this.disposing && this.activeFrames === 0 && this.pending.size === 0 && this.destroying.size === 0;
  }
  /** @internal Failed fences do not release their handles; a later fence may retry. */
  get nativeRetirementFenceFailure(): { readonly error: unknown } | undefined {
    return this.fenceFailure && [...this.pending].some(resource => !this.destructionFailures.has(resource))
      ? this.fenceFailure : undefined;
  }
  /** @internal Register a state observer without transferring resource ownership. */
  observeNativeRetirement(observer: () => void): () => void {
    this.retirementObservers.add(observer);
    return () => { this.retirementObservers.delete(observer); };
  }
  /** @internal Composite pipelines include their independently retiring children. */
  visitNativeRetirementOwners(visit: (owner: NativeDrawingOwner) => void): void { visit(this); }
  private notifyNativeRetirement(): void {
    for (const observer of [...this.retirementObservers]) observer();
  }
  protected beginNativeFrame(): void {
    this.assertAlive();
    this.activeFrames += 1;
  }
  protected endNativeFrame(): void {
    this.activeFrames -= 1;
    this.notifyNativeRetirement();
  }
  protected assertAlive(): void {
    if (this.disposed) throw new RenderDeviceError("Native drawing pipeline is disposed", "DISPOSED_RESOURCE");
    if (this.lost) throw new RenderDeviceError("Native drawing device is lost", "WEBGPU_DEVICE_LOST");
    if (this.destructionFailures.size) {
      throw new AggregateError([...this.destructionFailures.values()], "Native drawing resource destruction failed");
    }
  }

  protected assertWarmupActive(signal?: AbortSignal): void {
    assertWarmupActive([this.warmupLifetime.signal, signal]);
    this.assertAlive();
  }

  protected async warmRenderPipeline(descriptor: Record<string, unknown>, signal?: AbortSignal): Promise<NativeDrawingRenderPipeline> {
    this.assertWarmupActive(signal);
    const pipeline = await enqueueNativePipelineWarmup(this.device, () => this.device.createRenderPipelineAsync
      ? this.device.createRenderPipelineAsync(descriptor) : this.device.createRenderPipeline(descriptor), [this.warmupLifetime.signal, signal]);
    this.assertWarmupActive(signal);
    return pipeline;
  }

  protected async warmComputePipeline(descriptor: Record<string, unknown>, signal?: AbortSignal): Promise<NativeDrawingRenderPipeline> {
    this.assertWarmupActive(signal);
    const pipeline = await enqueueNativePipelineWarmup(this.device, () => this.device.createComputePipelineAsync
      ? this.device.createComputePipelineAsync(descriptor) : this.device.createComputePipeline!(descriptor), [this.warmupLifetime.signal, signal]);
    this.assertWarmupActive(signal);
    return pipeline;
  }
  protected createFrameBuffers(frame: NativeDrawingFrame, prepared: PreparedNativeDrawing): NativeFrameBuffers {
    const width = frame.surface.width, height = frame.surface.height;
    const maxDimension = this.device.limits?.maxTextureDimension2D ?? 8192;
    if (!frame.surface.view || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > maxDimension || height > maxDimension) fail("surface", `must have a view and dimensions in [1, ${maxDimension}]`);
    if (frame.viewProjection.length !== 16 || !Array.from(frame.viewProjection).every(Number.isFinite)) fail("viewProjection", "must be a finite mat4");
    const clear = frame.deferredAttachments?.clearColor ?? frame.clearColor ?? [0, 0, 0, 1];
    const direction = frame.light?.direction ?? [0, 0, 1];
    const color = frame.light?.color ?? [1, 1, 1];
    const ambient = frame.light?.ambient ?? [0.15, 0.15, 0.15];
    if (clear.length !== 4 || !clear.every(Number.isFinite)) fail("clearColor", "must be a finite vec4");
    if (direction.length !== 3 || !direction.every(Number.isFinite) || Math.hypot(...direction) === 0) fail("light.direction", "must be a nonzero finite vec3");
    if (color.length !== 3 || !color.every(Number.isFinite) || color.some(value => value < 0)) fail("light.color", "must be a non-negative finite vec3");
    if (ambient.length !== 3 || !ambient.every(Number.isFinite) || ambient.some(value => value < 0)) fail("light.ambient", "must be a non-negative finite vec3");
    if (prepared.usesPhysical && (!frame.physical || !frame.light?.direction || !frame.light.color || !frame.light.ambient)) fail("physical", "requires an explicit camera, directional radiance and ambient irradiance");
    const camera = frame.physical?.cameraPosition ?? [0, 0, 0];
    if (camera.length !== 3 || !camera.every(Number.isFinite)) fail("physical.cameraPosition", "must be a finite vec3");
    const gpuViewProjection = Float32Array.from(frame.viewProjection);
    if (!gpuViewProjection.every(Number.isFinite)) fail("viewProjection", "must remain finite in float32");
    const inverse = prepared.usesPhysical ? invertViewProjection(gpuViewProjection) : IDENTITY;
    const uniform = new Float32Array(56);
    uniform.set(gpuViewProjection, 0);
    const length = Math.hypot(...direction);
    uniform.set(direction.map(value => value / length), 16);
    uniform.set(color, 20);
    uniform.set(ambient, 24);
    uniform.set(clear, 28);
    uniform.set(inverse, 32);
    uniform.set(camera, 48);
    uniform.set([width, height, frame.deferredAttachments?.loadOp === "load" ? 1 : 0, frame.physical?.indirectFraction ? 1 : 0], 52);
    if (!Array.from(uniform).every(Number.isFinite)) fail("frame", "must remain finite in float32");
    const maxBuffer = this.device.limits?.maxBufferSize ?? 268_435_456;
    const maxStorage = this.device.limits?.maxStorageBufferBindingSize ?? 134_217_728;
    if (prepared.vertices.byteLength > maxBuffer || prepared.materials.byteLength > maxBuffer || prepared.triangleMaterials.byteLength > maxBuffer) fail("scene", "exceeds maxBufferSize");
    if (prepared.materials.byteLength > maxStorage || prepared.triangleMaterials.byteLength > maxStorage) fail("scene.materials", "exceeds maxStorageBufferBindingSize");
    if (prepared.usesPhysical && (dfgCoefficients().byteLength > maxBuffer || dfgCoefficients().byteLength > maxStorage)) throw new RenderDeviceError("Physical deferred DFG data exceeds device storage limits", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "maxStorageBufferBindingSize" });
    const all: NativeDrawingBuffer[] = [], written: NativeDrawingBuffer[] = [];
    const make = (label: string, data: ArrayBufferView, usage: number): NativeDrawingBuffer => {
      const buffer = this.device.createBuffer({ label, size: Math.max(4, data.byteLength), usage: usage | BUFFER_COPY_DST });
      all.push(buffer);
      if (data.byteLength) {
        // A queue adapter can enqueue an upload and then throw.
        written.push(buffer);
        this.device.queue.writeBuffer(buffer, 0, data);
      }
      return buffer;
    };
    try {
      const vertices = make("aura-native-vertices", prepared.vertices, BUFFER_VERTEX);
      const materials = make("aura-native-materials", prepared.materials, BUFFER_STORAGE);
      const uniforms = make("aura-native-frame", uniform, BUFFER_UNIFORM);
      const triangleMaterials = make("aura-native-triangles", prepared.triangleMaterials, BUFFER_STORAGE);
      const dfg = prepared.usesPhysical ? make("aura-native-dfg", dfgCoefficients(), BUFFER_STORAGE) : undefined;
      return { vertices, materials, uniforms, triangleMaterials, ...(dfg ? { dfg } : {}), all, written };
    } catch (error) { throw this.cleanupFailedFrame(error, all, written); }
  }
  protected retire(resources: readonly Destroyable[]): void {
    for (const resource of resources) this.pending.add(resource);
    if (this.pending.size) pendingNativeDrawingOwners.add(this);
    // A later queue fence also covers work whose earlier fence failed. Capture
    // only the resources retired before this fence; later submissions need
    // their own completion proof.
    const snapshot = [...this.pending];
    if (!snapshot.length) { this.notifyNativeRetirement(); return; }
    if (this.lossConfirmed) { this.releasePending(snapshot); return; }
    // Every new snapshot covers all previously pending handles. An older failed
    // fence must not overwrite a newer pending or successful attempt.
    const version = ++this.fenceVersion;
    this.fenceFailure = undefined;
    this.notifyNativeRetirement();
    let settled = false;
    const pass = (): void => {
      if (settled) return;
      settled = true;
      if (version === this.fenceVersion) this.fenceFailure = undefined;
      this.releasePending(snapshot);
    };
    const failFence = (error: unknown): void => {
      if (settled) return;
      settled = true;
      if (version === this.fenceVersion && !this.lossConfirmed) this.fenceFailure = { error };
      this.notifyNativeRetirement();
    };
    try {
      const fence = this.device.queue.onSubmittedWorkDone();
      if (!fence || typeof fence.then !== "function") throw new Error("Native drawing queue completion is unavailable");
      const observed = fence.then(pass, failFence);
      void observed?.catch?.(() => {});
    } catch (error) { failFence(error); }
  }
  private releasePending(resources: readonly Destroyable[], retryFailed = false): unknown[] {
    const failures: unknown[] = [];
    for (const resource of resources) {
      if (!this.pending.has(resource) || this.destroying.has(resource) || (!retryFailed && this.destructionFailures.has(resource))) continue;
      this.destroying.add(resource);
      try {
        resource.destroy();
        this.pending.delete(resource);
        this.destructionFailures.delete(resource);
      } catch (error) {
        this.destructionFailures.set(resource, error);
        failures.push(error);
      } finally { this.destroying.delete(resource); }
    }
    if (!this.pending.size) pendingNativeDrawingOwners.delete(this);
    this.notifyNativeRetirement();
    return failures;
  }
  /**
   * No render commands were submitted, but writeBuffer may have queued uploads.
   * Destroy only never-queued allocations now; keep writes behind a queue fence.
   */
  protected cleanupFailedFrame(error: unknown, resources: readonly Destroyable[], written: readonly Destroyable[]): unknown {
    if (written.length) this.retire(written);
    const queued = new Set(written);
    const unused = resources.filter(resource => !queued.has(resource));
    for (const resource of unused) this.pending.add(resource);
    if (this.pending.size) pendingNativeDrawingOwners.add(this);
    const failures = this.releasePending(unused);
    for (const resource of written) {
      if (this.destructionFailures.has(resource)) failures.push(this.destructionFailures.get(resource));
    }
    return failures.length ? new AggregateError([error, ...failures], "Native drawing failed and resource cleanup failed", { cause: error }) : error;
  }
  /** Do not let the renderer interpret an ambiguous submission as a safe fallback. */
  protected submissionFailure(error: unknown): unknown {
    const failures = this.retirementDestructionErrors;
    if (failures.length) return new AggregateError([error, ...failures], "Native drawing submission and resource cleanup failed", { cause: error });
    if (error instanceof RenderDeviceError && [
      "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", "NATIVE_DRAW_INVALID_INPUT", "WEBGPU_DEFERRED_SURFACE_UNAVAILABLE",
      "WEBGPU_DEFERRED_PROBE_UNAVAILABLE", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED"
    ].includes(error.code)) return new Error(`Native drawing submission failed: ${error.message}`, { cause: error });
    return error;
  }
  protected submit(encoder: NativeDrawingEncoder, buffers: NativeFrameBuffers, extra: readonly Destroyable[], state: { attempted: boolean }, submit?: (commands: readonly unknown[]) => void): void {
    this.assertAlive();
    const commands = [encoder.finish()];
    this.assertAlive();
    // Once control reaches either submit function, a throw does not prove that
    // no commands were enqueued. Fence all frame-owned handles in either case.
    state.attempted = true;
    try { if (submit) submit(commands); else this.device.queue.submit(commands); }
    finally { this.retire(buffers.all); this.retire(extra); }
  }
  protected disposeOwnedPipelines(_first: boolean): void {}
  private retireNativeOwner(includeChildren: boolean): void {
    if (this.disposing || (this.nativeRetirementComplete && !includeChildren)) return;
    this.disposing = true;
    const first = !this.disposed;
    this.disposed = true;
    const failures: unknown[] = [];
    try {
      if (first) {
        try { this.warmupLifetime.abort(new RenderDeviceError("Native drawing pipeline is disposed", "DISPOSED_RESOURCE")); }
        catch (error) { failures.push(error); }
      }
      if (includeChildren) {
        try { this.disposeOwnedPipelines(first); } catch (error) { failures.push(error); }
      }
      // Retry only destructors already proven safe by a fence, confirmed loss,
      // or a never-queued allocation. Preserve the original failure for the caller.
      const previous = [...this.destructionFailures.values()];
      if (previous.length) previous.push(...this.releasePending([...this.destructionFailures.keys()], true));
      failures.push(...previous);
      this.retire([]);
      for (const failure of this.destructionFailures.values()) if (!failures.includes(failure)) failures.push(failure);
    } finally {
      this.disposing = false;
      this.notifyNativeRetirement();
    }
    if (failures.length) throw new AggregateError(failures, "Native drawing resource disposal failed", { cause: failures[0] });
  }
  /** @internal Retry this owner alone; its children have their own receipts. */
  retryNativeRetirement(): void { this.retireNativeOwner(false); }
  dispose(): void { this.retireNativeOwner(true); }
}

export const NATIVE_SHARED_WGSL = `
struct Frame { viewProjection: mat4x4<f32>, direction: vec4<f32>, light: vec4<f32>, ambient: vec4<f32>, clear: vec4<f32>, inverseViewProjection: mat4x4<f32>, camera: vec4<f32>, viewport: vec4<f32> };
struct Material { base: vec4<f32>, emissive: vec4<f32> };
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> materials: array<Material>;
struct Out { @builtin(position) position: vec4<f32>, @location(0) normal: vec3<f32>, @location(1) @interpolate(flat) material: u32, @location(2) @interpolate(flat) triangle: u32 };
@vertex fn vertexMain(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) material: f32, @location(3) triangle: f32) -> Out {
  var out: Out; let clip = frame.viewProjection * vec4<f32>(position, 1.0);
  out.position = vec4<f32>(clip.xy, clip.z * 0.5 + clip.w * 0.5, clip.w);
  out.normal = normal; out.material = u32(material); out.triangle = u32(triangle); return out;
}
fn illuminate(base: vec3<f32>, emissive: vec4<f32>, normal: vec3<f32>, direction: vec3<f32>, light: vec3<f32>, ambient: vec3<f32>) -> vec3<f32> {
  if (emissive.w < 1.5) { return base + emissive.rgb; }
  let n = select(vec3<f32>(0.0, 0.0, 1.0), normal * inverseSqrt(dot(normal, normal)), dot(normal, normal) > 0.00000001);
  return base * (ambient + light * max(dot(n, direction), 0.0)) + emissive.rgb;
}
`;
export const NATIVE_VERTEX_LAYOUT = [{ arrayStride: VERTEX_BYTES, attributes: [
  { shaderLocation: 0, offset: 0, format: "float32x3" },
  { shaderLocation: 1, offset: 12, format: "float32x3" },
  { shaderLocation: 2, offset: 24, format: "float32" },
  { shaderLocation: 3, offset: 28, format: "float32" }
] }];
export const FULLSCREEN_VERTEX = `@vertex fn fullscreen(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> { var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0)); return vec4<f32>(p[i], 0.0, 1.0); }`;

const DEFER_PIPELINE_CREATION = Symbol("native-drawing-warmup");
type DeferredCreationOptions = NativeDrawingOptions & { readonly [DEFER_PIPELINE_CREATION]?: true };

/** Shared actual forward draw used for a requested fallback and meshlet submissions. */
export class NativeForwardPipeline extends NativeDrawingOwner {
  private pipeline!: NativeDrawingRenderPipeline;
  constructor(device: unknown, options: NativeDrawingOptions) {
    super(device, options);
    if ((options as DeferredCreationOptions)[DEFER_PIPELINE_CREATION]) return;
    this.pipeline = this.device.createRenderPipeline(this.pipelineDescriptor());
  }
  private pipelineDescriptor(): Record<string, unknown> {
    const module = this.device.createShaderModule({ code: `${NATIVE_SHARED_WGSL}\n@fragment fn fragmentMain(input: Out) -> @location(0) vec4<f32> { let material = materials[input.material]; return vec4<f32>(illuminate(material.base.rgb, material.emissive, input.normal, frame.direction.xyz, frame.light.xyz, frame.ambient.xyz), 1.0); }` });
    return { label: "aura-native-forward", layout: "auto", vertex: { module, entryPoint: "vertexMain", buffers: NATIVE_VERTEX_LAYOUT }, fragment: { module, entryPoint: "fragmentMain", targets: [{ format: this.outputFormat }] }, primitive: { topology: "triangle-list", cullMode: "back" }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less-equal" } };
  }
  /** Compile the same pipeline used by render, without allocating a frame. */
  static async createWarmed(device: unknown, options: NativeDrawingOptions, signal?: AbortSignal): Promise<NativeForwardPipeline> {
    const owner = new NativeForwardPipeline(device, { ...options, [DEFER_PIPELINE_CREATION]: true } as DeferredCreationOptions);
    try {
      owner.assertWarmupActive(signal);
      owner.pipeline = await owner.warmRenderPipeline(owner.pipelineDescriptor(), signal);
      return owner;
    } catch (error) {
      owner.dispose();
      throw error;
    }
  }
  render(frame: NativeDrawingFrame, ranges?: readonly { readonly firstVertex: number; readonly vertexCount: number }[]): { readonly draws: number; readonly triangles: number } {
    this.beginNativeFrame();
    try {
    const prepared = prepareNativeDrawing(frame.scene, this.device.limits);
    const draws = ranges ?? (prepared.triangleCount ? [{ firstVertex: 0, vertexCount: prepared.triangleCount * 3 }] : []);
    for (const range of draws) if (!Number.isInteger(range.firstVertex) || !Number.isInteger(range.vertexCount) || range.firstVertex < 0 || range.vertexCount < 0 || range.firstVertex % 3 || range.vertexCount % 3 || range.firstVertex + range.vertexCount > prepared.triangleCount * 3) fail("drawRange", "must address complete scene triangles");
    const buffers = this.createFrameBuffers(frame, prepared);
    let depth: NativeDrawingTexture | undefined;
    const submission = { attempted: false };
    try {
      depth = this.device.createTexture({ label: "aura-native-forward-depth", size: [frame.surface.width, frame.surface.height, 1], format: "depth32float", usage: RENDER_ATTACHMENT });
      const encoder = this.device.createCommandEncoder({ label: "aura-native-forward" });
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: frame.surface.view, clearValue: frame.clearColor ?? [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }], depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: { buffer: buffers.materials } }] }));
      pass.setVertexBuffer(0, buffers.vertices);
      for (const range of draws) if (range.vertexCount) pass.draw(range.vertexCount, 1, range.firstVertex);
      pass.end();
      this.submit(encoder, buffers, [depth], submission);
      return { draws: draws.filter(range => range.vertexCount > 0).length, triangles: draws.reduce((sum, range) => sum + range.vertexCount / 3, 0) };
    } catch (error) {
      if (submission.attempted) throw this.submissionFailure(error);
      throw this.cleanupFailedFrame(error, [...buffers.all, ...(depth ? [depth] : [])], buffers.written);
    }
    } finally { this.endNativeFrame(); }
  }
}

/** Opaque G-buffer rasterization followed by a fullscreen Lambert/unlit resolve. */
export class DeferredPipeline extends NativeDrawingOwner {
  private fallback?: NativeForwardPipeline;
  private readonly fallbackReason?: string;
  private geometryPipeline?: NativeDrawingRenderPipeline;
  private sharedDepthGeometryPipeline?: NativeDrawingRenderPipeline;
  private geometryModule?: unknown;
  private resolvePipeline?: NativeDrawingRenderPipeline;
  private physicalResolvePipeline?: NativeDrawingRenderPipeline;
  private probeResolvePipeline?: NativeDrawingRenderPipeline;
  private readonly sampleCount: 1 | 4;
  constructor(device: unknown, options: DeferredDrawingOptions) {
    super(device, options);
    if (options.sampleCount !== undefined && options.sampleCount !== 1 && options.sampleCount !== 4) fail("sampleCount", "must be 1 or 4");
    this.sampleCount = options.sampleCount ?? 1;
    const attachments = this.device.limits?.maxColorAttachments ?? 4;
    const bytes = this.device.limits?.maxColorAttachmentBytesPerSample ?? 32;
    if (attachments < 3 || bytes < 24) {
      this.fallbackReason = `deferred requires 3 color attachments and 24 bytes/sample (device: ${attachments}, ${bytes})`;
      if (!options.allowFallback || this.sampleCount !== 1) throw new RenderDeviceError(this.sampleCount !== 1 ? `${this.fallbackReason}; multisampled native forward fallback is unavailable` : this.fallbackReason, "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "maxColorAttachments" });
      if (!(options as DeferredCreationOptions)[DEFER_PIPELINE_CREATION]) this.fallback = new NativeForwardPipeline(device, options);
      return;
    }
    if ((options as DeferredCreationOptions)[DEFER_PIPELINE_CREATION]) return;
    this.geometryPipeline = this.device.createRenderPipeline(this.geometryDescriptor("depth32float"));
    this.resolvePipeline = this.device.createRenderPipeline(this.resolveDescriptor("basic"));
  }
  private geometryDescriptor(depthFormat: "depth32float" | "depth24plus-stencil8"): Record<string, unknown> {
    this.geometryModule ??= this.device.createShaderModule({ code: `${NATIVE_SHARED_WGSL}\nstruct GBuffer { @location(0) albedo: vec4<f32>, @location(1) normal: vec4<f32>, @location(2) emissive: vec4<f32> }; @fragment fn fragmentMain(input: Out) -> GBuffer { let m = materials[input.material]; let n = normalize(input.normal); let grad = max(abs(dpdx(n)), abs(dpdy(n))); let aa = max(grad.x, max(grad.y, grad.z)); var out: GBuffer; out.albedo = m.base; out.normal = vec4<f32>(input.normal, 1.0); out.emissive = m.emissive; if (m.emissive.w >= 3.0) { out.albedo.a = 1.0 + clamp(m.emissive.w - 3.0 + aa, 0.0525, 1.0); out.normal.a = m.base.a; out.emissive.a = 3.0; } return out; }` });
    const module = this.geometryModule;
    return { label: depthFormat === "depth32float" ? "aura-deferred-geometry" : "aura-deferred-shared-depth-geometry", layout: "auto", vertex: { module, entryPoint: "vertexMain", buffers: NATIVE_VERTEX_LAYOUT }, fragment: { module, entryPoint: "fragmentMain", targets: [{ format: "rgba16float" }, { format: "rgba16float" }, { format: "rgba16float" }] }, primitive: { topology: "triangle-list", cullMode: "back" }, depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "less-equal" }, multisample: { count: this.sampleCount } };
  }
  private resolveDescriptor(kind: "basic" | "physical" | "probe"): Record<string, unknown> {
    const resolveCode = `${NATIVE_SHARED_WGSL.replace('@group(0) @binding(1) var<storage, read> materials: array<Material>;', '')}\n@group(0) @binding(1) var albedo: texture_2d<f32>; @group(0) @binding(2) var normals: texture_2d<f32>; @group(0) @binding(3) var emissive: texture_2d<f32>; ${FULLSCREEN_VERTEX}\n@fragment fn resolveMain(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> { let xy = vec2<i32>(p.xy); let a = textureLoad(albedo, xy, 0); if (a.a == 0.0) { if (frame.viewport.z > 0.5) { discard; } return frame.clear; } return vec4<f32>(illuminate(a.rgb, textureLoad(emissive, xy, 0), textureLoad(normals, xy, 0).xyz, frame.direction.xyz, frame.light.xyz, frame.ambient.xyz), 1.0); }`;
    const code = kind === "basic" ? resolveCode : physicalResolveWgsl(kind === "probe");
    const label = kind === "basic" ? "aura-deferred-resolve" : kind === "probe" ? "aura-deferred-probe-resolve" : "aura-deferred-physical-resolve";
    const module = this.device.createShaderModule({ ...(kind === "basic" ? {} : { label }), code: this.sampleCount === 4 ? multisampledResolve(code) : code });
    return { label, layout: "auto", vertex: { module, entryPoint: "fullscreen" }, fragment: { module, entryPoint: "resolveMain", targets: [{ format: this.outputFormat }] }, primitive: { topology: "triangle-list" }, multisample: { count: this.sampleCount } };
  }
  /** Warm the exact draw-owned pipelines, including the root's shared-depth/probe variant. */
  static async createWarmed(device: unknown, options: DeferredDrawingOptions, warmup: { readonly signal?: AbortSignal; readonly sharedPhysical?: boolean } = {}): Promise<DeferredPipeline> {
    const owner = new DeferredPipeline(device, { ...options, [DEFER_PIPELINE_CREATION]: true } as DeferredDrawingOptions & DeferredCreationOptions);
    try {
      owner.assertWarmupActive(warmup.signal);
      if (owner.fallbackReason) {
        owner.fallback = await NativeForwardPipeline.createWarmed(device, options, warmup.signal);
      } else {
        owner.geometryPipeline = await owner.warmRenderPipeline(owner.geometryDescriptor("depth32float"), warmup.signal);
        owner.assertWarmupActive(warmup.signal);
        owner.resolvePipeline = await owner.warmRenderPipeline(owner.resolveDescriptor("basic"), warmup.signal);
        if (warmup.sharedPhysical) {
          owner.assertWarmupActive(warmup.signal);
          owner.sharedDepthGeometryPipeline = await owner.warmRenderPipeline(owner.geometryDescriptor("depth24plus-stencil8"), warmup.signal);
          owner.assertWarmupActive(warmup.signal);
          owner.probeResolvePipeline = await owner.warmRenderPipeline(owner.resolveDescriptor("probe"), warmup.signal);
        }
      }
      owner.assertWarmupActive(warmup.signal);
      return owner;
    } catch (error) {
      owner.dispose();
      throw error;
    }
  }
  render(frame: NativeDrawingFrame): NativeDrawingDiagnostics {
    return this.renderFrame(frame);
  }
  /** @internal Rasterize a meshlet owner's indirect draws into borrowed deferred attachments. */
  renderMeshlets(frame: NativeDrawingFrame, makeBatch: (prepared: PreparedNativeDrawing) => NativeDeferredMeshletBatch): NativeDrawingDiagnostics {
    if (!frame.deferredAttachments) {
      throw new RenderDeviceError("Deferred meshlets require device-owned shared attachments", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "deferredAttachments" });
    }
    return this.renderFrame(frame, makeBatch);
  }
  private renderFrame(frame: NativeDrawingFrame, makeMeshlets?: (prepared: PreparedNativeDrawing) => NativeDeferredMeshletBatch): NativeDrawingDiagnostics {
    this.beginNativeFrame();
    try {
    if (this.fallback) {
      if (frame.deferredAttachments) throw new RenderDeviceError("The native forward fallback cannot preserve shared deferred attachments", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "deferredAttachments" });
      if (frame.scene.materials.some(material => material.shading === "physical")) throw new RenderDeviceError("The native forward fallback cannot render physical materials", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "physical" });
      const result = this.fallback.render(frame); return { requested: "deferred", active: "forward", fallbackReason: this.fallbackReason, drawCalls: result.draws, triangles: result.triangles };
    }
    const shared = frame.deferredAttachments;
    if (shared) validateDeferredAttachments(shared, frame.surface, this.outputFormat, this.sampleCount);
    if (shared?.depthFormat === "depth24plus-stencil8" && !this.sharedDepthGeometryPipeline) {
      this.sharedDepthGeometryPipeline = this.device.createRenderPipeline(this.geometryDescriptor("depth24plus-stencil8"));
    }
    const prepared = prepareNativeDrawing(frame.scene, this.device.limits, true);
    const meshlets = makeMeshlets?.(prepared);
    if (meshlets) validateDeferredMeshlets(meshlets, prepared.triangleCount, this.device.limits);
    if (frame.physical?.indirectFraction && (this.outputFormat !== "rgba16float" || frame.scene.materials.some(material => material.shading !== "physical"))) fail("physical.indirectFraction", "requires an HDR target and exclusively physical materials");
    const probeInput = prepared.usesPhysical ? frame.physical?.probe : undefined;
    if (probeInput && !shared) throw new RenderDeviceError("A deferred environment probe requires a device-owned submission lease", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "physical.probe" });
    const probe = probeInput ? packDeferredProbe(probeInput, this.device) : undefined;
    if (prepared.usesPhysical) {
      const limits = this.device.limits;
      const probeExceedsLimits = probe && ((limits?.maxSamplersPerShaderStage ?? 16) < 1
        || (limits?.maxUniformBuffersPerShaderStage ?? 12) < 2
        || (limits?.maxUniformBufferBindingSize ?? 65_536) < probe.uniforms.byteLength
        || (limits?.maxBufferSize ?? 268_435_456) < probe.uniforms.byteLength);
      if ((limits?.maxSampledTexturesPerShaderStage ?? 16) < (probe ? 5 : 4)
        || (limits?.maxBindingsPerBindGroup ?? 1000) < (probe ? 9 : 6) || probeExceedsLimits) {
        throw new RenderDeviceError("Physical deferred drawing exceeds sampled texture, uniform or binding limits", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "physical" });
      }
      if (probe ? !this.probeResolvePipeline : !this.physicalResolvePipeline) {
        const pipeline = this.device.createRenderPipeline(this.resolveDescriptor(probe ? "probe" : "physical"));
        if (probe) this.probeResolvePipeline = pipeline; else this.physicalResolvePipeline = pipeline;
      }
    }
    const buffers = this.createFrameBuffers(frame, prepared);
    const textures: NativeDrawingTexture[] = [];
    const extraBuffers: NativeDrawingBuffer[] = [];
    const written: NativeDrawingBuffer[] = [...buffers.written];
    const submission = { attempted: false };
    try {
      let meshletBounds: NativeDrawingBuffer | undefined;
      let meshletIndirect: NativeDrawingBuffer | undefined;
      if (meshlets?.count) {
        meshletBounds = this.device.createBuffer({ label: "aura-meshlet-bounds", size: meshlets.bounds.byteLength, usage: BUFFER_STORAGE | BUFFER_COPY_DST });
        extraBuffers.push(meshletBounds);
        written.push(meshletBounds);
        this.device.queue.writeBuffer(meshletBounds, 0, meshlets.bounds);
        meshletIndirect = this.device.createBuffer({ label: "aura-meshlet-indirect", size: meshlets.count * 16, usage: BUFFER_STORAGE | 0x100 });
        extraBuffers.push(meshletIndirect);
      }
      let probeBuffer: NativeDrawingBuffer | undefined;
      if (probe) {
        probeBuffer = this.device.createBuffer({ label: "aura-deferred-probe", size: probe.uniforms.byteLength, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
        extraBuffers.push(probeBuffer);
        written.push(probeBuffer);
        this.device.queue.writeBuffer(probeBuffer, 0, probe.uniforms);
      }
      const make = (format: string, usage: number) => { const texture = this.device.createTexture({ size: [frame.surface.width, frame.surface.height, 1], format, usage, sampleCount: this.sampleCount }); textures.push(texture); return texture.createView(); };
      const albedo = make("rgba16float", RENDER_ATTACHMENT | TEXTURE_BINDING);
      const normal = make("rgba16float", RENDER_ATTACHMENT | TEXTURE_BINDING);
      const emissive = make("rgba16float", RENDER_ATTACHMENT | TEXTURE_BINDING);
      const depth = shared?.depthAttachmentView ?? make("depth32float", RENDER_ATTACHMENT | (prepared.usesPhysical ? TEXTURE_BINDING : 0));
      const sampledDepth = shared?.depthSampleView ?? depth;
      const multisampleOutput = shared?.colorView ?? (this.sampleCount === 4 ? make(this.outputFormat, RENDER_ATTACHMENT) : undefined);
      const encoder = this.device.createCommandEncoder({ label: "aura-deferred" });
      if (meshlets?.count) {
        if (!encoder.beginComputePass) throw new RenderDeviceError("meshlet drawing requires compute passes", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "compute" });
        const compute = encoder.beginComputePass({ label: "aura-meshlet-culling" });
        compute.setPipeline(meshlets.computePipeline);
        compute.setBindGroup(0, this.device.createBindGroup({ layout: meshlets.computePipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: { buffer: meshletBounds! } }, { binding: 2, resource: { buffer: meshletIndirect! } }
        ] }));
        compute.dispatchWorkgroups(meshlets.workgroups);
        compute.end();
      }
      const geometry = encoder.beginRenderPass({ colorAttachments: [albedo, normal, emissive].map(view => ({ view, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" })), depthStencilAttachment: { view: depth, depthClearValue: shared?.depthClearValue ?? 1, depthLoadOp: shared?.loadOp ?? "clear", depthStoreOp: "store", ...(shared?.depthFormat === "depth24plus-stencil8" ? { stencilClearValue: shared.stencilClearValue, stencilLoadOp: shared.loadOp, stencilStoreOp: "store" } : {}) } });
      const geometryPipeline = shared?.depthFormat === "depth24plus-stencil8" ? this.sharedDepthGeometryPipeline! : this.geometryPipeline!;
      geometry.setPipeline(geometryPipeline);
      geometry.setBindGroup(0, this.device.createBindGroup({ layout: geometryPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: { buffer: buffers.materials } }] }));
      geometry.setVertexBuffer(0, buffers.vertices);
      if (meshlets?.count) {
        if (!geometry.drawIndirect) throw new RenderDeviceError("meshlet drawing requires drawIndirect", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE", { field: "drawIndirect" });
        for (let index = 0; index < meshlets.count; index++) geometry.drawIndirect(meshletIndirect!, index * 16);
      } else if (!meshlets && prepared.triangleCount) geometry.draw(prepared.triangleCount * 3);
      geometry.end();
      const resolveTarget = shared?.resolveView ?? (this.sampleCount === 4 ? frame.surface.view : undefined);
      const resolve = encoder.beginRenderPass({ colorAttachments: [{ view: multisampleOutput ?? frame.surface.view, ...(resolveTarget ? { resolveTarget } : {}), loadOp: shared?.loadOp ?? "clear", clearValue: shared?.clearColor ?? frame.clearColor ?? [0, 0, 0, 1], storeOp: shared || !multisampleOutput ? "store" : "discard" }] });
      const resolvePipeline = probe ? this.probeResolvePipeline! : prepared.usesPhysical ? this.physicalResolvePipeline! : this.resolvePipeline!;
      resolve.setPipeline(resolvePipeline);
      resolve.setBindGroup(0, this.device.createBindGroup({ layout: resolvePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buffers.uniforms } }, { binding: 1, resource: albedo }, { binding: 2, resource: normal }, { binding: 3, resource: emissive }, ...(prepared.usesPhysical ? [{ binding: 4, resource: sampledDepth }, { binding: 5, resource: { buffer: buffers.dfg! } }] : []), ...(probe ? [{ binding: 6, resource: { buffer: probeBuffer! } }, { binding: 7, resource: probe.lease.sampler }, { binding: 8, resource: probe.lease.view }] : [])] }));
      resolve.draw(3); resolve.end();
      this.submit(encoder, buffers, [...textures, ...extraBuffers], submission, shared ? commands => shared.submit(commands, probe ? [probe.lease.resource] : undefined) : undefined);
      return meshlets
        ? { requested: "meshlet", active: "meshlet", drawCalls: meshlets.count + 1, triangles: prepared.triangleCount,
            trianglesAreUpperBound: true, computeDispatches: meshlets.count ? 1 : 0, submittedMeshlets: meshlets.count }
        : { requested: "deferred", active: "deferred", drawCalls: (prepared.triangleCount ? 1 : 0) + 1, triangles: prepared.triangleCount };
    } catch (error) {
      if (submission.attempted) throw this.submissionFailure(error);
      throw this.cleanupFailedFrame(error, [...buffers.all, ...textures, ...extraBuffers], written);
    }
    } finally { this.endNativeFrame(); }
  }
  override visitNativeRetirementOwners(visit: (owner: NativeDrawingOwner) => void): void {
    super.visitNativeRetirementOwners(visit);
    this.fallback?.visitNativeRetirementOwners(visit);
  }
  protected override disposeOwnedPipelines(first: boolean): void {
    const child = this.fallback;
    if (child && !child.nativeRetirementComplete && (first || child.retirementDestructionErrors.length || child.nativeRetirementFenceFailure)) child.dispose();
  }
  override dispose(): void { super.dispose(); }
}

/** Check the internal plan before allocating or recording any GPU work. */
function validateDeferredMeshlets(batch: NativeDeferredMeshletBatch, triangles: number, limits: NativeDrawingDevice["limits"]): void {
  const { bounds, count, workgroups, computePipeline } = batch;
  if (!(bounds instanceof Uint8Array) || bounds.byteOffset % 4 !== 0 || !Number.isInteger(count) || count < 0 || count > 65536 ||
      bounds.byteLength !== count * 32 || workgroups !== Math.ceil(count / 64) ||
      workgroups > (limits?.maxComputeWorkgroupsPerDimension ?? 65535) ||
      bounds.byteLength > (limits?.maxStorageBufferBindingSize ?? 134_217_728) ||
      count * 16 > (limits?.maxStorageBufferBindingSize ?? 134_217_728) ||
      bounds.byteLength > (limits?.maxBufferSize ?? 268_435_456) || count * 16 > (limits?.maxBufferSize ?? 268_435_456) ||
      !computePipeline || typeof computePipeline.getBindGroupLayout !== "function") {
    fail("meshlets", "must contain a bounded compute plan");
  }
  const floats = new Float32Array(bounds.buffer, bounds.byteOffset, count * 8);
  const words = new Uint32Array(bounds.buffer, bounds.byteOffset, count * 8);
  let firstVertex = 0;
  for (let index = 0; index < count; index++) {
    const offset = index * 8;
    const vertexCount = words[offset + 4]!;
    if (!Array.from(floats.subarray(offset, offset + 4)).every(Number.isFinite) || floats[offset + 3]! < 0 ||
        !vertexCount || vertexCount % 3 !== 0 || words[offset + 5] !== firstVertex ||
        words[offset + 6]! > 1 || words[offset + 7] !== 0) {
      fail("meshlets", "must contain finite bounds and contiguous complete triangles");
    }
    firstVertex += vertexCount;
  }
  if (firstVertex !== triangles * 3) fail("meshlets", "must cover every triangle exactly once");
}

/** Resolve each covered sample before the hardware averages the color target. */
function multisampledResolve(source: string): string {
  return source
    .replaceAll("texture_2d<f32>", "texture_multisampled_2d<f32>")
    .replaceAll("texture_depth_2d", "texture_depth_multisampled_2d")
    .replace("@fragment fn resolveMain(@builtin(position) p: vec4<f32>)", "@fragment fn resolveMain(@builtin(position) p: vec4<f32>, @builtin(sample_index) sampleIndex: u32)")
    .replace(/textureLoad\((albedo|normals|emissive|sceneDepth), xy, 0\)/g, "textureLoad($1, xy, i32(sampleIndex))");
}

function physicalResolveWgsl(withProbe: boolean): string { return `${NATIVE_SHARED_WGSL.replace('@group(0) @binding(1) var<storage, read> materials: array<Material>;', '')}
${PHYSICAL_LIGHTING_WGSL}
@group(0) @binding(1) var albedo: texture_2d<f32>;
@group(0) @binding(2) var normals: texture_2d<f32>;
@group(0) @binding(3) var emissive: texture_2d<f32>;
@group(0) @binding(4) var sceneDepth: texture_depth_2d;
@group(0) @binding(5) var<storage, read> dfg: array<vec2<f32>>;
${withProbe ? deferredProbeWgsl({ group: 0, uniformBinding: 6, samplerBinding: 7, textureBinding: 8 }) : ""}
${FULLSCREEN_VERTEX}
fn sampleDfg(roughness: f32, ndotv: f32) -> vec2<f32> {
  let p = clamp(vec2<f32>(roughness, ndotv) * ${DFG_LUT_SIZE}.0 - vec2<f32>(0.5), vec2<f32>(0.0), vec2<f32>(${DFG_LUT_SIZE - 1}.0));
  let lo = vec2<u32>(floor(p)); let hi = min(lo + vec2<u32>(1u), vec2<u32>(${DFG_LUT_SIZE - 1}u)); let f = fract(p);
  let a = mix(dfg[lo.y * ${DFG_LUT_SIZE}u + lo.x], dfg[lo.y * ${DFG_LUT_SIZE}u + hi.x], f.x);
  let b = mix(dfg[hi.y * ${DFG_LUT_SIZE}u + lo.x], dfg[hi.y * ${DFG_LUT_SIZE}u + hi.x], f.x);
  return mix(a, b, f.y);
}
@fragment fn resolveMain(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
  let xy = vec2<i32>(p.xy); let a = textureLoad(albedo, xy, 0);
  if (a.a == 0.0) { if (frame.viewport.z > 0.5) { discard; } return frame.clear; }
  let ndata = textureLoad(normals, xy, 0); let e = textureLoad(emissive, xy, 0);
  if (e.a < 2.5) { return vec4<f32>(illuminate(a.rgb, e, ndata.xyz, frame.direction.xyz, frame.light.xyz, frame.ambient.xyz), 1.0); }
  let n = normalize(ndata.xyz); let l = frame.direction.xyz;
  let roughness = clamp(a.a - 1.0, 0.0525, 1.0); let metallic = clamp(ndata.a, 0.0, 1.0);
  var material: AuraPhysicalMaterial;
  material.baseColor = a.rgb; material.metalness = metallic; material.roughness = roughness;
  material.ior = 1.5; material.specularIntensity = 1.0; material.specularColorFactor = vec3<f32>(1.0);
  material.diffuseRoughness = 0.0; material.retroreflection = 0.0;
  let ndc = vec3<f32>(p.x / frame.viewport.x * 2.0 - 1.0, 1.0 - p.y / frame.viewport.y * 2.0, textureLoad(sceneDepth, xy, 0) * 2.0 - 1.0);
  let world4 = frame.inverseViewProjection * vec4<f32>(ndc, 1.0); let world = world4.xyz / world4.w;
  let view = normalize(frame.camera.xyz - world);
  var directColor = vec3<f32>(0.0);
  if (any(frame.light.xyz > vec3<f32>(0.0))) {
    let direct = a3dPhysicalDirect(n, view, l, frame.light.xyz, material, sampleDfg(roughness, clamp(dot(n, view), 0.0, 1.0)), sampleDfg(roughness, clamp(dot(n, l), 0.0, 1.0)));
    directColor = direct.diffuse + direct.specular;
  }
  ${withProbe ? "let indirect = a3dDeferredProbeIndirect(n, view, material, sampleDfg(roughness, clamp(dot(n, view), 0.0, 1.0))); let ambient = indirect.diffuse + indirect.specular;" : "let ambient = frame.ambient.xyz * clamp(a.rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * (1.0 - metallic) / A3D_PHYSICAL_PI;"}
  let color = max(directColor + ambient + e.rgb, vec3<f32>(0.0));
  var alpha = 1.0;
  if (frame.viewport.w > 0.5) {
    let luma = vec3<f32>(0.2126, 0.7152, 0.0722);
    alpha = 2.0 + clamp(dot(ambient, luma) / max(dot(color, luma), 0.0001), 0.0, 1.0);
  }
  return vec4<f32>(color, alpha);
}`; }

function fail(field: string, message: string): never { throw new RenderDeviceError(`Native drawing ${field} ${message}`, "NATIVE_DRAW_INVALID_INPUT", { field }); }
function validateDeferredAttachments(shared: NativeDeferredAttachments, surface: NativeDrawingSurface, format: string, sampleCount: 1 | 4): void {
  const outputView = sampleCount === 4 ? shared.resolveView : shared.colorView;
  if (!shared.colorView || !shared.depthAttachmentView || !shared.depthSampleView || !outputView
    || outputView !== surface.view || shared.width !== surface.width || shared.height !== surface.height
    || shared.colorFormat !== format || shared.sampleCount !== sampleCount
    || (sampleCount === 1 && shared.resolveView !== undefined)
    || (shared.loadOp !== "load" && shared.loadOp !== "clear") || typeof shared.submit !== "function"
    || (shared.depthFormat !== "depth32float" && shared.depthFormat !== "depth24plus-stencil8")
    || !shared.clearColor || shared.clearColor.length !== 4 || !shared.clearColor.every(Number.isFinite)
    || shared.depthClearValue !== 1 || !Number.isInteger(shared.stencilClearValue)
    || shared.stencilClearValue < 0 || shared.stencilClearValue > 0xffffffff) {
    fail("deferredAttachments", "must match the output format, dimensions, sample count and standard depth attachment contract");
  }
}
let cachedDfg: Float32Array | undefined;
/** Decode the engine-owned binary16 DFG data exactly before GPU upload. */
function dfgCoefficients(): Float32Array {
  if (cachedDfg) return cachedDfg;
  cachedDfg = Float32Array.from(DFG_LUT_RG16F, bits => {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >>> 10) & 31, fraction = bits & 1023;
    if (exponent === 0) return sign * fraction * 2 ** -24;
    if (exponent === 31) return fraction === 0 ? sign * Infinity : NaN;
    return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
  });
  return cachedDfg;
}
/** Invert the OpenGL-depth view-projection for depth-based world reconstruction. */
function invertViewProjection(matrix: ArrayLike<number>): number[] {
  const rows = Array.from({ length: 4 }, (_, row) => [
    ...Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row]!),
    ...Array.from({ length: 4 }, (_, column) => row === column ? 1 : 0)
  ]);
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
    const divisor = rows[pivot]![column]!;
    if (!Number.isFinite(divisor) || divisor === 0) fail("viewProjection", "must be invertible for physical deferred drawing");
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    for (let index = 0; index < 8; index++) rows[column]![index]! /= divisor;
    for (let row = 0; row < 4; row++) if (row !== column) {
      const factor = rows[row]![column]!;
      for (let index = 0; index < 8; index++) rows[row]![index]! -= factor * rows[column]![index]!;
    }
  }
  const inverse = Array.from({ length: 16 }, (_, index) => rows[index % 4]![4 + Math.floor(index / 4)]!);
  if (!inverse.every(value => Number.isFinite(Math.fround(value)))) fail("viewProjection", "inverse must be finite in float32");
  return inverse;
}
function faceNormal(a: readonly number[], b: readonly number[], c: readonly number[]): [number, number, number] { const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!; const vx = c[0]! - a[0]!, vy = c[1]! - a[1]!, vz = c[2]! - a[2]!; const n: [number, number, number] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const len = Math.hypot(...n); return len ? [n[0] / len, n[1] / len, n[2] / len] : [0, 0, 1]; }
function multiplyMatrices(a: ArrayLike<number>, b: ArrayLike<number>): number[] { if (a.length !== 16 || b.length !== 16 || !Array.from(a).every(Number.isFinite) || !Array.from(b).every(Number.isFinite)) fail("modelMatrix", "must be finite mat4"); const out = Array<number>(16).fill(0); for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out[col * 4 + row]! += a[k * 4 + row]! * b[col * 4 + k]!; if (out[3] !== 0 || out[7] !== 0 || out[11] !== 0 || out[15] !== 1) fail("modelMatrix", "must be affine"); return out; }
function transformPoint(m: readonly number[], p: readonly number[]): [number, number, number] { return [m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!, m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!, m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!]; }
function normalTransform(m: readonly number[], field: string): (n: readonly number[]) => [number, number, number] { const a = [m[0]!, m[1]!, m[2]!], b = [m[4]!, m[5]!, m[6]!], c = [m[8]!, m[9]!, m[10]!]; const cross = (x: number[], y: number[]) => [x[1]! * y[2]! - x[2]! * y[1]!, x[2]! * y[0]! - x[0]! * y[2]!, x[0]! * y[1]! - x[1]! * y[0]!]; const u = cross(b, c), v = cross(c, a), w = cross(a, b); const det = a[0]! * u[0]! + a[1]! * u[1]! + a[2]! * u[2]!; if (!Number.isFinite(det) || Math.abs(det) < 1e-12) fail(`${field}.modelMatrix`, "has a singular normal transform"); return n => { const out: [number, number, number] = [(u[0]! * n[0]! + v[0]! * n[1]! + w[0]! * n[2]!) / det, (u[1]! * n[0]! + v[1]! * n[1]! + w[1]! * n[2]!) / det, (u[2]! * n[0]! + v[2]! * n[1]! + w[2]! * n[2]!) / det]; const len = Math.hypot(...out); return len ? [out[0] / len, out[1] / len, out[2] / len] : [0, 0, 1]; }; }
