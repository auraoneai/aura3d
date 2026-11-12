import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { PortableShaderMaterial } from "./PortableShaderMaterial";
import { type RecursiveUniformValue, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { TextureBinding, isTextureBinding } from "./TextureBinding";
import type { ProgramFeatures } from "./contracts/program";
import { dfgLutBinding } from "./program/DFGLut";
import { reflectsUniformRoot } from "./webgl2/UniformDataFlatten";

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
  emissive: "u_emissiveMap",
  diffuseRoughness: "u_diffuseRoughnessTexture",
  bump: "u_bumpTexture"
};

const GENERATED_MAP_SAMPLER_ENTRIES: readonly (readonly [keyof ProgramFeatures["maps"], string])[] = [
  ["baseColor", "u_baseColorMap"],
  ["normal", "u_normalMap"],
  ["metallicRoughness", "u_metallicRoughnessMap"],
  ["occlusion", "u_occlusionMap"],
  ["emissive", "u_emissiveMap"],
  ["diffuseRoughness", "u_diffuseRoughnessTexture"],
  ["bump", "u_bumpTexture"]
];

function generatedMapsMask(maps: ProgramFeatures["maps"] | undefined): number {
  if (!maps) return 0;
  let mask = 0;
  for (let i = 0; i < GENERATED_MAP_SAMPLER_ENTRIES.length; i += 1) {
    if (maps[GENERATED_MAP_SAMPLER_ENTRIES[i]![0]]) mask |= (1 << i);
  }
  return mask;
}

interface CachedGeneratedBinding {
  readonly hasDfgLut: boolean;
  readonly mapsMask: number;
  readonly entries: readonly (readonly [string, UniformValue])[];
  readonly textures: readonly TextureBinding[];
  readonly warnings: readonly string[];
}

const generatedBindingMemo = new WeakMap<ReadonlyMap<string, RecursiveUniformValue>, CachedGeneratedBinding[]>();

export interface MaterialBindingResult<T extends RecursiveUniformValue = UniformValue> {
  readonly shader: RenderShaderProgram;
  readonly uniforms: ReadonlyMap<string, T>;
  readonly diagnostics: readonly string[];
  readonly warnings: readonly string[];
}

export class MaterialBinding {
  /** Bind schema-validated recursive values for an explicitly capable portable backend. */
  bindRecursive(materialLike: Material<RecursiveUniformValue> | MaterialInstance, shader: RenderShaderProgram): MaterialBindingResult<RecursiveUniformValue> {
    const material = materialLike instanceof MaterialInstance ? materialLike.baseMaterial : materialLike;
    const uniforms = new Map(materialLike.getRecursiveParameters());
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
    const isData = (name: string): boolean => material.uniformSchema.some((uniform) => uniform.name === name && uniform.kind === "data");
    for (const uniform of material.requiredUniforms) {
      // A struct/array data uniform reflects only its GL leaves (`u_data.field`).
      if (isData(uniform) ? !reflectsUniformRoot(shader.reflection.uniforms, uniform) : !shader.reflection.uniforms.has(uniform)) {
        diagnostics.push(`Missing shader uniform: ${uniform}`);
      }
      if (!uniforms.has(uniform)) {
        diagnostics.push(`Missing material parameter: ${uniform}`);
      }
    }
    const optimizedOut: string[] = [];
    for (const uniform of material.uniformSchema) {
      const reflected = uniform.kind === "data"
        ? reflectsUniformRoot(shader.reflection.uniforms, uniform.name) : shader.reflection.uniforms.has(uniform.name);
      if (!reflected) {
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
      const typeDiagnostic = material instanceof PortableShaderMaterial
        ? material.uniformValueDiagnostic(uniform.name, value)
        : validateUniformSchemaValue(uniform.name, uniform.kind, value);
      if (typeDiagnostic) {
        diagnostics.push(typeDiagnostic);
      }
    }
    for (const [name, value] of uniforms) {
      if (isTextureBinding(value)) {
        const validation = value.validate();
        diagnostics.push(...validation.diagnostics);
        warnings.push(...validation.warnings);
      } else if (!(material instanceof PortableShaderMaterial && material.uniformSchema.some((uniform) => uniform.name === name))) {
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
    // Legacy PBR programs declare both optional detail samplers. Bind the
    // device's neutral 2D fallback when a map is absent so the sampler cannot
    // accidentally alias a cube-map unit, without allocating a material texture.
    for (const name of ["u_diffuseRoughnessTexture", "u_bumpTexture"]) {
      if (shader.reflection.uniforms.has(name) && !uniforms.has(name)) {
        uniforms.set(name, new TextureBinding({ name, required: false, expectedDimension: "2d", expectedColorSpace: "linear" }));
      }
    }
    return { shader, uniforms, diagnostics: warnings, warnings };
  }

  /** The established flat binding contract; reject rather than flatten portable data. */
  bind(materialLike: Material<RecursiveUniformValue> | MaterialInstance, shader: RenderShaderProgram): MaterialBindingResult {
    const result = this.bindRecursive(materialLike, shader);
    const material = materialLike instanceof MaterialInstance ? materialLike.baseMaterial : materialLike;
    const data = material instanceof PortableShaderMaterial
      ? material.uniformSchema.find((uniform) => uniform.kind === "data") : undefined;
    if (data) throw new MaterialBindingError("Material binding validation failed", [`WebGL legacy drawing cannot bind portable data uniform ${data.name}`]);
    const uniforms = new Map<string, UniformValue>();
    for (const [name, value] of result.uniforms) {
      if (!isFlatUniformValue(value)) {
        throw new MaterialBindingError("Material binding validation failed", [`Legacy drawing cannot bind structured uniform ${name}`]);
      }
      uniforms.set(name, value);
    }
    return { ...result, uniforms };
  }

  /** Compatibility alias for callers that explicitly request a flat binding. */
  bindLegacy(materialLike: Material<RecursiveUniformValue> | MaterialInstance, shader: RenderShaderProgram): MaterialBindingResult {
    return this.bind(materialLike, shader);
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
    if (material instanceof PortableShaderMaterial && material.uniformSchema.some((uniform) => uniform.kind === "data")) {
      const values = materialLike.getRecursiveParameters();
      for (const uniform of material.uniformSchema) {
        const value = values.get(uniform.name);
        if (value !== undefined) {
          const diagnostic = material.uniformValueDiagnostic(uniform.name, value);
          if (diagnostic) throw new MaterialBindingError("Material binding validation failed", [diagnostic]);
        }
      }
      throw new MaterialBindingError("Material binding validation failed", ["Generated programs do not support portable uniform data schemas"]);
    }
    const hasDfgLut = shader.reflection.uniforms.has("u_dfgLut");
    const extensions = features?.extensions;
    const canMemo = !(material instanceof PortableShaderMaterial)
      && (!into || into.size === 0)
      && (!extensions || extensions.length === 0 || extensions.every((ext) => ext.maps.length === 0));
    const parameters = materialParameterSnapshot(materialLike);
    const mapsMask = generatedMapsMask(features?.maps);
    if (canMemo) {
      const bucket = generatedBindingMemo.get(parameters);
      if (bucket) {
        for (let b = 0; b < bucket.length; b += 1) {
          const hit = bucket[b]!;
          if (hit.hasDfgLut !== hasDfgLut || hit.mapsMask !== mapsMask) continue;
          let disposedAny = false;
          for (let t = 0; t < hit.textures.length; t += 1) {
            if (hit.textures[t]!.texture?.disposed) {
              disposedAny = true;
              break;
            }
          }
          if (disposedAny) break;
          const out = into ?? new Map<string, UniformValue>();
          const entries = hit.entries;
          for (let i = 0; i < entries.length; i += 1) {
            const pair = entries[i]!;
            out.set(pair[0], pair[1]);
          }
          return { shader, uniforms: out, diagnostics: hit.warnings, warnings: hit.warnings };
        }
      }
    }

    const uniforms = into ?? new Map<string, UniformValue>();
    const diagnostics: string[] = [];
    const warnings: string[] = [];

    // 01-DFG: every generated program with the lane-01 brdf chunk samples the
    // renderer-owned Aura DFG LUT (DFGLutData.ts; one texture, uploaded once per device).
    if (hasDfgLut) {
      uniforms.set("u_dfgLut", dfgLutBinding());
    }

    // forEach, not for-of: entry destructuring allocates per parameter on every draw.
    parameters.forEach((value, name) => {
      if (!isFlatUniformValue(value)) {
        diagnostics.push(`Generated programs cannot bind structured uniform ${name}`);
        return;
      }
      const renamed = GENERATED_UNIFORM_RENAMES[name];
      if (renamed && isTextureBinding(value)) {
        uniforms.set(renamed, renamedTextureBinding(value, renamed));
      } else {
        uniforms.set(renamed ?? name, value);
      }
    });
    if (features?.maps.occlusion && !uniforms.has("u_occlusionStrength")) uniforms.set("u_occlusionStrength", 1);

    // Core map transforms travel with the texture binding for materials that
    // do not expose separate fields. Explicit live fields take precedence.
    for (const [name, offsetName, scaleName, rotationName] of CORE_TEXTURE_TRANSFORM_UNIFORMS) {
      const value = parameters.get(name);
      if (!isTextureBinding(value)) continue;
      if (!uniforms.has(offsetName)) uniforms.set(offsetName, value.offset);
      if (!uniforms.has(scaleName)) uniforms.set(scaleName, value.scale);
      if (!uniforms.has(rotationName)) uniforms.set(rotationName, value.rotation);
    }

    // Lobe maps use a mat3 so descriptor-backed and live bindings share the
    // same complete transform, while changing a transform never recompiles.
    for (const ext of extensions ?? []) {
      for (const slot of ext.maps) {
        const name = `u_${slot}Texture`;
        const value = parameters.get(name);
        if (!isTextureBinding(value)) continue;
        const offset = uniforms.get(`${name}Offset`) ?? value.offset;
        const scale = uniforms.get(`${name}Scale`) ?? value.scale;
        const rotation = uniforms.get(`${name}Rotation`) ?? value.rotation;
        if ((!Array.isArray(offset) && !(offset instanceof Float32Array)) ||
            (!Array.isArray(scale) && !(scale instanceof Float32Array)) || typeof rotation !== "number") continue;
        const c = Math.cos(rotation), s = Math.sin(rotation);
        uniforms.set(`${name}UvTransform`, new Float32Array([
          c * scale[0]!, s * scale[0]!, 0,
          -s * scale[1]!, c * scale[1]!, 0,
          offset[0]!, offset[1]!, 1
        ]));
      }
    }

    for (let i = 0; i < GENERATED_MAP_SAMPLER_ENTRIES.length; i += 1) {
      const [slot, sampler] = GENERATED_MAP_SAMPLER_ENTRIES[i]!;
      if (features?.maps[slot] && !uniforms.has(sampler)) {
        diagnostics.push(`Missing material parameter for generated uniform: ${sampler}`);
      }
    }
    // Generated programs intentionally ignore legacy schemas, but a portable
    // material's authored data schema is still authoritative for overrides.
    if (material instanceof PortableShaderMaterial) {
      for (const uniform of material.uniformSchema) {
        const value = uniforms.get(GENERATED_UNIFORM_RENAMES[uniform.name] ?? uniform.name);
        if (value === undefined) {
          if (uniform.required !== false) diagnostics.push(`Missing material parameter declared by schema: ${uniform.name}`);
          continue;
        }
        const diagnostic = material.uniformValueDiagnostic(uniform.name, value);
        if (diagnostic) diagnostics.push(diagnostic);
      }
    }
    const boundTextures: TextureBinding[] = [];
    uniforms.forEach((value, name) => {
      if (isTextureBinding(value)) {
        boundTextures.push(value);
        const validation = value.validate();
        if (validation.diagnostics.length > 0) diagnostics.push(...validation.diagnostics);
        if (validation.warnings.length > 0) warnings.push(...validation.warnings);
      } else if (!(material instanceof PortableShaderMaterial && material.uniformSchema.some((uniform) =>
        (GENERATED_UNIFORM_RENAMES[uniform.name] ?? uniform.name) === name))) {
        const valueDiagnostics = uniformValueDiagnostics(name, value);
        if (valueDiagnostics.length > 0) {
          diagnostics.push(...valueDiagnostics);
        }
      }
    });
    if (diagnostics.length > 0) {
      throw new MaterialBindingError("Material binding validation failed", diagnostics);
    }
    if (canMemo) {
      const entry: CachedGeneratedBinding = {
        hasDfgLut,
        mapsMask,
        entries: Array.from(uniforms.entries()),
        textures: boundTextures,
        warnings
      };
      const bucket = generatedBindingMemo.get(parameters);
      if (!bucket) generatedBindingMemo.set(parameters, [entry]);
      else if (bucket.length < 4) bucket.push(entry);
      else bucket[0] = entry;
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

/** The legacy draw path accepts only numeric scalars, flat numeric vectors, and textures. */
export function isFlatUniformValue(value: RecursiveUniformValue): value is UniformValue {
  return typeof value === "number" || isTextureBinding(value)
    || value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array
    || (Array.isArray(value) && value.every((entry) => typeof entry === "number"));
}

const NO_DIAGNOSTICS: readonly string[] = Object.freeze([]);

/** Generated-name copy of a material texture binding; bindings are immutable, so one copy per (binding, name). */
const renamedTextureBindings = new WeakMap<TextureBinding, { readonly name: string; readonly binding: TextureBinding }>();
function renamedTextureBinding(value: TextureBinding, renamed: string): TextureBinding {
  const cached = renamedTextureBindings.get(value);
  if (cached && cached.name === renamed) return cached.binding;
  const binding = new TextureBinding({
    name: renamed,
    texture: value.texture,
    sampler: value.sampler,
    required: value.required,
    ready: value.ready,
    expectedColorSpace: value.expectedColorSpace,
    expectedDimension: value.expectedDimension,
    transform: { offset: value.offset, scale: value.scale, rotation: value.rotation }
  });
  renamedTextureBindings.set(value, { name: renamed, binding });
  return binding;
}

const CORE_TEXTURE_TRANSFORM_UNIFORMS: readonly (readonly [string, string, string, string])[] =
  ["u_baseColorTexture", "u_normalTexture", "u_metallicRoughnessTexture", "u_occlusionTexture", "u_emissiveTexture"]
    .map((name) => [name, `${name}Offset`, `${name}Scale`, `${name}Rotation`] as const);

/** Per-revision parameter snapshot when the material provides one (Material, MaterialInstance); else the owned copy. */
function materialParameterSnapshot(materialLike: Material | MaterialInstance): ReadonlyMap<string, RecursiveUniformValue> {
  const source = materialLike as { parameterSnapshot?: () => ReadonlyMap<string, RecursiveUniformValue> };
  return typeof source.parameterSnapshot === "function" ? source.parameterSnapshot() : materialLike.getRecursiveParameters();
}

function uniformValueDiagnostics(name: string, value: unknown): readonly string[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? NO_DIAGNOSTICS : [`Unsupported uniform value for ${name}: non-finite number`];
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as ArrayLike<number>;
    for (let index = 0; index < view.length; index += 1) {
      if (!Number.isFinite(view[index])) return [`Unsupported uniform value for ${name}: typed array contains non-finite values`];
    }
    return NO_DIAGNOSTICS;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) continue; // holes, as Array#every skips them
      const entry: unknown = value[index];
      if (typeof entry !== "number" || !Number.isFinite(entry)) return [`Unsupported uniform value for ${name}: array must contain finite numbers`];
    }
    return NO_DIAGNOSTICS;
  }
  return [`Unsupported uniform value for ${name}`];
}

function validateUniformSchemaValue(name: string, kind: string, value: RecursiveUniformValue): string | null {
  if (kind === "any") {
    return null;
  }
  if (kind === "texture2d" || kind === "texture3d" || kind === "depth2d" || kind === "textureCube") {
    if (!isTextureBinding(value)) return `Material uniform ${name} must be ${kind}`;
    if ((kind === "texture3d" || kind === "depth2d") && !value.texture) return `Material uniform ${name} requires a bound ${kind} texture`;
    if (value.texture && kind === "texture3d" && value.texture.dimension !== "3d") return `Material uniform ${name} must be a 3d texture`;
    if (value.texture && kind === "depth2d" && (value.texture.dimension !== "2d" || value.texture.format !== "depth24")) return `Material uniform ${name} must be a 2d depth texture`;
    return null;
  }
  if (isTextureBinding(value)) {
    return `Material uniform ${name} must be ${kind}, got texture binding`;
  }
  if (kind === "u32") {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
      ? null : `Material uniform ${name} must be a u32 integer between 0 and 4294967295`;
  }
  if (kind === "i32") {
    return typeof value === "number" && Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff
      ? null : `Material uniform ${name} must be an i32 integer between -2147483648 and 2147483647`;
  }
  if (kind === "bool") return value === 0 || value === 1 ? null : `Material uniform ${name} must be a boolean encoded as 0 or 1`;
  if (kind === "data") return `Material uniform ${name} needs a portable data schema`;
  const numbers = typeof value === "number"
    ? [value]
    : value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array
      ? Array.from(value)
      : Array.isArray(value) && value.every((entry) => typeof entry === "number")
        ? value
        : null;
  const expected = scalarCount(kind);
  if (!numbers || numbers.length !== expected) {
    return `Material uniform ${name} must be ${kind} with ${expected} scalar values, got ${numbers?.length ?? 0}`;
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
