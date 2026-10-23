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
 *   - `texture2d` accepts a `TextureBinding`; an `AuraTextureRef` lowers to a
 *     non-required binding so the renderer uses its fallback texture.
 *   - `fog` is recorded in `customDiagnostics`, never silently applied.
 */

import {
  PortableShaderMaterial,
  ShaderPreprocessor,
  ShaderLibrary,
  SHADER_CHUNKS,
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
import type { AuraCustomMaterialSpec, AuraCustomUniformType, AuraUniformValue } from "../nodes/types.js";

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
    if (isTextureRef(value)) return new TextureBinding({ name, texture: null, required: false });
    invalidSpec("material.custom", `uniform "${name}" expects a TextureBinding or AuraTextureRef value`);
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

function vertexPreamble(uniforms: readonly LoweredUniform[], userSource: string): string {
  const lines: string[] = [...BUILTIN_DECLS];
  if (!declaresIdentifier(userSource, "a_position")) lines.push("in vec3 a_position;");
  const wantNormal = usesToken(userSource, "normal") && !declaresIdentifier(userSource, "normal");
  const wantUv = usesToken(userSource, "uv") && !declaresIdentifier(userSource, "uv");
  if (wantNormal && !declaresIdentifier(userSource, "a_normal")) lines.push("in vec3 a_normal;");
  if (wantUv && !declaresIdentifier(userSource, "a_uv")) lines.push("in vec2 a_uv;");
  lines.push(...uniformDeclLines(uniforms));
  lines.push(...aliasLines(uniforms, userSource));
  if (usesToken(userSource, "position") && !declaresIdentifier(userSource, "position")) lines.push("#define position a_position");
  if (wantNormal) lines.push("#define normal a_normal");
  if (wantUv) lines.push("#define uv a_uv");
  return lines.join("\n");
}

function fragmentPreamble(uniforms: readonly LoweredUniform[], userSource: string): string {
  return [...BUILTIN_DECLS, ...uniformDeclLines(uniforms), ...aliasLines(uniforms, userSource)].join("\n");
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
  if (stage === "fragment" && !/\bprecision\s+(lowp|mediump|highp)\s+float\s*;/.test(body)) {
    head += "precision highp float;\n";
  }
  return `${head}${preamble}\n${body}`;
}

/** Include map for the adapter bake: built-ins < global `registerShaderChunk` < `patch`. */
function bakeIncludes(patch: Readonly<Record<string, string>> | undefined): Map<string, string> {
  const includes = new Map<string, string>();
  for (const chunk of SHADER_CHUNKS) includes.set(chunk.name, chunk.source);
  for (const [name, source] of globalShaderChunkEntries()) includes.set(name, source);
  for (const [name, source] of Object.entries(patch ?? {})) includes.set(name, source);
  return includes;
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
  private readonly fogRequested: boolean;

  constructor(spec: AuraCustomMaterialSpec, options: { readonly name?: string } = {}) {
    assertAuraCustomMaterialSpec(spec, options.name ?? "material.custom");
    const cacheName = customMaterialCacheKey(spec);
    const name = options.name ? `${options.name}-${cacheName}` : cacheName;
    const uniforms = lowerUniforms(spec);
    const includes = bakeIncludes(spec.patch);
    const vertexSource = modernizeVertexAttributes(spec.glsl.vertex ?? DEFAULT_GLSL_VERTEX);
    const customAttributes = declaredCustomAttributes(vertexSource);
    const glslVertex = injectPreamble(
      adapterPreprocessor.preprocess(vertexSource, { defines: spec.defines ?? {}, includes }).source,
      vertexPreamble(uniforms, vertexSource),
      "vertex"
    );
    const glslFragment = injectPreamble(
      adapterPreprocessor.preprocess(spec.glsl.fragment, { defines: spec.defines ?? {}, includes }).source,
      fragmentPreamble(uniforms, spec.glsl.fragment),
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
    this.fogRequested = spec.fog === true;
    publicUniformsByMaterial.set(this, new Map(uniforms.map((uniform) => [uniform.publicName, uniform])));
    registerGlobalShaderSource(this.sourcePair(this.sources));
    globalSourceRefs.set(this.shaderKey, (globalSourceRefs.get(this.shaderKey) ?? 0) + 1);
  }

  override dispose(): void {
    if (this.disposed) return;
    super.dispose();
    const refs = (globalSourceRefs.get(this.shaderKey) ?? 1) - 1;
    if (refs <= 0) {
      globalSourceRefs.delete(this.shaderKey);
      unregisterGlobalShaderSource(this.shaderKey);
    } else {
      globalSourceRefs.set(this.shaderKey, refs);
    }
  }

  /** Diagnostics authored-side: `fog` is recorded here, never silently applied. */
  get customDiagnostics(): readonly string[] {
    return this.fogRequested ? ["material.custom: fog is not wired to custom shaders — the field is recorded, not applied"] : [];
  }
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
  if (isTextureBinding(value) || isTextureRef(value)) return "texture2d";
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
    const uniformName = lowered?.name ?? (publicName.startsWith("u_") ? publicName : `u_${publicName}`);
    if (!material.uniformSchema.some((uniform) => uniform.name === uniformName)) continue;
    const normalized = normalizeCustomUniformValue(type, value, publicName);
    if (uniformValuesEqual(material.getParameters().get(uniformName), normalized)) continue;
    material.setParameter(uniformName, normalized);
    applied += 1;
  }
  return applied;
}

const uniformValuesEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
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
