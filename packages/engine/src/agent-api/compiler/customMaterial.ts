/**
 * threejs-parity SH-02/SH-09/SH-10 (L1) — `material.custom(spec)` →
 * `PortableShaderMaterial` compiler adapter.
 *
 * GLSL is the authoritative path (`createAuraApp` mounts WebGL2): `glsl.fragment`
 * is required; `wgsl` is optional and only feeds the WebGPU backend. A WGSL-only
 * spec fails validation rather than silently producing a material that cannot
 * draw on the live backend.
 *
 * three-style surface: the adapter prepends a generated prelude so authored
 * shaders can use `uTime`, `uResolution`, `modelMatrix`, `viewMatrix`,
 * `projectionMatrix`, `modelViewMatrix`, `modelViewProjectionMatrix`,
 * `normalMatrix` (mat3), `cameraPosition`, and (vertex only) `position`,
 * `normal`, `uv`. The prelude declares the matching `u_*` uniforms and emits
 * `#define` aliases. Authored uniform `foo` lowers to `uniform <type> u_foo;
 * #define foo …`; an already `u_`-prefixed name is used verbatim.
 *
 * `patch` (SH-09) replaces named `#include` chunks at bake time and salts the
 * cache key; `registerShaderChunk` chunks (SH-10) resolve through the same
 * include map (built-ins < global chunks < patch). The baked pair is published
 * via `registerGlobalShaderSource` so the renderer-owned ShaderLibrary
 * resolves it at compile time.
 *
 * Known honest limits (documented, not silently applied):
 *   - `i32`/`u32` use integer bindings; `bool` uses a bool uniform in GLSL and
 *     the host-shareable u32 representation in WGSL.
 *   - `mat3` is padded into a mat4 slot; its alias emits `mat3(u_x)`.
 *   - `texture2d` accepts a `TextureBinding`, a `texture.*` handle
 *     (`AuraTextureRef`, resolved to its real device texture with the handle's
 *     sampler state), a raw rendering `Texture` (for example a render-target
 *     colour attachment), or a texture asset ref (`assets.x`, loaded by
 *     `upgradeCustomMaterialTextures` after mount). Handle sampler fields are
 *     re-synced every frame without recompiling; `needsUpdate` re-uploads the
 *     same device texture. A uniform with no texture samples the renderer's
 *     white fallback and is named in `customDiagnostics`
 *     (`CUSTOM_TEXTURE_UNBOUND`). The handle's `repeat/offset/rotation` are not
 *     applied: a custom shader receives raw UVs and owns its own transform.
 *   - GU47 E-D: `fog: true` wraps the author's `main` and applies the scene fog to its `out vec4` (see `withSceneFog`);
 *     a stage it cannot wrap is named in `customDiagnostics` (`CUSTOM_FOG_UNAPPLIED`).
 */

import {
  PortableShaderMaterial,
  ShaderPreprocessor,
  ShaderLibrary,
  SHADER_CHUNKS,
  A3D_AUTHOR_GLSL_CHUNKS,
  Texture,
  TextureBinding,
  assertPortableUniformData,
  cloneMaterialUniformValue,
  materialUniformValuesEqual,
  globalShaderChunkEntries,
  globalShaderSource,
  globalShaderWgslChunkSource,
  isTextureBinding,
  registerGlobalShaderSource,
  unregisterGlobalShaderSource,
  type PortableShaderSources,
  type PortableShaderUniform,
  type ShaderSourcePair,
  type NativeShaderStorageLayout,
  type NativeStorageBinding,
  type MaterialUniformKind,
  type RenderState,
  type ShaderDataType,
  type UniformDataValue,
  type UniformValue
} from "@aura3d/rendering";
import type { BlendMode } from "@aura3d/rendering/contracts";
import { AuraRuntimeError } from "./errors.js";
import { assertCustomAttributeName } from "../RootGeometry.js";
import { auraTextureRefBackingStatus, auraTextureRefTexture } from "../nodes/texture.js";
import type { AuraAssetRef, AuraCustomMaterialSpec, AuraCustomUniformType, AuraTextureRef, AuraUniformValue } from "../nodes/types.js";
import { auraTextureRefSampler, auraTextureRefTransform, isAuraTextureRef } from "./textures.js";

/* ------------------------------------------------------------------------- */
/* Validation (SH-02)                                                         */
/* ------------------------------------------------------------------------- */

/** Names the generated prelude owns — user uniforms may not shadow them. */
const RESERVED_UNIFORM_NAMES = new Set([
  "uTime", "u_time", "uResolution", "u_resolution", "cameraPosition", "u_cameraPosition",
  "modelMatrix", "u_modelMatrix", "viewMatrix", "u_viewMatrix", "projectionMatrix", "u_projectionMatrix",
  "modelViewMatrix", "modelViewProjectionMatrix", "u_modelViewProjection", "normalMatrix", "u_normalMatrix",
  "position", "normal", "uv", "gl_Position", "gl_FragCoord", "gl_FragColor"
]);

const CUSTOM_UNIFORM_TYPES = [
  "f32", "i32", "u32", "bool", "vec2", "vec3", "vec4", "color3", "mat3", "mat4", "texture2d", "texture3d", "depth2d"
] as const satisfies readonly AuraCustomUniformType[];
type SupportedCustomUniformType = typeof CUSTOM_UNIFORM_TYPES[number];
type CustomTextureUniformType = "texture2d" | "texture3d" | "depth2d";
const isSupportedCustomUniformType = (type: string): type is SupportedCustomUniformType =>
  (CUSTOM_UNIFORM_TYPES as readonly string[]).includes(type);
const isCustomTextureUniformType = (type: string): type is CustomTextureUniformType =>
  type === "texture2d" || type === "texture3d" || type === "depth2d";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type GraphDepthSpec = { readonly glsl: { readonly vertex: string; readonly fragment: string }; readonly wgsl: { readonly vertex: string; readonly fragment: string } };
const graphDepthOf = (spec: AuraCustomMaterialSpec): GraphDepthSpec | undefined =>
  (spec as AuraCustomMaterialSpec & { readonly graphDepth?: GraphDepthSpec }).graphDepth;
type GraphSkinningSpec = Readonly<Record<"four" | "eight", { readonly forward: GraphDepthSpec; readonly depth: GraphDepthSpec }>>;
const graphSkinningOf = (spec: AuraCustomMaterialSpec): GraphSkinningSpec | undefined =>
  (spec as AuraCustomMaterialSpec & { readonly graphSkinning?: GraphSkinningSpec }).graphSkinning;
type GraphStorageSpec = {
  readonly forward: readonly NativeStorageBinding[];
  readonly depth: readonly NativeStorageBinding[];
  readonly forwardLayouts: readonly NativeShaderStorageLayout[];
  readonly depthLayouts: readonly NativeShaderStorageLayout[];
};
const graphStorageOf = (spec: AuraCustomMaterialSpec): GraphStorageSpec | undefined =>
  (spec as AuraCustomMaterialSpec & { readonly graphStorage?: GraphStorageSpec }).graphStorage;

// Only specs returned by the graph adapter receive a clipping certificate.
// Keep the source-affecting parts in the fingerprint: a copied or edited
// custom spec must not inherit the adapter's forward/depth guarantee.
const compiledGraphSpecs = new WeakMap<object, string>();
const compiledGraphDataSpecs = new WeakSet<object>();
function graphSpecFingerprint(spec: AuraCustomMaterialSpec): string {
  const uniforms = Object.entries(spec.uniforms ?? {}).map(([name, uniform]) =>
    [name, typeof uniform === "string" ? uniform : uniform.type,
      typeof uniform !== "string" && uniform.type === "data" ? uniform.dataType : undefined]);
  const storage = graphStorageOf(spec);
  return JSON.stringify({ glsl: spec.glsl, wgsl: spec.wgsl, depth: graphDepthOf(spec), skinning: graphSkinningOf(spec),
    defines: spec.defines, patch: spec.patch, uniforms, aliases: spec.uniformAliases,
    fog: spec.fog, receiveShadow: spec.receiveShadow, castShadow: spec.castShadow,
    storageLayouts: storage ? [storage.forwardLayouts, storage.depthLayouts] : undefined });
}

/** Internal: record the exact validated graph adapter program before exposing it. */
export function certifyCompiledGraphMaterialSpec(spec: AuraCustomMaterialSpec): void {
  compiledGraphSpecs.set(spec, graphSpecFingerprint(spec));
  if (Object.values(spec.uniforms ?? {}).some((uniform) => typeof uniform !== "string" && uniform.type === "data")) {
    compiledGraphDataSpecs.add(spec);
  }
}

function isCertifiedGraphSpec(spec: AuraCustomMaterialSpec): boolean {
  const expected = compiledGraphSpecs.get(spec);
  // Arbitrary GLSL defines can rewrite generated clipping control flow. They
  // remain usable for ordinary draws but cannot certify this paired contract.
  return expected !== undefined && Object.keys(spec.defines ?? {}).length === 0 && expected === graphSpecFingerprint(spec);
}

const isGraphStagePair = (value: unknown): value is GraphDepthSpec => {
  if (!isRecord(value) || !isRecord(value.glsl) || !isRecord(value.wgsl)) return false;
  return [value.glsl.vertex, value.glsl.fragment, value.wgsl.vertex, value.wgsl.fragment]
    .every((source) => typeof source === "string" && source.trim().length > 0);
};

function invalidSpec(owner: string, message: string): never {
  throw new AuraRuntimeError("invalid-material-spec", `${owner}: ${message}`);
}

/**
 * Synchronous validation for `material.custom(spec)` — throws
 * `AuraRuntimeError("invalid-material-spec")` on any contract violation.
 */
export function assertAuraCustomMaterialSpec(spec: unknown, owner = "material.custom"): asserts spec is AuraCustomMaterialSpec {
  if (!isRecord(spec)) invalidSpec(owner, "spec must be an object");
  const glsl = spec.glsl;
  if (!isRecord(glsl)) invalidSpec(owner, "spec.glsl is required — GLSL is the authoritative path (WebGL2)");
  if (typeof glsl.fragment !== "string" || !glsl.fragment.trim()) {
    invalidSpec(owner, "spec.glsl.fragment must be a non-empty string (a WGSL-only spec cannot draw on WebGL2)");
  }
  if (glsl.vertex !== undefined && typeof glsl.vertex !== "string") invalidSpec(owner, "spec.glsl.vertex must be a string");
  const wgsl = spec.wgsl;
  if (wgsl !== undefined) {
    if (!isRecord(wgsl)) invalidSpec(owner, "spec.wgsl must be an object with vertex/fragment stages");
    if (wgsl.vertex !== undefined && typeof wgsl.vertex !== "string") invalidSpec(owner, "spec.wgsl.vertex must be a string");
    if (wgsl.fragment !== undefined && typeof wgsl.fragment !== "string") invalidSpec(owner, "spec.wgsl.fragment must be a string");
    if (wgsl.vertex === undefined && wgsl.fragment === undefined) invalidSpec(owner, "spec.wgsl must contain at least one stage");
  }
  const graphDepth = spec.graphDepth;
  if (graphDepth !== undefined && !isGraphStagePair(graphDepth)) {
    invalidSpec(owner, "graphDepth requires paired GLSL/WGSL vertex and fragment stages");
  }
  const graphSkinning = spec.graphSkinning;
  if (graphSkinning !== undefined) {
    if (!isRecord(graphSkinning) || !isRecord(graphSkinning.four) || !isRecord(graphSkinning.eight)
      || !isGraphStagePair(graphSkinning.four.forward) || !isGraphStagePair(graphSkinning.four.depth)
      || !isGraphStagePair(graphSkinning.eight.forward) || !isGraphStagePair(graphSkinning.eight.depth)) {
      invalidSpec(owner, "graphSkinning requires paired forward and depth stages for four and eight influences");
    }
  }
  if (spec.graphStorage !== undefined) {
    const storage = spec.graphStorage;
    if (!isRecord(storage) || !Array.isArray(storage.forward) || !Array.isArray(storage.depth)
      || !Array.isArray(storage.forwardLayouts) || !Array.isArray(storage.depthLayouts)) {
      invalidSpec(owner, "graphStorage requires forward/depth resources and native shader layouts");
    }
  }
  const uniforms = spec.uniforms ?? {};
  if (!isRecord(uniforms)) invalidSpec(owner, "spec.uniforms must be a record of uniform specs");
  const loweredOwners = new Map<string, string>();
  for (const [name, uniform] of Object.entries(uniforms)) {
    if (!/^[A-Za-z_]\w*$/.test(name)) invalidSpec(owner, `uniform name "${name}" is not a valid identifier`);
    if (RESERVED_UNIFORM_NAMES.has(name)) {
      invalidSpec(owner, `uniform name "${name}" is reserved for a generated built-in`);
    }
    // The authored name is lowered to `u_<name>`, so `time` becomes the
    // prelude's own `u_time` and would fail GLSL compile with a redefinition.
    const lowered = name.startsWith("u_") ? name : `u_${name}`;
    if (builtinLoweredUniformNames().has(lowered)) {
      invalidSpec(
        owner,
        `uniform "${name}" lowers to "${lowered}", which collides with a generated built-in declaration ` +
          `(built-ins: ${[...builtinLoweredUniformNames()].join(", ")}; reserved authored names: ${[...RESERVED_UNIFORM_NAMES].join(", ")}). ` +
          `Rename it, for example "my${name.charAt(0).toUpperCase()}${name.slice(1)}"`
      );
    }
    const previous = loweredOwners.get(lowered);
    if (previous !== undefined) {
      invalidSpec(owner, `uniforms "${previous}" and "${name}" both lower to "${lowered}"; rename one`);
    }
    loweredOwners.set(lowered, name);
    const type = isRecord(uniform) ? uniform.type : uniform;
    if (type === "data") {
      if (!isRecord(uniform) || !Object.hasOwn(uniform, "dataType") || !Object.hasOwn(uniform, "value")) {
        invalidSpec(owner, `uniform "${name}" (data) requires dataType and an initial value`);
      }
      if (!wgsl) invalidSpec(owner, `uniform "${name}" (data) requires paired WGSL stages`);
      normalizeCustomDataValue(uniform.dataType as ShaderDataType, uniform.value, name, owner);
      continue;
    }
    if (typeof type !== "string" || !isSupportedCustomUniformType(type)) {
      invalidSpec(owner, `uniform "${name}" has unsupported type ${String(type)} (expected one of ${CUSTOM_UNIFORM_TYPES.join(", ")})`);
    }
    if (isRecord(uniform) && uniform.value !== undefined) {
      normalizeCustomUniformValue(type as AuraCustomUniformType, uniform.value, name);
    }
  }
  const aliases = spec.uniformAliases ?? {};
  if (!isRecord(aliases)) invalidSpec(owner, "spec.uniformAliases must be a record of public names to declared uniform names");
  for (const [name, target] of Object.entries(aliases)) {
    if (!/^[A-Za-z_]\w*$/.test(name) || typeof target !== "string" || !Object.prototype.hasOwnProperty.call(uniforms, target)) {
      invalidSpec(owner, `uniform alias "${name}" must name a declared uniform`);
    }
  }
  const defines = spec.defines ?? {};
  if (!isRecord(defines)) invalidSpec(owner, "spec.defines must be a record");
  for (const [key, value] of Object.entries(defines)) {
    if (!/^[A-Za-z_]\w*$/.test(key)) invalidSpec(owner, `define name "${key}" is not a valid identifier`);
    if (!["string", "number", "boolean"].includes(typeof value)) invalidSpec(owner, `define "${key}" must be a string, number, or boolean`);
  }
  if (spec.patch !== undefined) {
    if (!isRecord(spec.patch)) invalidSpec(owner, "spec.patch must be a record of chunk name → GLSL source");
    for (const [name, source] of Object.entries(spec.patch)) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) invalidSpec(owner, `patch chunk name "${name}" is invalid`);
      if (typeof source !== "string") invalidSpec(owner, `patch chunk "${name}" must be a string`);
    }
  }
  if (spec.side !== undefined && (typeof spec.side !== "string" || !["front", "back", "double"].includes(spec.side))) invalidSpec(owner, `side "${String(spec.side)}" is unsupported`);
  if (spec.blending !== undefined && (typeof spec.blending !== "string" || !["normal", "additive", "subtractive", "multiply", "custom"].includes(spec.blending))) {
    invalidSpec(owner, `blending "${String(spec.blending)}" is unsupported`);
  }
  if (spec.blending === "custom") {
    invalidSpec(owner, "blending \"custom\" needs a blend-factor channel that does not exist yet — use normal/additive/subtractive/multiply");
  }
  const transparent = spec.transparent === true || (spec.blending !== undefined && spec.blending !== "normal");
  if (transparent && spec.depthWrite === true) {
    invalidSpec(owner, "transparent/blended materials cannot keep depthWrite — pass depthWrite:false or omit it");
  }
}

/* ------------------------------------------------------------------------- */
/* Uniform lowering                                                           */
/* ------------------------------------------------------------------------- */

interface LoweredUniform extends PortableShaderUniform {
  /** The authored key — aliased to `name` (u_-prefixed) in generated GLSL. */
  readonly publicName: string;
  readonly auraType: AuraCustomUniformType | "data";
  readonly glslType: string;
  /** Retain a certified graph's logical schema when its mat4 uses the flat binder. */
  readonly graphDataType?: ShaderDataType;
}

const isTextureRef = (value: unknown): value is { readonly kind: "aura-texture-ref"; readonly id: string } =>
  isRecord(value) && value.kind === "aura-texture-ref" && typeof value.id === "string";

/** `assets.x` texture refs carry a url; the texture itself loads after mount. */
const isAssetTextureRef = (value: unknown): value is AuraAssetRef<"texture"> =>
  isRecord(value) && value.kind === "aura-asset-ref" && value.type === "texture";

/**
 * A `texture.*` handle → a binding over its live device texture with the
 * handle's sampler state. Asset references use a separate deferred placeholder.
 */
function bindingForTextureRef(ref: AuraTextureRef, name: string): TextureBinding {
  const texture = auraTextureRefTexture(ref);
  if (!texture) {
    if (auraTextureRefBackingStatus(ref) === "disposed") invalidSpec("material.custom", `uniform "${name}" has no live backing texture`);
    // An unbacked reference retains the established optional placeholder;
    // a disposed owned handle above must never silently become a fallback.
    return new TextureBinding({ name, texture: null, required: false });
  }
  return new TextureBinding({ name, texture, sampler: auraTextureRefSampler(ref), transform: auraTextureRefTransform(ref), required: false });
}

const numericArray = (value: unknown): readonly number[] | null => {
  if (typeof value === "number") return [value];
  if (typeof value === "boolean") return [value ? 1 : 0];
  if (ArrayBuffer.isView(value)) return Array.from(value as Float32Array);
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) return value as readonly number[];
  if (isRecord(value) && typeof value.x === "number") {
    const num = (entry: unknown): number => (typeof entry === "number" ? entry : 0);
    return [value.x, num(value.y), num(value.z), num(value.w)];
  }
  return null;
};

const parseColor3 = (value: string): readonly number[] | null => {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
};

const padMat3 = (values: readonly number[]): readonly number[] => {
  if (values.length !== 9) return values;
  // column-major mat3 → padded column-major mat4 (last row/column identity).
  return [
    values[0]!, values[1]!, values[2]!, 0,
    values[3]!, values[4]!, values[5]!, 0,
    values[6]!, values[7]!, values[8]!, 0,
    0, 0, 0, 1
  ];
};

const scalarCount = (type: SupportedCustomUniformType): number =>
  type === "f32" || type === "i32" || type === "u32" || type === "bool" ? 1
    : type === "vec2" ? 2
      : type === "vec3" || type === "color3" ? 3
        : type === "vec4" ? 4
          : type === "mat3" ? 9
            : type === "mat4" ? 16
              : 0;

/**
 * Lowers an authored value onto the portable uniform channel. Throws
 * `invalid-material-spec` on wrong arity / non-finite numbers / bad texture.
 */
export function normalizeCustomUniformValue(type: AuraCustomUniformType, value: unknown, name = "uniform"): UniformValue {
  if (!isSupportedCustomUniformType(type)) invalidSpec("material.custom", `uniform "${name}" has unsupported type ${type}`);
  if (isCustomTextureUniformType(type)) {
    let binding: TextureBinding | undefined;
    if (isTextureBinding(value)) binding = value;
    else if (value instanceof Texture) binding = new TextureBinding({ name, texture: value, required: type !== "texture2d" });
    else if (isAuraTextureRef(value)) binding = bindingForTextureRef(value, name);
    // Placeholder until `upgradeCustomMaterialTextures` loads the asset's url.
    else if (type === "texture2d" && isAssetTextureRef(value)) binding = new TextureBinding({ name, texture: null, required: false });
    if (!binding) invalidSpec("material.custom", `uniform "${name}" (${type}) expects a TextureBinding, a texture handle or a Texture${type === "texture2d" ? ", or a texture asset ref" : ""}`);
    const texture = binding.texture;
    if (!texture && type !== "texture2d") invalidSpec("material.custom", `uniform "${name}" requires a bound ${type} texture`);
    if (texture && (texture.disposed || !texture.usage.includes("sampled"))) invalidSpec("material.custom", `uniform "${name}" requires a live texture with sampled usage`);
    if (texture && type === "texture2d" && (texture.dimension !== "2d" || texture.format === "depth24")) invalidSpec("material.custom", `uniform "${name}" expects a 2d color texture`);
    if (texture && type === "texture3d" && (texture.dimension !== "3d" || texture.format === "depth24")) invalidSpec("material.custom", `uniform "${name}" expects a 3d texture`);
    if (texture && type === "depth2d" && (texture.dimension !== "2d" || texture.format !== "depth24")) invalidSpec("material.custom", `uniform "${name}" expects a 2d depth texture`);
    if (type === "depth2d" && binding.sampler.compare !== undefined) invalidSpec("material.custom", `uniform "${name}" requires a non-comparison depth binding`);
    return binding;
  }
  if (type === "color3" && typeof value === "string") {
    const color = parseColor3(value);
    if (!color) invalidSpec("material.custom", `uniform "${name}" (color3) expects a #rrggbb string`);
    return [...color!];
  }
  const scalars = numericArray(value);
  if (!scalars) invalidSpec("material.custom", `uniform "${name}" (${type}) needs a number, boolean, vector, or typed-array value`);
  const expected = scalarCount(type);
  const normalized = type === "mat3" ? padMat3(scalars) : scalars;
  const stored = type === "mat3" ? 16 : expected;
  if (normalized.length !== stored) {
    invalidSpec("material.custom", `uniform "${name}" (${type}) expects ${expected} scalar values, got ${scalars.length}`);
  }
  if (!normalized.every(Number.isFinite)) invalidSpec("material.custom", `uniform "${name}" contains non-finite values`);
  if (type === "u32" && (typeof value === "boolean" || !Number.isInteger(normalized[0]) || normalized[0]! < 0 || normalized[0]! > 0xffffffff)) {
    invalidSpec("material.custom", `uniform "${name}" (u32) must be an integer between 0 and 4294967295`);
  }
  if (type === "i32" && (typeof value === "boolean" || !Number.isInteger(normalized[0]) || normalized[0]! < -0x80000000 || normalized[0]! > 0x7fffffff)) {
    invalidSpec("material.custom", `uniform "${name}" (i32) must be an integer between -2147483648 and 2147483647`);
  }
  if (type === "bool" && normalized[0] !== 0 && normalized[0] !== 1) {
    invalidSpec("material.custom", `uniform "${name}" (bool) must be a boolean or 0 or 1`);
  }
  return normalized.length === 1 ? normalized[0]! : [...normalized];
}

function normalizeCustomDataValue(type: ShaderDataType, value: unknown, name: string, owner = "material.custom"): UniformDataValue {
  try {
    assertPortableUniformData(type, value, `uniform "${name}"`);
    return value;
  } catch (error) {
    return invalidSpec(owner, error instanceof Error ? error.message : `uniform "${name}" has invalid data`);
  }
}

const LOWERED_TYPES: Record<SupportedCustomUniformType, { kind: MaterialUniformKind; glsl: string }> = {
  f32: { kind: "float", glsl: "float" },
  i32: { kind: "i32", glsl: "int" },
  u32: { kind: "u32", glsl: "uint" },
  bool: { kind: "bool", glsl: "bool" },
  vec2: { kind: "vec2", glsl: "vec2" },
  vec3: { kind: "vec3", glsl: "vec3" },
  vec4: { kind: "vec4", glsl: "vec4" },
  color3: { kind: "vec3", glsl: "vec3" },
  mat3: { kind: "mat4", glsl: "mat4" },    // padded — alias emits mat3(u_x)
  mat4: { kind: "mat4", glsl: "mat4" },
  texture2d: { kind: "texture2d", glsl: "sampler2D" },
  texture3d: { kind: "texture3d", glsl: "sampler3D" },
  depth2d: { kind: "depth2d", glsl: "sampler2D" }
};

const DEFAULT_VALUES: Record<Exclude<SupportedCustomUniformType, CustomTextureUniformType>, UniformValue> = {
  f32: 0, i32: 0, u32: 0, bool: 0,
  vec2: [0, 0], vec3: [0, 0, 0], color3: [1, 1, 1], vec4: [0, 0, 0, 0],
  mat3: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mat4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
};

function lowerUniforms(spec: AuraCustomMaterialSpec): readonly LoweredUniform[] {
  const out: LoweredUniform[] = [];
  for (const [publicName, uniform] of Object.entries(spec.uniforms ?? {})) {
    if (typeof uniform !== "string" && uniform.type === "data") {
      const uniformName = customUniformNameFor(publicName);
      // A top-level 4x4 graph matrix has exactly the flat mat4 ABI on both
      // backends. Other data schemas stay on the WebGPU-only recursive path.
      const type = uniform.dataType;
      const flatGraphMat4 = compiledGraphDataSpecs.has(spec) && typeof type === "object"
        && type.kind === "matrix" && type.columns === 4 && type.rows === 4;
      out.push({
        name: uniformName, publicName, auraType: "data", kind: flatGraphMat4 ? "mat4" : "data", glslType: "",
        ...(flatGraphMat4
          ? { graphDataType: Object.freeze({ kind: "matrix" as const, columns: 4 as const, rows: 4 as const }) }
          : { dataType: uniform.dataType }),
        required: true, optimizable: true,
        value: normalizeCustomDataValue(uniform.dataType, uniform.value, publicName)
      });
      continue;
    }
    const auraType = (isRecord(uniform) ? uniform.type : uniform) as AuraCustomUniformType;
    if (!isSupportedCustomUniformType(auraType)) invalidSpec("material.custom", `uniform "${publicName}" has unsupported type ${auraType}`);
    const lowered = LOWERED_TYPES[auraType];
    const uniformName = publicName.startsWith("u_") ? publicName : `u_${publicName}`;
    const value = isRecord(uniform) && uniform.value !== undefined
      ? normalizeCustomUniformValue(auraType, uniform.value, publicName)
      : isCustomTextureUniformType(auraType)
        ? new TextureBinding({ name: uniformName, texture: null, required: auraType !== "texture2d", expectedDimension: auraType === "texture3d" ? "3d" : "2d" })
        : DEFAULT_VALUES[auraType];
    out.push({
      name: uniformName,
      publicName,
      auraType,
      kind: lowered.kind,
      glslType: lowered.glsl,
      required: auraType !== "texture2d",
      optimizable: true,
      value
    });
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* GLSL prelude + bake                                                        */
/* ------------------------------------------------------------------------- */

const declaresIdentifier = (source: string, name: string): boolean =>
  new RegExp(`\\b(?:uniform|in|out|attribute|varying)\\s+\\w+(?:\\s*\\[\\s*\\w+\\s*\\])?\\s+${name}\\b`).test(source)
  || new RegExp(`\\b(?:vec2|vec3|vec4|mat2|mat3|mat4|float|int|bool|void|struct)\\s+${name}\\b`).test(source);

const usesToken = (source: string, name: string): boolean => new RegExp(`\\b${name}\\b`).test(source);

/** Built-in uniform declarations shared by both stages (all u_-prefixed). */
const BUILTIN_DECLS: readonly string[] = [
  "uniform mat4 u_modelViewProjection;",
  "uniform mat4 u_modelMatrix;",
  "uniform mat4 u_normalMatrix;",
  "uniform mat4 u_viewMatrix;",
  "uniform mat4 u_projectionMatrix;",
  "uniform vec3 u_cameraPosition;",
  "uniform float u_time;",
  "uniform vec2 u_resolution;"
];

let builtinLoweredNames: ReadonlySet<string> | undefined;
/** `u_*` names declared by BUILTIN_DECLS — the single source for the lowered-name collision check. */
function builtinLoweredUniformNames(): ReadonlySet<string> {
  builtinLoweredNames ??= new Set(
    BUILTIN_DECLS.map((decl) => /\b(u_\w+)\s*;/.exec(decl)?.[1]).filter((name): name is string => name !== undefined)
  );
  return builtinLoweredNames;
}

function uniformDeclLines(uniforms: readonly LoweredUniform[]): string[] {
  // The fragment-stage default integer precision can be mediump. Explicit highp
  // preserves all 32 bits of integer uniforms before any author precision line.
  // Graph-generated GLSL already declares aggregates after their struct types.
  // Hand-authored data uniforms must likewise supply their own declaration.
  return uniforms.filter((uniform) => uniform.auraType !== "data").map((uniform) => `uniform ${uniform.auraType === "u32" || uniform.auraType === "i32" || uniform.auraType === "texture3d" || uniform.auraType === "depth2d" ? "highp " : ""}${uniform.glslType} ${uniform.name};`);
}

/**
 * three-style aliases. Object-like macros — emitted only when the authored
 * source does not itself declare the identifier, so authored declarations win.
 * Type-carrying aliases keep authored semantics (`mat3` reads a padded slot).
 */
function aliasLines(uniforms: readonly LoweredUniform[], stageSource: string): string[] {
  const builtinAliases: readonly [string, string][] = [
    ["uTime", "u_time"],
    ["uResolution", "u_resolution"],
    ["modelMatrix", "u_modelMatrix"],
    ["viewMatrix", "u_viewMatrix"],
    ["projectionMatrix", "u_projectionMatrix"],
    ["modelViewMatrix", "(u_viewMatrix * u_modelMatrix)"],
    ["modelViewProjectionMatrix", "u_modelViewProjection"],
    ["normalMatrix", "mat3(u_normalMatrix)"],
    ["cameraPosition", "u_cameraPosition"]
  ];
  const lines = builtinAliases
    .filter(([name]) => !declaresIdentifier(stageSource, name))
    .map(([name, target]) => `#define ${name} ${target}`);
  for (const uniform of uniforms) {
    if (uniform.publicName === uniform.name) continue;
    if (declaresIdentifier(stageSource, uniform.publicName)) continue;
    const alias = uniform.auraType === "i32" ? `int(${uniform.name})`
      : uniform.auraType === "bool" ? `bool(${uniform.name})`
        : uniform.auraType === "mat3" ? `mat3(${uniform.name})`
          : uniform.name;
    lines.push(`#define ${uniform.publicName} ${alias}`);
  }
  return lines;
}

/**
 * GLSL leaves `pow(x, y)` undefined for x < 0 (and for x == 0 with y <= 0). Software GL evaluates it anyway; real GPUs
 * (Apple/Metal, others) return NaN, which blending then writes into the HDR target and bloom smears over the frame. Author
 * code written against three.js ShaderMaterial is full of `pow(1.0 - dot(n, v), k)` and `exp(-pow(x, 2.0))`, so custom
 * shaders that call `pow` get a total version: `pow(max(abs(x), tiny), y)`.
 */
export const SAFE_POW_GLSL = [
  "float a3dPow(float x, float y) { return pow(max(abs(x), 1e-30), y); }",
  "vec2 a3dPow(vec2 x, vec2 y) { return pow(max(abs(x), vec2(1e-30)), y); }",
  "vec3 a3dPow(vec3 x, vec3 y) { return pow(max(abs(x), vec3(1e-30)), y); }",
  "vec4 a3dPow(vec4 x, vec4 y) { return pow(max(abs(x), vec4(1e-30)), y); }",
  "#define pow(x, y) a3dPow(x, y)"
].join("\n");

const safePowLines = (userSource: string): string[] => (usesToken(userSource, "pow") ? [SAFE_POW_GLSL] : []);

/**
 * GU47 E-D: per-instance inputs for `material.custom` on instanced nodes (`instances.*`, `primitives.*({ instances })`).
 * A vertex stage that reads `instanceMatrix` gets the node's per-instance transform (three.js order:
 * `modelMatrix * instanceMatrix * position`) and `instanceColor` its per-instance colour (white when the node has no
 * colours). The forward pass then draws every instance in one call from the engine's per-instance attribute buffer and
 * sets `u_a3dInstancing` (`supportsAuthorInstancing`); on a non-instanced draw they read identity / white. A stage that
 * reads neither keeps today's path (one draw per instance with the instance folded into `modelMatrix`).
 */
function instanceInputLines(userSource: string): string[] {
  const wantMatrix = usesToken(userSource, "instanceMatrix") && !declaresIdentifier(userSource, "instanceMatrix");
  const wantColor = usesToken(userSource, "instanceColor") && !declaresIdentifier(userSource, "instanceColor");
  if (!wantMatrix && !wantColor) return [];
  const lines = [
    "uniform float u_a3dInstancing;",
    "in vec4 a_instanceMatrix0;",
    "in vec4 a_instanceMatrix1;",
    "in vec4 a_instanceMatrix2;",
    "in vec4 a_instanceMatrix3;"
  ];
  if (wantMatrix) {
    lines.push("#define instanceMatrix (u_a3dInstancing > 0.5 ? mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3) : mat4(1.0))");
  }
  if (wantColor) {
    lines.push("uniform float u_a3dInstanceColors;", "in vec4 a_instanceColor;");
    lines.push("#define instanceColor (u_a3dInstancing > 0.5 && u_a3dInstanceColors > 0.5 ? a_instanceColor : vec4(1.0))");
  }
  return lines;
}

function vertexPreamble(uniforms: readonly LoweredUniform[], userSource: string): string {
  const lines: string[] = [...BUILTIN_DECLS];
  if (!declaresIdentifier(userSource, "a_position")) lines.push("in vec3 a_position;");
  const wantNormal = usesToken(userSource, "normal") && !declaresIdentifier(userSource, "normal");
  const wantUv = usesToken(userSource, "uv") && !declaresIdentifier(userSource, "uv");
  if (wantNormal && !declaresIdentifier(userSource, "a_normal")) lines.push("in vec3 a_normal;");
  if (wantUv && !declaresIdentifier(userSource, "a_uv")) lines.push("in vec2 a_uv;");
  lines.push(...instanceInputLines(userSource));
  lines.push(...uniformDeclLines(uniforms));
  lines.push(...aliasLines(uniforms, userSource));
  if (usesToken(userSource, "position") && !declaresIdentifier(userSource, "position")) lines.push("#define position a_position");
  if (wantNormal) lines.push("#define normal a_normal");
  if (wantUv) lines.push("#define uv a_uv");
  lines.push(...safePowLines(userSource));
  return lines.join("\n");
}

function fragmentPreamble(uniforms: readonly LoweredUniform[], userSource: string): string {
  return [...BUILTIN_DECLS, ...uniformDeclLines(uniforms), ...aliasLines(uniforms, userSource), ...safePowLines(userSource)].join("\n");
}

/**
 * R-23: GLSL1-style `attribute T name;` (three ShaderMaterial source) becomes
 * `in T name;` so migrated vertex stages compile under `#version 300 es`.
 */
function modernizeVertexAttributes(source: string): string {
  return source.replace(/^([ \t]*)attribute(\s+)/gm, "$1in$2");
}

/**
 * R-23: author-declared per-vertex attributes (`in float paintOriginal;`) the
 * geometry must supply. Engine names (`a_*`) and built-in semantics are
 * excluded; a missing one fails the draw with a named error instead of
 * silently reading the zero default.
 */
function declaredCustomAttributes(vertexSource: string): readonly string[] {
  const names = new Set<string>();
  const pattern = /^[ \t]*(?:in|attribute)\s+(?:(?:lowp|mediump|highp)\s+)?(?:float|vec2|vec3|vec4)\s+([A-Za-z_]\w*)\s*;/gm;
  for (let match = pattern.exec(vertexSource); match; match = pattern.exec(vertexSource)) {
    try {
      assertCustomAttributeName(match[1]!);
      names.add(match[1]!);
    } catch {
      // engine or built-in attribute name: bound by the engine, not required from the author
    }
  }
  return [...names].sort();
}

/** The graph compiler declares the built-in attributes its reachable nodes use. */
function declaredGraphAttributes(vertexSource: string): readonly string[] {
  const line = /^\s*\/\/ @aura3d-graph-attributes:([A-Za-z0-9_,]+)\s*$/m.exec(vertexSource);
  if (!line) return [];
  const allowed = new Set(["a_position", "a_normal", "a_uv", "a_uv1"]);
  const attributes = line[1]!.split(",");
  if (attributes.some((name) => !allowed.has(name))) invalidSpec("material.node", "graph declares an unsupported geometry attribute");
  return attributes;
}

const DEFAULT_GLSL_VERTEX = `void main() {
  gl_Position = u_modelViewProjection * vec4(position, 1.0);
}`;

/** `receiveShadow: true` adds `#include <a3d_shadow>` after any `#version` line unless the author already included it. */
function withShadowInclude(spec: AuraCustomMaterialSpec): string {
  const source = spec.glsl.fragment;
  if (spec.receiveShadow !== true || /#include\s*<a3d_shadow>/.test(source)) return source;
  const version = source.match(/^\s*#version[^\n]*\n?/);
  const head = version ? version[0] : "";
  return `${head}#include <a3d_shadow>\n${source.slice(head.length)}`;
}

/** Splits `#version` off the authored stage so the prelude lands legally after it. */
function injectPreamble(source: string, preamble: string, stage: "vertex" | "fragment"): string {
  let head = "";
  let body = source;
  const version = body.match(/^\s*#version[^\n]*\n?/);
  if (version) {
    head += version[0];
    body = body.slice(version[0].length);
  } else {
    head += "#version 300 es\n";
  }
  // Always declared: the prelude below uses `float` before the author's code, so an author-written `precision` line alone
  // (placed after the prelude) left it without a default and the shader failed to compile. A later author declaration wins.
  if (stage === "fragment") head += "precision highp float;\n";
  head += "precision highp int;\n";
  return `${head}${preamble}\n${body}`;
}

/** Include map for the adapter bake: built-ins < author chunks (`#include <a3d_math>`, `<a3d_noise>`, `<a3d_sky>`, `<a3d_fog>`, `<a3d_triplanar>`, `<a3d_toon>`, `<a3d_scene>`, `<a3d_shadow>`, `<a3d_lights>`, `<a3d_ibl>`, `<a3d_rim>`, `<colorspace_decode>`, `<colorspace_encode>`) < global `registerShaderChunk` < `patch`. */
function bakeIncludes(patch: Readonly<Record<string, string>> | undefined): Map<string, string> {
  const includes = new Map<string, string>();
  for (const chunk of SHADER_CHUNKS) includes.set(chunk.name, chunk.source);
  for (const chunk of A3D_AUTHOR_GLSL_CHUNKS) includes.set(chunk.name, chunk.source);
  for (const [name, source] of globalShaderChunkEntries()) includes.set(name, source);
  for (const [name, source] of Object.entries(patch ?? {})) includes.set(name, source);
  return includes;
}

const AUTHOR_CHUNK_NAMES: ReadonlySet<string> = new Set(A3D_AUTHOR_GLSL_CHUNKS.map((chunk) => chunk.name));

/**
 * GU47 E-D: one stage's include map. An author chunk expands at most once per stage (later `#include`s of it expand to
 * nothing), so chunks may include each other (`a3d_lights` -> `a3d_shadow` -> `a3d_scene`) and an author may include
 * any combination. A stage that includes each chunk once bakes exactly as before.
 */
class AuthorIncludeOnceMap extends Map<string, string> {
  private readonly expanded = new Set<string>();

  override get(name: string): string | undefined {
    const source = super.get(name);
    if (source === undefined || !AUTHOR_CHUNK_NAMES.has(name)) return source;
    if (this.expanded.has(name)) return "";
    this.expanded.add(name);
    return source;
  }
}

/** The uniforms `environment_fog_common` reads; ForwardPass `applyEnvironmentFogUniforms` binds them when all are declared. */
const SCENE_FOG_UNIFORM_DECLS: readonly string[] = [
  "uniform float u_environmentFogEnabled;",
  "uniform float u_environmentFogMode;",
  "uniform vec3 u_environmentFogColor;",
  "uniform float u_environmentFogNear;",
  "uniform float u_environmentFogFar;",
  "uniform float u_environmentFogDensity;",
  "uniform float u_environmentFogHeightFalloff;",
  "uniform float u_environmentFogHeightReference;",
  "uniform float u_environmentFogMaxOpacity;",
  "uniform float u_volumetricIntensity;",
  "uniform vec3 u_volumetricLightDirection;",
  "uniform vec3 u_volumetricLightColor;"
];

const AUTHOR_MAIN_PATTERN = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)/;

/** The author's colour output (`out vec4 name;`, optionally `layout(location = 0)`), the first one declared. */
export function customFragmentOutputName(source: string): string | undefined {
  return /(?:layout\s*\([^)]*\)\s*)?\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_]\w*)\s*;/.exec(source)?.[1];
}

/**
 * GU47 E-D: `fog: true` applies the scene fog. The author's `main` is renamed `a3dAuthorMain` and a wrapper `main` runs it,
 * then mixes the fog the built-in lit programs apply (`environment_fog_common`: linear / exp / exp2 by distance, height
 * falloff, max opacity, volumetric inscatter; bound per draw by the forward pass, off when the scene has no fog or the
 * material sets `fog: false`) into the author's colour output, at the fragment's reconstructed world position. Returns
 * the source unchanged (and `applied: false`) when the stage has no `void main()` or no `out vec4` to fog.
 */
function withSceneFog(spec: AuraCustomMaterialSpec, source: string, graphWorldPosition = false): { readonly source: string; readonly applied: boolean } {
  if (spec.fog !== true) return { source, applied: false };
  const output = customFragmentOutputName(source);
  if (!output || !AUTHOR_MAIN_PATTERN.test(source)) return { source, applied: false };
  return {
    applied: true,
    source: [
      source.replace(AUTHOR_MAIN_PATTERN, "void a3dAuthorMain()"),
      ...(graphWorldPosition ? [] : ["#include <a3d_shadow>"]),
      ...SCENE_FOG_UNIFORM_DECLS,
      "#include <environment_fog_common>",
      "void main() {",
      "  a3dAuthorMain();",
      `  ${output}.rgb = a3dApplyEnvironmentFog(${output}.rgb, ${graphWorldPosition ? "auraGraph_surfaceWorldPosition" : "a3dFragWorldPosition()"});`,
      "}"
    ].join("\n")
  };
}

/** WGSL `#include <name>` expansion — `patch` wins, else the registered wgsl half (or shared GLSL). */
function expandWgslIncludes(source: string, patch: Readonly<Record<string, string>> | undefined, stack: readonly string[] = []): string {
  return source.replace(/^\s*#include\s+<([^>]+)>\s*$/gm, (_line, name: string) => {
    if (stack.includes(name)) {
      invalidSpec("material.custom", `circular WGSL include ${[...stack, name].join(" -> ")}`);
    }
    const resolved = patch?.[name] ?? globalShaderWgslChunkSource(name);
    if (resolved === undefined) {
      invalidSpec("material.custom", `WGSL include not found: ${name}`);
    }
    return expandWgslIncludes(resolved, patch, [...stack, name]);
  });
}

const WGSL_MARKER = "/* @aura3d-bindings */";

const DEFAULT_WGSL_VERTEX = `${WGSL_MARKER}
@vertex
fn vs_main(@location(0) position: vec3f) -> @builtin(position) vec4f {
  return aura.u_modelViewProjection * vec4f(position, 1.0);
}
`;

function wgslStage(source: string | undefined, fallback: string, patch: Readonly<Record<string, string>> | undefined): string {
  const expanded = source === undefined ? fallback : expandWgslIncludes(source, patch);
  return expanded.includes(WGSL_MARKER) ? expanded : `${WGSL_MARKER}\n${expanded}`;
}

/* ------------------------------------------------------------------------- */
/* Render state + cache key                                                   */
/* ------------------------------------------------------------------------- */

function customRenderState(spec: AuraCustomMaterialSpec): Partial<RenderState> {
  const transparent = spec.transparent === true || (spec.blending !== undefined && spec.blending !== "normal");
  const blendMode: BlendMode = !transparent ? "opaque"
    : spec.blending === "additive" ? "additive"
      : spec.blending === "multiply" ? "multiply"
        : "alpha"; // "normal"/"subtractive"→alpha (documented limit: no subtractive blend mode)
  return {
    blend: transparent,
    blendMode,
    depthWrite: spec.depthWrite ?? !transparent,
    depthTest: spec.depthTest ?? true,
    cullMode: spec.side === "double" ? "none" : spec.side === "back" ? "front" : "back"
  };
}

/** Deterministic JSON with sorted object keys — feeds the stable cache key. */
export function stableSpecStringify(value: unknown): string {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return `[${Array.from(value as ArrayLike<unknown>).map(stableSpecStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSpecStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const normalizeHashableValue = (value: unknown): unknown => {
  if (isTextureBinding(value)) return { kind: "texture-binding", name: value.name };
  if (isTextureRef(value)) return { kind: "texture-ref", id: value.id };
  if (value instanceof Texture) return { kind: "texture", label: value.label };
  if (isAssetTextureRef(value)) return { kind: "asset-texture-ref", id: value.id };
  return numericArray(value) ?? value;
};

/** FNV-1a over the canonical spec — identical specs share one program cache entry. */
export function customMaterialCacheKey(spec: AuraCustomMaterialSpec): string {
  const canonical = stableSpecStringify({
    glsl: spec.glsl,
    wgsl: spec.wgsl ?? null,
    graphDepth: graphDepthOf(spec) ?? null,
    graphSkinning: graphSkinningOf(spec) ?? null,
    graphStorageLayouts: graphStorageOf(spec) ? { forward: graphStorageOf(spec)!.forwardLayouts, depth: graphStorageOf(spec)!.depthLayouts } : null,
    defines: spec.defines ?? {},
    uniforms: Object.fromEntries(Object.entries(spec.uniforms ?? {}).map(([name, uniform]) => [
      name,
      typeof uniform !== "string" && uniform.type === "data"
        ? { type: uniform.type, dataType: uniform.dataType, value: uniform.value }
        : isRecord(uniform) ? { type: uniform.type, value: normalizeHashableValue(uniform.value) } : uniform
    ])),
    patch: spec.patch ?? {},
    receiveShadow: spec.receiveShadow === true,
    state: customRenderState(spec),
    fog: spec.fog === true
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `custom-${hash.toString(16).padStart(8, "0")}`;
}

/* ------------------------------------------------------------------------- */
/* The material                                                               */
/* ------------------------------------------------------------------------- */

const adapterPreprocessor = new ShaderPreprocessor();
/** shaderKey → live material count, so the global source is released on last dispose. */
const globalSourceRefs = new Map<string, number>();
/** material → authored-name → lowered uniform descriptor (runtime setUniform lookup). */
const publicUniformsByMaterial = new WeakMap<PortableShaderMaterial, ReadonlyMap<string, LoweredUniform>>();
/** Optional public aliases resolve to declared names without changing shader bindings. */
const publicUniformAliasesByMaterial = new WeakMap<PortableShaderMaterial, ReadonlyMap<string, string>>();
/** material → lowered uniform name → live `texture.*` handle bound there (sampler state re-syncs each frame). */
const liveTextureRefsByMaterial = new WeakMap<PortableShaderMaterial, Map<string, { readonly publicName: string; readonly ref: AuraTextureRef }>>();

/** Lowered `u_*` uniform name for an authored uniform name. */
export const customUniformNameFor = (publicName: string): string => publicName.startsWith("u_") ? publicName : `u_${publicName}`;

/** Authored names of the texture2d uniforms declared on a custom material. */
export function customTextureUniformNames(material: PortableShaderMaterial): readonly string[] {
  return [...(publicUniformsByMaterial.get(material)?.values() ?? [])].filter((uniform) => uniform.auraType === "texture2d").map((uniform) => uniform.publicName);
}

function adapterLibraryFor(_name: string): ShaderLibrary {
  // One fresh library per material instance: two materials that lower to the
  // same cache key may coexist (register() throws on duplicate names in a
  // shared library). The process-wide shader pair still lives in the global
  // source store, and the device program cache keys on the shader name, so
  // compilation reuse is preserved.
  return new ShaderLibrary();
}

interface GraphProgramStamp {
  readonly vertex: string;
  readonly fragment: string;
  readonly gpuVertex: string | undefined;
  readonly gpuFragment: string | undefined;
  readonly layout: string;
}

function graphProgramStamp(vertex: string, fragment: string, gpu: PortableShaderSources["wgsl"], bindings?: ShaderSourcePair["portableBindings"]): GraphProgramStamp {
  return { vertex, fragment, gpuVertex: gpu?.vertex, gpuFragment: gpu?.fragment,
    layout: JSON.stringify([gpu?.storageBindings, bindings]) };
}

function graphProgramStampMatches(a: GraphProgramStamp, b: GraphProgramStamp): boolean {
  return a.vertex === b.vertex && a.fragment === b.fragment && a.gpuVertex === b.gpuVertex
    && a.gpuFragment === b.gpuFragment && a.layout === b.layout;
}

// A mesh query cannot execute arbitrary shader code. Only the adapter may
// certify these complete, position-only programs, and only after checking the
// baked program and both shader registries. In particular this is not a
// certificate for an unmounted, mutable material spec.
const POSITION_ONLY_VERTEX = /^\s*void\s+main\s*\(\s*(?:void\s*)?\)\s*\{\s*gl_Position\s*=\s*(?:u_modelViewProjection|modelViewProjectionMatrix|projectionMatrix\s*\*\s*modelViewMatrix|projectionMatrix\s*\*\s*viewMatrix\s*\*\s*modelMatrix)\s*\*\s*vec4\s*\(\s*position\s*,\s*1\.0\s*\)\s*;\s*\}\s*$/;
const POSITION_PROGRAM_IDENTIFIERS = new Set([
  "void", "main", "gl_Position", "u_modelViewProjection", "modelViewProjectionMatrix",
  "projectionMatrix", "viewMatrix", "modelMatrix", "modelViewMatrix", "vec4", "position", "a_position"
]);
const POSITION_FRAME_UNIFORMS = ["u_modelViewProjection", "u_modelMatrix", "u_viewMatrix", "u_projectionMatrix"] as const;
const shaderLibraryGet = ShaderLibrary.prototype.get;

interface PositionQueryPrototype {
  readonly value: object;
  readonly parent: object | null;
  readonly descriptors: PropertyDescriptorMap;
}

interface PositionQueryCertificate {
  readonly key: string;
  readonly library: ShaderLibrary;
  readonly sources: string;
  readonly pair: string;
  readonly prototypes: readonly PositionQueryPrototype[];
}

const positionQueryCertificates = new WeakMap<object, PositionQueryCertificate>();

function dataRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !("value" in descriptors[key]!))) return undefined;
  return value as Record<string, unknown>;
}

function positionSourcesStamp(value: unknown): string | undefined {
  const sources = dataRecord(value);
  const glsl = dataRecord(sources?.glsl);
  if (!sources || !Object.hasOwn(sources, "glsl") || !glsl || !Object.hasOwn(glsl, "vertex") || !Object.hasOwn(glsl, "fragment")
    || typeof glsl.vertex !== "string" || typeof glsl.fragment !== "string") return undefined;
  const wgsl = sources.wgsl === undefined ? undefined : dataRecord(sources.wgsl);
  if (sources.wgsl !== undefined && (!Object.hasOwn(sources, "wgsl") || !wgsl || !Object.hasOwn(wgsl, "vertex")
    || !Object.hasOwn(wgsl, "fragment") || typeof wgsl.vertex !== "string" || typeof wgsl.fragment !== "string"
    || wgsl.storageBindings !== undefined)) return undefined;
  return JSON.stringify([glsl.vertex, glsl.fragment, wgsl?.vertex, wgsl?.fragment]);
}

function positionPairStamp(value: unknown, key: string, sourcesValue: unknown): string | undefined {
  const pair = dataRecord(value);
  const sources = dataRecord(sourcesValue);
  const glsl = dataRecord(sources?.glsl);
  if (!pair || !sources || !glsl || !["name", "marker", "vertex", "fragment"].every((name) => Object.hasOwn(pair, name))
    || !Object.hasOwn(glsl, "vertex") || !Object.hasOwn(glsl, "fragment")
    || typeof glsl.vertex !== "string" || typeof glsl.fragment !== "string" || pair.variants !== undefined) return undefined;
  const marker = `@aura3d-portable:${key}`;
  if (pair.name !== key || pair.marker !== marker || pair.vertex !== withSourceMarker(glsl.vertex, marker)
    || pair.fragment !== withSourceMarker(glsl.fragment, marker)) return undefined;
  const wgsl = sources.wgsl === undefined ? undefined : dataRecord(sources.wgsl);
  const gpu = pair.webgpu === undefined ? undefined : dataRecord(pair.webgpu);
  if (wgsl) {
    if (!gpu || !Object.hasOwn(pair, "webgpu") || !Object.hasOwn(pair, "portableBindings")
      || !Object.hasOwn(gpu, "vertex") || !Object.hasOwn(gpu, "fragment")
      || typeof wgsl.vertex !== "string" || typeof wgsl.fragment !== "string"
      || gpu.vertex !== withSourceMarker(wgsl.vertex, marker) || gpu.fragment !== withSourceMarker(wgsl.fragment, marker)
      || gpu.storageBindings !== undefined || !Array.isArray(pair.portableBindings) || !Object.isFrozen(pair.portableBindings)) return undefined;
    // The adapter's binding array and entries are frozen. Reject nested
    // schemas/accessors instead of trusting a mutable serialized layout.
    for (const entry of pair.portableBindings) {
      const binding = dataRecord(entry);
      if (!binding || !Object.isFrozen(binding) || Object.values(binding).some((field) =>
        field !== undefined && typeof field !== "string" && typeof field !== "number" && typeof field !== "boolean")) return undefined;
    }
  } else if (pair.webgpu !== undefined || pair.portableBindings !== undefined) return undefined;
  return JSON.stringify([pair.name, pair.marker, pair.vertex, pair.fragment, gpu?.vertex, gpu?.fragment, pair.portableBindings]);
}

function positionQueryPrototypes(material: object): readonly PositionQueryPrototype[] {
  const result: PositionQueryPrototype[] = [];
  for (let value = Object.getPrototypeOf(material) as object | null; value && value !== Object.prototype; value = Object.getPrototypeOf(value) as object | null) {
    result.push({ value, parent: Object.getPrototypeOf(value) as object | null, descriptors: Object.getOwnPropertyDescriptors(value) });
  }
  return result;
}

function positionQueryPrototypesMatch(prototypes: readonly PositionQueryPrototype[]): boolean {
  return prototypes.every(({ value, parent, descriptors }) => {
    if (Object.getPrototypeOf(value) !== parent || Reflect.ownKeys(value).length !== Reflect.ownKeys(descriptors).length) return false;
    return Reflect.ownKeys(descriptors).every((key) => {
      const before = Reflect.get(descriptors, key) as PropertyDescriptor;
      const after = Object.getOwnPropertyDescriptor(value, key);
      return after !== undefined && after.value === before.value && after.get === before.get && after.set === before.set
        && after.writable === before.writable && after.enumerable === before.enumerable && after.configurable === before.configurable;
    });
  });
}

function positionOnlyProgram(spec: AuraCustomMaterialSpec, vertexSource: string, uniforms: readonly LoweredUniform[], sources: PortableShaderSources): boolean {
  if (!POSITION_ONLY_VERTEX.test(vertexSource) || Object.keys(spec.defines ?? {}).length || Object.keys(spec.patch ?? {}).length
    || graphDepthOf(spec) || graphSkinningOf(spec) || graphStorageOf(spec)
    || uniforms.some((uniform) => POSITION_PROGRAM_IDENTIFIERS.has(uniform.publicName))
    || (sources.wgsl !== undefined && sources.wgsl.vertex !== DEFAULT_WGSL_VERTEX)) return false;
  // No authored directives/includes are admitted. Reconstruct the exact
  // preprocessor output and adapter-owned prelude; an injected define, patch,
  // or unexpected lowering cannot inherit the certificate.
  const cleanVertex = vertexSource.split(/\r?\n/).filter(Boolean).join("\n");
  return sources.glsl.vertex === injectPreamble(cleanVertex, vertexPreamble(uniforms, vertexSource), "vertex");
}

function certifyPositionQueryMaterial(material: AuraCustomShaderMaterial, library: ShaderLibrary, sources: PortableShaderSources): void {
  if (Object.getPrototypeOf(material) !== AuraCustomShaderMaterial.prototype) return;
  const stamp = positionSourcesStamp(sources);
  const localPair = positionPairStamp(shaderLibraryGet.call(library, material.shaderKey), material.shaderKey, sources);
  const globalPair = positionPairStamp(globalShaderSource(material.shaderKey), material.shaderKey, sources);
  if (stamp && localPair && localPair === globalPair) {
    positionQueryCertificates.set(material, { key: material.shaderKey, library, sources: stamp, pair: localPair, prototypes: positionQueryPrototypes(material) });
  }
}

/** Internal: the currently submitted compiled program still has the position-only contract. */
export function hasPositionQueryCertificate(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  try {
    const certificate = positionQueryCertificates.get(value);
    if (!certificate || Object.getPrototypeOf(value) !== certificate.prototypes[0]?.value
      || !positionQueryPrototypesMatch(certificate.prototypes)) return false;
    if (Reflect.ownKeys(value).some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor || !("value" in descriptor) || typeof descriptor.value === "function";
    })) return false;
    const own = (key: string): unknown => Object.getOwnPropertyDescriptor(value, key)?.value;
    if (own("disposed") !== false || own("shaderKey") !== certificate.key || own("shaderVariant") !== undefined
      || own("shaderLibrary") !== certificate.library || certificate.library.get !== shaderLibraryGet
      || own("graphMaterial") !== false || own("graphDisplaced") !== false || own("graphRequiresWebGPU") !== false
      || own("graphSkinningShaderKeys") !== undefined || own("graphSkinningDepthShaderKeys") !== undefined) return false;
    const parameters = own("parameters");
    if (!(parameters instanceof Map) || Object.getPrototypeOf(parameters) !== Map.prototype || Reflect.ownKeys(parameters).length
      || POSITION_FRAME_UNIFORMS.some((name) => Map.prototype.has.call(parameters, name))) return false;
    const sources = own("sourcesValue");
    return positionSourcesStamp(sources) === certificate.sources
      && positionPairStamp(shaderLibraryGet.call(certificate.library, certificate.key), certificate.key, sources) === certificate.pair
      && positionPairStamp(globalShaderSource(certificate.key), certificate.key, sources) === certificate.pair;
  } catch {
    return false;
  }
}

/**
 * The compiled custom material. `sources` may omit WGSL — such materials are
 * WebGL2-only and the WebGPU device fails closed with `WGSL_PROGRAM_MISSING`.
 */
export class AuraCustomShaderMaterial extends PortableShaderMaterial {
  /** `fog: true` on a fragment stage the fog wrapper could not wrap (no `void main()` or no `out vec4`). */
  private readonly fogUnapplied: boolean;
  /**
   * GU47 E-D (`castShadow: true`): shader-library key of the depth program (this material's baked vertex stage with a
   * depth-only fragment). `DepthPass` draws shadow casters with it, so vertex displacement moves the shadow too.
   */
  readonly customDepthShaderKey: string | undefined;
  override readonly graphSkinningShaderKeys: Readonly<{ four: string; eight: string }> | undefined = undefined;
  override readonly graphSkinningDepthShaderKeys: Readonly<{ four: string; eight: string }> | undefined = undefined;
  private readonly typedGraphSkinningKeys = new Map<string, string>();
  private readonly graphShadowKeys = new Map<string, string>();
  private readonly graphShadowTemplate: PortableShaderSources | undefined;
  private readonly graphClippingSourceStamps = new Map<string, { readonly stamp: GraphProgramStamp; readonly pass: "forward" | "depth" }>();
  private graphClippingTemplateStamp: GraphProgramStamp | undefined;
  private readonly unusedUniformNames: readonly string[];
  /** The author's own GLSL per stage, so a compile error in the assembled program can be mapped back to the author's line (best effort: exact when no `#include` expands before the error line). Read by the renderer's shader-failure diagnostics. */
  readonly shaderAuthoredSource: { readonly vertex: string; readonly fragment: string };

  constructor(spec: AuraCustomMaterialSpec, options: { readonly name?: string } = {}) {
    assertAuraCustomMaterialSpec(spec, options.name ?? "material.custom");
    if (compiledGraphDataSpecs.has(spec) && compiledGraphSpecs.get(spec) !== graphSpecFingerprint(spec)) {
      invalidSpec(options.name ?? "material.custom", "compiled graph data schema or shader sources changed; rebuild the graph material");
    }
    const certifiedGraphSpec = isCertifiedGraphSpec(spec);
    const cacheName = customMaterialCacheKey(spec);
    const name = options.name ? `${options.name}-${cacheName}` : cacheName;
    const uniforms = lowerUniforms(spec);
    const graphStorage = graphStorageOf(spec);
    const includes = bakeIncludes(spec.patch);
    const vertexSource = modernizeVertexAttributes(spec.glsl.vertex ?? DEFAULT_GLSL_VERTEX);
    const customAttributes = declaredCustomAttributes(vertexSource);
    const graphAttributes = declaredGraphAttributes(vertexSource);
    const glslVertex = injectPreamble(
      adapterPreprocessor.preprocess(vertexSource, { defines: spec.defines ?? {}, includes: new AuthorIncludeOnceMap(includes) }).source,
      vertexPreamble(uniforms, vertexSource),
      "vertex"
    );
    const fogged = withSceneFog(spec, withShadowInclude(spec), graphAttributes.length > 0);
    const fragmentSource = fogged.source;
    const glslFragment = injectPreamble(
      adapterPreprocessor.preprocess(fragmentSource, { defines: spec.defines ?? {}, includes: new AuthorIncludeOnceMap(includes) }).source,
      fragmentPreamble(uniforms, fragmentSource),
      "fragment"
    );
    const fullSources: PortableShaderSources = {
      glsl: { vertex: glslVertex, fragment: glslFragment },
      ...(spec.wgsl
        ? {
          wgsl: {
            vertex: wgslStage(spec.wgsl.vertex, DEFAULT_WGSL_VERTEX, spec.patch),
            fragment: wgslStage(spec.wgsl.fragment, "", spec.patch),
            ...(graphStorage ? { storageBindings: graphStorage.forwardLayouts } : {})
          }
        }
        : {})
    };
    const sources = graphAttributes.length ? graphEnvironmentSources(graphShadowSources(fullSources, 0), 0) : fullSources;
    const shaderLibrary = adapterLibraryFor(name);
    super({
      name,
      shaderLibrary,
      sources,
      uniforms,
      renderState: customRenderState(spec),
      requiredAttributes: [...new Set(["a_position", ...customAttributes, ...graphAttributes])],
      ...(graphAttributes.length ? { graphMaterial: true } : {}),
      ...(graphAttributes.length && graphDepthOf(spec) ? { graphDisplaced: true } : {}),
      ...(graphStorage ? { graphStorage: { forward: graphStorage.forward, depth: graphStorage.depth } } : {}),
      ...(/^\s*\/\/ @aura3d-graph-lighting:metallic-roughness\s*$/m.test(vertexSource) ? { graphLightingModel: "metallic-roughness" as const } : {})
    });
    this.graphShadowTemplate = graphAttributes.length ? fullSources : undefined;
    this.fogUnapplied = spec.fog === true && !fogged.applied;
    const depth = graphDepthOf(spec);
    if (graphAttributes.length && spec.castShadow === true && !depth) invalidSpec("material.node", "displaced graph is missing its paired shadow stages");
    const depthVertexSource = depth ? modernizeVertexAttributes(depth.glsl.vertex) : undefined;
    // Alpha-tested graph depth stages read the same uniforms and sampled
    // textures as the forward fragment. Existing opaque depth fragments need
    // no added declarations, preserving their established reflection surface.
    const bakeDepthFragment = (source: string): string => source.includes("// @aura3d-graph-alpha-test")
      ? injectPreamble(adapterPreprocessor.preprocess(source, { defines: spec.defines ?? {}, includes: new AuthorIncludeOnceMap(includes) }).source, fragmentPreamble(uniforms, source), "fragment")
      : source;
    const graphDepthSources: PortableShaderSources | undefined = depth && depthVertexSource
      ? {
        glsl: {
          vertex: injectPreamble(adapterPreprocessor.preprocess(depthVertexSource, { defines: spec.defines ?? {}, includes: new AuthorIncludeOnceMap(includes) }).source, vertexPreamble(uniforms, depthVertexSource), "vertex"),
          fragment: bakeDepthFragment(depth.glsl.fragment)
        },
        wgsl: { vertex: wgslStage(depth.wgsl.vertex, "", spec.patch), fragment: wgslStage(depth.wgsl.fragment, "", spec.patch), ...(graphStorage ? { storageBindings: graphStorage.depthLayouts } : {}) }
      }
      : undefined;
    this.customDepthShaderKey = spec.castShadow === true
      ? acquireCustomDepthSource(this.shaderKey, graphDepthSources?.glsl.vertex ?? glslVertex, graphDepthSources ? this.sourcePair(graphDepthSources, this.bindingsForSources(graphDepthSources)) : undefined)
      : undefined;
    const graphSkinning = graphSkinningOf(spec);
    if (graphSkinning) {
      const bakeVertex = (source: string): string => {
        const modern = modernizeVertexAttributes(source);
        return injectPreamble(adapterPreprocessor.preprocess(modern, { defines: spec.defines ?? {}, includes: new AuthorIncludeOnceMap(includes) }).source, vertexPreamble(uniforms, modern), "vertex");
      };
      const registerVariant = (variant: "four" | "eight", pass: "forward" | "depth"): string => {
        const pair = graphSkinning[variant][pass];
        const variantSources: PortableShaderSources = {
          glsl: { vertex: bakeVertex(pair.glsl.vertex), fragment: pass === "forward" ? glslFragment : bakeDepthFragment(pair.glsl.fragment) },
          wgsl: { vertex: wgslStage(pair.wgsl.vertex, "", spec.patch), fragment: wgslStage(pair.wgsl.fragment, "", spec.patch), ...(graphStorage ? { storageBindings: pass === "forward" ? graphStorage.forwardLayouts : graphStorage.depthLayouts } : {}) }
        };
        const selected = pass === "forward" ? graphEnvironmentSources(graphShadowSources(variantSources, 0), 0) : variantSources;
        return acquirePortableVariant(`${this.shaderKey}/skin-${variant}-${pass}`, selected, this.bindingsForSources(selected));
      };
      this.graphSkinningShaderKeys = { four: registerVariant("four", "forward"), eight: registerVariant("eight", "forward") };
      this.graphSkinningDepthShaderKeys = { four: registerVariant("four", "depth"), eight: registerVariant("eight", "depth") };
    }
    this.shaderAuthoredSource = { vertex: vertexSource, fragment: spec.glsl.fragment };
    const authoredSource = `${spec.glsl.vertex ?? ""}\n${spec.glsl.fragment}`;
    this.unusedUniformNames = uniforms
      .filter((uniform) => !new RegExp(`\\b(?:${uniform.publicName}|${uniform.name})\\b`).test(authoredSource))
      .map((uniform) => uniform.publicName);
    publicUniformsByMaterial.set(this, new Map(uniforms.map((uniform) => [uniform.publicName, uniform])));
    publicUniformAliasesByMaterial.set(this, new Map(Object.entries(spec.uniformAliases ?? {})));
    const liveRefs = new Map<string, { readonly publicName: string; readonly ref: AuraTextureRef }>();
    for (const [publicName, uniform] of Object.entries(spec.uniforms ?? {})) {
      const value = isRecord(uniform) ? uniform.value : undefined;
      if (isAuraTextureRef(value)) liveRefs.set(customUniformNameFor(publicName), { publicName, ref: value });
    }
    if (liveRefs.size > 0) liveTextureRefsByMaterial.set(this, liveRefs);
    registerGlobalShaderSource(this.sourcePair(this.sources));
    globalSourceRefs.set(this.shaderKey, (globalSourceRefs.get(this.shaderKey) ?? 0) + 1);
    // Certification is optional and must never change whether a shader can
    // render. A malformed/mutated candidate simply remains unqueryable.
    try {
      if (positionOnlyProgram(spec, vertexSource, uniforms, this.sources)) certifyPositionQueryMaterial(this, shaderLibrary, this.sources);
    } catch {
      // Fail closed for hostile or concurrently edited source objects.
    }
    if (certifiedGraphSpec && graphAttributes.length && this.graphShadowTemplate && Object.getPrototypeOf(this) === AuraCustomShaderMaterial.prototype) {
      this.graphClippingTemplateStamp = graphProgramStamp(this.graphShadowTemplate.glsl.vertex, this.graphShadowTemplate.glsl.fragment, this.graphShadowTemplate.wgsl);
      this.rememberGraphClippingSource(this.shaderKey, "forward");
      if (this.customDepthShaderKey) this.rememberGraphClippingSource(this.customDepthShaderKey, "depth");
      if (this.graphSkinningShaderKeys) for (const key of Object.values(this.graphSkinningShaderKeys)) this.rememberGraphClippingSource(key, "forward");
      if (this.graphSkinningDepthShaderKeys) for (const key of Object.values(this.graphSkinningDepthShaderKeys)) this.rememberGraphClippingSource(key, "depth");
      const verify = this.graphClippingSourcesValid.bind(this);
      super.certifyGraphClipping((key, pass) => verify(key, pass));
    }
  }

  private rememberGraphClippingSource(key: string, pass: "forward" | "depth"): void {
    if (!this.graphClippingTemplateValid()) return;
    const pair = globalShaderSource(key);
    if (pair?.name === key) this.graphClippingSourceStamps.set(key, { stamp: graphProgramStamp(pair.vertex, pair.fragment, pair.webgpu, pair.portableBindings), pass });
  }

  private graphClippingTemplateValid(): boolean {
    const template = this.graphShadowTemplate, stamp = this.graphClippingTemplateStamp;
    return !!template && !!stamp && graphProgramStampMatches(stamp, graphProgramStamp(template.glsl.vertex, template.glsl.fragment, template.wgsl));
  }

  private graphClippingSourcesValid(key?: string, pass: "forward" | "depth" = "forward"): boolean {
    if (!this.graphClippingTemplateValid()) return false;
    if (key !== undefined && this.graphClippingSourceStamps.get(key)?.pass !== pass) return false;
    for (const [name, recorded] of this.graphClippingSourceStamps) {
      const pair = globalShaderSource(name);
      if (!pair || pair.name !== name || !graphProgramStampMatches(recorded.stamp, graphProgramStamp(pair.vertex, pair.fragment, pair.webgpu, pair.portableBindings))) return false;
    }
    return this.graphClippingSourceStamps.has(this.shaderKey);
  }

  override dispose(): void {
    positionQueryCertificates.delete(this);
    if (this.disposed) return;
    super.dispose();
    releaseGlobalSource(this.shaderKey);
    if (this.customDepthShaderKey) releaseGlobalSource(this.customDepthShaderKey);
    if (this.graphSkinningShaderKeys) for (const key of Object.values(this.graphSkinningShaderKeys)) releaseGlobalSource(key);
    if (this.graphSkinningDepthShaderKeys) for (const key of Object.values(this.graphSkinningDepthShaderKeys)) releaseGlobalSource(key);
    for (const key of this.typedGraphSkinningKeys.values()) releaseGlobalSource(key);
    this.typedGraphSkinningKeys.clear();
    for (const key of this.graphShadowKeys.values()) releaseGlobalSource(key);
    this.graphShadowKeys.clear();
    this.graphClippingSourceStamps.clear();
  }

  override hotReload(sources: PortableShaderSources): void {
    // A reload can replace the material-local program even while the renderer's
    // process-wide pair remains unchanged; require a newly compiled material.
    positionQueryCertificates.delete(this);
    super.hotReload(sources);
  }

  override graphSkinningVariant(influences: 4 | 8, first: GraphJointKind, second: GraphJointKind, pass: "forward" | "depth"): string | undefined {
    if (this.disposed || !this.graphSkinningShaderKeys || !this.graphSkinningDepthShaderKeys) return undefined;
    if (!["float", "uint", "sint"].includes(first) || !["float", "uint", "sint"].includes(second)
      || (influences !== 4 && influences !== 8) || (pass !== "forward" && pass !== "depth")) return undefined;
    const variant = influences === 4 ? "four" : "eight";
    const next = influences === 4 ? "float" : second;
    const keys = pass === "forward" ? this.graphSkinningShaderKeys : this.graphSkinningDepthShaderKeys;
    if (first === "float" && next === "float") return keys[variant];
    const id = `${variant}-${first}-${next}-${pass}`;
    const cached = this.typedGraphSkinningKeys.get(id);
    if (cached) return cached;
    const base = globalShaderSource(keys[variant]);
    if (!base?.webgpu || !base.portableBindings) return undefined;
    const certifiedBase = this.graphClippingSourcesValid(keys[variant], pass);
    const typed: PortableShaderSources = {
      glsl: { vertex: graphTypedJointVertex(base.vertex, "glsl", influences, first, next), fragment: base.fragment },
      wgsl: { ...base.webgpu, vertex: graphTypedJointVertex(base.webgpu.vertex, "wgsl", influences, first, next), fragment: base.webgpu.fragment }
    };
    const key = acquirePortableVariant(`${this.shaderKey}/typed-skin-${id}`, typed, base.portableBindings);
    this.typedGraphSkinningKeys.set(id, key);
    if (certifiedBase) this.rememberGraphClippingSource(key, pass);
    return key;
  }

  override graphShadowVariant(baseShaderKey: string, features: number): string | undefined {
    return this.graphLightingVariant(baseShaderKey, features, 0);
  }

  override graphLightingVariant(baseShaderKey: string, features: number, environment: number): string | undefined {
    if (this.disposed || !this.graphShadowTemplate || !Number.isInteger(features) || features < 0 || features > 255
      || (features & 1) !== 0 && (features & 16) !== 0 || (features & 16) === 0 && (features & 96) !== 0
      || !Number.isInteger(environment) || environment < 0 || environment > 7
      || !baseShaderKey.startsWith(this.shaderKey)) return undefined;
    if (features === 0 && environment === 0) return baseShaderKey;
    const id = `${baseShaderKey}:${features}:${environment}`;
    const cached = this.graphShadowKeys.get(id);
    if (cached) return cached;
    const base = globalShaderSource(baseShaderKey);
    const template = this.graphShadowTemplate;
    if (!base?.webgpu || !template.wgsl) return undefined;
    const certifiedBase = this.graphClippingSourcesValid(baseShaderKey);
    const selected = graphEnvironmentSources(graphShadowSources({
      glsl: { vertex: base.vertex, fragment: template.glsl.fragment },
      wgsl: { ...base.webgpu, vertex: base.webgpu.vertex, fragment: template.wgsl.fragment }
    }, features), environment);
    const suffix = environment === 0 ? `shadows-${features}` : `lighting-${features}-${environment}`;
    const key = acquirePortableVariant(`${baseShaderKey}/${suffix}`, selected, this.bindingsForSources(selected));
    this.graphShadowKeys.set(id, key);
    if (certifiedBase) this.rememberGraphClippingSource(key, "forward");
    return key;
  }

  /**
   * Diagnostics authored-side: a `fog: true` the adapter could not apply is named (`CUSTOM_FOG_UNAPPLIED`), and a
   * texture2d uniform with no texture is named (`CUSTOM_TEXTURE_UNBOUND`) because the shader then samples the
   * renderer's white fallback.
   */
  get customDiagnostics(): readonly string[] {
    const out: string[] = [];
    if (this.fogUnapplied) {
      out.push("[CUSTOM_FOG_UNAPPLIED] material.custom: fog: true needs a fragment stage with `void main()` and an `out vec4` colour output; scene fog was not applied");
    }
    for (const publicName of this.unusedUniformNames) {
      out.push(`[CUSTOM_UNIFORM_UNUSED] material.custom: uniform "${publicName}" is declared but never read by the shader; it is not uploaded and the draw is not skipped`);
    }
    for (const publicName of customTextureUniformNames(this)) {
      const binding = this.getParameter(customUniformNameFor(publicName));
      if (isTextureBinding(binding) && !binding.texture) {
        out.push(`[CUSTOM_TEXTURE_UNBOUND] material.custom: texture uniform "${publicName}" has no texture; the shader samples the white fallback`);
      }
    }
    return out;
  }
}

function releaseGlobalSource(key: string): void {
  const refs = (globalSourceRefs.get(key) ?? 1) - 1;
  if (refs <= 0) {
    globalSourceRefs.delete(key);
    unregisterGlobalShaderSource(key);
  } else {
    globalSourceRefs.set(key, refs);
  }
}

/** Color-encoded depth is consumed when the shadow target has no sampleable depth attachment. */
export const CUSTOM_DEPTH_FRAGMENT_GLSL = "#version 300 es\nprecision highp float;\nout vec4 a3dDepthColor;\nvoid main() {\n  a3dDepthColor = vec4(vec3(gl_FragCoord.z), 1.0);\n}\n";

/** Same marker placement as `PortableShaderMaterial` (after `#version`): the device requires the marker in both stages. */
function withSourceMarker(source: string, marker: string): string {
  const version = source.match(/^(\s*#version[^\n]*\n)/);
  return version ? `${version[1]}// ${marker}\n${source.slice(version[1].length)}` : `// ${marker}\n${source}`;
}

type GraphJointKind = "float" | "uint" | "sint";

/** Strip inactive shadow features before reflection and portable binding layout. */
function graphShadowSources(sources: PortableShaderSources, features: number): PortableShaderSources {
  const cascadeCount = (features & 16) !== 0 ? 1 + ((features >> 5) & 3) : 0;
  const enabled: Readonly<Record<string, boolean>> = {
    directional: (features & 1) !== 0, point: (features & 2) !== 0, spot: (features & 4) !== 0,
    local: (features & 8) !== 0, cascade: cascadeCount > 0, punctual: (features & 6) !== 0, contact: (features & 128) !== 0,
    cascade2: cascadeCount >= 2, cascade3: cascadeCount >= 3, cascade4: cascadeCount >= 4
  };
  const select = (source: string): string => {
    const pattern = /^[ \t]*\/\/ @graph-shadow begin (directional|point|spot|local|cascade|punctual|contact|cascade2|cascade3|cascade4)[ \t]*\n([\s\S]*?)^[ \t]*\/\/ @graph-shadow end \1[ \t]*(?:\n|$)/gm;
    let previous: string;
    do {
      previous = source;
      source = source.replace(pattern, (_match, name: string, body: string) => enabled[name] ? body : "");
    } while (source !== previous);
    if (cascadeCount > 0) {
      source = withSourceMarker(source, `@aura3d-graph-cascades:${cascadeCount}`);
      source = source.replace("uniform mat4 u_graphCascadeMatrices[4];", `uniform mat4 u_graphCascadeMatrices[${cascadeCount}];`)
        .replace("uniform vec4 u_graphCascadeParams[4];", `uniform vec4 u_graphCascadeParams[${cascadeCount}];`)
        .replace("uniform vec4 u_graphCascadeTexels[4];", `uniform vec4 u_graphCascadeTexels[${cascadeCount}];`)
        .replace("uniform vec4 u_graphCascadeSamples[128];", `uniform vec4 u_graphCascadeSamples[${cascadeCount * 32}];`);
    }
    return source;
  };
  return {
    glsl: { vertex: sources.glsl.vertex, fragment: select(sources.glsl.fragment) },
    ...(sources.wgsl ? { wgsl: { ...sources.wgsl, vertex: sources.wgsl.vertex, fragment: select(sources.wgsl.fragment) } } : {})
  };
}

/** Strip environment resources and calculations absent from a draw. */
function graphEnvironmentSources(sources: PortableShaderSources, features: number): PortableShaderSources {
  const enabled: Readonly<Record<string, boolean>> = { probe: (features & 1) !== 0, volume: (features & 2) !== 0, cube: (features & 4) !== 0 };
  const select = (source: string): string => source.replace(
    /^[ \t]*\/\/ @graph-environment begin (probe|volume|cube)[ \t]*\n([\s\S]*?)^[ \t]*\/\/ @graph-environment end \1[ \t]*(?:\n|$)/gm,
    (_match, name: string, body: string) => enabled[name] ? body : ""
  );
  return { glsl: { vertex: sources.glsl.vertex, fragment: select(sources.glsl.fragment) },
    ...(sources.wgsl ? { wgsl: { ...sources.wgsl, vertex: sources.wgsl.vertex, fragment: select(sources.wgsl.fragment) } } : {}) };
}

/** Integer joint IDs are bounded before conversion to the palette helper's
 * float input, preserving the correct clamp for full-width uint/sint values. */
function graphTypedJointVertex(source: string, target: "glsl" | "wgsl", influences: 4 | 8, first: GraphJointKind, second: GraphJointKind): string {
  let result = source;
  const update = (index: 0 | 1, kind: GraphJointKind): void => {
    if (kind === "float") return;
    const variable = target === "glsl" ? (index === 0 ? "a_joints" : "a_joints1") : (index === 0 ? "joints" : "joints1");
    const location = index === 0 ? 5 : 8;
    const vector = kind === "uint" ? "uvec4" : "ivec4";
    const scalar = kind === "uint" ? "u32" : "i32";
    const declaration = target === "glsl" ? `layout(location = ${location}) in vec4 ${variable};` : `@location(${location}) ${variable}: vec4<f32>`;
    const replacement = target === "glsl" ? `layout(location = ${location}) in ${vector} ${variable};` : `@location(${location}) ${variable}: vec4<${scalar}>`;
    if (!result.includes(declaration)) throw new Error(`Graph skinning vertex is missing ${variable} declaration`);
    result = result.replace(declaration, replacement);
    const maxIndex = target === "glsl" ? `max(u_jointCount - 1.0, 0.0)` : `max(aura.u_jointCount - 1.0, 0.0)`;
    const bounded = target === "glsl"
      ? kind === "uint" ? `vec4(min(${variable}, uvec4(uint(${maxIndex}))))` : `vec4(clamp(${variable}, ivec4(0), ivec4(int(${maxIndex}))))`
      : kind === "uint" ? `vec4<f32>(min(${variable}, vec4<u32>(u32(${maxIndex}))))` : `vec4<f32>(clamp(${variable}, vec4<i32>(0), vec4<i32>(i32(${maxIndex}))))`;
    const call = target === "glsl"
      ? index === 0 ? `a3dSkinMatrix${influences}(${variable},` : `, ${variable}, a_weights1)`
      : `auraGraphSkin4(${variable}, ${index === 0 ? "weights" : "weights1"})`;
    const updated = target === "glsl"
      ? index === 0 ? `a3dSkinMatrix${influences}(${bounded},` : `, ${bounded}, a_weights1)`
      : `auraGraphSkin4(${bounded}, ${index === 0 ? "weights" : "weights1"})`;
    if (!result.includes(call)) throw new Error(`Graph skinning vertex is missing ${variable} palette access`);
    result = result.replace(call, updated);
  };
  update(0, first);
  if (influences === 8) update(1, second);
  return result;
}

function acquirePortableVariant(name: string, sources: PortableShaderSources, bindings: NonNullable<ShaderSourcePair["portableBindings"]>): string {
  const marker = `@aura3d-portable:${name}`;
  registerGlobalShaderSource({
    name, marker, vertex: withSourceMarker(sources.glsl.vertex, marker), fragment: withSourceMarker(sources.glsl.fragment, marker),
    ...(sources.wgsl ? { webgpu: { ...sources.wgsl, vertex: withSourceMarker(sources.wgsl.vertex, marker), fragment: withSourceMarker(sources.wgsl.fragment, marker) }, portableBindings: bindings } : {})
  });
  globalSourceRefs.set(name, (globalSourceRefs.get(name) ?? 0) + 1);
  return name;
}

/**
 * GU47 E-D: publishes the depth program of a `castShadow: true` material (the material's baked vertex stage, so author
 * displacement, uniforms and `instanceMatrix` work in the shadow pass, plus `CUSTOM_DEPTH_FRAGMENT_GLSL`) under
 * `<shaderKey>/depth`, ref-counted like the colour program. Returns the key `DepthPass` resolves.
 */
function acquireCustomDepthSource(shaderKey: string, glslVertex: string, graphPair?: ShaderSourcePair): string {
  const name = `${shaderKey}/depth`;
  const marker = `@aura3d-portable:${name}`;
  registerGlobalShaderSource({
    name, marker, vertex: withSourceMarker(glslVertex, marker),
    fragment: withSourceMarker(graphPair?.fragment ?? CUSTOM_DEPTH_FRAGMENT_GLSL, marker),
    ...(graphPair?.webgpu && graphPair.portableBindings ? {
      webgpu: {
        ...graphPair.webgpu,
        vertex: withSourceMarker(graphPair.webgpu.vertex, marker),
        fragment: withSourceMarker(graphPair.webgpu.fragment, marker)
      },
      portableBindings: graphPair.portableBindings
    } : {})
  });
  globalSourceRefs.set(name, (globalSourceRefs.get(name) ?? 0) + 1);
  return name;
}

/** Compile an `AuraCustomMaterialSpec` into a renderer-integrated portable material. */
export function createCustomShaderMaterial(spec: AuraCustomMaterialSpec, name?: string): AuraCustomShaderMaterial {
  return new AuraCustomShaderMaterial(spec, { ...(name ? { name } : {}) });
}

/* ------------------------------------------------------------------------- */
/* Runtime uniform writes (SH-02 handle.setUniform)                           */
/* ------------------------------------------------------------------------- */

/** runtime.id → authored-name → authored value (stored until applied each frame). */
const customUniformWrites = new Map<string, Map<string, AuraUniformValue>>();

export function recordCustomUniformWrite(runtimeId: string, name: string, value: AuraUniformValue): void {
  // Values may be applied on a later frame. Keep authored numeric/aggregate
  // data owned by the queue; live texture handles intentionally stay borrowed.
  const snapshot = value instanceof Texture || isAuraTextureRef(value) || isAssetTextureRef(value)
    ? value : cloneMaterialUniformValue(value);
  let writes = customUniformWrites.get(runtimeId);
  if (!writes) {
    writes = new Map();
    customUniformWrites.set(runtimeId, writes);
  }
  writes.set(name, snapshot);
}

export function customUniformWritesFor(runtimeId: string): ReadonlyMap<string, AuraUniformValue> | undefined {
  return customUniformWrites.get(runtimeId);
}

export function clearCustomUniformWrites(runtimeId: string): void {
  customUniformWrites.delete(runtimeId);
}

const inferTypeFromValue = (value: unknown): AuraCustomUniformType => {
  if (isTextureBinding(value) || isTextureRef(value) || value instanceof Texture || isAssetTextureRef(value)) return "texture2d";
  const scalars = numericArray(value);
  switch (scalars?.length ?? 0) {
    case 2: return "vec2";
    case 3: return "vec3";
    case 4: return "vec4";
    case 9: return "mat3";
    case 16: return "mat4";
    default: return "f32";
  }
};

/**
 * Applies stored writes onto a live custom material without recompiling —
 * `Material.setParameter` updates the uniform packet only; the shader key and
 * program cache entry are untouched, so the program count stays constant.
 */
export function applyCustomUniformWrites(material: PortableShaderMaterial, writes: ReadonlyMap<string, AuraUniformValue>): number {
  const publics = publicUniformsByMaterial.get(material);
  const aliases = publicUniformAliasesByMaterial.get(material);
  let applied = 0;
  for (const [publicName, value] of writes) {
    const lowered = publics?.get(aliases?.get(publicName) ?? publicName);
    const type = lowered?.auraType ?? inferTypeFromValue(value);
    const uniformName = lowered?.name ?? customUniformNameFor(publicName);
    if (!material.uniformSchema.some((uniform) => uniform.name === uniformName)) continue;
    const normalized = type === "data"
      ? normalizeCustomDataValue(lowered!.graphDataType ?? lowered!.dataType!, value, publicName)
      : normalizeCustomUniformValue(type, value, publicName);
    if (isCustomTextureUniformType(type)) {
      // A newly written handle becomes the live ref; any other texture value stops the per-frame sync.
      let refs = liveTextureRefsByMaterial.get(material);
      if (isAuraTextureRef(value)) {
        if (!refs) { refs = new Map(); liveTextureRefsByMaterial.set(material, refs); }
        refs.set(uniformName, { publicName: lowered?.publicName ?? publicName, ref: value });
      } else {
        refs?.delete(uniformName);
      }
    }
    if (type === "data"
      ? materialUniformValuesEqual(material.getRecursiveParameter(uniformName), normalized)
      : uniformValuesEqual(material.getParameters().get(uniformName), normalized)) continue;
    material.setParameter(uniformName, normalized);
    applied += 1;
  }
  return applied;
}

/**
 * Re-derives each live `texture.*` handle's binding (texture + sampler state)
 * and writes it only when it changed, so wrap/filter edits on the handle reach
 * the draw without a program change. `needsUpdate` needs no sync: the binding
 * points at the same device texture, whose revision the device re-uploads.
 */
export function syncCustomTextureRefs(material: PortableShaderMaterial): number {
  const refs = liveTextureRefsByMaterial.get(material);
  if (!refs?.size) return 0;
  let applied = 0;
  for (const [uniformName, { publicName, ref }] of refs) {
    // Staged writes are applied after this sync. Retain an existing binding
    // for a missing or disposed ref so a pending replacement can take effect;
    // an old disposed binding still fails draw validation if none arrives.
    if (!auraTextureRefTexture(ref)) continue;
    const type = publicUniformsByMaterial.get(material)?.get(publicName)?.auraType ?? "texture2d";
    if (!isCustomTextureUniformType(type)) continue;
    const next = normalizeCustomUniformValue(type, ref, publicName);
    if (textureBindingsEqual(material.getParameters().get(uniformName), next)) continue;
    material.setParameter(uniformName, next);
    applied += 1;
  }
  return applied;
}

const samplersEqual = (a: TextureBinding["sampler"], b: TextureBinding["sampler"]): boolean =>
  a.minFilter === b.minFilter && a.magFilter === b.magFilter && a.addressU === b.addressU && a.addressV === b.addressV
  && a.addressW === b.addressW && a.maxAnisotropy === b.maxAnisotropy && a.compare === b.compare && a.mirror === b.mirror;

const pairEqual = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((entry, index) => entry === b[index]);

function textureBindingsEqual(a: unknown, b: unknown): boolean {
  if (!isTextureBinding(a) || !isTextureBinding(b)) return false;
  return a === b || (
    a.texture === b.texture && samplersEqual(a.sampler, b.sampler)
    && pairEqual(a.offset, b.offset) && pairEqual(a.scale, b.scale) && a.rotation === b.rotation
  );
}

const uniformValuesEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (isTextureBinding(a) || isTextureBinding(b)) return textureBindingsEqual(a, b);
  if (typeof a === "number" && typeof b === "number") return a === b;
  const av = numericArray(a);
  const bv = numericArray(b);
  return Boolean(av && bv && av.length === bv.length && av.every((entry, index) => entry === bv[index]));
};

/**
 * Validates a `handle.setUniform(name, value)` call against the node's
 * material spec — throws `invalid-material-spec` when the node is not a custom
 * material, the uniform is undeclared, or the value fails arity/type checks.
 */
export function assertCustomUniformWrite(material: { readonly kind?: string; readonly custom?: AuraCustomMaterialSpec } | undefined, name: string, value: unknown): void {
  if (material?.kind !== "custom" || !material.custom) {
    throw new AuraRuntimeError("invalid-material-spec", "setUniform requires a node material created by material.custom(spec)");
  }
  const aliases = material.custom.uniformAliases;
  const target = aliases && Object.prototype.hasOwnProperty.call(aliases, name) ? aliases[name]! : name;
  const entry = material.custom.uniforms && Object.prototype.hasOwnProperty.call(material.custom.uniforms, target)
    ? material.custom.uniforms[target]
    : undefined;
  if (entry === undefined) {
    throw new AuraRuntimeError("invalid-material-spec", `setUniform: custom material has no declared uniform "${name}"`);
  }
  if (typeof entry !== "string" && entry.type === "data") {
    normalizeCustomDataValue(entry.dataType, value, name);
    return;
  }
  const type = (isRecord(entry) ? entry.type : entry) as AuraCustomUniformType;
  normalizeCustomUniformValue(type, value, name);
}
