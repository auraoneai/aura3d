import { Geometry } from "./Geometry";
import { type CollectedLight } from "./LightCollector";
import { LightUniforms } from "./LightUniforms";
import { Material } from "./Material";
import { MaterialBinding } from "./MaterialBinding";
import { MaterialInstance } from "./MaterialInstance";
import { applyMorphTargets, type MorphTargetDelta } from "./MorphTarget";
import { type DrawCommand, type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { RenderPipeline } from "./RenderPipeline";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { ShaderModule } from "./ShaderModule";
import { createDefaultShaderLibrary, type ShaderLibrary } from "./ShaderLibrary";
import { type TextureBinding } from "./TextureBinding";
import { UnlitMaterial } from "./UnlitMaterial";

export interface RenderItem {
  readonly geometry: Geometry;
  readonly material?: RenderMaterial;
  readonly label?: string;
  readonly modelMatrix?: Float32Array | readonly number[];
  readonly normalMatrix?: Float32Array | readonly number[];
  readonly modelViewProjectionMatrix?: Float32Array | readonly number[];
  readonly skinning?: SkinningPaletteBinding;
  readonly morphTargets?: readonly MorphTargetDelta[];
  readonly morphWeights?: readonly number[];
  readonly instanceTransforms?: Float32Array | readonly number[];
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
  readonly shaderLibrary?: ShaderLibrary;
}

export interface EnvironmentLightingOptions {
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly proceduralMap?: ProceduralEnvironmentMapLightingOptions;
  readonly environmentMapTexture?: TextureBinding;
  readonly environmentMapIntensity?: number;
  readonly environmentMapSpecularIntensity?: number;
  readonly environmentMapRotation?: number;
  readonly environmentMapMipCount?: number;
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

export class ForwardPass extends BaseRenderPass {
  private readonly materialBinding = new MaterialBinding();
  private readonly shaderLibrary: ShaderLibrary;
  private readonly shaderCache = new Map<string, ShaderModule>();

  constructor(private readonly options: ForwardPassOptions) {
    super("forward", [], ["color"]);
    this.shaderLibrary = options.shaderLibrary ?? createDefaultShaderLibrary();
  }

  execute(context: RenderPassContext): void {
    for (const item of this.options.items) {
      this.drawItem(context.device, item);
    }
  }

  private drawItem(device: RenderDevice, item: RenderItem): void {
    const material = item.material ?? new UnlitMaterial();
    const baseMaterial = getBaseMaterial(material);
    this.applyLightUniforms(material);
    const shader = this.getShader(baseMaterial, device);
    const binding = this.materialBinding.bind(material, shader);
    const uniforms = new Map<string, UniformValue>(binding.uniforms);
    applyEnvironmentLightingUniforms(this.options.environmentLighting, item, shader, uniforms);
    applyTransformUniforms(item, shader, uniforms);
    if (item.skinning) {
      applySkinningUniforms(item.skinning, baseMaterial, shader, uniforms);
    }
    const instanceCount = item.instanceTransforms ? applyInstanceUniforms(item, shader, uniforms) : 1;
    const gpuMorph = item.morphTargets || item.morphWeights ? applyGpuMorphUniforms(item, shader, uniforms) : false;
    const geometry = gpuMorph ? item.geometry : resolveRenderGeometry(item);
    try {
      const vertexBuffer = geometry.vertexBuffer.upload(device);
      const indexBuffer = geometry.indexBuffer?.upload(device);
      const pipeline = new RenderPipeline({
        label: item.label ?? baseMaterial.name,
        shader,
        vertexFormat: geometry.vertexBuffer.format,
        topology: geometry.topology,
        renderState: baseMaterial.renderState,
        requiredAttributes: baseMaterial.requiredAttributes
      });
      const command: DrawCommand = pipeline.createDrawCommand({
        label: item.label,
        vertexBuffer,
        vertexCount: geometry.vertexBuffer.vertexCount,
        uniforms,
        ...(instanceCount > 1 ? { instanceCount } : {})
      });
      if (indexBuffer !== undefined) {
        Object.assign(command, {
          indexBuffer,
          indexType: geometry.indexBuffer?.type,
          indexCount: geometry.indexBuffer?.count
        });
      }
      device.draw(command);
    } finally {
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
    let module = this.shaderCache.get(material.shaderKey);
    if (!module) {
      module = ShaderModule.fromLibrary(this.shaderLibrary, material.shaderKey);
      this.shaderCache.set(material.shaderKey, module);
    }
    return module.compile(device);
  }
}

function applyEnvironmentLightingUniforms(
  environment: EnvironmentLightingOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!environment) {
    return;
  }
  if (!shader.reflection.uniforms.has("u_environmentColor") || !shader.reflection.uniforms.has("u_environmentIntensity")) {
    return;
  }
  const color = Array.from(environment.color);
  if (color.length !== 3 || color.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
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

function applySampledEnvironmentMapUniforms(
  environment: EnvironmentLightingOptions,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!environment.environmentMapTexture) {
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
  const intensity = environment.environmentMapIntensity ?? 1;
  const specularIntensity = environment.environmentMapSpecularIntensity ?? 0.5;
  const rotation = environment.environmentMapRotation ?? 0;
  const mipCount = environment.environmentMapMipCount ?? 1;
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
  uniforms.set("u_environmentMapTexture", environment.environmentMapTexture);
  uniforms.set("u_environmentMapTextureEnabled", 1);
  uniforms.set("u_environmentMapTextureIntensity", intensity);
  uniforms.set("u_environmentMapTextureSpecularIntensity", specularIntensity);
  uniforms.set("u_environmentMapTextureRotation", rotation);
  uniforms.set("u_environmentMapTextureMipCount", mipCount);
  applyEnvironmentBrdfLutUniforms(environment, item, shader, uniforms);
}

function applyEnvironmentBrdfLutUniforms(
  environment: EnvironmentLightingOptions,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (!environment.environmentBrdfLutTexture) {
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

function toEnvironmentColor(value: readonly number[], field: string, label?: string): readonly number[] {
  const color = Array.from(value);
  if (color.length !== 3 || color.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RenderDeviceError("Procedural environment map colors must contain three finite values in [0, 1]", "ENVIRONMENT_LIGHTING_CONTRACT", {
      label,
      field,
      color
    });
  }
  return color;
}

function applyTransformUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  if (item.modelViewProjectionMatrix && shader.reflection.uniforms.has("u_modelViewProjection")) {
    uniforms.set("u_modelViewProjection", toMat4Uniform(item.modelViewProjectionMatrix, "modelViewProjectionMatrix", item.label));
  }
  if (shader.reflection.uniforms.has("u_modelMatrix")) {
    uniforms.set("u_modelMatrix", toMat4Uniform(item.modelMatrix ?? identityMatrix(), "modelMatrix", item.label));
  }
  if (item.normalMatrix && shader.reflection.uniforms.has("u_normalMatrix")) {
    uniforms.set("u_normalMatrix", toMat4Uniform(item.normalMatrix, "normalMatrix", item.label));
  }
}

function toMat4Uniform(value: Float32Array | readonly number[], field: string, label?: string): Float32Array {
  const values = Array.from(value);
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new RenderDeviceError("Render item transform uniforms must be finite mat4 values", "RENDER_ITEM_TRANSFORM_CONTRACT", {
      label,
      field,
      scalars: values.length
    });
  }
  return new Float32Array(values);
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
  const source = Array.from(item.instanceTransforms ?? []);
  if (source.length === 0 || source.length % 16 !== 0) {
    throw new RenderDeviceError("Instance transforms must contain one or more mat4 values", "INSTANCING_CONTRACT", {
      label: item.label,
      scalars: source.length
    });
  }
  const instanceCount = source.length / 16;
  if (instanceCount > MAX_GPU_INSTANCES) {
    throw new RenderDeviceError("Instanced shader path exceeds the supported uniform instance count", "GPU_INSTANCE_LIMIT", {
      label: item.label,
      instanceCount,
      maxInstances: MAX_GPU_INSTANCES
    });
  }
  if (!source.every(Number.isFinite)) {
    throw new RenderDeviceError("Instance transforms must contain finite mat4 values", "INSTANCING_CONTRACT", {
      label: item.label
    });
  }
  const packed = new Float32Array(MAX_GPU_INSTANCES * 16);
  packed.set(source);
  uniforms.set("u_instanceMatrices", packed);
  uniforms.set("u_instanceCount", instanceCount);
  return instanceCount;
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
  if (item.morphTargets.length > MAX_GPU_MORPH_TARGETS) {
    throw new RenderDeviceError("GPU morph shader path exceeds the supported uniform morph target count", "GPU_MORPH_TARGET_LIMIT", {
      label: item.label,
      targetCount: item.morphTargets.length,
      maxTargets: MAX_GPU_MORPH_TARGETS
    });
  }
  if (item.geometry.vertexBuffer.vertexCount > MAX_GPU_MORPH_VERTICES) {
    throw new RenderDeviceError("GPU morph shader path exceeds the supported uniform morph vertex count", "GPU_MORPH_VERTEX_LIMIT", {
      label: item.label,
      vertexCount: item.geometry.vertexBuffer.vertexCount,
      maxVertices: MAX_GPU_MORPH_VERTICES
    });
  }
  const packed = new Float32Array(MAX_GPU_MORPH_TARGETS * MAX_GPU_MORPH_VERTICES * 4);
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
    }
  }
  uniforms.set("u_morphPositionDeltas", packed);
  uniforms.set("u_morphWeights", weights);
  uniforms.set("u_morphTargetCount", item.morphTargets.length);
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
  if (!Number.isInteger(skinning.jointCount) || skinning.jointCount <= 0 || skinning.jointCount > 64) {
    throw new RenderDeviceError("Skinning jointCount must be an integer in [1, 64]", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount
    });
  }
  if (skinning.matrices.length !== skinning.jointCount * 16) {
    throw new RenderDeviceError("Skinning matrix palette length must equal jointCount * 16", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount,
      matrixScalars: skinning.matrices.length
    });
  }
  if (!Array.from(skinning.matrices).every(Number.isFinite)) {
    throw new RenderDeviceError("Skinning matrix palette must contain finite values", "INVALID_SKINNING_PALETTE", {
      jointCount: skinning.jointCount
    });
  }
  uniforms.set("u_jointCount", skinning.jointCount);
  uniforms.set("u_jointMatrices", skinning.matrices);
}
