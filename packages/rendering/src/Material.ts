import { type UniformValue } from "./RenderDevice";
import { TextureBinding } from "./TextureBinding";

export type CullMode = "none" | "back" | "front";
export type DepthCompare = "always" | "less-equal";

export interface RenderState {
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly cullMode: CullMode;
  readonly blend: boolean;
  readonly depthCompare: DepthCompare;
}

export type MaterialUniformKind = "any" | "float" | "vec2" | "vec3" | "vec4" | "mat4" | "texture2d";

export interface MaterialUniformDescriptor {
  readonly name: string;
  readonly kind: MaterialUniformKind;
  readonly required?: boolean;
}

export interface MaterialDescriptor {
  readonly name?: string;
  readonly shaderKey: string;
  readonly renderState?: Partial<RenderState>;
  readonly parameters?: Readonly<Record<string, UniformValue>>;
  readonly requiredAttributes?: readonly string[];
  readonly requiredUniforms?: readonly string[];
  readonly uniformSchema?: readonly MaterialUniformDescriptor[];
}

export const DEFAULT_RENDER_STATE: RenderState = {
  depthTest: true,
  depthWrite: true,
  cullMode: "back",
  blend: false,
  depthCompare: "less-equal"
};

export class Material {
  public readonly name: string;
  public readonly shaderKey: string;
  public readonly renderState: RenderState;
  public readonly requiredAttributes: readonly string[];
  public readonly requiredUniforms: readonly string[];
  public readonly uniformSchema: readonly MaterialUniformDescriptor[];
  protected readonly parameters = new Map<string, UniformValue>();
  private dirty = true;
  private revision = 0;

  constructor(descriptor: MaterialDescriptor) {
    if (!descriptor.shaderKey.trim()) {
      throw new Error("Material shaderKey is required");
    }
    this.name = descriptor.name ?? descriptor.shaderKey;
    this.shaderKey = descriptor.shaderKey;
    this.renderState = validateRenderState({ ...DEFAULT_RENDER_STATE, ...(descriptor.renderState ?? {}) });
    this.requiredAttributes = descriptor.requiredAttributes ?? [];
    this.uniformSchema = validateUniformSchema(descriptor.uniformSchema ?? deriveRequiredUniformSchema(descriptor.requiredUniforms ?? []));
    this.requiredUniforms = descriptor.requiredUniforms ?? this.uniformSchema.filter((uniform) => uniform.required !== false).map((uniform) => uniform.name);
    for (const [key, value] of Object.entries(descriptor.parameters ?? {})) {
      this.setParameter(key, value);
    }
  }

  setParameter(name: string, value: UniformValue): void {
    if (!name.trim()) {
      throw new Error("Material parameter name is required");
    }
    this.parameters.set(name, cloneUniformValue(value));
    this.dirty = true;
    this.revision += 1;
  }

  getParameter(name: string): UniformValue | undefined {
    const value = this.parameters.get(name);
    return value === undefined ? undefined : cloneUniformValue(value);
  }

  getParameters(): ReadonlyMap<string, UniformValue> {
    const output = new Map<string, UniformValue>();
    for (const [key, value] of this.parameters) {
      output.set(key, cloneUniformValue(value));
    }
    return output;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  getRevision(): number {
    return this.revision;
  }

  markClean(): void {
    this.dirty = false;
  }
}

export function validateRenderState(state: RenderState): RenderState {
  if (state.blend && state.depthWrite) {
    throw new Error("Transparent blended materials must disable depthWrite");
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

function cloneUniformValue(value: UniformValue): UniformValue {
  if (typeof value === "number") {
    return value;
  }
  if (value instanceof TextureBinding) {
    return value;
  }
  return ArrayBuffer.isView(value) ? new (value.constructor as Float32ArrayConstructor)(value as Float32Array) : [...value];
}
