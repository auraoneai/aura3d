import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { PortableShaderMaterial } from "./PortableShaderMaterial";
import { type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { TextureBinding, isTextureBinding } from "./TextureBinding";
import type { ProgramFeatures } from "./contracts/program";
import { dfgLutBinding } from "./program/DFGLut";

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

    const unusedAttributes: string[] = [];
    for (const attribute of material.requiredAttributes) {
      if (!shader.reflection.attributes.has(attribute)) {
        // A custom shader may declare a vertex attribute it never reads; the GL
        // compiler drops it from the active set, exactly like three.js ignores it.
        if (material instanceof PortableShaderMaterial && attribute !== "a_position") unusedAttributes.push(attribute);
        else diagnostics.push(`Missing shader attribute: ${attribute}`);
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
    const optimizedOut: string[] = [];
    for (const uniform of material.uniformSchema) {
      if (!shader.reflection.uniforms.has(uniform.name)) {
        if (uniform.optimizable === true) optimizedOut.push(uniform.name);
        else if (uniform.required !== false) diagnostics.push(`Missing shader uniform declared by material schema: ${uniform.name}`);
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
    if (unusedAttributes.length > 0) {
      warnings.push(`[CUSTOM_ATTRIBUTE_UNUSED] material "${material.name}": declared attribute(s) ${unusedAttributes.join(", ")} not active in the linked program (unused or optimised out); not bound`);
    }
    if (optimizedOut.length > 0) {
      warnings.push(`[CUSTOM_UNIFORM_UNUSED] material "${material.name}": declared uniform(s) ${optimizedOut.join(", ")} not active in the linked program (unused or optimised out); not uploaded`);
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
  bindGenerated(materialLike: Material | MaterialInstance, shader: RenderShaderProgram, features?: ProgramFeatures, into?: Map<string, UniformValue>): MaterialBindingResult {
    const material = materialLike instanceof MaterialInstance ? materialLike.baseMaterial : materialLike;
    const uniforms = into ?? new Map<string, UniformValue>();
    const diagnostics: string[] = [];
    const warnings: string[] = [];

    // 01-DFG: every generated program with the lane-01 brdf chunk samples the
    // renderer-owned r185 DFG LUT (one texture, uploaded once per device).
    if (shader.reflection.uniforms.has("u_dfgLut")) {
      uniforms.set("u_dfgLut", dfgLutBinding());
    }

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

    // #867: `material.requiredAttributes` describes the frozen legacy shader's
    // inputs. It is NOT the generated program's contract: a generated program
    // may legitimately not consume an attribute the geometry carries
    // (tangents → derivative TBN; uv when the record has no maps; on WebGL2 an
    // unused attribute is also optimized out of the active-attribute
    // reflection), exactly like three.js ignores unused geometry attributes.
    // Geometry ⊇ material.requiredAttributes is still enforced by
    // ForwardPass `validateMaterialGeometryContract` + RenderPipeline.
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
    const view = value as unknown as ArrayLike<number>;
    for (let index = 0; index < view.length; index += 1) {
      if (!Number.isFinite(view[index])) return [`Unsupported uniform value for ${name}: typed array contains non-finite values`];
    }
    return [];
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
