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
import type { ShaderChunk, ShaderFeature, ShaderHookPoint, ProgramFeatures, GeneratedProgram } from "../contracts/program";
import { shaderChunk, shaderFeaturesFor, installProgramGenerator } from "../contracts/program";
import { snapshotOf } from "../contracts/structuralMemo";
import { PHYSICAL_GEOMETRY_TANGENT_FEATURE, PHYSICAL_LOBE_MAP_BITS } from "./MaterialFeatures";
import { materialLobes } from "../contracts/materialLobes";
import { COMMON_CHUNK_GLSL } from "./chunks/common.glsl";
import { isStockPrd10WindDeform } from "../world/vegetation/shaders/wind.js";
import { BRDF_CHUNK_GLSL } from "./chunks/brdf.glsl";
import { NORMAL_CHUNK_GLSL } from "./chunks/normal.glsl";
import { INSTANCING_VERTEX_PARS_GLSL, INSTANCING_VERTEX_PARS_EIGHT_INFLUENCES_GLSL, INSTANCING_VERTEX_BODY_GLSL } from "./chunks/instancing.glsl";
import { ALPHA_CHUNK_GLSL } from "./chunks/alpha.glsl";
import { LIGHTS_LEGACY_CHUNK_GLSL } from "./chunks/lights_legacy.glsl";
import { PHOTOMETRIC_PROFILE_GLSL } from "../lighting/shaders/PhotometricProfile.glsl";
import { PROJECTED_SPOT_GLSL } from "../lighting/ProjectedSpotShader";
import { SHADOW_FORWARD_CHUNK_GLSL, SHADOW_LOCAL_CHUNK_GLSL, legacyPunctualShadowChunk } from "./chunks/shadow_forward.glsl";
import { CONTACT_SHADOW_MASK_GLSL } from "../shaders/chunks/contact_shadow_mask.glsl";
import { INDIRECT_DEFAULT_CHUNK_GLSL } from "./chunks/indirect_default.glsl";
import { FOG_DEFAULT_CHUNK_GLSL } from "./chunks/fog_default.glsl";
import { DEPTH_CHUNK_GLSL, DISTANCE_CHUNK_PARS_GLSL } from "./chunks/depth.glsl";
import { ACES_FILMIC_GLSL } from "../output/ToneMappingOperators.glsl";
import { normalizeProgramFeatures, totalLightCount, MAP_DEFINES, PROGRAM_OUTPUT_SRGB_FEATURE, PROGRAM_CLIPPING_FEATURE, PROGRAM_LOG_DEPTH_FEATURE, PROGRAM_TRANSPARENCY_FEATURE, NATIVE_PROBE_GRID_FEATURE, NATIVE_VOXEL_INDIRECT_FEATURE, NATIVE_BAKED_LIGHTMAP_FEATURE, NATIVE_LIGHTMAP_UV_FEATURE, LEGACY_POINT_SHADOW_FEATURE, LEGACY_SPOT_SHADOW_FEATURE, PHOTOMETRIC_PROFILE_FEATURE, PROJECTED_SPOT_FEATURE, DEPTH_COVERAGE_FEATURE, depthCoverageUnsupportedReason, type ProgramGraphFeatures } from "./ProgramFeatures";
import type { ShaderGraphBuiltin, ShaderGraphValueType } from "./ShaderGraphCompiler";
import { programKey } from "./ProgramKey";
import { PRD02_IBL_FEATURE } from "../contracts/environment";
import { PRD02_LOCAL_PROBE_FEATURE, PRD02_IRRADIANCE_VOLUME_FEATURE, PROBE_BOX_CHUNK_GLSL } from "../probes/ProbeBoxProjection";
import { NATIVE_PROBE_GLSL } from "../shaders/advanced-lighting/native-probe.glsl";
import { NATIVE_VOXEL_GLSL } from "../shaders/advanced-lighting/native-voxel.glsl";
import { NATIVE_LIGHTMAP_GLSL } from "../shaders/advanced-lighting/native-lightmap.glsl";
import { createGeneratedUnlitProgram } from "../webgpu/GeneratedUnlitProgram";
import { createGeneratedPbrProgram } from "../webgpu/GeneratedPbrProgram";
import { composeWeightedWgslFragment, weightedWgslPhaseContract, type WeightedWgslPhase } from "./WeightedTransparency.wgsl";

export const GENERATED_PROGRAM_MARKER = "a3d-generated-program";

// Emitted only for the explicitly admitted variant; the default shader must
// not reflect a sampler or transform that the draw has not bound.
const PROJECTED_SPOT_UNIFORMS_GLSL = `
uniform float u_projectedSpotEnabled;
uniform float u_projectedSpotIndex;
uniform highp sampler2D u_projectedSpotMap;
uniform vec2 u_projectedSpotOffset;
uniform vec2 u_projectedSpotScale;
uniform float u_projectedSpotRotation;
`;
import { SELECTIVE_BLOOM_FEATURE } from "../postprocess/NativeBloomPyramid";
import { indirectFractionFeature, indirectFractionParsChunk, indirectFractionWriteChunk } from "../post/chunks/indirectFraction.glsl";
import { PRD02_SHADOW_FILTER_FEATURE } from "../shadows/Prd02ShadowFilter";
import { isStockPrd02IblBloomChunk, isStockPrd02IblBloomFeature } from "../environment/Prd02IblShaderFeature";
import { isStockPrd07BloomChunk } from "../atmosphere/fogChunks";
import { isStockPrd07BloomFeature } from "../atmosphere/Prd07ShaderFeatures";
import { isStockCameraFadeBloomChunk, isStockCameraFadeBloomFeature } from "../shaders/camera-fade.glsl";
import { isStockPrd04Lobe } from "../materials/lobes";
import { A3D_PRD04_EMISSIVE_STRENGTH } from "../shaders/physical/emissive_strength.glsl";
import { A3D_PRD04_EMISSIVE_STRENGTH_CALL } from "../shaders/physical/lobe_calls.glsl";
import { stockChunkVerifier, stockFeatureVerifier } from "./FeatureSelect";

// This is recorded while the ordinary generator is already running. Optional
// bloom compilation consumes it without calling a producer a second time.
const selectiveProvenance = new WeakMap<GeneratedProgram, boolean>();
const stockSelectedFeature = stockFeatureVerifier([indirectFractionFeature, PRD02_SHADOW_FILTER_FEATURE]);
const stockBaseSignalChunk = stockChunkVerifier([
  indirectFractionParsChunk, indirectFractionWriteChunk, A3D_PRD04_EMISSIVE_STRENGTH, A3D_PRD04_EMISSIVE_STRENGTH_CALL
]);

/** Whether the normal generated source was assembled only from audited producers. */
export function generatedProgramSupportsSelectiveBloom(program: GeneratedProgram): boolean {
  return selectiveProvenance.get(program) === true;
}

function stockSignalChunk(chunk: ShaderChunk): boolean {
  return stockBaseSignalChunk(chunk) || isStockPrd02IblBloomChunk(chunk) ||
    isStockPrd07BloomChunk(chunk) || isStockCameraFadeBloomChunk(chunk);
}

/**
 * The same presentation curve used by OutputPass, followed by the sRGB OETF.
 * Importing the implementation keeps direct and postprocessed output in sync.
 */
export const OUTPUT_SRGB_CHUNK_GLSL = `${ACES_FILMIC_GLSL}
vec3 a3dEncodeForCanvas(vec3 linear) {
  vec3 c = clamp(ACESFilmicToneMapping(max(linear, vec3(0.0))), 0.0, 1.0);
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

/**
 * An explicitly registered emitter takes precedence over the built-in WGSL
 * generators. The built-in path is a fallback, not a registration, so loading
 * this module can never replace an emitter installed by a consumer.
 */
let wgslEmitter: ((features: ProgramFeatures) => GeneratedProgram) | undefined;
export function registerProgramWgslEmitter(emitter: (features: ProgramFeatures) => GeneratedProgram): void {
  wgslEmitter = emitter;
}

// Identifies our own emissions without attaching forgeable metadata to the
// public result or changing the contract for externally registered emitters.
const builtinWgslPrograms = new WeakSet<GeneratedProgram>();
export function isBuiltinGeneratedWgsl(program: GeneratedProgram): boolean {
  return wgslEmitter === undefined && builtinWgslPrograms.has(program);
}

/** These feature bits describe selected providers rather than standalone axes.
 * A native template may only consume them when the corresponding provider was
 * actually resolved under the supplied flags. In particular, do not silently
 * turn a disabled IBL or deformation contributor into an ordinary shader. */
const WGSL_PROVIDER_FEATURES = [
  "prd02.ibl", "prd02.shadowFilter", "prd03.indirectFraction",
  "prd04.tangentFrame", "prd04.transmissionTarget", "prd06.deform",
  "a3d.packedLoopColor", "prd15.parityPoints"
] as const;

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
  if (f.features[DEPTH_COVERAGE_FEATURE] === true) d.A3D_DEPTH_COVERAGE = true;
  if (f.features[PROGRAM_CLIPPING_FEATURE] === true) d.A3D_CLIPPING = true;
  if (f.features[PROGRAM_LOG_DEPTH_FEATURE] === true) d.A3D_LOG_DEPTH = true;
  if (f.features[PRD02_LOCAL_PROBE_FEATURE] === true && f.pass === "forward" && f.lighting === "lit") d.A3D_LOCAL_PROBE = true;
  if (f.features[PRD02_IRRADIANCE_VOLUME_FEATURE] === true && f.pass === "forward" && f.lighting === "lit") d.A3D_IRRADIANCE_VOLUME = true;
  if (f.features[NATIVE_PROBE_GRID_FEATURE] === true) d.A3D_NATIVE_PROBE_GRID = true;
  if (f.features[NATIVE_VOXEL_INDIRECT_FEATURE] === true) d.A3D_NATIVE_VOXEL_INDIRECT = true;
  if (f.features[NATIVE_BAKED_LIGHTMAP_FEATURE] !== undefined) {
    d.A3D_NATIVE_BAKED_LIGHTMAP = true;
    if (f.features[NATIVE_BAKED_LIGHTMAP_FEATURE] === "add-indirect") d.A3D_NATIVE_LIGHTMAP_ADD = true;
    if (f.features[NATIVE_LIGHTMAP_UV_FEATURE] === 1) d.A3D_NATIVE_LIGHTMAP_UV1 = true;
  }
  if (d.A3D_IRRADIANCE_VOLUME || d.A3D_NATIVE_PROBE_GRID || d.A3D_NATIVE_VOXEL_INDIRECT) d.A3D_LOCAL_DIFFUSE_IRRADIANCE = true;
  if (f.features[PHYSICAL_GEOMETRY_TANGENT_FEATURE] === true) d.A3D_HAS_TANGENT = true;
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
  if (f.features[LEGACY_POINT_SHADOW_FEATURE] === true) d.A3D_LEGACY_POINT_SHADOW = true;
  if (f.features[LEGACY_SPOT_SHADOW_FEATURE] === true) d.A3D_LEGACY_SPOT_SHADOW = true;
  if (f.features[PHOTOMETRIC_PROFILE_FEATURE] === true) d.A3D_PHOTOMETRIC_PROFILE = true;
  if (f.features[PROJECTED_SPOT_FEATURE] === true) d.A3D_PROJECTED_SPOT = true;
  for (const { feature, value } of contributions) {
    Object.assign(d, feature.defines(value));
  }
  for (const [id, index] of [["prd06.joint0Type", 0], ["prd06.joint1Type", 1]] as const) {
    const kind = f.features[id];
    if (kind === undefined) continue;
    if ((kind !== "float" && kind !== "uint" && kind !== "sint") || (d.A3D_SKINNING !== 4 && d.A3D_SKINNING !== 8)
      || (index === 1 && d.A3D_SKINNING !== 8)) throw new Error("GENERATED_JOINT_INPUT_LAYOUT_UNSUPPORTED");
    if (kind === "uint") d[`A3D_JOINT${index}_UINT`] = true;
    if (kind === "sint") d[`A3D_JOINT${index}_SINT`] = true;
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
  selectiveChunksSafe: boolean;
  /** Built-in chunk names some spliced chunk required. */
  readonly builtins: Set<string>;
}

function newSpliceState(): SpliceState {
  return { seen: new Set(), decls: [], builtins: new Set(), selectiveChunksSafe: true };
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
  if (!stockSignalChunk(chunk)) state.selectiveChunksSafe = false;
  for (const req of chunk.requires ?? []) emitDeclaration(state, req, [...path, name]);
  state.seen.add(name);
  state.decls.push(chunk.glsl);
}

/** A call chunk: its `requires` go to global scope; its own GLSL is returned for `main`. */
function emitCall(state: SpliceState, name: string): string {
  const chunk = requireChunk(name, undefined);
  if (!stockSignalChunk(chunk)) state.selectiveChunksSafe = false;
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

const GRAPH_GLSL_TYPES: Partial<Record<ShaderGraphValueType, string>> = {
  f32: "float", i32: "int", u32: "uint", bool: "bool", vec2: "vec2", vec3: "vec3", vec4: "vec4", uvec3: "uvec3",
  mat2: "mat2", mat2x2: "mat2", mat2x3: "mat2x3", mat2x4: "mat2x4",
  mat3: "mat3", mat3x2: "mat3x2", mat3x3: "mat3", mat3x4: "mat3x4",
  mat4: "mat4", mat4x2: "mat4x2", mat4x3: "mat4x3", mat4x4: "mat4"
};

/** Graph compiler validation already restricts material resources to portable
 * uniforms and sampled textures for GLSL. Never accept a mismatched target or
 * silently discard a surface output. */
function graphFor(f: ProgramFeatures): ProgramGraphFeatures["graph"] {
  const graph = (f as ProgramGraphFeatures).graph;
  if (!graph) return undefined;
  if (graph.stage !== "material" || !graph.material || graph.target !== (f.target === "wgsl" ? "wgsl" : "glsl")) {
    throw new Error("GRAPH_PROGRAM_TARGET_MISMATCH");
  }
  if (graph.material.requiresLighting && f.lighting !== "lit") throw new Error("GRAPH_REQUIRES_LIT_PROGRAM");
  // The generated material's generic shadow caster cannot evaluate graph
  // alpha. The portable graph material supplies paired depth stages instead.
  if (graph.material.alphaTest !== undefined) throw new Error("GRAPH_ALPHA_TEST_GENERATED_PROGRAM_UNSUPPORTED");
  return graph;
}

function graphDeclarations(f: ProgramFeatures, stage: "vertex" | "fragment"): string[] {
  const graph = graphFor(f);
  if (!graph) return [];
  const matrixDeclarations = new Set<string>();
  const bindings = graph.bindings.map((binding) => {
    if (binding.kind === "texture2d" || binding.kind === "depth2d") return `uniform sampler2D ${binding.shaderName};`;
    if (binding.kind === "texture3d") return `uniform highp sampler3D ${binding.shaderName};`;
    if (binding.kind === "uniform" && binding.type && Object.hasOwn(GRAPH_GLSL_TYPES, binding.type)) {
      const type = GRAPH_GLSL_TYPES[binding.type]!;
      if (binding.type.startsWith("mat")) {
        // Standalone portable stages declare a u_-prefixed data uniform and
        // alias the graph name. Generated programs bind the graph name itself.
        matrixDeclarations.add(`uniform ${type} u_${binding.shaderName};\n#define ${binding.shaderName} u_${binding.shaderName}`);
      }
      return `uniform ${type} ${binding.shaderName};`;
    }
    throw new Error(`GRAPH_RESOURCE_UNSUPPORTED_GLSL:${binding.name}`);
  });
  return [...bindings, ...(graph.material?.[stage].declarations ?? []).filter((declaration) => !matrixDeclarations.has(declaration))];
}

/** Vertex builtins describe the post-deformation point before a graph's own
 * position output. Its world position uses the current geometry/instance/model
 * transforms; the fragment varyings reflect the final graph position. */
function graphVertexBody(f: ProgramFeatures): string[] {
  const material = graphFor(f)?.material;
  if (!material) return [];
  const expressions: Partial<Record<ShaderGraphBuiltin, [string, string]>> = {
    positionLocal: ["vec3", "transformed"], positionWorld: ["vec3", "a3dWorld.xyz"],
    normalLocal: ["vec3", "objectNormal"], normalWorld: ["vec3", "a3dWorldNormal(objectNormal, instanceMatrix)"],
    uv0: ["vec2", "a_uv"], uv1: ["vec2", "a_uv1"], time: ["float", "u_resolutionFarTime.w"],
    cameraPosition: ["vec3", "u_cameraPositionNear.xyz"]
  };
  const out = material.builtins.flatMap((name) => expressions[name] ? [`  ${expressions[name]![0]} auraGraph_${name} = ${expressions[name]![1]};`] : []);
  out.push(...material.vertex.statements.map((statement) => indent(statement)));
  if (material.vertex.outputs.position) {
    out.push(`  transformed = ${material.vertex.outputs.position};`);
    out.push("  a3dLocal = u_geometryMatrix * vec4(transformed, 1.0);");
    out.push("  a3dWorld = u_modelMatrix * instanceMatrix * a3dLocal;");
  }
  return out;
}

function graphFragmentBody(f: ProgramFeatures): string[] {
  const material = graphFor(f)?.material;
  if (!material) return [];
  const varyingExpressions: Partial<Record<ShaderGraphBuiltin, [string, string]>> = {
    positionLocal: ["vec3", "v_a3dGraphLocalPosition"], positionWorld: ["vec3", "v_worldPosition"],
    normalLocal: ["vec3", "v_a3dGraphLocalNormal"], normalWorld: ["vec3", "normalize(v_normal)"],
    uv0: ["vec2", "v_uv"], uv1: ["vec2", "v_uv1"]
  };
  const out = material.varyings.flatMap((name) => varyingExpressions[name] ? [`  ${varyingExpressions[name]![0]} auraGraph_${name} = ${varyingExpressions[name]![1]};`] : []);
  const constants: Partial<Record<ShaderGraphBuiltin, [string, string]>> = {
    time: ["float", "u_resolutionFarTime.w"], cameraPosition: ["vec3", "u_cameraPositionNear.xyz"],
    viewportUV: ["vec2", "gl_FragCoord.xy / max(u_resolutionFarTime.xy, vec2(1.0))"], depth: ["float", "a3dFragmentDepth"]
  };
  out.push(...material.builtins.flatMap((name) => constants[name] ? [`  ${constants[name]![0]} auraGraph_${name} = ${constants[name]![1]};`] : []));
  out.push(...material.fragment.statements.map((statement) => indent(statement)));
  return out;
}

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
    "#ifdef A3D_LOG_DEPTH\nuniform mat4 u_a3dLogDepthView;\nout float v_a3dLogDepth;\n#endif",
    "uniform float u_pointSize;",
    VERTEX_ATTRIBUTES,
    // A deform hook alone (e.g. wind without the prd06 deform chunk) does not declare `a_tangent`: declare it unless a spliced chunk already does.
    ...(defines.A3D_HAS_TANGENT && !state.decls.some((declaration) => /\bin\s+vec4\s+a_tangent\b/.test(declaration)) ? ["layout(location = 3) in vec4 a_tangent;"] : []),
    f.instancing && defines.A3D_SKINNING === 8 ? INSTANCING_VERTEX_PARS_EIGHT_INFLUENCES_GLSL : INSTANCING_VERTEX_PARS_GLSL,
    `vec3 a3dWorldNormal(vec3 normal, mat4 instanceMatrix) {
  mat3 localTransform = mat3(instanceMatrix) * mat3(u_geometryMatrix);
  float det = determinant(localTransform);
  vec3 localNormal = abs(det) > 1e-8 ? transpose(inverse(localTransform)) * normal : normal;
  vec3 worldNormal = mat3(u_normalMatrix) * localNormal;
  float lengthSquared = dot(worldNormal, worldNormal);
  return lengthSquared > 1e-12 ? worldNormal * inversesqrt(lengthSquared) : vec3(0.0, 0.0, 1.0);
}`,
    ...graphDeclarations(f, "vertex"),
    ...state.decls.map((declaration) => f.instancing && defines.A3D_SKINNING === 8 && defines.A3D_INSTANCE_EMISSIVE_ATTRIBUTE
      ? declaration.replace("in vec4 a_a3dInstanceEmissive;", "layout(location = 14) in vec4 a_a3dInstanceEmissive;")
      : declaration),
    "out vec3 v_worldPosition;",
    "#ifdef A3D_CLIPPING\nout vec3 v_a3dClipLocal;\nout vec3 v_a3dClipWorld;\n#endif",
    ...(graphFor(f)?.material?.varyings.includes("positionLocal") ? ["out vec3 v_a3dGraphLocalPosition;"] : []),
    ...(graphFor(f)?.material?.varyings.includes("normalLocal") ? ["out vec3 v_a3dGraphLocalNormal;"] : []),
    "#ifdef A3D_NEED_NORMAL\nout vec3 v_normal;\n#endif",
    "#ifdef A3D_NEED_UV0\nout vec2 v_uv;\n#endif",
    "#ifdef A3D_NEED_UV1\nout vec2 v_uv1;\n#endif",
    "#ifdef A3D_INSTANCE_VOLUME_TRANSFORM\nflat out vec3 v_a3dVolumeColumn0;\nflat out vec3 v_a3dVolumeColumn1;\nflat out vec3 v_a3dVolumeColumn2;\n#endif",
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
    "#ifdef A3D_HAS_TANGENT\n  objectTangent = a_tangent;\n#endif",
    "  vec4 a3dDeformPos = vec4(transformed, 1.0);",
    deformCall,
    "  transformed = a3dDeformPos.xyz;",
    INSTANCING_VERTEX_BODY_GLSL,
    "#ifdef A3D_INSTANCE_VOLUME_TRANSFORM\n  mat3 a3dVolumeLinear = mat3(u_modelMatrix * instanceMatrix * u_geometryMatrix);\n  v_a3dVolumeColumn0 = a3dVolumeLinear[0];\n  v_a3dVolumeColumn1 = a3dVolumeLinear[1];\n  v_a3dVolumeColumn2 = a3dVolumeLinear[2];\n#endif",
    ...graphVertexBody(f),
    ...worldHooks,
    "  v_worldPosition = a3dWorld.xyz;",
    "#ifdef A3D_CLIPPING\n  v_a3dClipLocal = a3dLocal.xyz;\n  v_a3dClipWorld = a3dWorld.xyz;\n#endif",
    "#ifdef A3D_LOG_DEPTH\n  v_a3dLogDepth = -(u_a3dLogDepthView * a3dWorld).z;\n#endif",
    ...(graphFor(f)?.material?.varyings.includes("positionLocal") ? ["  v_a3dGraphLocalPosition = transformed;"] : []),
    ...(graphFor(f)?.material?.varyings.includes("normalLocal") ? ["  v_a3dGraphLocalNormal = objectNormal;"] : []),
    "#ifdef A3D_NEED_NORMAL",
    "  v_normal = a3dWorldNormal(objectNormal, instanceMatrix);",
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
uniform float u_occlusionStrength;
#endif
#ifdef USE_EMISSIVE_MAP
uniform sampler2D u_emissiveMap;
#endif
#ifdef USE_DIFFUSE_ROUGHNESS_MAP
uniform sampler2D u_diffuseRoughnessTexture;
uniform float u_diffuseRoughnessTextureEnabled;
uniform vec2 u_diffuseRoughnessTextureOffset;
uniform vec2 u_diffuseRoughnessTextureScale;
uniform float u_diffuseRoughnessTextureRotation;
#endif
#ifdef USE_BUMP_MAP
uniform sampler2D u_bumpTexture;
uniform float u_bumpTextureEnabled;
uniform vec2 u_bumpTextureOffset;
uniform vec2 u_bumpTextureScale;
uniform float u_bumpTextureRotation;
uniform float u_bumpFactor;
#endif`;

const CORE_MAP_TRANSFORMS_GLSL = `
#ifdef USE_BASE_COLOR_MAP
uniform vec2 u_baseColorTextureOffset;
uniform vec2 u_baseColorTextureScale;
uniform float u_baseColorTextureRotation;
#endif
#ifdef USE_NORMAL_MAP
uniform vec2 u_normalTextureOffset;
uniform vec2 u_normalTextureScale;
uniform float u_normalTextureRotation;
#endif
#ifdef USE_METALLIC_ROUGHNESS_MAP
uniform vec2 u_metallicRoughnessTextureOffset;
uniform vec2 u_metallicRoughnessTextureScale;
uniform float u_metallicRoughnessTextureRotation;
#endif
#ifdef USE_OCCLUSION_MAP
uniform vec2 u_occlusionTextureOffset;
uniform vec2 u_occlusionTextureScale;
uniform float u_occlusionTextureRotation;
#endif
#ifdef USE_EMISSIVE_MAP
uniform vec2 u_emissiveTextureOffset;
uniform vec2 u_emissiveTextureScale;
uniform float u_emissiveTextureRotation;
#endif
vec2 a3dCoreMapUv(vec2 uv, vec2 offset, vec2 scale, float rotation) {
  vec2 p = uv * scale;
  float c = cos(rotation), s = sin(rotation);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y) + offset;
}`;

/** Raw L1 RGB coefficients are stored in three nearest-sampled array textures.
 * Interpolate cells manually, convolve once, then replace only environmental
 * diffuse irradiance, fading over the half-cell around the volume bounds. */
const IRRADIANCE_VOLUME_GLSL = `
uniform highp sampler2DArray u_prd02IrradianceR;
uniform highp sampler2DArray u_prd02IrradianceG;
uniform highp sampler2DArray u_prd02IrradianceB;
uniform vec4 u_prd02IrradianceMin;
uniform vec4 u_prd02IrradianceMax;
uniform vec4 u_prd02IrradianceGrid;
vec4 a3dVolumeCoefficients(highp sampler2DArray field, ivec3 lo, ivec3 hi, vec3 t) {
  vec4 a = mix(texelFetch(field, ivec3(lo.x, lo.y, lo.z), 0), texelFetch(field, ivec3(hi.x, lo.y, lo.z), 0), t.x);
  vec4 b = mix(texelFetch(field, ivec3(lo.x, hi.y, lo.z), 0), texelFetch(field, ivec3(hi.x, hi.y, lo.z), 0), t.x);
  vec4 c = mix(texelFetch(field, ivec3(lo.x, lo.y, hi.z), 0), texelFetch(field, ivec3(hi.x, lo.y, hi.z), 0), t.x);
  vec4 d = mix(texelFetch(field, ivec3(lo.x, hi.y, hi.z), 0), texelFetch(field, ivec3(hi.x, hi.y, hi.z), 0), t.x);
  return mix(mix(a, b, t.y), mix(c, d, t.y), t.z);
}
vec3 a3dVolumeBlend(vec3 globalIrradiance, vec3 position, vec3 normal) {
  ivec3 grid = max(ivec3(u_prd02IrradianceGrid.xyz), ivec3(1));
  vec3 cell = (u_prd02IrradianceMax.xyz - u_prd02IrradianceMin.xyz) / vec3(grid);
  vec3 n = normalize(normal);
  vec3 p = position + n * cell * 0.5;
  vec3 outside = max(max(u_prd02IrradianceMin.xyz - p, p - u_prd02IrradianceMax.xyz), vec3(0.0));
  vec3 distanceInHalfCells = outside / (0.5 * cell);
  float fade = clamp(1.0 - max(distanceInHalfCells.x, max(distanceInHalfCells.y, distanceInHalfCells.z)), 0.0, 1.0);
  vec3 coord = clamp((p - u_prd02IrradianceMin.xyz) / cell - 0.5, vec3(0.0), vec3(grid - 1));
  ivec3 lo = ivec3(floor(coord)), hi = min(lo + 1, grid - 1);
  vec3 t = fract(coord);
  vec4 basis = vec4(0.282095 * PI, -0.488603 * n.y * (2.0 * PI / 3.0),
    0.488603 * n.z * (2.0 * PI / 3.0), -0.488603 * n.x * (2.0 * PI / 3.0));
  vec3 local = max(vec3(dot(a3dVolumeCoefficients(u_prd02IrradianceR, lo, hi, t), basis),
    dot(a3dVolumeCoefficients(u_prd02IrradianceG, lo, hi, t), basis),
    dot(a3dVolumeCoefficients(u_prd02IrradianceB, lo, hi, t), basis)), vec3(0.0)) * u_prd02IrradianceGrid.w;
  return mix(globalIrradiance, local, fade);
}`;

/** Each selected source declares only its own resources so reflection and
 * device sampler budgets match the actual generated variant. */
function nativeDiffuseDeclarations(defines: Record<string, string | number | true>): string[] {
  const declarations: string[] = [];
  let local = "";
  if (defines.A3D_IRRADIANCE_VOLUME) {
    local = "return a3dVolumeBlend(globalIrradiance, position, normal);";
  } else if (defines.A3D_NATIVE_PROBE_GRID) {
    declarations.push(NATIVE_PROBE_GLSL, `
uniform highp sampler2D u_a3dNativeProbeTexture;
uniform vec4 u_a3dNativeProbeMin;
uniform vec4 u_a3dNativeProbeMax;
uniform vec4 u_a3dNativeProbeDimensions;
uniform float u_a3dNativeProbeIntensity;
uniform float u_a3dNativeProbeOutside;`);
    local = `vec3 p = u_a3dNativeProbeOutside > 0.5 ? clamp(position, u_a3dNativeProbeMin.xyz, u_a3dNativeProbeMax.xyz) : position;
  vec4 sampleValue = a3dNativeProbeIrradiance(u_a3dNativeProbeTexture, p, normal, u_a3dNativeProbeMin.xyz,
    u_a3dNativeProbeMax.xyz, ivec3(u_a3dNativeProbeDimensions.xyz));
  return mix(globalIrradiance, sampleValue.rgb * u_a3dNativeProbeIntensity, sampleValue.a);`;
  } else if (defines.A3D_NATIVE_VOXEL_INDIRECT) {
    declarations.push(NATIVE_VOXEL_GLSL, `
uniform highp sampler2D u_a3dNativeVoxelTexture;
uniform vec4 u_a3dNativeVoxelMin;
uniform vec4 u_a3dNativeVoxelMax;
uniform vec4 u_a3dNativeVoxelResolution;
uniform vec4 u_a3dNativeVoxelLevels[7];
uniform vec4 u_a3dNativeVoxelConfig;
uniform float u_a3dNativeVoxelIntensity;`);
    local = `vec4 sampleValue = a3dNativeVoxelIrradiance(u_a3dNativeVoxelTexture, position, normal, u_a3dNativeVoxelMin.xyz,
    u_a3dNativeVoxelMax.xyz, ivec3(u_a3dNativeVoxelResolution.xyz), u_a3dNativeVoxelLevels,
    int(u_a3dNativeVoxelConfig.x), int(u_a3dNativeVoxelConfig.y), int(u_a3dNativeVoxelConfig.z), u_a3dNativeVoxelConfig.w);
  return mix(globalIrradiance, sampleValue.rgb * u_a3dNativeVoxelIntensity, sampleValue.a);`;
  }
  if (local) declarations.push(`vec3 a3dLocalDiffuseBlend(vec3 globalIrradiance, vec3 position, vec3 normal) {\n  ${local}\n}`);
  if (defines.A3D_NATIVE_BAKED_LIGHTMAP) declarations.push(NATIVE_LIGHTMAP_GLSL, `
uniform highp sampler2D u_a3dNativeLightmapTexture;
uniform float u_a3dNativeLightmapIntensity;`);
  return declarations;
}

/** Both detail textures are linear scalar data. The UV set is structural and
 * selected by the program; transform values remain ordinary material uniforms.
 * Bump height varies over world position, so the surface gradient is recovered
 * from screen-space position/height differentials and combined with any normal
 * map. A degenerate projected surface keeps the existing shading normal. */
const SURFACE_DETAIL_GLSL = `
#if defined(USE_DIFFUSE_ROUGHNESS_MAP) || defined(USE_BUMP_MAP)
vec2 a3dSurfaceDetailUv(vec2 uv, vec2 offset, vec2 scale, float rotation) {
  vec2 p = uv * scale;
  float c = cos(rotation), s = sin(rotation);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y) + offset;
}
#endif
#ifdef USE_BUMP_MAP
vec3 a3dSurfaceBumpNormal(vec3 position, vec3 geometryNormal, vec3 shadingNormal, vec2 uv) {
  float height = texture(u_bumpTexture, uv).r * u_bumpFactor * clamp(u_bumpTextureEnabled, 0.0, 1.0);
  vec3 dx = dFdx(position), dy = dFdy(position);
  float dhdx = dFdx(height), dhdy = dFdy(height);
  vec3 dualX = cross(dy, geometryNormal), dualY = cross(geometryNormal, dx);
  float determinant = dot(dx, dualX);
  if (abs(determinant) < 1e-8) return shadingNormal;
  vec3 gradient = (dualX * dhdx + dualY * dhdy) / determinant;
  vec3 perturbed = shadingNormal - gradient;
  float lengthSquared = dot(perturbed, perturbed);
  return lengthSquared > 1e-12 ? perturbed * inversesqrt(lengthSquared) : shadingNormal;
}
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
#endif
#ifdef A3D_INSTANCE_VOLUME_TRANSFORM
flat in vec3 v_a3dVolumeColumn0;
flat in vec3 v_a3dVolumeColumn1;
flat in vec3 v_a3dVolumeColumn2;
#endif`;

/** Fixed-capacity clipping and logarithmic depth use uniforms for ordinary
 * plane/camera updates. Plane groups AND together; each group retains either
 * all or any of its positive half-spaces. */
const FRAGMENT_VISIBILITY_GLSL = `
#ifdef A3D_CLIPPING
in vec3 v_a3dClipLocal;
in vec3 v_a3dClipWorld;
uniform vec4 u_a3dClipPlanes[8];
uniform vec4 u_a3dClipGroups[2];
uniform float u_a3dClipGroupCount;
bool a3dClipRetains(vec3 worldPosition, vec3 localPosition) {
  for (int group = 0; group < 2; ++group) {
    if (float(group) >= u_a3dClipGroupCount) break;
    vec4 params = u_a3dClipGroups[group];
    int offset = int(params.x);
    int count = int(params.y);
    if (count <= 0) continue;
    bool anyMode = params.z > 0.5;
    vec3 point = params.w > 0.5 ? localPosition : worldPosition;
    bool keep = !anyMode;
    for (int plane = 0; plane < 8; ++plane) {
      if (plane >= count) break;
      bool inside = dot(u_a3dClipPlanes[offset + plane], vec4(point, 1.0)) >= 0.0;
      keep = anyMode ? (keep || inside) : (keep && inside);
    }
    if (!keep) return false;
  }
  return true;
}
#endif
#ifdef A3D_LOG_DEPTH
in float v_a3dLogDepth;
uniform vec2 u_a3dLogDepthRange;
float a3dLogFragmentDepth() {
  return clamp(log(max(v_a3dLogDepth, u_a3dLogDepthRange.x) / u_a3dLogDepthRange.x)
    / log(u_a3dLogDepthRange.y / u_a3dLogDepthRange.x), 0.0, 1.0);
}
#endif`;

/** Insert identically into forward, camera depth and distance programs. */
const FRAGMENT_VISIBILITY_BODY_GLSL = `#ifdef A3D_CLIPPING
  bool a3dClipped = !a3dClipRetains(v_a3dClipWorld, v_a3dClipLocal);
#endif
  float a3dFragmentDepth = gl_FragCoord.z;
#ifdef A3D_LOG_DEPTH
  a3dFragmentDepth = a3dLogFragmentDepth();
  gl_FragDepth = a3dFragmentDepth;
#endif`;

const WEIGHTED_TRANSPARENCY_GLSL = `
uniform sampler2D u_a3dOpaqueDepth;
uniform vec2 u_a3dTransparencyDepthOrigin;
uniform float u_a3dTransparencyReversedDepth;
uniform float u_a3dTransparencyInputPremultiplied;
void a3dTestOpaqueDepth(float fragmentDepth) {
  ivec2 pixel = ivec2(gl_FragCoord.xy) + ivec2(u_a3dTransparencyDepthOrigin);
  ivec2 size = textureSize(u_a3dOpaqueDepth, 0);
  if (any(lessThan(pixel, ivec2(0))) || any(greaterThanEqual(pixel, size))) discard;
  float sceneDepth = texelFetch(u_a3dOpaqueDepth, pixel, 0).r;
  if (u_a3dTransparencyReversedDepth > 0.5 ? fragmentDepth < sceneDepth : fragmentDepth > sceneDepth) discard;
}
vec4 a3dWeightedAccumulation(vec3 color, float alpha, float fragmentDepth) {
  float a = clamp(alpha, 0.0, 1.0);
  vec3 straight = u_a3dTransparencyInputPremultiplied > 0.5 ? (a > 0.0 ? color / a : vec3(0.0)) : color;
  float nearDepth = u_a3dTransparencyReversedDepth > 0.5 ? 1.0 - fragmentDepth : fragmentDepth;
  float weight = 0.25 + 0.75 * pow(1.0 - clamp(nearDepth, 0.0, 1.0), 3.0);
  return vec4(clamp(straight, vec3(-32.0), vec3(32.0)) * a * weight, a * weight);
}`;

/** u_lightData capacity (LightUniforms.pack MAX_DIRECT_LIGHTS, `u_lightData[96]` = 16 × 6 vec4). */
const MAX_PACKED_DIRECT_LIGHTS = 16;

/**
 * Compile-time bound of the `u_lightData` loop (#1140). Buckets {0,1,2,4}
 * are exact upper bounds except the rectangle bucket, where 4 means "4 or
 * more". That bucket and any total above 4 compile the full packed capacity. The loop also breaks at
 * the runtime `u_lightCount`, so unused slots are never shaded. Clustered
 * programs read lights from the cluster textures only.
 */
function directLightLoopBound(f: ProgramFeatures): number {
  if (f.lights.clustered) return 0;
  const total = totalLightCount(f.lights);
  return total <= 4 && f.lights.rect < 4 ? total : MAX_PACKED_DIRECT_LIGHTS;
}

/** #1225: the draw carries a forward shadow map (`ForwardPass` sets cascades > 0). */
function forwardShadowReceive(f: ProgramFeatures): boolean {
  return f.lighting === "lit" && f.pass === "forward" && f.shadows.cascades > 0;
}

/** PRD-02 local-light tiles can exist without a directional shadow map. */
function forwardLocalShadowReceive(f: ProgramFeatures): boolean {
  return f.lighting === "lit" && f.pass === "forward" && f.shadows.localShadows > 0;
}

/** Default `fragment:lights` body: `u_lightData` kind-discriminated loop.
 * `a3dLegacyLightRadiance` switches on directionKind.w, so packing order is
 * irrelevant. Clustered (cluster resources bound), only the cluster path runs. */
function defaultLightsBody(f: ProgramFeatures, lobeDirect: readonly string[] = []): string {
  const lines = ["  vec3 L;"];
  // #1225: a draw with a bound forward shadow map (cascades > 0) scales the
  // shadow-casting light by the legacy forward shadow factor.
  const shadowed = forwardShadowReceive(f);
  const contactShadowed = f.lighting === "lit" && f.pass === "forward" && f.shadows.contact;
  const pointShadowed = f.features[LEGACY_POINT_SHADOW_FEATURE] === true;
  const spotShadowed = f.features[LEGACY_SPOT_SHADOW_FEATURE] === true;
  // GU47 eint (EB-3): a tiled spot / point light (slot in right.w) scales by its PRD-02 atlas tile.
  const localShadowed = forwardLocalShadowReceive(f);
  // C-03 per-light lobe hook (04-LOBES): each active lobe's `direct` call chunk
  // runs inside every light iteration (bucketed AND clustered) with L, radiance,
  // V, N, material and the direct accumulators in scope.
  const direct = lobeDirect.map((s) => indent(indent(s)));
  const rectBody = (row: (index: number) => string): string[] => [
    `    if (${row(2)}.w > 2.5) {`,
    `      vec4 a3dRectColor = ${row(0)};`,
    `      vec4 a3dRectPosition = ${row(1)};`,
    `      vec3 a3dRectNormalRaw = ${row(2)}.xyz;`,
    `      vec4 a3dRectSize = ${row(3)};`,
    `      vec3 a3dRectRightRaw = ${row(4)}.xyz;`,
    `      vec4 a3dRectUpData = ${row(5)};`,
    "      vec3 a3dRectUpRaw = a3dRectUpData.xyz;",
    "      vec3 a3dRectNormal = a3dRectNormalRaw / max(length(a3dRectNormalRaw), 0.00001);",
    "      vec3 a3dRectRight = a3dRectRightRaw / max(length(a3dRectRightRaw), 0.00001);",
    "      vec3 a3dRectUp = a3dRectUpRaw / max(length(a3dRectUpRaw), 0.00001);",
    "      vec2 a3dRectDimensions = max(a3dRectSize.xy, vec2(0.0));",
    "      float a3dRectSampleArea = a3dRectDimensions.x * a3dRectDimensions.y * 0.25;",
    "      for (int a3dRectSample = 0; a3dRectSample < 4; ++a3dRectSample) {",
    "        vec2 a3dRectSign = vec2((a3dRectSample == 0 || a3dRectSample == 2) ? -1.0 : 1.0, a3dRectSample < 2 ? -1.0 : 1.0);",
    "        vec3 a3dRectSamplePosition = a3dRectPosition.xyz + 0.28867513459 * (a3dRectRight * a3dRectDimensions.x * a3dRectSign.x + a3dRectUp * a3dRectDimensions.y * a3dRectSign.y);",
    "        vec3 a3dRectToSample = a3dRectSamplePosition - v_worldPosition;",
    "        float a3dRectDistance = length(a3dRectToSample);",
    "        L = a3dRectDistance > 0.0001 ? a3dRectToSample / a3dRectDistance : -a3dRectNormal;",
    "        float a3dRectFacing = dot(a3dRectNormal, -L);",
    "        float a3dRectEmitterCosine = a3dRectUpData.w > 0.5 ? abs(a3dRectFacing) : max(a3dRectFacing, 0.0);",
    "        float a3dRectAttenuation = a3dGetDistanceAttenuation(a3dRectDistance, a3dRectPosition.w, 2.0);",
    "        vec3 radiance = a3dRectColor.rgb * a3dRectColor.a * a3dRectSampleArea * a3dRectEmitterCosine * a3dRectAttenuation;",
    "        a3dDirectLight(L, radiance, V, N, material, directDiffuse, directSpecular);",
    ...direct.map((s) => indent(indent(s))),
    "      }",
    "      continue;",
    "    }"
  ];
  const bound = directLightLoopBound(f);
  if (bound > 0) {
    lines.push(`  for (int i = 0; i < ${bound}; ++i) {  // bucketed light count (bound; breaks at u_lightCount)`);
    lines.push("    if (i >= int(u_lightCount)) break;");
    if (f.lights.rect) lines.push(...rectBody((column) => `u_lightData[i * 6 + ${column}]`));
    lines.push("    vec3 radiance = a3dLegacyLightRadiance(i * 6, v_worldPosition, L);");
    if (f.features[PROJECTED_SPOT_FEATURE] === true) {
      // The admitted packet identifies one slot in this exact packed light
      // selection. Multiply before shadows and every direct material lobe.
      lines.push("    if (u_projectedSpotEnabled > 0.5 && i == int(u_projectedSpotIndex) && u_lightData[i * 6 + 2].w > 1.5 && u_lightData[i * 6 + 2].w < 2.5) {");
      lines.push("      radiance *= a3dProjectedSpotImage(u_projectedSpotMap, v_worldPosition - u_lightData[i * 6 + 1].xyz, u_lightData[i * 6 + 2].xyz, u_lightData[i * 6 + 3].x, u_projectedSpotOffset, u_projectedSpotScale, u_projectedSpotRotation);");
      lines.push("    }");
    }
    if (shadowed) lines.push("    radiance *= a3dForwardLightShadow(u_lightData[i * 6 + 2].w, u_lightData[i * 6 + 3].z, v_worldPosition, N, L);");
    if (contactShadowed) lines.push("    if (i == int(u_contactShadowLightIndex) && u_lightData[i * 6 + 3].z > 0.5) radiance *= a3dContactShadowMaskFactor(u_lightData[i * 6 + 2].w);");
    if (pointShadowed) lines.push("    radiance *= a3dLegacyPointShadow(u_lightData[i * 6 + 2].w, u_lightData[i * 6 + 3].z, u_lightData[i * 6 + 1].xyz, v_worldPosition, N, L);");
    if (spotShadowed) lines.push("    radiance *= a3dLegacySpotShadow(u_lightData[i * 6 + 2].w, u_lightData[i * 6 + 3].z, u_lightData[i * 6 + 1].xyz, u_lightData[i * 6 + 2].xyz, v_worldPosition, N, L);");
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
  if (f.lights.rect) lines.push(...rectBody((column) => `texelFetch(u_clusterLightData, ivec2(${column}, lightIndex), 0)`));
  lines.push("    vec3 radiance = a3dClusteredLightRadiance(lightIndex, v_worldPosition, L);");
  if (shadowed) lines.push("    radiance *= a3dForwardLightShadow(texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0).w, texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0).z, v_worldPosition, N, L);");
  if (contactShadowed) lines.push("    if (lightIndex == int(u_contactShadowLightIndex) && texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0).z > 0.5) radiance *= a3dContactShadowMaskFactor(texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0).w);");
  if (pointShadowed) lines.push("    radiance *= a3dLegacyPointShadow(texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0).w, texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0).z, texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0).xyz, v_worldPosition, N, L);");
  if (spotShadowed) lines.push("    radiance *= a3dLegacySpotShadow(texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0).w, texelFetch(u_clusterLightData, ivec2(3, lightIndex), 0).z, texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0).xyz, texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0).xyz, v_worldPosition, N, L);");
  if (localShadowed) lines.push("    radiance *= a3dLocalLightShadow(texelFetch(u_clusterLightData, ivec2(2, lightIndex), 0).w, texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0).w, texelFetch(u_clusterLightData, ivec2(1, lightIndex), 0).xyz, v_worldPosition, N, L);");
  lines.push("    a3dDirectLight(L, radiance, V, N, material, directDiffuse, directSpecular);");
  lines.push(...direct);
  lines.push("  }");
  lines.push("#endif");
  return lines.join("\n");
}

/** UV sets affect the variant; offset/scale/rotation stay live uniforms. */
function uvVarying(f: ProgramFeatures, slot: keyof ProgramFeatures["maps"]): string {
  return f.maps[slot]?.uvSet === 1 ? "v_uv1" : "v_uv";
}
function uvExpr(f: ProgramFeatures, slot: keyof ProgramFeatures["maps"]): string {
  const uv = uvVarying(f, slot);
  if (!f.maps[slot] || slot === "diffuseRoughness" || slot === "bump") return uv;
  return `a3dCoreMapUv(${uv}, u_${slot}TextureOffset, u_${slot}TextureScale, u_${slot}TextureRotation)`;
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
  lines.push("#ifdef A3D_LOCAL_PROBE");
  lines.push("  vec3 a3dLocalProbeRadiance = a3d_probeSpecular(v_worldPosition, reflect(-V, N), material.roughness) * u_a3dLocalProbeIntensity;");
  lines.push("#endif");
  lines.push("#ifdef A3D_ENV_SAMPLE");
  lines.push("  float a3dRoughLod = material.roughness * 8.0;");
  lines.push("  vec3 a3dReflect = reflect(-V, N);");
  // brdf's a3dIndirect* take π-scaled irradiance (three r185 getIBLIrradiance
  // returns PI * envMapColor), not the raw radiance sample (#1140).
  lines.push("  vec3 a3dEnvIrradiance = PI * a3dSampleEnvironment(N, 8.0);");
  lines.push("#ifdef A3D_LOCAL_DIFFUSE_IRRADIANCE\n  a3dEnvIrradiance = a3dLocalDiffuseBlend(a3dEnvIrradiance, v_worldPosition, N);\n#endif");
  lines.push("  vec3 a3dSpecularRadiance = a3dSampleEnvironment(a3dReflect, a3dRoughLod);");
  lines.push("#ifdef A3D_LOCAL_PROBE");
  lines.push("  a3dSpecularRadiance = a3dSpecularRadiance * a3d_probeGlobalWeight() + a3dLocalProbeRadiance;");
  lines.push("#endif");
  lines.push("  indirectSpecular += a3dIndirectSpecular(a3dSpecularRadiance, a3dEnvIrradiance, V, N, material);");
  lines.push("  indirectDiffuse += a3dIndirectDiffuse(a3dEnvIrradiance, V, N, material);");
  lines.push("#elif defined(A3D_LOCAL_PROBE)");
  lines.push("#if defined(A3D_LOCAL_DIFFUSE_IRRADIANCE) && !defined(LIGHT_HEMISPHERE)");
  lines.push("  vec3 a3dEnvIrradiance = a3dLocalDiffuseBlend(vec3(0.0), v_worldPosition, N);");
  lines.push("#else\n  vec3 a3dEnvIrradiance = vec3(0.0);\n#endif");
  lines.push("  indirectSpecular += a3dIndirectSpecular(a3dLocalProbeRadiance, a3dEnvIrradiance, V, N, material);");
  lines.push("#endif");
  // Procedural environment (flag-off parity): its diffuse lights the surface
  // only when no sampled map does (the frozen shader mixes them on the sampled
  // weight); its specular stripes always add. Radiance → π-scaled irradiance.
  lines.push("#ifdef LIGHT_HEMISPHERE");
  lines.push("  vec3 a3dProcIrradiance = PI * a3dProceduralDiffuseRadiance(N);");
  lines.push("#ifndef A3D_ENV_SAMPLE");
  lines.push("#ifdef A3D_LOCAL_DIFFUSE_IRRADIANCE\n  a3dProcIrradiance = a3dLocalDiffuseBlend(a3dProcIrradiance, v_worldPosition, N);\n#endif");
  lines.push("  indirectDiffuse += a3dIndirectDiffuse(a3dProcIrradiance, V, N, material);");
  lines.push("#else");
  // The sampled map already supplied the multiscatter irradiance term.
  lines.push("  a3dProcIrradiance = vec3(0.0);");
  lines.push("#endif");
  if (e3Conjunction) lines.push("#ifndef A3D_ENV_SAMPLE");
  lines.push("  vec3 a3dProcSpecular = a3dProceduralSpecularRadiance(reflect(-V, N), material.roughness);");
  lines.push("#ifdef A3D_LOCAL_PROBE\n  a3dProcSpecular *= a3d_probeGlobalWeight();\n#endif");
  lines.push("  indirectSpecular += a3dIndirectSpecular(a3dProcSpecular, a3dProcIrradiance, V, N, material);");
  if (e3Conjunction) lines.push("#endif");
  lines.push("#endif");
  lines.push("#if defined(A3D_LOCAL_DIFFUSE_IRRADIANCE) && !defined(A3D_ENV_SAMPLE) && !defined(LIGHT_HEMISPHERE)");
  lines.push("  vec3 a3dVolumeOnly = a3dLocalDiffuseBlend(vec3(0.0), v_worldPosition, N);");
  lines.push("  indirectDiffuse += a3dIndirectDiffuse(a3dVolumeOnly, V, N, material);");
  lines.push("#ifndef A3D_LOCAL_PROBE\n  indirectSpecular += a3dIndirectSpecular(vec3(0.0), a3dVolumeOnly, V, N, material);\n#endif");
  lines.push("#endif");
  lines.push(occlusionIndirectSnippet(f));
  return lines.join("\n");
}

/** Occlusion-map scaling shared by the default body and its PRD-02 replacement. */
function occlusionIndirectSnippet(f: ProgramFeatures): string {
  return [
    "#ifdef USE_OCCLUSION_MAP",
    `  float a3dAo = mix(1.0, texture(u_occlusionMap, ${uvExpr(f, "occlusion")}).r, clamp(u_occlusionStrength, 0.0, 1.0));`,
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
  const graph = graphFor(f)?.material;
  const outputSrgb = f.features[PROGRAM_OUTPUT_SRGB_FEATURE] === true;
  const weighted = f.features[PROGRAM_TRANSPARENCY_FEATURE];
  const withBrdf = lit || state.builtins.has("brdf");
  const body: string[] = [];
  body.push("void main() {");
  body.push(FRAGMENT_VISIBILITY_BODY_GLSL);
  if (weighted) body.push("  a3dTestOpaqueDepth(a3dFragmentDepth);");
  body.push(...graphFragmentBody(f));
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
      // WP-04 authored-tangent identity: with a TANGENT attribute the map is
      // applied in the authored frame (materials/authoredTangent.ts); the
      // derivative frame above remains the fallback for untangented geometry.
      body.push("#ifdef A3D_PRD04_TANGENT_FRAME");
      body.push(`  vec3 a3dNormalTexel = texture(u_normalMap, ${uvExpr(f, "normal")}).xyz * 2.0 - 1.0;`);
      body.push("  if (dot(v_prd04Tangent.xyz, v_prd04Tangent.xyz) > 0.0) N = a3dAuthoredMapNormal(a3dAuthoredTangentFrame(geometryNormal, v_prd04Tangent, a3dPrd04FaceDirection()), a3dNormalTexel, u_normalScale);");
      body.push("#endif");
    } else {
      body.push("  vec3 N = geometryNormal;");
    }
    if (f.maps.bump) {
      body.push(`  vec2 a3dBumpUv = a3dSurfaceDetailUv(${uvExpr(f, "bump")}, u_bumpTextureOffset, u_bumpTextureScale, u_bumpTextureRotation);`);
      body.push("  N = a3dSurfaceBumpNormal(v_worldPosition, geometryNormal, N, a3dBumpUv);");
    }
    if (normalHooks.length > 0) body.push(...normalHooks.map((s) => indent(s)));
    if (graph?.fragment.outputs.normal) body.push(`  N = normalize(${graph.fragment.outputs.normal});`);
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
  if (graph?.fragment.outputs.color) {
    const target = graph.outputTypes.color === "vec4" ? "a3dBaseColor" : "a3dBaseColor.rgb";
    body.push(`  ${target} = ${graph.fragment.outputs.color};`);
  }
  if (graph?.fragment.outputs.metalness) body.push(`  a3dMetallic = ${graph.fragment.outputs.metalness};`);
  if (graph?.fragment.outputs.roughness) body.push(`  a3dRoughness = ${graph.fragment.outputs.roughness};`);
  if (lit) {
    body.push("  PhysicalMaterial material = a3dMakeMaterial(a3dBaseColor.rgb, a3dMetallic, a3dRoughness, u_ior, u_specularIntensity, u_specularColorFactor, geometryNormal);");
    if (f.maps.diffuseRoughness) {
      body.push(`  vec2 a3dDiffuseRoughnessUv = a3dSurfaceDetailUv(${uvExpr(f, "diffuseRoughness")}, u_diffuseRoughnessTextureOffset, u_diffuseRoughnessTextureScale, u_diffuseRoughnessTextureRotation);`);
      body.push("  float a3dDiffuseRoughnessSample = clamp(texture(u_diffuseRoughnessTexture, a3dDiffuseRoughnessUv).r, 0.0, 1.0);");
      body.push("  material.diffuseRoughness *= mix(1.0, a3dDiffuseRoughnessSample, clamp(u_diffuseRoughnessTextureEnabled, 0.0, 1.0));");
    }
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
    if (defines.A3D_NATIVE_BAKED_LIGHTMAP) {
      const uv = defines.A3D_NATIVE_LIGHTMAP_UV1 ? "v_uv1" : "v_uv";
      body.push(`  vec4 a3dNativeLightmap = a3dNativeLightmapIrradiance(u_a3dNativeLightmapTexture, ${uv});`);
      body.push("  vec3 a3dNativeBakedDiffuse = a3dIndirectDiffuse(a3dNativeLightmap.rgb * u_a3dNativeLightmapIntensity, V, N, material);");
      body.push("#ifdef USE_OCCLUSION_MAP\n  a3dNativeBakedDiffuse *= a3dAo;\n#endif");
      if (defines.A3D_NATIVE_LIGHTMAP_ADD) {
        body.push("  indirectDiffuse += a3dNativeBakedDiffuse * a3dNativeLightmap.a;");
      } else {
        body.push("  directDiffuse *= 1.0 - a3dNativeLightmap.a;");
        body.push("  indirectDiffuse = mix(indirectDiffuse, a3dNativeBakedDiffuse, a3dNativeLightmap.a);");
      }
    }
    if (lobeChunks.ibl.length > 0) {
      if (prd02IblReplacesIndirect) body.push("  vec3 a3dLobeIrradiance = a3dEnvIrradiance;");
      else body.push("#if defined(A3D_ENV_SAMPLE)\n  vec3 a3dLobeIrradiance = a3dEnvIrradiance;\n#elif defined(LIGHT_HEMISPHERE)\n  vec3 a3dLobeIrradiance = a3dProcIrradiance;\n#elif defined(A3D_LOCAL_DIFFUSE_IRRADIANCE)\n  vec3 a3dLobeIrradiance = a3dVolumeOnly;\n#else\n  vec3 a3dLobeIrradiance = vec3(0.0);\n#endif");
      if (defines.A3D_LOBE_DIFFUSE_TRANSMISSION) {
        if (prd02IblReplacesIndirect) {
          body.push("  vec3 a3dBackEnvIrradiance = a3dSH9Irradiance(a3dRotateY(-N, u_envRotation)) * u_envDiffuseIntensity;");
          body.push("  vec3 a3dBackHemi = mix(u_hemiGround, u_hemiSky, dot(-N, u_hemiDirection) * 0.5 + 0.5);");
          body.push("  vec3 a3dBackAmbientExitRadiance = u_ambientIrradiance + a3dBackHemi * RECIPROCAL_PI;");
        } else {
          body.push("  vec3 a3dBackAmbientExitRadiance = u_environmentColor * u_environmentIntensity * RECIPROCAL_PI;");
          body.push("#if defined(A3D_ENV_SAMPLE)\n  vec3 a3dBackEnvIrradiance = PI * a3dSampleEnvironment(-N, 8.0);\n#elif defined(LIGHT_HEMISPHERE)\n  vec3 a3dBackEnvIrradiance = PI * a3dProceduralDiffuseRadiance(-N);\n#else\n  vec3 a3dBackEnvIrradiance = vec3(0.0);\n#endif");
        }
        body.push("#ifdef A3D_LOCAL_DIFFUSE_IRRADIANCE\n  a3dBackEnvIrradiance = a3dLocalDiffuseBlend(a3dBackEnvIrradiance, v_worldPosition, -N);\n#endif");
      }
      body.push(...lobeChunks.ibl.map((s) => indent(s)));
    }
  }

  // fragment:emissive — emissive maps * color * strength.
  body.push("  vec3 a3dEmissive = u_emissiveColor * u_emissiveStrength;");
  body.push(`#ifdef USE_EMISSIVE_MAP\n  a3dEmissive *= texture(u_emissiveMap, ${uvExpr(f, "emissive")}).rgb;\n#endif`);
  if (emissiveHooks.length > 0) body.push(...emissiveHooks.map((s) => indent(s)));
  if (graph?.fragment.outputs.emissive) body.push(`  a3dEmissive = ${graph.fragment.outputs.emissive};`);

  // fragment:alpha — ALPHA_MASK discard runs last so masks see final alpha.
  body.push("  float a3dAlpha = a3dBaseColor.a;");
  if (graph?.fragment.outputs.opacity) body.push(`  a3dAlpha *= ${graph.fragment.outputs.opacity};`);
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
  if (!weighted) body.push("  a3dColor = max(a3dColor, vec3(0.0));");
  body.push("  float a3dDepth = gl_FragCoord.z / gl_FragCoord.w;");
  if (fogHooks.length > 0) {
    body.push(...fogHooks.map((s) => indent(s)));
  } else if (f.fog !== "none") {
    body.push("  a3dColor = a3dApplyFog(a3dColor, a3dDepth, v_worldPosition.y);");
  }
  if (endHooks.length > 0) body.push(...endHooks.map((s) => indent(s)));
  if (outputSrgb) body.push("  a3dColor = a3dEncodeForCanvas(a3dColor);");
  // Derivative-based normal, bump and anisotropy shading must run before
  // divergent clipping discards so derivatives remain defined at cut edges.
  body.push("#ifdef A3D_CLIPPING\n  if (a3dClipped) discard;\n#endif");
  if (weighted === "accumulation") body.push("  outColor = a3dWeightedAccumulation(a3dColor, a3dAlpha, a3dFragmentDepth);");
  else if (weighted === "revealage") body.push("  outColor = vec4(0.0, 0.0, 0.0, clamp(a3dAlpha, 0.0, 1.0));");
  else body.push("  outColor = vec4(a3dColor, a3dAlpha);");
  if (f.features[SELECTIVE_BLOOM_FEATURE] === true) body.push("  a3dBloomSignal = vec4(clamp(a3dColor, -u_a3dBloomMaxRadiance, u_a3dBloomMaxRadiance) * (0.5 * u_a3dBloomWeight), 1.0);");
  body.push("#if defined(BACKGROUND_COVERAGE) || defined(A3D_DEPTH_COVERAGE)\n  outCoverage = vec4(1.0, 1.0, 1.0, 1.0);\n#endif");
  body.push("}");

  return [
    "#version 300 es",
    `// ${marker}`,
    "precision highp float;",
    ...(defines.A3D_PHOTOMETRIC_PROFILE ? ["precision highp int;"] : []),
    emitDefines({ ...defines, A3D_STAGE_FRAGMENT: true }),
    COMMON_CHUNK_GLSL,
    FRAGMENT_VARYINGS,
    ...(graph?.varyings.includes("positionLocal") ? ["in vec3 v_a3dGraphLocalPosition;"] : []),
    ...(graph?.varyings.includes("normalLocal") ? ["in vec3 v_a3dGraphLocalNormal;"] : []),
    ...graphDeclarations(f, "fragment"),
    FRAGMENT_VISIBILITY_GLSL,
    ...(weighted ? [WEIGHTED_TRANSPARENCY_GLSL] : []),
    MATERIAL_UNIFORMS,
    CORE_MAP_TRANSFORMS_GLSL,
    ...(defines.A3D_IRRADIANCE_VOLUME ? [IRRADIANCE_VOLUME_GLSL] : []),
    ...nativeDiffuseDeclarations(defines),
    ...(defines.A3D_LOCAL_PROBE ? [PROBE_BOX_CHUNK_GLSL, "uniform float u_a3dLocalProbeIntensity;"] : []),
    ...(lit && (f.maps.diffuseRoughness || f.maps.bump) ? [SURFACE_DETAIL_GLSL] : []),
    ...(withBrdf ? [BRDF_CHUNK_GLSL] : []),
    ...(lit || f.maps.normal ? [NORMAL_CHUNK_GLSL] : []),
    ALPHA_CHUNK_GLSL,
    ...(lit && defines.A3D_PHOTOMETRIC_PROFILE ? [PHOTOMETRIC_PROFILE_GLSL] : []),
    ...(lit && defines.A3D_PROJECTED_SPOT ? [PROJECTED_SPOT_UNIFORMS_GLSL, PROJECTED_SPOT_GLSL] : []),
    ...(lit ? [LIGHTS_LEGACY_CHUNK_GLSL, INDIRECT_DEFAULT_CHUNK_GLSL] : []),
    ...(lit && f.shadows.contact ? [CONTACT_SHADOW_MASK_GLSL] : []),
    ...(lit && (defines.A3D_LEGACY_POINT_SHADOW || defines.A3D_LEGACY_SPOT_SHADOW)
      ? [legacyPunctualShadowChunk(defines.A3D_LEGACY_POINT_SHADOW === true, defines.A3D_LEGACY_SPOT_SHADOW === true)] : []),
    ...(forwardShadowReceive(f) ? [SHADOW_FORWARD_CHUNK_GLSL] : []),
    ...(forwardLocalShadowReceive(f) ? [SHADOW_LOCAL_CHUNK_GLSL] : []),
    ...(f.fog !== "none" ? [FOG_DEFAULT_CHUNK_GLSL] : []),
    ...(outputSrgb ? [OUTPUT_SRGB_CHUNK_GLSL] : []),
    ...lobeChunks.mapDeclarations,
    // Lobe pars + feature declarations + every call chunk's requires, in
    // requires-first order (T0-05).
    ...state.decls,
    ...(lobeChunks.ibl.length ? [`
vec3 a3dLobeEnvironment(vec3 direction, float roughness) {
  vec3 globalRadiance = vec3(0.0);
#ifdef A3D_ENV_SAMPLE
  ${prd02IblReplacesIndirect
    ? "globalRadiance = textureLod(u_envSpecular, a3dRotateY(direction, u_envRotation), a3dRoughnessToLod(roughness)).rgb * u_envSpecularIntensity;"
    : "globalRadiance = a3dSampleEnvironment(direction, roughness * 8.0);"}
#endif
#ifdef LIGHT_HEMISPHERE
  ${e3Conjunction ? "#ifndef A3D_ENV_SAMPLE" : ""}
  globalRadiance += a3dProceduralSpecularRadiance(direction, roughness);
  ${e3Conjunction ? "#endif" : ""}
#endif
#ifdef A3D_LOCAL_PROBE
  return globalRadiance * a3d_probeGlobalWeight() + a3d_probeSpecular(v_worldPosition, direction, roughness) * u_a3dLocalProbeIntensity;
#else
  return globalRadiance;
#endif
}`] : []),
    "layout(location = 0) out vec4 outColor;",
    "#if defined(BACKGROUND_COVERAGE) || defined(A3D_DEPTH_COVERAGE)\nlayout(location = 1) out vec4 outCoverage;\n#endif",
    ...(f.features[SELECTIVE_BLOOM_FEATURE] === true ? [
      "layout(location = 1) out vec4 a3dBloomSignal;",
      "uniform float u_a3dBloomWeight;",
      "uniform float u_a3dBloomMaxRadiance;"
    ] : []),
    ...body
  ].join("\n");
}

function depthFragmentSource(f: ProgramFeatures, defines: Record<string, string | number | true>, marker: string): string {
  const body: string[] = ["void main() {"];
  body.push(FRAGMENT_VISIBILITY_BODY_GLSL);
  if (f.alphaMode === "mask") {
    body.push(`#ifdef USE_BASE_COLOR_MAP\n  float a3dAlpha = texture(u_baseColorMap, ${uvExpr(f, "baseColor")}).a * u_baseColor.a;\n#else\n  float a3dAlpha = u_baseColor.a;\n#endif`);
    body.push("  a3dApplyAlpha(a3dAlpha);");
  }
  body.push("#ifdef A3D_CLIPPING\n  if (a3dClipped) discard;\n#endif");
  if (f.pass === "distance") {
    body.push("  float a3dDist = a3dPackDistance(distance(v_worldPosition, u_distanceLight.xyz), u_distanceLight.w);");
    body.push("  outColor = vec4(vec3(a3dDist), 1.0);");
  } else {
    body.push("  outColor = vec4(vec3(a3dFragmentDepth), 1.0);");
  }
  body.push("}");
  return [
    "#version 300 es",
    `// ${marker}`,
    "precision highp float;",
    emitDefines(defines),
    "in vec3 v_worldPosition;",
    FRAGMENT_VISIBILITY_GLSL,
    `#if defined(ALPHA_MASK) && defined(USE_BASE_COLOR_MAP)\nin vec2 ${uvVarying(f, "baseColor")};\n#endif`,
    "uniform vec4 u_baseColor;",
    CORE_MAP_TRANSFORMS_GLSL,
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
  readonly active: ProgramFeatures["extensions"][number][];
  readonly mapDeclarations: string[];
  readonly selectiveProducers: boolean[];
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
  const out: LobeCalls = { fragment: [], ibl: [], direct: [], active: [], mapDeclarations: [], selectiveProducers: [] };
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
  const mapSeen = new Set<string>();
  for (const lobe of lobes) {
    const ext = f.extensions.find((e) => matches(e, lobe));
    if (!ext) continue;
    out.active.push(ext);
    out.selectiveProducers.push(isStockPrd04Lobe(lobe) && lobe.id === "emissive-strength");
    const token = `A3D_LOBE_${defineToken(lobe.id)}`;
    defines[token] = true;
    const mapBits = PHYSICAL_LOBE_MAP_BITS[lobe.id] ?? {};
    for (const [bit, value] of Object.entries(ext.bits)) {
      if (Object.values(mapBits).includes(bit)) continue;
      if (!value) continue; // `#ifdef` reads truthy bits only
      defines[`${token}_${defineToken(bit)}`] = value === true ? true : value;
    }
    for (const [slot, bit] of Object.entries(mapBits)) {
      if (!ext.maps.includes(slot)) continue;
      defines[`${token}_${defineToken(bit)}`] = true;
      if (ext.mapUvSets?.[slot] === 1) defines.A3D_NEED_UV1 = true;
      else defines.A3D_NEED_UV0 = true;
      if (mapSeen.has(slot)) continue;
      mapSeen.add(slot);
      const uv = ext.mapUvSets?.[slot] === 1 ? "v_uv1" : "v_uv";
      out.mapDeclarations.push(`uniform mat3 u_${slot}TextureUvTransform;\n#define A3D_LOBE_UV_${defineToken(slot)} (u_${slot}TextureUvTransform * vec3(${uv}, 1.0)).xy`);
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
    // Custom lobe slots without built-in metadata retain the UV0 convention.
    if (ext.maps.some((slot) => !(slot in mapBits))) defines.A3D_NEED_UV0 = true;
  }
  return out;
}

/** Real C-02 program generation (PRD-01 §6.4). Flags may be omitted: feature bits then resolve no contributors. */
export function generateProgramImpl(features: ProgramFeatures, options: GenerateProgramOptions = {}): GeneratedProgram {
  return generateProgramInternal(features, options, false);
}

/**
 * Produce source for offline validation/integration work only. This does not
 * enable the native renderer: ProgramCache still calls generateProgramImpl,
 * and the current WebGPU device rejects the weighted descriptor. The preview
 * also cannot authorize ProgramCache's built-in WGSL reflection bridge.
 */
export function generateWeightedTransparencyWgslPreview(
  features: ProgramFeatures, options: GenerateProgramOptions = {}
): GeneratedProgram & { readonly weightedWgsl: ReturnType<typeof weightedWgslPhaseContract> } {
  const phase = features.features?.[PROGRAM_TRANSPARENCY_FEATURE];
  if (features.target !== "wgsl" || (phase !== "accumulation" && phase !== "revealage")) {
    throw new Error("INVALID_WEIGHTED_TRANSPARENCY_WGSL_PREVIEW");
  }
  if (wgslEmitter !== undefined) throw new Error("WEIGHTED_TRANSPARENCY_WGSL_PREVIEW_REQUIRES_BUILTIN");
  const result = generateProgramInternal(features, options, true);
  return freezeWeightedPreview({ ...result, weightedWgsl: weightedWgslPhaseContract(phase) });
}

/** Snapshot only this source-preview path: callers cannot mutate its descriptor
 * after its key and sources have been generated. No caller-owned object is
 * frozen. Graphs are rejected before copying, as their resources are not part
 * of the native weighted contract. */
function freezeWeightedPreview<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeWeightedPreview(child);
    Object.freeze(value);
  }
  return value;
}

function weightedPreviewFeatures(f: ProgramGraphFeatures): ProgramGraphFeatures {
  const invalid = () => { throw new Error("INVALID_WEIGHTED_TRANSPARENCY_WGSL_FEATURES"); };
  if (f.graph) invalid();
  for (const value of Object.values(f.features)) {
    if (typeof value !== "boolean" && typeof value !== "string"
      && (typeof value !== "number" || !Number.isFinite(value))) invalid();
  }
  for (const extension of f.extensions) for (const value of Object.values(extension.bits)) {
    if (typeof value !== "boolean" && typeof value !== "string"
      && (typeof value !== "number" || !Number.isFinite(value))) invalid();
  }
  if ([f.doubleSided, f.vertexColors, f.flatShading, f.specularAntialiasing, f.backgroundCoverage,
    f.lights.clustered, f.lights.hemisphere, f.shadows.contact].some((value) => typeof value !== "boolean")) invalid();
  if (![f.lights.dir, f.lights.point, f.lights.spot].every((value) => [0, 1, 2, 4, 8].includes(value))
    || ![0, 1, 2, 4].includes(f.lights.rect)
    || ![0, 1, 2, 3, 4].includes(f.shadows.cascades)
    || ![1, 4, 9].includes(f.shadows.pcfTaps)
    || !Number.isInteger(f.shadows.localShadows) || f.shadows.localShadows < 0 || f.shadows.localShadows > 6
    || !["none", "pmrem-cube", "equirect"].includes(f.environment)
    || !["lambert", "burley"].includes(f.diffuseModel)) invalid();
  for (const map of Object.values(f.maps)) {
    if (map && ((map.uvSet !== 0 && map.uvSet !== 1) || typeof map.transform !== "boolean")) invalid();
  }
  const fraction = f.features["prd03.indirectFraction"];
  const shadowFilter = f.features["prd02.shadowFilter"];
  if (fraction !== undefined && fraction !== false && fraction !== "indirectFraction") invalid();
  if (shadowFilter !== undefined && shadowFilter !== false
    && shadowFilter !== 1 && shadowFilter !== 2 && shadowFilter !== 3) invalid();
  return freezeWeightedPreview(snapshotOf(f));
}

function generateProgramInternal(features: ProgramFeatures, options: GenerateProgramOptions, sourceOnlyWeightedWgsl: boolean): GeneratedProgram {
  const input = normalizeProgramFeatures(features);
  const normalized = sourceOnlyWeightedWgsl ? weightedPreviewFeatures(input) : input;
  const builtinWgsl = normalized.target === "wgsl" && wgslEmitter === undefined;
  // The public C-02 record predates native primitive selection. Its implicit
  // topology is triangles; the device checks the resulting descriptor against
  // the actual draw. Explicit lines and points must retain their selected bits.
  const f = builtinWgsl && normalized.pass === "forward" && normalized.lighting === "unlit"
    && normalized.features["a3d.nativePrimitive"] === undefined
    ? { ...normalized, features: { ...normalized.features, "a3d.nativePrimitive": "triangles" } }
    : normalized;
  const depthCoverageIssue = depthCoverageUnsupportedReason(f);
  if (depthCoverageIssue) throw new Error(`GENERATED_DEPTH_COVERAGE_UNSUPPORTED: ${depthCoverageIssue}`);
  const nativeProbe = f.features[NATIVE_PROBE_GRID_FEATURE];
  const nativeVoxel = f.features[NATIVE_VOXEL_INDIRECT_FEATURE];
  const nativeLightmap = f.features[NATIVE_BAKED_LIGHTMAP_FEATURE];
  const nativeUv = f.features[NATIVE_LIGHTMAP_UV_FEATURE];
  if ((nativeProbe !== undefined && nativeProbe !== true) || (nativeVoxel !== undefined && nativeVoxel !== true)
      || (nativeLightmap !== undefined && nativeLightmap !== "replace-diffuse" && nativeLightmap !== "add-indirect")
      || (nativeLightmap === undefined ? nativeUv !== undefined : nativeUv !== 0 && nativeUv !== 1)) {
    throw new Error("ADVANCED_LIGHTING_FEATURE_INVALID");
  }
  const nativeCount = Number(nativeProbe === true) + Number(nativeVoxel === true) + Number(nativeLightmap !== undefined);
  if (nativeCount > 1 || (nativeCount > 0 && f.features[PRD02_IRRADIANCE_VOLUME_FEATURE] === true)) {
    throw new Error("ADVANCED_LIGHTING_SOURCE_CONFLICT");
  }
  if (nativeCount > 0 && (f.pass !== "forward" || f.lighting !== "lit")) throw new Error("ADVANCED_LIGHTING_PROGRAM_UNSUPPORTED");
  for (const feature of [LEGACY_POINT_SHADOW_FEATURE, LEGACY_SPOT_SHADOW_FEATURE]) {
    const value = f.features[feature];
    if (value !== undefined && (value !== true || f.pass !== "forward" || f.lighting !== "lit")) {
      throw new Error("GENERATED_PUNCTUAL_SHADOW_FEATURE_INVALID");
    }
  }
  const diffuseTransmission = f.extensions.some((ext) => ext.lobe === "diffuse-transmission" || ext.lobe === "KHR_materials_diffuse_transmission");
  if (diffuseTransmission && (nativeLightmap !== undefined || f.extensions.some((ext) => ext.lobe === "volume" || ext.lobe === "KHR_materials_volume"))) {
    throw new Error("GENERATED_DIFFUSE_TRANSMISSION_SOURCE_UNSUPPORTED");
  }
  const graph = graphFor(f)?.material;
  const photometric = f.features[PHOTOMETRIC_PROFILE_FEATURE];
  if (photometric !== undefined && (photometric !== true || f.pass !== "forward" ||
      f.lighting !== "lit" || f.lights.clustered || (f.lights.point === 0 && f.lights.spot === 0) || graph)) {
    throw new Error("GENERATED_PHOTOMETRIC_PROFILE_UNSUPPORTED");
  }
  const projectedSpot = f.features[PROJECTED_SPOT_FEATURE];
  if (projectedSpot !== undefined && (projectedSpot !== true || f.target !== "glsl300es" ||
      f.pass !== "forward" || f.lighting !== "lit" || f.lights.clustered || f.lights.spot === 0 || graph ||
      f.instancing !== undefined || f.skinning !== undefined || f.morph !== undefined || f.drawId !== undefined ||
      f.features["prd06.deform"] !== undefined || f.features["parity.batchDraw"] !== undefined ||
      f.features["prd11.drawId"] !== undefined)) {
    throw new Error("GENERATED_PROJECTED_SPOT_UNSUPPORTED");
  }
  if (f.pass !== "forward" && f.alphaMode === "mask" && (graph?.fragment.outputs.color || graph?.fragment.outputs.opacity)) {
    throw new Error("GRAPH_MASK_DEPTH_UNSUPPORTED");
  }
  const weighted = f.features[PROGRAM_TRANSPARENCY_FEATURE];
  if (weighted !== undefined && weighted !== false) {
    if ((weighted !== "accumulation" && weighted !== "revealage") || f.pass !== "forward" || f.alphaMode !== "blend") {
      throw new Error("INVALID_WEIGHTED_TRANSPARENCY_VARIANT");
    }
    if (f.features[PROGRAM_OUTPUT_SRGB_FEATURE] === true || f.backgroundCoverage) {
      throw new Error("WEIGHTED_TRANSPARENCY_REQUIRES_LINEAR_TARGET");
    }
    if (f.target === "wgsl") {
      if (!sourceOnlyWeightedWgsl) throw new Error("WEIGHTED_TRANSPARENCY_UNSUPPORTED_WGSL: use sorted transparency");
      if (f.features[PROGRAM_LOG_DEPTH_FEATURE] !== undefined && f.features[PROGRAM_LOG_DEPTH_FEATURE] !== false) {
        throw new Error("WEIGHTED_TRANSPARENCY_WGSL_LOG_DEPTH_UNSUPPORTED");
      }
      if (f.features["prd04.transmissionTarget"] !== undefined && f.features["prd04.transmissionTarget"] !== false
        || f.extensions.some(({ lobe }) => ["transmission", "diffuse-transmission", "volume", "dispersion",
          "KHR_materials_transmission", "KHR_materials_diffuse_transmission", "KHR_materials_volume", "KHR_materials_dispersion"].includes(lobe))) {
        throw new Error("WEIGHTED_TRANSPARENCY_WGSL_TRANSMISSION_UNSUPPORTED");
      }
      if (f.features["a3d.independentPhysicalPreview"] === true) {
        throw new Error("WEIGHTED_TRANSPARENCY_WGSL_PHYSICAL_PREVIEW_UNSUPPORTED");
      }
    }
  }
  const depthCoverage = f.features[DEPTH_COVERAGE_FEATURE] === true;
  const selectedContributions = f.target !== "wgsl" || builtinWgsl || photometric === true || depthCoverage ? contributingFeatures(f, options.flags) : [];
  // A false feature bit is disabled, not an active contributor. Restrict this
  // adjustment to preview variants; existing runtime paths retain their behavior.
  const contributions = sourceOnlyWeightedWgsl
    ? selectedContributions.filter(({ value }) => value !== false)
    : selectedContributions;
  // Arbitrary contributor hooks can author fragment depth or change output
  // semantics. Admit only the built-in axes represented by the native forward
  // program until contributors expose an explicit paired-depth contract.
  const coverageContributors = new Set(["prd02.ibl", "prd02.shadowFilter", "prd04.tangentFrame", "prd06.deform", "a3d.packedLoopColor", "prd15.parityPoints"]);
  if (depthCoverage && contributions.some(({ feature }) => !coverageContributors.has(feature.id))) {
    throw new Error("GENERATED_DEPTH_COVERAGE_CONTRIBUTOR_UNSUPPORTED");
  }
  if (photometric === true && contributions.some(({ feature }) => feature.hooks.includes("fragment:lights"))) {
    throw new Error("GENERATED_PHOTOMETRIC_LIGHT_HOOK_UNSUPPORTED");
  }
  if (projectedSpot === true && contributions.some(({ feature }) => feature.hooks.includes("fragment:lights"))) {
    throw new Error("GENERATED_PROJECTED_SPOT_LIGHT_HOOK_UNSUPPORTED");
  }
  if (f.target === "wgsl") {
    if (wgslEmitter) return wgslEmitter(f);
    if (f.pass !== "forward") {
      throw new Error(`WGSL_PROGRAM_UNSUPPORTED: generated ${f.pass} pass`);
    }
    const active = new Set(contributions.map(({ feature }) => feature.id));
    for (const id of WGSL_PROVIDER_FEATURES) {
      const value = f.features[id];
      if (value !== undefined && value !== false && !active.has(id)) {
        throw new Error(`WGSL_PROGRAM_UNSUPPORTED: feature ${id} has no active contributor`);
      }
    }
  }
  if (f.pass === "forward" && f.lighting === "lit" && f.lights.rect > 0
    && contributions.some(({ feature }) => feature.hooks.includes("fragment:lights"))) {
    throw new Error("GENERATED_RECT_LIGHT_HOOK_UNSUPPORTED");
  }
  if (diffuseTransmission && contributions.some(({ feature }) => feature.hooks.includes("fragment:lights")
    || (feature.hooks.includes("fragment:indirect") && feature.id !== PRD02_IBL_FEATURE))) {
    throw new Error("GENERATED_DIFFUSE_TRANSMISSION_LIGHT_HOOK_UNSUPPORTED");
  }
  if (nativeCount > 0 && contributions.some(({ feature }) => feature.id !== PRD02_IBL_FEATURE && feature.hooks.includes("fragment:indirect"))) {
    throw new Error("ADVANCED_LIGHTING_INDIRECT_HOOK_UNSUPPORTED");
  }
  if (nativeLightmap !== undefined && f.extensions.some((ext) => ext.lobe === "transmission" || ext.lobe === "KHR_materials_transmission")) {
    throw new Error("ADVANCED_LIGHTING_TRANSMISSION_UNSUPPORTED");
  }
  const defines = definesFor(f, contributions);
  if (f.instancing && defines.A3D_SKINNING === 8 && defines.USE_INSTANCING_COLOR && defines.A3D_INSTANCE_EMISSIVE_ATTRIBUTE) {
    throw new Error("GENERATED_INSTANCE_COLOR_LAYOUT_UNSUPPORTED");
  }
  // Varying/attribute needs shared by both stages (drives A3D_NEED_* in each).
  if (f.lighting === "lit" || (f.pass === "forward" && f.flatShading)) defines.A3D_NEED_NORMAL = true;
  if (Object.values(f.maps).some((m) => m && (m.uvSet ?? 0) === 0)) defines.A3D_NEED_UV0 = true;
  if (Object.values(f.maps).some((m) => m && m.uvSet === 1)) defines.A3D_NEED_UV1 = true;
  if (graph?.builtins.includes("uv0")) defines.A3D_NEED_UV0 = true;
  if (graph?.builtins.includes("uv1")) defines.A3D_NEED_UV1 = true;
  if (nativeLightmap !== undefined) defines[nativeUv === 1 ? "A3D_NEED_UV1" : "A3D_NEED_UV0"] = true;
  if (graph?.builtins.includes("normalLocal") || graph?.builtins.includes("normalWorld")) defines.A3D_NEED_NORMAL = true;
  const report = (d: ProgramDegradation) => {
    programDegradationLog.push(d);
    options.onDegradation?.(d);
  };
  const fragmentState = newSpliceState();
  const lobes = extensionLobeChunks(f, options.flags, fragmentState, defines, report);
  // The GLSL lobe registry resolves one record per lobe. Returning its first
  // match for duplicate aliases or unavailable providers would otherwise
  // silently drop an authored WGSL extension.
  if (f.target === "wgsl" && f.extensions.length !== lobes.active.length) {
    throw new Error("WGSL_PROGRAM_UNSUPPORTED: inactive, unregistered, or duplicate material extension");
  }
  if (diffuseTransmission && f.pass === "forward" && f.lighting === "lit" && !defines.A3D_LOBE_DIFFUSE_TRANSMISSION) {
    throw new Error("GENERATED_DIFFUSE_TRANSMISSION_LOBE_UNAVAILABLE");
  }
  if (f.instancing && defines.A3D_LOBE_VOLUME && defines.A3D_LOBE_TRANSMISSION) defines.A3D_INSTANCE_VOLUME_TRANSFORM = true;
  const e3Conjunction = e3CompilerLightingOn(options.flags);
  const prd02IblReplacesIndirect = e3Conjunction
    && contributions.some(({ feature }) => feature.id === PRD02_IBL_FEATURE);
  const descriptor = {
    features: f,
    activeFeatures: contributions.map(({ feature, value }) => ({ id: feature.id, value })),
    activeExtensions: lobes.active,
    defines: { ...defines },
    lighting: { compilerLightingConjunction: e3Conjunction, iblReplacesIndirect: prd02IblReplacesIndirect },
    // Native WGSL replaces the wetness and fog GLSL chunks with its own templates, so it
    // admits those contributors only when they are the unchanged built-in objects.
    verifiedFeatures: contributions
      .filter(({ feature }) => ((feature.id === "prd07.wetness" || feature.id === "prd07.fog") && isStockPrd07BloomFeature(feature))
        || isStockPrd10WindDeform(feature))
      .map(({ feature }) => feature.id)
  };
  // Native templates also depend on resolved flags/providers, not just the
  // feature record. A source preview must not reuse a different shader under
  // the same key. The base key already canonicalizes the full feature and
  // extension records; this suffix captures the remaining resolved inputs and
  // versions the fixed phase/attachment contract. It is never a runtime key.
  const key = sourceOnlyWeightedWgsl
    ? `${programKey(normalized)}|weighted-wgsl-preview-v1:${JSON.stringify([
      descriptor.lighting, descriptor.activeFeatures.map(({ id, value }) => [id, value]),
      descriptor.activeExtensions.map(({ lobe }) => lobe),
      Object.keys(defines).sort().map((name) => [name, defines[name]])
    ])}`
    : programKey(normalized);
  // FNV-1a of the canonical key: short, deterministic, comment-safe.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const marker = `${GENERATED_PROGRAM_MARKER}:${(h >>> 0).toString(16)}`;
  if (f.target === "wgsl") {
    // Reuse the same validated, resource-aware templates used by the native
    // device. Their descriptor validators explicitly reject unsupported axes.
    // Remove the source-only axis just for template validation, never from
    // the returned descriptor or cache key. The native device still rejects it.
    const nativeFeatures = { ...f.features };
    if (sourceOnlyWeightedWgsl) delete nativeFeatures[PROGRAM_TRANSPARENCY_FEATURE];
    const nativeDescriptor = sourceOnlyWeightedWgsl
      ? { ...descriptor, features: { ...f, features: nativeFeatures } }
      : descriptor;
    const native = f.lighting === "unlit"
      ? createGeneratedUnlitProgram(nativeDescriptor)
      : createGeneratedPbrProgram(nativeDescriptor);
    const fragment = sourceOnlyWeightedWgsl
      ? composeWeightedWgslFragment(native.vertex, native.fragment, f, weighted as WeightedWgslPhase,
        native.resources.filter(({ uniform }) => uniform !== "u_boneTexture" && uniform !== "u_morphTexture").length)
      : native.fragment;
    const result: GeneratedProgram = {
      key, vertex: `// ${marker}\n${native.vertex}`, fragment: `// ${marker}\n${fragment}`,
      defines, descriptor
    };
    if (!sourceOnlyWeightedWgsl) builtinWgslPrograms.add(result);
    return result;
  }
  const vertex = vertexSource(f, contributions, defines, marker);
  const fragment =
    f.pass === "forward"
      ? forwardFragmentSource(f, contributions, defines, marker, fragmentState, lobes, prd02IblReplacesIndirect, e3Conjunction)
      : depthFragmentSource(f, defines, marker);
  const generated: GeneratedProgram = { key, vertex, fragment, defines, descriptor };
  // 4.7.x selective bloom: record producer provenance while the ordinary
  // generator runs. An application can supply unusual feature records for
  // ordinary programs; a non-JSON key or malformed record merely declines.
  const selectiveFeaturesSafe = contributions.every(({ feature }) =>
    stockSelectedFeature(feature) || isStockPrd02IblBloomFeature(feature) ||
    isStockPrd07BloomFeature(feature) || isStockCameraFadeBloomFeature(feature));
  let keysSafe = false;
  let extensionsSafe = false;
  try {
    const recorded = JSON.parse(key) as ProgramFeatures;
    if (recorded && recorded.features && typeof recorded.features === "object" && Array.isArray(recorded.extensions)) {
      keysSafe = Object.keys(recorded.features).every((name) =>
        name === "prd03.indirectFraction" || name === "prd02.shadowFilter" || name === PRD02_IBL_FEATURE ||
        name === "prd07.fog" || name === "prd07.wetness" || name === "prd08.cameraFade");
      const extension = recorded.extensions[0];
      extensionsSafe = recorded.extensions.length === 0 ||
        (recorded.lighting === "lit" && recorded.extensions.length === 1 && extension !== null && typeof extension === "object" &&
         (extension.lobe === "emissive-strength" || extension.lobe === "KHR_materials_emissive_strength") &&
         lobes.selectiveProducers.length === 1 && lobes.selectiveProducers[0] === true);
    }
  } catch {
    // The ordinary generated shader is unaffected.
  }
  // Native 5.0 axes that own location 1 or change the colour write
  // (depth coverage, weighted transparency) never gain the signal output.
  selectiveProvenance.set(generated, f.pass === "forward" && !f.backgroundCoverage && f.alphaMode !== "blend" &&
    f.features[DEPTH_COVERAGE_FEATURE] !== true && f.features[PROGRAM_TRANSPARENCY_FEATURE] === undefined &&
    keysSafe && extensionsSafe && selectiveFeaturesSafe && fragmentState.selectiveChunksSafe);
  return generated;
}

// Lane 01 installs the real C-02 generator into the contract surface on import.
installProgramGenerator((features) => generateProgramImpl(features));
