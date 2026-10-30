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
 *   - `i32`/`bool` ride the float uniform channel; GLSL aliases emit int()/bool() casts.
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
  globalShaderChunkEntries,
  globalShaderWgslChunkSource,
  isTextureBinding,
  registerGlobalShaderSource,
  unregisterGlobalShaderSource,
  type PortableShaderSources,
  type PortableShaderUniform,
  type MaterialUniformKind,
  type RenderState,
  type UniformValue
} from "@aura3d/rendering";
import type { BlendMode } from "@aura3d/rendering/contracts";
import { AuraRuntimeError } from "./errors.js";
import { assertCustomAttributeName } from "../RootGeometry.js";
import { auraTextureRefTexture } from "../nodes/texture.js";
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

const CUSTOM_UNIFORM_TYPES: readonly AuraCustomUniformType[] = [
  "f32", "i32", "bool", "vec2", "vec3", "vec4", "color3", "mat3", "mat4", "texture2d"
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
    if (typeof type !== "string" || !CUSTOM_UNIFORM_TYPES.includes(type as AuraCustomUniformType)) {
      invalidSpec(owner, `uniform "${name}" has unsupported type ${String(type)} (expected one of ${CUSTOM_UNIFORM_TYPES.join(", ")})`);
    }
    if (isRecord(uniform) && uniform.value !== undefined) {
      normalizeCustomUniformValue(type as AuraCustomUniformType, uniform.value, name);
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
  readonly auraType: AuraCustomUniformType;
  readonly glslType: string;
}

const isTextureRef = (value: unknown): value is { readonly kind: "aura-texture-ref"; readonly id: string } =>
  isRecord(value) && value.kind === "aura-texture-ref" && typeof value.id === "string";

/** `assets.x` texture refs carry a url; the texture itself loads after mount. */
const isAssetTextureRef = (value: unknown): value is AuraAssetRef<"texture"> =>
  isRecord(value) && value.kind === "aura-asset-ref" && value.type === "texture";

/**
 * A `texture.*` handle → a binding over its real device texture with the
 * handle's sampler state. A ref with no backing texture (never uploaded) keeps
 * the fallback-sampling placeholder so the material still compiles.
 */
function bindingForTextureRef(ref: AuraTextureRef, name: string): TextureBinding {
  const texture = auraTextureRefTexture(ref);
  if (!texture) return new TextureBinding({ name, texture: null, required: false });
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

const scalarCount = (type: AuraCustomUniformType): number =>
  type === "f32" || type === "i32" || type === "bool" ? 1
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
  if (type === "texture2d") {
    if (isTextureBinding(value)) return value;
    if (value instanceof Texture) return new TextureBinding({ name, texture: value, required: false });
    if (isAuraTextureRef(value)) return bindingForTextureRef(value, name);
    // Placeholder until `upgradeCustomMaterialTextures` loads the asset's url.
    if (isAssetTextureRef(value)) return new TextureBinding({ name, texture: null, required: false });
    invalidSpec("material.custom", `uniform "${name}" expects a TextureBinding, a texture handle (texture.*), a Texture (for example a render-target colour attachment) or a texture asset ref`);
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
  return normalized.length === 1 ? normalized[0]! : [...normalized];
}

const LOWERED_TYPES: Record<AuraCustomUniformType, { kind: MaterialUniformKind; glsl: string }> = {
  f32: { kind: "float", glsl: "float" },
  i32: { kind: "float", glsl: "float" },   // f32-carried; alias emits int(u_x)
  bool: { kind: "float", glsl: "float" },  // 0/1 — alias emits bool(u_x)
  vec2: { kind: "vec2", glsl: "vec2" },
  vec3: { kind: "vec3", glsl: "vec3" },
  vec4: { kind: "vec4", glsl: "vec4" },
  color3: { kind: "vec3", glsl: "vec3" },
  mat3: { kind: "mat4", glsl: "mat4" },    // padded — alias emits mat3(u_x)
  mat4: { kind: "mat4", glsl: "mat4" },
  texture2d: { kind: "texture2d", glsl: "sampler2D" }
};

const DEFAULT_VALUES: Record<Exclude<AuraCustomUniformType, "texture2d">, UniformValue> = {
  f32: 0, i32: 0, bool: 0,
  vec2: [0, 0], vec3: [0, 0, 0], color3: [1, 1, 1], vec4: [0, 0, 0, 0],
  mat3: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mat4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
};

function lowerUniforms(spec: AuraCustomMaterialSpec): readonly LoweredUniform[] {
  const out: LoweredUniform[] = [];
  for (const [publicName, uniform] of Object.entries(spec.uniforms ?? {})) {
    const auraType = (isRecord(uniform) ? uniform.type : uniform) as AuraCustomUniformType;
    const lowered = LOWERED_TYPES[auraType];
    const uniformName = publicName.startsWith("u_") ? publicName : `u_${publicName}`;
    const value = isRecord(uniform) && uniform.value !== undefined
      ? normalizeCustomUniformValue(auraType, uniform.value, publicName)
      : auraType === "texture2d"
        ? new TextureBinding({ name: uniformName, texture: null, required: false })
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
  return uniforms.map((uniform) => `uniform ${uniform.glslType} ${uniform.name};`);
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
function withSceneFog(spec: AuraCustomMaterialSpec, source: string): { readonly source: string; readonly applied: boolean } {
  if (spec.fog !== true) return { source, applied: false };
  const output = customFragmentOutputName(source);
  if (!output || !AUTHOR_MAIN_PATTERN.test(source)) return { source, applied: false };
  return {
    applied: true,
    source: [
      source.replace(AUTHOR_MAIN_PATTERN, "void a3dAuthorMain()"),
      "#include <a3d_shadow>",
      ...SCENE_FOG_UNIFORM_DECLS,
      "#include <environment_fog_common>",
      "void main() {",
      "  a3dAuthorMain();",
      `  ${output}.rgb = a3dApplyEnvironmentFog(${output}.rgb, a3dFragWorldPosition());`,
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
    defines: spec.defines ?? {},
    uniforms: Object.fromEntries(Object.entries(spec.uniforms ?? {}).map(([name, uniform]) => [
      name,
      isRecord(uniform) ? { type: uniform.type, value: normalizeHashableValue(uniform.value) } : uniform
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
  private readonly unusedUniformNames: readonly string[];
  /** The author's own GLSL per stage, so a compile error in the assembled program can be mapped back to the author's line (best effort: exact when no `#include` expands before the error line). Read by the renderer's shader-failure diagnostics. */
  readonly shaderAuthoredSource: { readonly vertex: string; readonly fragment: string };

  constructor(spec: AuraCustomMaterialSpec, options: { readonly name?: string } = {}) {
    assertAuraCustomMaterialSpec(spec, options.name ?? "material.custom");
    const cacheName = customMaterialCacheKey(spec);
    const name = options.name ? `${options.name}-${cacheName}` : cacheName;
    const uniforms = lowerUniforms(spec);
    const includes = bakeIncludes(spec.patch);
    const vertexSource = modernizeVertexAttributes(spec.glsl.vertex ?? DEFAULT_GLSL_VERTEX);
    const customAttributes = declaredCustomAttributes(vertexSource);
    const glslVertex = injectPreamble(
      adapterPreprocessor.preprocess(vertexSource, { defines: spec.defines ?? {}, includes: new AuthorIncludeOnceMap(includes) }).source,
      vertexPreamble(uniforms, vertexSource),
      "vertex"
    );
    const fogged = withSceneFog(spec, withShadowInclude(spec));
    const fragmentSource = fogged.source;
    const glslFragment = injectPreamble(
      adapterPreprocessor.preprocess(fragmentSource, { defines: spec.defines ?? {}, includes: new AuthorIncludeOnceMap(includes) }).source,
      fragmentPreamble(uniforms, fragmentSource),
      "fragment"
    );
    const sources: PortableShaderSources = {
      glsl: { vertex: glslVertex, fragment: glslFragment },
      ...(spec.wgsl
        ? {
          wgsl: {
            vertex: wgslStage(spec.wgsl.vertex, DEFAULT_WGSL_VERTEX, spec.patch),
            fragment: wgslStage(spec.wgsl.fragment, "", spec.patch)
          }
        }
        : {})
    };
    super({
      name,
      shaderLibrary: adapterLibraryFor(name),
      sources,
      uniforms,
      renderState: customRenderState(spec),
      requiredAttributes: ["a_position", ...customAttributes]
    });
    this.fogUnapplied = spec.fog === true && !fogged.applied;
    this.customDepthShaderKey = spec.castShadow === true ? acquireCustomDepthSource(this.shaderKey, glslVertex) : undefined;
    this.shaderAuthoredSource = { vertex: vertexSource, fragment: spec.glsl.fragment };
    const authoredSource = `${spec.glsl.vertex ?? ""}\n${spec.glsl.fragment}`;
    this.unusedUniformNames = uniforms
      .filter((uniform) => !new RegExp(`\\b(?:${uniform.publicName}|${uniform.name})\\b`).test(authoredSource))
      .map((uniform) => uniform.publicName);
    publicUniformsByMaterial.set(this, new Map(uniforms.map((uniform) => [uniform.publicName, uniform])));
    const liveRefs = new Map<string, { readonly publicName: string; readonly ref: AuraTextureRef }>();
    for (const [publicName, uniform] of Object.entries(spec.uniforms ?? {})) {
      const value = isRecord(uniform) ? uniform.value : undefined;
      if (isAuraTextureRef(value)) liveRefs.set(customUniformNameFor(publicName), { publicName, ref: value });
    }
    if (liveRefs.size > 0) liveTextureRefsByMaterial.set(this, liveRefs);
    registerGlobalShaderSource(this.sourcePair(this.sources));
    globalSourceRefs.set(this.shaderKey, (globalSourceRefs.get(this.shaderKey) ?? 0) + 1);
  }

  override dispose(): void {
    if (this.disposed) return;
    super.dispose();
    releaseGlobalSource(this.shaderKey);
    if (this.customDepthShaderKey) releaseGlobalSource(this.customDepthShaderKey);
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

/** Depth-only fragment of a `castShadow` custom material: the shadow map stores depth; colour is never read. */
export const CUSTOM_DEPTH_FRAGMENT_GLSL = "#version 300 es\nprecision highp float;\nout vec4 a3dDepthColor;\nvoid main() {\n  a3dDepthColor = vec4(1.0);\n}\n";

/** Same marker placement as `PortableShaderMaterial` (after `#version`): the device requires the marker in both stages. */
function withSourceMarker(source: string, marker: string): string {
  const version = source.match(/^(\s*#version[^\n]*\n)/);
  return version ? `${version[1]}// ${marker}\n${source.slice(version[1].length)}` : `// ${marker}\n${source}`;
}

/**
 * GU47 E-D: publishes the depth program of a `castShadow: true` material (the material's baked vertex stage, so author
 * displacement, uniforms and `instanceMatrix` work in the shadow pass, plus `CUSTOM_DEPTH_FRAGMENT_GLSL`) under
 * `<shaderKey>/depth`, ref-counted like the colour program. Returns the key `DepthPass` resolves.
 */
function acquireCustomDepthSource(shaderKey: string, glslVertex: string): string {
  const name = `${shaderKey}/depth`;
  const marker = `@aura3d-portable:${name}`;
  registerGlobalShaderSource({ name, marker, vertex: withSourceMarker(glslVertex, marker), fragment: withSourceMarker(CUSTOM_DEPTH_FRAGMENT_GLSL, marker) });
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
  let writes = customUniformWrites.get(runtimeId);
  if (!writes) {
    writes = new Map();
    customUniformWrites.set(runtimeId, writes);
  }
  writes.set(name, value);
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
  let applied = 0;
  for (const [publicName, value] of writes) {
    const lowered = publics?.get(publicName);
    const type = lowered?.auraType ?? inferTypeFromValue(value);
    const uniformName = lowered?.name ?? customUniformNameFor(publicName);
    if (!material.uniformSchema.some((uniform) => uniform.name === uniformName)) continue;
    const normalized = normalizeCustomUniformValue(type, value, publicName);
    if (type === "texture2d") {
      // A newly written handle becomes the live ref; any other texture value stops the per-frame sync.
      let refs = liveTextureRefsByMaterial.get(material);
      if (isAuraTextureRef(value)) {
        if (!refs) { refs = new Map(); liveTextureRefsByMaterial.set(material, refs); }
        refs.set(uniformName, { publicName, ref: value });
      } else {
        refs?.delete(uniformName);
      }
    }
    if (uniformValuesEqual(material.getParameters().get(uniformName), normalized)) continue;
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
    const next = bindingForTextureRef(ref, publicName);
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
  const entry = material.custom.uniforms?.[name];
  if (entry === undefined) {
    throw new AuraRuntimeError("invalid-material-spec", `setUniform: custom material has no declared uniform "${name}"`);
  }
  const type = (isRecord(entry) ? entry.type : entry) as AuraCustomUniformType;
  normalizeCustomUniformValue(type, value, name);
}
