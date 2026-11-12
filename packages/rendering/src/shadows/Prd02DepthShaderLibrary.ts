/**
 * PRD-02 Phase 4 — C-11 shadow-caster depth variants.
 *
 * One depth shader body compiled per variant id (`shadowCasterVariantId`):
 * instanced draws pull `u_instanceMatrices` via `gl_InstanceID` (64/draw, the
 * same uniform-array convention the lit shaders use when instance attributes
 * are absent), skinned draws reuse the `skinning_common` chunk (uniform or
 * data-texture palette through `u_jointPaletteMode`), alpha-tested casters
 * combine material, map, vertex and packed-member alpha before the cutoff. Extra
 * `DepthVariantFeature`s registered for pass "depth" splice their own defines.
 *
 * Flag: A3D_QR_LIGHTING.
 */

import type { QrFlags } from "../contracts/core";
import type { AuraQualityTierSettings } from "../contracts/quality";
import type { RenderItem } from "../contracts/renderItem";
import type { VertexAttribute, VertexAttributeSemantic, VertexFormat } from "../VertexFormat";
import {
  depthVariantFeaturesFor,
  registerDepthVariantFeature,
  type DepthVariantFeature,
  type ShadowCasterVariantKey
} from "../contracts/shadows";
import { shaderChunk, type ShaderChunk } from "../contracts/program";
import { MAX_UNIFORM_SKINNING_JOINTS } from "../ShaderChunks";
import { MaterialInstance } from "../MaterialInstance";
import type { Material } from "../Material";
import type { ShaderLibrary } from "../ShaderLibraryCore";
import { RenderDeviceError, type PortableShaderBinding, type RenderDevice, type RenderShaderProgram } from "../RenderDevice";
import { shadowCasterVariantId } from "../contracts/shadows";
import { DENSE_DEPTH_INSTANCE_MIN, denseDepthDrawsEnabled, shadowFitLegacy } from "./shadowLegacy";
import { isStockPrd10WindDeform, prd10WindOffsetWgsl } from "../world/vegetation/shaders/wind.js";

export const PRD02_DEPTH_SHADER_NAME = "aura3d/prd02-depth";
export const PRD02_DEPTH_SHADER_MARKER = "@aura3d-shader:prd02-depth";
/** Uniform-path instancing cap; larger batches split into multiple draws. */
export const PRD02_DEPTH_MAX_INSTANCES = 64;
/** Marks compiler-coalesced static auto-instanced RenderItems so >64 instances draw in 1 depth call. */
export const COMPILER_AUTO_INSTANCED_SYMBOL = Symbol.for("aura3d.compilerAutoInstanced");

/**
 * Instances beyond the uniform array ride a per-instance vertex-attribute buffer (one draw instead of ceil(n / 64) per cascade).
 * The 4.3.0 shadow behaviour (`__A3D_SHADOW_FIT__ = "current"`) uses it for every node above 64 instances. In the default (legacy)
 * fit only nodes that the engine has already given an instanced shadow proxy (`shadowGeometry`: builtin primitive, authored by
 * params not geometry, qr core path, castShadow, 1,024+ instances, proxy strictly cheaper; see `qrPrimitiveShadowGeometryFor`) or
 * compiler-coalesced static auto-instanced batches use it. Every other instanced caster keeps the 4.2.0 uniform-array batches.
 */
export function depthUsesInstanceAttributes(item: {
  readonly instanceTransforms?: ArrayLike<number> | undefined;
  readonly shadowGeometry?: unknown;
  readonly drawRange?: unknown;
}): boolean {
  const count = (item.instanceTransforms?.length ?? 0) / 16;
  if (count <= PRD02_DEPTH_MAX_INSTANCES) return false;
  if ((item as Record<symbol, unknown>)[COMPILER_AUTO_INSTANCED_SYMBOL] === true && item.drawRange === undefined) {
    return true;
  }
  if (!shadowFitLegacy()) return true;
  return count >= DENSE_DEPTH_INSTANCE_MIN && item.shadowGeometry !== undefined && item.drawRange === undefined && denseDepthDrawsEnabled();
}

export function registerPrd02DepthShader(library: ShaderLibrary): void {
  library.register({
    name: PRD02_DEPTH_SHADER_NAME,
    marker: PRD02_DEPTH_SHADER_MARKER,
    vertex: `#version 300 es
// ${PRD02_DEPTH_SHADER_MARKER}
precision highp float;
precision highp int;
layout(location = 0) in vec3 a_position;
#if A3D_DEPTH_SKINNED
#if A3D_DEPTH_JOINTS_UINT
layout(location = 5) in uvec4 a_joints;
#else
#if A3D_DEPTH_JOINTS_SINT
layout(location = 5) in ivec4 a_joints;
#else
layout(location = 5) in vec4 a_joints;
#endif
#endif
layout(location = 6) in vec4 a_weights;
#if A3D_DEPTH_EIGHT_INFLUENCES
#if A3D_DEPTH_JOINTS1_UINT
layout(location = 8) in uvec4 a_joints1;
#else
#if A3D_DEPTH_JOINTS1_SINT
layout(location = 8) in ivec4 a_joints1;
#else
layout(location = 8) in vec4 a_joints1;
#endif
#endif
layout(location = 9) in vec4 a_weights1;
#endif
#endif
#if A3D_DEPTH_ALPHA_MAP
#if A3D_DEPTH_ALPHA_UV1
layout(location = 7) in vec2 a_uv1;
#else
layout(location = 2) in vec2 a_uv;
#endif
out vec2 v_depthUv;
#endif
#if A3D_DEPTH_ALPHA_VERTEX
layout(location = 4) in vec4 a_color;
out vec4 v_depthColor;
#endif
uniform mat4 u_modelViewProjection;
uniform mat4 u_geometryMatrix;
#if A3D_DEPTH_WORLD
uniform mat4 u_a3dClipModel;
#endif
#if A3D_DEPTH_CLIPPING
out vec3 v_a3dClipLocal;
out vec3 v_a3dClipWorld;
#endif
#if A3D_DEPTH_LOGARITHMIC
uniform mat4 u_a3dLogDepthView;
out float v_a3dViewDistance;
#endif
#if A3D_DEPTH_INSTANCED
uniform mat4 u_instanceMatrices[${PRD02_DEPTH_MAX_INSTANCES}];
uniform float u_instanceCount;
#if A3D_DEPTH_INSTANCE_ATTR
uniform float u_instanceAttributeMode;
#if A3D_DEPTH_EIGHT_INFLUENCES
layout(location = 10) in vec4 a_instanceMatrix0;
layout(location = 11) in vec4 a_instanceMatrix1;
layout(location = 12) in vec4 a_instanceMatrix2;
layout(location = 13) in vec4 a_instanceMatrix3;
#else
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
#endif
#endif
#endif
#if A3D_DEPTH_SKINNED
#include <skinning_common>
#endif
void main() {
#if A3D_DEPTH_ALPHA_MAP
#if A3D_DEPTH_ALPHA_UV1
  v_depthUv = a_uv1;
#else
  v_depthUv = a_uv;
#endif
#endif
#if A3D_DEPTH_ALPHA_VERTEX
  v_depthColor = a_color;
#endif
#if A3D_DEPTH_SKINNED
#if A3D_DEPTH_TYPED_JOINTS
  // Clamp in the integer domain before converting to the common float
  // palette interface, so large 32-bit attributes cannot lose valid indices.
#if A3D_DEPTH_JOINTS_UINT
  vec4 a3dDepthJoints = vec4(min(a_joints, uvec4(uint(max(u_jointCount - 1.0, 0.0)))));
#else
#if A3D_DEPTH_JOINTS_SINT
  vec4 a3dDepthJoints = vec4(clamp(a_joints, ivec4(0), ivec4(int(max(u_jointCount - 1.0, 0.0)))));
#else
  vec4 a3dDepthJoints = a_joints;
#endif
#endif
#if A3D_DEPTH_EIGHT_INFLUENCES
#if A3D_DEPTH_JOINTS1_UINT
  vec4 a3dDepthJoints1 = vec4(min(a_joints1, uvec4(uint(max(u_jointCount - 1.0, 0.0)))));
#else
#if A3D_DEPTH_JOINTS1_SINT
  vec4 a3dDepthJoints1 = vec4(clamp(a_joints1, ivec4(0), ivec4(int(max(u_jointCount - 1.0, 0.0)))));
#else
  vec4 a3dDepthJoints1 = a_joints1;
#endif
#endif
#endif
#endif
  float a3dWeightSum = dot(a_weights, vec4(1.0));
#if A3D_DEPTH_EIGHT_INFLUENCES
  a3dWeightSum += dot(a_weights1, vec4(1.0));
#if A3D_DEPTH_TYPED_JOINTS
  mat4 a3dSkin = a3dSkinMatrix8(a3dDepthJoints, a_weights, a3dDepthJoints1, a_weights1);
#else
  mat4 a3dSkin = a3dSkinMatrix8(a_joints, a_weights, a_joints1, a_weights1);
#endif
#else
#if A3D_DEPTH_TYPED_JOINTS
  mat4 a3dSkin = a3dSkinMatrix4(a3dDepthJoints, a_weights);
#else
  mat4 a3dSkin = a3dSkinMatrix4(a_joints, a_weights);
#endif
#endif
  vec4 local = a3dWeightSum > 0.0001 ? a3dSkin * vec4(a_position, 1.0) : vec4(a_position, 1.0);
#else
  vec4 local = vec4(a_position, 1.0);
#endif
  // Forward rendering resets the deformed position's w to one before the
  // geometry transform, then applies each instance in model space.
  vec4 a3dGeometryLocal = u_geometryMatrix * vec4(local.xyz, 1.0);
  vec4 a3dDepthPosition = a3dGeometryLocal;
#if A3D_DEPTH_INSTANCED
  int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
#if A3D_DEPTH_INSTANCE_ATTR
  mat4 instanceMatrix = u_instanceAttributeMode > 0.5
    ? mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3)
    : u_instanceMatrices[instanceIndex];
  a3dDepthPosition = instanceMatrix * a3dGeometryLocal;
#else
  a3dDepthPosition = u_instanceMatrices[instanceIndex] * a3dGeometryLocal;
#endif
#endif
#if A3D_DEPTH_WORLD
  vec4 a3dDepthWorld = u_a3dClipModel * a3dDepthPosition;
#endif
#if A3D_DEPTH_CLIPPING
  v_a3dClipLocal = a3dGeometryLocal.xyz;
  v_a3dClipWorld = a3dDepthWorld.xyz;
#endif
#if A3D_DEPTH_LOGARITHMIC
  v_a3dViewDistance = -(u_a3dLogDepthView * a3dDepthWorld).z;
#endif
  gl_Position = u_modelViewProjection * a3dDepthPosition;
}
`,
    fragment: `#version 300 es
// ${PRD02_DEPTH_SHADER_MARKER}
precision highp float;
#if A3D_DEPTH_ALPHA
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
#if A3D_DEPTH_ALPHA_MEMBER
uniform vec4 u_a3dPackedLoopColor;
#endif
#if A3D_DEPTH_ALPHA_VERTEX
in vec4 v_depthColor;
#endif
#if A3D_DEPTH_ALPHA_MAP
in vec2 v_depthUv;
uniform sampler2D u_baseColorTexture;
uniform vec2 u_baseColorTextureOffset;
uniform vec2 u_baseColorTextureScale;
uniform float u_baseColorTextureRotation;
#endif
#endif
#if A3D_DEPTH_CLIPPING
in vec3 v_a3dClipLocal;
in vec3 v_a3dClipWorld;
uniform vec4 u_a3dClipPlanes[8];
uniform vec4 u_a3dClipGroups[2];
uniform float u_a3dClipGroupCount;
#endif
#if A3D_DEPTH_LOGARITHMIC
in float v_a3dViewDistance;
uniform vec2 u_a3dLogDepthRange;
#endif
out vec4 outColor;
void main() {
#if A3D_DEPTH_ALPHA
  float a3dDepthAlpha = u_baseColor.a;
#if A3D_DEPTH_ALPHA_VERTEX
  a3dDepthAlpha *= v_depthColor.a;
#endif
#if A3D_DEPTH_ALPHA_MAP
  vec2 a3dScaledUv = v_depthUv * u_baseColorTextureScale;
  float a3dUvCos = cos(u_baseColorTextureRotation);
  float a3dUvSin = sin(u_baseColorTextureRotation);
  vec2 a3dDepthUv = vec2(a3dUvCos * a3dScaledUv.x - a3dUvSin * a3dScaledUv.y,
    a3dUvSin * a3dScaledUv.x + a3dUvCos * a3dScaledUv.y) + u_baseColorTextureOffset;
  a3dDepthAlpha *= texture(u_baseColorTexture, a3dDepthUv).a;
#endif
#if A3D_DEPTH_ALPHA_MEMBER
  a3dDepthAlpha *= u_a3dPackedLoopColor.a;
#endif
  if (a3dDepthAlpha < u_alphaCutoff) discard;
#endif
#if A3D_DEPTH_CLIPPING
  // Each group keeps all (intersection) or any (union) of its retained
  // half-spaces; the global and material groups themselves are ANDed.
  for (int groupIndex = 0; groupIndex < 2; groupIndex++) {
    if (float(groupIndex) >= u_a3dClipGroupCount) break;
    vec4 group = u_a3dClipGroups[groupIndex];
    vec3 point = group.w > 0.5 ? v_a3dClipLocal : v_a3dClipWorld;
    bool anyMode = group.z > 0.5;
    bool retained = !anyMode;
    for (int planeIndex = 0; planeIndex < 8; planeIndex++) {
      if (float(planeIndex) < group.x || float(planeIndex) >= group.x + group.y) continue;
      bool inside = dot(u_a3dClipPlanes[planeIndex], vec4(point, 1.0)) >= 0.0;
      retained = anyMode ? (retained || inside) : (retained && inside);
    }
    if (!retained) discard;
  }
#endif
#if A3D_DEPTH_LOGARITHMIC
  float a3dLogNear = log(u_a3dLogDepthRange.x);
  float a3dLogDepth = (log(max(v_a3dViewDistance, u_a3dLogDepthRange.x)) - a3dLogNear) /
    (log(u_a3dLogDepthRange.y) - a3dLogNear);
  gl_FragDepth = clamp(a3dLogDepth, 0.0, 1.0);
  outColor = vec4(vec3(gl_FragDepth), 1.0);
#else
  outColor = vec4(vec3(gl_FragCoord.z), 1.0);
#endif
}
`
  });
}

// ---------------------------------------------------------------------------
// C-11 feature registration + real resolver ("provide real for the stub")
// ---------------------------------------------------------------------------

let registeredDepthFeatures = false;
const prd02Features: DepthVariantFeature[] = [];

const PRD02_DEPTH_FEATURES: readonly DepthVariantFeature[] = [
  {
    id: "prd02.depthInstancing",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    order: 10,
    passes: ["depth"],
    select: (input) => (input.item.instanceTransforms || input.item.instanceAttributes ? 1 : undefined),
    defines: () => ({ A3D_DEPTH_INSTANCED: 1 }),
    chunks: [],
    hooks: []
  },
  {
    id: "prd02.depthInstanceAttr",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    order: 11,
    passes: ["depth"],
    select: (input) => (depthUsesInstanceAttributes(input.item) ? 1 : undefined),
    defines: () => ({ A3D_DEPTH_INSTANCE_ATTR: 1 }),
    chunks: [],
    hooks: []
  },
  {
    id: "prd02.depthAlpha",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    order: 20,
    passes: ["depth"],
    select: (input) => (casterAlphaCutoff(input.item) !== null ? 1 : undefined),
    defines: () => ({ A3D_DEPTH_ALPHA: 1 }),
    chunks: [],
    hooks: []
  },
  {
    id: "prd02.depthSkinning",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    order: 30,
    passes: ["depth"],
    select: (input) => {
      const skinning = input.item.skinning;
      return skinning ? (skinning.extraInfluences ? 8 : 4) : undefined;
    },
    defines: () => ({ A3D_DEPTH_SKINNED: 1 }),
    chunks: [],
    hooks: []
  }
];

/**
 * Registers `prd02.depthInstancing`, `prd02.depthAlpha`, `prd02.depthSkinning`.
 * Idempotent. The C-11 registry (`contracts/shadows.ts`) exposes no enumeration
 * accessor — only `registerDepthVariantFeature` — so lanes that register their
 * own depth features (e.g. prd06) must pass them into `ShadowSystem` until
 * lane-01 adds a registry reader (qr-request logged).
 */
export function ensurePrd02DepthFeatures(): void {
  if (registeredDepthFeatures) return;
  registeredDepthFeatures = true;
  for (const feature of PRD02_DEPTH_FEATURES) {
    registerDepthVariantFeature(feature);
    prd02Features.push(feature);
  }
}

/** The depth-variant features this lane registered (see note above). */
export function prd02DepthFeatures(): readonly DepthVariantFeature[] {
  ensurePrd02DepthFeatures();
  return prd02Features;
}

/**
 * 02-DEPTH: every C-11 depth-variant feature active under `flags` for the
 * shadow "depth" pass — prd02's own plus other lanes' (prd05.lodDither,
 * prd06.deform, prd10.wind, prd11.drawId) via lane 01's
 * `depthVariantFeaturesFor` (#751).
 */
export function activeDepthFeatures(flags: QrFlags): readonly DepthVariantFeature[] {
  ensurePrd02DepthFeatures();
  return depthVariantFeaturesFor(flags).filter((feature) => feature.passes.includes("depth"));
}

/** Features selected for this variant that claim the C-18 `vertex:deform` hook. */
function selectedDeformFeatures(
  key: ShadowCasterVariantKey,
  depthFeatures: readonly DepthVariantFeature[]
): DepthVariantFeature[] {
  return depthFeatures.filter((feature) => key.features[feature.id] !== undefined && feature.hooks.includes("vertex:deform"));
}

/** `requires`-first closure of a feature's chunks (each chunk once). */
function chunkClosure(names: readonly string[], out: ShaderChunk[], seen: Set<string>, stack: string[] = []): void {
  for (const name of names) {
    if (seen.has(name)) continue;
    if (stack.includes(name)) throw new Error(`SHADER_CHUNK_CYCLE:${[...stack, name].join(">")}`);
    const chunk = shaderChunk(name);
    if (!chunk) throw new Error(`SHADER_CHUNK_MISSING:${name}`);
    chunkClosure(chunk.requires ?? [], out, seen, [...stack, name]);
    seen.add(name);
    out.push(chunk);
  }
}

/** Why a deform feature cannot be spliced (C-18 needs `a3dDeform`), or null. */
export function depthDeformIncompatibility(feature: DepthVariantFeature): string | null {
  const chunks: ShaderChunk[] = [];
  try {
    chunkClosure(feature.chunks, chunks, new Set());
  } catch (error) {
    return `${feature.id}: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (chunks.some((chunk) => chunk.stage === "fragment")) return `${feature.id}: fragment-stage chunk at vertex:deform`;
  return chunks.some((chunk) => /\ba3dDeform\s*\(/.test(chunk.glsl)) ? null : `${feature.id}: no a3dDeform() entry point (C-18)`;
}

/**
 * 02-DEPTH: splice the selected `vertex:deform` features into the depth
 * vertex source — chunk closure at global scope before `main`, and the
 * canonical C-18 call `a3dDeform(pos, nrm, tan)` replacing the object-space
 * position. Features without an `a3dDeform` entry point are not spliced; the
 * caller reports them (C-31 droppedFeatures).
 */
function isStockPrd06DepthDeform(feature: DepthVariantFeature): boolean {
  return (
    feature.id === "prd06.deform" &&
    feature.owner === "prd06" &&
    feature.chunks.length === 2 &&
    feature.chunks[0] === "a3d_prd06_skinning_common" &&
    feature.chunks[1] === "a3d_prd06_deform"
  );
}

function prd06DepthSkinInfluences(key: ShadowCasterVariantKey): 0 | 4 | 8 {
  if (key.skinning !== 0 || key.features["prd06.deform"] === undefined) return 0;
  const depthSkinning = key.features["prd02.depthSkinning"];
  return depthSkinning === 8 ? 8 : depthSkinning === 4 ? 4 : 0;
}

export function composeDepthDeformVertex(
  vertex: string,
  key: ShadowCasterVariantKey,
  depthFeatures: readonly DepthVariantFeature[]
): string {
  const deform = selectedDeformFeatures(key, depthFeatures)
    .filter((feature) => depthDeformIncompatibility(feature) === null)
    .slice()
    .sort((a, b) => {
      // Ensure `prd06.deform` (`A3D_DEFORM_ENTRY` / `a3dDeformBeforeWind`) always
      // precedes `prd10.wind` (`#ifdef A3D_DEFORM_ENTRY`) so both compose sequentially.
      const rank = (f: DepthVariantFeature): number => (isStockPrd06DepthDeform(f) ? 0 : isStockPrd10WindDeform(f) ? 2 : 1);
      return rank(a) - rank(b);
    });
  if (deform.length === 0) return vertex;
  const chunks: ShaderChunk[] = [];
  const seen = new Set<string>();
  for (const feature of deform) chunkClosure(feature.chunks, chunks, seen);
  const decls = chunks.map((chunk) => chunk.glsl).join("\n");
  const call = [
    "  // C-18 deform (02-DEPTH): registered vertex:deform features own object space.",
    "  vec3 a3dDeformNormal = vec3(0.0, 0.0, 1.0);",
    "  vec4 a3dDeformTangent = vec4(0.0);",
    "  a3dDeform(local, a3dDeformNormal, a3dDeformTangent);"
  ].join("\n");
  const mainAt = vertex.indexOf("void main() {");
  if (mainAt < 0) throw new Error("PRD02_DEPTH_DEFORM_ANCHOR_MISSING:main");
  // Apply deformation before the geometry transform, instancing, clipping
  // and log-depth varyings. Keep the fallback anchors for external callers.
  const body = vertex.slice(mainAt);
  const anchor = /\n[ \t]*(?:vec4 a3dGeometryLocal\s*=|vec4 a3dDepthPosition\s*=|#if A3D_DEPTH_INSTANCED|int instanceIndex|gl_Position\s*=)/.exec(body);
  if (!anchor) throw new Error("PRD02_DEPTH_DEFORM_ANCHOR_MISSING:projection");
  const at = mainAt + anchor.index;
  return `${vertex.slice(0, mainAt)}${decls}\n${vertex.slice(mainAt, at)}\n${call}${vertex.slice(at)}`;
}

/** Base material of an item's RenderMaterial (instances unwrap). */
function baseOf(material: NonNullable<RenderItem["material"]>): Material {
  return material instanceof MaterialInstance ? material.baseMaterial : material;
}

/** Alpha-cutoff set on the caster material's parameter map, or null. */
export function casterAlphaCutoff(item: RenderItem): number | null {
  const material = item.material;
  if (!material) return null;
  const value = material.getParameter?.("u_alphaCutoff");
  if (typeof value === "number" && value > 0) return value;
  return null;
}

type DepthJointInput = "float" | "uint" | "sint";
const DEPTH_JOINT_INPUT = "prd02.depthJointInput";
const DEPTH_JOINT1_INPUT = "prd02.depthJoint1Input";

interface DepthAlphaOptions { readonly map: 0 | 1 | undefined; readonly vertex: boolean; readonly member: boolean }

function depthAlphaOptions(key: ShadowCasterVariantKey): DepthAlphaOptions {
  if (key.alphaHash) {
    throw new RenderDeviceError("Alpha-hashed depth requires a shared forward and shadow coverage contract", "DEPTH_ALPHA_HASH_UNSUPPORTED");
  }
  const map = key.features["prd02.depthAlphaMap"];
  const vertex = key.features["prd02.depthAlphaVertex"];
  const member = key.features["prd02.depthAlphaMember"];
  if ((map !== undefined && map !== 0 && map !== 1) ||
      (vertex !== undefined && typeof vertex !== "boolean") ||
      (member !== undefined && typeof member !== "boolean")) {
    throw new RenderDeviceError("Invalid depth alpha feature metadata", "DEPTH_ALPHA_FEATURE_INVALID", { map, vertex, member });
  }
  return key.alphaTest ? { map, vertex: vertex === true, member: member === true } : { map: undefined, vertex: false, member: false };
}

function jointInput(attribute: VertexAttribute | undefined): DepthJointInput {
  if (!attribute?.integer) return "float";
  return attribute.type.startsWith("uint") ? "uint" : "sint";
}

function jointInputForKey(key: ShadowCasterVariantKey, feature: string): DepthJointInput {
  const value = key.features[feature];
  if (value === undefined || value === "float") return "float";
  if (value === "uint" || value === "sint") return value;
  throw new RenderDeviceError("Native depth joint input type is invalid", "WGSL_DEPTH_VERTEX_FORMAT_INVALID", { feature, value });
}

function jointInputWgslType(input: DepthJointInput): string {
  return input === "uint" ? "u32" : input === "sint" ? "i32" : "f32";
}

function unsignedJointIndices(name: string, input: DepthJointInput): string {
  if (input === "uint") return name;
  if (input === "sint") return `vec4<u32>(max(${name}, vec4<i32>(0)))`;
  // Match the legacy floating input's clamping before conversion. Integer
  // inputs avoid an f32 round trip, preserving all representable indices.
  return `vec4<u32>(clamp(${name}, vec4<f32>(0.0), vec4<f32>(max(aura.u_jointCount - 1.0, 0.0))))`;
}

/** The feature map is also the program/precompile cache identity. */
function withDepthJointInputs(key: ShadowCasterVariantKey, format: VertexFormat): ShadowCasterVariantKey {
  const features = { ...key.features };
  delete features[DEPTH_JOINT_INPUT];
  delete features[DEPTH_JOINT1_INPUT];
  const skinInfluences = key.skinning || prd06DepthSkinInfluences(key);
  if (skinInfluences) {
    const first = jointInput(format.attributes.find((attribute) => attribute.semantic === "joints"));
    if (first !== "float") features[DEPTH_JOINT_INPUT] = first;
    if (skinInfluences === 8) {
      const second = jointInput(format.attributes.find((attribute) => attribute.semantic === "joints1"));
      if (second !== "float") features[DEPTH_JOINT1_INPUT] = second;
    }
  }
  return { ...key, features };
}

/**
 * Select input types from the geometry actually submitted to the depth draw.
 * Reject an incompatible backend interface before compiling or caching it.
 */
export function prd02DepthVariantForVertexFormat(
  key: ShadowCasterVariantKey,
  format: VertexFormat,
  backend: "webgpu" | "webgl2" = "webgpu"
): ShadowCasterVariantKey {
  const required: { semantic: VertexAttributeSemantic; location: number; components: number; integerAllowed: boolean }[] = [
    { semantic: "position", location: 0, components: 3, integerAllowed: false }
  ];
  const alpha = depthAlphaOptions(key);
  const skinInfluences = key.skinning || prd06DepthSkinInfluences(key);
  if (alpha.map !== undefined) required.push(alpha.map === 1
    ? { semantic: "uv1", location: 7, components: 2, integerAllowed: false }
    : { semantic: "uv", location: 2, components: 2, integerAllowed: false });
  if (alpha.vertex) required.push({ semantic: "color", location: 4, components: 4, integerAllowed: false });
  if (skinInfluences) {
    required.push(
      { semantic: "joints", location: 5, components: 4, integerAllowed: true },
      { semantic: "weights", location: 6, components: 4, integerAllowed: false }
    );
    if (skinInfluences === 8) required.push(
      { semantic: "joints1", location: 8, components: 4, integerAllowed: true },
      { semantic: "weights1", location: 9, components: 4, integerAllowed: false }
    );
  }
  for (const expected of required) {
    const attribute = format.attributes.find((candidate) => candidate.semantic === expected.semantic);
    // WebGPU cannot convert unnormalized integer buffers into float inputs;
    // normalized 8/16-bit formats do produce floating-point values.
    const nativeFormat = attribute && (backend === "webgl2" || attribute.type === "float32" || attribute.integer ||
      (attribute.normalized && attribute.type !== "int32" && attribute.type !== "uint32"));
    const componentFormat = attribute && (backend === "webgl2" || attribute.type === "float32" || attribute.type === "int32" || attribute.type === "uint32" ||
      attribute.components === 2 || attribute.components === 4);
    const bindingMatches = attribute && (backend === "webgpu"
      ? attribute.shaderLocation === expected.location
      : attribute.shaderName === `a_${expected.semantic}`);
    if (!attribute || !bindingMatches || attribute.components !== expected.components ||
        (!expected.integerAllowed && attribute.integer) || !nativeFormat || !componentFormat) {
      throw new RenderDeviceError(`${backend} depth input ${expected.semantic} must match its vertex format`, "DEPTH_VERTEX_FORMAT_INVALID", {
        backend, semantic: expected.semantic, location: expected.location, components: expected.components, attribute
      });
    }
  }
  if (backend === "webgpu") {
    const locations = new Set<number>();
    for (const attribute of format.attributes) {
      if (locations.has(attribute.shaderLocation)) {
        throw new RenderDeviceError("Native depth vertex locations must be unique", "DEPTH_VERTEX_FORMAT_INVALID", { location: attribute.shaderLocation });
      }
      locations.add(attribute.shaderLocation);
    }
    if (key.instanced && key.features["prd02.depthInstanceAttr"] !== undefined) {
      const start = skinInfluences === 8 ? 10 : 8;
      for (let location = start; location < start + 4; location += 1) {
        if (locations.has(location)) {
          throw new RenderDeviceError("Native depth instance attributes overlap the vertex format", "DEPTH_VERTEX_FORMAT_INVALID", { location });
        }
      }
    }
  } else {
    // WebGL resolves attribute names through reflection rather than using the
    // descriptor's shaderLocation. Two attributes must not bind one input.
    for (const expected of required) {
      const matches = format.attributes.filter((attribute) => attribute.shaderName === `a_${expected.semantic}`);
      if (matches.length !== 1) {
        throw new RenderDeviceError("WebGL depth attribute names must be unique", "DEPTH_VERTEX_FORMAT_INVALID", { semantic: expected.semantic });
      }
    }
  }
  return withDepthJointInputs(key, format);
}

/**
 * Real C-11 resolution (supersedes the PR-0a stub for the PRD-02 depth path):
 * fills every variant bit plus the `features` map from the registered
 * depth-variant features whose `select` returns a value for this item.
 */
export function resolvePrd02ShadowCasterVariant(
  item: RenderItem,
  flags: QrFlags,
  tier: AuraQualityTierSettings,
  depthFeatures: readonly DepthVariantFeature[] = []
): ShadowCasterVariantKey {
  const skinning = item.skinning;
  const features: Record<string, string | number | boolean> = {};
  for (const feature of depthFeatures) {
    const value = feature.select({ item, pass: "depth", tier, flags });
    if (value !== undefined) features[feature.id] = value;
  }
  const base = item.material ? baseOf(item.material) : null;
  const blended = base?.renderState.blend === true ||
    (base?.renderState.blendMode !== undefined && base.renderState.blendMode !== "opaque");
  // "batched" = produced by `batchStaticRenderItems` (SceneOptimization.ts):
  // it stamps a multi-instance `instanceTransforms` chunk under a
  // `static-batch-*` label. Authored instancing may share the field, so the
  // label prefix is the stronger marker; either marks the batch variant.
  const instanced = item.instanceTransforms !== undefined || item.instanceAttributes !== undefined;
  const batched =
    (item.instanceTransforms?.length ?? 0) > 16 ||
    /^static-batch-/.test(item.label ?? "");
  // A spliced vertex:deform feature (e.g. prd06.deform) owns skinning/morph
  // in object space, so the built-in prd02 skinning path stays off for it.
  // Additive wind (`prd10.wind`) composes AFTER skinning rather than owning it.
  const deformOwnsSkinning = depthFeatures.some(
    (feature) =>
      features[feature.id] !== undefined &&
      feature.hooks.includes("vertex:deform") &&
      !isStockPrd10WindDeform(feature) &&
      depthDeformIncompatibility(feature) === null
  );
  const key: ShadowCasterVariantKey = {
    skinning: skinning && !deformOwnsSkinning ? (skinning.extraInfluences ? 8 : 4) : 0,
    skinningTexture: (skinning?.jointCount ?? 0) > MAX_UNIFORM_SKINNING_JOINTS,
    morphTargets: (item.morphTargets?.length ?? 0) > 0 || (item.morphWeights?.length ?? 0) > 0,
    instanced,
    batched,
    alphaTest: casterAlphaCutoff(item) !== null,
    // BLEND + explicit castShadow requires the alpha-hash variant. Program
    // generation rejects it until forward and shadow coverage are aligned.
    alphaHash: blended && item.castShadow === true,
    doubleSided: item.geometry?.topology !== "triangles" || (base ? base.renderState.cullMode === "none" : false),
    features
  };
  // Record joint numeric types for shadow warm-up too. The draw validates
  // the final format, which may be a CPU-morphed scratch geometry.
  return (key.skinning || prd06DepthSkinInfluences(key)) ? withDepthJointInputs(key, item.geometry.vertexBuffer.format) : key;
}

/** §6.4 caster rule: BLEND and point-cloud items are excluded unless `castShadow === true`.
 * Explicit blended casters still require the currently unsupported alpha-hash
 * variant; `castShadow === false` always excludes. Everything else casts. */
export function prd02ShadowCasterEligible(item: RenderItem): boolean {
  if (item.castShadow === false) return false;
  if (item.geometry?.topology === "points" && item.castShadow !== true) return false;
  const base = item.material ? baseOf(item.material) : null;
  if ((base?.renderState.blend === true || (base?.renderState.blendMode !== undefined && base.renderState.blendMode !== "opaque")) && item.castShadow !== true) return false;
  return true;
}

/** GLSL defines a variant key compiles the depth body with. */
export function prd02DepthVariantDefines(
  key: ShadowCasterVariantKey,
  depthFeatures: readonly DepthVariantFeature[] = []
): Record<string, string | number | true> {
  // ShaderPreprocessor rejects #if on an undefined name — emit every switch.
  const clipping = key.features["a3d.clipping"] === true;
  const logarithmic = key.features["a3d.logarithmicDepth"] === true;
  const alpha = depthAlphaOptions(key);
  const prd06Skin = prd06DepthSkinInfluences(key);
  const skinInfluences = key.skinning || prd06Skin;
  const primaryJointInput = skinInfluences ? jointInputForKey(key, DEPTH_JOINT_INPUT) : "float";
  const secondaryJointInput = skinInfluences === 8 ? jointInputForKey(key, DEPTH_JOINT1_INPUT) : "float";
  const defines: Record<string, string | number | true> = {
    A3D_DEPTH_INSTANCED: 0,
    A3D_DEPTH_SKINNED: 0,
    A3D_DEPTH_EIGHT_INFLUENCES: 0,
    A3D_DEPTH_JOINTS_UINT: primaryJointInput === "uint" ? 1 : 0,
    A3D_DEPTH_JOINTS_SINT: primaryJointInput === "sint" ? 1 : 0,
    A3D_DEPTH_JOINTS1_UINT: secondaryJointInput === "uint" ? 1 : 0,
    A3D_DEPTH_JOINTS1_SINT: secondaryJointInput === "sint" ? 1 : 0,
    A3D_DEPTH_TYPED_JOINTS: primaryJointInput !== "float" || secondaryJointInput !== "float" ? 1 : 0,
    A3D_DEPTH_ALPHA: 0,
    A3D_DEPTH_ALPHA_MAP: alpha.map !== undefined ? 1 : 0,
    A3D_DEPTH_ALPHA_UV1: alpha.map === 1 ? 1 : 0,
    A3D_DEPTH_ALPHA_VERTEX: alpha.vertex ? 1 : 0,
    A3D_DEPTH_ALPHA_MEMBER: alpha.member ? 1 : 0,
    A3D_DEPTH_INSTANCE_ATTR: 0,
    A3D_DEPTH_CLIPPING: clipping ? 1 : 0,
    A3D_DEPTH_LOGARITHMIC: logarithmic ? 1 : 0,
    A3D_DEPTH_WORLD: clipping || logarithmic ? 1 : 0
  };
  if (key.instanced) defines.A3D_DEPTH_INSTANCED = 1;
  if (key.skinning > 0) defines.A3D_DEPTH_SKINNED = 1;
  if (key.skinning === 8) defines.A3D_DEPTH_EIGHT_INFLUENCES = 1;
  if (prd06Skin > 0) {
    defines.A3D_SKINNING = prd06Skin;
    if (primaryJointInput === "uint") defines.A3D_JOINT0_UINT = 1;
    else if (primaryJointInput === "sint") defines.A3D_JOINT0_SINT = 1;
    if (prd06Skin === 8) {
      if (secondaryJointInput === "uint") defines.A3D_JOINT1_UINT = 1;
      else if (secondaryJointInput === "sint") defines.A3D_JOINT1_SINT = 1;
    }
  }
  if (key.alphaTest) defines.A3D_DEPTH_ALPHA = 1;
  for (const feature of depthFeatures) {
    const value = key.features[feature.id];
    if (value !== undefined) Object.assign(defines, feature.defines(value));
  }
  return defines;
}

/** Native depth stages and fixed-size uniform layout for one caster variant. */
export function prd02DepthWgsl(
  key: ShadowCasterVariantKey,
  depthFeatures: readonly DepthVariantFeature[] = []
): { readonly webgpu: { readonly vertex: string; readonly fragment: string }; readonly portableBindings: readonly PortableShaderBinding[] } {
  // The generic C-18 GLSL hook can contain arbitrary declarations and code.
  // Stock `prd06.deform` (bone-texture skinning) and stock `prd10.wind`
  // compose sequentially (`deform` then `wind`); any unknown C-18 hook is rejected.
  const deform = selectedDeformFeatures(key, depthFeatures).filter((feature) => depthDeformIncompatibility(feature) === null);
  const wind = deform.some((feature) => isStockPrd10WindDeform(feature));
  const prd06 = deform.some((feature) => isStockPrd06DepthDeform(feature));
  const unsupportedDeform = deform.filter((feature) => !isStockPrd10WindDeform(feature) && !isStockPrd06DepthDeform(feature));
  if (unsupportedDeform.length > 0) {
    throw new RenderDeviceError("Native depth shader cannot lower the selected vertex deformation", "WGSL_DEPTH_DEFORM_UNSUPPORTED", { features: unsupportedDeform.map((feature) => feature.id) });
  }
  const prd06Skin = prd06 ? prd06DepthSkinInfluences(key) : 0;
  const effectiveSkin = key.skinning || prd06Skin;
  const clipping = key.features["a3d.clipping"] === true;
  const logarithmic = key.features["a3d.logarithmicDepth"] === true;
  const alpha = key.alphaTest;
  const alphaOptions = depthAlphaOptions(key);
  const attrInstancing = key.instanced && key.features["prd02.depthInstanceAttr"] !== undefined;
  const world = clipping || logarithmic;
  const primaryJointInput = effectiveSkin ? jointInputForKey(key, DEPTH_JOINT_INPUT) : "float";
  const secondaryJointInput = effectiveSkin === 8 ? jointInputForKey(key, DEPTH_JOINT1_INPUT) : "float";
  const bindings: PortableShaderBinding[] = [
    { name: "u_modelViewProjection", kind: "mat4" },
    { name: "u_geometryMatrix", kind: "mat4" },
    { name: "u_a3dClipRange", kind: "float" }
  ];
  if (world) bindings.push({ name: "u_a3dClipModel", kind: "mat4" });
  if (clipping) bindings.push(
    { name: "u_a3dClipPlanes", kind: "vec4", arrayLength: 8 },
    { name: "u_a3dClipGroups", kind: "vec4", arrayLength: 2 },
    { name: "u_a3dClipGroupCount", kind: "float" }
  );
  if (logarithmic) bindings.push({ name: "u_a3dLogDepthView", kind: "mat4" }, { name: "u_a3dLogDepthRange", kind: "vec2" });
  if (key.instanced) {
    bindings.push({ name: "u_instanceMatrices", kind: "mat4", arrayLength: PRD02_DEPTH_MAX_INSTANCES }, { name: "u_instanceCount", kind: "float" });
    if (attrInstancing) bindings.push({ name: "u_instanceAttributeMode", kind: "float" });
  }
  if (key.skinning) {
    bindings.push({ name: "u_jointCount", kind: "float" });
    if (key.skinningTexture) bindings.push(
      { name: "u_jointPaletteTextureSize", kind: "vec2" },
      { name: "u_jointPaletteTexture", kind: "texture2d" }
    );
    else bindings.push({ name: "u_jointMatrices", kind: "mat4", arrayLength: MAX_UNIFORM_SKINNING_JOINTS });
  } else if (prd06Skin) {
    bindings.push(
      { name: "u_boneTextureWidth", kind: "float" },
      { name: "u_boneTexture", kind: "texture2d" }
    );
  }
  if (wind) bindings.push(...NATIVE_DEPTH_WIND_BINDINGS);
  if (alpha) {
    bindings.push({ name: "u_baseColor", kind: "vec4" }, { name: "u_alphaCutoff", kind: "float" });
    if (alphaOptions.member) bindings.push({ name: "u_a3dPackedLoopColor", kind: "vec4" });
    if (alphaOptions.map !== undefined) bindings.push(
      { name: "u_baseColorTexture", kind: "texture2d", required: false },
      { name: "u_baseColorTextureOffset", kind: "vec2" },
      { name: "u_baseColorTextureScale", kind: "vec2" },
      { name: "u_baseColorTextureRotation", kind: "float" }
    );
  }

  const instanceLocation = effectiveSkin === 8 ? 10 : 8;
  const skinDeclarations = key.skinning ? `
fn a3dJointMatrix(rawIndex: u32) -> mat4x4<f32> {
  let joint = min(rawIndex, u32(max(aura.u_jointCount - 1.0, 0.0)));
  ${key.skinningTexture ? `let width = max(u32(aura.u_jointPaletteTextureSize.x), 4u);
  let base = joint * 4u;
  let row = base / width;
  let column = base - row * width;
  return mat4x4<f32>(
    textureLoad(u_jointPaletteTextureTexture, vec2<i32>(i32(column), i32(row)), 0),
    textureLoad(u_jointPaletteTextureTexture, vec2<i32>(i32(column + 1u), i32(row)), 0),
    textureLoad(u_jointPaletteTextureTexture, vec2<i32>(i32(column + 2u), i32(row)), 0),
    textureLoad(u_jointPaletteTextureTexture, vec2<i32>(i32(column + 3u), i32(row)), 0));`
    : `return aura.u_jointMatrices[min(joint, ${MAX_UNIFORM_SKINNING_JOINTS - 1}u)];`}
}
fn a3dSkin4(j: vec4<u32>, w: vec4<f32>) -> mat4x4<f32> {
  return a3dJointMatrix(j.x) * w.x + a3dJointMatrix(j.y) * w.y + a3dJointMatrix(j.z) * w.z + a3dJointMatrix(j.w) * w.w;
}` : prd06Skin ? `
fn a3dJointMatrix(rawIndex: u32) -> mat4x4<f32> {
  let width = max(u32(aura.u_boneTextureWidth + 0.5), 4u);
  let base = rawIndex * 4u;
  let row = base / width;
  let column = base - row * width;
  return mat4x4<f32>(
    textureLoad(u_boneTextureTexture, vec2<i32>(i32(column), i32(row)), 0),
    textureLoad(u_boneTextureTexture, vec2<i32>(i32(column + 1u), i32(row)), 0),
    textureLoad(u_boneTextureTexture, vec2<i32>(i32(column + 2u), i32(row)), 0),
    textureLoad(u_boneTextureTexture, vec2<i32>(i32(column + 3u), i32(row)), 0));
}
fn a3dSkin4(j: vec4<u32>, w: vec4<f32>) -> mat4x4<f32> {
  return a3dJointMatrix(j.x) * w.x + a3dJointMatrix(j.y) * w.y + a3dJointMatrix(j.z) * w.z + a3dJointMatrix(j.w) * w.w;
}` : "";
  const unsignedJointExpr = (name: string, input: DepthJointInput): string =>
    prd06Skin && input === "float" ? `vec4<u32>(max(${name} + vec4<f32>(0.5), vec4<f32>(0.0)))` : unsignedJointIndices(name, input);
  const vertex = `// ${PRD02_DEPTH_SHADER_MARKER}
/* @aura3d-bindings */
struct DepthOutput {
  @builtin(position) position: vec4<f32>,
  ${alphaOptions.map !== undefined ? "@location(0) uv: vec2<f32>," : ""}
  ${clipping ? "@location(1) localPosition: vec3<f32>,\n  @location(2) worldPosition: vec3<f32>," : ""}
  ${logarithmic ? "@location(3) viewDistance: f32," : ""}
  ${alphaOptions.vertex ? "@location(4) color: vec4<f32>," : ""}
};
${skinDeclarations}
${wind ? NATIVE_DEPTH_WIND_WGSL : ""}
@vertex fn vs_main(
  @location(0) position: vec3<f32>${alphaOptions.map !== undefined ? `, @location(${alphaOptions.map === 1 ? 7 : 2}) uv: vec2<f32>` : ""}${alphaOptions.vertex ? ", @location(4) color: vec4<f32>" : ""}${effectiveSkin ? `, @location(5) joints: vec4<${jointInputWgslType(primaryJointInput)}>, @location(6) weights: vec4<f32>` : ""}${effectiveSkin === 8 ? `, @location(8) joints1: vec4<${jointInputWgslType(secondaryJointInput)}>, @location(9) weights1: vec4<f32>` : ""}${key.instanced ? ", @builtin(instance_index) instanceIndex: u32" : ""}${attrInstancing ? `, @location(${instanceLocation}) instance0: vec4<f32>, @location(${instanceLocation + 1}) instance1: vec4<f32>, @location(${instanceLocation + 2}) instance2: vec4<f32>, @location(${instanceLocation + 3}) instance3: vec4<f32>` : ""}
) -> DepthOutput {
  var output: DepthOutput;
  var local = vec4<f32>(position, 1.0);
  ${effectiveSkin ? `var weightSum = dot(weights, vec4<f32>(1.0));
  var skin = a3dSkin4(${unsignedJointExpr("joints", primaryJointInput)}, weights);
  ${effectiveSkin === 8 ? `weightSum += dot(weights1, vec4<f32>(1.0));\n  skin += a3dSkin4(${unsignedJointExpr("joints1", secondaryJointInput)}, weights1);` : ""}
  if (weightSum > 0.0001) { local = vec4<f32>((skin * local).xyz, 1.0); }` : ""}
  ${wind ? "local = vec4<f32>(local.xyz + a3dDepthWindOffset(local.xyz, max(aura.u_windAssetHeight, 0.01)), local.w);" : ""}
  let geometryLocal = aura.u_geometryMatrix * vec4<f32>(local.xyz, 1.0);
  var placed = geometryLocal;
  ${key.instanced ? `let safeIndex = min(instanceIndex, u32(max(aura.u_instanceCount - 1.0, 0.0)));
  var instance = aura.u_instanceMatrices[min(safeIndex, ${PRD02_DEPTH_MAX_INSTANCES - 1}u)];
  ${attrInstancing ? "if (aura.u_instanceAttributeMode > 0.5) { instance = mat4x4<f32>(instance0, instance1, instance2, instance3); }" : ""}
  placed = instance * geometryLocal;` : ""}
  ${world ? "let worldPosition = aura.u_a3dClipModel * placed;" : ""}
  ${clipping ? "output.localPosition = geometryLocal.xyz;\n  output.worldPosition = worldPosition.xyz;" : ""}
  ${logarithmic ? "output.viewDistance = -(aura.u_a3dLogDepthView * worldPosition).z;" : ""}
  ${alphaOptions.map !== undefined ? "output.uv = uv;" : ""}
  ${alphaOptions.vertex ? "output.color = color;" : ""}
  let clip = aura.u_modelViewProjection * placed;
  // WebGPU clip depth is [0,1]. Legacy GL matrices need conversion; a native
  // zero-to-one projection supplies u_a3dClipRange=1 and must not be remapped.
  output.position = vec4<f32>(clip.xy, select((clip.z + clip.w) * 0.5, clip.z, aura.u_a3dClipRange > 0.5), clip.w);
  return output;
}`;
  const fragment = `// ${PRD02_DEPTH_SHADER_MARKER}
/* @aura3d-bindings */
struct DepthInput {
  @builtin(position) position: vec4<f32>,
  ${alphaOptions.map !== undefined ? "@location(0) uv: vec2<f32>," : ""}
  ${clipping ? "@location(1) localPosition: vec3<f32>,\n  @location(2) worldPosition: vec3<f32>," : ""}
  ${logarithmic ? "@location(3) viewDistance: f32," : ""}
  ${alphaOptions.vertex ? "@location(4) color: vec4<f32>," : ""}
};
${logarithmic ? "struct FragmentOutput { @location(0) color: vec4<f32>, @builtin(frag_depth) depth: f32, };" : ""}
@fragment fn fs_main(input: DepthInput) -> ${logarithmic ? "FragmentOutput" : "@location(0) vec4<f32>"} {
  ${alpha ? `var depthAlpha = aura.u_baseColor.a;
  ${alphaOptions.vertex ? "depthAlpha *= input.color.a;" : ""}
  ${alphaOptions.map !== undefined ? `let scaledUv = input.uv * aura.u_baseColorTextureScale;
  let uvCos = cos(aura.u_baseColorTextureRotation);
  let uvSin = sin(aura.u_baseColorTextureRotation);
  let depthUv = vec2<f32>(uvCos * scaledUv.x - uvSin * scaledUv.y, uvSin * scaledUv.x + uvCos * scaledUv.y) + aura.u_baseColorTextureOffset;
  depthAlpha *= textureSample(u_baseColorTextureTexture, u_baseColorTextureSampler, depthUv).a;` : ""}
  ${alphaOptions.member ? "depthAlpha *= aura.u_a3dPackedLoopColor.a;" : ""}
  if (depthAlpha < aura.u_alphaCutoff) { discard; }` : ""}
  ${clipping ? `for (var g = 0u; g < 2u; g++) {
    if (f32(g) >= aura.u_a3dClipGroupCount) { break; }
    let group = aura.u_a3dClipGroups[g];
    let point = select(input.worldPosition, input.localPosition, group.w > 0.5);
    let anyMode = group.z > 0.5;
    var retained = !anyMode;
    for (var p = 0u; p < 8u; p++) {
      if (f32(p) < group.x || f32(p) >= group.x + group.y) { continue; }
      let inside = dot(aura.u_a3dClipPlanes[p], vec4<f32>(point, 1.0)) >= 0.0;
      if (anyMode) { retained = retained || inside; } else { retained = retained && inside; }
    }
    if (!retained) { discard; }
  }` : ""}
  ${logarithmic ? `let logNear = log(aura.u_a3dLogDepthRange.x);
  let depth = clamp((log(max(input.viewDistance, aura.u_a3dLogDepthRange.x)) - logNear) /
    (log(aura.u_a3dLogDepthRange.y) - logNear), 0.0, 1.0);
  return FragmentOutput(vec4<f32>(depth, depth, depth, 1.0), depth);`
    : "return vec4<f32>(input.position.z, input.position.z, input.position.z, 1.0);"}
}`;
  return { webgpu: { vertex, fragment }, portableBindings: bindings };
}

const NATIVE_DEPTH_WIND_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_windDirStrength", kind: "vec4" },
  { name: "u_windGust", kind: "vec4" },
  { name: "u_windAssetHeight", kind: "float" },
  { name: "u_windNoise", kind: "texture2d" }
];

/**
 * WGSL twin of `a3dDeform` from `a3d_prd10_wind_deform` as the WebGL2 depth body compiles it: the depth defines never
 * set USE_INSTANCING or VERTEX_COLORS, so the instance origin is zero and the weights are the trunk-bend default
 * (1, 1, 0.5, 1).
 */
const NATIVE_DEPTH_WIND_WGSL = `${prd10WindOffsetWgsl("a3dWindOffsetNative", "aura.u_windDirStrength", "aura.u_windGust", "u_windNoiseTexture", "u_windNoiseSampler")}
fn a3dDepthWindOffset(localPos: vec3<f32>, assetHeight: f32) -> vec3<f32> {
  return a3dWindOffsetNative(localPos, vec3<f32>(0.0), vec4<f32>(1.0, 1.0, 0.5, 1.0), assetHeight);
}`;

// ---------------------------------------------------------------------------
// Program cache + precompile (C-28)
// ---------------------------------------------------------------------------

/**
 * Variant programs keyed by variant id, per device — DepthPass instances are
 * constructed per pass, so the cache lives on the device (WeakMap) and dies
 * with it, mirroring the per-library WeakMap above.
 */
interface DepthProgramCache { revision: number; generation: number; programs: Map<string, RenderShaderProgram> }
const depthPrograms = new WeakMap<RenderDevice, WeakMap<ShaderLibrary, DepthProgramCache>>();

/** Programs belong to both a device and a library, including its revision. */
function programCache(device: RenderDevice, library: ShaderLibrary): DepthProgramCache {
  let libraries = depthPrograms.get(device);
  if (!libraries) { libraries = new WeakMap(); depthPrograms.set(device, libraries); }
  const revision = library.getRevision();
  const generation = device.generation ?? 0;
  let cache = libraries.get(library);
  if (!cache) {
    cache = { revision, generation, programs: new Map() };
    libraries.set(library, cache);
  } else if (cache.revision !== revision || cache.generation !== generation) {
    for (const old of cache.programs.values()) old.dispose();
    cache = { revision, generation, programs: new Map() };
    libraries.set(library, cache);
  }
  return cache;
}

function programKey(key: ShadowCasterVariantKey, features: readonly DepthVariantFeature[]): string {
  const extra = features.map((feature) => feature.id).sort().join(",");
  return `${shadowCasterVariantId(key)}:${extra}`;
}

/** Compile (or fetch) the composed depth program for a caster variant. */
export function prd02DepthProgram(
  device: RenderDevice,
  library: ShaderLibrary,
  key: ShadowCasterVariantKey,
  features: readonly DepthVariantFeature[] = []
): RenderShaderProgram {
  const cache = programCache(device, library);
  const id = programKey(key, features);
  let program = cache.programs.get(id);
  if (!program || program.disposed) {
    const source = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines: prd02DepthVariantDefines(key, features) });
    const native = device.kind === "webgpu" ? prd02DepthWgsl(key, features) : undefined;
    program = device.createShaderProgram({
      label: source.label,
      marker: source.marker,
      vertex: composeDepthDeformVertex(source.vertex, key, features),
      fragment: source.fragment,
      ...(native ?? (source.webgpu ? { webgpu: source.webgpu } : {})),
      ...(native ? {} : source.portableBindings ? { portableBindings: source.portableBindings } : {})
    });
    cache.programs.set(id, program);
  }
  return program;
}

/**
 * C-28 warm-up: compile every distinct variant once (async via
 * `device.compileAsync` when the backend supports it) so steady-state frames
 * show `programCompileCount` delta 0.
 */
export async function precompilePrd02DepthVariants(
  device: RenderDevice,
  library: ShaderLibrary,
  variants: ReadonlyMap<string, { key: ShadowCasterVariantKey; features: readonly DepthVariantFeature[] }>
): Promise<void> {
  const pending: Promise<void>[] = [];
  const scheduled = new Set<string>();
  const cache = programCache(device, library);
  for (const variant of variants.values()) {
    const cacheKey = programKey(variant.key, variant.features);
    if (scheduled.has(cacheKey)) continue;
    const existing = cache.programs.get(cacheKey);
    if (existing && !existing.disposed) continue;
    scheduled.add(cacheKey);
    const source = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines: prd02DepthVariantDefines(variant.key, variant.features) });
    const native = device.kind === "webgpu" ? prd02DepthWgsl(variant.key, variant.features) : undefined;
    const sources = {
      label: source.label,
      marker: source.marker,
      vertex: composeDepthDeformVertex(source.vertex, variant.key, variant.features),
      fragment: source.fragment,
      ...(native ?? (source.webgpu ? { webgpu: source.webgpu } : {})),
      ...(native ? {} : source.portableBindings ? { portableBindings: source.portableBindings } : {})
    };
    if (device.compileAsync) {
      pending.push(device.compileAsync(sources).then((program) => {
        if (device.disposed || device.contextLost || programCache(device, library) !== cache) program.dispose();
        else {
          const current = cache.programs.get(cacheKey);
          if (current && !current.disposed) program.dispose();
          else cache.programs.set(cacheKey, program);
        }
      }));
    } else {
      cache.programs.set(cacheKey, device.createShaderProgram(sources));
    }
  }
  await Promise.all(pending);
}
