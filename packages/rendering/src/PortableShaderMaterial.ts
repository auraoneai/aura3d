import { Material, type MaterialUniformDescriptor, type MaterialUniformKind, type RenderState } from "./Material";
import { cloneMaterialUniformValue } from "./MaterialInstance";
import type { NativeShaderStages, NativeStorageBinding, PortableShaderBinding, RecursiveUniformValue, RenderDevice, RenderShaderProgram, UniformDataValue, UniformValue } from "./RenderDevice";
import { ShaderLibrary, type ShaderSourcePair } from "./ShaderLibraryCore";
import { ShaderModule } from "./ShaderModule";
import { reflectShaderSources } from "./ShaderReflection";
import { isTextureBinding, TextureBinding } from "./TextureBinding";
import { deriveShaderDataLayout, type ShaderDataType } from "./webgpu/ShaderDataLayout";

const WGSL_BINDINGS_MARKER = "/* @aura3d-bindings */";
// Only the graph adapter can issue this bounded contract. A public
// `graphMaterial: true` option alone cannot establish clipping semantics.
type GraphClippingVerifier = {
  readonly verify: (shaderKey?: string, pass?: "forward" | "depth") => boolean;
  readonly prototypes: readonly { readonly value: object; readonly parent: object | null; readonly descriptors: PropertyDescriptorMap }[];
};
const graphClippingVerifiers = new WeakMap<object, GraphClippingVerifier>();

function graphClippingPrototypesUnchanged(record: GraphClippingVerifier): boolean {
  return record.prototypes.every(({ value, parent, descriptors }) => {
    if (Object.getPrototypeOf(value) !== parent || Reflect.ownKeys(value).length !== Reflect.ownKeys(descriptors).length) return false;
    return Reflect.ownKeys(descriptors).every((key) => {
      const before = Reflect.get(descriptors, key) as PropertyDescriptor;
      const after = Object.getOwnPropertyDescriptor(value, key);
      return after !== undefined && after.value === before.value && after.get === before.get && after.set === before.set
        && after.writable === before.writable && after.enumerable === before.enumerable && after.configurable === before.configurable;
    });
  });
}
const BUILTIN_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_modelViewProjection", kind: "mat4", required: true },
  { name: "u_modelMatrix", kind: "mat4", required: false },
  { name: "u_normalMatrix", kind: "mat4", required: false }
];
// Frame values are populated by ForwardPass when their GLSL declarations are
// reflected. Only inject the fields actually used by WGSL so existing portable
// materials may still declare and control a uniform such as u_time themselves.
const FRAME_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_geometryMatrix", kind: "mat4", required: false },
  { name: "u_viewMatrix", kind: "mat4", required: false },
  { name: "u_a3dSunDirection", kind: "vec3", required: false },
  // `a3d_scene` sun radiance: bound by the forward pass when the GLSL twin declares it; WGSL twins read `aura.u_a3dSun*`.
  { name: "u_a3dSunColor", kind: "vec3", required: false },
  { name: "u_a3dSunIntensity", kind: "float", required: false },
  { name: "u_projectionMatrix", kind: "mat4", required: false },
  { name: "u_cameraPosition", kind: "vec3", required: false },
  { name: "u_time", kind: "float", required: false },
  { name: "u_resolution", kind: "vec2", required: false },
  { name: "u_a3dClipRange", kind: "float", required: false },
  { name: "u_a3dClipModel", kind: "mat4", required: false },
  { name: "u_a3dClipPlanes", kind: "vec4", arrayLength: 8, required: false },
  { name: "u_a3dClipGroups", kind: "vec4", arrayLength: 2, required: false },
  { name: "u_a3dClipGroupCount", kind: "float", required: false },
  { name: "u_a3dLogDepthView", kind: "mat4", required: false },
  { name: "u_a3dLogDepthRange", kind: "vec2", required: false },
  { name: "u_a3dLogDepthEnabled", kind: "float", required: false },
  { name: "u_jointMatrices", kind: "mat4", arrayLength: 96, required: false },
  { name: "u_jointCount", kind: "float", required: false },
  { name: "u_jointPaletteMode", kind: "float", required: false },
  { name: "u_jointPaletteTextureSize", kind: "vec2", required: false },
  { name: "u_lightCount", kind: "float", required: false },
  { name: "u_lightData", kind: "vec4", arrayLength: 96, required: false },
  { name: "u_clusteredLightEnabled", kind: "float", required: false },
  { name: "u_clusterGridSize", kind: "vec2", required: false },
  { name: "u_clusterViewportSize", kind: "vec2", required: false },
  { name: "u_contactShadowMaskStrength", kind: "float", required: false },
  { name: "u_contactShadowMaskViewport", kind: "vec2", required: false },
  { name: "u_contactShadowLightIndex", kind: "float", required: false },
  { name: "u_contactShadowMask", kind: "texture2d", required: false },
  { name: "u_shadowMapEnabled", kind: "float", required: false },
  { name: "u_shadowMapMatrix", kind: "mat4", required: false },
  { name: "u_shadowMapStrength", kind: "float", required: false },
  { name: "u_shadowMapBias", kind: "float", required: false },
  { name: "u_shadowMapSlopeBias", kind: "float", required: false },
  { name: "u_shadowMapNormalBias", kind: "float", required: false },
  { name: "u_shadowMapTexelSize", kind: "vec2", required: false },
  { name: "u_shadowPcfSampleCount", kind: "float", required: false },
  { name: "u_shadowPcfSamples", kind: "vec4", arrayLength: 32, required: false },
  { name: "u_pointShadowMapEnabled", kind: "float", required: false },
  { name: "u_pointShadowLightPosition", kind: "vec3", required: false },
  { name: "u_pointShadowRange", kind: "float", required: false },
  { name: "u_pointShadowFaceMatrices", kind: "mat4", arrayLength: 6, required: false },
  { name: "u_pointShadowFaceRects", kind: "vec4", arrayLength: 6, required: false },
  { name: "u_pointShadowStrength", kind: "float", required: false },
  { name: "u_pointShadowBias", kind: "float", required: false },
  { name: "u_pointShadowSlopeBias", kind: "float", required: false },
  { name: "u_pointShadowTexelSize", kind: "vec2", required: false },
  { name: "u_pointShadowPcfSampleCount", kind: "float", required: false },
  { name: "u_pointShadowPcfSamples", kind: "vec4", arrayLength: 32, required: false },
  { name: "u_spotShadowMapEnabled", kind: "float", required: false },
  { name: "u_spotShadowLightPosition", kind: "vec3", required: false },
  { name: "u_spotShadowLightDirection", kind: "vec3", required: false },
  { name: "u_spotShadowMatrix", kind: "mat4", required: false },
  { name: "u_spotShadowCone", kind: "vec2", required: false },
  { name: "u_spotShadowRange", kind: "float", required: false },
  { name: "u_spotShadowStrength", kind: "float", required: false },
  { name: "u_spotShadowBias", kind: "float", required: false },
  { name: "u_spotShadowSlopeBias", kind: "float", required: false },
  { name: "u_spotShadowTexelSize", kind: "vec2", required: false },
  { name: "u_spotShadowPcfSampleCount", kind: "float", required: false },
  { name: "u_spotShadowPcfSamples", kind: "vec4", arrayLength: 32, required: false },
  { name: "u_localShadowMatrices", kind: "mat4", arrayLength: 6, required: false },
  { name: "u_localShadowRects", kind: "vec4", arrayLength: 6, required: false },
  { name: "u_localShadowTexelScale", kind: "vec4", arrayLength: 2, required: false },
  { name: "u_localShadowParams", kind: "vec4", required: false },
  { name: "u_localShadowAtlasTexel", kind: "vec2", required: false },
  { name: "u_graphCascadeCount", kind: "float", required: false },
  { name: "u_graphCascadeViewMode", kind: "float", required: false },
  { name: "u_graphCascadeSplits", kind: "vec4", required: false },
  { name: "u_graphCascadeMatrices", kind: "mat4", arrayLength: 4, required: false },
  { name: "u_graphCascadeParams", kind: "vec4", arrayLength: 4, required: false },
  { name: "u_graphCascadeTexels", kind: "vec4", arrayLength: 4, required: false },
  { name: "u_graphCascadeSamples", kind: "vec4", arrayLength: 128, required: false },
  { name: "u_a3dEnvAmbient", kind: "vec3", required: false },
  // The GLSL vec3[9] is packed as 27 contiguous floats by the forward pass.
  // Seven vec4 fields preserve that sequence in a host-shareable WGSL array.
  { name: "u_a3dEnvSh", kind: "vec4", arrayLength: 7, required: false },
  { name: "u_a3dEnvShEnabled", kind: "float", required: false },
  { name: "u_a3dHemiSky", kind: "vec3", required: false },
  { name: "u_a3dHemiGround", kind: "vec3", required: false },
  { name: "u_a3dEnvSky", kind: "vec3", required: false },
  { name: "u_a3dEnvHorizon", kind: "vec3", required: false },
  { name: "u_a3dEnvGround", kind: "vec3", required: false },
  { name: "u_a3dEnvMapEnabled", kind: "float", required: false },
  { name: "u_a3dEnvMapIntensity", kind: "float", required: false },
  { name: "u_a3dEnvMapRotation", kind: "float", required: false },
  { name: "u_a3dEnvMapMaxLod", kind: "float", required: false },
  { name: "u_a3dEnvMapEncoding", kind: "float", required: false },
  { name: "u_environmentFogEnabled", kind: "float", required: false },
  { name: "u_environmentFogMode", kind: "float", required: false },
  { name: "u_environmentFogColor", kind: "vec3", required: false },
  { name: "u_environmentFogNear", kind: "float", required: false },
  { name: "u_environmentFogFar", kind: "float", required: false },
  { name: "u_environmentFogDensity", kind: "float", required: false },
  { name: "u_environmentFogHeightFalloff", kind: "float", required: false },
  { name: "u_environmentFogHeightReference", kind: "float", required: false },
  { name: "u_environmentFogMaxOpacity", kind: "float", required: false },
  { name: "u_volumetricIntensity", kind: "float", required: false },
  { name: "u_volumetricLightDirection", kind: "vec3", required: false },
  { name: "u_volumetricLightColor", kind: "vec3", required: false },
  { name: "u_clusterLightData", kind: "texture2d", required: false },
  { name: "u_clusterLightIndices", kind: "texture2d", required: false },
  { name: "u_jointPaletteTexture", kind: "texture2d", required: false },
  { name: "u_shadowMapTexture", kind: "texture2d", required: false },
  { name: "u_pointShadowMapTexture", kind: "texture2d", required: false },
  { name: "u_spotShadowMapTexture", kind: "texture2d", required: false },
  { name: "u_localShadowAtlas", kind: "texture2d", required: false },
  { name: "u_graphCascadeTexture0", kind: "texture2d", required: false },
  { name: "u_graphCascadeTexture1", kind: "texture2d", required: false },
  { name: "u_graphCascadeTexture2", kind: "texture2d", required: false },
  { name: "u_graphCascadeTexture3", kind: "texture2d", required: false },
  { name: "u_prd02ProbeCubeA", kind: "texture-cube", required: false },
  { name: "u_prd02ProbeCubeB", kind: "texture-cube", required: false },
  { name: "u_prd02ProbeCenterA", kind: "vec4", required: false },
  { name: "u_prd02ProbeCenterB", kind: "vec4", required: false },
  { name: "u_prd02ProbeOriginA", kind: "vec4", required: false },
  { name: "u_prd02ProbeOriginB", kind: "vec4", required: false },
  { name: "u_prd02ProbeHalfA", kind: "vec4", required: false },
  { name: "u_prd02ProbeHalfB", kind: "vec4", required: false },
  { name: "u_prd02ProbeWeights", kind: "vec4", required: false },
  { name: "u_a3dLocalProbeIntensity", kind: "float", required: false },
  { name: "u_prd02IrradianceR", kind: "texture2d-array", required: false },
  { name: "u_prd02IrradianceG", kind: "texture2d-array", required: false },
  { name: "u_prd02IrradianceB", kind: "texture2d-array", required: false },
  { name: "u_prd02IrradianceMin", kind: "vec4", required: false },
  { name: "u_prd02IrradianceMax", kind: "vec4", required: false },
  { name: "u_prd02IrradianceGrid", kind: "vec4", required: false },
  { name: "u_graphGlobalEnvCube", kind: "texture-cube", required: false },
  { name: "u_graphGlobalEnvCubeInfo", kind: "vec4", required: false },
  { name: "u_graphGlobalEnvCubeEncoding", kind: "float", required: false },
  { name: "u_graphGlobalEnvCubeDiffuseIntensity", kind: "float", required: false },
  { name: "u_a3dEnvMap", kind: "texture2d", required: false }
];

export interface PortableShaderStagePair {
  readonly vertex: string;
  readonly fragment: string;
}

export interface PortableShaderSources {
  readonly glsl: PortableShaderStagePair;
  /**
   * threejs-parity SH-02: optional. `createAuraApp` mounts WebGL2 where GLSL
   * is authoritative; omitting `wgsl` produces a WebGL2-only material — the
   * WebGPU device fails closed (`WGSL_PROGRAM_MISSING`) rather than silently
   * rasterizing the GLSL program.
   */
  readonly wgsl?: NativeShaderStages;
}

/** A data uniform uses the same recursive schema consumed by WebGPU's portable layout. */
export interface PortableShaderUniformDescriptor extends Omit<MaterialUniformDescriptor, "kind"> {
  readonly kind: MaterialUniformKind | "data";
  /** Fixed-length array of a legacy numeric kind; data uniforms encode arrays in dataType. */
  readonly arrayLength?: number;
  readonly dataType?: ShaderDataType;
  /**
   * WebGL2 only: GLSL identifiers for logical struct field names in
   * `dataType` when the GLSL declaration renames them (graph GLSL prefixes
   * fields). The WGSL path and host values always use the logical names.
   */
  readonly glslFieldNames?: Readonly<Record<string, string>>;
}

export interface PortableShaderUniform extends PortableShaderUniformDescriptor {
  readonly value: RecursiveUniformValue;
}

export interface PortableShaderMaterialOptions {
  /** The same library must be supplied to `Renderer.create({ shaderLibrary })`. */
  readonly shaderLibrary: ShaderLibrary;
  readonly name: string;
  readonly sources: PortableShaderSources;
  readonly uniforms?: readonly PortableShaderUniform[];
  readonly requiredAttributes?: readonly string[];
  readonly renderState?: Partial<RenderState>;
  /** Scene-light capability marker supplied by the graph adapter. */
  readonly graphLightingModel?: "metallic-roughness";
  /** True for materials generated by the graph adapter. */
  readonly graphMaterial?: boolean;
  /** The graph has an authored vertex-position output, independent of castShadow. */
  readonly graphDisplaced?: boolean;
  /** Borrowed, stage-selected native resources for WebGPU-only graph materials. */
  readonly graphStorage?: { readonly forward: readonly NativeStorageBinding[]; readonly depth: readonly NativeStorageBinding[] };
}

export interface PortableShaderCompilationResult {
  readonly ok: boolean;
  readonly program?: RenderShaderProgram;
  readonly diagnostics: readonly string[];
}

export type GraphSkinningJointKind = "float" | "uint" | "sint";

export class PortableShaderCompilationError extends Error {
  constructor(public readonly diagnostics: readonly string[]) {
    super("Portable shader validation failed");
    this.name = "PortableShaderCompilationError";
  }
}

/**
 * A renderer-integrated, paired GLSL/WGSL material with schema-checked bindings.
 *
 * WGSL stages place `/* @aura3d-bindings *\/` at module scope, then read numeric
 * values from `aura.<name>` and textures from `<name>Texture`/`<name>Sampler`.
 * Aura3D owns bind-group layout generation and binary packing so application code
 * never reaches into WebGLProgram, GPUDevice, or renderer internals.
 */
export class PortableShaderMaterial extends Material {
  readonly graphLightingModel: "metallic-roughness" | undefined;
  readonly graphMaterial: boolean;
  readonly graphDisplaced: boolean;
  readonly graphRequiresWebGPU: boolean;
  private graphSourcesPristineValue = true;
  private readonly graphStorage: { readonly forward: readonly NativeStorageBinding[]; readonly depth: readonly NativeStorageBinding[] } | undefined;
  /** Optional graph variants use float joint and weight streams at locations 5/6 and 8/9. */
  readonly graphSkinningShaderKeys?: Readonly<{ four: string; eight: string }>;
  readonly graphSkinningDepthShaderKeys?: Readonly<{ four: string; eight: string }>;
  private sourcesValue: PortableShaderSources;
  private readonly shaderLibrary: ShaderLibrary;
  private readonly marker: string;
  private bindings: readonly PortableShaderBinding[];
  private diagnosticsValue: readonly string[] = [];

  constructor(options: PortableShaderMaterialOptions) {
    const shaderKey = portableShaderKey(options.name);
    const uniforms = snapshotPortableUniforms(options.uniforms ?? []);
    const marker = `@aura3d-portable:${shaderKey}`;
    const diagnostics = validatePortableShaderSources(options.sources, uniforms, marker);
    if (diagnostics.length > 0) throw new PortableShaderCompilationError(diagnostics);
    const bindings = portableBindings(options.sources, uniforms);
    const requiredAttributes = options.requiredAttributes ?? ["a_position"];
    const needsNormal = /^\s*#define\s+A3D_REQUIRES_VERTEX_NORMAL\s+1\s*$/m.test(options.sources.glsl.vertex);
    super({
      name: options.name,
      shaderKey,
      ...(options.renderState ? { renderState: options.renderState } : {}),
      requiredAttributes: needsNormal ? [...new Set([...requiredAttributes, "a_normal"])] : requiredAttributes,
      uniformSchema: uniforms.map(({ value: _value, ...descriptor }) => descriptor)
    });
    for (const uniform of uniforms) this.setParameter(uniform.name, uniform.value);
    for (const descriptor of this.uniformSchema) Object.freeze(descriptor);
    Object.freeze(this.uniformSchema);
    this.shaderLibrary = options.shaderLibrary;
    this.graphLightingModel = options.graphLightingModel;
    this.graphMaterial = options.graphMaterial === true;
    this.graphDisplaced = options.graphDisplaced === true;
    this.graphRequiresWebGPU = options.graphStorage !== undefined;
    this.graphStorage = options.graphStorage ? { forward: [...options.graphStorage.forward], depth: [...options.graphStorage.depth] } : undefined;
    this.sourcesValue = options.sources;
    this.marker = marker;
    this.bindings = bindings;
    this.shaderLibrary.register(this.sourcePair(options.sources));
  }

  get sources(): PortableShaderSources {
    return this.sourcesValue;
  }

  /** Raw graph source reloads cannot certify paired depth and generated variants.
   * Rebuild the graph material to receive a camera-depth contact mask again. */
  get graphSourcesPristine(): boolean {
    return this.graphSourcesPristineValue;
  }

  /** Whether this adapter-issued graph still has its paired clipping stages. */
  static hasGraphClippingContract(material: unknown, shaderKey?: string, pass: "forward" | "depth" = "forward"): boolean {
    if (typeof material !== "object" || material === null || (pass !== "forward" && pass !== "depth")) return false;
    const record = graphClippingVerifiers.get(material);
    if (!record || Object.getPrototypeOf(material) !== record.prototypes[0]?.value || !graphClippingPrototypesUnchanged(record)) return false;
    if (Reflect.ownKeys(material).some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(material, key);
      return !descriptor || !!descriptor.get || !!descriptor.set || typeof descriptor.value === "function";
    })) return false;
    const disposed = Object.getOwnPropertyDescriptor(material, "disposed");
    const pristine = Object.getOwnPropertyDescriptor(material, "graphSourcesPristineValue");
    if (disposed?.value !== false || pristine?.value !== true) return false;
    try { return record.verify(shaderKey, pass); } catch { return false; }
  }

  /** Internal adapter seam; an ordinary portable material has no certificate. */
  protected certifyGraphClipping(verify: (shaderKey?: string, pass?: "forward" | "depth") => boolean): void {
    const prototypes: { value: object; parent: object | null; descriptors: PropertyDescriptorMap }[] = [];
    for (let value = Object.getPrototypeOf(this) as object | null; value && value !== Object.prototype; value = Object.getPrototypeOf(value) as object | null) {
      prototypes.push({ value, parent: Object.getPrototypeOf(value) as object | null, descriptors: Object.getOwnPropertyDescriptors(value) });
    }
    graphClippingVerifiers.set(this, { verify, prototypes });
  }

  /** Graph adapters can lazily provide typed joint-input variants per pass. */
  graphSkinningVariant(_influences: 4 | 8, _first: GraphSkinningJointKind, _second: GraphSkinningJointKind, _pass: "forward" | "depth"): string | undefined {
    return undefined;
  }

  /** Return a graph program containing only the requested shadow features. */
  graphShadowVariant(_baseShaderKey: string, _features: number): string | undefined {
    return undefined;
  }

  /** Return a graph program for the selected shadow and environment features. */
  graphLightingVariant(_baseShaderKey: string, _shadowFeatures: number, _environmentFeatures: number): string | undefined {
    return undefined;
  }

  /** Borrow graph storage for one draw; resource ownership remains with the caller. */
  graphStorageBindings(pass: "forward" | "depth"): readonly NativeStorageBinding[] {
    return this.graphStorage?.[pass] ?? [];
  }

  get diagnostics(): readonly string[] {
    return this.diagnosticsValue;
  }

  override setParameter(name: string, value: RecursiveUniformValue): void {
    const descriptor = this.uniformSchema.find((candidate) => candidate.name === name);
    if (!descriptor) throw new Error(`Portable shader ${this.name} has no declared uniform ${name}`);
    // Validate the owned snapshot, not a mutable input that could change between
    // validation and Material's copy. Textures remain borrowed.
    const snapshot = cloneMaterialUniformValue(value);
    const diagnostic = portableUniformValueDiagnostic(descriptor, snapshot);
    if (diagnostic) throw new Error(diagnostic);
    this.setParameterValue(name, snapshot);
  }

  /** Validate instance overrides with the same schema as material writes. */
  uniformValueDiagnostic(name: string, value: RecursiveUniformValue): string | null {
    const descriptor = this.uniformSchema.find((candidate) => candidate.name === name);
    if (!descriptor) return null;
    const diagnostic = portableUniformValueDiagnostic(descriptor, value);
    if (diagnostic) return diagnostic;
    // Keep the existing binding-time rule: unlike optional 2D textures, 3D
    // and depth declarations have no compatible neutral fallback.
    if ((descriptor.kind === "texture3d" || descriptor.kind === "depth2d") && isTextureBinding(value) && !value.texture) {
      return `Material uniform ${name} requires a bound ${descriptor.kind} texture`;
    }
    return null;
  }

  override getParameter<T extends RecursiveUniformValue = UniformValue>(name: string): T | undefined {
    return super.getParameter(name) as T | undefined;
  }

  override getParameters<T extends RecursiveUniformValue = UniformValue>(): ReadonlyMap<string, T> {
    return super.getParameters() as ReadonlyMap<string, T>;
  }

  /** Replaces both backend stages atomically; the renderer recompiles on its next draw. */
  hotReload(sources: PortableShaderSources): void {
    if (this.disposed) throw new Error(`Material ${this.name} is disposed`);
    const uniforms = this.uniformSchema.map((descriptor) => ({ ...descriptor, value: this.getRecursiveParameter(descriptor.name)! }));
    const diagnostics = validatePortableShaderSources(sources, uniforms, this.marker);
    this.diagnosticsValue = diagnostics;
    if (diagnostics.length > 0) throw new PortableShaderCompilationError(diagnostics);
    const bindings = portableBindings(sources, uniforms);
    this.shaderLibrary.replace(this.sourcePair(sources, bindings));
    this.sourcesValue = sources;
    this.bindings = bindings;
    if (this.graphMaterial) {
      this.graphSourcesPristineValue = false;
      graphClippingVerifiers.delete(this);
    }
  }

  /** Normalizes backend compile/link failures into a public diagnostic result. */
  compile(device: RenderDevice): PortableShaderCompilationResult {
    if (this.disposed) return { ok: false, diagnostics: [`Material ${this.name} is disposed`] };
    if (this.graphRequiresWebGPU && device.kind !== "webgpu") return { ok: false, diagnostics: ["GRAPH_STORAGE_BACKEND_UNSUPPORTED: graph storage requires WebGPU"] };
    try {
      const program = ShaderModule.fromLibrary(this.shaderLibrary, this.shaderKey).compile(device);
      this.diagnosticsValue = [];
      return { ok: true, program, diagnostics: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = typeof error === "object" && error !== null && "details" in error
        ? JSON.stringify((error as { readonly details?: unknown }).details ?? {})
        : "";
      this.diagnosticsValue = [details ? `${message}: ${details}` : message];
      return { ok: false, diagnostics: this.diagnosticsValue };
    }
  }

  /** Runs native asynchronous diagnostics (WGSL on WebGPU) before program creation. */
  async compileAsync(device: RenderDevice): Promise<PortableShaderCompilationResult> {
    if (this.disposed) return { ok: false, diagnostics: [`Material ${this.name} is disposed`] };
    if (this.graphRequiresWebGPU && device.kind !== "webgpu") return { ok: false, diagnostics: ["GRAPH_STORAGE_BACKEND_UNSUPPORTED: graph storage requires WebGPU"] };
    try {
      const source = ShaderModule.fromLibrary(this.shaderLibrary, this.shaderKey).source;
      const diagnostics = await device.getShaderCompilationDiagnostics?.({
        label: source.label,
        marker: source.marker,
        vertex: source.vertex,
        fragment: source.fragment,
        ...(source.webgpu ? { webgpu: source.webgpu } : {}),
        ...(source.portableBindings ? { portableBindings: source.portableBindings } : {})
      }) ?? [];
      const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
      if (errors.length > 0) {
        this.diagnosticsValue = errors.map((diagnostic) => `${diagnostic.stage}${diagnostic.line ? `:${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ""}` : ""}: ${diagnostic.message}`);
        return { ok: false, diagnostics: this.diagnosticsValue };
      }
      return this.compile(device);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsValue = [message];
      return { ok: false, diagnostics: this.diagnosticsValue };
    }
  }

  override dispose(): void {
    if (this.disposed) return;
    graphClippingVerifiers.delete(this);
    this.shaderLibrary.unregister(this.shaderKey);
    super.dispose();
  }

  /**
   * Protected (SH-02): the engine adapter publishes this exact pair into the
   * global shader-source registry so the renderer-owned library resolves it.
   */
  protected sourcePair(sources: PortableShaderSources, bindings: readonly PortableShaderBinding[] = this.bindings): ShaderSourcePair {
    return {
      name: this.shaderKey,
      marker: this.marker,
      vertex: withMarker(sources.glsl.vertex, this.marker),
      fragment: withMarker(sources.glsl.fragment, this.marker),
      ...(sources.wgsl
        ? {
          webgpu: {
            vertex: withMarker(sources.wgsl.vertex, this.marker),
            fragment: withMarker(sources.wgsl.fragment, this.marker),
            ...(sources.wgsl.storageBindings ? { storageBindings: sources.wgsl.storageBindings } : {})
          },
          portableBindings: bindings
        }
        : {})
    };
  }

  /** Build a matching portable layout for a derived shader pair. */
  protected bindingsForSources(sources: PortableShaderSources): readonly PortableShaderBinding[] {
    const uniforms = this.uniformSchema.map((descriptor) => ({ ...descriptor, value: this.getRecursiveParameter(descriptor.name)! }));
    return portableBindings(sources, uniforms);
  }
}

function portableShaderKey(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("Portable shader material name is required");
  return `aura3d/portable/${normalized}`;
}

function portableKind(kind: PortableShaderUniformDescriptor["kind"]): PortableShaderBinding["kind"] {
  switch (kind) {
    case "float": case "i32": case "u32": case "bool": case "vec2": case "vec3": case "vec4": case "mat4": case "data":
    case "texture2d": case "texture3d": case "depth2d": return kind;
    default: throw new Error(`Portable shader uniforms do not support ${String(kind)}; use a supported scalar/vector/matrix or texture kind`);
  }
}

function freezeDataType(type: ShaderDataType): ShaderDataType {
  if (typeof type === "string") return type;
  if (type.kind === "array") freezeDataType(type.element);
  if (type.kind === "struct") {
    for (const field of type.fields) {
      freezeDataType(field.type);
      Object.freeze(field);
    }
    Object.freeze(type.fields);
  }
  return Object.freeze(type);
}

function snapshotPortableUniforms(uniforms: readonly PortableShaderUniform[]): readonly PortableShaderUniform[] {
  return uniforms.map((uniform) => {
    try {
      const kind = portableKind(uniform.kind);
      if (kind === "data") {
        if (uniform.dataType === undefined || uniform.arrayLength !== undefined) {
          throw new Error("data uniforms require dataType and cannot also specify arrayLength");
        }
        // Derivation validates and snapshots the complete logical schema,
        // including nested arrays and bools (lowered to u32 by the WGSL path).
        const dataType = freezeDataType(deriveShaderDataLayout(uniform.dataType, "glsl-std430").type);
        let glslFieldNames: Readonly<Record<string, string>> | undefined;
        if (uniform.glslFieldNames !== undefined) {
          const names: Record<string, string> = Object.create(null) as Record<string, string>;
          for (const [logical, glsl] of Object.entries(uniform.glslFieldNames)) {
            if (typeof glsl !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(glsl)) throw new Error(`glslFieldNames.${logical} must be a GLSL identifier`);
            names[logical] = glsl;
          }
          glslFieldNames = Object.freeze(names);
        }
        return { ...uniform, dataType, required: uniform.required ?? true, ...(glslFieldNames ? { glslFieldNames } : {}) };
      }
      if (uniform.dataType !== undefined) throw new Error("dataType is only valid for data uniforms");
      if (uniform.glslFieldNames !== undefined) throw new Error("glslFieldNames is only valid for data uniforms");
      if (uniform.arrayLength !== undefined) {
        if (isFrameTexture(kind)) throw new Error("texture uniforms cannot specify arrayLength");
        if (!Number.isSafeInteger(uniform.arrayLength) || uniform.arrayLength < 1) {
          throw new Error("arrayLength must be a positive safe integer");
        }
      }
      return { ...uniform, required: uniform.required ?? true };
    } catch (error) {
      throw new PortableShaderCompilationError([`Uniform ${uniform.name}: ${error instanceof Error ? error.message : String(error)}`]);
    }
  });
}

function referencedFrameBindings(sources: PortableShaderSources, uniforms: readonly PortableShaderUniform[]): readonly PortableShaderBinding[] {
  if (!sources.wgsl) return [];
  const explicit = new Set(uniforms.map((uniform) => uniform.name));
  const source = `${sources.wgsl.vertex}\n${sources.wgsl.fragment}`;
  const cascadeCount = Number(source.match(/@aura3d-graph-cascades:([1-4])\b/)?.[1] ?? 0);
  return FRAME_BINDINGS.filter((binding) => !explicit.has(binding.name) && (
    new RegExp(`\\baura\\s*\\.\\s*${binding.name}\\b`).test(source) ||
    isFrameTexture(binding.kind) && new RegExp(`\\b${binding.name}(?:Texture|Sampler)\\b`).test(source)
  )).map((binding) => {
    if (!cascadeCount) return binding;
    if (["u_graphCascadeMatrices", "u_graphCascadeParams", "u_graphCascadeTexels"].includes(binding.name)) return { ...binding, arrayLength: cascadeCount };
    if (binding.name === "u_graphCascadeSamples") return { ...binding, arrayLength: cascadeCount * 32 };
    return binding;
  });
}

function portableBindings(sources: PortableShaderSources, uniforms: readonly PortableShaderUniform[]): readonly PortableShaderBinding[] {
  const frame = referencedFrameBindings(sources, uniforms);
  const bindings: PortableShaderBinding[] = [
    ...BUILTIN_BINDINGS.map((binding) => ({ ...binding })),
    ...frame.filter((binding) => !isFrameTexture(binding.kind)).map((binding) => ({ ...binding })),
    ...uniforms.map(({ name, kind, required, arrayLength, dataType }) => ({
      name, kind: portableKind(kind), required,
      ...(arrayLength !== undefined ? { arrayLength } : {}),
      ...(dataType !== undefined ? { dataType } : {})
    })),
    // Graph texture binding indices stay independent of optional scene inputs.
    ...frame.filter((binding) => isFrameTexture(binding.kind)).map((binding) => ({ ...binding }))
  ];
  for (const binding of bindings) Object.freeze(binding);
  return Object.freeze(bindings);
}

function isFrameTexture(kind: PortableShaderBinding["kind"]): boolean {
  return kind === "texture2d" || kind === "texture2d-array" || kind === "texture3d" || kind === "texture-cube" || kind === "depth2d";
}

function withMarker(source: string, marker: string): string {
  const version = source.match(/^(\s*#version[^\n]*\n)/);
  return version
    ? `${version[1]}// ${marker}\n${source.slice(version[1].length)}`
    : `// ${marker}\n${source}`;
}

function validatePortableShaderSources(
  sources: PortableShaderSources,
  uniforms: readonly PortableShaderUniform[],
  marker: string
): readonly string[] {
  const diagnostics: string[] = [];
  const names = new Set<string>();
  for (const uniform of uniforms) {
    if (!/^u_[A-Za-z0-9_]+$/.test(uniform.name)) diagnostics.push(`Uniform ${uniform.name} must be a valid u_-prefixed identifier`);
    if (names.has(uniform.name) || BUILTIN_BINDINGS.some((binding) => binding.name === uniform.name)) diagnostics.push(`Duplicate or reserved uniform: ${uniform.name}`);
    if (!sources.wgsl && uniform.kind === "data") diagnostics.push(`GLSL data uniform ${uniform.name} requires a portable WGSL schema`);
    names.add(uniform.name);
    try { portableKind(uniform.kind); } catch (error) { diagnostics.push(error instanceof Error ? error.message : String(error)); }
  }
  const reflected = reflectShaderSources({
    label: "portable-validation",
    marker,
    vertex: withMarker(sources.glsl.vertex, marker),
    fragment: withMarker(sources.glsl.fragment, marker)
  });
  for (const builtin of BUILTIN_BINDINGS) {
    if (builtin.required && !reflected.uniforms.has(builtin.name)) diagnostics.push(`GLSL is missing required built-in uniform ${builtin.name}`);
  }
  for (const builtin of referencedFrameBindings(sources, uniforms)) {
    const detail = reflected.uniformDetails.get(builtin.name);
    const declared = detail?.type;
    const expected = builtin.name === "u_a3dEnvSh" ? "vec3" : builtin.kind === "texture2d" || builtin.kind === "depth2d" ? "sampler2D" : builtin.kind === "texture2d-array" ? "sampler2DArray" : builtin.kind === "texture-cube" ? "samplerCube" : builtin.kind === "texture3d" ? "sampler3D" : builtin.kind === "mat4" ? "mat4" : builtin.kind === "vec4" ? "vec4" : builtin.kind === "vec3" ? "vec3" : builtin.kind === "vec2" ? "vec2" : "float";
    if (!declared) diagnostics.push(`GLSL is missing built-in uniform ${builtin.name} referenced by WGSL`);
    else if (declared !== expected) diagnostics.push(`GLSL built-in uniform ${builtin.name} must be ${expected}, got ${declared}`);
    else if (builtin.arrayLength !== undefined && detail?.arraySize !== (builtin.name === "u_a3dEnvSh" ? 9 : builtin.arrayLength)) diagnostics.push(`GLSL built-in uniform ${builtin.name} has the wrong array length`);
  }
  for (const uniform of uniforms) {
    if (uniform.required !== false && !reflected.uniforms.has(uniform.name)) diagnostics.push(`GLSL is missing schema uniform ${uniform.name}`);
    const expected = uniform.kind === "i32" ? "int" : uniform.kind === "u32" ? "uint" : uniform.kind === "bool" ? "bool"
      : uniform.kind === "texture3d" ? "sampler3D" : uniform.kind === "depth2d" ? "sampler2D" : undefined;
    const declared = reflected.uniformDetails.get(uniform.name)?.type;
    if (expected && declared && declared !== expected) diagnostics.push(`GLSL uniform ${uniform.name} must be ${expected} for ${uniform.kind}, got ${declared}`);
    if (uniform.arrayLength !== undefined && declared && reflected.uniformDetails.get(uniform.name)?.arraySize !== uniform.arrayLength) {
      diagnostics.push(`GLSL uniform ${uniform.name} has the wrong array length`);
    }
  }
  // SH-02: WGSL is optional; when present both stages must carry the bindings
  // marker and their entry points. An absent WGSL pair simply compiles WebGL2-only.
  if (sources.wgsl) {
    for (const [stage, source] of [["vertex", sources.wgsl.vertex], ["fragment", sources.wgsl.fragment]] as const) {
      if (!source.includes(WGSL_BINDINGS_MARKER)) diagnostics.push(`WGSL ${stage} stage is missing ${WGSL_BINDINGS_MARKER}`);
    }
    if (!/@vertex\b/.test(sources.wgsl.vertex)) diagnostics.push("WGSL vertex stage is missing an @vertex entry point");
    if (!/@fragment\b/.test(sources.wgsl.fragment)) diagnostics.push("WGSL fragment stage is missing an @fragment entry point");
  }
  return diagnostics;
}

function portableUniformValueDiagnostic(descriptor: PortableShaderUniformDescriptor, value: RecursiveUniformValue): string | null {
  if (descriptor.kind === "texture2d" || descriptor.kind === "texture3d" || descriptor.kind === "depth2d") {
    if (!isTextureBinding(value)) return `Portable uniform ${descriptor.name} must be ${descriptor.kind}`;
    if (value.texture && descriptor.kind === "texture3d" && value.texture.dimension !== "3d") return `Portable uniform ${descriptor.name} must be a 3d texture`;
    if (value.texture && descriptor.kind === "depth2d" && (value.texture.dimension !== "2d" || value.texture.format !== "depth24")) return `Portable uniform ${descriptor.name} must be a 2d depth texture`;
    return null;
  }
  if (isTextureBinding(value)) return `Portable uniform ${descriptor.name} must be ${descriptor.kind}, got texture2d`;
  if (descriptor.kind === "data") {
    return dataValueDiagnostic(descriptor.dataType!, value, `Portable uniform ${descriptor.name}`);
  }
  if (descriptor.arrayLength !== undefined) {
    const count = descriptor.kind === "vec2" ? 2 : descriptor.kind === "vec3" ? 3
      : descriptor.kind === "vec4" ? 4 : descriptor.kind === "mat4" ? 16 : 1;
    const values = uniformSequence(value);
    if (!values) return `Portable uniform ${descriptor.name} must contain ${descriptor.arrayLength} array elements`;
    if (count > 1 && values.length === descriptor.arrayLength && Array.isArray(value)
      && value.some((entry) => Array.isArray(entry) || ArrayBuffer.isView(entry))) {
      for (let index = 0; index < values.length; index += 1) {
        const entry = uniformSequence(values[index]);
        if (!entry || entry.length !== count) return `Portable uniform ${descriptor.name}[${index}] must have ${count} scalar values`;
        for (let component = 0; component < count; component += 1) {
          const diagnostic = scalarDataDiagnostic("f32", entry[component], `Portable uniform ${descriptor.name}[${index}][${component}]`);
          if (diagnostic) return diagnostic;
        }
      }
      return null;
    }
    const expected = descriptor.arrayLength * count;
    if (values.length !== expected) return `Portable uniform ${descriptor.name} must contain ${expected} scalar values, got ${values.length}`;
    const element = descriptor.kind === "float" ? "f32" : descriptor.kind === "i32" ? "i32"
      : descriptor.kind === "u32" ? "u32" : descriptor.kind === "bool" ? "bool" : "f32";
    for (let index = 0; index < values.length; index += 1) {
      const diagnostic = scalarDataDiagnostic(element, values[index], `Portable uniform ${descriptor.name}[${index}]`);
      if (diagnostic) return diagnostic;
    }
    return null;
  }
  if (descriptor.kind === "u32") {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
      ? null
      : `Portable uniform ${descriptor.name} must be a u32 integer between 0 and 4294967295`;
  }
  if (descriptor.kind === "i32") {
    return typeof value === "number" && Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff
      ? null
      : `Portable uniform ${descriptor.name} must be an i32 integer between -2147483648 and 2147483647`;
  }
  if (descriptor.kind === "bool") return value === 0 || value === 1 ? null : `Portable uniform ${descriptor.name} must be a boolean encoded as 0 or 1`;
  const values = typeof value === "number" ? [value] : uniformSequence(value);
  const expected = descriptor.kind === "float" ? 1
    : descriptor.kind === "vec2" ? 2
      : descriptor.kind === "vec3" ? 3
        : descriptor.kind === "vec4" ? 4
          : descriptor.kind === "mat4" ? 16
            : 0;
  if (!values || values.length !== expected) return `Portable uniform ${descriptor.name} must be ${descriptor.kind} with ${expected} scalar values, got ${values?.length ?? 0}`;
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== "number" || !Number.isFinite(values[index]) || !Number.isFinite(Math.fround(values[index] as number))) {
      return `Portable uniform ${descriptor.name} must contain finite values`;
    }
  }
  return null;
}

function uniformSequence(value: unknown): ArrayLike<unknown> | undefined {
  return Array.isArray(value) || value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array
    ? value : undefined;
}

function scalarDataDiagnostic(type: "f32" | "i32" | "u32" | "bool", value: unknown, path: string): string | null {
  if (type === "bool") return value === true || value === false || value === 0 || value === 1
    ? null : `${path}: expected true, false, 0, or 1`;
  if (typeof value !== "number" || !Number.isFinite(value)) return `${path}: expected a finite ${type} value`;
  if (type === "f32" && !Number.isFinite(Math.fround(value))) return `${path}: value is outside the finite f32 range`;
  if (type === "i32" && (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff)) {
    return `${path}: expected a signed 32-bit integer`;
  }
  if (type === "u32" && (!Number.isInteger(value) || value < 0 || value > 0xffffffff)) {
    return `${path}: expected an unsigned 32-bit integer`;
  }
  return null;
}

/** Validate logical values without allocating a buffer proportional to the layout. */
function dataValueDiagnostic(type: ShaderDataType, value: unknown, path: string): string | null {
  if (typeof type === "string") return scalarDataDiagnostic(type, value, path);
  if (type.kind === "struct") {
    if (!value || typeof value !== "object" || Array.isArray(value) || ArrayBuffer.isView(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      return `${path}: expected an object with every struct field`;
    }
    const record = value as Record<string, unknown>;
    for (const field of type.fields) {
      if (!Object.prototype.hasOwnProperty.call(record, field.name)) return `${path}.${field.name}: missing field`;
      const diagnostic = dataValueDiagnostic(field.type, record[field.name], `${path}.${field.name}`);
      if (diagnostic) return diagnostic;
    }
    for (const key of Object.keys(record)) {
      if (!type.fields.some((field) => field.name === key)) return `${path}.${key}: unknown field`;
    }
    return null;
  }
  const length = type.kind === "matrix" ? type.columns * type.rows : type.length;
  const values = uniformSequence(value);
  if (!values || values.length !== length) return `${path}: expected ${length} values`;
  for (let index = 0; index < length; index += 1) {
    const diagnostic = type.kind === "array"
      ? dataValueDiagnostic(type.element, values[index], `${path}[${index}]`)
      : scalarDataDiagnostic(type.kind === "vector" ? type.element : "f32", values[index], `${path}[${index}]`);
    if (diagnostic) return diagnostic;
  }
  return null;
}

/** Validate a logical portable value without allocating a layout-sized buffer. */
export function assertPortableUniformData(type: ShaderDataType, value: unknown, name = "uniform"): asserts value is UniformDataValue {
  const schema = deriveShaderDataLayout(type, "glsl-std430").type;
  const diagnostic = dataValueDiagnostic(schema, value, name);
  if (diagnostic) throw new TypeError(diagnostic);
}
