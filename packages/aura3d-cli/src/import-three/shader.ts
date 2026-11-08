/**
 * B1 three.js asset bridge: ShaderMaterial / RawShaderMaterial -> `material.custom`.
 *
 * GLTFExporter cannot write a shader material, so the bridge carries a simple one as GLSL instead: the GLB gets a named
 * placeholder slot and the emitted source installs `material.custom(spec)` on it through `model({ materialOverrides })`.
 *
 * The conversion is a pass-through with renamed built-ins, not a shader translator. Aura3D's custom-material prelude
 * already provides three's names (`modelMatrix`, `viewMatrix`, `modelViewMatrix`, `projectionMatrix`, `normalMatrix`,
 * `cameraPosition`, and in the vertex stage `position`, `normal`, `uv`) as `#define` aliases of its own `u_*` / `a_*`
 * inputs, so the bridge only:
 *   - drops a RawShaderMaterial's own declarations of those built-ins (the aliases replace them),
 *   - drops the authored uniform declarations it moves into `spec.uniforms` (the prelude re-declares them),
 *   - lowers GLSL ES 1.00 source to 3.00 (`attribute`/`varying` -> `in`/`out`, `gl_FragColor` -> a declared output,
 *     `texture2D` -> `texture`), because the custom path compiles `#version 300 es`,
 *   - maps a float uniform named like a clock (`time`, `uTime`, `iTime`, `u_time`) to the engine's `uTime`.
 * Anything it cannot carry exactly (three chunk includes, lights/fog uniforms, cube maps, texture or matrix uniforms,
 * custom attributes, vertex colours, wireframe) is refused with reasons, and the bridge keeps hiding those meshes.
 */

import type { ThreeMaterialLike } from "./contract.js";

export type BridgeUniformType = "f32" | "i32" | "bool" | "vec2" | "vec3" | "vec4";

/** JSON-safe subset of `AuraCustomMaterialSpec` the emitter writes verbatim into `material.custom(...)`. */
export interface BridgeCustomMaterialSpec {
  readonly glsl: { readonly vertex: string; readonly fragment: string };
  readonly uniforms?: Readonly<Record<string, { readonly type: BridgeUniformType; readonly value: number | boolean | readonly number[] }>>;
  readonly defines?: Readonly<Record<string, string | number>>;
  readonly transparent?: boolean;
  readonly depthWrite?: boolean;
  readonly depthTest?: boolean;
  readonly side?: "front" | "back" | "double";
  readonly blending?: "normal" | "additive" | "subtractive" | "multiply";
}

export interface BridgeCustomMaterial {
  /** Material slot name in the GLB (the override target). */
  readonly name: string;
  readonly spec: BridgeCustomMaterialSpec;
}

export type ShaderConversion =
  | { readonly ok: true; readonly spec: BridgeCustomMaterialSpec; readonly notes: readonly string[] }
  | { readonly ok: false; readonly reasons: readonly string[] };

const BUILTIN_UNIFORMS = new Set(["modelMatrix", "modelViewMatrix", "projectionMatrix", "viewMatrix", "normalMatrix", "cameraPosition"]);
const BUILTIN_ATTRIBUTES = new Set(["position", "normal", "uv"]);
const CLOCK_NAMES = new Set(["time", "uTime", "iTime", "u_time"]);
const RESOLUTION_NAMES = new Set(["resolution", "uResolution", "iResolution", "u_resolution"]);
/** Names the Aura3D prelude reserves; an authored uniform may not reuse them. */
const RESERVED = new Set(["uTime", "u_time", "uResolution", "u_resolution", "position", "normal", "uv", "gl_Position", "gl_FragCoord", "gl_FragColor", ...BUILTIN_UNIFORMS]);

/** Source constructs that need three's own shader library or inputs the custom path does not provide. */
const UNSAFE_TOKENS: readonly [RegExp, string][] = [
  [/#\s*include\b/, "uses three shader chunks (#include); the custom path has no three chunk library"],
  [/\bsamplerCube\b|\btextureCube\b/, "samples a cube map"],
  [/\bgl_FragData\b/, "writes multiple render targets (gl_FragData)"],
  [/\bgl_FragDepthEXT\b|\bgl_FragDepth\b/, "writes depth"],
  [/\bisOrthographic\b|\blogDepth\w*\b/, "reads three renderer state (isOrthographic / logarithmic depth)"],
  [/\b(?:skinIndex|skinWeight|bindMatrix|boneTexture|morphTarget\w*)\b/, "reads skinning or morph inputs"],
  [/\binstanceMatrix\b|\binstanceColor\b/, "reads per-instance inputs"],
  [/\b(?:uv1|uv2|uv3|tangent)\b/, "reads a second UV set or tangents"]
];

const UNIFORM_DECL = /^[ \t]*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+([^;]+);[ \t]*$/gm;
const ATTRIBUTE_DECL = /^[ \t]*(?:attribute|in)\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*;[ \t]*$/gm;

interface UniformValueLike {
  readonly value?: unknown;
}

interface VecLike { readonly x: number; readonly y: number; readonly z?: number; readonly w?: number; readonly isVector2?: boolean; readonly isVector3?: boolean; readonly isVector4?: boolean }
interface ColorLike { readonly r: number; readonly g: number; readonly b: number; readonly isColor?: boolean }

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** `uniform <type> <name>;` declarations in one stage (array or multi-name declarations come back as `null` names). */
function declaredUniforms(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(UNIFORM_DECL)) {
    const names = match[2]!.split(",").map((part) => part.trim());
    for (const name of names) found.set(name, match[1]!);
  }
  return found;
}

function stripDeclarations(source: string, pattern: RegExp, drop: (type: string, name: string) => boolean): string {
  return source.replace(pattern, (line, type: string, name: string) => (drop(type, name.trim()) ? "" : line));
}

function lowerToGlsl3(source: string, stage: "vertex" | "fragment"): string {
  let out = source
    .replace(/\btexture2D\s*\(/g, "texture(")
    .replace(/\btexture2DLodEXT\s*\(/g, "textureLod(")
    .replace(/\btexture2DProj\s*\(/g, "textureProj(");
  if (stage === "vertex") {
    out = out.replace(/^([ \t]*)attribute(\s+)/gm, "$1in$2").replace(/^([ \t]*)varying(\s+)/gm, "$1out$2");
  } else {
    out = out.replace(/^([ \t]*)varying(\s+)/gm, "$1in$2");
    if (/\bgl_FragColor\b/.test(out)) out = `out highp vec4 a3dThreeFragColor;\n${out.replace(/\bgl_FragColor\b/g, "a3dThreeFragColor")}`;
  }
  return out;
}

function uniformValue(name: string, declared: string | undefined, uniform: UniformValueLike | undefined): { type: BridgeUniformType; value: number | boolean | readonly number[] } | string {
  const value = uniform?.value;
  if (declared === undefined) return `uniform "${name}" is not declared as a single uniform`;
  if (declared === "float" && typeof value === "number") return { type: "f32", value: round(value) };
  if (declared === "int" && typeof value === "number") return { type: "i32", value: Math.trunc(value) };
  if (declared === "bool" && typeof value === "boolean") return { type: "bool", value };
  if (value && typeof value === "object") {
    const color = value as ColorLike;
    if (color.isColor && declared === "vec3") return { type: "vec3", value: [round(color.r), round(color.g), round(color.b)] };
    const vec = value as VecLike;
    if (vec.isVector2 && declared === "vec2") return { type: "vec2", value: [round(vec.x), round(vec.y)] };
    if (vec.isVector3 && declared === "vec3") return { type: "vec3", value: [round(vec.x), round(vec.y), round(vec.z ?? 0)] };
    if (vec.isVector4 && declared === "vec4") return { type: "vec4", value: [round(vec.x), round(vec.y), round(vec.z ?? 0), round(vec.w ?? 0)] };
  }
  const kind = value === undefined || value === null ? "no value" : (value as { isTexture?: boolean }).isTexture ? "a texture" : Array.isArray(value) ? "an array" : typeof value === "object" ? ((value as { constructor?: { name?: string } }).constructor?.name ?? "an object") : typeof value;
  return `uniform "${name}" (${declared}) holds ${kind}; only float, int, bool, vec2/3/4 and Color values are carried`;
}

function sideName(side: unknown): BridgeCustomMaterialSpec["side"] | undefined {
  return side === 1 ? "back" : side === 2 ? "double" : undefined;
}

function blendingName(blending: unknown): BridgeCustomMaterialSpec["blending"] | null | undefined {
  if (blending === undefined || blending === 1) return undefined;
  if (blending === 2) return "additive";
  if (blending === 3) return "subtractive";
  if (blending === 4) return "multiply";
  return null;
}

const MAIN = /\bvoid\s+main\s*\(\s*(?:void)?\s*\)/;

/**
 * three writes a ShaderMaterial's colour to the canvas as-is (no colour-space or tone-mapping chunk), while Aura3D
 * encodes every material's output linear -> sRGB. Decoding at the end of the author's `main` makes the two agree
 * exactly under an untone-mapped output, and closely under ACES/AgX (mid-tones within a few code values).
 */
function withDisplayDecode(fragment: string, output: string): string {
  return `${fragment.replace(MAIN, "void a3dThreeMain()")}
vec3 a3dThreeSrgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void main() {
  a3dThreeMain();
  ${output}.rgb = a3dThreeSrgbToLinear(max(${output}.rgb, vec3(0.0)));
}`;
}

/**
 * Convert one ShaderMaterial / RawShaderMaterial. Pure string work over the material's own fields, so it runs in the
 * headless export and in unit tests without three.
 */
export function convertShaderMaterial(material: ThreeMaterialLike): ShaderConversion {
  const reasons: string[] = [];
  const notes: string[] = [];
  const raw = material.type === "RawShaderMaterial" || material.isRawShaderMaterial === true;
  let vertex = typeof material.vertexShader === "string" ? material.vertexShader : "";
  let fragment = typeof material.fragmentShader === "string" ? material.fragmentShader : "";
  if (!fragment.trim()) reasons.push("has no fragment shader");
  if (!vertex.trim()) reasons.push("has no vertex shader");
  if (material.lights === true) reasons.push("sets lights: true (needs three's light uniforms)");
  if (material.fog === true) reasons.push("sets fog: true (needs three's fog uniforms)");
  if (material.wireframe === true) reasons.push("draws wireframe");
  if (material.vertexColors === true) reasons.push("reads vertex colours");
  if (material.clipping === true) reasons.push("uses clipping planes");
  if (material.glslVersion !== undefined && material.glslVersion !== null && material.glslVersion !== "100" && material.glslVersion !== "300 es") {
    reasons.push(`unknown glslVersion ${String(material.glslVersion)}`);
  }
  for (const [pattern, why] of UNSAFE_TOKENS) if (pattern.test(vertex) || pattern.test(fragment)) reasons.push(why);
  const blending = blendingName(material.blending);
  if (blending === null) reasons.push("uses custom or no blending");

  const glsl3 = material.glslVersion === "300 es" || /^\s*#version\s+300\s+es/m.test(vertex) || /^\s*#version\s+300\s+es/m.test(fragment);
  vertex = vertex.replace(/^\s*#version[^\n]*\n?/m, "");
  fragment = fragment.replace(/^\s*#version[^\n]*\n?/m, "");

  // Vertex attributes: only the three built-ins the prelude provides.
  for (const match of vertex.matchAll(ATTRIBUTE_DECL)) {
    const name = match[2]!;
    if (!BUILTIN_ATTRIBUTES.has(name)) reasons.push(`declares custom attribute "${name}"`);
    else if (!raw) reasons.push(`redeclares built-in attribute "${name}"`);
  }
  if (raw) {
    vertex = stripDeclarations(vertex, ATTRIBUTE_DECL, (_type, name) => BUILTIN_ATTRIBUTES.has(name));
  }

  // Uniforms: built-ins come from the prelude; authored ones move into spec.uniforms.
  const declared = new Map([...declaredUniforms(vertex), ...declaredUniforms(fragment)]);
  const authored = (material.uniforms ?? {}) as Record<string, UniformValueLike>;
  const uniforms: Record<string, { type: BridgeUniformType; value: number | boolean | readonly number[] }> = {};
  const rename = new Map<string, string>();
  for (const [name, type] of declared) {
    if (!/^[A-Za-z_]\w*$/.test(name)) { reasons.push(`declares an array or multi-name uniform (${name})`); continue; }
    if (BUILTIN_UNIFORMS.has(name)) {
      if (!raw) reasons.push(`redeclares built-in uniform "${name}"`);
      continue;
    }
    if (type === "float" && CLOCK_NAMES.has(name)) {
      rename.set(name, "uTime");
      notes.push(`uniform "${name}" is driven by the Aura3D clock (uTime, seconds since mount) instead of the three.js loop`);
      continue;
    }
    if (type === "vec2" && RESOLUTION_NAMES.has(name)) {
      rename.set(name, "uResolution");
      notes.push(`uniform "${name}" reads the Aura3D canvas size (uResolution)`);
      continue;
    }
    if (RESERVED.has(name) || name.startsWith("a3d") || name.startsWith("u_a3d")) { reasons.push(`uniform "${name}" collides with an Aura3D built-in`); continue; }
    if (/^sampler/.test(type)) { reasons.push(`uniform "${name}" is a ${type} (texture uniforms are not carried)`); continue; }
    const converted = uniformValue(name, type, authored[name]);
    if (typeof converted === "string") { reasons.push(converted); continue; }
    uniforms[name] = converted;
  }
  if (Object.keys(uniforms).length > 0) notes.push(`uniform values are the export-time values (${Object.keys(uniforms).join(", ")}); drive them at runtime with the node's setUniform`);
  if (reasons.length > 0) return { ok: false, reasons: [...new Set(reasons)] };

  const dropUniform = (_type: string, name: string): boolean => BUILTIN_UNIFORMS.has(name) || rename.has(name) || name in uniforms;
  vertex = stripDeclarations(vertex, UNIFORM_DECL, dropUniform);
  fragment = stripDeclarations(fragment, UNIFORM_DECL, dropUniform);
  for (const [from, to] of rename) {
    if (from === to) continue;
    const token = new RegExp(`\\b${from}\\b`, "g");
    vertex = vertex.replace(token, to);
    fragment = fragment.replace(token, to);
  }
  // three's normalMatrix is the view-space normal matrix (inverse-transpose of modelViewMatrix); the Aura3D prelude's
  // is world-space. Rotating it by the view matrix restores three's meaning (exact for a rigid view transform).
  const viewNormal = (source: string): string => (/\bnormalMatrix\b/.test(source)
    ? `#define a3dThreeNormalMatrix (mat3(viewMatrix) * normalMatrix)\n${source.replace(/\bnormalMatrix\b/g, "a3dThreeNormalMatrix")}`
    : source);
  vertex = viewNormal(vertex);
  fragment = viewNormal(fragment);
  if (!glsl3) {
    vertex = lowerToGlsl3(vertex, "vertex");
    fragment = lowerToGlsl3(fragment, "fragment");
  }
  const output = /\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+(\w+)\s*;/.exec(fragment)?.[1];
  if (!output) return { ok: false, reasons: ["fragment stage declares no vec4 output"] };
  if (!MAIN.test(fragment)) return { ok: false, reasons: ["fragment stage has no plain void main()"] };
  fragment = withDisplayDecode(fragment, output);
  notes.push("output is sRGB-decoded so Aura3D's output encode shows the values three wrote to the canvas; under a tone-mapped output Aura3D also tone-maps it (three does not tone-map a ShaderMaterial without its tonemapping chunk)");

  const defines: Record<string, string | number> = {};
  for (const [key, value] of Object.entries((material.defines ?? {}) as Record<string, unknown>)) {
    if (value === false) continue;
    if (!/^[A-Za-z_]\w*$/.test(key) || !["string", "number", "boolean"].includes(typeof value)) return { ok: false, reasons: [`define "${key}" is not a plain value`] };
    defines[key] = typeof value === "number" ? value : String(value);
  }
  const side = sideName(material.side);
  const spec: BridgeCustomMaterialSpec = {
    glsl: { vertex: vertex.trim() + "\n", fragment: fragment.trim() + "\n" },
    ...(Object.keys(uniforms).length > 0 ? { uniforms } : {}),
    ...(Object.keys(defines).length > 0 ? { defines } : {}),
    ...(material.transparent === true ? { transparent: true } : {}),
    ...(material.depthWrite === false ? { depthWrite: false } : {}),
    ...(material.depthTest === false ? { depthTest: false } : {}),
    ...(side ? { side } : {}),
    ...(blending ? { blending } : {})
  };
  return { ok: true, spec, notes };
}
