/**
 * PRD-02 Phase 4 — C-11 shadow-caster depth variants.
 *
 * One depth shader body compiled per variant id (`shadowCasterVariantId`):
 * instanced draws pull `u_instanceMatrices` via `gl_InstanceID` (64/draw, the
 * same uniform-array convention the lit shaders use when instance attributes
 * are absent), skinned draws reuse the `skinning_common` chunk (uniform or
 * data-texture palette through `u_jointPaletteMode`), alpha-tested casters
 * sample `u_baseColorTexture` and discard below `u_alphaCutoff`. Extra
 * `DepthVariantFeature`s registered for pass "depth" splice their own defines.
 *
 * Flag: A3D_QR_LIGHTING.
 */

import type { QrFlags } from "../contracts/core";
import type { AuraQualityTierSettings } from "../contracts/quality";
import type { RenderItem } from "../contracts/renderItem";
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
import type { RenderDevice, RenderShaderProgram } from "../RenderDevice";
import { shadowCasterVariantId } from "../contracts/shadows";
import { DENSE_DEPTH_INSTANCE_MIN, denseDepthDrawsEnabled, shadowFitLegacy } from "./shadowLegacy";

export const PRD02_DEPTH_SHADER_NAME = "aura3d/prd02-depth";
export const PRD02_DEPTH_SHADER_MARKER = "@aura3d-shader:prd02-depth";
/** Uniform-path instancing cap; larger batches split into multiple draws. */
export const PRD02_DEPTH_MAX_INSTANCES = 64;

/**
 * Instances beyond the uniform array ride a per-instance vertex-attribute buffer (one draw instead of ceil(n / 64) per cascade).
 * The 4.3.0 shadow behaviour (`__A3D_SHADOW_FIT__ = "current"`) uses it for every node above 64 instances. In the default (legacy)
 * fit only dense nodes (`DENSE_DEPTH_INSTANCE_MIN` and up) use it; smaller nodes draw uniform-array batches exactly as 4.2.0 did.
 */
export function depthUsesInstanceAttributes(item: { readonly instanceTransforms?: ArrayLike<number> | undefined }): boolean {
  const count = (item.instanceTransforms?.length ?? 0) / 16;
  if (count <= PRD02_DEPTH_MAX_INSTANCES) return false;
  if (!shadowFitLegacy()) return true;
  return count >= DENSE_DEPTH_INSTANCE_MIN && denseDepthDrawsEnabled();
}

export function registerPrd02DepthShader(library: ShaderLibrary): void {
  library.register({
    name: PRD02_DEPTH_SHADER_NAME,
    marker: PRD02_DEPTH_SHADER_MARKER,
    vertex: `#version 300 es
// ${PRD02_DEPTH_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
#if A3D_DEPTH_SKINNED
layout(location = 5) in vec4 a_joints;
layout(location = 6) in vec4 a_weights;
#endif
#if A3D_DEPTH_ALPHA
layout(location = 2) in vec2 a_uv;
out vec2 v_depthUv;
#endif
uniform mat4 u_modelViewProjection;
#if A3D_DEPTH_INSTANCED
uniform mat4 u_instanceMatrices[${PRD02_DEPTH_MAX_INSTANCES}];
uniform float u_instanceCount;
#if A3D_DEPTH_INSTANCE_ATTR
uniform float u_instanceAttributeMode;
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
#endif
#endif
#if A3D_DEPTH_SKINNED
#include <skinning_common>
#endif
void main() {
#if A3D_DEPTH_ALPHA
  v_depthUv = a_uv;
#endif
#if A3D_DEPTH_SKINNED
  vec4 local = a3dSkinMatrix4(a_joints, a_weights) * vec4(a_position, 1.0);
#else
  vec4 local = vec4(a_position, 1.0);
#endif
#if A3D_DEPTH_INSTANCED
  int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
#if A3D_DEPTH_INSTANCE_ATTR
  mat4 instanceMatrix = u_instanceAttributeMode > 0.5
    ? mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3)
    : u_instanceMatrices[instanceIndex];
  gl_Position = u_modelViewProjection * (instanceMatrix * local);
#else
  gl_Position = u_modelViewProjection * (u_instanceMatrices[instanceIndex] * local);
#endif
#else
  gl_Position = u_modelViewProjection * local;
#endif
}
`,
    fragment: `#version 300 es
// ${PRD02_DEPTH_SHADER_MARKER}
precision highp float;
#if A3D_DEPTH_ALPHA
in vec2 v_depthUv;
uniform sampler2D u_baseColorTexture;
uniform float u_alphaCutoff;
#endif
out vec4 outColor;
void main() {
#if A3D_DEPTH_ALPHA
  if (texture(u_baseColorTexture, v_depthUv).a < u_alphaCutoff) discard;
#endif
  outColor = vec4(vec3(gl_FragCoord.z), 1.0);
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
export function composeDepthDeformVertex(
  vertex: string,
  key: ShadowCasterVariantKey,
  depthFeatures: readonly DepthVariantFeature[]
): string {
  const deform = selectedDeformFeatures(key, depthFeatures).filter((feature) => depthDeformIncompatibility(feature) === null);
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
  // The call goes after `local` is formed and before it is projected (the
  // first instancing or gl_Position statement; #if blocks may already be
  // resolved by the preprocessor).
  const body = vertex.slice(mainAt);
  const anchor = /\n[ \t]*(?:#if A3D_DEPTH_INSTANCED|int instanceIndex|gl_Position\s*=)/.exec(body);
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
  const blended = base?.renderState.blend === true;
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
  const deformOwnsSkinning = depthFeatures.some(
    (feature) => features[feature.id] !== undefined && feature.hooks.includes("vertex:deform") && depthDeformIncompatibility(feature) === null
  );
  return {
    skinning: skinning && !deformOwnsSkinning ? (skinning.extraInfluences ? 8 : 4) : 0,
    skinningTexture: (skinning?.jointCount ?? 0) > MAX_UNIFORM_SKINNING_JOINTS,
    morphTargets: (item.morphTargets?.length ?? 0) > 0 || (item.morphWeights?.length ?? 0) > 0,
    instanced,
    batched,
    alphaTest: casterAlphaCutoff(item) !== null,
    // BLEND + explicit castShadow: alpha-hashed depth (no cutoff); BLEND
    // without castShadow is excluded upstream (prd02ShadowCasterEligible).
    alphaHash: blended && item.castShadow === true,
    doubleSided: base ? base.renderState.cullMode === "none" : false,
    features
  };
}

/** §6.4 caster rule: BLEND items are excluded unless `castShadow === true`
 *  (then they take the alpha-hash variant); `castShadow === false` always
 *  excludes. Everything else casts. */
export function prd02ShadowCasterEligible(item: RenderItem): boolean {
  if (item.castShadow === false) return false;
  const base = item.material ? baseOf(item.material) : null;
  if (base?.renderState.blend === true && item.castShadow !== true) return false;
  return true;
}

/** GLSL defines a variant key compiles the depth body with. */
export function prd02DepthVariantDefines(
  key: ShadowCasterVariantKey,
  depthFeatures: readonly DepthVariantFeature[] = []
): Record<string, string | number | true> {
  // ShaderPreprocessor rejects #if on an undefined name — emit all three.
  const defines: Record<string, string | number | true> = {
    A3D_DEPTH_INSTANCED: 0,
    A3D_DEPTH_SKINNED: 0,
    A3D_DEPTH_ALPHA: 0,
    A3D_DEPTH_INSTANCE_ATTR: 0
  };
  if (key.instanced) defines.A3D_DEPTH_INSTANCED = 1;
  if (key.skinning > 0) defines.A3D_DEPTH_SKINNED = 1;
  if (key.alphaTest || key.alphaHash) defines.A3D_DEPTH_ALPHA = 1;
  for (const feature of depthFeatures) {
    const value = key.features[feature.id];
    if (value !== undefined) Object.assign(defines, feature.defines(value));
  }
  return defines;
}

// ---------------------------------------------------------------------------
// Program cache + precompile (C-28)
// ---------------------------------------------------------------------------

/**
 * Variant programs keyed by variant id, per device — DepthPass instances are
 * constructed per pass, so the cache lives on the device (WeakMap) and dies
 * with it, mirroring the per-library WeakMap above.
 */
const depthPrograms = new WeakMap<RenderDevice, Map<string, RenderShaderProgram>>();

function programKey(library: ShaderLibrary, key: ShadowCasterVariantKey, features: readonly DepthVariantFeature[]): string {
  const extra = features.map((feature) => feature.id).sort().join(",");
  return `${library.getRevision()}:${shadowCasterVariantId(key)}:${extra}`;
}

/** Compile (or fetch) the composed depth program for a caster variant. */
export function prd02DepthProgram(
  device: RenderDevice,
  library: ShaderLibrary,
  key: ShadowCasterVariantKey,
  features: readonly DepthVariantFeature[] = []
): RenderShaderProgram {
  let perDevice = depthPrograms.get(device);
  if (!perDevice) {
    perDevice = new Map();
    depthPrograms.set(device, perDevice);
  }
  const id = programKey(library, key, features);
  let program = perDevice.get(id);
  if (!program || program.disposed) {
    const source = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines: prd02DepthVariantDefines(key, features) });
    program = device.createShaderProgram({
      label: source.label,
      marker: source.marker,
      vertex: composeDepthDeformVertex(source.vertex, key, features),
      fragment: source.fragment,
      ...(source.webgpu ? { webgpu: source.webgpu } : {}),
      ...(source.portableBindings ? { portableBindings: source.portableBindings } : {})
    });
    perDevice.set(id, program);
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
  let perDevice = depthPrograms.get(device);
  if (!perDevice) {
    perDevice = new Map();
    depthPrograms.set(device, perDevice);
  }
  for (const [id, variant] of variants) {
    const cacheKey = `${library.getRevision()}:${id}:${variant.features.map((feature) => feature.id).sort().join(",")}`;
    const existing = perDevice.get(cacheKey);
    if (existing && !existing.disposed) continue;
    const source = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines: prd02DepthVariantDefines(variant.key, variant.features) });
    const sources = {
      label: source.label,
      marker: source.marker,
      vertex: composeDepthDeformVertex(source.vertex, variant.key, variant.features),
      fragment: source.fragment,
      ...(source.webgpu ? { webgpu: source.webgpu } : {}),
      ...(source.portableBindings ? { portableBindings: source.portableBindings } : {})
    };
    if (device.compileAsync) {
      pending.push(device.compileAsync(sources).then((program) => {
        perDevice!.set(cacheKey, program);
      }));
    } else {
      perDevice.set(cacheKey, device.createShaderProgram(sources));
    }
  }
  await Promise.all(pending);
}
