import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { TextureBinding } from "./TextureBinding";

export interface MaterialBindingResult {
  readonly shader: RenderShaderProgram;
  readonly uniforms: ReadonlyMap<string, UniformValue>;
  readonly diagnostics: readonly string[];
  readonly warnings: readonly string[];
}

export class MaterialBinding {
  bind(materialLike: Material | MaterialInstance, shader: RenderShaderProgram): MaterialBindingResult {
    const material = materialLike instanceof MaterialInstance ? materialLike.baseMaterial : materialLike;
    const uniforms = materialLike.getParameters();
    const diagnostics: string[] = [];
    const warnings: string[] = [];

    for (const attribute of material.requiredAttributes) {
      if (!shader.reflection.attributes.has(attribute)) {
        diagnostics.push(`Missing shader attribute: ${attribute}`);
      }
    }
    for (const uniform of material.requiredUniforms) {
      if (!shader.reflection.uniforms.has(uniform)) {
        diagnostics.push(`Missing shader uniform: ${uniform}`);
      }
      if (!uniforms.has(uniform)) {
        diagnostics.push(`Missing material parameter: ${uniform}`);
      }
    }
    for (const uniform of material.uniformSchema) {
      if (uniform.required !== false && !shader.reflection.uniforms.has(uniform.name)) {
        diagnostics.push(`Missing shader uniform declared by material schema: ${uniform.name}`);
      }
      const value = uniforms.get(uniform.name);
      if (value === undefined) {
        if (uniform.required !== false) {
          diagnostics.push(`Missing material parameter declared by schema: ${uniform.name}`);
        }
        continue;
      }
      const typeDiagnostic = validateUniformSchemaValue(uniform.name, uniform.kind, value);
      if (typeDiagnostic) {
        diagnostics.push(typeDiagnostic);
      }
    }
    for (const [name, value] of uniforms) {
      if (value instanceof TextureBinding) {
        const validation = value.validate();
        diagnostics.push(...validation.diagnostics);
        warnings.push(...validation.warnings);
      } else {
        const valueDiagnostics = uniformValueDiagnostics(name, value);
        if (valueDiagnostics.length > 0) {
          diagnostics.push(...valueDiagnostics);
        }
      }
    }
    if (diagnostics.length > 0) {
      throw new MaterialBindingError("Material binding validation failed", diagnostics);
    }
    return { shader, uniforms, diagnostics: warnings, warnings };
  }
}

export class MaterialBindingError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: readonly string[]
  ) {
    super(message);
    this.name = "MaterialBindingError";
  }
}

function uniformValueDiagnostics(name: string, value: unknown): readonly string[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? [] : [`Unsupported uniform value for ${name}: non-finite number`];
  }
  if (ArrayBuffer.isView(value)) {
    const values = Array.from(value as Float32Array | Int32Array | Uint32Array);
    return values.every(Number.isFinite) ? [] : [`Unsupported uniform value for ${name}: typed array contains non-finite values`];
  }
  if (Array.isArray(value)) {
    return value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
      ? []
      : [`Unsupported uniform value for ${name}: array must contain finite numbers`];
  }
  return [`Unsupported uniform value for ${name}`];
}

function validateUniformSchemaValue(name: string, kind: string, value: UniformValue): string | null {
  if (kind === "any") {
    return null;
  }
  if (kind === "texture2d") {
    return value instanceof TextureBinding ? null : `Material uniform ${name} must be texture2d`;
  }
  if (value instanceof TextureBinding) {
    return `Material uniform ${name} must be ${kind}, got texture2d`;
  }
  const numbers = typeof value === "number"
    ? [value]
    : ArrayBuffer.isView(value)
      ? Array.from(value as Float32Array | Int32Array | Uint32Array)
      : Array.from(value);
  const expected = scalarCount(kind);
  if (numbers.length !== expected) {
    return `Material uniform ${name} must be ${kind} with ${expected} scalar values, got ${numbers.length}`;
  }
  return numbers.every(Number.isFinite) ? null : `Material uniform ${name} must contain finite ${kind} scalar values`;
}

function scalarCount(kind: string): number {
  switch (kind) {
    case "float":
      return 1;
    case "vec2":
      return 2;
    case "vec3":
      return 3;
    case "vec4":
      return 4;
    case "mat4":
      return 16;
    default:
      return 0;
  }
}
