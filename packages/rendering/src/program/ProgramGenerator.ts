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
 * Splice convention: a ShaderFeature's `chunks[i]` lands at `hooks[min(i,
 * hooks.length - 1)]`, deduplicated by chunk name per program. A `*:pars`
 * hook emits at global scope before `main`; a body hook emits inside `main`
 * where the default body would have run — registering a feature at a body
 * hook replaces that hook's default. The `vertex:deform` call is canonical:
 * the generator emits `a3dDeform(pos, nrm, tan)` when a registered feature
 * claims the hook and the C-18 passthrough otherwise (CONTRACTS §8.5).
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
import { INDIRECT_DEFAULT_CHUNK_GLSL } from "./chunks/indirect_default.glsl";
import { FOG_DEFAULT_CHUNK_GLSL } from "./chunks/fog_default.glsl";
import { DEPTH_CHUNK_GLSL, DISTANCE_CHUNK_PARS_GLSL } from "./chunks/depth.glsl";
import { normalizeProgramFeatures, totalLightCount, MAP_DEFINES } from "./ProgramFeatures";
import { programKey } from "./ProgramKey";

export const GENERATED_PROGRAM_MARKER = "a3d-generated-program";

export interface ProgramDegradation {
  readonly code: "extension-lobe-pending";
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

/** Resolve contributing features from the record's `features` bits, in (order, id) order. */
function contributingFeatures(f: ProgramFeatures, flags: QrFlags | undefined): Contribution[] {
  const out: Contribution[] = [];
  if (!flags) return out;
  for (const feature of shaderFeaturesFor(flags)) {
    const value = f.features[feature.id];
    if (value !== undefined) out.push({ feature, value });
  }
  return out;
}

function definesFor(f: ProgramFeatures, contributions: readonly Contribution[]): Record<string, string | number | true> {
  const d: Record<string, string | number | true> = {};
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
  if (f.fog === "linear") d.FOG_LINEAR = true;
  if (f.fog === "exp2" || f.fog === "height") d.FOG_EXP2 = true;
  if (f.fog === "height") d.FOG_HEIGHT = true;
  if (f.skinning) d.USE_SKINNING = true;
  if (f.morph) d.USE_MORPH = true;
  if (f.drawId) d.USE_DRAW_ID = true;
  const total = totalLightCount(f.lights);
  if (f.lights.clustered || total > 8) {
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

/** Chunks spliced per hook point, in (feature.order, feature.id) order, deduped by name. */
function hookSplice(contributions: readonly Contribution[], hook: ShaderHookPoint): string[] {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const { feature } of contributions) {
    const idx = feature.hooks.indexOf(hook);
    if (idx === -1) continue;
    const chunkNames = feature.chunks.length > 0 ? feature.chunks : [];
    const chosen = chunkNames[Math.min(idx, Math.max(chunkNames.length - 1, 0))] ?? chunkNames[0];
    const pending = chosen !== undefined ? [chosen] : [];
    while (pending.length > 0) {
      const name = pending.shift()!;
      if (seen.has(name)) continue;
      const chunk = shaderChunk(name);
      if (!chunk) continue;
      seen.add(name);
      for (const req of chunk.requires ?? []) pending.push(req);
      parts.push(chunk.glsl);
    }
  }
    return parts;
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
  const localDefines = defines;
  const parsHooks = hookSplice(contributions, "vertex:pars");
  const deformHooks = hookSplice(contributions, "vertex:deform");
  const worldHooks = hookSplice(contributions, "vertex:world");
  const endHooks = hookSplice(contributions, "vertex:end");
  const deformCall = hasHookContributor(contributions, "vertex:deform")
    ? "  a3dDeform(a3dDeformPos, objectNormal, objectTangent);  // C-18"
    : "  // C-18 passthrough: no deform chunk registered";

  const decls = [
    "#version 300 es",
    `// ${marker}`,
    "precision highp float;",
    emitDefines(localDefines),
    COMMON_CHUNK_GLSL,
    "uniform mat4 u_modelMatrix;",
    "uniform mat4 u_geometryMatrix;",
    "uniform mat4 u_normalMatrix;",
    "uniform float u_pointSize;",
    VERTEX_ATTRIBUTES,
    INSTANCING_VERTEX_PARS_GLSL,
    ...parsHooks,
    // vertex:deform contributors declare a3dDeform() here; the call itself is
    // canonical inside main() (C-18, CONTRACTS §8.5).
    ...deformHooks,
    "out vec3 v_worldPosition;",
    "#ifdef A3D_NEED_NORMAL\nout vec3 v_normal;\n#endif",
    "#ifdef A3D_NEED_UV0\nout vec2 v_uv;\n#endif",
    "#ifdef A3D_NEED_UV1\nout vec2 v_uv1;\n#endif",
    "#ifdef VERTEX_COLORS\nout vec4 v_color;\n#endif"
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
    "  gl_Position = u_viewProjection * a3dWorld;",
    "  gl_PointSize = u_pointSize;",
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
#endif`;

/** Default `fragment:lights` body: `u_lightData` kind-discriminated loop.
 * Bucketed total ({0,1,2,4,8}) is baked so each bucket compiles its own bound;
 * `a3dLegacyLightRadiance` switches on directionKind.w, so packing order is
 * irrelevant. Above 8 / clustered, only the cluster path runs. */
function defaultLightsBody(f: ProgramFeatures): string {
  const lines = ["  vec3 L;"];
  const total = totalLightCount(f.lights);
  const clustered = f.lights.clustered || total > 8;
  if (!clustered && total > 0) {
    lines.push(`  for (int i = 0; i < ${Math.min(total, 8)}; ++i) {  // bucketed light count`);
    lines.push("    vec3 radiance = a3dLegacyLightRadiance(i * 6, v_worldPosition, L);");
    lines.push("    a3dDirectLight(L, radiance, V, N, material, directDiffuse, directSpecular);");
    lines.push("  }");
  }
  lines.push("#ifdef LIGHTS_CLUSTERED");
  lines.push("  int a3dCluster = a3dClusterIndex(gl_FragCoord.xy);");
  lines.push("  int a3dClusterCount = int(texelFetch(u_clusterLightIndices, ivec2(0, a3dCluster), 0).r);");
  lines.push("  for (int j = 1; j <= a3dClusterCount; ++j) {");
  lines.push("    int lightIndex = int(texelFetch(u_clusterLightIndices, ivec2(j, a3dCluster), 0).r);");
  lines.push("    vec3 radiance = a3dClusteredLightRadiance(lightIndex, v_worldPosition, L);");
  lines.push("    a3dDirectLight(L, radiance, V, N, material, directDiffuse, directSpecular);");
  lines.push("  }");
  lines.push("#endif");
  return lines.join("\n");
}

/** UV varying for a map slot (`uvSet` 0 -> v_uv, 1 -> v_uv1). */
function uvExpr(f: ProgramFeatures, slot: keyof ProgramFeatures["maps"]): string {
  return f.maps[slot]?.uvSet === 1 ? "v_uv1" : "v_uv";
}

/** Default `fragment:indirect` body: ambient 1/pi + single env sample.
 * Accumulators are declared by the caller so replacing hooks see them too. */
function defaultIndirectBody(f: ProgramFeatures): string {
  const lines: string[] = [];
  lines.push("  indirectDiffuse += a3dAmbientDiffuse(material.diffuseContribution);");
  lines.push("#ifdef ENVMAP_TYPE_EQUIRECT");
  lines.push("  float a3dRoughLod = material.roughness * 8.0;");
  lines.push("  vec3 a3dReflect = reflect(-V, N);");
  lines.push("  indirectSpecular += a3dIndirectSpecular(a3dSampleEnvironment(a3dReflect, a3dRoughLod), V, N, material);");
  lines.push("  indirectDiffuse += a3dIndirectDiffuse(a3dSampleEnvironment(N, 8.0), V, N, material);");
  lines.push("#endif");
  lines.push("#ifdef USE_OCCLUSION_MAP");
  lines.push(`  float a3dAo = texture(u_occlusionMap, ${uvExpr(f, "occlusion")}).r;`);
  lines.push("  indirectDiffuse *= a3dAo;");
  lines.push("  indirectSpecular *= a3dAo;");
  lines.push("#endif");
  return lines.join("\n");
}

function forwardFragmentSource(f: ProgramFeatures, contributions: readonly Contribution[], defines: Record<string, string | number | true>, marker: string, lobeChunks: { pars: string[]; fragment: string[]; ibl: string[] }): string {
  const parsHooks = hookSplice(contributions, "fragment:pars");
  const alphaHooks = hookSplice(contributions, "fragment:alpha");
  const normalHooks = hookSplice(contributions, "fragment:normal");
  const materialHooks = hookSplice(contributions, "fragment:material");
  const lightsHooks = hookSplice(contributions, "fragment:lights");
  const indirectHooks = hookSplice(contributions, "fragment:indirect");
  const emissiveHooks = hookSplice(contributions, "fragment:emissive");
  const fogHooks = hookSplice(contributions, "fragment:fog");
  const endHooks = hookSplice(contributions, "fragment:end");

  const lit = f.lighting === "lit";
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
  if (lobeChunks.fragment.length > 0) body.push(...lobeChunks.fragment.map((s) => indent(s)));

  body.push("  vec3 directDiffuse = vec3(0.0);");
  body.push("  vec3 directSpecular = vec3(0.0);");
  body.push("  vec3 indirectDiffuse = vec3(0.0);");
  body.push("  vec3 indirectSpecular = vec3(0.0);");
  if (lit) {
    body.push(lightsHooks.length > 0 ? lightsHooks.map((s) => indent(s)).join("\n") : defaultLightsBody(f));
    body.push(indirectHooks.length > 0 ? indirectHooks.map((s) => indent(s)).join("\n") : defaultIndirectBody(f));
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
  body.push("  outColor = vec4(a3dColor, a3dAlpha);");
  body.push("#ifdef BACKGROUND_COVERAGE\n  outCoverage = vec4(1.0, 1.0, 1.0, 1.0);\n#endif");
  body.push("}");

  return [
    "#version 300 es",
    `// ${marker}`,
    "precision highp float;",
    emitDefines(defines),
    COMMON_CHUNK_GLSL,
    FRAGMENT_VARYINGS,
    MATERIAL_UNIFORMS,
    ...(lit ? [BRDF_CHUNK_GLSL] : []),
    ...(lit || f.maps.normal ? [NORMAL_CHUNK_GLSL] : []),
    ALPHA_CHUNK_GLSL,
    ...(lit ? [LIGHTS_LEGACY_CHUNK_GLSL, INDIRECT_DEFAULT_CHUNK_GLSL] : []),
    ...(f.fog !== "none" ? [FOG_DEFAULT_CHUNK_GLSL] : []),
    ...lobeChunks.pars,
    ...parsHooks,
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

/** Extension lobes registered through C-03 for this record, keyed by splice point. */
function extensionLobeChunks(f: ProgramFeatures, flags: QrFlags | undefined, report: (d: ProgramDegradation) => void): { pars: string[]; fragment: string[]; ibl: string[] } {
  const out = { pars: [] as string[], fragment: [] as string[], ibl: [] as string[] };
  if (!flags || f.extensions.length === 0) return out;
  const lobes = materialLobes(flags);
  const wanted = new Set(f.extensions.map((ext) => ext.lobe));
  for (const lobe of lobes) {
    if (lobe.glTFExtension === undefined || !wanted.has(lobe.glTFExtension)) continue;
    for (const [key, chunkName] of [["pars", lobe.chunks.pars], ["fragment", lobe.chunks.fragment], ["ibl", lobe.chunks.ibl]] as const) {
      if (!chunkName) continue;
      const chunk = shaderChunk(chunkName);
      if (!chunk) continue;
      const list = key === "pars" ? out.pars : key === "fragment" ? out.fragment : out.ibl;
      if (!list.includes(chunk.glsl)) list.push(chunk.glsl);
    }
  }
  const pending = f.extensions.filter((ext) => !lobes.some((l) => l.glTFExtension === ext.lobe));
  if (pending.length > 0) {
    report({
      code: "extension-lobe-pending",
      message: `extension lobe(s) pending lane 04 registration: ${pending.map((ext) => ext.lobe).join(", ")}`,
      ownerPrd: 4
    });
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
  const isDepthLike = f.pass === "depth" || f.pass === "distance" || f.pass === "velocity";
  if (f.lighting === "lit" || (f.pass === "forward" && f.flatShading)) defines.A3D_NEED_NORMAL = true;
  if (Object.values(f.maps).some((m) => m && (m.uvSet ?? 0) === 0)) defines.A3D_NEED_UV0 = true;
  if (Object.values(f.maps).some((m) => m && m.uvSet === 1)) defines.A3D_NEED_UV1 = true;
  const report = (d: ProgramDegradation) => {
    programDegradationLog.push(d);
    options.onDegradation?.(d);
  };
  const lobes = extensionLobeChunks(f, options.flags, report);
  const vertex = vertexSource(f, contributions, defines, marker);
  const fragment =
    f.pass === "forward"
      ? forwardFragmentSource(f, contributions, defines, marker, lobes)
      : depthFragmentSource(f, defines, marker);
  return { key, vertex, fragment, defines };
}

// Lane 01 installs the real C-02 generator into the contract surface on import.
installProgramGenerator((features) => generateProgramImpl(features));
