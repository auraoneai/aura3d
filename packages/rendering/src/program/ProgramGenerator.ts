/**
 * `program/ProgramGenerator.ts` (PRD-01 §6.4, §8.1, §8.5, §8.7) — C-02 real impl.
 *
 * Assembles GLSL ES 3.00 vertex+fragment sources from a normalized
 * `ProgramFeatures` record:
 *   `#version 300 es`, precision, `#define` block, lane-01 chunks
 *   (common/colorspace/brdf/normal/instancing/alpha/lights_legacy/
 *   indirect_default/fog_default/depth) with registered C-02 chunks spliced
 *   at the hook points in `(feature.order, feature.id)` order.
 *
 * Splice convention (pars/call split, T0-05): a ShaderFeature's `chunks[i]`
 * lands at `hooks[min(i, hooks.length - 1)]`.
 *   - Declaration hooks (`vertex:pars`, `vertex:deform`, `fragment:pars`) emit
 *     the chunk at global scope before `main`.
 *   - Body hooks emit the chunk (a *call* chunk: statements only) inside
 *     `main`; its `requires` closure is emitted at global scope.
 *   - `requires` are resolved requires-first (depth-first post-order), each
 *     chunk at most once per stage. `brdf`/`common` name the built-in lane-01
 *     chunks. A missing or cyclic `requires` throws (`SHADER_CHUNK_MISSING` /
 *     `SHADER_CHUNK_CYCLE`), which the cache reports as C-36
 *     `program-compile-failed`. Missing chunks are never skipped silently.
 *   - `fragment:indirect` contributions are appended after the default
 *     indirect body (ambient + env); every other body hook that a feature
 *     claims replaces that hook's default. One exception (E3 stage-2b):
 *     under A3D_QR_COMPILER ∧ A3D_QR_LIGHTING the `prd02.ibl` contribution
 *     REPLACES the default indirect body instead of appending to it.
 * The `vertex:deform` call is canonical: the generator emits
 * `a3dDeform(pos, nrm, tan)` when a registered feature claims the hook and
 * the C-18 passthrough otherwise (CONTRACTS §8.5).
 *
 * C-03 lobes (lit forward programs): `chunks.pars` is emitted at global scope,
 * `chunks.fragment` is a call chunk at `fragment:material` (after
 * `PhysicalMaterial material` exists), and `chunks.ibl` is a call chunk
 * appended to `fragment:indirect`. A record's extension matches a lobe by
 * `lobe.id` or `lobe.glTFExtension`. Each active lobe defines
 * `A3D_LOBE_<ID>` (plus `A3D_LOBE_<ID>_<BIT>` for truthy bits) so chunk
 * guards follow the record.
 *
 * Unknown extensions (`features.extensions` with no matching C-03 lobe in
 * `materialLobes`) record `extension-lobe-pending` (`ownerPrd: 4`) into
 * `programDegradationLog` and through the optional sink.
 */

import type { QrFlags } from "../contracts/core";
import type { ShaderFeature, ShaderHookPoint, ProgramFeatures, GeneratedProgram } from "../contracts/program";
import { shaderChunk, shaderFeaturesFor, installProgramGenerator } from "../contracts/program";
import { materialLobes } from "../contracts/materialLobes";
import { COMMON_CHUNK_GLSL } from "./chunks/common.glsl";
import { BRDF_CHUNK_GLSL } from "./chunks/brdf.glsl";
import { NORMAL_CHUNK_GLSL } from "./chunks/normal.glsl";
import { INSTANCING_VERTEX_PARS_GLSL, INSTANCING_VERTEX_BODY_GLSL } from "./chunks/instancing.glsl";
import { ALPHA_CHUNK_GLSL } from "./chunks/alpha.glsl";
import { LIGHTS_LEGACY_CHUNK_GLSL } from "./chunks/lights_legacy.glsl";
import { SHADOW_FORWARD_CHUNK_GLSL, SHADOW_LOCAL_CHUNK_GLSL } from "./chunks/shadow_forward.glsl";
import { INDIRECT_DEFAULT_CHUNK_GLSL } from "./chunks/indirect_default.glsl";
import { FOG_DEFAULT_CHUNK_GLSL } from "./chunks/fog_default.glsl";
import { DEPTH_CHUNK_GLSL, DISTANCE_CHUNK_PARS_GLSL } from "./chunks/depth.glsl";
import { normalizeProgramFeatures, totalLightCount, MAP_DEFINES, PROGRAM_OUTPUT_SRGB_FEATURE } from "./ProgramFeatures";
import { programKey } from "./ProgramKey";
import { PRD02_IBL_FEATURE } from "../contracts/environment";

export const GENERATED_PROGRAM_MARKER = "a3d-generated-program";

/**
 * The encode the HDR chain applies at presentation, for programs that draw to the canvas themselves: r185
 * ACESFilmicToneMapping (exposure 1, as `OutputPass` / the legacy tone pass) followed by the sRGB OETF. The operator body
 * is the one in `output/ToneMappingOperators.glsl.ts`.
 */
export const OUTPUT_SRGB_CHUNK_GLSL = `vec3 a3dRRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 a3dAcesFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  color /= 0.6;
  color = ACESInputMat * color;
  color = a3dRRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 a3dEncodeForCanvas(vec3 linear) {
  vec3 c = clamp(a3dAcesFilmic(max(linear, vec3(0.0))), 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}`;

export interface ProgramDegradation {
  readonly code: "extension-lobe-pending" | "program-compile-failed";
  readonly message: string;
  readonly ownerPrd?: number;
}

/** Process-local log of generator-recorded degradations (drained by diagnostics/tests). */
export const programDegradationLog: ProgramDegradation[] = [];

export interface GenerateProgramOptions {
  readonly flags?: QrFlags;
  readonly onDegradation?: (degradation: ProgramDegradation) => void;
}

/** Lane-11 WGSL emitter hook: registered via `registerProgramWgslEmitter`. */
let wgslEmitter: ((features: ProgramFeatures) => GeneratedProgram) | undefined;
export function registerProgramWgslEmitter(emitter: (features: ProgramFeatures) => GeneratedProgram): void {
  wgslEmitter = emitter;
}

type FeatureValue = string | number | boolean;

interface Contribution {
  readonly feature: ShaderFeature;
  readonly value: FeatureValue;
}

/**
 * E3 conjunction (stages 1/2a/2b): `A3D_QR_COMPILER` ∧ `A3D_QR_LIGHTING`.
 * The generator is the last enforcement point for the stage-2b indirect-body
 * replacement — a `prd02.ibl` bit in a record must never splice (or replace)
 * anything conjunction-off, however the record was built.
 */
function e3CompilerLightingOn(flags: QrFlags | undefined): boolean {
  return flags !== undefined && flags.on("A3D_QR_COMPILER") && flags.on("A3D_QR_LIGHTING");
}

/** Resolve contributing features from the record's `features` bits, in (order, id) order. */
function contributingFeatures(f: ProgramFeatures, flags: QrFlags | undefined): Contribution[] {
  const out: Contribution[] = [];
  if (!flags) return out;
  for (const feature of shaderFeaturesFor(flags)) {
    if (feature.id === PRD02_IBL_FEATURE && !e3CompilerLightingOn(flags)) continue;
    const value = f.features[feature.id];
    if (value !== undefined) out.push({ feature, value });
  }
  return out;
}

function definesFor(f: ProgramFeatures, contributions: readonly Contribution[]): Record<string, string | number | true> {
  const d: Record<string, string | number | true> = {};
  // Chunk-guard vocabulary for registered chunks (T0-05): generated program,
  // lit forward shading, and the bucketed direct-light count a lobe call chunk
  // may loop over with `a3dLegacyLightRadiance` (0 on the clustered path).
  d.A3D_GENERATED_PROGRAM = true;
  if (f.pass === "forward" && f.lighting === "lit") d.A3D_LIT = true;
  d.A3D_NUM_DIRECT_LIGHTS = directLightLoopBound(f);
  if (f.instancing) {
    d.USE_INSTANCING = true;
    if (f.instancing.color) d.USE_INSTANCING_COLOR = true;
    if (f.instancing.emissive) d.USE_INSTANCING_EMISSIVE = true;
  }
  if (f.vertexColors) d.VERTEX_COLORS = true;
  for (const [slot, define] of MAP_DEFINES) {
    const map = f.maps[slot];
    if (!map) continue;
    d[define] = true;
    if (map.uvSet === 1) d[`${define}_UV1`] = true;
    if (map.transform) d[`${define}_TRANSFORM`] = true;
  }
  if (f.maps.normal) d.USE_NORMAL_MAP = true;
  if (f.alphaMode === "mask") d.ALPHA_MASK = true;
  if (f.alphaMode === "blend") d.ALPHA_BLEND = true;
  if (f.doubleSided) d.DOUBLE_SIDED = true;
  if (f.flatShading) d.FLAT_SHADING = true;
  if (f.diffuseModel === "burley") d.DIFFUSE_BURLEY = true;
  if (f.specularAntialiasing) d.SPECULAR_AA = true;
  if (f.backgroundCoverage) d.BACKGROUND_COVERAGE = true;
  if (f.environment === "equirect") d.ENVMAP_TYPE_EQUIRECT = true;
  if (f.environment === "pmrem-cube") d.ENVMAP_TYPE_CUBE_UV = true;
  // Either sampler provides a3dSampleEnvironment (indirect_default); the
  // default indirect body and C-03 lobe IBL calls guard on this.
  if (f.environment !== "none") d.A3D_ENV_SAMPLE = true;
  if (f.fog === "linear") d.FOG_LINEAR = true;
  if (f.fog === "exp2" || f.fog === "height") d.FOG_EXP2 = true;
  if (f.fog === "height") d.FOG_HEIGHT = true;
  if (f.skinning) d.USE_SKINNING = true;
  if (f.morph) d.USE_MORPH = true;
  if (f.drawId) d.USE_DRAW_ID = true;
  // #1140: clustering follows the pass's resolved cluster resources only
  // (ForwardPass: more than FORWARD_DIRECT_LIGHT_CAPACITY lights). Up to 16
  // lights live in u_lightData; a bucket sum above 8 is not "clustered".
  if (f.lights.clustered) {
    d.LIGHTS_CLUSTERED = true;
  } else {
    d.NUM_DIR_LIGHTS = f.lights.dir;
    d.NUM_POINT_LIGHTS = f.lights.point;
    d.NUM_SPOT_LIGHTS = f.lights.spot;
    d.NUM_RECT_LIGHTS = f.lights.rect;
  }
  if (f.lights.hemisphere) d.LIGHT_HEMISPHERE = true;
  if (f.shadows.cascades > 0) d.NUM_SHADOW_CASCADES = f.shadows.cascades;
  if (f.shadows.pcfTaps > 1) d.SHADOW_PCF_TAPS = f.shadows.pcfTaps;
  if (f.shadows.localShadows > 0) d.NUM_LOCAL_SHADOWS = f.shadows.localShadows;
  if (f.shadows.contact) d.SHADOW_CONTACT = true;
  for (const { feature, value } of contributions) {
    Object.assign(d, feature.defines(value));
  }
  return d;
}

/** Lane-01 chunks emitted at fixed slots; registered chunks may `require` them by name. */
const BUILTIN_CHUNKS: ReadonlySet<string> = new Set(["brdf", "common"]);

/** Hooks whose chunks are global-scope declarations (everything else is a body hook inside `main`). */
const DECLARATION_HOOKS: ReadonlySet<ShaderHookPoint> = new Set<ShaderHookPoint>(["vertex:pars", "vertex:deform", "fragment:pars"]);

/** Per-stage splice state: global declarations in requires-first order, deduped by chunk name. */
interface SpliceState {
  readonly seen: Set<string>;
  readonly decls: string[];
  /** Built-in chunk names some spliced chunk required. */
  readonly builtins: Set<string>;
}

function newSpliceState(): SpliceState {
  return { seen: new Set(), decls: [], builtins: new Set() };
}

function requireChunk(name: string, requiredBy: string | undefined): NonNullable<ReturnType<typeof shaderChunk>> {
  const chunk = shaderChunk(name);
  if (!chunk) throw new Error(`SHADER_CHUNK_MISSING:${name}${requiredBy ? ` (required by ${requiredBy})` : ""}`);
  return chunk;
}

/** Emit `name` and its `requires` closure at global scope, requires first (depth-first post-order). */
function emitDeclaration(state: SpliceState, name: string, path: readonly string[] = []): void {
  if (BUILTIN_CHUNKS.has(name)) {
    state.builtins.add(name);
    return;
  }
  if (state.seen.has(name)) return;
  if (path.includes(name)) throw new Error(`SHADER_CHUNK_CYCLE:${[...path, name].join(" > ")}`);
  const chunk = requireChunk(name, path[path.length - 1]);
  for (const req of chunk.requires ?? []) emitDeclaration(state, req, [...path, name]);
  state.seen.add(name);
  state.decls.push(chunk.glsl);
}

/** A call chunk: its `requires` go to global scope; its own GLSL is returned for `main`. */
function emitCall(state: SpliceState, name: string): string {
  const chunk = requireChunk(name, undefined);
  for (const req of chunk.requires ?? []) emitDeclaration(state, req, [name]);
  return chunk.glsl;
}

/**
 * Splice one hook in (feature.order, feature.id) order. Declaration hooks
 * append to `state.decls` and return []; body hooks return the call chunks
 * for `main` (each at most once per hook). A chunk the same feature also maps
 * to a declaration hook is a declaration chunk: at a body hook it is declared
 * for this stage instead of being spliced into `main` (e.g. a `stage:"both"`
 * chunk listed at `vertex:pars` + `fragment:material`).
 */
function hookSplice(contributions: readonly Contribution[], hook: ShaderHookPoint, state: SpliceState): string[] {
  const bodies: string[] = [];
  const bodySeen = new Set<string>();
  const declaration = DECLARATION_HOOKS.has(hook);
  for (const { feature } of contributions) {
    const idx = feature.hooks.indexOf(hook);
    if (idx === -1 || feature.chunks.length === 0) continue;
    const chunkAt = (i: number) => feature.chunks[Math.min(i, feature.chunks.length - 1)];
    const chosen = chunkAt(idx);
    if (chosen === undefined) continue;
    const declaredByFeature = feature.hooks.some((h, i) => DECLARATION_HOOKS.has(h) && chunkAt(i) === chosen);
    if (declaration || declaredByFeature) {
      emitDeclaration(state, chosen);
    } else if (!bodySeen.has(chosen)) {
      bodySeen.add(chosen);
      bodies.push(emitCall(state, chosen));
    }
  }
  return bodies;
}

function hasHookContributor(contributions: readonly Contribution[], hook: ShaderHookPoint): boolean {
  return contributions.some(({ feature }) => feature.hooks.includes(hook));
}

const VERTEX_ATTRIBUTES = `layout(location = 0) in vec3 a_position;
#ifdef A3D_NEED_NORMAL
layout(location = 1) in vec3 a_normal;
#endif
#ifdef A3D_NEED_UV0
layout(location = 2) in vec2 a_uv;
#endif
#ifdef A3D_NEED_UV1
layout(location = 7) in vec2 a_uv1;
#endif
#ifdef VERTEX_COLORS
layout(location = 4) in vec4 a_color;
#endif`;

function vertexSource(f: ProgramFeatures, contributions: readonly Contribution[], defines: Record<string, string | number | true>, marker: string): string {
  // Stage define: `both`-stage chunks branch on A3D_STAGE_VERTEX (C-02 §8.5).
  const localDefines = { ...defines, A3D_STAGE_VERTEX: true as const };
  const state = newSpliceState();
  // vertex:pars + vertex:deform contributors declare at global scope (the
  // deform chunk declares a3dDeform(); the call is canonical inside main(),
  // C-18, CONTRACTS §8.5).
  hookSplice(contributions, "vertex:pars", state);
  hookSplice(contributions, "vertex:deform", state);
  const worldHooks = hookSplice(contributions, "vertex:world", state);
  const endHooks = hookSplice(contributions, "vertex:end", state);
  if (state.builtins.has("brdf")) throw new Error("SHADER_CHUNK_STAGE:brdf is fragment-only (required by a vertex hook chunk)");
  const deformCall = hasHookContributor(contributions, "vertex:deform")
    ? "  a3dDeform(a3dDeformPos, objectNormal, objectTangent);  // C-18"
    : "  // C-18 passthrough: no deform chunk registered";

  const decls = [
    "#version 300 es",
    `// ${marker}`,
    // L5/PRD-11: `gl_DrawID` needs the pragma; `: warn` keeps unsupported
    // drivers compiling (the feature chunk then uses the `u_drawId` loop).
    ...((localDefines as Record<string, unknown>)["A3D_L5_MULTI_DRAW"] || (localDefines as Record<string, unknown>)["A3D_PRD11_MULTI_DRAW_EXT"] ? ["#extension GL_ANGLE_multi_draw : warn"] : []),
    "precision highp float;",
    emitDefines(localDefines),
    COMMON_CHUNK_GLSL,
    "uniform mat4 u_modelMatrix;",
    "uniform mat4 u_geometryMatrix;",
    "uniform mat4 u_normalMatrix;",
    "uniform float u_pointSize;",
    VERTEX_ATTRIBUTES,
    INSTANCING_VERTEX_PARS_GLSL,
    ...state.decls,
    "out vec3 v_worldPosition;",
    "#ifdef A3D_NEED_NORMAL\nout vec3 v_normal;\n#endif",
    "#ifdef A3D_NEED_UV0\nout vec2 v_uv;\n#endif",
    "#ifdef A3D_NEED_UV1\nout vec2 v_uv1;\n#endif",
    "#ifdef VERTEX_COLORS\nout vec4 v_color;\n#endif",
    // #1140: per-instance colour reaches the fragment (legacy instanced-pbr multiplies base rgba).
    "#ifdef USE_INSTANCING_COLOR\nout vec4 v_instanceColor;\n#endif"
  ];
  const body = [
    "void main() {",
    "  vec3 transformed = a_position;",
    "  vec3 objectNormal = vec3(0.0, 0.0, 1.0);",
    "#ifdef A3D_NEED_NORMAL",
    "  objectNormal = a_normal;",
    "#endif",
    "  vec4 objectTangent = vec4(0.0);",
    "  vec4 a3dDeformPos = vec4(transformed, 1.0);",
    deformCall,
    "  transformed = a3dDeformPos.xyz;",
    INSTANCING_VERTEX_BODY_GLSL,
    ...worldHooks,
    "  v_worldPosition = a3dWorld.xyz;",
    "#ifdef A3D_NEED_NORMAL",
    "  vec3 a3dWorldNormal = mat3(u_modelMatrix) * (mat3(instanceMatrix) * objectNormal);",
    "  v_normal = normalize(a3dWorldNormal);",
    "#endif",
    "#ifdef A3D_NEED_UV0\n  v_uv = a_uv;\n#endif",
    "#ifdef A3D_NEED_UV1\n  v_uv1 = a_uv1;\n#endif",
    "#ifdef VERTEX_COLORS\n  v_color = a_color;\n#endif",
    "#ifdef USE_INSTANCING_COLOR\n  v_instanceColor = a_instanceColor;\n#endif",
    "  gl_Position = u_viewProjection * a3dWorld;",
    "  gl_PointSize = min(u_pointSize, 256.0);",
    ...endHooks,
    "}"
  ];
  return [...decls, ...body].join("\n");
}

function emitDefines(defines: Record<string, string | number | true>): string {
  return Object.entries(defines)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `#define ${name} ${value === true ? "1" : String(value)}`)
    .join("\n");
}

const MATERIAL_UNIFORMS = `uniform vec4 u_baseColor;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_emissiveColor;
uniform float u_emissiveStrength;
uniform float u_ior;
uniform vec3 u_specularColorFactor;
uniform float u_specularIntensity;
#ifdef USE_BASE_COLOR_MAP
uniform sampler2D u_baseColorMap;
#endif
#ifdef USE_METALLIC_ROUGHNESS_MAP
uniform sampler2D u_metallicRoughnessMap;
#endif
#ifdef USE_OCCLUSION_MAP
uniform sampler2D u_occlusionMap;
#endif
#ifdef USE_EMISSIVE_MAP
uniform sampler2D u_emissiveMap;
#endif`;

const FRAGMENT_VARYINGS = `in vec3 v_worldPosition;
#ifdef A3D_NEED_NORMAL
in vec3 v_normal;
#endif
#ifdef A3D_NEED_UV0
in vec2 v_uv;
#endif
#ifdef A3D_NEED_UV1
in vec2 v_uv1;
#endif
#ifdef VERTEX_COLORS
in vec4 v_color;
#endif
#ifdef USE_INSTANCING_COLOR
in vec4 v_instanceColor;
#endif`;

/** u_lightData capacity (LightUniforms.pack MAX_DIRECT_LIGHTS, `u_lightData[96]` = 16 × 6 vec4). */
const MAX_PACKED_DIRECT_LIGHTS = 16;

/**
 * Compile-time bound of the `u_lightData` loop (#1140). Buckets {0,1,2,4}
 * are exact upper bounds; a per-kind bucket of 8 means "5 or more", so any
 * total above 4 compiles the full packed capacity. The loop also breaks at
 * the runtime `u_lightCount`, so unused slots are never shaded. Clustered
 * programs read lights from the cluster textures only.
 */
function directLightLoopBound(f: ProgramFeatures): number {
  if (f.lights.clustered) return 0;
  const total = totalLightCount(f.lights);
  return total <= 4 ? total : MAX_PACKED_DIRECT_LIGHTS;
}

/** #1225: the draw carries a forward shadow map (`ForwardPass` sets cascades > 0). */
function forwardShadowReceive(f: ProgramFeatures): boolean {
  return f.lighting === "lit" && f.pass === "forward" && f.shadows.cascades > 0;
}

/** GU47 eint (EB-3): the draw also binds PRD-02 local-light tiles (`ForwardShadowMapOptions.localShadows`). */
function forwardLocalShadowReceive(f: ProgramFeatures): boolean {
  return forwardShadowReceive(f) && f.shadows.localShadows > 0;
}

/** Default `fragment:lights` body: `u_lightData` kind-discriminated loop.
 * `a3dLegacyLightRadiance` switches on directionKind.w, so packing order is
 * irrelevant. Clustered (cluster resources bound), only the cluster path runs. */
function defaultLightsBody(f: ProgramFeatures, lobeDirect: readonly string[] = []): string {
  const lines = ["  vec3 L;"];
  // #1225: a draw with a bound forward shadow map (cascades > 0) scales the
  // shadow-casting light by the legacy forward shadow factor.
  const shadowed = forwardShadowReceive(f);
  // GU47 eint (EB-3): a tiled spot / point light (slot in right.w) scales by its PRD-02 atlas tile.
  const localShadowed = forwardLocalShadowReceive(f);
  // C-03 per-light lobe hook (04-LOBES): each active lobe's `direct` call chunk
  // runs inside every light iteration (bucketed AND clustered) with L, radiance,
  // V, N, material and the direct accumulators in scope.
  const direct = lobeDirect.map((s) => indent(indent(s)));
  const bound = directLightLoopBound(f);
  if (bound > 0) {
    lines.push(`  for (int i = 0; i < ${bound}; ++i) {  // bucketed light count (bound; breaks at u_lightCount)`);
    lines.push("    if (i >= int(u_lightCount)) break;");
    lines.push("    vec3 radiance = a3dLegacyLightRadiance(i * 6, v_worldPosition, L);");
    if (shadowed) lines.push("    radiance *= a3dForwardLightShadow(u_lightData[i * 6 + 2].w, u_lightData[i * 6 + 3].z, v_worldPosition, N, L);");
    if (localShadowed) lines.push("    radiance *= a3dLocalLightShadow(u_lightData[i * 6 + 2].w, u_lightData[i * 6 + 4].w, u_lightData[i * 6 + 1].xyz, v_worldPosition, N, L);");
    lines.push("    a3dDirectLight(L, radiance, V, N, material, directDiffuse, directSpecular);");
    lines.push(...direct);
    lines.push("  }");
  }
  // Cluster index texel layout (forward/Lighting.ts createClusteredForwardLighting,
  // same as the flag-off shader): texel (0, cluster).g = light count; texel
  // (i, cluster).r = i-th light index, i from 0.
  lines.push("#ifdef LIGHTS_CLUSTERED");
  lines.push("  int a3dCluster = a3dClusterIndex(gl_FragCoord.xy);");
  lines.push("  int a3dClusterCount = min(int(texelFetch(u_clusterLightIndices, ivec2(0, a3dCluster), 0).g), 64);");
  lines.push("  for (int j = 0; j < 64; ++j) {");
  lines.push("    if (j >= a3dClusterCount) break;");
  lines.push("    int lightIndex = int(texelFetch(u_clusterLightIndices, ivec2(j, a3dCluster), 0).r);");
  lines.push("    vec3 radiance = a3dClusteredLightRadiance(lightIndex, v_worldPosition, L);");
  if (shadowed) lines.push("    radiance *= a3dForwardLightShadow(texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0).w, texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0).z, v_worldPosition, N, L);");
  if (localShadowed) lines.push("    radiance *= a3dLocalLightShadow(texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0).w, texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0).w, texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0).xyz, v_worldPosition, N, L);");
  lines.push("    a3dDirectLight(L, radiance, V, N, material, directDiffuse, directSpecular);");
  lines.push(...direct);
  lines.push("  }");
  lines.push("#endif");
  return lines.join("\n");
}

/** UV varying for a map slot (`uvSet` 0 -> v_uv, 1 -> v_uv1). */
function uvExpr(f: ProgramFeatures, slot: keyof ProgramFeatures["maps"]): string {
  return f.maps[slot]?.uvSet === 1 ? "v_uv1" : "v_uv";
}

/** Default `fragment:indirect` body: ambient 1/pi + single env sample.
 * Accumulators are declared by the caller so replacing hooks see them too.
 * E3 step 4: under the conjunction the always-add procedural specular is
 * guarded to the unsampled case (mirroring the procedural diffuse above it),
 * so a bundle carrying both a sampled map and a procedural map no longer
 * double-counts specular on conjunction draws that did not select
 * `prd02.ibl` (on the PRD-02 path this body is not emitted at all, step 1).
 * Conjunction-off the emitted lines are byte-identical. */
function defaultIndirectBody(f: ProgramFeatures, e3Conjunction = false): string {
  const lines: string[] = [];
  lines.push("  indirectDiffuse += a3dAmbientDiffuse(material.diffuseContribution);");
  lines.push("#ifdef A3D_ENV_SAMPLE");
  lines.push("  float a3dRoughLod = material.roughness * 8.0;");
  lines.push("  vec3 a3dReflect = reflect(-V, N);");
  // brdf's a3dIndirect* take π-scaled irradiance (three r185 getIBLIrradiance
  // returns PI * envMapColor), not the raw radiance sample (#1140).
  lines.push("  vec3 a3dEnvIrradiance = PI * a3dSampleEnvironment(N, 8.0);");
  lines.push("  indirectSpecular += a3dIndirectSpecular(a3dSampleEnvironment(a3dReflect, a3dRoughLod), a3dEnvIrradiance, V, N, material);");
  lines.push("  indirectDiffuse += a3dIndirectDiffuse(a3dEnvIrradiance, V, N, material);");
  lines.push("#endif");
  // Procedural environment (flag-off parity): its diffuse lights the surface
  // only when no sampled map does (the frozen shader mixes them on the sampled
  // weight); its specular stripes always add. Radiance → π-scaled irradiance.
  lines.push("#ifdef LIGHT_HEMISPHERE");
  lines.push("  vec3 a3dProcIrradiance = PI * a3dProceduralDiffuseRadiance(N);");
  lines.push("#ifndef A3D_ENV_SAMPLE");
  lines.push("  indirectDiffuse += a3dIndirectDiffuse(a3dProcIrradiance, V, N, material);");
  lines.push("#else");
  // The sampled map already supplied the multiscatter irradiance term.
  lines.push("  a3dProcIrradiance = vec3(0.0);");
  lines.push("#endif");
  if (e3Conjunction) lines.push("#ifndef A3D_ENV_SAMPLE");
  lines.push("  indirectSpecular += a3dIndirectSpecular(a3dProceduralSpecularRadiance(reflect(-V, N), material.roughness), a3dProcIrradiance, V, N, material);");
  if (e3Conjunction) lines.push("#endif");
  lines.push("#endif");
  lines.push(occlusionIndirectSnippet(f));
  return lines.join("\n");
}

/** Occlusion-map scaling shared by the default body and its PRD-02 replacement. */
function occlusionIndirectSnippet(f: ProgramFeatures): string {
  return [
    "#ifdef USE_OCCLUSION_MAP",
    `  float a3dAo = texture(u_occlusionMap, ${uvExpr(f, "occlusion")}).r;`,
    "  indirectDiffuse *= a3dAo;",
    "  indirectSpecular *= a3dAo;",
    "#endif"
  ].join("\n");
}

function forwardFragmentSource(f: ProgramFeatures, contributions: readonly Contribution[], defines: Record<string, string | number | true>, marker: string, state: SpliceState, lobeChunks: LobeCalls, prd02IblReplacesIndirect: boolean, e3Conjunction = false): string {
  hookSplice(contributions, "fragment:pars", state);
  const alphaHooks = hookSplice(contributions, "fragment:alpha", state);
  const normalHooks = hookSplice(contributions, "fragment:normal", state);
  const materialHooks = hookSplice(contributions, "fragment:material", state);
  const lightsHooks = hookSplice(contributions, "fragment:lights", state);
  const indirectHooks = hookSplice(contributions, "fragment:indirect", state);
  const emissiveHooks = hookSplice(contributions, "fragment:emissive", state);
  const fogHooks = hookSplice(contributions, "fragment:fog", state);
  const endHooks = hookSplice(contributions, "fragment:end", state);

  const lit = f.lighting === "lit";
  const outputSrgb = f.features[PROGRAM_OUTPUT_SRGB_FEATURE] === true;
  const withBrdf = lit || state.builtins.has("brdf");
  const body: string[] = [];
  body.push("void main() {");
  if (lit) {
    body.push("  vec3 V = normalize(u_cameraPositionNear.xyz - v_worldPosition);");
    if (f.flatShading) {
      body.push("  vec3 geometryNormal = a3dFlatNormal(v_worldPosition);");
    } else {
      body.push("  vec3 geometryNormal = normalize(v_normal);");
    }
    body.push("#ifdef DOUBLE_SIDED");
    body.push("  geometryNormal *= gl_FrontFacing ? 1.0 : -1.0;");
    body.push("#endif");
    if (f.maps.normal) {
      body.push(`  vec3 N = a3dTangentNormal(v_worldPosition, geometryNormal, ${uvExpr(f, "normal")});`);
    } else {
      body.push("  vec3 N = geometryNormal;");
    }
    if (normalHooks.length > 0) body.push(...normalHooks.map((s) => indent(s)));
  }

  // fragment:material — default fills base/metal/rough + PhysicalMaterial.
  body.push("  vec4 a3dBaseColor = u_baseColor;");
  body.push("#ifdef VERTEX_COLORS\n  a3dBaseColor *= v_color;\n#endif");
  body.push("#ifdef USE_INSTANCING_COLOR\n  a3dBaseColor *= v_instanceColor;\n#endif");
  body.push(`#ifdef USE_BASE_COLOR_MAP\n  a3dBaseColor *= texture(u_baseColorMap, ${uvExpr(f, "baseColor")});\n#endif`);
  body.push("  float a3dMetallic = u_metallic;");
  body.push("  float a3dRoughness = u_roughness;");
  body.push("#ifdef USE_METALLIC_ROUGHNESS_MAP");
  body.push(`  vec2 a3dMr = texture(u_metallicRoughnessMap, ${uvExpr(f, "metallicRoughness")}).bg;`);
  body.push("  a3dMetallic *= a3dMr.x;");
  body.push("  a3dRoughness *= a3dMr.y;");
  body.push("#endif");
  if (lit) {
    body.push("  PhysicalMaterial material = a3dMakeMaterial(a3dBaseColor.rgb, a3dMetallic, a3dRoughness, u_ior, u_specularIntensity, u_specularColorFactor, geometryNormal);");
  }
  if (materialHooks.length > 0) body.push(...materialHooks.map((s) => indent(s)));
  if (lit && lobeChunks.fragment.length > 0) body.push(...lobeChunks.fragment.map((s) => indent(s)));

  body.push("  vec3 directDiffuse = vec3(0.0);");
  body.push("  vec3 directSpecular = vec3(0.0);");
  body.push("  vec3 indirectDiffuse = vec3(0.0);");
  body.push("  vec3 indirectSpecular = vec3(0.0);");
  if (lit) {
    body.push(lightsHooks.length > 0 ? lightsHooks.map((s) => indent(s)).join("\n") : defaultLightsBody(f, lobeChunks.direct));
    if (prd02IblReplacesIndirect) {
      // E3 stage-2b: the PRD-02 IBL call REPLACES the default indirect body
      // (never appends to it), so its SH diffuse + probe-cube specular cannot
      // stack on the default ambient + sampled + procedural terms. This
      // branch is also the procedural-specular double-count fix: the
      // default body's always-add procedural specular (LIGHT_HEMISPHERE
      // block) is not emitted on the PRD-02 path at all. The occlusion
      // snippet is generator-owned (uv-set aware) and shared with the
      // default body. `indirect_default` declarations stay included above:
      // C-03 lobe IBL calls still sample through `a3dSampleEnvironment`.
      if (indirectHooks.length > 0) body.push(...indirectHooks.map((s) => indent(s)));
      body.push(occlusionIndirectSnippet(f));
    } else {
      // fragment:indirect appends to the default ambient + env body (T0-05);
      // lobe `ibl` calls run last, over the final direct + indirect accumulators.
      body.push(defaultIndirectBody(f, e3Conjunction));
      if (indirectHooks.length > 0) body.push(...indirectHooks.map((s) => indent(s)));
    }
    if (lobeChunks.ibl.length > 0) body.push(...lobeChunks.ibl.map((s) => indent(s)));
  }

  // fragment:emissive — emissive maps * color * strength.
  body.push("  vec3 a3dEmissive = u_emissiveColor * u_emissiveStrength;");
  body.push(`#ifdef USE_EMISSIVE_MAP\n  a3dEmissive *= texture(u_emissiveMap, ${uvExpr(f, "emissive")}).rgb;\n#endif`);
  if (emissiveHooks.length > 0) body.push(...emissiveHooks.map((s) => indent(s)));

  // fragment:alpha — ALPHA_MASK discard runs last so masks see final alpha.
  body.push("  float a3dAlpha = a3dBaseColor.a;");
  if (alphaHooks.length > 0) body.push(...alphaHooks.map((s) => indent(s)));
  body.push("  a3dAlpha = a3dApplyAlpha(a3dAlpha);");
  // C-05 coverage: HDR alpha marks drawn pixels for OutputPass. Opaque and
  // (non-A2C) masked surfaces are fully covering; A2C needs the real alpha.
  if (f.alphaMode === "opaque") body.push("  a3dAlpha = 1.0;");
  else if (f.alphaMode === "mask") body.push("#ifndef ALPHA_TO_COVERAGE\n  a3dAlpha = 1.0;\n#endif");

  if (lit) {
    body.push("  vec3 a3dColor = directDiffuse + directSpecular + indirectDiffuse + indirectSpecular + a3dEmissive;");
  } else {
    body.push("  vec3 a3dColor = a3dBaseColor.rgb + a3dEmissive;");
  }
  body.push("  a3dColor = max(a3dColor, vec3(0.0));");
  body.push("  float a3dDepth = gl_FragCoord.z / gl_FragCoord.w;");
  if (fogHooks.length > 0) {
    body.push(...fogHooks.map((s) => indent(s)));
  } else if (f.fog !== "none") {
    body.push("  a3dColor = a3dApplyFog(a3dColor, a3dDepth, v_worldPosition.y);");
  }
  if (endHooks.length > 0) body.push(...endHooks.map((s) => indent(s)));
  if (outputSrgb) body.push("  a3dColor = a3dEncodeForCanvas(a3dColor);");
  body.push("  outColor = vec4(a3dColor, a3dAlpha);");
  body.push("#ifdef BACKGROUND_COVERAGE\n  outCoverage = vec4(1.0, 1.0, 1.0, 1.0);\n#endif");
  body.push("}");

  return [
    "#version 300 es",
    `// ${marker}`,
    "precision highp float;",
    emitDefines({ ...defines, A3D_STAGE_FRAGMENT: true }),
    COMMON_CHUNK_GLSL,
    FRAGMENT_VARYINGS,
    MATERIAL_UNIFORMS,
    ...(withBrdf ? [BRDF_CHUNK_GLSL] : []),
    ...(lit || f.maps.normal ? [NORMAL_CHUNK_GLSL] : []),
    ALPHA_CHUNK_GLSL,
    ...(lit ? [LIGHTS_LEGACY_CHUNK_GLSL, INDIRECT_DEFAULT_CHUNK_GLSL] : []),
    ...(forwardShadowReceive(f) ? [SHADOW_FORWARD_CHUNK_GLSL] : []),
    ...(forwardLocalShadowReceive(f) ? [SHADOW_LOCAL_CHUNK_GLSL] : []),
    ...(f.fog !== "none" ? [FOG_DEFAULT_CHUNK_GLSL] : []),
    ...(outputSrgb ? [OUTPUT_SRGB_CHUNK_GLSL] : []),
    // Lobe pars + feature declarations + every call chunk's requires, in
    // requires-first order (T0-05).
    ...state.decls,
    "layout(location = 0) out vec4 outColor;",
    "#ifdef BACKGROUND_COVERAGE\nlayout(location = 1) out vec4 outCoverage;\n#endif",
    ...body
  ].join("\n");
}

function depthFragmentSource(f: ProgramFeatures, defines: Record<string, string | number | true>, marker: string): string {
  const body: string[] = ["void main() {"];
  if (f.alphaMode === "mask") {
    body.push("#ifdef USE_BASE_COLOR_MAP\n  float a3dAlpha = texture(u_baseColorMap, v_uv).a * u_baseColor.a;\n#else\n  float a3dAlpha = u_baseColor.a;\n#endif");
    body.push("  a3dApplyAlpha(a3dAlpha);");
  }
  if (f.pass === "distance") {
    body.push("  float a3dDist = a3dPackDistance(distance(v_worldPosition, u_distanceLight.xyz), u_distanceLight.w);");
    body.push("  outColor = vec4(vec3(a3dDist), 1.0);");
  } else {
    body.push("  outColor = vec4(vec3(gl_FragCoord.z), 1.0);");
  }
  body.push("}");
  return [
    "#version 300 es",
    `// ${marker}`,
    "precision highp float;",
    emitDefines(defines),
    "in vec3 v_worldPosition;",
    "#if defined(ALPHA_MASK) && defined(USE_BASE_COLOR_MAP)\nin vec2 v_uv;\n#endif",
    "uniform vec4 u_baseColor;",
    ALPHA_CHUNK_GLSL,
    DEPTH_CHUNK_GLSL,
    ...(f.pass === "distance" ? [DISTANCE_CHUNK_PARS_GLSL] : []),
    "layout(location = 0) out vec4 outColor;",
    ...body
  ].join("\n");
}

function indent(src: string): string {
  return src.split("\n").map((line) => (line.trim().length > 0 ? `  ${line}` : line)).join("\n");
}

/** Lobe call chunks for `main` (pars go straight into the fragment splice state). */
interface LobeCalls {
  readonly fragment: string[];
  readonly ibl: string[];
  /** Per-light call chunks, spliced inside every light loop iteration. */
  readonly direct: string[];
}

/** `emissive-strength` → `EMISSIVE_STRENGTH`; `prd10.foliage` → `PRD10_FOLIAGE`; `filmIor` → `FILM_IOR`. */
function defineToken(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
}

/**
 * Extension lobes registered through C-03 for this record. Lobe pars (and
 * every call chunk's requires) go into `state`; the fragment/ibl call chunks
 * are returned. Each active lobe adds `A3D_LOBE_<ID>` (+ truthy bits) to
 * `defines`. Unmatched extensions report `extension-lobe-pending`.
 */
function extensionLobeChunks(f: ProgramFeatures, flags: QrFlags | undefined, state: SpliceState, defines: Record<string, string | number | true>, report: (d: ProgramDegradation) => void): LobeCalls {
  const out: LobeCalls = { fragment: [], ibl: [], direct: [] };
  if (f.extensions.length === 0) return out;
  const lobes = flags ? materialLobes(flags) : [];
  const matches = (ext: { readonly lobe: string }, lobe: (typeof lobes)[number]) => ext.lobe === lobe.id || (lobe.glTFExtension !== undefined && ext.lobe === lobe.glTFExtension);
  const pending = f.extensions.filter((ext) => !lobes.some((l) => matches(ext, l)));
  if (pending.length > 0) {
    report({
      code: "extension-lobe-pending",
      message: `extension lobe(s) pending lane 04 registration: ${pending.map((ext) => ext.lobe).join(", ")}`,
      ownerPrd: 4
    });
  }
  // Lobes are physical-shading terms: unlit and depth-like programs take none.
  if (f.pass !== "forward" || f.lighting !== "lit") return out;
  const fragmentSeen = new Set<string>();
  const iblSeen = new Set<string>();
  const directSeen = new Set<string>();
  for (const lobe of lobes) {
    const ext = f.extensions.find((e) => matches(e, lobe));
    if (!ext) continue;
    const token = `A3D_LOBE_${defineToken(lobe.id)}`;
    defines[token] = true;
    for (const [bit, value] of Object.entries(ext.bits)) {
      if (!value) continue; // `#ifdef` reads truthy bits only
      defines[`${token}_${defineToken(bit)}`] = value === true ? true : value;
    }
    emitDeclaration(state, lobe.chunks.pars);
    if (lobe.chunks.fragment && !fragmentSeen.has(lobe.chunks.fragment)) {
      fragmentSeen.add(lobe.chunks.fragment);
      out.fragment.push(emitCall(state, lobe.chunks.fragment));
    }
    if (lobe.chunks.ibl && !iblSeen.has(lobe.chunks.ibl)) {
      iblSeen.add(lobe.chunks.ibl);
      out.ibl.push(emitCall(state, lobe.chunks.ibl));
    }
    if (lobe.chunks.direct && !directSeen.has(lobe.chunks.direct)) {
      directSeen.add(lobe.chunks.direct);
      out.direct.push(emitCall(state, lobe.chunks.direct));
    }
    // Lobe textures (glTF texCoord 0) need the UV varying even when no core map does.
    if (ext.maps.length > 0) defines.A3D_NEED_UV0 = true;
  }
  return out;
}

/** Real C-02 program generation (PRD-01 §6.4). Flags may be omitted: feature bits then resolve no contributors. */
export function generateProgramImpl(features: ProgramFeatures, options: GenerateProgramOptions = {}): GeneratedProgram {
  const f = normalizeProgramFeatures(features);
  const key = programKey(f);
  // FNV-1a of the canonical key: short, deterministic, comment-safe.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const marker = `${GENERATED_PROGRAM_MARKER}:${(h >>> 0).toString(16)}`;
  if (f.target === "wgsl") {
    if (!wgslEmitter) {
      throw new Error(`WGSL_PROGRAM_MISSING:${key}`);
    }
    return wgslEmitter(f);
  }
  const contributions = contributingFeatures(f, options.flags);
  const defines = definesFor(f, contributions);
  // Varying/attribute needs shared by both stages (drives A3D_NEED_* in each).
  if (f.lighting === "lit" || (f.pass === "forward" && f.flatShading)) defines.A3D_NEED_NORMAL = true;
  if (Object.values(f.maps).some((m) => m && (m.uvSet ?? 0) === 0)) defines.A3D_NEED_UV0 = true;
  if (Object.values(f.maps).some((m) => m && m.uvSet === 1)) defines.A3D_NEED_UV1 = true;
  const report = (d: ProgramDegradation) => {
    programDegradationLog.push(d);
    options.onDegradation?.(d);
  };
  const fragmentState = newSpliceState();
  const lobes = extensionLobeChunks(f, options.flags, fragmentState, defines, report);
  const vertex = vertexSource(f, contributions, defines, marker);
  const e3Conjunction = e3CompilerLightingOn(options.flags);
  const prd02IblReplacesIndirect = e3Conjunction
    && contributions.some(({ feature }) => feature.id === PRD02_IBL_FEATURE);
  const fragment =
    f.pass === "forward"
      ? forwardFragmentSource(f, contributions, defines, marker, fragmentState, lobes, prd02IblReplacesIndirect, e3Conjunction)
      : depthFragmentSource(f, defines, marker);
  return { key, vertex, fragment, defines };
}

// Lane 01 installs the real C-02 generator into the contract surface on import.
installProgramGenerator((features) => generateProgramImpl(features));
