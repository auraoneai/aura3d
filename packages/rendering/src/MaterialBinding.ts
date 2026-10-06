import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { TextureBinding, isTextureBinding } from "./TextureBinding";
import type { ProgramFeatures } from "./contracts/program";

/** C-02 (PRD-01 §8.5): material parameter → generated-program uniform renames.
 * Generated programs name samplers `u_*Map` and read `u_specularIntensity`;
 * the legacy parameter names stay untouched for flag-off parity. */
const GENERATED_UNIFORM_RENAMES: Readonly<Record<string, string>> = {
  u_baseColorTexture: "u_baseColorMap",
  u_normalTexture: "u_normalMap",
  u_metallicRoughnessTexture: "u_metallicRoughnessMap",
  u_occlusionTexture: "u_occlusionMap",
  u_emissiveTexture: "u_emissiveMap",
  u_specularFactor: "u_specularIntensity"
};

/** Map slot (ProgramFeatures.maps) → generated sampler name. */
const GENERATED_MAP_SAMPLERS: Readonly<Record<string, string>> = {
  baseColor: "u_baseColorMap",
  normal: "u_normalMap",
  metallicRoughness: "u_metallicRoughnessMap",
  occlusion: "u_occlusionMap",
  emissive: "u_emissiveMap"
};

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
      if (isTextureBinding(value)) {
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

  /**
   * C-02 (PRD-01 §8.5): bind a material against a generated program. The
   * frozen `requiredUniforms`/`uniformSchema` names (u_modelViewProjection,
   * instancing uniforms, u_roundPoints) do not exist in generated programs —
   * transforms come from the AuraFrame UBO plus per-item u_modelMatrix /
   * u_geometryMatrix — so this validates material-owned generated uniforms
   * and renames parameters instead of replaying the legacy checks.
   */
  bindGenerated(materialLike: Material | MaterialInstance, shader: RenderShaderProgram, features?: ProgramFeatures): MaterialBindingResult {
    const material = materialLike instanceof MaterialInstance ? materialLike.baseMaterial : materialLike;
    const uniforms = new Map<string, UniformValue>();
    const diagnostics: string[] = [];
    const warnings: string[] = [];

    for (const [name, value] of materialLike.getParameters()) {
      const renamed = GENERATED_UNIFORM_RENAMES[name];
      if (renamed && isTextureBinding(value)) {
        uniforms.set(renamed, new TextureBinding({
          name: renamed,
          texture: value.texture,
          sampler: value.sampler,
          required: value.required,
          ready: value.ready,
          expectedColorSpace: value.expectedColorSpace,
          expectedDimension: value.expectedDimension,
          transform: { offset: value.offset, scale: value.scale, rotation: value.rotation }
        }));
      } else {
        uniforms.set(renamed ?? name, value);
      }
    }

    for (const attribute of material.requiredAttributes) {
      if (!shader.reflection.attributes.has(attribute)) {
        diagnostics.push(`Missing shader attribute: ${attribute}`);
      }
    }
    // Shader reflection is define-blind, so map-sampler presence is checked
    // from the feature record (an enabled slot must have a bound texture).
    for (const [slot, sampler] of Object.entries(GENERATED_MAP_SAMPLERS)) {
      const f = features?.maps[slot as keyof ProgramFeatures["maps"]];
      if (f && !uniforms.has(sampler)) {
        diagnostics.push(`Missing material parameter for generated uniform: ${sampler}`);
      }
    }
    for (const [name, value] of uniforms) {
      if (isTextureBinding(value)) {
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
    super(`${message}: ${diagnostics.join("; ")}`);
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
  if (kind === "texture2d" || kind === "textureCube") {
    return isTextureBinding(value) ? null : `Material uniform ${name} must be ${kind}`;
  }
  if (isTextureBinding(value)) {
    return `Material uniform ${name} must be ${kind}, got texture binding`;
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
