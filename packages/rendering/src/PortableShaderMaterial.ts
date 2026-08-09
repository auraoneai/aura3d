import { Material, type MaterialUniformDescriptor, type RenderState } from "./Material";
import type { PortableShaderBinding, RenderDevice, RenderShaderProgram, UniformValue } from "./RenderDevice";
import { ShaderLibrary, type ShaderSourcePair } from "./ShaderLibraryCore";
import { ShaderModule } from "./ShaderModule";
import { reflectShaderSources } from "./ShaderReflection";
import { TextureBinding } from "./TextureBinding";

const WGSL_BINDINGS_MARKER = "/* @aura3d-bindings */";
const BUILTIN_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_modelViewProjection", kind: "mat4", required: true },
  { name: "u_modelMatrix", kind: "mat4", required: false },
  { name: "u_normalMatrix", kind: "mat4", required: false }
];

export interface PortableShaderStagePair {
  readonly vertex: string;
  readonly fragment: string;
}

export interface PortableShaderSources {
  readonly glsl: PortableShaderStagePair;
  readonly wgsl: PortableShaderStagePair;
}

export interface PortableShaderUniform extends MaterialUniformDescriptor {
  readonly value: UniformValue;
}

export interface PortableShaderMaterialOptions {
  /** The same library must be supplied to `Renderer.create({ shaderLibrary })`. */
  readonly shaderLibrary: ShaderLibrary;
  readonly name: string;
  readonly sources: PortableShaderSources;
  readonly uniforms?: readonly PortableShaderUniform[];
  readonly requiredAttributes?: readonly string[];
  readonly renderState?: Partial<RenderState>;
}

export interface PortableShaderCompilationResult {
  readonly ok: boolean;
  readonly program?: RenderShaderProgram;
  readonly diagnostics: readonly string[];
}

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
  private sourcesValue: PortableShaderSources;
  private readonly shaderLibrary: ShaderLibrary;
  private readonly marker: string;
  private readonly bindings: readonly PortableShaderBinding[];
  private diagnosticsValue: readonly string[] = [];

  constructor(options: PortableShaderMaterialOptions) {
    const shaderKey = portableShaderKey(options.name);
    const uniforms = options.uniforms ?? [];
    const bindings = [...BUILTIN_BINDINGS, ...uniforms.map(({ name, kind, required }) => ({ name, kind: portableKind(kind), required }))];
    const marker = `@aura3d-portable:${shaderKey}`;
    const diagnostics = validatePortableShaderSources(options.sources, uniforms, marker);
    if (diagnostics.length > 0) throw new PortableShaderCompilationError(diagnostics);
    super({
      name: options.name,
      shaderKey,
      ...(options.renderState ? { renderState: options.renderState } : {}),
      requiredAttributes: options.requiredAttributes ?? ["a_position"],
      uniformSchema: uniforms.map(({ value: _value, ...descriptor }) => descriptor),
      parameters: Object.fromEntries(uniforms.map((uniform) => [uniform.name, uniform.value]))
    });
    this.shaderLibrary = options.shaderLibrary;
    this.sourcesValue = options.sources;
    this.marker = marker;
    this.bindings = bindings;
    this.shaderLibrary.register(this.sourcePair(options.sources));
  }

  get sources(): PortableShaderSources {
    return this.sourcesValue;
  }

  get diagnostics(): readonly string[] {
    return this.diagnosticsValue;
  }

  override setParameter(name: string, value: UniformValue): void {
    const descriptor = this.uniformSchema.find((candidate) => candidate.name === name);
    if (!descriptor) throw new Error(`Portable shader ${this.name} has no declared uniform ${name}`);
    const diagnostic = portableUniformValueDiagnostic(descriptor, value);
    if (diagnostic) throw new Error(diagnostic);
    super.setParameter(name, value);
  }

  /** Replaces both backend stages atomically; the renderer recompiles on its next draw. */
  hotReload(sources: PortableShaderSources): void {
    if (this.disposed) throw new Error(`Material ${this.name} is disposed`);
    const uniforms = this.uniformSchema.map((descriptor) => ({ ...descriptor, value: this.getParameter(descriptor.name)! }));
    const diagnostics = validatePortableShaderSources(sources, uniforms, this.marker);
    this.diagnosticsValue = diagnostics;
    if (diagnostics.length > 0) throw new PortableShaderCompilationError(diagnostics);
    this.shaderLibrary.replace(this.sourcePair(sources));
    this.sourcesValue = sources;
  }

  /** Normalizes backend compile/link failures into a public diagnostic result. */
  compile(device: RenderDevice): PortableShaderCompilationResult {
    if (this.disposed) return { ok: false, diagnostics: [`Material ${this.name} is disposed`] };
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
    this.shaderLibrary.unregister(this.shaderKey);
    super.dispose();
  }

  private sourcePair(sources: PortableShaderSources): ShaderSourcePair {
    return {
      name: this.shaderKey,
      marker: this.marker,
      vertex: withMarker(sources.glsl.vertex, this.marker),
      fragment: withMarker(sources.glsl.fragment, this.marker),
      webgpu: {
        vertex: withMarker(sources.wgsl.vertex, this.marker),
        fragment: withMarker(sources.wgsl.fragment, this.marker)
      },
      portableBindings: this.bindings
    };
  }
}

function portableShaderKey(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("Portable shader material name is required");
  return `aura3d/portable/${normalized}`;
}

function portableKind(kind: MaterialUniformDescriptor["kind"]): PortableShaderBinding["kind"] {
  if (kind === "any" || kind === "textureCube") {
    throw new Error(`Portable shader uniforms do not support ${kind}; use a concrete scalar/vector/matrix kind or texture2d`);
  }
  return kind;
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
  for (const uniform of uniforms) {
    if (uniform.required !== false && !reflected.uniforms.has(uniform.name)) diagnostics.push(`GLSL is missing schema uniform ${uniform.name}`);
  }
  for (const [stage, source] of Object.entries(sources.wgsl)) {
    if (!source.includes(WGSL_BINDINGS_MARKER)) diagnostics.push(`WGSL ${stage} stage is missing ${WGSL_BINDINGS_MARKER}`);
  }
  if (!/@vertex\b/.test(sources.wgsl.vertex)) diagnostics.push("WGSL vertex stage is missing an @vertex entry point");
  if (!/@fragment\b/.test(sources.wgsl.fragment)) diagnostics.push("WGSL fragment stage is missing an @fragment entry point");
  return diagnostics;
}

function portableUniformValueDiagnostic(descriptor: MaterialUniformDescriptor, value: UniformValue): string | null {
  if (descriptor.kind === "texture2d") {
    return value instanceof TextureBinding ? null : `Portable uniform ${descriptor.name} must be texture2d`;
  }
  if (value instanceof TextureBinding) return `Portable uniform ${descriptor.name} must be ${descriptor.kind}, got texture2d`;
  const values = typeof value === "number" ? [value] : Array.from(value);
  const expected = descriptor.kind === "float" ? 1
    : descriptor.kind === "vec2" ? 2
      : descriptor.kind === "vec3" ? 3
        : descriptor.kind === "vec4" ? 4
          : descriptor.kind === "mat4" ? 16
            : 0;
  if (values.length !== expected) return `Portable uniform ${descriptor.name} must be ${descriptor.kind} with ${expected} scalar values, got ${values.length}`;
  return values.every(Number.isFinite) ? null : `Portable uniform ${descriptor.name} must contain finite values`;
}
