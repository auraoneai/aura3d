import { type RecursiveUniformValue, type UniformDataValue, type UniformValue } from "./RenderDevice";
import type { ShaderDataType } from "./webgpu/ShaderDataLayout";
import { validateRenderCommandState, type BlendMode, type DepthCompare as DepthCompareV2 } from "./contracts/blend";
import type { RenderCommandState, RenderColorAttachmentState } from "./RenderDevice";
import { isTextureBinding, TextureBinding } from "./TextureBinding";
import { defaultProgramFeatures } from "./program/MaterialFeatures";

export type CullMode = "none" | "back" | "front";
export type DepthCompare = "always" | "less-equal";
export type ColorWriteMask = readonly [boolean, boolean, boolean, boolean];
export type StencilCompare = "never" | "less" | "less-equal" | "greater" | "greater-equal" | "equal" | "not-equal" | "always";
export type StencilOperation = "keep" | "zero" | "replace" | "increment" | "decrement" | "invert" | "increment-wrap" | "decrement-wrap";

export interface ScissorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PolygonOffsetState {
  readonly factor: number;
  readonly units: number;
  /**
   * Maximum absolute depth offset (0 = unclamped). WebGPU applies it as the
   * pipeline `depthBiasClamp`; WebGL2 applies it with
   * `EXT_polygon_offset_clamp` and refuses it with `UNSUPPORTED_RENDER_STATE`
   * when the extension is unavailable.
   */
  readonly clamp?: number;
}

export interface StencilState {
  readonly compare?: StencilCompare;
  readonly reference?: number;
  readonly readMask?: number;
  readonly writeMask?: number;
  readonly fail?: StencilOperation;
  readonly depthFail?: StencilOperation;
  readonly depthPass?: StencilOperation;
}

export interface RenderState {
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly cullMode: CullMode;
  readonly blend: boolean;
  readonly depthCompare: DepthCompare;
  /** C-04 (PR 0a/PRD-01): named blend state; wins over `blend` when set. */
  readonly blendMode?: BlendMode;
  /** C-04 (PR 0a/PRD-01): full depth-compare vocabulary; wins over `depthCompare` when set. */
  readonly depthCompareV2?: DepthCompareV2;
  /** @internal Compare/offset already expressed in the active frame depth convention. */
  readonly depthConventionApplied?: boolean;
  /** PR 0a (PRD 04): MSAA alpha-to-coverage; copied into the command state. */
  readonly alphaToCoverage?: boolean;
  readonly colorWrite: ColorWriteMask;
  readonly scissor?: ScissorRect | null;
  readonly polygonOffset?: PolygonOffsetState | null;
  readonly stencil?: StencilState | null;
  /** Front-face winding used with `cullMode` (default counter-clockwise). */
  readonly frontFace?: "ccw" | "cw";
  /**
   * Multisample coverage mask. WebGPU applies any 32-bit mask; WebGL2 can only
   * express all-samples or no-samples and refuses other masks with
   * `UNSUPPORTED_RENDER_STATE`.
   */
  readonly sampleMask?: number;
  /** Constant color for `constant` / `one-minus-constant` blend factors. */
  readonly blendConstant?: readonly [number, number, number, number];
  /** Opt in to depth writes for a blended material (otherwise rejected). */
  readonly blendedDepthWrite?: "allow";
  /**
   * Per-color-attachment overrides for multiple render targets; omitted
   * entries inherit `colorWrite` and `blendMode`. WebGL2 applies them with
   * `OES_draw_buffers_indexed` and refuses them without it.
   */
  readonly colorAttachments?: readonly (RenderColorAttachmentState | undefined)[];
}

/** True when a state uses command-state fields beyond the base material set. */
export function renderStateHasExtendedCommandFields(state: Partial<RenderState>): boolean {
  return (state.frontFace !== undefined && state.frontFace !== "ccw")
    || (state.sampleMask !== undefined && state.sampleMask !== 0xffffffff)
    || (state.blendConstant !== undefined && state.blendConstant.some((value) => value !== 0))
    || state.blendedDepthWrite !== undefined
    || (state.colorAttachments !== undefined && state.colorAttachments.length > 0)
    || ((state.polygonOffset?.clamp ?? 0) !== 0);
}

export type MaterialUniformKind = "any" | "float" | "i32" | "u32" | "bool" | "vec2" | "vec3" | "vec4" | "mat4" | "data" | "texture2d" | "texture3d" | "depth2d" | "textureCube";

export interface MaterialUniformDescriptor {
  readonly name: string;
  readonly kind: MaterialUniformKind;
  /** Portable data schemas are validated and bound only by PortableShaderMaterial. */
  readonly dataType?: ShaderDataType;
  readonly arrayLength?: number;
  readonly required?: boolean;
  /**
   * The engine declares this uniform in the shader on the author's behalf, so the
   * GL compiler may optimise it out of the linked program when the shader never
   * reads it. Its absence from the program is then reported as a non-fatal
   * `[CUSTOM_UNIFORM_UNUSED]` warning instead of failing binding (and skipping the draw).
   */
  readonly optimizable?: boolean;
}

export interface MaterialDescriptor<TUniform extends RecursiveUniformValue = UniformValue> {
  readonly name?: string;
  readonly shaderKey: string;
  readonly shaderVariant?: string;
  readonly renderState?: Partial<RenderState>;
  readonly parameters?: Readonly<Record<string, TUniform>>;
  readonly requiredAttributes?: readonly string[];
  readonly requiredUniforms?: readonly string[];
  readonly uniformSchema?: readonly MaterialUniformDescriptor[];
  /**
   * threejs-parity L7/SR-02: three's `material.fog` — `false` opts the draw
   * out of scene/environment fog (ForwardPass selects a fog-free program on
   * the generated path and binds fog-disabled uniforms on the legacy one).
   * Defaults to true.
   */
  readonly fog?: boolean;
}

export const DEFAULT_RENDER_STATE: RenderState = {
  depthTest: true,
  depthWrite: true,
  cullMode: "back",
  blend: false,
  depthCompare: "less-equal",
  colorWrite: [true, true, true, true],
  scissor: null,
  polygonOffset: null,
  stencil: null
};

export class Material<TUniform extends RecursiveUniformValue = UniformValue> {
  public disposed = false;
  public readonly name: string;
  public readonly shaderKey: string;
  public readonly shaderVariant?: string;
  public readonly renderState: RenderState;
  public readonly requiredAttributes: readonly string[];
  public readonly requiredUniforms: readonly string[];
  public readonly uniformSchema: readonly MaterialUniformDescriptor[];
  /** threejs-parity L7/SR-02: three's `material.fog` (default true). */
  public readonly fog: boolean;
  protected readonly parameters = new Map<string, RecursiveUniformValue>();
  private dirty = true;
  private revision = 0;

  constructor(descriptor: MaterialDescriptor<NoInfer<TUniform>>) {
    if (!descriptor.shaderKey.trim()) {
      throw new Error("Material shaderKey is required");
    }
    this.name = descriptor.name ?? descriptor.shaderKey;
    this.shaderKey = descriptor.shaderKey;
    this.shaderVariant = validateShaderVariant(descriptor.shaderVariant);
    const renderState = { ...DEFAULT_RENDER_STATE, ...(descriptor.renderState ?? {}) };
    // C-04 §6.8: non-opaque blend modes default depthWrite to false.
    if (renderState.blendMode !== undefined && renderState.blendMode !== "opaque" && descriptor.renderState?.depthWrite === undefined) {
      renderState.depthWrite = false;
    }
    this.renderState = validateRenderState(renderState);
    this.requiredAttributes = descriptor.requiredAttributes ?? [];
    this.uniformSchema = validateUniformSchema(descriptor.uniformSchema ?? deriveRequiredUniformSchema(descriptor.requiredUniforms ?? []));
    this.requiredUniforms = descriptor.requiredUniforms ?? this.uniformSchema.filter((uniform) => uniform.required !== false && uniform.optimizable !== true).map((uniform) => uniform.name);
    this.fog = descriptor.fog !== false;
    for (const [key, value] of Object.entries(descriptor.parameters ?? {})) {
      this.setParameter(key, value as TUniform);
    }
  }

  setParameter(name: string, value: TUniform): void {
    this.setParameterValue(name, value);
  }

  /** Shared owned storage; subclasses validate their expanded value type first. */
  protected setParameterValue(name: string, value: RecursiveUniformValue): void {
    this.assertAlive();
    if (!name.trim()) {
      throw new Error("Material parameter name is required");
    }
    const unchanged = flatUniformValuesEqual(this.parameters.get(name), value);
    this.parameters.set(name, cloneUniformValue(value));
    this.dirty = true;
    this.revision += 1;
    // Every set still bumps the revision. A set that stored an identical value leaves the parameter snapshot's
    // contents valid, so it follows the revision instead of being rebuilt (per-draw light writes do this every frame).
    const cached = this.parameterSnapshotCache;
    if (unchanged && cached && cached.revision === this.revision - 1) this.parameterSnapshotCache = { revision: this.revision, values: cached.values };
  }

  getParameter(name: string): TUniform | undefined {
    this.assertAlive();
    const value = this.parameters.get(name);
    return value === undefined ? undefined : cloneUniformValue(value) as TUniform;
  }

  /** Polymorphic consumers must use the recursive surface for portable materials. */
  getRecursiveParameter(name: string): RecursiveUniformValue | undefined {
    return this.getParameter(name);
  }

  getParameters(): ReadonlyMap<string, TUniform> {
    this.assertAlive();
    const output = new Map<string, TUniform>();
    for (const [key, value] of this.parameters) {
      output.set(key, cloneUniformValue(value) as TUniform);
    }
    return output;
  }

  /** Owned snapshots, retaining aggregate values without a legacy-uniform cast. */
  getRecursiveParameters(): ReadonlyMap<string, RecursiveUniformValue> {
    return this.getParameters();
  }

  private parameterSnapshotCache: { readonly revision: number; readonly values: ReadonlyMap<string, RecursiveUniformValue> } | undefined;

  /**
   * Renderer read path: one owned copy of `getRecursiveParameters()`, shared by every draw until the next
   * parameter change (revision). Per-draw binding must not clone every value every frame. Treat as read-only.
   */
  parameterSnapshot(): ReadonlyMap<string, RecursiveUniformValue> {
    this.assertAlive();
    const cached = this.parameterSnapshotCache;
    if (cached && cached.revision === this.revision) return cached.values;
    const values = this.getRecursiveParameters();
    this.parameterSnapshotCache = { revision: this.revision, values };
    return values;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * C-02 (PRD-01): the feature record this material contributes to a program
   * key. Default derives maps/lighting/alphaMode/skinning/instancing from
   * parameters via `program/MaterialFeatures.defaultProgramFeatures`;
   * subclasses may override for material-specific bits. Lights/shadows/
   * environment/fog/pass/target/backgroundCoverage are supplied by the pass.
   */
  programFeatures(ctx: import("./contracts/materialLobes").MaterialFeatureContext): Omit<import("./contracts/program").ProgramFeatures, "lights" | "shadows" | "environment" | "fog" | "pass" | "target" | "backgroundCoverage"> {
    return defaultProgramFeatures(this as unknown as Material, ctx);
  }

  getRevision(): number {
    return this.revision;
  }

  markClean(): void {
    this.assertAlive();
    this.dirty = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.parameters.clear();
    this.parameterSnapshotCache = undefined;
    this.dirty = false;
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error(`Material ${this.name} is disposed`);
    }
  }
}

function validateShaderVariant(variant: string | undefined): string | undefined {
  if (variant === undefined) return undefined;
  const trimmed = variant.trim();
  if (!trimmed) {
    throw new Error("Material shaderVariant must be non-empty when provided");
  }
  return trimmed;
}

export function validateRenderState(state: RenderState): RenderState {
  const blends = state.blend || (state.blendMode !== undefined && state.blendMode !== "opaque");
  // Extended command-state fields share the device contract's validation.
  validateRenderCommandState({
    depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal",
    ...(state.frontFace !== undefined ? { frontFace: state.frontFace } : {}),
    ...(state.sampleMask !== undefined ? { sampleMask: state.sampleMask } : {}),
    ...(state.blendConstant !== undefined ? { blendConstant: state.blendConstant } : {}),
    ...(state.blendedDepthWrite !== undefined ? { blendedDepthWrite: state.blendedDepthWrite } : {}),
    ...(state.colorAttachments !== undefined ? { colorAttachments: state.colorAttachments } : {}),
    ...(state.polygonOffset ? { polygonOffset: state.polygonOffset } : {})
  } satisfies RenderCommandState);
  if (blends && state.depthWrite && state.blendedDepthWrite !== "allow") {
    throw new Error("Transparent blended materials must disable depthWrite");
  }
  if (state.scissor) {
    if (state.scissor.width < 0 || state.scissor.height < 0) {
      throw new Error("RenderState scissor width and height must be non-negative");
    }
  }
  if (state.stencil) {
    const reference = state.stencil.reference ?? 0;
    if (!Number.isInteger(reference) || reference < 0) {
      throw new Error("RenderState stencil reference must be a non-negative integer");
    }
  }
  return state;
}

function deriveRequiredUniformSchema(requiredUniforms: readonly string[]): readonly MaterialUniformDescriptor[] {
  return requiredUniforms.map((name) => ({ name, kind: "any", required: true }));
}

function validateUniformSchema(schema: readonly MaterialUniformDescriptor[]): readonly MaterialUniformDescriptor[] {
  const seen = new Set<string>();
  return schema.map((uniform) => {
    if (!uniform.name.trim()) {
      throw new Error("Material uniform schema name is required");
    }
    if (seen.has(uniform.name)) {
      throw new Error(`Duplicate material uniform schema entry: ${uniform.name}`);
    }
    seen.add(uniform.name);
    return { ...uniform, required: uniform.required ?? true };
  });
}

function cloneUniformValue(value: RecursiveUniformValue): RecursiveUniformValue {
  if (isTextureBinding(value)) return value;
  // Flat values (every legacy uniform) need no cycle tracking; the generic walk below is for nested data.
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Float32Array) return new Float32Array(value);
  if (value instanceof Int32Array) return new Int32Array(value);
  if (value instanceof Uint32Array) return new Uint32Array(value);
  if (Array.isArray(value) && isFlatNumberArray(value)) return value.slice();
  const active = new Set<object>();
  function clone(input: UniformDataValue, depth: number): UniformDataValue {
    if (typeof input === "number" || typeof input === "boolean") return input;
    if (!input || typeof input !== "object" || depth > 128 || active.has(input)) {
      throw new TypeError("Material uniform data must be an acyclic numeric, boolean, array, or plain object value");
    }
    if (input instanceof Float32Array) return new Float32Array(input);
    if (input instanceof Int32Array) return new Int32Array(input);
    if (input instanceof Uint32Array) return new Uint32Array(input);
    if (ArrayBuffer.isView(input)) throw new TypeError("Material uniform data has an unsupported typed array");
    active.add(input);
    try {
      if (Array.isArray(input)) return input.map((entry) => clone(entry, depth + 1));
      if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
        throw new TypeError("Material uniform data must use plain objects");
      }
      const result: Record<string, UniformDataValue> = Object.create(null);
      for (const [key, entry] of Object.entries(input)) result[key] = clone(entry, depth + 1);
      return result;
    } finally {
      active.delete(input);
    }
  }
  return clone(value, 0);
}

/** Exact equality for numbers and flat numeric (typed) arrays of the same kind; other values are never equal. */
export function flatUniformValuesEqual(current: RecursiveUniformValue | undefined, next: RecursiveUniformValue): boolean {
  if (current === undefined) return false;
  if (typeof next === "number") return current === next;
  const sameKind = (next instanceof Float32Array && current instanceof Float32Array)
    || (next instanceof Int32Array && current instanceof Int32Array)
    || (next instanceof Uint32Array && current instanceof Uint32Array)
    || (Array.isArray(next) && Array.isArray(current) && isFlatNumberArray(next) && isFlatNumberArray(current));
  if (!sameKind) return false;
  const a = current as ArrayLike<number>, b = next as ArrayLike<number>;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.is(a[index], b[index])) return false;
  }
  return true;
}

function isFlatNumberArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "number") return false;
  }
  return true;
}
